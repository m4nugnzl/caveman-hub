import { useState } from 'react';
import { Link2, Plus, Trash2, Video } from 'lucide-react';

import { MUSCLE_GROUPS, buildExercise, supersetLabels } from '@/domain/training';
import { clampInt } from '@/lib/num';
import { Autocomplete } from '@/components/ui/Autocomplete';
import { MenuAcciones } from '@/components/ui/MenuAcciones';
import { Modal } from '@/components/ui/Modal';
import { FichaEjercicio } from '@/components/Coach/Taller/FichaEjercicio';

/**
 * ESCRIBIR UNA HOJA: el banco donde se le meten los ejercicios.
 *
 * ══ Por qué no se escribe en la columna ════════════════════════════════════
 *
 * El alta vivía DENTRO de la tarjeta de la hoja, en la rejilla del bloque, y
 * ahí no cabía. Una columna del plan mide 168 px cuando hay seis hojas: el
 * buscador no tenía sitio para enseñar una sola sugerencia, el músculo y la
 * pauta bajaban cada uno a su renglón, y «Añadir / Listo» hacían un tercero.
 * Tres cosas que hacer en una caja del ancho de un dedo, con el formulario
 * empujando el resto de la rejilla hacia abajo mientras estuviera abierto.
 *
 * Y tenía un vicio peor: dejaba a la hoja peleando consigo misma. Con el alta
 * puesta, quitar el ejercicio que se acababa de escribir mal era ir a buscar
 * una papelera que solo aparecía al pasar por encima, en una fila de 30 px y
 * pegada a la pauta.
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
 * Arriba lo que se escribe, debajo lo que la hoja ya lleva. Se meten cinco
 * seguidos sin cerrar nada —el campo se vacía y vuelve a coger el foco— y
 * quitar uno es pulsar su papelera, que está siempre y tiene su sitio.
 *
 * ── Lo que NO hace ─────────────────────────────────────────────────────────
 * No propone ejercicios ni corrige la pauta: enseña la biblioteca del
 * entrenador y su catálogo, y el criterio lo pone él. La app resalta
 * información, no receta.
 */

const NUEVO = { name: '', muscle: 'Pecho', series: '3', reps: '8-10' };

export const EscribirHoja = ({
  dayName,
  exercises,
  library,
  nota = null,
  onAdd,
  onQuitar,
  onSeries,
  onReps,
  onRecordar,
  /* La gramática de serie: `(dayName, name, campos, options?)`. Enlazar con el
     anterior, el remate y el descanso se deciden aquí, que es donde se escribe. */
  onGramatica,
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
  /*
    ── LA PUERTA A LA FICHA, DESDE AQUÍ ──────────────────────────────────────
    El momento en que te das cuenta de que este ejercicio necesita tu
    explicación es MIENTRAS lo programas, no media hora antes administrando una
    lista — que es el mismo argumento con el que `catalog.js` explica por qué no
    hay pantalla de catálogo, aplicado al revés.

    Se abre la ficha del Taller tal cual, en una capa. No es una segunda
    pantalla de edición: es la misma, y por eso lo que se guarda aquí aparece
    allí sin nada que sincronizar.
  */
  const [fichaEditando, setFichaEditando] = useState(null);
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const enviar = (event) => {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    onAdd(
      buildExercise({
        name,
        muscle: form.muscle,
        numSets: clampInt(form.series, 1, 12, 3),
        targetReps: form.reps.trim(),
      })
    );
    onRecordar(name, form.muscle);
    /* El músculo y la pauta se quedan: quien mete cuatro de espalda a 3 × 8-10
       no quiere volver a elegirlos cuatro veces. */
    setForm((f) => ({ ...NUEVO, muscle: f.muscle, series: f.series, reps: f.reps }));
    setMetidos((n) => n + 1);
  };

  const series = exercises.reduce((n, ex) => n + ex.series, 0);
  /* A1/A2, derivado de la posición: enlazar o reordenar lo redibuja solo. */
  const marcasSS = supersetLabels(exercises);

  /* El foco solo se toma donde hay teclado físico. Es la misma regla que aplica
     `ui/Modal` al abrirse: en táctil, enfocar un campo levanta el teclado en
     pantalla encima de la hoja recién abierta, antes de haber podido leerla. */
  const conTeclado = typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches;

  return (
    /*
      Un solo botón principal en la superficie, y es «Añadir»: es el trabajo.
      Salir es «Listo» —también con Escape—, y al lado va el alcance de lo que
      se acaba de escribir.
    */
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
      <div className="escribir">
        <form className="escribir-alta" onSubmit={enviar}>
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
            inputProps={{ autoFocus: conTeclado, 'aria-label': `Nombre del ejercicio nuevo de ${dayName}` }}
          />

          <div className="escribir-alta-pie">
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

            <span className="escribir-pauta">
              <input
                className="plan-series"
                inputMode="numeric"
                value={form.series}
                aria-label="Número de series"
                onChange={(e) => set('series', e.target.value)}
              />
              <span className="plan-por" aria-hidden="true">
                ×
              </span>
              <input
                className="plan-reps"
                value={form.reps}
                aria-label="Repeticiones objetivo"
                placeholder="8-10"
                onChange={(e) => set('reps', e.target.value)}
              />
            </span>

            <button type="submit" className="btn btn-primary" disabled={!form.name.trim()}>
              <Plus size={15} /> Añadir
            </button>
          </div>
        </form>

        {/* Lo que la hoja lleva ya: es la mitad de la razón de abrir esto. Sin
            ello se escribe a ciegas y se repite el tercer ejercicio. */}
        <div className="escribir-cab">
          <span className="section-label">En la hoja</span>
          <span className="t-xs t-tertiary tnum">
            {exercises.length === 0
              ? 'nada todavía'
              : `${exercises.length} ${exercises.length === 1 ? 'ejercicio' : 'ejercicios'} · ${series} series`}
          </span>
        </div>

        {exercises.length === 0 ? (
          <p className="t-sm t-tertiary">
            «{dayName}» está en blanco. Lo que escribas arriba aparece aquí.
          </p>
        ) : (
          <ol className="escribir-lista">
            {exercises.map((ex, i) => (
              <li className={`escribir-ej${marcasSS[i] ? ' is-ss' : ''}`} key={ex.id}>
                {/* En superserie, el número de orden ES la etiqueta: A1, A2. */}
                <span className={`escribir-num${marcasSS[i] ? ' is-ss' : ''}`} aria-hidden="true">
                  {marcasSS[i] || i + 1}
                </span>
                <span className="escribir-say">
                  <span className="escribir-nombre">{ex.name}</span>
                  {ex.muscle && <span className="escribir-musculo">{ex.muscle}</span>}
                  {/*
                    ── Los verbos, detrás del menú ────────────────────────────
                    Estuvieron aquí, en la propia fila: enlazar, un desplegable
                    de remate y un campo de descanso, los tres seguidos debajo
                    del nombre. Tres controles de ancho distinto por fila, en seis filas, y la hoja dejaba de
                    leerse como una hoja para leerse como un formulario.

                    Lo que se ve siempre son las CIFRAS —series, reps y
                    descanso, que son el plan—; los verbos, que se usan en un
                    ejercicio de cada diez, viven en el menú de la fila. Es lo
                    que hace Coachway con su superserie y su drop set, y es la
                    misma ley de la casa: cada pieza hace un trabajo.
                  */}
                  {/* Aquí vivían las alternativas previstas («si está ocupada:
                      Hack squat»). Retiradas del producto el 9 sep 2026 por
                      decisión del dueño; ver `domain/training.js`. */}
                </span>
                {/*
                  ── Las cifras, cada una en su campo con su rótulo ──────────
                  Eran «3 × 8-10» pegados, dos casillas sin nombre separadas
                  por un aspa: había que saberse de memoria cuál era cuál, y el
                  descanso ni siquiera estaba aquí. Ahora son tres columnas
                  fijas —series, reps, descanso— con el rótulo dentro del
                  campo, así que la hoja se lee en vertical: todas las series
                  en la misma vertical, todas las reps en la siguiente.
                */}
                <span className="ejercicio-cifras">
                  <label className="cifra-campo">
                    <span className="cifra-campo-k">Series</span>
                    <input
                      className="cifra-campo-v"
                      inputMode="numeric"
                      defaultValue={ex.series}
                      key={`s-${ex.id}-${ex.series}`}
                      aria-label={`Series de ${ex.name}`}
                      onBlur={(e) => {
                        const n = clampInt(e.target.value, 1, 12, ex.series);
                        if (n !== ex.series) onSeries(dayName, ex.name, n, ex.series);
                        e.target.value = n;
                      }}
                    />
                  </label>
                  <label className="cifra-campo">
                    <span className="cifra-campo-k">Reps</span>
                    <input
                      className="cifra-campo-v"
                      defaultValue={ex.targetReps ?? ''}
                      key={`r-${ex.id}-${ex.targetReps}`}
                      placeholder={ex.targetReps === null ? 'varias' : '8-10'}
                      aria-label={`Repeticiones objetivo de ${ex.name}`}
                      onBlur={(e) => {
                        const reps = e.target.value.trim();
                        if (reps !== (ex.targetReps ?? '')) onReps(dayName, ex.name, reps);
                      }}
                    />
                  </label>
                  {onGramatica && (
                    <label className="cifra-campo">
                      <span className="cifra-campo-k">Descanso</span>
                      <input
                        className="cifra-campo-v"
                        inputMode="numeric"
                        defaultValue={ex.restSeconds ?? ''}
                        key={`d-${ex.id}-${ex.restSeconds ?? ''}`}
                        placeholder="seg"
                        aria-label={`Descanso entre series de , en segundos`}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          const n = v === '' ? null : clampInt(v, 5, 900, null);
                          if (n !== (ex.restSeconds ?? null)) {
                            onGramatica(dayName, ex.name, { restSeconds: n }, { immediate: false });
                          }
                          e.target.value = n ?? '';
                        }}
                      />
                    </label>
                  )}
                </span>
                {/*
                  El menú de la fila: los verbos que se usan de vez en cuando,
                  y el quitar. Sin `onGramatica` —la hoja de solo pauta— queda
                  la papelera sola, que es lo único que había antes.
                */}
                {onGramatica ? (
                  <MenuAcciones
                    ariaLabel={`Más acciones de ${ex.name}`}
                    clase="btn btn-icon btn-icon-compact"
                    items={[
                      i > 0 && {
                        label: ex.enlazado ? 'Soltar la superserie' : 'Enlazar con el anterior',
                        icon: Link2,
                        run: () => onGramatica(dayName, ex.name, { enlazado: !ex.enlazado }),
                      },
                      /* Tu vídeo y tus pautas: se escriben en la BIBLIOTECA, no
                         en esta hoja, así que valen para todos los clientes que
                         hagan este ejercicio. De ahí que el verbo no diga «en
                         este día». */
                      {
                        label: 'Ponerle tu vídeo y tus pautas',
                        icon: Video,
                        run: () => setFichaEditando(ex.name),
                      },
                      /*
                        ── EL REMATE NO SE PAUTA AQUÍ ──────────────────────
                        Estaban las cinco opciones —sin remate, bajada,
                        rest-pause, myo-reps, parciales— y ahí se acababa: una
                        palabra, sin cuántas bajadas ni cuánto se recorta.
                        Desde que la técnica lleva sus números cuelga de UNA
                        serie, y esta superficie no enseña las series: se pauta
                        en la hoja, en la fila que remata. Ver
                        `RemateDeLaSerie`. Dejar aquí la versión sin números
                        sería tener dos modelos del mismo dato, y el de aquí
                        pisaría al otro.
                      */
                      null,
                      { label: 'Quitar de la hoja', icon: Trash2, danger: true, run: () => onQuitar(dayName, ex.name) },
                    ]}
                  />
                ) : (
                  <button
                    type="button"
                    className="btn btn-icon btn-icon-compact btn-icon-danger"
                    aria-label={`Quitar ${ex.name}`}
                    onClick={() => onQuitar(dayName, ex.name)}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* La ficha del ejercicio, la misma del Taller. Se monta solo abierta y
          decide ella si se puede corregir: la regla de quién escribe en la
          biblioteca vive en el dominio (`canEditLibraryItem`) y esta hoja no
          tiene por qué aprenderla. */}
      {fichaEditando && (
        <Modal
          title={fichaEditando}
          size="side"
          onClose={() => setFichaEditando(null)}
        >
          <FichaEjercicio
            nombre={fichaEditando}
            lista={library}
            onCerrar={() => setFichaEditando(null)}
          />
        </Modal>
      )}
    </section>
  );
};
