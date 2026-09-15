import { useEffect, useMemo, useRef, useState } from 'react';
import { Play } from 'lucide-react';

import { parseVideoUrl } from '@/domain/video';
import { marcasDeEjercicio } from '@/domain/sessions';
import { metricColor } from '@/domain/metrics';
import { localeNumber, shortDate, todayISO } from '@/lib/dates';
import { Modal } from '@/components/ui/Modal';
import { VideoEmbed } from '@/components/ui/VideoEmbed';
import { Sparkline } from '@/components/ui/charts';
import { SegmentedControl } from '@/components/ui/primitives';

/**
 * LA FICHA DEL EJERCICIO, COMO LA VE QUIEN LO HACE.
 *
 * ══ Una puerta, y detrás todo ══════════════════════════════════════════════
 *
 * Se abre desde la marca del renglón (`MarcaFicha` en `ExerciseList`) y nunca
 * sola: es la mitad «si quiere» del encargo. Quien no la toca ve la pantalla de
 * siempre, y el renglón no crece ni una línea por existir esto.
 *
 * ══ Las dos capas, en el orden en que hacen falta ═══════════════════════════
 *
 * Las mismas de la ficha del entrenador (`Taller/FichaEjercicio`), pero al revés
 * de prioridad, porque quien está delante de la máquina no viene a estudiar el
 * ejercicio:
 *
 *   1. **Su vídeo.** Cómo lo hace SU entrenador. Primero, porque es lo que se
 *      viene a ver.
 *   2. **Sus pautas.** La frase que le dice siempre. Se lee sin pulsar nada más
 *      —el vídeo hay que verlo, esto se lee de un tirón— y en la práctica es lo
 *      más útil de la pantalla: el vídeo se mira dos semanas, la frase vale
 *      siempre.
 *   3. **Qué es**, del catálogo. Referencia y en voz baja: no es de su
 *      entrenador, así que no compite con lo que sí lo es.
 *
 * ── Lo que NO entra aquí: las alternativas ─────────────────────────────────
 * Ya no existen. Se imprimían en el renglón («si está ocupada: Hack squat») y se
 * retiraron del producto el 9 sep 2026: con qué se cambia un ejercicio es
 * criterio del entrenador en el momento, no una lista escrita de antemano.
 *
 * ── Y por qué el vídeo no se pinta de golpe ────────────────────────────────
 * `VideoEmbed` monta el iframe al pulsar y no al abrir (ver su cabecera): medio
 * mega de YouTube y sus cookies solo los paga quien decide mirar. Esto se abre
 * en el móvil de una persona, con sus datos, dentro de un gimnasio.
 *
 * ── Sin contexto, como el resto de las vistas del portal ───────────────────
 * La ficha llega entera por props: las dos capas ya vienen unidas desde
 * `ClientRoutineRoute`, que es el sitio donde este portal conecta el contexto
 * con las vistas. Aquí no se busca nada.
 *
 * @param nombre  Cómo se llama el ejercicio en SU hoja, que es el título.
 * @param ficha   `{ videoUrl, cue, muscle, equipment, description }`. Las dos
 *   primeras son de su entrenador (0100); las tres últimas, del catálogo.
 */
/**
 * El CUERPO de la ficha, sin diálogo alrededor.
 *
 * Se saca aparte porque lo pinta un segundo sitio: la ficha del ENTRENADOR, en
 * la Librería, lo usa como espejo —«lo que ve tu cliente»— mientras escribe el
 * enlace y las pautas. Y un espejo que se construya aparte deja de ser un
 * espejo a la primera vez que uno de los dos cambie: sería otra pantalla
 * parecida, que es exactamente lo que un espejo no puede ser.
 *
 * @param vivo  Cuando el que mira es el entrenador y esto es una vista previa
 *   de lo que todavía está escribiendo. Cambia una sola cosa —el vacío deja de
 *   ser silencio y pasa a ser una invitación—, porque en el móvil del cliente
 *   una ficha sin nada no se abre, y en la Librería sí.
 *
 * @param edicion  `{ videoUrl, onVideoUrl, cue, onCue, error }`. Cuando viene,
 *   el espejo además SE ESCRIBE: el enlace se teclea donde va a salir el vídeo
 *   y la pauta se teclea donde el cliente la va a leer.
 *
 *   ══ Por qué se escribe aquí y no en dos campos al lado ═══════════════════
 *
 *   Porque es la ley que la otra mitad de la Librería ya cumple: la etiqueta
 *   nutricional de un alimento tuyo ES el editor —la cifra es la casilla, misma
 *   posición y misma tipografía—, y en ejercicios seguían siendo dos cajas de
 *   formulario con su rótulo, su ayuda y su borde, enfrente de un espejo que se
 *   miraba pero no se tocaba. Dos gramáticas para la misma cosa en la misma
 *   pantalla: escribías en un sitio y comprobabas en otro.
 *
 *   Con esto la ficha del ejercicio y la del alimento vuelven a ser el mismo
 *   mueble, y el gesto es el de la casa: sin caja hasta que lo tocas.
 *
 *   ── Y el portal del cliente no se entera ────────────────────────────────
 *   `edicion` es opcional y nace nulo. Sin él, esto es exactamente lo que era,
 *   que es lo que hace que el espejo siga siendo un espejo.
 */
export const CuerpoFichaEjercicio = ({ nombre, ficha, vivo = false, edicion = null }) => {
  const escribe = Boolean(edicion);
  const video = parseVideoUrl(ficha?.videoUrl || '');
  const pautas = String(ficha?.cue || '').trim();
  const queEs = String(ficha?.description || '').trim();
  const pautaRef = useRef(null);

  /*
    ── La caja de la pauta crece con lo escrito ────────────────────────────
    Y aquí no es comodidad, es la fidelidad del espejo: en el móvil la pauta se
    lee ENTERA, envolviendo en las líneas que haga falta. Con un `input` de una
    línea, una pauta de dos se veía cortada («…cierra un dedo el a») en el único
    sitio del producto que existe para enseñar lo que el otro ve. Un espejo que
    recorta no es un espejo.

    Es el mismo gesto que ya hace la nota de la dieta (`DietNotes`); si algún
    día uno de los dos cambia, cambia por el mismo motivo.
  */
  useEffect(() => {
    const el = pautaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [edicion?.cue]);

  /* ── El material se ha ido de aquí también ──────────────────────────────
     Era «Abdominales · Barra». El dueño lo tumbó dos veces en la Librería
     —«material y con qué se cambia en ejercicios no me gusta tenerlo»— y aquí
     además no servía a nadie: quien lee esto está delante de la máquina. Queda
     el músculo, que sí sitúa. */
  const situacion = String(ficha?.muscle || '').trim();

  /* Escribiendo no hace falta decir que está vacío: los dos huecos de abajo ya
     son la invitación, y con su forma. */
  if (vivo && !escribe && !video && !pautas && !queEs) {
    return (
      <p className="t-sm t-tertiary">
        Todavía no ve nada tuyo. Pega el enlace de tu vídeo o escribe una pauta y aparecerá aquí.
      </p>
    );
  }

  return (
    <div className="col gap-4">
      {/* El músculo, en una línea gris: sitúa el ejercicio sin gastar una
          sección entera. */}
      {situacion && <p className="t-xs t-tertiary">{situacion}</p>}

      {escribe ? (
        <div className="col gap-2">
          {/* Con enlace bueno, lo que sale es la fila de verdad —la misma que
              va a pulsar el cliente—, y el enlace baja a una línea callada
              debajo: ya no es lo que hay que mirar, es lo que hay que poder
              corregir. Sin enlace, el hueco tiene la FORMA de esa fila y el
              enlace se teclea dentro: se escribe donde va a aparecer. */}
          {video ? (
            <>
              <VideoEmbed video={video} title={nombre} label="Cómo lo hace tu entrenador" />
              <input
                type="url"
                inputMode="url"
                className="espejo-enlace"
                value={edicion.videoUrl}
                onChange={(e) => edicion.onVideoUrl(e.target.value)}
                placeholder="https://youtu.be/…"
                aria-label="El enlace de tu vídeo"
                aria-invalid={edicion.error ? 'true' : undefined}
              />
            </>
          ) : (
            <div className={`espejo-hueco${edicion.error ? ' es-mal' : ''}`}>
              <span className="mark" aria-hidden="true">
                <Play size={13} fill="currentColor" />
              </span>
              <input
                type="url"
                inputMode="url"
                className="espejo-enlace grow"
                value={edicion.videoUrl}
                onChange={(e) => edicion.onVideoUrl(e.target.value)}
                placeholder="Pega aquí el enlace de tu vídeo"
                aria-label="El enlace de tu vídeo"
                aria-invalid={edicion.error ? 'true' : undefined}
              />
            </div>
          )}
          {edicion.error && <p className="espejo-mal">{edicion.error}</p>}
        </div>
      ) : (
        video && <VideoEmbed video={video} title={nombre} label="Cómo lo hace tu entrenador" />
      )}

      {escribe ? (
        <section className="col gap-2">
          <p className="section-label">Las pautas de tu entrenador</p>
          <textarea
            ref={pautaRef}
            rows={1}
            className="ficha-cli-pauta espejo-pauta"
            value={edicion.cue}
            onChange={(e) => edicion.onCue(e.target.value)}
            placeholder="Que no rebote; si el hombro molesta, cierra un dedo el agarre"
            aria-label="Las pautas que le repites"
          />
        </section>
      ) : (
        pautas && (
          <section className="col gap-2">
            <p className="section-label">Las pautas de tu entrenador</p>
            <p className="ficha-cli-pauta">{pautas}</p>
          </section>
        )
      )}

      {queEs && (
        <section className="col gap-2">
          <p className="section-label">Qué es</p>
          <p className="t-sm t-secondary">{queEs}</p>
        </section>
      )}
    </div>
  );
};

/**
 * LA FICHA, CON SUS CUATRO TRAMOS. (`M-03`)
 *
 * ══ El orden es el de quien está delante de la máquina ═════════════════════
 *
 *   1. **Cómo** — el vídeo de su entrenador y sus pautas. Es a lo que se entra.
 *   2. **Lo que hiciste** — sesión a sesión, fechado. Cruza bloques: el de
 *      agosto sigue ahí.
 *   3. **Tu nota** — la de hoy y las anteriores.
 *   4. **Tu marca** — peso máximo, repeticiones máximas y tonelaje.
 *
 * ══ Dos de los cuatro no son un cálculo: son una PUERTA ════════════════════
 *
 * `previousSetsBefore` y `bestSetsBefore` ya recorren todos los microciclos del
 * programa indexando por nombre de ejercicio, y ya corren mientras se entrena.
 * Ese histórico completo se estaba enseñando solo como el número gris de dentro
 * del campo. Lo que faltaba era poder mirarlo.
 *
 * ══ Y ninguno de los cuatro propone nada ═══════════════════════════════════
 *
 * No hay «te toca subir a 35», ni un 1RM estimado que perseguir. La aplicación
 * resalta información; el criterio es del entrenador. Ver `la app no receta`.
 *
 * ══ Por qué los tramos son un `SegmentedControl` ═══════════════════════════
 *
 * Porque es el conmutador de la casa y ya está en once sitios. Cuatro pestañas
 * dibujadas a mano dentro de una hoja serían una gramática nueva para el mismo
 * gesto — que es justo el «tiene dos de todo» del que se viene.
 *
 * @param ejercicio  El ejercicio YA FUSIONADO con la sesión (`mergePlanWithSession`):
 *   su id, su nombre, sus series de hoy y su `clientNote`. Hace falta el id y no
 *   solo el nombre porque la nota cuelga de esta entrada de la sesión.
 * @param historial  `historialDeEjercicio(...)`, de hoy hacia atrás. Lo calcula
 *   la hoja: aquí no se busca nada, como en el resto del portal.
 * @param puedeAnotar  Si esta sesión admite escritura (existe y no es heredada).
 *   Sin ella, «Tu nota» enseña las anteriores y no ofrece campo: un campo que no
 *   guarda es peor que no tenerlo.
 * @param onNota  `(texto)` — guarda la nota de ESTE ejercicio.
 */
export const FichaEjercicioCliente = ({
  ejercicio,
  ficha,
  historial = [],
  puedeAnotar = false,
  onNota = null,
  onClose,
}) => {
  const [tramo, setTramo] = useState('como');
  const nombre = ejercicio?.name || '';

  /* Lo de su entrenador: solo hay tramo «Cómo» si hay algo que enseñar. Y si no
     lo hay, tampoco se abre ahí — se abre en lo que sí tiene contenido. */
  const hayComo = Boolean(ficha?.videoUrl || String(ficha?.cue || '').trim() || ficha?.description);
  const marcas = useMemo(() => marcasDeEjercicio(historial), [historial]);

  /*
    ── La progresión: la serie más pesada de cada día, en orden ──────────────
    `historial` llega de hoy hacia atrás (lo pide la lista de «Lo que hiciste»,
    que se lee empezando por lo último), así que aquí se le da la vuelta: una
    curva que va del presente al pasado sube cuando se baja.

    Los días sin ningún kilo anotado —un ejercicio a peso corporal, o una serie
    apuntada solo con repeticiones— se caen. Pintarlos como cero sería dibujar
    un desplome que no ocurrió.
  */
  const progresion = useMemo(
    () =>
      [...historial]
        .reverse()
        .map((dia) => {
          const kgs = dia.sets.map((s) => Number(s.kg)).filter((n) => Number.isFinite(n) && n > 0);
          return kgs.length > 0 && dia.date ? { date: dia.date, value: Math.max(...kgs) } : null;
        })
        .filter(Boolean),
    [historial]
  );
  /* Las notas anteriores son las del histórico, sin la de hoy: la de hoy está
     en el campo, y decirla dos veces haría dudar de si son dos. */
  const notasAntes = historial.filter((d, i) => d.nota && !(i === 0 && esDeHoy(d)));

  const tramos = [
    hayComo ? { id: 'como', label: 'Cómo' } : null,
    { id: 'hiciste', label: 'Lo que hiciste' },
    { id: 'nota', label: 'Tu nota' },
    { id: 'marca', label: 'Tu marca' },
  ].filter(Boolean);

  const abierto = tramos.some((t) => t.id === tramo) ? tramo : tramos[0].id;

  return (
    <Modal title={nombre} onClose={onClose} size="side">
      <div className="col gap-4">
        <SegmentedControl
          ancho
          label="Tramos del ejercicio"
          value={abierto}
          onChange={setTramo}
          options={tramos}
        />

        {abierto === 'como' && <CuerpoFichaEjercicio nombre={nombre} ficha={ficha} />}

        {abierto === 'hiciste' && (
          historial.length === 0 ? (
            <p className="t-sm t-tertiary">
              Todavía no has anotado ninguna serie de este ejercicio. En cuanto lo hagas, aquí
              tendrás todas las veces que lo has hecho.
            </p>
          ) : (
            <div className="col gap-3">
              {historial.map((dia, i) => (
                <div className="ficha-dia" key={`${dia.weekNumber}:${dia.date}:${i}`}>
                  <span className="f">
                    {[dia.date ? shortDate(dia.date) : null, `semana ${dia.weekNumber}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  <span className="sets">
                    {dia.sets.map((set, j) => (
                      <span className="set" key={j}>
                        {set.kg ? `${set.kg} × ${set.reps}` : `${set.reps} reps`}
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          )
        )}

        {abierto === 'nota' && (
          <div className="col gap-3">
            {puedeAnotar && onNota ? (
              <label className="col gap-2">
                <span className="section-label">Lo que quieras recordar</span>
                <textarea
                  className="textarea"
                  rows={3}
                  placeholder="Ej: bajé el peso en la última, el hombro derecho iba justo."
                  value={ejercicio?.clientNote ?? ''}
                  onChange={(e) => onNota(e.target.value)}
                />
                {/* Dónde acaba, dicho aquí: una nota que no se sabe quién lee se
                    escribe distinta. */}
                <span className="t-xs t-tertiary">
                  La lee tu entrenador, encima de tus series de este ejercicio.
                </span>
              </label>
            ) : (
              <p className="t-sm t-tertiary">
                Podrás escribir aquí en cuanto anotes tu primera serie de este ejercicio.
              </p>
            )}

            {notasAntes.map((dia, i) => (
              <div className="ficha-dia es-nota" key={`${dia.date}:${i}`}>
                <span className="f">{dia.date ? shortDate(dia.date) : `semana ${dia.weekNumber}`}</span>
                <p>{dia.nota}</p>
              </div>
            ))}
          </div>
        )}

        {abierto === 'marca' && (
          marcas.maxKg === null && marcas.maxReps === null ? (
            <p className="t-sm t-tertiary">
              Tu marca aparecerá aquí cuando tengas series anotadas de este ejercicio.
            </p>
          ) : (
            <div className="col gap-3">
              <div className="sesion-resumen">
                <div className="sesion-kpi">
                  <span className="v">
                    {marcas.maxKg === null ? '—' : localeNumber(marcas.maxKg)}
                    {marcas.maxKg !== null && <small> kg</small>}
                  </span>
                  <span className="k">máximo</span>
                </div>
                <div className="sesion-kpi">
                  <span className="v">{marcas.maxReps === null ? '—' : marcas.maxReps}</span>
                  <span className="k">reps</span>
                </div>
                <div className="sesion-kpi">
                  <span className="v">
                    {localeNumber(Math.round(marcas.tonelaje))}
                    <small> kg</small>
                  </span>
                  {/*
                    Decía «tonelaje». Es una palabra del oficio —está en la
                    tabla de traducción del §2.4 del replanteamiento— y aquí la
                    lee quien acaba de terminar una serie. Lo que la cifra dice,
                    dicho como se dice: los kilos que ha movido en total en este
                    ejercicio.
                  */}
                  <span className="k">kilos movidos</span>
                </div>
              </div>

              {/*
                ══ Y LA CURVA, que es lo que faltaba de esta pestaña ══════════

                Tres cifras sin eje contestan «cuánto es lo más que he hecho» y
                dejan sin contestar la única pregunta por la que alguien abre
                esto entre serie y serie: **¿voy a más?**. Coachway y Efort la
                contestan igual —su pestaña «Charts» es una carga por fecha— y
                es información del cliente sobre el cliente, que es lo que el
                dueño autorizó el 14 de septiembre.

                Se dibuja la SERIE TOPE de cada día y no la media: es la que
                marca la progresión de un ejercicio, y es la misma serie y el
                mismo color (`topKg`) con la que esto ya se dibuja en la ficha
                del entrenador. Dos sitios, una lectura.

                Y no propone nada: ni un 1RM estimado que perseguir, ni «te toca
                subir a 35». Ver `la app no receta`.
              */}
              {progresion.length > 1 && (
                <div className="col gap-1">
                  <span className="section-label">Lo más que levantaste cada día</span>
                  <Sparkline points={progresion} color={metricColor('topKg')} height={40} />
                  <span className="t-xs t-tertiary">
                    De {shortDate(progresion[0].date)} a {shortDate(progresion[progresion.length - 1].date)}
                  </span>
                </div>
              )}
            </div>
          )
        )}
      </div>
    </Modal>
  );
};

/** ¿Es de hoy este día del histórico? Para no repetir la nota que ya está en
    el campo. Se compara la fecha y no el sello: el día es lo que importa. */
const esDeHoy = (dia) => dia?.date === todayISO();
