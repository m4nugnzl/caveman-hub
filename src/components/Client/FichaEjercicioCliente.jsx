import { useEffect, useRef } from 'react';
import { Play } from 'lucide-react';

import { parseVideoUrl } from '@/domain/video';
import { Modal } from '@/components/ui/Modal';
import { VideoEmbed } from '@/components/ui/VideoEmbed';

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

export const FichaEjercicioCliente = ({ nombre, ficha, onClose }) => (
  <Modal title={nombre} onClose={onClose} size="side">
    <CuerpoFichaEjercicio nombre={nombre} ficha={ficha} />
  </Modal>
);
