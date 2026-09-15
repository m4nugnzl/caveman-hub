import { useEffect, useId, useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react';

import { MICROS, MICRO_TARGET_FIELDS } from '@/domain/micros';
import { KCAL_PER_GRAM, TARGET_FIELDS, cuadrarMacros, macroSplit } from '@/domain/nutrition';
import { AJUSTES } from '@/domain/protocol';
import { toNum0 } from '@/lib/num';
import { Modal } from '@/components/ui/Modal';
import { CarrilDePasos } from '@/components/ui/Asistente';
import { SegmentedControl } from '@/components/ui/primitives';
import { MacroBar } from './macros';
import { ReajusteDelMenu, useReajuste } from './ReajusteDelMenu';
import { RepartoDelAjuste, useRepartoDelAjuste } from './RepartoDelAjuste';

/* El nombre y la unidad van por separado desde que la unidad se pinta DENTRO
   del campo (`.input-suffix`): en la etiqueta era «Proteína (g)», un paréntesis
   haciendo el trabajo que hace mejor el propio recuadro. */
const LABELS = {
  targetKcals: 'Objetivo',
  proteinGrams: 'Proteína',
  carbsGrams: 'Carbos',
  fatsGrams: 'Grasas',
};

/* El campo de cada macro, en los dos sentidos: el dominio habla de `protein` y
   el formulario de `proteinGrams`. */
const CAMPO = { protein: 'proteinGrams', carbs: 'carbsGrams', fats: 'fatsGrams' };
const MACROS = ['protein', 'carbs', 'fats'];

/* El escalón de cada botón, en gramos de cocina y no en kilocalorías redondas:
   20 kcal de hidratos son 5 g y 18 de grasa son 2 g, que es como se escriben.
   Un paso de 1 g obligaría a veinte pulsaciones para mover una comida. */
const ESCALON = { protein: 5, carbs: 5, fats: 2 };

const aMacros = (f) =>
  Object.fromEntries(MACROS.map((k) => [k, toNum0(f?.[CAMPO[k]])]));
const aCampos = (m) =>
  Object.fromEntries(MACROS.map((k) => [CAMPO[k], String(Math.round(toNum0(m?.[k])))]));

/* Identidades estables: entran en las dependencias del cálculo del reajuste. */
const NADA_APARTADO = new Set();
const NADA_ESCRITO = new Map();
const SIN_MENU = [];

/** «A mano» no es una respuesta repetible, así que no se guarda. Ver `AJUSTES`. */
const OPCIONES = [
  ...AJUSTES.map((a) => ({ id: a.id, label: a.label, hint: a.hint })),
  { id: 'mano', label: 'A mano' },
];

/**
 * PONER EL OBJETIVO DE UN DÍA: qué energía, de dónde sale y qué le hace al menú.
 *
 * ══ Por qué es una pieza y no un trozo de tarjeta ══════════════════════════
 *
 * Vivía dentro de `MacroTargetCard`, que era a la vez la LECTURA del objetivo y
 * su EDITOR. Mientras la lectura fue una sola —la tarjeta del costado— eso no
 * molestaba. Pero el objetivo se lee ya en tres sitios con tres formas
 * distintas: la sección del costado de la dieta, la sección de la mesa cuando
 * el plan es por macros sin reparto, y las dos tarjetas de la revisión. Atar el
 * editor a UNA de las lecturas obligaba a montar esa lectura aunque no se
 * quisiera pintar, que es lo que impedía fundir «Objetivo» y «El día» en una
 * sola sección del costado.
 *
 * ══ Y AHORA SON CUATRO PANTALLAS, QUE ES EL AJUSTE ENTERO ══════════════════
 *
 * Ajustar una dieta son cuatro decisiones encadenadas, y estaban todas en el
 * mismo scroll: cuatro casillas, una pregunta con cinco botones, un aviso rojo
 * y una lista de veinte gramajes que crecía por el pie mientras tecleabas
 * arriba. Eso no se lee, se rebusca.
 *
 *     ① Objetivo        ② Los macros      ③ El reparto      ④ El menú
 *     2.500 → 2.200     −300 kcal, ¿de    qué le toca a     qué gramo se
 *     kcal              dónde salen       cada comida       mueve y cuál
 *                                                           lo pones tú
 *
 * Cada una es la pregunta que la anterior deja abierta, y ninguna aparece antes
 * de tiempo: el del reparto solo existe cuando hay comidas que reajustar y el
 * del menú solo cuando hay gramos que mover. Un solo «Guardar» al final escribe
 * las tres cosas —objetivo, reparto y menú—, «Atrás» no pierde nada de lo
 * tecleado y «Cancelar» no deja nada a medias.
 *
 * Es el mismo asistente que la revisión semanal y «Mandar algo»: el mismo carril
 * (`CarrilDePasos`) y el mismo pie. Con una diferencia que aquí sí hace falta —
 * las marcas del carril **se pueden pulsar**. No hay validación por paso: los
 * cuatro son la misma decisión mirada desde cuatro sitios, así que volver a las
 * calorías después de ver el menú tiene que costar un clic, que es exactamente
 * lo que se hace cuando el reajuste no acaba de gustar.
 *
 * ── Lo que sigue sin hacer ────────────────────────────────────────────────
 * Proponer. El objetivo lo pone el entrenador; la aplicación hace la división
 * que él hacía en la cabeza —199 kcal entre 4 son 50 g de hidratos— y enseña la
 * consecuencia. Ver `cuadrarMacros`: se elige quién absorbe, no cuánto.
 *
 * ══ Se decide, no se compara ═══════════════════════════════════════════════
 * Va en ventana CENTRADA y no por el canto derecho. Es la misma regla que ya
 * tenían los ajustes del programa en `WorkoutLogEditor`: `side` está para mirar
 * un detalle sin soltar el trabajo, no para decidir. Y no se sustituye la
 * tarjeta por un formulario en su sitio: las cifras del plan desaparecían y la
 * columna entera daba un salto.
 *
 * @param {object} targets  Lo guardado, de `targetsFor(plan, variant)`.
 * @param {object} reajuste  `{ meals, catalog, ajuste }` — las comidas del día, el
 *   catálogo (para resolver de qué cesta sale el recorte) y de dónde salieron
 *   las calorías la última vez con esta persona. Sin esto la ventana son dos
 *   pasos y no cuatro: así se abre desde la revisión, donde no hay dieta.
 * @param {func}   onSave  `(fields, { meals, ajuste })`. `meals` es el menú
 *   reajustado o `null` si no hay nada que aplicar; `ajuste` es el ancla a
 *   recordar, o `null` si no ha cambiado.
 */
export const EditarObjetivo = ({
  open,
  onClose,
  title,
  targets,
  onSave,
  avanzado = false,
  reajuste = null,
}) => {
  const meals = reajuste?.meals || SIN_MENU;
  const catalog = reajuste?.catalog || SIN_MENU;
  const ajusteGuardado = reajuste?.ajuste || 'carbs';

  const [form, setForm] = useState(null);
  /*
    Lo que había al ABRIR, y de ahí se calcula todo: el ancla cuadra los macros
    contra ESTOS —no contra los que hay en el campo— para que teclear 2.300,
    borrar y escribir 2.350 dé lo mismo que escribir 2.350 a la primera. Sin
    esto, cada tecla ajustaría sobre el resultado de la anterior.
  */
  const [origen, setOrigen] = useState(null);
  const [ancla, setAncla] = useState(ajusteGuardado);
  /* Las dos correcciones por fila del último paso: la que se deja igual y la
     que se escribe. Se excluyen entre sí, y de eso responden sus dos manos. */
  const [apartados, setApartados] = useState(NADA_APARTADO);
  const [fijados, setFijados] = useState(NADA_ESCRITO);
  /* El reparto sigue al objetivo salvo que se diga que no: es la consecuencia
     normal de mover el día, y apagarlo es la excepción. Ver `RepartoDelAjuste`. */
  const [seguirReparto, setSeguirReparto] = useState(true);
  const [paso, setPaso] = useState(0);

  /* El formulario va en el cuerpo de la ventana y el botón en su pie: se atan
     con `form=` y eso pide un id estable. */
  const formId = useId();

  /*
    El borrador nace al ABRIRSE, no al montarse: esta pieza vive junto a la
    lectura y se queda montada con `open={false}` mientras no se toque nada, así
    que sembrarlo una sola vez dejaría dentro las cifras de la primera vez que
    se pintó —o las del día que estuviera abierto entonces—. Con la ventana
    cerrada se descarta, y así «Cancelar» no deja nada escrito para la próxima.
  */
  useEffect(() => {
    if (!open) {
      setForm(null);
      setOrigen(null);
      setApartados(NADA_APARTADO);
      setFijados(NADA_ESCRITO);
      setPaso(0);
      return;
    }
    setForm(
      Object.fromEntries(
        [...TARGET_FIELDS, ...MICRO_TARGET_FIELDS].map((key) => [key, targets?.[key] ?? ''])
      )
    );
    setOrigen({ kcals: toNum0(targets?.targetKcals), macros: aMacros(targets) });
    setAncla(ajusteGuardado);
    setApartados(NADA_APARTADO);
    setFijados(NADA_ESCRITO);
    setPaso(0);
    /* `targets` es un objeto nuevo en cada render (sale de `targetsFor`), así
       que no puede ir en las dependencias: sembraría el borrador con lo
       guardado en cada pulsación de tecla. Lo que manda es abrir. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /*
    Lo que se está tecleando ahora mismo, para la barra y las cuentas. Con la
    ventana cerrada `form` es null y se lee lo guardado, así que nada aparece
    vacío en el primer fotograma de la apertura.
  */
  const borrador = form ?? targets ?? {};
  const objetivoKcal = toNum0(borrador.targetKcals);
  const proteina = toNum0(borrador.proteinGrams);
  const hidratos = toNum0(borrador.carbsGrams);
  const grasas = toNum0(borrador.fatsGrams);
  /* Por los tres números sueltos y no por `borrador`, que es un objeto nuevo en
     cada render: de ahí cuelga el cálculo del menú entero. */
  const macrosAhora = useMemo(
    () => ({ protein: proteina, carbs: hidratos, fats: grasas }),
    [proteina, hidratos, grasas]
  );

  const sumaBorrador = macroSplit({
    proteinGrams: borrador.proteinGrams,
    carbsGrams: borrador.carbsGrams,
    fatsGrams: borrador.fatsGrams,
  }).total;
  /* Lo que falta por colocar (+) o lo que se ha pasado (−), contra el objetivo.
     Doce kilocalorías de margen: es el redondeo de tres gramajes enteros, no un
     descuadre, y avisar de él sería enseñar un error que no existe. */
  const resto = objetivoKcal > 0 && sumaBorrador > 0 ? Math.round(objetivoKcal - sumaBorrador) : 0;
  const cuadra = Math.abs(resto) <= 12;

  /* El salto que hay que colocar. Es la pregunta del segundo paso. */
  const delta = origen?.kcals > 0 && objetivoKcal > 0 ? objetivoKcal - origen.kcals : 0;

  /** Poner el objetivo y, con un ancla puesta, repartirlo. */
  const ponerKcals = (valor) => {
    const kcals = toNum0(valor);
    const reparte = ancla !== 'mano' && origen?.kcals > 0 && kcals > 0;
    setForm((f) => ({
      ...f,
      targetKcals: valor,
      ...(reparte ? aCampos(cuadrarMacros({ antes: origen.macros, kcals, ancla })) : {}),
    }));
  };

  /** Elegir el ancla recoloca los tres gramajes; no toca el objetivo. */
  const elegirAncla = (id) => {
    setAncla(id);
    if (id === 'mano' || !(objetivoKcal > 0) || !origen) return;
    setForm((f) => ({
      ...f,
      ...aCampos(cuadrarMacros({ antes: origen.macros, kcals: objetivoKcal, ancla: id })),
    }));
  };

  /*
    Tocar un macro es decir «a mano»: el ancla deja de mandar en el acto. Si no,
    el siguiente toque al objetivo borraría lo que se acaba de poner sin avisar
    —que es la clase de cosa que hace desconfiar de un formulario—. El atajo
    sigue ahí para volver: se pulsa «Hidratos» y se recoloca todo.
  */
  const ponerMacro = (key, valor) => {
    setAncla('mano');
    setForm((f) => ({ ...f, [key]: valor }));
  };

  /** Un escalón arriba o abajo en un macro, que es el ajuste fino del reparto. */
  const escalon = (k, signo) => {
    const ahora = toNum0(borrador[CAMPO[k]]);
    ponerMacro(CAMPO[k], String(Math.max(0, ahora + signo * ESCALON[k])));
  };

  /** «Que las coja hidratos»: ese macro recoge lo que falte o lo que sobre. */
  const cuadrarCon = (k) => {
    setAncla('mano');
    setForm((f) => ({
      ...f,
      ...aCampos(cuadrarMacros({ antes: aMacros(f), kcals: objetivoKcal, ancla: k })),
    }));
  };

  /*
    EL REPARTO, entre los macros y el menú. Lo que se le pide a cada comida es
    un piso entero del objetivo y no seguía a nadie: con cuatro comidas de 600
    escritas cuando el día valía 2.400, bajarlo a 2.250 dejaba el menú apuntando
    a la cifra vieja. Ver `repartoAlObjetivo`.

    Va ANTES del menú y le da de comer: los gramos se reajustan contra el reparto
    nuevo, que es la única forma de que el día acabe sumando lo que pide.
  */
  const objetivoDelDia = useMemo(
    () => ({ kcals: objetivoKcal, ...macrosAhora }),
    [objetivoKcal, macrosAhora]
  );
  const reparto = useRepartoDelAjuste({ meals, objetivo: objetivoDelDia, seguir: seguirReparto });
  const mealsDelMenu = reparto?.meals || meals;

  /* El menú: qué gramos se moverían con lo que hay tecleado ahora mismo. */
  const kcalsDelReajuste = useMemo(
    () => ({ antes: origen?.kcals ?? 0, ahora: objetivoKcal }),
    [origen, objetivoKcal]
  );
  const datos = useReajuste({
    meals: mealsDelMenu,
    catalog,
    antes: origen?.macros,
    despues: macrosAhora,
    kcals: kcalsDelReajuste,
    /* El reparto moviéndose cuenta como cambio aunque no se haya tecleado nada:
       es el caso de la dieta que llega con el día ya bajado y el reparto viejo
       —objetivos en 2.250, comidas en 2.400—, donde el paso anterior corrige la
       portería y el menú tiene que seguirla. Ver `useReajuste`. */
    repartoMovido: Boolean(reparto),
    apartados,
    fijados,
  });

  /** Dejar una fila igual, o devolverla al ajuste. Borra lo que se hubiera escrito. */
  const apartar = (clave) => {
    setApartados((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(clave)) siguiente.delete(clave);
      else siguiente.add(clave);
      return siguiente;
    });
    setFijados((prev) => {
      if (!prev.has(clave)) return prev;
      const siguiente = new Map(prev);
      siguiente.delete(clave);
      return siguiente;
    });
  };

  /** Escribir los gramos de una fila, o (`null`) volver a lo propuesto. */
  const ponerGramos = (clave, valor) => {
    setApartados((prev) => {
      if (!prev.has(clave)) return prev;
      const siguiente = new Set(prev);
      siguiente.delete(clave);
      return siguiente;
    });
    setFijados((prev) => {
      const siguiente = new Map(prev);
      if (valor === null) siguiente.delete(clave);
      else siguiente.set(clave, valor);
      return siguiente;
    });
  };

  /* El interruptor de arriba: o se reajusta el menú o no se toca. Al apagarlo se
     van también los gramajes escritos —si no, seguirían moviendo comidas con el
     interruptor en «no»—, y al encenderlo se vuelve a lo propuesto. */
  const apartarTodas = (reajustar) => {
    setApartados(reajustar ? NADA_APARTADO : new Set((datos?.filas || []).map((f) => f.clave)));
    if (!reajustar) setFijados(NADA_ESCRITO);
  };

  const mealsNuevas = datos?.res?.meals || null;
  const hayMenu = (datos?.filas?.length ?? 0) > 0;
  const hayReparto = Boolean(reparto);
  /* Lo que se va a escribir en las comidas: el menú reajustado si se ha movido
     un gramo —ya viene con el reparto nuevo dentro— y, si no, el reparto solo.
     Sin esta segunda mitad, cambiar el objetivo de un día cuyo menú ya cuadra
     dejaba el reparto sin escribir y la avería volvía al día siguiente. */
  const mealsAGuardar = mealsNuevas || reparto?.meals || null;

  /*
    Los pasos son los que hay algo que contestar. El del menú aparece cuando se
    mueve un gramo y se va cuando se deja de mover: una pestaña que promete una
    pantalla vacía es peor que no tenerla. Ver [[ley-del-reposo]].
  */
  const PASOS = useMemo(
    () => [
      { id: 'objetivo', titulo: 'Objetivo' },
      { id: 'macros', titulo: 'Los macros' },
      ...(hayReparto ? [{ id: 'reparto', titulo: 'El reparto' }] : []),
      ...(hayMenu ? [{ id: 'menu', titulo: 'El menú' }] : []),
    ],
    [hayReparto, hayMenu]
  );
  /* Acotado y no guardado a la fuerza: deshacer el cambio de calorías mientras
     se mira el menú quita ese paso, y el índice se quedaría fuera de la lista. */
  const indice = Math.min(paso, PASOS.length - 1);
  const actual = PASOS[indice];

  /*
    Y el botón grande dice lo que toca. «Siguiente» mientras quede algo por
    decidir: un salto que colocar, o unos gramos que mirar. Cuando no queda
    nada, «Guardar» ahí mismo — corregir la fibra no puede costar tres pantallas.
  */
  const quedaAlgo =
    actual.id === 'objetivo'
      ? delta !== 0 || hayReparto || hayMenu
      : actual.id === 'macros'
        ? hayReparto || hayMenu
        : actual.id === 'reparto'
          ? hayMenu
          : false;

  const commit = (event) => {
    event.preventDefault();
    /* La tecla Intro avanza mientras haya pasos; guardar es el final del camino
       y no un atajo desde cualquier casilla. */
    if (quedaAlgo) {
      setPaso(indice + 1);
      return;
    }
    onSave(form, {
      meals: mealsAGuardar,
      menu: Boolean(mealsNuevas),
      /* Se recuerda al GUARDAR y solo si has elegido algo distinto de lo que
         traías: cambiar de ancla para ver qué gramos saldrían es mirar, no
         decidir, y quien siempre baja hidratos no escribe nada nunca. */
      ajuste: ancla !== 'mano' && ancla !== ajusteGuardado ? ancla : null,
    });
    onClose();
  };

  const pista =
    ancla === 'mano'
      ? 'Los gramos los pones tú; abajo te digo si cuadran con el objetivo.'
      : OPCIONES.find((o) => o.id === ancla)?.hint;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={title || 'Objetivo diario'}
      footer={
        <>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={indice === 0 ? onClose : () => setPaso(indice - 1)}
          >
            {indice === 0 ? (
              'Cancelar'
            ) : (
              <>
                <ChevronLeft size={15} /> Atrás
              </>
            )}
          </button>
          <button type="submit" form={formId} className="btn btn-primary">
            {quedaAlgo ? (
              <>
                Siguiente <ChevronRight size={15} />
              </>
            ) : (
              <>
                <Check size={15} /> {mealsAGuardar ? 'Guardar y reajustar' : 'Guardar'}
              </>
            )}
          </button>
        </>
      }
    >
      <form id={formId} className="wiz" onSubmit={commit}>
        <CarrilDePasos pasos={PASOS} indice={indice} onIr={setPaso} />

        {/* La `key` remonta el panel al cambiar de paso: la animación de entrada
            se reproduce y el diálogo vuelve arriba. */}
        <div className="wiz-panel" key={actual.id}>
          {/* ── ① La energía del día ──────────────────────────────────── */}
          {actual.id === 'objetivo' && (
            <>
              <div className="objetivo-cabeza">
                <label className="field">
                  <span className="field-label">{LABELS.targetKcals}</span>
                  {/* La unidad va DENTRO del recuadro, no entre paréntesis en la
                      etiqueta: es parte de lo que se escribe. */}
                  <span className="input-suffix">
                    <input
                      type="text"
                      inputMode="decimal"
                      className="input input-center"
                      value={form?.targetKcals ?? ''}
                      onChange={(e) => ponerKcals(e.target.value)}
                    />
                    <span aria-hidden="true">kcal</span>
                  </span>
                </label>
                <p className="t-sm t-secondary">
                  {delta !== 0
                    ? `${delta < 0 ? '−' : '+'}${Math.abs(delta)} kcal sobre las ${origen.kcals} que tenía puestas.`
                    : 'Lo que tiene puesto ahora. Cámbialo y te digo de dónde puede salir.'}
                </p>
              </div>

              {/*
                ══ LAS CUATRO DEL ENVASE, si las has encendido ═══════════════

                Aquí y no al lado de los macros, porque son de otro orden: los
                macros son el reparto de la energía y estas son composición. En
                blanco significa que no las pautas, que es lo normal: no hay
                ninguna cifra por defecto y la aplicación no propone ninguna.

                Cada una dice si es un suelo o un techo en su propia etiqueta. Un
                objetivo de fibra es un mínimo y uno de sal un máximo, y sin
                decirlo se leerían como los macros —o sea, como una cifra que hay
                que clavar—. Ver `MICROS` en `domain/micros.js`.
              */}
              {avanzado && (
                <>
                  <hr className="menu-sep" />
                  <div className="grid-auto">
                    {MICROS.map(({ key, target, label, unit, sentido }) => (
                      <label className="field" key={key}>
                        <span className="field-label">
                          {label} <small>{sentido === 'min' ? 'mínimo' : 'máximo'}</small>
                        </span>
                        <span className="input-suffix">
                          <input
                            type="text"
                            inputMode="decimal"
                            className="input input-center"
                            placeholder="—"
                            value={form?.[target] ?? ''}
                            onChange={(e) => setForm({ ...form, [target]: e.target.value })}
                          />
                          <span aria-hidden="true">{unit}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {/* ── ② De dónde sale, que es la decisión de oficio ─────────── */}
          {actual.id === 'macros' && (
            <>
              {/*
                ── El reparto se ve mientras se escribe ────────────────────
                Un objetivo de macros NO son tres números, es un reparto —y el
                reparto solo se entiende viéndolo—, así que la barra va
                alimentada por el BORRADOR: se quitan 4 g de grasa y el trozo
                violeta se encoge ahí mismo.

                Vive en ESTE paso y no encima de los tres, que es donde estuvo:
                allí repetía la cifra del campo de al lado con letra más grande
                —dos veces el mismo 2.000 en la misma pantalla— y enseñaba el
                reparto una pantalla antes de que se pudiera tocar.

                Es además el ÚNICO sitio de la dieta donde la barra de tres
                colores sigue viva, y por eso: aquí el tramo se mueve mientras
                tecleas. En una tarjeta quieta decía lo mismo que los números
                escritos debajo y hacía que el ámbar significara «carbos» en una
                pantalla donde el ámbar significa «ojo con esto». Ver
                [[ley-del-color]].
              */}
              <MacroBar
                protein={borrador.proteinGrams}
                carbs={borrador.carbsGrams}
                fats={borrador.fatsGrams}
                kcals={borrador.targetKcals}
              />

              {delta !== 0 && (
                <div className="col gap-2">
                  <span className="section-label">
                    De dónde sale {delta < 0 ? 'la bajada' : 'la subida'} de {Math.abs(delta)} kcal
                  </span>
                  {/*
                    Los tres atajos siembran el reparto de un clic —es lo que se
                    hace nueve de cada diez veces— y desde ahí se afina con los
                    botones de cada fila. Sin ellos, «bajar algo las grasas» era
                    dividir entre nueve en la cabeza; sin las filas, solo se podía
                    elegir entre tres repartos cerrados.
                  */}
                  <SegmentedControl
                    value={ancla}
                    onChange={elegirAncla}
                    options={OPCIONES}
                    label="De dónde sale el ajuste"
                    ancho
                  />
                  <span className="t-xs t-tertiary">{pista}</span>
                </div>
              )}

              {/*
                ══ ANTES Y AHORA, UNO DEBAJO DE OTRO ══════════════════════════

                Esta lista enseñaba el «antes» SOLO del macro que se movía, así
                que los otros dos salían con la columna vacía y un guion donde
                iba la cuenta: no se leía «la proteína y las grasas se quedan
                como estaban», se leía un hueco. Y el reparto es justamente eso
                —qué se mueve y qué no—, así que ahora es una tabla de dos
                columnas con su encabezado: los tres macros dicen de dónde
                vienen y adónde van, y el que no cambia lo dice con la palabra.
              */}
              <div className="macro-reparto card-inset">
                {/* Los cinco huecos del encabezado son los cinco de una fila,
                    en el mismo orden: en estrecho se van «antes» y la flecha, y
                    con ellos su rótulo. */}
                <div className="macro-fila es-cab" aria-hidden="true">
                  <span />
                  <span className="cifra es-antes">Antes</span>
                  <span className="es-flecha" />
                  <span className="cifra es-ahora">Ahora</span>
                  <span className="cifra">Mueve</span>
                </div>

                {MACROS.map((k) => {
                  const antes = toNum0(origen?.macros?.[k]);
                  const ahora = toNum0(borrador[CAMPO[k]]);
                  const mueve = Math.round((ahora - antes) * KCAL_PER_GRAM[k]);
                  const nombre = LABELS[CAMPO[k]].toLowerCase();
                  return (
                    <div className={`macro-fila${mueve === 0 ? ' es-igual' : ''}`} key={k}>
                      <label className="nm" htmlFor={`${formId}-${k}`}>
                        {LABELS[CAMPO[k]]}
                      </label>
                      <span className="cifra es-antes">{antes > 0 ? `${antes} g` : '—'}</span>
                      <span className="cifra es-flecha" aria-hidden="true">
                        →
                      </span>
                      {/*
                        El campo y sus dos escalones son UN mando y no tres
                        controles seguidos: sueltos, los botones quedaban al otro
                        extremo de la fila y no se sabía a qué macro pertenecían.
                        Juntos en una cápsula, el gesto es el de subir y bajar una
                        cifra —que es lo que se está haciendo.
                      */}
                      <div className="macro-mando">
                        <button
                          type="button"
                          className="btn btn-icon"
                          onClick={() => escalon(k, -1)}
                          aria-label={`${ESCALON[k]} g menos de ${nombre}`}
                        >
                          <Minus size={15} />
                        </button>
                        <span className="cifra-mando">
                          <input
                            id={`${formId}-${k}`}
                            type="text"
                            inputMode="decimal"
                            className="input"
                            value={form?.[CAMPO[k]] ?? ''}
                            onChange={(e) => ponerMacro(CAMPO[k], e.target.value)}
                          />
                          <span aria-hidden="true">g</span>
                        </span>
                        <button
                          type="button"
                          className="btn btn-icon"
                          onClick={() => escalon(k, 1)}
                          aria-label={`${ESCALON[k]} g más de ${nombre}`}
                        >
                          <Plus size={15} />
                        </button>
                      </div>
                      {/* Lo que ese macro pone o quita del día. Es la cuenta que
                          se hacía en la cabeza, y la única forma de repartir un
                          salto entre dos macros sin dividir entre cuatro y nueve. */}
                      <span className={`cifra${mueve !== 0 ? ' es-viva' : ''}`}>
                        {mueve !== 0 ? `${mueve > 0 ? '+' : '−'}${Math.abs(mueve)} kcal` : 'igual'}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/*
                Lo que falta por colocar, y CON QUÉ colocarlo. Era una línea roja
                sin salida —«los macros suman 2.499 kcal, 199 por encima»—, cierta
                e inútil: el entrenador tenía que dividir 199 entre 4 para saber
                que eran 50 g de hidratos. Sigue sin decir qué hacer —cuadrar
                bajando carbos o subiendo el objetivo es criterio suyo—, pero los
                tres caminos están escritos y son un clic.

                El cliente no lo ve nunca, y por una razón que sigue valiendo
                entera: le señalaría un fallo del trabajo de su entrenador que él
                no puede tocar. No hace falta esconderlo — no tiene este editor.
              */}
              {objetivoKcal > 0 && sumaBorrador > 0 && (
                <div className="col gap-1">
                  {cuadra ? (
                    <span className="t-xs t-tertiary">
                      Los tres suman {Math.round(sumaBorrador)} kcal: cuadra con el objetivo.
                    </span>
                  ) : (
                    <>
                      <span className="t-xs t-warning">
                        {resto > 0
                          ? `Faltan ${resto} kcal por colocar.`
                          : `Te has pasado ${Math.abs(resto)} kcal del objetivo.`}
                      </span>
                      <div className="row gap-1 wrap" style={{ alignItems: 'center' }}>
                        <span className="t-xs t-tertiary">
                          {resto > 0 ? 'Que las coja' : 'Que las quite'}
                        </span>
                        {MACROS.map((k) => (
                          <button
                            key={k}
                            type="button"
                            className="btn btn-plain btn-sm"
                            onClick={() => cuadrarCon(k)}
                          >
                            {LABELS[CAMPO[k]].toLowerCase()}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── ③ El piso de en medio: lo que le toca a cada comida ───── */}
          {actual.id === 'reparto' && (
            <RepartoDelAjuste
              meals={meals}
              objetivo={objetivoDelDia}
              reparto={reparto}
              seguir={seguirReparto}
              onSeguir={setSeguirReparto}
            />
          )}

          {/* ── ④ Y la consecuencia: qué gramos del menú se mueven ────── */}
          {actual.id === 'menu' && (
            <>
              <p className="t-sm t-secondary">
                Con ese objetivo, esto es lo que se mueve. Deja igual lo que no quieras tocar o
                ponle los gramos tú: el resto de esa comida vuelve a cuadrar.
              </p>
              <ReajusteDelMenu
                datos={datos}
                onApartar={apartar}
                onGramos={ponerGramos}
                onTodas={apartarTodas}
              />
            </>
          )}
        </div>
      </form>
    </Modal>
  );
};
