import { useMemo, useState } from 'react';
import { Dumbbell, FileSpreadsheet, Layers, Salad } from 'lucide-react';

import { dietSummary, foodNames } from '@/domain/dietSheet';
import { matchFoodNames, pendingMatches } from '@/domain/foodMatch';
import {
  Field,
  Fold,
  Loading,
  Notice,
  SegmentedControl,
  Switch,
} from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';

import { ACCEPT, useSheetSource } from './useSheetSource';
import { RoutinePreview, aBorrador, aplicarCambio, contarSeries, toEditableDays } from './RoutinePreview';
import {
  DietPreview,
  FoodMatchList,
  aPlanDeDieta,
  alimentosNuevos,
  contarDieta,
  resolverCon,
  resumenDeCabecera,
  toEditableDiet,
} from './DietPreview';

/**
 * Traer el plan de fuera: se pega o se sube, y se mira antes de crear nada.
 *
 * ══ Por qué UN diálogo para el entreno y la dieta ══════════════════════════
 *
 * Porque es UN fichero. El libro que trae quien se muda tiene la rutina en unas
 * pestañas y la dieta en otras, y con dos importadores había que abrirlo dos
 * veces, saber de antemano qué había en cada pestaña y acordarse de volver.
 * Aquí el fichero se abre una vez, cada hoja se lee de las dos maneras
 * (`useSheetSource`) y se enseña lo que haya salido: a veces la rutina, a veces
 * la dieta, a veces las dos.
 *
 * `foco` solo decide cuál se enseña primero y qué dice el vacío. No limita lo
 * que se puede traer: quien abre esto desde la pantalla de nutrición con un
 * libro que además trae la rutina puede traérsela, y lo contrario también.
 *
 * ══ Pegar y subir no son lo mismo, y las dos hacen falta ═══════════════════
 *
 * **Pegar** gana cuando la hoja ya está abierta: es un gesto, y Excel entrega
 * el texto tal y como se ve.
 *
 * **Subir** gana en todo lo demás, y por un motivo que solo se ve al abrir un
 * libro de verdad: un `.xlsx` de entrenamiento tiene quince pestañas y pegando
 * se llega a una cada vez, sabiendo de antemano cuál. Subiéndolo se ven todas
 * con lo que hay dentro de cada una. Y en PDF —que es como media profesión
 * manda la dieta— pegar exige saber que se puede.
 *
 * ══ Lo que no entra ════════════════════════════════════════════════════════
 *
 * De la rutina, los kilos y las repeticiones registradas: traerlos fabricaría
 * entrenamientos que aquí no ocurrieron (ver `domain/routineSheet.js`).
 * De la dieta, nada se inventa: un alimento que no se reconoce se pregunta.
 */

const EJEMPLO_RUTINA = `Copia las filas en tu Excel (o en Sheets, Numbers o una tabla de Word) y pégalas aquí.
Puedes seleccionar la hoja entera: lo que no sea el plan se descarta.

También vale escrito a mano:
  Día 1 · Push
  Press banca 4x8-10 RIR2`;

const EJEMPLO_DIETA = `Copia aquí tu dieta: la hoja entera, o el texto del PDF.

  COMIDA 1
  OPCIÓN 1
  - 100g Avena
  - 1 Plátano`;

/** Qué trae una hoja, dicho en una línea. */
export const resumenDeHoja = (hoja) => {
  const partes = [];
  if (hoja.rutina?.days?.length) {
    const dias = hoja.rutina.days.length;
    const ejercicios = hoja.rutina.days.reduce((n, d) => n + d.exercises.length, 0);
    partes.push(`${dias} ${dias === 1 ? 'día' : 'días'} · ${ejercicios} ejercicios`);
  }
  if (hoja.dieta?.meals?.length) {
    const { meals, foods } = dietSummary(hoja.dieta);
    partes.push(`${meals} comidas · ${foods} alimentos`);
  } else if (hoja.dieta?.format === 'macros') {
    partes.push('el objetivo de macros');
  }
  if (!partes.length) partes.push('nada que sepa leer');
  if (hoja.hidden) partes.push('oculta en Excel');
  return partes.join(' · ');
};

/**
 * Las pestañas de un libro, para elegir cuáles son el plan.
 *
 * Cada una dice lo que trae dentro, y las que no traen nada no se pueden marcar:
 * enseñar quince pestañas iguales obligaría a abrirlas una a una para averiguar
 * cuál es el plan, que es exactamente el trabajo que esto viene a quitar.
 */
export const SheetPicker = ({ hojas, elegidas, onToggle }) => (
  <Field
    label="¿Qué hojas quieres traer?"
    hint="Puedes marcar varias: si tienes una pestaña por día, o la dieta en otra, se traen todas de golpe."
  >
    <div className="col gap-2">
      {hojas.map((hoja, i) => (
        <Switch
          key={`${hoja.name}-${i}`}
          label={hoja.name}
          hint={resumenDeHoja(hoja)}
          checked={elegidas.includes(i)}
          disabled={!hoja.rutina?.days?.length && !hoja.dieta?.format}
          onChange={() => onToggle(i)}
        />
      ))}
    </div>
  </Field>
);

export const PastePlanDialog = ({
  foco = 'rutina',
  /* Rutina */
  targetDayName = null,
  unidad = 'semana',
  targetPreference = 0,
  onRememberTarget,
  onImportIntoDay,
  onImportDays,
  /* Dieta */
  foods = [],
  dietaExistente = false,
  dietaConVariantes = false,
  onImportDiet,
  onClose,
}) => {
  const fuente = useSheetSource();
  const { libro, rutina, dieta } = fuente;

  const [targetIndex, setTargetIndex] = useState(targetPreference);
  const [destino, setDestino] = useState(null);
  const [hojasAbiertas, setHojasAbiertas] = useState(false);
  const [traer, setTraer] = useState({ rutina: true, dieta: true });
  const [edicion, setEdicion] = useState(null);

  /*
    ══ Lo editable se deriva de lo leído, y se rehace cuando lo leído cambia ═══

    Ajustar el estado DURANTE el render, comparando con la fuente, es la forma
    que recomienda React para esto: React descarta el render a medias y vuelve a
    entrar con el valor nuevo, sin pintar nunca lo viejo. Con un efecto habría un
    fotograma con la tabla anterior, que en una pantalla que existe para revisar
    es exactamente lo que no puede pasar.

    La columna de objetivo entra en la identidad porque cambiarla cambia lo que
    hay que revisar; rehacer la tabla al tocarla es más honesto que mezclar el
    objetivo nuevo con las correcciones hechas sobre el viejo.
  */
  const fresco = edicion?.rutina === rutina && edicion?.dieta === dieta && edicion?.objetivo === targetIndex;

  if (!fresco) {
    const encontrados = matchFoodNames(foodNames(dieta.variants || []), foods);
    const valores = {};
    for (const [clave, hallazgo] of encontrados) {
      valores[clave] = {
        name: hallazgo.name,
        unitLabel: hallazgo.unitLabel,
        food: hallazgo.food,
        texto: hallazgo.food?.name ?? '',
        macros: {},
      };
    }

    setEdicion({
      rutina,
      dieta,
      objetivo: targetIndex,
      dias: toEditableDays(rutina.days, targetIndex),
      variants: toEditableDiet(dieta),
      pendientes: pendingMatches(encontrados),
      valores,
    });
  }

  const dias = fresco ? edicion.dias : [];
  const variants = fresco ? edicion.variants : [];
  const pendientes = fresco ? edicion.pendientes : [];
  const valores = fresco ? edicion.valores : {};

  const cambiar = (patch) => setEdicion((e) => ({ ...e, ...patch }));
  const cambiarDias = (fn) => cambiar({ dias: fn(edicion.dias) });
  const cambiarDia = (di, fn) => cambiarDias((ds) => ds.map((d, i) => (i === di ? fn(d) : d)));
  const cambiarVariante = (vi, fn) =>
    cambiar({ variants: edicion.variants.map((v, i) => (i === vi ? fn(v) : v)) });
  const cambiarComida = (vi, mi, fn) =>
    cambiarVariante(vi, (v) => ({ ...v, meals: v.meals.map((m, i) => (i === mi ? fn(m) : m)) }));

  /* Todo lo que se enseña y se crea sale de las listas YA corregidas: si alguien
     quita un día, el recuento y el botón bajan con él. */
  const hayRutina = dias.length > 0;
  const hayDieta = variants.some((v) => v.meals.length > 0);
  const hayMacros = Boolean(dieta.targets || dieta.steps || dieta.cardio || dieta.notes?.length);
  const hayAlgo = (hayRutina && traer.rutina) || ((hayDieta || hayMacros) && traer.dieta);

  const sinMusculo = dias.flatMap((d) => d.exercises).filter((e) => !e.muscleSure).length;
  const totalEjercicios = dias.reduce((n, d) => n + d.exercises.length, 0);
  const totalSeries = dias.reduce((n, d) => n + contarSeries(d), 0);
  const totalComidas = variants.reduce((n, v) => n + contarDieta(v).meals, 0);

  /*
    ══ Dónde aterriza la rutina ═══════════════════════════════════════════════

    Un solo día leído y un día abierto delante casi siempre significa «esto va
    aquí»; varios días leídos significa «móntame la semana». Se propone lo
    probable y se deja cambiar, en vez de preguntar siempre lo mismo.
  */
  const puedeAlDiaActual = Boolean(targetDayName) && dias.length === 1;
  const destinoEfectivo = destino ?? (puedeAlDiaActual ? 'actual' : 'nuevos');

  /* Las dos columnas de objetivo, dichas con sus valores de verdad: «8-10» y
     «10-12» se eligen mirándolos, no leyendo «primera» y «segunda». */
  const opcionesDeObjetivo = useMemo(() => {
    if (rutina.targetChoices < 2) return [];
    return Array.from({ length: rutina.targetChoices }, (_, i) => {
      const muestra = rutina.days
        .flatMap((d) => d.exercises)
        .map((e) => e.targetOptions[i]?.[0])
        .filter(Boolean);
      return { id: String(i), label: [...new Set(muestra)].slice(0, 3).join(' · ') || `Columna ${i + 1}` };
    });
  }, [rutina]);

  const etiquetaDelBoton = () => {
    const partes = [];
    if (hayRutina && traer.rutina) {
      partes.push(
        destinoEfectivo === 'actual'
          ? `añadir a ${targetDayName}`
          : `crear ${dias.length} ${dias.length === 1 ? 'día' : 'días'}`
      );
    }
    if ((hayDieta || hayMacros) && traer.dieta) {
      partes.push(hayDieta ? `la dieta (${totalComidas} comidas)` : 'el objetivo de macros');
    }
    if (!partes.length) return 'Traer';
    const frase = partes.join(' y ');
    return frase.charAt(0).toUpperCase() + frase.slice(1);
  };

  const confirmar = () => {
    /* Se crea EXACTAMENTE lo que hay delante: no hay una segunda lectura ni se
       vuelve a mirar el fichero. */
    if (hayRutina && traer.rutina) {
      const draft = aBorrador(dias);
      if (destinoEfectivo === 'actual') onImportIntoDay?.(draft[0].exercises);
      else onImportDays?.(draft);
      if (rutina.targetChoices > 1) onRememberTarget?.(targetIndex);
    }

    if ((hayDieta || hayMacros) && traer.dieta) {
      const resolver = resolverCon(valores);
      onImportDiet?.(
        aPlanDeDieta(hayDieta ? variants : [], resolver, dieta),
        alimentosNuevos(valores, resolver)
      );
    }

    onClose();
  };

  const secciones = foco === 'dieta' ? ['dieta', 'rutina'] : ['rutina', 'dieta'];

  const seccionRutina = hayRutina && (
    <section className="col gap-4" key="rutina">
      <div className="row between wrap gap-3">
        <Switch
          label={`Entrenamiento · ${dias.length} ${dias.length === 1 ? 'día' : 'días'}`}
          hint={`${totalEjercicios} ejercicios · ${totalSeries} series${
            rutina.format === 'texto' ? ' · leído como texto, sin grupos musculares' : ''
          }`}
          checked={traer.rutina}
          onChange={(on) => setTraer((t) => ({ ...t, rutina: on }))}
        />

        {puedeAlDiaActual && traer.rutina && (
          <SegmentedControl
            label="Dónde va la rutina"
            value={destinoEfectivo}
            onChange={setDestino}
            options={[
              { id: 'actual', label: `Añadir a ${targetDayName}` },
              { id: 'nuevos', label: `Crear día nuevo en la ${unidad}` },
            ]}
          />
        )}
      </div>

      {traer.rutina && (
        <>
          {opcionesDeObjetivo.length > 1 && (
            <Field
              label="Tu hoja trae dos objetivos de repeticiones. ¿Cuál uso?"
              hint="Se recordará para la próxima vez que traigas una rutina."
            >
              {(props) => (
                <select
                  {...props}
                  className="select"
                  value={String(targetIndex)}
                  onChange={(e) => setTargetIndex(Number(e.target.value))}
                >
                  {opcionesDeObjetivo.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}

          {sinMusculo > 0 && (
            <Notice tone="warn">
              {sinMusculo === 1
                ? 'Un ejercicio se ha quedado sin grupo muscular porque el de tu hoja no tiene equivalente aquí. Elígelo abajo.'
                : `${sinMusculo} ejercicios se han quedado sin grupo muscular porque el de tu hoja no tiene equivalente aquí. Elígelos abajo.`}
            </Notice>
          )}

          <RoutinePreview
            days={dias}
            onRenameDay={(di, valor) => cambiarDia(di, (d) => ({ ...d, name: valor }))}
            onRemoveDay={(di) => cambiarDias((ds) => ds.filter((_, i) => i !== di))}
            onChangeExercise={(di, ei, patch) =>
              cambiarDia(di, (d) => ({
                ...d,
                exercises: d.exercises.map((ex, i) => (i === ei ? aplicarCambio(ex, patch) : ex)),
              }))
            }
            onRemoveExercise={(di, ei) =>
              cambiarDia(di, (d) => ({ ...d, exercises: d.exercises.filter((_, i) => i !== ei) }))
            }
          />
        </>
      )}
    </section>
  );

  const seccionDieta = (hayDieta || hayMacros) && (
    <section className="col gap-4" key="dieta">
      {/*
        Dice exactamente lo que ha encontrado, una cosa a una. El rótulo genérico
        de antes —«Objetivo de macros»— salía en cuanto había CUALQUIER cosa, así
        que una hoja de la que solo se habían sacado las pautas prometía un
        objetivo que no llegaba: el fallo se leía como que la importación no
        funciona, cuando lo que fallaba era la promesa.
      */}
      <Switch
        label={hayDieta ? `Dieta · ${totalComidas} comidas` : 'Objetivo y pautas'}
        hint={
          [
            hayDieta ? 'Comidas, opciones y gramos' : null,
            resumenDeCabecera(dieta) || null,
          ]
            .filter(Boolean)
            .join(' · ') || 'Nada más que traer de esta hoja.'
        }
        checked={traer.dieta}
        onChange={(on) => setTraer((t) => ({ ...t, dieta: on }))}
      />

      {traer.dieta && (
        <>
          {dietaExistente && hayDieta && (
            <Notice tone="warn">
              Este cliente ya tiene dieta. Las comidas que traigas <strong>sustituyen</strong> a las
              que hay ahora; el objetivo y las pautas se actualizan, y lo que no venga en la hoja se
              queda como está.
            </Notice>
          )}

          {pendientes.length > 0 && (
            <Fold
              icon={Salad}
              title="Alimentos que quiero confirmar contigo"
              summary={`${pendientes.length} de ${Object.keys(valores).length}`}
              defaultOpen
            >
              <div className="col gap-3">
                <p className="t-sm t-secondary">
                  Los demás los he reconocido. Estos encajan con varios —«Garbanzos» son los crudos o
                  los cocidos— o no los tengo: lo que elijas o escribas vale para todas sus
                  apariciones.
                </p>
                <FoodMatchList
                  pendientes={pendientes}
                  foods={foods}
                  valores={valores}
                  onChange={(clave, valor) =>
                    cambiar({ valores: { ...edicion.valores, [clave]: valor } })
                  }
                />
              </div>
            </Fold>
          )}

          <DietPreview
            variants={variants}
            preguntarVariante={dietaConVariantes}
            onSetVariant={(vi, valor) =>
              cambiar({
                /* Con DOS dietas leídas son exclusivas: poner una en «entreno»
                   manda la otra a «descanso» sola, porque tener las dos en el
                   mismo día dejaría una sin sitio donde guardarse. Con una sola
                   no hay a quién empujar. */
                variants: edicion.variants.map((v, i) =>
                  i === vi
                    ? { ...v, variant: valor }
                    : edicion.variants.length > 1
                      ? { ...v, variant: valor === 'training' ? 'rest' : 'training' }
                      : v
                ),
              })
            }
            onRenameMeal={(vi, mi, valor) => cambiarComida(vi, mi, (m) => ({ ...m, name: valor }))}
            onRemoveMeal={(vi, mi) =>
              cambiarVariante(vi, (v) => ({ ...v, meals: v.meals.filter((_, i) => i !== mi) }))
            }
            onRemoveFood={(vi, mi, oi, fi) =>
              cambiarComida(vi, mi, (m) => ({
                ...m,
                options: m.options.map((o, i) =>
                  i === oi ? { ...o, foods: o.foods.filter((_, k) => k !== fi) } : o
                ),
              }))
            }
          />
        </>
      )}
    </section>
  );

  const encontrado = { rutina: seccionRutina, dieta: seccionDieta };

  return (
    <Modal
      title="Traer un plan de fuera"
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" disabled={!hayAlgo} onClick={confirmar}>
            {etiquetaDelBoton()}
          </button>
        </>
      }
    >
      <div className="col gap-5">
        {/* `multiple`: el plan completo puede venir en dos ficheros —el Excel de
            la rutina y el PDF de la dieta— y son el mismo plan. */}
        <input
          ref={fuente.ficheroRef}
          type="file"
          multiple
          className="sr-only"
          accept={ACCEPT}
          onChange={(e) => fuente.abrirFicheros(e.target.files)}
        />

        {libro ? (
          <>
            <div className="row between wrap gap-3">
              <span className="t-sm t-secondary">
                <strong>{libro.nombre}</strong> · {libro.hojas.length}{' '}
                {libro.hojas.length === 1 ? 'hoja' : 'hojas'}
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => fuente.ficheroRef.current?.click()}
              >
                Usar otros ficheros
              </button>
            </div>

            {/*
              ══ El listado de hojas va PLEGADO ═══════════════════════════════

              Un libro de entrenamiento trae quince pestañas, y una lista de
              quince interruptores mide más que la pantalla: empuja la tabla de
              revisión tan abajo que quien la abre no llega a verla y cree que
              esto crea el plan sin enseñar nada.

              Como las hojas con algo dentro vienen ya marcadas, el caso normal
              no necesita abrirlo: se lee el resumen y se pasa a revisar.
            */}
            <Fold
              icon={Layers}
              title="Hojas del libro"
              summary={`${fuente.elegidas.length} de ${libro.hojas.length} elegidas`}
              open={hojasAbiertas}
              onToggle={() => setHojasAbiertas((v) => !v)}
            >
              <SheetPicker
                hojas={libro.hojas}
                elegidas={fuente.elegidas}
                onToggle={fuente.alternarHoja}
              />
            </Fold>
          </>
        ) : (
          <Field
            label={foco === 'dieta' ? 'Pega aquí tu dieta' : 'Pega aquí tu rutina'}
            hint={
              foco === 'dieta'
                ? 'Vale la hoja de cálculo o el texto de un PDF. Los macros de cada alimento los pongo yo.'
                : 'No se guardan los kilos ni las repeticiones que ya estén anotadas: solo el plan.'
            }
          >
            {(props) => (
              <textarea
                {...props}
                className="textarea"
                rows={hayAlgo ? 4 : 8}
                value={fuente.texto}
                placeholder={foco === 'dieta' ? EJEMPLO_DIETA : EJEMPLO_RUTINA}
                onChange={(e) => fuente.escribir(e.target.value)}
              />
            )}
          </Field>
        )}

        {!libro && (
          <div className="row wrap gap-3">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => fuente.ficheroRef.current?.click()}
            >
              <FileSpreadsheet size={15} /> …o sube los ficheros
            </button>
            <span className="t-xs t-tertiary">
              Vale un <strong>.xlsx</strong> con todas sus pestañas, un .csv o un{' '}
              <strong>.pdf</strong>, y puedes elegir <strong>varios a la vez</strong> —el Excel del
              entreno y el PDF de la dieta son el mismo plan—. El .xls de antes de 2007 hay que
              guardarlo antes como .xlsx.
            </span>
          </div>
        )}

        {fuente.abriendo && <Loading label="Abriendo el fichero…" />}
        {fuente.fallo && <Notice tone="error">{fuente.fallo}</Notice>}

        {!libro && fuente.texto.trim() && !hayRutina && !hayDieta && !hayMacros && (
          <Notice tone="warn">
            No he sabido encontrar nada ahí. Si es una rutina, comprueba que has copiado también la
            fila de cabecera —la que dice «Ejercicio», «Series», «Reps»—; si es una dieta, la que
            dice «Alimento» y «Gramos», o los títulos de cada comida.
          </Notice>
        )}

        {libro && !hayRutina && !hayDieta && !hayMacros && !fuente.abriendo && (
          <Notice tone="warn">
            Ninguna de las hojas marcadas trae algo que sepa leer. Marca otra, o abre la que quieras
            traer, cópiala y pégala aquí.
          </Notice>
        )}

        {secciones.map((clave) => encontrado[clave])}

        {!libro && !fuente.texto.trim() && (
          <p className="t-sm t-tertiary">
            <Dumbbell size={14} className="icon-inline" />
            Entiendo las dos formas habituales de escribir una rutina —una columna con el número de
            series, o un bloque de columnas por serie— y las de una dieta: opciones en columnas,
            menús numerados o la lista escrita de un PDF. Lo que salga se puede corregir antes de
            crear nada.
          </p>
        )}
      </div>
    </Modal>
  );
};
