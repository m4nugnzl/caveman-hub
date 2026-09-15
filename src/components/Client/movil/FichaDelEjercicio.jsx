import { useEffect, useMemo, useState } from 'react';

import { marcasDeEjercicio } from '@/domain/sessions';
import { parseVideoUrl } from '@/domain/video';
import { localeNumber, shortDate } from '@/lib/dates';

/**
 * LA FICHA DEL EJERCICIO — la firma del teléfono.
 *
 * ══ Qué es ════════════════════════════════════════════════════════════════
 *
 * Una hoja que sube desde abajo, no un modal centrado. Se abre tocando el
 * renglón de un ejercicio en cualquier sitio —la portada, la sesión, el cajón—
 * y dentro está todo lo que hay de ese ejercicio: lo que te repite tu
 * entrenador, el vídeo si lo puso, y tres pestañas.
 *
 * ══ Por qué abre en «Historial» y no en «Pauta» ════════════════════════════
 *
 * Porque es la tesis del estudio puesta en una pestaña: *tu historial es el
 * producto*. La pauta es lo que te han dicho que hagas —está en la hoja, a un
 * dedo de aquí— y el historial es lo tuyo, que es lo que no caduca cuando se
 * acaba el bloque.
 *
 * ══ El historial a DOS CARRILES ════════════════════════════════════════════
 *
 * A la izquierda lo que se te pidió, a la derecha lo que hiciste. Esto es lo
 * nuestro y no se copia de ninguna captura: Hevy, Strong, Coachway y Efort
 * enseñan solo el resultado porque no guardan la pauta junto al registro.
 * Nosotros sí.
 *
 * ── La pauta de la izquierda es la de HOY ──────────────────────────────────
 * Y es una limitación honesta, no un descuido: la sesión ejecutada guarda lo
 * anotado (`SessionEntry`) y no el objetivo con el que se anotó, así que la
 * pauta de hace ocho semanas no está en ningún sitio. Se dice la vigente, que es
 * contra la que se está leyendo el número de la derecha.
 *
 * ── Y el vídeo es una FILA que no existe si no hay vídeo ───────────────────
 * No un marco 16:9 vacío. Cuando el entrenador no lo ha puesto, la ficha no
 * parece rota: lo que la llena es lo que te repite y lo que has levantado.
 *
 * @param ejercicio  El de la hoja: su nombre y sus series.
 * @param ficha      Lo de su entrenador y el catálogo (`fichaDe`), o `null`.
 * @param historial  `historialDeEjercicio(...)`, de hoy hacia atrás.
 * @param pauta      Las repeticiones que le pide hoy («6-8»).
 * @param descanso   El descanso pautado, en segundos, si lo hay.
 */
export const FichaDelEjercicio = ({
  ejercicio,
  ficha = null,
  historial = [],
  pauta = null,
  descanso = null,
  onClose,
}) => {
  const [tramo, setTramo] = useState('historial');
  const [abierta, setAbierta] = useState(false);

  /* La hoja sube: se monta fuera de pantalla y se suelta en el fotograma
     siguiente, que es lo que hace que la transición exista. */
  useEffect(() => {
    const t = window.setTimeout(() => setAbierta(true), 10);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const alTeclear = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onClose]);

  const marcas = useMemo(() => marcasDeEjercicio(historial), [historial]);
  const series = (ejercicio?.sets || []).length;
  const video = ficha?.videoUrl ? parseVideoUrl(ficha.videoUrl) : null;
  const deq = [ficha?.muscle, ficha?.equipment].filter(Boolean).join(' · ');
  const conRegistro = historial.length > 0;

  return (
    <>
      <button
        type="button"
        className={`tel-velo${abierta ? ' tel-abierto' : ''}`}
        aria-label="Cerrar la ficha"
        onClick={onClose}
      />
      <aside
        className={`tel-ficha${abierta ? ' tel-abierta' : ''}`}
        role="dialog"
        aria-label={ejercicio?.name}
      >
        <button type="button" className="tel-asa" aria-label="Cerrar la ficha" onClick={onClose} />
        <div className="tel-cuerpo">
          <h5>{ejercicio?.name}</h5>
          {deq ? <div className="tel-deq">{deq}</div> : null}

          {/* Lo que te repite siempre. Es lo que sube arriba del todo, y la
              razón por la que la miniatura no hacía falta. */}
          {String(ficha?.cue || '').trim() ? (
            <div className="tel-cue">
              <b>Lo que te repite siempre</b>
              {ficha.cue}
            </div>
          ) : null}

          {video ? (
            <a
              className="tel-fila-video"
              href={ficha.videoUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              <span className="tel-disco" />
              <span>
                <span className="tel-q">Ver el vídeo</span>
                <span className="tel-c">{video.label}</span>
              </span>
              <span className="tel-ir">Abrir</span>
            </a>
          ) : null}

          <div className="tel-pestanas" role="tablist">
            {[
              ['pauta', 'Pauta'],
              ['historial', 'Historial'],
              ['curva', 'Curva'],
            ].map(([id, rotulo]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tramo === id}
                onClick={() => setTramo(id)}
              >
                {rotulo}
              </button>
            ))}
          </div>

          {tramo === 'pauta' ? (
            <div className="tel-pauta-panel">
              <div className="tel-pauta-trio">
                <div>
                  <div className="tel-k">Series</div>
                  <div className="tel-v">{series || '—'}</div>
                </div>
                <div>
                  <div className="tel-k">Reps</div>
                  <div className="tel-v">{pauta || '—'}</div>
                </div>
                <div>
                  <div className="tel-k">Descanso</div>
                  <div className="tel-v">
                    {descanso ? Math.round(descanso / 60) : '—'}
                    {descanso ? <small> min</small> : null}
                  </div>
                </div>
              </div>
              <div className="tel-pauta-frase">
                {ficha?.description ||
                  (conRegistro
                    ? `La vez anterior levantaste ${cifraDe(historial[0])}.`
                    : 'Apunta la primera.')}
              </div>
            </div>
          ) : null}

          {tramo === 'historial' ? (
            conRegistro ? (
              <>
                <div className="tel-hist">
                  {historial.slice(0, 8).map((dia, i) => (
                    <div className="tel-dia" key={`${dia.date}-${i}`}>
                      <div className="tel-cuando">
                        {mes(dia.date)}
                        <b>{diaDelMes(dia.date)}</b>
                      </div>
                      <div>
                        <div className="tel-bloque-etq">
                          {dia.dayName}
                          {Number.isFinite(dia.weekNumber) ? ` · M${dia.weekNumber}` : ''}
                        </div>
                        <div className="tel-series">
                          {dia.sets.map((s, j) => (
                            <div className="tel-s" key={j}>
                              <span className="tel-ped">
                                {pauta || '—'}
                                {j === 0 && dia.sets.length > 1 ? ` × ${dia.sets.length}` : ''}
                              </span>
                              <span className="tel-hecho">{setEscrito(s)}</span>
                            </div>
                          ))}
                        </div>
                        {/* Lo que escribiste ese día. Se guardaba desde hace
                            semanas y no se leía en ningún sitio del portal: es
                            la otra mitad del campo que la sesión acaba de
                            recuperar. Ver `pc/PantallaSesion`. */}
                        {dia.nota ? <p className="tel-hist-nota">«{dia.nota}»</p> : null}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="tel-pie-nota">
                  A la izquierda lo que se te pidió, a la derecha lo que hiciste.
                </div>
              </>
            ) : (
              <SinRegistro que="historia" />
            )
          ) : null}

          {tramo === 'curva' ? (
            conRegistro && marcas.maxKg ? (
              <Curva historial={historial} maxKg={marcas.maxKg} />
            ) : (
              <SinRegistro que="curva" />
            )
          ) : null}
        </div>
      </aside>
    </>
  );
};

/**
 * El vacío de las dos pestañas que miran atrás.
 *
 * Es una invitación de una línea, no una disculpa: sin «todavía» y sin explicar
 * el sistema. Regla 5 de la voz.
 */
const SinRegistro = ({ que }) => (
  <div className="tel-sin-registro">
    <div className="tel-q">Apunta la primera</div>
    <div className="tel-c">Y este ejercicio empieza a tener {que}.</div>
  </div>
);

/**
 * LA CURVA: la serie más pesada de cada día, en orden.
 *
 * `historial` llega de hoy hacia atrás —lo pide la lista de al lado, que se lee
 * empezando por lo último—, así que aquí se le da la vuelta: una curva que va
 * del presente al pasado sube cuando se baja.
 *
 * Los días sin ningún kilo anotado se caen. Pintarlos como cero sería dibujar un
 * desplome que no ocurrió.
 */
const Curva = ({ historial, maxKg }) => {
  const puntos = [...historial]
    .reverse()
    .map((dia) => {
      const kgs = dia.sets.map((s) => Number(s.kg)).filter((n) => Number.isFinite(n) && n > 0);
      return kgs.length > 0 ? { date: dia.date, v: Math.max(...kgs) } : null;
    })
    .filter(Boolean);

  if (puntos.length < 2) {
    return (
      <div className="tel-curva">
        <div className="tel-cifra">
          {localeNumber(maxKg, { maximumFractionDigits: 1 })}
          <small> kg máx</small>
        </div>
        <div className="tel-pie-nota">Con un solo día no hay curva. Apunta otro.</div>
      </div>
    );
  }

  const min = Math.min(...puntos.map((p) => p.v));
  const max = Math.max(...puntos.map((p) => p.v));
  const rango = max - min || 1;
  const d = puntos
    .map(
      (p, i) =>
        `${i ? 'L' : 'M'}${((i * 300) / (puntos.length - 1)).toFixed(1)},${(
          80 -
          ((p.v - min) / rango) * 70
        ).toFixed(1)}`
    )
    .join(' ');
  const salto = Math.round((puntos[puntos.length - 1].v - puntos[0].v) * 10) / 10;

  return (
    <div className="tel-curva">
      <div className="tel-cifra">
        {localeNumber(maxKg, { maximumFractionDigits: 1 })}
        <small> kg máx</small>
      </div>
      <svg viewBox="0 0 300 90" preserveAspectRatio="none" aria-hidden="true">
        <path
          d={d}
          stroke="var(--accent)"
          strokeWidth="2.4"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="300" cy={80 - ((puntos[puntos.length - 1].v - min) / rango) * 70} r="3.4" fill="var(--accent)" />
      </svg>
      <div className="tel-eje">
        <span>{shortDate(puntos[0].date)}</span>
        <span>{shortDate(puntos[puntos.length - 1].date)}</span>
      </div>
      {salto !== 0 ? (
        <div className="tel-pie-nota">
          {salto > 0 ? '+' : '−'}
          {localeNumber(Math.abs(salto), { maximumFractionDigits: 1 })} kg desde la primera vez que
          lo anotaste.
        </div>
      ) : null}
    </div>
  );
};

/** «100 × 8» de una serie, o «no la apuntaste». */
const setEscrito = (s) => {
  const kg = Number(s.kg);
  const reps = Number(s.reps);
  if (!reps) return 'no la apuntaste';
  if (!kg) return `${reps} reps`;
  return `${localeNumber(kg, { maximumFractionDigits: 1 })} × ${reps}`;
};

/** La serie más pesada de un día, escrita. */
const cifraDe = (dia) => {
  let mejor = null;
  for (const s of dia?.sets || []) {
    const kg = Number(s.kg) || 0;
    const reps = Number(s.reps) || 0;
    if (!mejor || kg > mejor.kg || (kg === mejor.kg && reps > mejor.reps)) mejor = { kg, reps };
  }
  return mejor ? setEscrito(mejor) : '—';
};

const mes = (iso) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('es-ES', { month: 'short' }).toUpperCase().replace('.', '') : '';
const diaDelMes = (iso) => (iso ? String(new Date(`${iso}T00:00:00`).getDate()).padStart(2, '0') : '');
