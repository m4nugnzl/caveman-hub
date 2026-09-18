import { Fragment, useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, Link2, Plus, Quote, Trash2, Video, X, Zap } from 'lucide-react';

import { pautaComun, pautaHeredada } from '@/domain/blocks';
import {
  MUSCLE_GROUPS,
  buildExercise,
  rangoPautado,
  rematesDe,
  supersetLabels,
  tecnicaDeLaSerie,
  tecnicaFrase,
  tecnicaSpec,
} from '@/domain/training';
import { clampInt } from '@/lib/num';
import { useArrastreOrden } from '@/lib/useArrastreOrden';
import { Autocomplete } from '@/components/ui/Autocomplete';
import { BotonMas } from '@/components/ui/BotonMas';
import { Modal } from '@/components/ui/Modal';
import { FichaEjercicio } from '@/components/Coach/Taller/FichaEjercicio';
import { RemateDeLaSerie } from './RemateDeLaSerie';
import { camposDeLaHoja } from './TablaDeSeries';

/**
 * ESCRIBIR UNA HOJA: el banco donde se le meten los ejercicios.
 *
 * ══ Por qué no se escribe en la columna ════════════════════════════════════
 *
 * El alta vivía DENTRO de la tarjeta de la hoja, en la rejilla del bloque, y
 * ahí no cabía. Una columna del plan mide 168 px cuando hay seis hojas: el
 * buscador no tenía sitio para enseñar una sola sugerencia, el músculo y la
 * pauta bajaban cada uno a su renglón, y «Añadir / Listo» hacían un tercero.
 *
 * ══ Y por qué YA NO es una ventana ═════════════════════════════════════════
 *
 * Fue una Modal, y la Modal tapaba justo lo que informa el criterio: el cajón
 * de material —su gimnasio, su historial— quedaba detrás del velo mientras se
 * elegía el ejercicio, que es el único momento en que hace falta. Ahora la
 * hoja se escribe EN LA MESA: ocupa el sitio de la rejilla, con el material a
 * la izquierda y el margen a la derecha. Es el banco del bloque: una
 * superficie, no tres momentos.
 *
 * ══ LA HOJA ES UNA TABLA, Y SU FILA ES LA CABECERA DE SUS SERIES ═══════════
 *
 * (13 sep 2026. El diagnóstico, con la pantalla delante: la pauta de un
 * ejercicio se escribía en CUATRO sitios con tres gramáticas distintas.)
 *
 *   · el «+» de la biblioteca      → siempre 3 × 8-10, fijo
 *   · el alta de arriba            → «3 × 8-10» pegajoso, en un formulario
 *   · las cifras de la fila        → series, reps y descanso
 *   · una tabla detrás de un icono → los kilos, el RIR y el remate de CADA
 *                                     serie, que es lo único que no se podía
 *                                     escribir sin abrirla
 *
 * Los dos primeros se contradecían —lo que ponías en el alta no lo miraba el
 * «+»— y el cuarto, que es el que construye el plan de verdad, era el único
 * escondido. Un botón sin nombre, entre otros seis iguales, con un `title` de
 * sesenta caracteres.
 *
 * Ahora hay UNA tabla y dos alturas:
 *
 *   EJERCICIO                       SERIES   KG    REPS   RIR   DESC
 *   Extensiones tríceps               3      100   8-10    2    90 s   ← todas
 *     serie 1                               100     10     2           ← una
 *     serie 2                               100      8     2
 *     serie 3                                95      8     1
 *
 * Y con ella, tres leyes:
 *
 *   1. La casilla de la fila escribe TODAS las series (`onTodas`). Es el atajo
 *      que se usa el 90 % de las veces —«súbelo todo a 100»— y hasta ahora
 *      solo lo tenían las repeticiones. Cuando las series no dicen lo mismo, la
 *      casilla dice «varias» (`pautaComun`), que es la palabra que esta casa ya
 *      usaba para eso.
 *   2. El número de series ES la lista de series: poner un 4 hace aparecer la
 *      cuarta fila, quitar una fila baja el número. Eran dos mandos distintos
 *      para lo mismo, y uno de ellos estaba dentro del otro.
 *   3. Las columnas se deciden una vez para la HOJA —no dentro de una fila— y
 *      por eso los rótulos van arriba, una sola vez, en vez de dentro de cada
 *      casilla de cada renglón.
 *
 * ── Por qué esto no es una segunda `TablaDeSeries` ────────────────────────
 * El aviso de aquel fichero es contra dos MODELOS del mismo dato, que es lo que
 * pasó con el remate cuando se pautaba en dos sitios. El modelo aquí es el de
 * allí: los campos y sus formatos salen de `CAMPOS_PIDES` (vía
 * `camposDeLaHoja`), el remate es su mismo `RemateDeLaSerie` y lo escrito son
 * los mismos `ex.sets`. Lo que no se puede compartir es la REJILLA: allí la
 * tabla cuelga de un ejercicio que ya tiene su cabecera propia y su mitad de lo
 * hecho; aquí las series tienen que caer bajo las columnas de la fila de su
 * ejercicio, o no se lee como una tabla sino como dos.
 *
 * ── El gesto que la abre ──────────────────────────────────────────────────
 * Ni flecha ni icono: la fila se enciende y el verbo sale en azul («serie a
 * serie» / «plegar»), que es la ley de los gestos de la casa y lo mismo que
 * hacen las equivalencias de la dieta con «Usar». Plegada siempre al llegar
 * —seis tablas abiertas de golpe son una pantalla de scroll— y plegar no
 * esconde: el peso y el RIR de todas se leen en su columna, y la marca del
 * remate sigue en el renglón.
 *
 * ══ EL ALTA, AL PIE Y EN REPOSO APAGADA ════════════════════════════════════
 *
 * Era una caja hundida permanente ENCIMA del trabajo, con su propio buscador a
 * treinta centímetros del buscador de la biblioteca —los dos vacíos, en la
 * misma pantalla—. Ahora es «+ ejercicio» en azul al pie de la lista, que es
 * donde va a aparecer lo que se añada, y el formulario sale al pulsarlo. Es
 * exactamente lo que la dieta ya tiene resuelto en cada comida
 * (`MealCard`): un hecho se queda, una oferta se apaga.
 *
 * Y se queda sin las casillas de pauta: el ejercicio nuevo nace con la del
 * anterior de la hoja (`pautaHeredada`), la misma regla por la que entra el
 * «+» de la biblioteca.
 *
 * ── Lo que NO hace ─────────────────────────────────────────────────────────
 * No propone ejercicios ni corrige la pauta: enseña la biblioteca del
 * entrenador y su catálogo, y el criterio lo pone él. La app resalta
 * información, no receta.
 */

const NUEVO = { name: '', muscle: 'Pecho' };

/* Las dos columnas que son del EJERCICIO y no de una serie: cuántas veces se
   repite y cuánto se descansa entre medias. Van a los cantos de la banda de
   cifras —lo que se repite primero, lo que pasa después— y en las filas de las
   series se quedan vacías, que es lo que dice que no son suyas. */
const COL_SERIES = { key: 'series', label: 'series', mode: 'numeric', pista: '' };
const COL_DESCANSO = { key: 'restSeconds', label: 'desc', mode: 'numeric', pista: 'seg' };

export const EscribirHoja = ({
  dayName,
  exercises,
  library,
  nota = null,
  onAdd,
  onQuitar,
  /* Reordenar: `(dayName, name, delta)`, el mismo verbo que la rejilla del
     bloque. Sin él —una hoja que solo se lee— no salen ni el asa ni las
     flechas, que es la ley del reposo. */
  onMover = null,
  onSeries,
  /*
    `onTodas(dayName, name, campo, valor)` escribe un objetivo —`targetKg`,
    `targetReps`, `targetRir`— en TODAS las series del ejercicio. Es el verbo de
    la fila; el de una serie suelta es `onSerie`. Sustituye al viejo `onReps`,
    que hacía exactamente esto para un solo campo de los tres.
  */
  onTodas,
  onRecordar,
  /* La gramática de serie: `(dayName, name, campos, options?)`. Enlazar, la
     nota y el descanso se deciden aquí, que es donde se escribe. */
  onGramatica,
  /*
    ── LO QUE SE PAUTA SERIE A SERIE ─────────────────────────────────────────
    `onSerie(dayName, name, i, campo, valor)` escribe UN objetivo de UNA serie,
    y las otras tres son las que la tabla necesita para sostenerse: añadir,
    quitar y rematar. Sin ellas la fila no se despliega: es la ley del reposo,
    no un modo de solo lectura.
  */
  onSerie = null,
  onAnadirSerie = null,
  onQuitarSerie = null,
  onTecnica = null,
  /* Si el protocolo de esta persona programa por RIR, su columna sale puesta
     aunque esté vacía. Igual que en la hoja de Entreno: lo que hace es dejarla
     de entrada, nunca impedir que se pauten las otras. */
  showRir = false,
  /* La nota del ejercicio, si el protocolo de esta persona la lleva. Mismo
     campo y mismo destino que en la hoja de series (`coachNote`, dentro del
     plan): es la misma cosa escrita antes, no una segunda nota. */
  conNotas = false,
  onClose = null,
  /* Sin cabecera cuando quien la monta ya dice de qué hoja se trata —el
     compositor lo dice en su carril de hojas—: repetirlo sería el mismo
     rótulo dos veces en dos renglones seguidos. */
  conCabecera = true,
}) => {
  const [form, setForm] = useState(NUEVO);
  /* Cuántos van metidos en esta apertura. No es adorno: remonta el buscador
     —de ahí el `key`— y con él vuelve el `autoFocus`, que es lo que deja meter
     el siguiente sin tocar el ratón. Va aparte del número de ejercicios de la
     hoja a propósito: quitar uno no puede borrar lo que se esté tecleando. */
  const [metidos, setMetidos] = useState(0);
  /* Si el alta está puesta. En reposo no hay formulario, hay un verbo; la hoja
     en blanco es la excepción y hace falta: ahí el buscador no es una oferta,
     es el trabajo, y sin él la hoja recién creada no diría cómo se llena. */
  const [altaPuesta, setAltaPuesta] = useState(false);
  /*
    ── LA PUERTA A LA FICHA, DESDE AQUÍ ──────────────────────────────────────
    El momento en que te das cuenta de que este ejercicio necesita tu
    explicación es MIENTRAS lo programas, no media hora antes administrando una
    lista. Se abre la ficha del Taller tal cual, en una capa: no es una segunda
    pantalla de edición, es la misma, y por eso lo que se guarda aquí aparece
    allí sin nada que sincronizar.
  */
  const [fichaEditando, setFichaEditando] = useState(null);
  /* Qué fila tiene la nota desplegada sin haber escrito nada todavía. Las que
     ya tienen nota se pintan solas: una nota escrita no se esconde. */
  const [notaAbierta, setNotaAbierta] = useState(null);
  /* Qué filas tienen sus series a la vista. Lo que se guarda es la DECISIÓN
     —abierta o plegada— y nada más: plegada es el reposo, porque la fila ya
     dice lo que llevan dentro. */
  const [seriesAbiertas, setSeriesAbiertas] = useState({});
  /* Abrir a mano una columna de objetivo que esta hoja todavía no pauta. Es
     estado de PANTALLA y no dato: en cuanto se escribe el primer valor, la
     columna se sostiene sola y esto deja de importar. */
  const [aMano, setAMano] = useState({});
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  /* Las columnas se deciden sobre la HOJA entera y una sola vez: la tabla del
     tercer ejercicio y la del cuarto tienen que cuadrar. Misma lectura que en
     Entreno, y por eso vive en el dominio de la tabla. */
  const conSeries = Boolean(onSerie && onAnadirSerie && onQuitarSerie);
  const { campos, porPautar } = camposDeLaHoja(exercises, { showRir, aMano });
  /* La banda de cifras, de izquierda a derecha. Los objetivos van en el mismo
     orden que en la hoja de Entreno —kg, reps, rir— para que las dos superficies
     se lean igual; quien programa mira las dos el mismo rato. */
  const columnas = [COL_SERIES, ...campos, ...(onGramatica ? [COL_DESCANSO] : [])];

  /*
    ── Arrastrar por el asa, con el mismo mecanismo que el resto de la casa ──
    `useArrastreOrden` decide el destino por GEOMETRÍA y no por quién recibe el
    evento, funciona con el dedo (el `draggable` de HTML5 no existe en táctil) y
    desplaza la página al acercarse al canto. El manejador pasa por `onMover`
    con un `delta`, que es lo que entiende el compositor.
  */
  const orden = useArrastreOrden({
    onMove: (desde, hasta) => {
      const ex = exercises[desde];
      if (ex && onMover) onMover(dayName, ex.name, hasta - desde);
    },
    eje: 'y',
  });
  /* Con un solo ejercicio no hay nada que ordenar: ni asa ni flechas. */
  const seOrdena = Boolean(onMover) && exercises.length > 1;

  /** Alt + ↑/↓ sobre el asa: el camino exacto cuando ya sabes adónde va. */
  const conFlechas = (index) => (e) => {
    if (!e.altKey || !seOrdena) return;
    const delta = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
    if (delta === 0) return;
    const hasta = index + delta;
    if (hasta < 0 || hasta >= exercises.length) return;
    e.preventDefault();
    onMover(dayName, exercises[index].name, delta);
  };

  const enviar = (event) => {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    onAdd(buildExercise({ name, muscle: form.muscle, ...pautaHeredada(exercises) }));
    onRecordar(name, form.muscle);
    /* El músculo se queda: quien mete cuatro de espalda no quiere elegirlo
       cuatro veces. La pauta ya no está aquí — la hereda el ejercicio nuevo. */
    setForm((f) => ({ ...NUEVO, muscle: f.muscle }));
    setMetidos((n) => n + 1);
  };

  const series = exercises.reduce((n, ex) => n + ex.series, 0);
  /* A1/A2, derivado de la posición: enlazar o reordenar lo redibuja solo. */
  const marcasSS = supersetLabels(exercises);

  /* El foco solo se toma donde hay teclado físico. Es la misma regla que aplica
     `ui/Modal` al abrirse: en táctil, enfocar un campo levanta el teclado en
     pantalla encima de la hoja recién abierta, antes de haber podido leerla. */
  const conTeclado = typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches;

  /** El alta de un ejercicio: buscar o escribir uno nuevo, y su músculo. */
  const alta = (
    <form
      className="escribir-alta"
      onSubmit={enviar}
      /* Vacía y sin foco dentro se retira sola: es una oferta, y una oferta que
         no se apaga es mobiliario. Con algo escrito NO se va —ahí dentro está
         el trabajo a medias, y la lista de sugerencias vive fuera de este
         formulario: cerrarlo al pulsar una sería perder el clic—. */
      onBlur={(e) => {
        if (form.name.trim() || exercises.length === 0) return;
        if (e.currentTarget.contains(e.relatedTarget)) return;
        setAltaPuesta(false);
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || form.name.trim()) return;
        e.stopPropagation();
        setAltaPuesta(false);
      }}
    >
      <Autocomplete
        key={`nombre-${metidos}`}
        value={form.name}
        onChange={(value) => set('name', value)}
        items={library}
        /* La ficha del ejercicio (0094), en la lista: el equipamiento dice
           si eso existe en su gimnasio ANTES de elegirlo. */
        getMeta={(item) =>
          [item.muscle, item.equipment, item.fromCatalog ? 'del catálogo' : null]
            .filter(Boolean)
            .join(' · ')
        }
        onPick={(item) => setForm((f) => ({ ...f, name: item.name, muscle: item.muscle || f.muscle }))}
        placeholder="Busca un ejercicio o escribe uno nuevo"
        inputProps={{
          autoFocus: conTeclado && (altaPuesta || exercises.length === 0),
          'aria-label': `Nombre del ejercicio nuevo de ${dayName}`,
        }}
      />

      <select
        className="select"
        value={form.muscle}
        aria-label="Músculo principal"
        onChange={(e) => set('muscle', e.target.value)}
      >
        {MUSCLE_GROUPS.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>

      <button type="submit" className="btn btn-primary" disabled={!form.name.trim()}>
        <Plus size={15} /> Añadir
      </button>
    </form>
  );

  return (
    <section
      className="escribir-mesa"
      aria-label={`Escribir «${dayName}»`}
      onKeyDown={(e) => e.key === 'Escape' && onClose && onClose()}
    >
      {conCabecera && (
        <header className="escribir-mesa-cab">
          <div className="escribir-mesa-say">
            <span className="section-label">Escribiendo</span>
            <h3 className="escribir-mesa-titulo">{dayName}</h3>
          </div>
          {nota && <span className="t-xs t-tertiary escribir-mesa-nota">{nota}</span>}
          {onClose && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
              Listo
            </button>
          )}
        </header>
      )}

      {/* La rejilla de la hoja, declarada una vez: la cabecera, cada ejercicio y
          cada una de sus series se dibujan con este mismo reparto de columnas, y
          es lo único que hace que las cifras caigan en vertical. */}
      <div className="escribir" style={{ '--pauta-n': columnas.length }}>
        <div className="escribir-cab">
          <span className="section-label">En la hoja</span>
          {/*
            ── «+ kg» Y «+ rir» SON DE LA HOJA, NO DE UNA FILA ────────────────
            Estaban dentro de la fila desplegada, así que para decidir algo de
            las seis había que abrir una. Su lectura siempre fue de la hoja
            entera (`camposDeLaHoja`): es una tabla, y sus ejercicios han de
            cuadrar. Desaparecen en cuanto la columna existe.
          */}
          {conSeries && porPautar.length > 0 && (
            <span className="escribir-columnas">
              {porPautar.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  className="hoja-chapa"
                  title={`Pautar ${c.label === 'kg' ? 'el peso' : 'el RIR'} de cada serie en esta hoja`}
                  onClick={() => setAMano((v) => ({ ...v, [c.key]: true }))}
                >
                  + {c.label}
                </button>
              ))}
            </span>
          )}
          <span className="escribir-cuenta t-xs t-tertiary tnum">
            {exercises.length === 0
              ? 'nada todavía'
              : `${exercises.length} ${exercises.length === 1 ? 'ejercicio' : 'ejercicios'} · ${series} series`}
          </span>
        </div>

        {exercises.length === 0 ? (
          <p className="t-sm t-tertiary">
            «{dayName}» está en blanco. Lo que escribas aquí abajo aparece en esta lista.
          </p>
        ) : (
          <>
            {/*
              Los rótulos de las columnas, una vez para la hoja. Estuvieron
              DENTRO de cada casilla de cada renglón —«SERIES 3», «REPS 8-10»—
              porque entonces no había tabla que encabezar: eran tres campos
              sueltos. Ahora la hoja tiene columnas de verdad, con las series de
              cada ejercicio cayendo debajo, así que el rótulo se dice una vez y
              cada fila recupera catorce píxeles de alto.

              `aria-hidden` a propósito: cada casilla ya se nombra entera («kg
              que pides en todas las series de Press banca»), y una cabecera
              leída además sería el mismo dato dos veces.
            */}
            <div className="escribir-head" aria-hidden="true">
              <span />
              <span className="escribir-head-ej">Ejercicio</span>
              {columnas.map((c) => (
                <span key={c.key}>{c.label}</span>
              ))}
            </div>

            <ol
              className={`escribir-lista${orden.arrastrando !== null ? ' is-ordenando' : ''}`}
              ref={orden.carrilRef}
            >
              {exercises.map((ex, i) => {
                const notaDelEj = ex.coachNote ?? '';
                /* Sin `onGramatica` no hay dónde escribirla: la hoja de solo
                   pauta no toca el plan. */
                const conNota =
                  conNotas && Boolean(onGramatica) && (notaDelEj.length > 0 || notaAbierta === ex.id);
                const abierta = conSeries && Boolean(seriesAbiertas[ex.id]);
                /* Lo que hay dentro y las columnas no dicen: que alguna serie
                   no acaba donde acaban las otras. El peso y el RIR ya tienen la
                   suya, así que plegar no esconde nada más. */
                const remates = rematesDe(ex);
                return (
                  <li
                    /* En plantilla y no con un array de clases: `verify-styles`
                       solo sabe leer la cadena entrecomillada y la plantilla; una
                       clase que el verificador no ve es una clase que puede dejar
                       de existir en el CSS sin que nada lo diga. */
                    className={`escribir-ej${marcasSS[i] ? ' is-ss' : ''}${abierta ? ' is-abierta' : ''}${orden.arrastrando === i ? ' is-viajando' : ''}${orden.arrastrando !== null ? ' is-en-orden' : ''}${orden.destino === i && orden.arrastrando !== i ? ' is-drop-target' : ''}`}
                    key={ex.id}
                    {...(seOrdena ? orden.pieza(i) : {})}
                  >
                    {/* El asa: se agarra aquí y no en la fila entera, que son
                        cinco casillas y seis botones. Va en el margen. */}
                    {seOrdena && (
                      <button
                        type="button"
                        className="hoja-asa escribir-asa"
                        {...orden.asa(i)}
                        onKeyDown={conFlechas(i)}
                        aria-label={`Reordenar ${ex.name}. Alt y flechas para moverlo.`}
                        title="Arrastra para moverlo de sitio (o Alt + ↑/↓)"
                      >
                        <GripVertical size={13} />
                      </button>
                    )}
                    {/* En superserie, el número de orden ES la etiqueta: A1, A2. */}
                    <span className={`escribir-num${marcasSS[i] ? ' is-ss' : ''}`} aria-hidden="true">
                      {marcasSS[i] || i + 1}
                    </span>

                    <span className="escribir-say">
                      <span className="escribir-nombre">{ex.name}</span>
                      <span className="escribir-musculo">
                        {ex.muscle}
                        {remates.length > 0 && (
                          <span
                            className="plan-ej-remate"
                            title={remates
                              .map((r) => `serie ${r.serie}: ${tecnicaFrase(r.tecnica)}`)
                              .join(' · ')}
                          >
                            <Zap size={13} aria-hidden="true" />
                          </span>
                        )}
                        {/*
                          ── EL VERBO QUE ABRE LAS SERIES ────────────────────
                          Ni flecha ni icono en el carril: la fila se enciende y
                          el verbo sale en azul, que es la ley de los gestos de
                          la casa. En reposo no está —una oferta por fila, en
                          seis filas, es mobiliario— salvo en táctil, donde no
                          hay «acercarse».
                        */}
                        {conSeries && (
                          <button
                            type="button"
                            className="escribir-abrir"
                            aria-expanded={abierta}
                            aria-label={
                              abierta
                                ? `Plegar las series de ${ex.name}`
                                : `Pautar ${ex.name} serie a serie`
                            }
                            title={
                              abierta
                                ? 'Plegar las series'
                                : 'Pautar cada serie por separado: kilos, reps, RIR y remate'
                            }
                            onClick={() => setSeriesAbiertas((v) => ({ ...v, [ex.id]: !abierta }))}
                          >
                            {abierta ? 'plegar' : 'serie a serie'}
                          </button>
                        )}
                      </span>
                    </span>

                    {/*
                      ══ LA BANDA DE CIFRAS ════════════════════════════════════
                      Una casilla por columna de la hoja, todas iguales y todas
                      en la misma vertical. Lo que se escribe aquí vale para
                      TODAS las series del ejercicio; lo que cambia en una se
                      escribe en su fila, ahí debajo.
                    */}
                    {columnas.map((col) => {
                      if (col.key === 'series') {
                        return (
                          <input
                            /* La cifra va en la llave para que la casilla se
                               remonte cuando cambia por otro camino —quitar una
                               serie desde su propia fila—: es lo que mantiene a
                               las dos alturas contándose lo mismo. */
                            key={`series-${ex.series}`}
                            className="hoja-celda"
                            inputMode="numeric"
                            defaultValue={ex.series}
                            aria-label={`Cuántas series de ${ex.name}`}
                            onBlur={(e) => {
                              const n = clampInt(e.target.value, 1, 12, ex.series);
                              if (n !== ex.series) onSeries(dayName, ex.name, n);
                              e.target.value = n;
                            }}
                          />
                        );
                      }
                      if (col.key === 'restSeconds') {
                        return (
                          <input
                            key={`desc-${ex.restSeconds ?? ''}`}
                            className="hoja-celda"
                            inputMode="numeric"
                            defaultValue={ex.restSeconds ?? ''}
                            placeholder={col.pista}
                            aria-label={`Descanso entre series de ${ex.name}, en segundos`}
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              const n = v === '' ? null : clampInt(v, 5, 900, null);
                              if (n !== (ex.restSeconds ?? null)) {
                                onGramatica(dayName, ex.name, { restSeconds: n }, { immediate: false });
                              }
                              e.target.value = n ?? '';
                            }}
                          />
                        );
                      }
                      /*
                        Un objetivo de serie, leído sobre todas: la cifra si
                        coinciden (`pautaComun`) y, si no, lo que resume el
                        desacuerdo sin esconderlo — los extremos en los campos
                        numéricos («100–80»), que es justo lo que hay que saber
                        de una pirámide, y «varias» donde un rango sería mentira:
                        entre «8-10» y «5» no hay término medio.
                      */
                      const comun = pautaComun(ex, col.key);
                      const vacia = comun === '' && col.opcional;
                      const dispar =
                        col.mode === 'text' ? 'varias' : rangoPautado(ex, col.key) || 'varias';
                      return (
                        <input
                          key={`${col.key}-${comun ?? dispar}`}
                          className={`hoja-celda${vacia ? ' is-vacia' : ''}`}
                          inputMode={col.mode}
                          defaultValue={comun ?? ''}
                          placeholder={comun === null ? dispar : col.pista}
                          aria-label={`${col.label} de todas las series de ${ex.name}`}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v === (comun ?? '')) return;
                            onTodas(dayName, ex.name, col.key, v);
                          }}
                        />
                      );
                    })}

                    {/*
                      ══ EL CARRIL DE VERBOS, EN TRES TRABAJOS ═════════════════
                      Botones de la misma escala, siempre a la vista y siempre en
                      el mismo orden — nada de un «···» que los esconda, que es
                      ley del dueño. Lo que sí hacen ahora es agruparse: construir
                      │ ordenar │ quitar, separados por un filete. Eran siete
                      puntos grises idénticos seguidos y se recorrían de uno en
                      uno; son tres trabajos, y así se leen de un vistazo.

                      El de las series se fue: ya es el verbo azul de la fila.
                    */}
                    <span className="escribir-acciones">
                      <span className="escribir-verbos">
                        {onGramatica && i > 0 && (
                          <button
                            type="button"
                            className="btn btn-icon btn-icon-compact"
                            aria-pressed={Boolean(ex.enlazado)}
                            title={
                              ex.enlazado
                                ? `Soltar la superserie: ${ex.name} deja de ir enlazado con el anterior`
                                : `Enlazar ${ex.name} con el anterior en superserie`
                            }
                            aria-label={
                              ex.enlazado
                                ? `Soltar la superserie de ${ex.name}`
                                : `Enlazar ${ex.name} con el anterior`
                            }
                            onClick={() => onGramatica(dayName, ex.name, { enlazado: !ex.enlazado })}
                          >
                            <Link2 size={15} />
                          </button>
                        )}
                        {/*
                          ── LA NOTA, QUE ES DE ESTA PERSONA ──────────────────
                          No confundirla con la del vídeo: aquella se escribe en
                          la biblioteca y vale para todos los clientes que hagan
                          el ejercicio; esta es la corrección para ESTE, en ESTE
                          bloque («el codo pegado al cuerpo»).
                        */}
                        {conNotas && onGramatica && !conNota && (
                          <button
                            type="button"
                            className="btn btn-icon btn-icon-compact"
                            title={`Escribirle una nota al cliente sobre ${ex.name}`}
                            aria-label={`Escribirle una nota al cliente sobre ${ex.name}`}
                            onClick={() => setNotaAbierta(ex.id)}
                          >
                            <Quote size={15} />
                          </button>
                        )}
                        {/* Tu vídeo y tus pautas: se escriben en la BIBLIOTECA, no
                            en esta hoja, así que valen para todos los clientes que
                            hagan este ejercicio. */}
                        <button
                          type="button"
                          className="btn btn-icon btn-icon-compact"
                          title={`Ponerle tu vídeo y tus pautas a ${ex.name}`}
                          aria-label={`Ponerle tu vídeo y tus pautas a ${ex.name}`}
                          onClick={() => setFichaEditando(ex.name)}
                        >
                          <Video size={15} />
                        </button>
                      </span>

                      {/* Subir y bajar: la otra mitad del arrastre. Es el camino
                          exacto cuando ya sabes adónde va, y el único que existe
                          para quien no puede arrastrar. */}
                      {seOrdena && (
                        <span className="escribir-verbos">
                          <button
                            type="button"
                            className="btn btn-icon btn-icon-compact"
                            disabled={i === 0}
                            title={`Subir ${ex.name}`}
                            aria-label={`Subir ${ex.name}`}
                            onClick={() => onMover(dayName, ex.name, -1)}
                          >
                            <ArrowUp size={15} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-icon btn-icon-compact"
                            disabled={i === exercises.length - 1}
                            title={`Bajar ${ex.name}`}
                            aria-label={`Bajar ${ex.name}`}
                            onClick={() => onMover(dayName, ex.name, 1)}
                          >
                            <ArrowDown size={15} />
                          </button>
                        </span>
                      )}

                      <span className="escribir-verbos">
                        <button
                          type="button"
                          className="btn btn-icon btn-icon-compact btn-icon-danger"
                          title={`Quitar ${ex.name} de la hoja`}
                          aria-label={`Quitar ${ex.name} de la hoja`}
                          onClick={() => onQuitar(dayName, ex.name)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </span>
                    </span>

                    {/* La nota, en su propio renglón y a la altura del nombre: es
                        un texto para leer, no una cifra más de la fila. Vacía y sin
                        foco se retira sola al salir, para no dejar un hueco por
                        haber pulsado el verbo sin querer. */}
                    {conNota && (
                      <label className="escribir-nota">
                        <span className="section-label">Nota para el cliente</span>
                        <textarea
                          className="textarea"
                          rows={2}
                          autoFocus={notaAbierta === ex.id && notaDelEj.length === 0}
                          placeholder="La verá junto al ejercicio. Ej: el codo pegado al cuerpo."
                          value={notaDelEj}
                          onChange={(e) =>
                            onGramatica(dayName, ex.name, { coachNote: e.target.value }, { immediate: false })
                          }
                          onBlur={() => !notaDelEj.trim() && setNotaAbierta(null)}
                        />
                      </label>
                    )}

                    {/*
                      ══ LAS SERIES, EN LAS COLUMNAS DE SU EJERCICIO ═══════════
                      Cada una en su renglón y con la misma rejilla que la fila de
                      arriba: los kilos de la serie 2 caen debajo de los kilos de
                      todas. Sin sangrar la rejilla —eso descuadraría las cifras,
                      que es lo único que hay que comparar—: lo que las ata a su
                      ejercicio es el filete de la izquierda y su rótulo.
                    */}
                    {abierta && (
                      <div className="escribir-series">
                        {(ex.sets || []).map((serie, s) => {
                          const etiqueta = `${ex.name}, serie ${s + 1}`;
                          const remate = tecnicaDeLaSerie(ex, s);
                          return (
                            <Fragment key={s}>
                              <div className={`escribir-serie${remate ? ' is-remate' : ''}`}>
                                <span aria-hidden="true" />
                                <span className="escribir-serie-n">serie {s + 1}</span>
                                {columnas.map((col) =>
                                  col.key === 'series' || col.key === 'restSeconds' ? (
                                    /* Ni las series ni el descanso son de una
                                       serie: su columna se queda vacía aquí, y
                                       ese hueco es lo que lo dice. */
                                    <span key={col.key} aria-hidden="true" />
                                  ) : (
                                    <input
                                      key={col.key}
                                      type="text"
                                      className={`hoja-celda${col.opcional && String(serie[col.key] ?? '') === '' ? ' is-vacia' : ''}`}
                                      inputMode={col.mode}
                                      value={serie[col.key] ?? ''}
                                      placeholder={col.pista}
                                      aria-label={`${etiqueta}: ${col.label} que pides`}
                                      onChange={(e) => onSerie(dayName, ex.name, s, col.key, e.target.value)}
                                    />
                                  )
                                )}
                                <span className="escribir-serie-verbos">
                                  {onTecnica && (
                                    <RemateDeLaSerie
                                      tecnica={remate}
                                      etiqueta={etiqueta}
                                      onCambio={(t) => onTecnica(dayName, ex.name, s, t)}
                                    />
                                  )}
                                  <button
                                    type="button"
                                    className="hoja-x"
                                    disabled={(ex.sets || []).length <= 1}
                                    aria-label={`Quitar ${etiqueta}`}
                                    title="Quitar serie"
                                    onClick={() => onQuitarSerie(dayName, ex.name, s)}
                                  >
                                    <X size={13} />
                                  </button>
                                </span>
                              </div>
                              {/* El remate se dibuja donde pasa: colgando de su
                                  serie, con sus números y las mismas palabras
                                  que verá el cliente. */}
                              {remate && (
                                <p className="hoja-remate escribir-remate" title={tecnicaSpec(remate.id)?.ayuda}>
                                  <span className="hoja-remate-corchete" aria-hidden="true" />
                                  {tecnicaFrase(remate)}
                                </p>
                              )}
                            </Fragment>
                          );
                        })}
                        <button
                          type="button"
                          className="hoja-mas escribir-mas-serie"
                          onClick={() => onAnadirSerie(dayName, ex.name)}
                        >
                          <Plus size={13} /> serie
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </>
        )}

        {/* El alta, al pie: donde va a aparecer lo que se añada. */}
        <div className="escribir-pie">
          {altaPuesta || exercises.length === 0 ? (
            alta
          ) : (
            <BotonMas
              palabra="ejercicio"
              onClick={() => setAltaPuesta(true)}
              title={`Añadir un ejercicio a «${dayName}»`}
            />
          )}
        </div>
      </div>

      {/* La ficha del ejercicio, la misma del Taller. Se monta solo abierta y
          decide ella si se puede corregir: la regla de quién escribe en la
          biblioteca vive en el dominio (`canEditLibraryItem`) y esta hoja no
          tiene por qué aprenderla. */}
      {fichaEditando && (
        <Modal title={fichaEditando} size="side" onClose={() => setFichaEditando(null)}>
          <FichaEjercicio
            nombre={fichaEditando}
            lista={library}
            editandoAlAbrir
            onCerrar={() => setFichaEditando(null)}
          />
        </Modal>
      )}
    </section>
  );
};
