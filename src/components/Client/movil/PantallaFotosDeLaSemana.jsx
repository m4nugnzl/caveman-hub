import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown, Plus, X } from 'lucide-react';

import { usePhotoBatch } from '@/components/photos/usePhotoBatch';
import { Thumb } from '@/components/photos/Thumb';
import { Aire, Boton, Cabecera, Tramo } from './Piezas';

/**
 * «FOTOS DE PROGRESO» EN EL TELÉFONO — el frame `328:518` del 18 sep 2026.
 *
 * ══ Tres huecos, uno por ángulo ════════════════════════════════════════════
 *
 * En el asistente se elegían las tres de golpe y luego se decía cuál era cuál
 * con tres chips debajo de cada una. Aquí el orden es el del cuerpo: tocas el
 * hueco de la lateral y lo que elijas ES la lateral. No hay etiqueta que
 * corregir porque no hay forma de equivocarse de hueco.
 *
 * ── La de la semana pasada, de fondo ─────────────────────────────────────
 * El dibujo pone una silueta en el hueco vacío. Aquí va la foto de ese ángulo
 * de la última vez, apagada: es «misma luz, misma pose» sin leer nada, lo que
 * `TresAngulos` ya hacía en el asistente con una miniatura debajo. Sin foto
 * anterior, el hueco es el signo de sumar y nada más.
 *
 * ── Guardar no es entregar ───────────────────────────────────────────────
 * «Guardar fotos» las sube a tu semana y ahí se quedan: están en tu archivo,
 * y tu entrenador puede verlas desde ese momento. Lo que le AVISA de que la
 * semana está lista es la entrega, que es el botón de la lista de la revisión.
 *
 * Una foto ya guardada no se cambia desde aquí: subir otra encima dejaría dos
 * laterales en la misma semana. Para quitar una está el archivo, en «Tus
 * fotos».
 *
 * Lo que NO se copia: el «en ayunas» del dibujo —es una pauta de tu
 * entrenador, no de la aplicación— y el verde del marco, que aquí es el tic de
 * «guardada» y nada más.
 */
export const PantallaFotosDeLaSemana = ({ datos }) => {
  const { semana, angulos, clientId, onSubir, onVolver } = datos;
  const entrada = useRef(null);
  /* El ángulo del hueco que se ha tocado: el lote le pone esa etiqueta a lo
     que llegue del selector. Una ref y no estado porque se lee dentro del
     `addFiles`, en el mismo gesto, antes de que ningún render la cambie. */
  const pedido = useRef('frontal');
  const lote = usePhotoBatch({ onUpload: onSubir, nextTag: () => pedido.current });

  const elegir = (angulo) => {
    pedido.current = angulo;
    entrada.current?.click();
  };

  const alElegir = (files) => {
    if (!files || files.length === 0) return;
    /* Elegir otra vez en un hueco sustituye la que esperaba en él. */
    lote.items
      .filter((i) => i.tag === pedido.current && i.status !== 'done')
      .forEach((i) => lote.drop(i.id));
    lote.addFiles([files[0]]);
  };

  const guardar = () => lote.upload({ clientId, week: semana, notes: '' });

  const fallidas = lote.items.filter((i) => i.status === 'error');
  const n = lote.pendientes;

  return (
    <>
      <Cabecera titulo="Fotos de progreso" sub={`Revisión · semana ${semana}`} atras={{ onClick: onVolver }} />

      <Tramo>
        <p className="tel-pie tel-pie-arriba">
          Frente, lateral y espalda. Toca un hueco para hacer o elegir esa foto.
        </p>

        <input
          ref={entrada}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            alElegir(e.target.files);
            e.target.value = '';
          }}
        />

        <ul className="tel-huecos">
          {angulos.map((a) => {
            const esperando = lote.items.find((i) => i.tag === a.id && i.status !== 'done') || null;
            return (
              <li key={a.id}>
                <Hueco
                  angulo={a}
                  esperando={esperando}
                  ocupado={lote.busy}
                  onElegir={() => elegir(a.id)}
                  onQuitar={esperando ? () => lote.drop(esperando.id) : null}
                />
              </li>
            );
          })}
        </ul>

        {lote.error ? (
          <p className="tel-pie tel-error" role="alert">
            {lote.error}
          </p>
        ) : null}
        {fallidas.length > 0 ? (
          <p className="tel-pie tel-error" role="alert">
            {fallidas.length === 1 ? 'Una foto no ha subido' : `${fallidas.length} fotos no han subido`}:{' '}
            {fallidas[0].error} Vuelve a pulsar «Guardar fotos» para reintentarlo.
          </p>
        ) : null}
      </Tramo>

      <Tramo>
        <details className="tel-consejos">
          <summary>
            Consejos para mejores fotos
            <ChevronDown size={15} aria-hidden="true" />
          </summary>
          <ul>
            <li>Misma hora y mismo sitio cada semana.</li>
            <li>Luz natural siempre que puedas, de frente y no a contraluz.</li>
            <li>Ropa ajustada o bañador.</li>
            <li>Postura relajada: sin apretar ni meter tripa.</li>
          </ul>
        </details>
        <Link className="tel-enlace" to="/mi/evolucion/fotos">
          Ver tus fotos de otras semanas
        </Link>
      </Tramo>

      <div className="tel-hoja-pie">
        <Boton onClick={guardar} disabled={n === 0 || lote.busy}>
          {lote.busy ? 'Subiendo…' : n > 1 ? `Guardar ${n} fotos` : 'Guardar fotos'}
        </Boton>
        <p className="tel-pie tel-centrado">
          Se guardan en tu semana {semana}. Cuando lo tengas todo, entrega la revisión para que tu
          entrenador sepa que está lista.
        </p>
      </div>

      <Aire />
    </>
  );
};

/**
 * UN HUECO: guardada (la foto, con su tic), esperando (la elegida, con su
 * estado) o vacío (la de la última vez de fondo, y el signo de sumar).
 */
const Hueco = ({ angulo, esperando, ocupado, onElegir, onQuitar }) => {
  if (angulo.ahora) {
    return (
      <figure className="tel-hueco tel-guardada">
        <span className="tel-hueco-marco">
          <Thumb url={angulo.ahora.url} width={240} alt={`Tu ${angulo.label.toLowerCase()} de esta semana`} />
          <span className="tel-hueco-tic" aria-hidden="true">
            <Check size={13} strokeWidth={3} />
          </span>
        </span>
        <figcaption className="tel-hueco-pie">
          <b>{angulo.label}</b>
          <span>Guardada</span>
        </figcaption>
      </figure>
    );
  }

  const estado = esperando
    ? esperando.status === 'uploading'
      ? 'Subiendo…'
      : esperando.status === 'error'
        ? 'No ha subido'
        : 'Sin guardar'
    : angulo.antes
      ? `Guía: semana ${angulo.antes.semana}`
      : 'Falta';

  return (
    <div className={`tel-hueco${esperando ? ' tel-esperando' : ' tel-vacio'}`}>
      <button
        type="button"
        className="tel-hueco-marco"
        onClick={onElegir}
        disabled={ocupado}
        aria-label={`${esperando ? 'Cambiar' : 'Hacer'} la foto ${angulo.label.toLowerCase()}`}
      >
        {esperando ? (
          <img src={esperando.url} alt="" />
        ) : (
          <>
            {angulo.antes?.url ? (
              <span className="tel-hueco-fantasma" aria-hidden="true">
                <Thumb url={angulo.antes.url} width={240} alt="" />
              </span>
            ) : null}
            <Plus size={20} aria-hidden="true" />
          </>
        )}
      </button>
      {onQuitar && !ocupado ? (
        <button
          type="button"
          className="tel-hueco-quitar"
          onClick={onQuitar}
          aria-label={`Quitar la foto ${angulo.label.toLowerCase()}`}
        >
          <X size={13} aria-hidden="true" />
        </button>
      ) : null}
      <span className="tel-hueco-pie">
        <b>{angulo.label}</b>
        <span>{estado}</span>
      </span>
    </div>
  );
};
