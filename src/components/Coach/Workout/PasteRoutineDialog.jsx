import { useMemo, useRef, useState } from 'react';
import { FileSpreadsheet, Layers, Trash2, X } from 'lucide-react';

import {
  mergeSheetReadings,
  parseRoutineGrid,
  parseRoutineSheet,
  toExerciseDraft,
} from '@/domain/routineSheet';
import { MUSCLE_GROUPS } from '@/domain/training';
import { SPREADSHEET_ACCEPT, isWorkbookFile, readWorkbook } from '@/domain/xlsx';
import {
  Field,
  Fold,
  Loading,
  Notice,
  NumberInput,
  SegmentedControl,
  Switch,
} from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';

/**
 * Traer una rutina de fuera: se pega o se sube, y se mira antes de crear nada.
 *
 * ══ Por qué la previsualización no es un lujo ══════════════════════════════
 *
 * Porque es lo único que hace que esto funcione con una hoja que no hemos visto
 * nunca. Cada entrenador guarda su rutina a su manera y no hay lector que las
 * entienda todas; lo que sí se puede garantizar es que **cuando se equivoque se
 * vea, y corregirlo cueste dos clics**. Un importador que acierta el 90 % y
 * escribe en silencio es peor que uno que acierta el 70 % y lo enseña: del
 * segundo te fías, porque lo has mirado.
 *
 * De ahí las tres cosas que se pueden tocar aquí y en ningún otro sitio:
 *
 *   · El NOMBRE de cada día. Se deduce de la hoja y a veces no hay de dónde.
 *   · El MÚSCULO de cada ejercicio, con los dudosos marcados. «Hombros» no se
 *     reparte solo entre los tres deltoides: se pregunta.
 *   · CUÁL de las dos columnas de objetivo vale, cuando la hoja trae dos —pasa
 *     con las cabeceras combinadas: «8-10» para las primeras semanas y «10-12»
 *     para las últimas—. Y la respuesta se recuerda, porque la próxima hoja de
 *     este entrenador va a ser la misma hoja.
 *
 * ══ Pegar y subir no son lo mismo, y las dos hacen falta ═══════════════════
 *
 * **Pegar** gana cuando la hoja ya está abierta: es un gesto, y Excel entrega el
 * texto tal y como se ve.
 *
 * **Subir** gana en todo lo demás, y por un motivo que solo se ve al abrir un
 * libro de verdad: un `.xlsx` de entrenamiento tiene quince pestañas —el plan,
 * el registro, las medidas, la biblioteca de alimentos— y pegando se llega a una
 * cada vez, sabiendo de antemano cuál. Subiéndolo se ven todas con lo que hay
 * dentro de cada una, y se eligen varias de una vez: hay quien reparte la
 * semana en una pestaña por día.
 *
 * ══ Lo que no entra ════════════════════════════════════════════════════════
 *
 * Los kilos y las repeticiones registradas. Están en la hoja, son la mitad del
 * fichero, y traerlos fabricaría entrenamientos que aquí no ocurrieron. El
 * porqué entero, en la cabecera de `domain/routineSheet.js`.
 */

const EJEMPLO = `Copia las filas en tu Excel (o en Sheets, Numbers o una tabla de Word) y pégalas aquí.
Puedes seleccionar la hoja entera: lo que no sea la rutina se descarta.

También vale escrita a mano:
  Día 1 · Push
  Press banca 4x8-10 RIR2
  Elevaciones laterales 3x12-15`;

/* ══ Lo leído, convertido en algo que se puede corregir ════════════════════

   Al principio la previsualización pintaba directamente lo que salía del
   lector y guardaba las correcciones aparte, en un mapa indexado por posición.
   Eso aguantaba cambiar un músculo y se rompía en cuanto había que QUITAR algo,
   que resulta ser la corrección más frecuente: al borrar el segundo día, las
   correcciones del tercero pasaban a aplicarse al que ocupara su sitio.

   Así que lo leído se materializa una vez en una lista editable con identidad
   propia, y a partir de ahí se toca esa lista. Cambiar de fuente —otro fichero,
   otras hojas, otra columna de objetivo— la vuelve a materializar. */

let contador = 0;
const nuevaId = () => {
  contador += 1;
  return `p${contador}`;
};

export const toEditableDays = (days, targetIndex = 0) =>
  days.map((dia, i) => ({
    id: nuevaId(),
    name: dia.name ?? `Día ${i + 1}`,
    exercises: dia.exercises.map((ex) => ({
      id: nuevaId(),
      name: ex.name,
      muscle: ex.muscle,
      muscleRaw: ex.muscleRaw,
      muscleSure: ex.muscleSure,
      sets: ex.sets,
      /* Un objetivo por serie: la hoja puede pedir 6-8 en la primera y 8-10 en
         las demás, y eso no se puede aplanar sin perderlo. */
      targets: ex.targetOptions[targetIndex] || ex.targetOptions[0] || [],
      rir: ex.rir || '',
      note: ex.note || '',
    })),
  }));

const contarSeries = (dia) => dia.exercises.reduce((n, e) => n + (Number(e.sets) || 0), 0);

/** «6-8 · 8-10» cuando las series piden cosas distintas; «8-10» cuando no. */
const objetivoVisible = (ex) => [...new Set(ex.targets)].join(' · ');

const redimensionar = (targets, largo) =>
  Array.from({ length: largo }, (_, i) => targets[i] ?? targets[targets.length - 1] ?? '');

/** Aplica un cambio de la tabla, manteniendo coherentes series y objetivos. */
const aplicarCambio = (ex, patch) => {
  if ('sets' in patch) {
    const n = Number.parseInt(patch.sets, 10);
    /* Se acota al vuelo en vez de admitir un valor imposible y protestar
       después: así de la tabla no puede salir nunca un ejercicio de 0 series. */
    if (!Number.isFinite(n)) return ex;
    const sets = Math.max(1, Math.min(12, n));
    return { ...ex, sets, targets: redimensionar(ex.targets, sets) };
  }
  if ('objetivo' in patch) {
    return { ...ex, targets: Array.from({ length: Math.max(1, ex.sets) }, () => patch.objetivo) };
  }
  return { ...ex, ...patch };
};

/** De la tabla editada a lo que guarda la aplicación. */
const aBorrador = (dias) =>
  dias.map((dia, i) => ({
    dayName: dia.name.trim() || `Día ${i + 1}`,
    exercises: dia.exercises.map((ex) => toExerciseDraft({ ...ex, targetOptions: [ex.targets] })),
  }));

/** Qué trae una hoja, dicho en una línea. */
const resumenDeHoja = (hoja) => {
  const oculta = hoja.hidden ? ' · oculta en Excel' : '';
  if (!hoja.lectura.days.length) return `nada que se parezca a una rutina${oculta}`;
  const dias = hoja.lectura.days.length;
  const ejercicios = hoja.lectura.days.reduce((n, d) => n + d.exercises.length, 0);
  return `${dias} ${dias === 1 ? 'día' : 'días'} · ${ejercicios} ejercicios${oculta}`;
};

/**
 * Lo leído, tal y como se va a guardar, y editable.
 *
 * Va aparte del diálogo por dos motivos y el segundo es el bueno: no tiene
 * estado propio —lo recibe todo— así que se puede pintar en una prueba sin
 * simular a nadie escribiendo, y es la parte donde una errata no la detecta ni
 * el linter ni el compilador, solo el ojo.
 */
export const RoutinePreview = ({ days, onRenameDay, onRemoveDay, onChangeExercise, onRemoveExercise }) => (
  <>
    {days.map((dia, di) => (
      <div className="col gap-3" key={dia.id}>
        <div className="row between wrap gap-3">
          {/* El nombre va en un campo y NO dentro del encabezado: un `<input>`
              metido en un `<h3>` deja de ser un encabezado para un lector de
              pantalla, y el proyecto ya tropezó una vez con eso al renombrar el
              equipo. */}
          <Field
            className="grow"
            label={`Día ${di + 1} de ${days.length}`}
            hint={`${dia.exercises.length} ejercicios · ${contarSeries(dia)} series`}
          >
            {(props) => (
              <input
                {...props}
                className="input input-sm"
                value={dia.name}
                onChange={(e) => onRenameDay(di, e.target.value)}
              />
            )}
          </Field>

          {/*
            Quitar un día entero es la corrección MÁS frecuente, porque el fallo
            típico de leer una hoja no es equivocarse en una celda: es traer de
            más —una pestaña que resultó tener dos tablas, un bloque de ejemplo
            de la plantilla—. Sin esto, la única salida era cancelar y volver a
            empezar eligiendo hojas a ciegas.
          */}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onRemoveDay(di)}
            title={`Quitar «${dia.name}» de lo que se va a crear`}
          >
            <Trash2 size={14} /> Quitar día
          </button>
        </div>

        {/* La tabla se desplaza dentro de su caja: seis columnas en el teléfono
            no caben, y lo que no puede pasar es que empuje el diálogo a lo
            ancho. */}
        <div className="table-scroll">
          <table className="table table-compact">
            <thead>
              <tr>
                <th>Ejercicio</th>
                <th className="num">Series</th>
                <th className="num">Objetivo</th>
                <th className="num">RIR</th>
                <th>Grupo muscular</th>
                <th aria-label="Quitar" />
              </tr>
            </thead>
            <tbody>
              {dia.exercises.map((ex, ei) => (
                <tr key={ex.id}>
                  <td>
                    {ex.name}
                    {ex.note && <div className="t-xs t-tertiary">{ex.note}</div>}
                  </td>
                  <td className="num">
                    <NumberInput
                      className="input-sm"
                      style={{ width: 52 }}
                      aria-label={`Series de ${ex.name}`}
                      value={ex.sets}
                      onChange={(v) => onChangeExercise(di, ei, { sets: v })}
                    />
                  </td>
                  {/* Un objetivo por serie, dicho sin repetirlo cinco veces:
                      «6-8 · 8-10» es la primera serie y las demás. Al escribir
                      encima pasa a valer para todas, que es lo que se espera de
                      un campo con un solo valor dentro. */}
                  <td className="num">
                    <input
                      className="input input-sm input-center"
                      style={{ width: 84 }}
                      aria-label={`Objetivo de repeticiones de ${ex.name}`}
                      value={objetivoVisible(ex)}
                      onChange={(e) => onChangeExercise(di, ei, { objetivo: e.target.value })}
                    />
                  </td>
                  <td className="num">
                    <input
                      className="input input-sm input-center"
                      style={{ width: 52 }}
                      aria-label={`RIR de ${ex.name}`}
                      value={ex.rir}
                      onChange={(e) => onChangeExercise(di, ei, { rir: e.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      className="select input-sm"
                      aria-label={`Grupo muscular de ${ex.name}`}
                      value={ex.muscle}
                      onChange={(e) => onChangeExercise(di, ei, { muscle: e.target.value })}
                    >
                      {MUSCLE_GROUPS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                    {!ex.muscleSure && ex.muscleRaw && (
                      <div className="t-xs t-tertiary">tu hoja decía «{ex.muscleRaw}»</div>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-icon"
                      aria-label={`Quitar ${ex.name}`}
                      onClick={() => onRemoveExercise(di, ei)}
                    >
                      <X size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    ))}
  </>
);

/**
 * Las pestañas de un libro, para elegir cuáles son la rutina.
 *
 * Cada una dice lo que trae dentro, y las que no traen nada no se pueden marcar:
 * enseñar quince pestañas iguales obligaría a abrirlas una a una para averiguar
 * cuál es el plan, que es exactamente el trabajo que esto viene a quitar.
 */
export const SheetPicker = ({ hojas, elegidas, onToggle }) => (
  <Field
    label="¿Qué hojas quieres traer?"
    hint="Puedes marcar varias: si tienes una pestaña por día, se traen todas de golpe."
  >
    <div className="col gap-2">
      {hojas.map((hoja, i) => (
        <Switch
          key={`${hoja.name}-${i}`}
          label={hoja.name}
          hint={resumenDeHoja(hoja)}
          checked={elegidas.includes(i)}
          disabled={hoja.lectura.days.length === 0}
          onChange={() => onToggle(i)}
        />
      ))}
    </div>
  </Field>
);

export const PasteRoutineDialog = ({
  targetDayName = null,
  unidad = 'semana',
  targetPreference = 0,
  onRememberTarget,
  onImportIntoDay,
  onImportDays,
  onClose,
}) => {
  const ficheroRef = useRef(null);

  const [texto, setTexto] = useState('');
  const [libro, setLibro] = useState(null);
  const [elegidas, setElegidas] = useState([]);
  const [abriendo, setAbriendo] = useState(false);
  const [fallo, setFallo] = useState(null);

  const [targetIndex, setTargetIndex] = useState(targetPreference);
  const [destino, setDestino] = useState(null);
  const [hojasAbiertas, setHojasAbiertas] = useState(false);
  const [edicion, setEdicion] = useState(null);

  /* Cada fuente nueva es una hoja distinta: lo corregido de la anterior no
     significa nada sobre esta. */
  const olvidarCorrecciones = () => {
    setEdicion(null);
    setDestino(null);
  };

  /*
    Se relee en cada tecla y no al pulsar un botón: pegar y ver es un solo gesto,
    y con un botón de por medio la mitad de la gente cree que no ha funcionado.
    Es un `split` sobre unos cientos de líneas.
  */
  const lectura = useMemo(() => {
    if (libro) {
      return mergeSheetReadings(
        [...elegidas].sort((a, b) => a - b).map((i) => ({ name: libro.hojas[i]?.name, reading: libro.hojas[i]?.lectura }))
      );
    }
    return parseRoutineSheet(texto);
  }, [libro, elegidas, texto]);

  const { format, days, targetChoices } = lectura;

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
  if (!edicion || edicion.origen !== lectura || edicion.objetivo !== targetIndex) {
    setEdicion({ origen: lectura, objetivo: targetIndex, dias: toEditableDays(days, targetIndex) });
  }
  const dias = edicion?.origen === lectura && edicion?.objetivo === targetIndex ? edicion.dias : [];

  const cambiarDias = (fn) => setEdicion((e) => ({ ...e, dias: fn(e.dias) }));
  const cambiarDia = (di, fn) =>
    cambiarDias((ds) => ds.map((d, i) => (i === di ? fn(d) : d)));

  const abrirFichero = async (file) => {
    if (!file) return;
    setFallo(null);
    setAbriendo(true);
    olvidarCorrecciones();

    try {
      if (isWorkbookFile(file.name)) {
        const hojas = await readWorkbook(await file.arrayBuffer());
        const conLectura = hojas.map((h) => ({ ...h, lectura: parseRoutineGrid(h.rows) }));
        setLibro({ nombre: file.name, hojas: conLectura });
        setTexto('');
        /* Marcadas de entrada las que traen algo Y están a la vista. En un libro
           de quince pestañas, dejarlas todas sin marcar convierte el acierto en
           trabajo; y marcar sola una que el entrenador tiene escondida sería
           traerle algo que ni sabe que existe. */
        const marcadas = conLectura
          .map((h, i) => (h.lectura.days.length && !h.hidden ? i : -1))
          .filter((i) => i >= 0);
        setElegidas(marcadas);
        /* Si no se ha podido marcar nada, la lista se abre sola: es el único
           caso en el que de verdad hay que elegir a mano. */
        setHojasAbiertas(marcadas.length === 0);
      } else {
        /* Un `.csv` o un `.tsv` es exactamente lo que entrega el portapapeles,
           así que entra por el mismo sitio y no necesita nada más. */
        setLibro(null);
        setElegidas([]);
        setTexto(await file.text());
      }
    } catch (error) {
      setLibro(null);
      setFallo(error?.message || 'No se ha podido abrir el fichero.');
    } finally {
      setAbriendo(false);
      /* Se limpia para que elegir DOS VECES el mismo fichero vuelva a disparar
         el `change`: si no, corregir la hoja y reintentar no hace nada. */
      if (ficheroRef.current) ficheroRef.current.value = '';
    }
  };

  /* Todo lo que se enseña y se crea sale de `dias`, la lista YA corregida: si
     alguien quita un día, el recuento y el botón bajan con él. Contar sobre lo
     leído era la razón de que el botón dijera «Crear 5 días» después de haber
     quitado uno. */
  const hayAlgo = dias.length > 0;
  const sinResolver = dias.flatMap((d) => d.exercises).filter((e) => !e.muscleSure).length;
  const totalEjercicios = dias.reduce((n, d) => n + d.exercises.length, 0);
  const totalSeries = dias.reduce((n, d) => n + contarSeries(d), 0);

  /*
    ══ Dónde aterriza ═════════════════════════════════════════════════════════

    Un solo día leído y un día abierto delante casi siempre significa «esto va
    aquí»; varios días leídos significa «móntame la semana». Se propone lo
    probable y se deja cambiar, en vez de preguntar siempre lo mismo.
  */
  const puedeAlDiaActual = Boolean(targetDayName) && dias.length === 1;
  const destinoEfectivo = destino ?? (puedeAlDiaActual ? 'actual' : 'nuevos');

  /* Las dos columnas de objetivo, dichas con sus valores de verdad: «8-10» y
     «10-12» se eligen mirándolos, no leyendo «primera» y «segunda». */
  const opcionesDeObjetivo = useMemo(() => {
    if (targetChoices < 2) return [];
    return Array.from({ length: targetChoices }, (_, i) => {
      const muestra = days
        .flatMap((d) => d.exercises)
        .map((e) => e.targetOptions[i]?.[0])
        .filter(Boolean);
      return { id: String(i), label: [...new Set(muestra)].slice(0, 3).join(' · ') || `Columna ${i + 1}` };
    });
  }, [days, targetChoices]);

  const confirmar = () => {
    /* Se crea EXACTAMENTE la tabla que hay delante: no hay una segunda lectura
       ni se vuelve a mirar el fichero. */
    const draft = aBorrador(dias);

    if (destinoEfectivo === 'actual') onImportIntoDay(draft[0].exercises);
    else onImportDays(draft);

    if (targetChoices > 1) onRememberTarget?.(targetIndex);
    onClose();
  };

  return (
    <Modal
      title="Traer una rutina"
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" disabled={!hayAlgo} onClick={confirmar}>
            {destinoEfectivo === 'actual'
              ? `Añadir a ${targetDayName}`
              : `Crear ${dias.length} ${dias.length === 1 ? 'día' : 'días'}`}
          </button>
        </>
      }
    >
      <div className="col gap-5">
        <input
          ref={ficheroRef}
          type="file"
          className="sr-only"
          accept={SPREADSHEET_ACCEPT}
          onChange={(e) => abrirFichero(e.target.files?.[0] || null)}
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
                onClick={() => ficheroRef.current?.click()}
              >
                Usar otro fichero
              </button>
            </div>

            {/*
              ══ El listado de hojas va PLEGADO ═══════════════════════════════

              Un libro de entrenamiento trae quince pestañas, y una lista de
              quince interruptores mide más que la pantalla: empuja la tabla de
              revisión tan abajo que quien la abre no llega a verla y cree que
              esto crea la rutina sin enseñar nada. Ese fue el diagnóstico exacto
              de la primera versión.

              Como las hojas con rutina vienen ya marcadas, el caso normal no
              necesita abrirlo: se lee el resumen y se pasa a revisar. Se abre
              solo cuando no se ha podido marcar nada, que es cuando de verdad
              hay que elegir a mano.
            */}
            <Fold
              icon={Layers}
              title="Hojas del libro"
              summary={`${elegidas.length} de ${libro.hojas.length} elegidas`}
              open={hojasAbiertas}
              onToggle={() => setHojasAbiertas((v) => !v)}
            >
              <SheetPicker
                hojas={libro.hojas}
                elegidas={elegidas}
                onToggle={(i) => {
                  olvidarCorrecciones();
                  setElegidas((prev) =>
                    prev.includes(i) ? prev.filter((n) => n !== i) : [...prev, i]
                  );
                }}
              />
            </Fold>
          </>
        ) : (
          <Field
            label="Pega aquí tu rutina"
            hint="No se guardan los kilos ni las repeticiones que ya estén anotadas: solo el plan."
          >
            {(props) => (
              <textarea
                {...props}
                className="textarea"
                rows={hayAlgo ? 4 : 8}
                value={texto}
                placeholder={EJEMPLO}
                onChange={(e) => {
                  setTexto(e.target.value);
                  olvidarCorrecciones();
                }}
              />
            )}
          </Field>
        )}

        {!libro && (
          <div className="row wrap gap-3">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => ficheroRef.current?.click()}
            >
              <FileSpreadsheet size={15} /> …o sube el fichero
            </button>
            <span className="t-xs t-tertiary">
              Vale un <strong>.xlsx</strong> con todas sus pestañas, o un .csv. El .xls de antes de
              2007 hay que guardarlo antes como .xlsx.
            </span>
          </div>
        )}

        {abriendo && <Loading label="Abriendo el fichero…" />}
        {fallo && <Notice tone="error">{fallo}</Notice>}

        {!libro && texto.trim() && !hayAlgo && (
          <Notice tone="warn">
            No he sabido encontrar ejercicios ahí. Comprueba que has copiado también la fila de
            cabecera —la que dice «Ejercicio», «Series», «Reps»—, que es por donde se orienta.
          </Notice>
        )}

        {libro && !hayAlgo && !abriendo && (
          <Notice tone="warn">
            Ninguna de las hojas marcadas trae una rutina que sepa leer. Marca otra, o abre la que
            quieras traer, cópiala y pégala aquí.
          </Notice>
        )}

        {hayAlgo && (
          <>
            <div className="row between wrap gap-3">
              <span className="t-sm t-secondary">
                <strong>{days.length}</strong> {days.length === 1 ? 'día' : 'días'} ·{' '}
                <strong>{totalEjercicios}</strong> ejercicios · <strong>{totalSeries}</strong> series
                {format === 'texto' && ' · leído como texto, sin grupos musculares'}
              </span>

              {puedeAlDiaActual && (
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

            {sinResolver > 0 && (
              <Notice tone="warn">
                {sinResolver === 1
                  ? 'Un ejercicio se ha quedado sin grupo muscular porque el de tu hoja no tiene equivalente aquí. Elígelo abajo.'
                  : `${sinResolver} ejercicios se han quedado sin grupo muscular porque el de tu hoja no tiene equivalente aquí. Elígelos abajo.`}
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
                cambiarDia(di, (d) => ({
                  ...d,
                  exercises: d.exercises.filter((_, i) => i !== ei),
                }))
              }
            />
          </>
        )}

        {!libro && !texto.trim() && (
          <p className="t-sm t-tertiary">
            Se entienden las dos formas habituales de escribir una rutina en una hoja: una columna
            con el número de series, o un bloque de columnas por serie. Si tu hoja no es ninguna de
            las dos, lo que salga aquí se puede corregir antes de crear nada.
          </p>
        )}
      </div>
    </Modal>
  );
};
