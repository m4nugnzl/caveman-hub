import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown, Plus, X } from 'lucide-react';

import { usePhotoBatch } from '@/components/photos/usePhotoBatch';
import { Thumb } from '@/components/photos/Thumb';
import { shortDate } from '@/lib/dates';
import { enumeraEs } from '@/lib/texto';
import { Aire, Boton, Cabecera, Tramo } from './Piezas';

/**
 * «FOTOS DE PROGRESO» EN EL TELÉFONO — el frame `328:518` del 18 sep 2026.
 *
 * ══ Un hueco por ángulo ════════════════════════════════════════════════════
 *
 * En el asistente se elegían todas de golpe y luego se decía cuál era cuál con
 * unos chips debajo de cada una. Aquí el orden es el del cuerpo: tocas el hueco
 * del lateral derecho y lo que elijas ES el lateral derecho. No hay etiqueta que
 * corregir porque no hay forma de equivocarse de hueco.
 *
 * Y es lo que hace que los dos perfiles no cuesten nada de explicar: el lado se
 * elige tocando su hueco, no acordándose de una instrucción de hace tres
 * semanas. Ver `ANGLES` en `domain/photos`.
 *
 * ── La de la semana pasada, de fondo ─────────────────────────────────────
 * El dibujo pone una silueta en el hueco vacío. Aquí va la foto de ese ángulo
 * de la última vez, apagada: es «misma luz, misma pose» sin leer nada, lo que
 * `AngulosDeLaSemana` ya hacía en el asistente con una miniatura debajo. Sin
 * foto anterior, el hueco es el signo de sumar y nada más.
 *
 * ── Guardar no es entregar ───────────────────────────────────────────────
 * «Guardar fotos» las sube a tu semana y ahí se quedan: están en tu archivo,
 * y tu entrenador puede verlas desde ese momento. Lo que le AVISA de que la
 * semana está lista es la entrega, que es el botón de la lista de la revisión.
 *
 * Una foto ya guardada no se cambia subiendo otra encima: dejaría dos fotos
 * del mismo ángulo en la misma semana. Se QUITA —la cruz, con confirmación— y
 * el hueco vuelve a estar libre. Solo mientras su entrenador no haya revisado
 * la semana (23 sep 2026); revisada, las fotos se miran y no se tocan.
 *
 * Lo que NO se copia: el «en ayunas» del dibujo —es una pauta de tu
 * entrenador, no de la aplicación— y el verde del marco, que aquí es el tic de
 * «guardada» y nada más.
 */
export const PantallaFotosDeLaSemana = ({ datos }) => {
  const { semana, angulos, clientId, onSubir, onVolver, pasada = null, soloLectura = false, onQuitar = null } = datos;
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
      <Cabecera
        titulo="Fotos de progreso"
        sub={pasada ? `Revisión · ${pasada}` : `Revisión · semana ${semana}`}
        atras={{ onClick: onVolver }}
      />

      <Tramo>
        <p className="tel-pie tel-pie-arriba">
          {soloLectura
            ? 'Esta semana ya está cerrada: sus fotos se miran y no se cambian.'
            : `${enumeraEs(angulos.map((a) => a.label))}. Toca un hueco para hacer o elegir esa foto.`}
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
                  ocupado={lote.busy || soloLectura}
                  onElegir={() => elegir(a.id)}
                  onQuitar={esperando ? () => lote.drop(esperando.id) : null}
                  onQuitarGuardada={onQuitar && a.ahora ? () => onQuitar(a.ahora) : null}
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

      {soloLectura ? null : (
      <div className="tel-hoja-pie">
        <Boton onClick={guardar} disabled={n === 0 || lote.busy}>
          {lote.busy ? 'Subiendo…' : n > 1 ? `Guardar ${n} fotos` : 'Guardar fotos'}
        </Boton>
        <p className="tel-pie tel-centrado">
          {pasada
            ? `Se guardan en tu ${pasada}, sea cual sea el día en que las hiciste. Cuando lo tengas todo, entrégala.`
            : `Se guardan en tu semana ${semana}. Cuando lo tengas todo, entrega la revisión para que tu entrenador sepa que está lista.`}
        </p>
      </div>
      )}

      <Aire />
    </>
  );
};

/**
 * UN HUECO: guardada (la foto, con su tic), esperando (la elegida, con su
 * estado) o vacío (la de la última vez de fondo, y el signo de sumar).
 */
const Hueco = ({ angulo, esperando, ocupado, onElegir, onQuitar, onQuitarGuardada }) => {
  if (angulo.ahora) {
    return <Guardada angulo={angulo} onQuitar={onQuitarGuardada} />;
  }

  const estado = esperando
    ? esperando.status === 'uploading'
      ? 'Subiendo…'
      : esperando.status === 'error'
        ? 'No ha subido'
        : /* La fecha de la cámara, si la trae: para ver que es la buena. No
             decide a qué semana va. Ver `fechaDeLaFoto`. */
          esperando.hechaEl
          ? `Sin guardar · hecha el ${shortDate(esperando.hechaEl)}`
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

/**
 * UNA FOTO YA GUARDADA. Con la cruz, mientras la semana siga abierta: quitarla
 * se confirma en el mismo sitio —es borrar una foto suya, y un toque suelto al
 * desplazar no puede llevársela—. Si la base se niega (la semana se revisó
 * mientras tanto), se dice ahí mismo.
 */
const Guardada = ({ angulo, onQuitar }) => {
  const [seguro, setSeguro] = useState(false);
  const [quitando, setQuitando] = useState(false);
  const [error, setError] = useState(null);

  const quitar = async () => {
    setQuitando(true);
    const res = await onQuitar();
    setQuitando(false);
    if (res?.ok === false) setError(res.error || 'No se ha podido quitar.');
    else setSeguro(false);
  };

  return (
    <figure className="tel-hueco tel-guardada">
      <span className="tel-hueco-marco">
        <Thumb url={angulo.ahora.url} width={240} alt={`Tu ${angulo.label.toLowerCase()} de esta semana`} />
        <span className="tel-hueco-tic" aria-hidden="true">
          <Check size={13} strokeWidth={3} />
        </span>
      </span>
      {onQuitar && !seguro ? (
        <button
          type="button"
          className="tel-hueco-quitar"
          onClick={() => {
            setError(null);
            setSeguro(true);
          }}
          aria-label={`Quitar la foto ${angulo.label.toLowerCase()}`}
        >
          <X size={13} aria-hidden="true" />
        </button>
      ) : null}
      <figcaption className="tel-hueco-pie">
        <b>{angulo.label}</b>
        {seguro ? (
          <span className="tel-hueco-seguro">
            <button type="button" className="btn btn-sm btn-plain" onClick={() => setSeguro(false)} disabled={quitando}>
              Dejarla
            </button>
            <button type="button" className="btn btn-sm btn-secondary" onClick={quitar} disabled={quitando}>
              {quitando ? 'Quitando…' : 'Quitar'}
            </button>
          </span>
        ) : (
          <span>Guardada</span>
        )}
        {error ? (
          <span className="tel-error" role="alert">
            {error}
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
};
