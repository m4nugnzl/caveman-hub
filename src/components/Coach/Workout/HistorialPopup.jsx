import { useState } from 'react';
import { ArrowRight } from 'lucide-react';

import { blockChangeLog, blockSummary, blocksOf, describeBlockChange, weekLabel, weeksOfBlock } from '@/domain/blocks';
import { executedSessions, sessionTonnage } from '@/domain/sessions';
import { findMicrocycle } from '@/domain/training';
import { metricColor } from '@/domain/metrics';
import { localeNumber, shortDate } from '@/lib/dates';
import { Modal } from '@/components/ui/Modal';
import { BarBandChart } from '@/components/ui/charts';

/**
 * EL HISTORIAL: todos los bloques de esta persona, en grande.
 *
 * La tarjeta del costado enseña el bloque que miras. Aquí está la historia
 * entera: arriba, los kilos de cada semana del programa de principio a fin
 * —con lo que se ve de un vistazo si el tonelaje sube de bloque en bloque—;
 * debajo, cada bloque con sus cifras, sus semanas (fecha, kilos, entrenos) y
 * los cambios que se le hicieron por el camino.
 *
 * Cada nombre es una puerta al bloque; cada semana, a su hoja. La fecha de
 * una semana solo se toca en el bloque abierto: la de los cerrados es lo que
 * pasó.
 */
const CAMBIOS_A_LA_VISTA = 4;

const cuenta = (n, singular, plural) => `${n} ${n === 1 ? singular : plural}`;

const Cambios = ({ bloque, etiqueta }) => {
  const [enteros, setEnteros] = useState(false);
  const bitacora = blockChangeLog(bloque);
  if (bitacora.length === 0) return null;
  const visibles = enteros ? bitacora : bitacora.slice(0, CAMBIOS_A_LA_VISTA);

  return (
    <div className="historial-cambios">
      <span className="section-label">Cambios</span>
      <ol className="cambios">
        {visibles.map((e) => (
          <li className="cambio" key={e.id}>
            <span className="cambio-cuando">{e.at ? shortDate(e.at.slice(0, 10)) : ''}</span>
            <span className={`cambio-alcance${e.alcance === 'semana' ? ' is-semana' : ''}`}>
              {e.alcance === 'semana' ? (e.semanas || []).map(etiqueta).join(', ') : 'el bloque'}
            </span>
            <span className="cambio-que">
              <b>{e.hoja}</b> {describeBlockChange(e)}
            </span>
          </li>
        ))}
      </ol>
      {bitacora.length > CAMBIOS_A_LA_VISTA && (
        <button type="button" className="link historial-mas" onClick={() => setEnteros((v) => !v)}>
          {enteros ? 'Ver solo los últimos' : `Ver los ${bitacora.length}`}
        </button>
      )}
    </div>
  );
};

export const HistorialPopup = ({ open, onClose, program, bloque, semanaEnCurso, unidad, unidades, onIrBloque, onIrSemana, onFechaSemana }) => {
  const bloques = blocksOf(program);
  const microcycles = program?.microcycles || [];
  const letra = unidad.charAt(0);

  const kgDe = (w) => executedSessions(findMicrocycle(microcycles, w) || {}).reduce((acc, s) => acc + sessionTonnage(s), 0);
  const barras = bloques.flatMap((b) => weeksOfBlock(program, b).map((w) => ({ label: weekLabel(program, w, letra), value: kgDe(w) })));
  const conDatos = barras.some((b) => b.value > 0);

  return (
    <Modal open={open} size="lg" title="Historial de entrenamiento" onClose={onClose}>
      <div className="historial">
        {conDatos && (
          <BarBandChart bars={barras} color={metricColor('tonnage')} unit=" kg" height={150} showLine={false} />
        )}

        {[...bloques].reverse().map((b, i) => {
          const r = blockSummary(program, b);
          const esEste = b.id === bloque.id;
          const numero = bloques.length - i;
          const etiqueta = (w) => `${letra}${w - b.fromWeek + 1}`;

          return (
            <section key={b.id} className={`historial-bloque${esEste ? ' is-on' : ''}`}>
              <header className="historial-cab">
                <div className="historial-say">
                  <span className="section-label">Bloque {numero}{r.abierto ? ' · abierto' : ''}</span>
                  <button type="button" className="historial-nombre" onClick={() => onIrBloque(b)} disabled={esEste} title={esEste ? 'Es el bloque que estás mirando' : `Abrir ${b.name}`}>
                    {b.name}
                    {!esEste && <ArrowRight size={14} aria-hidden="true" />}
                  </button>
                  <span className="historial-cuando">
                    {r.desde ? shortDate(r.desde) : 'sin fechas'}
                    {r.hasta && !r.abierto ? ` – ${shortDate(r.hasta)}` : ''}
                    {' · '}
                    {cuenta(r.semanas, unidad.toLowerCase(), unidades)}
                  </span>
                </div>
                <dl className="historial-cifras">
                  <div>
                    <dt>series/{unidad.toLowerCase().slice(0, 3)}</dt>
                    <dd>{r.series ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>kg</dt>
                    <dd>{localeNumber(r.kg)}</dd>
                  </div>
                  <div>
                    <dt>entrenos</dt>
                    <dd>
                      {r.hechas}
                      <small>/{r.planificadas}</small>
                    </dd>
                  </div>
                  <div>
                    <dt>pautado</dt>
                    <dd>{r.adherencia === null ? '—' : `${r.adherencia}%`}</dd>
                  </div>
                </dl>
              </header>

              <ol className="historial-semanas">
                {weeksOfBlock(program, b).map((w) => {
                  const micro = findMicrocycle(microcycles, w) || {};
                  const hechas = executedSessions(micro);
                  const kg = hechas.reduce((acc, s) => acc + sessionTonnage(s), 0);
                  return (
                    <li key={w} className={`historial-semana${w === semanaEnCurso ? ' is-curso' : ''}`}>
                      <button type="button" className="historial-semana-n" onClick={() => onIrSemana(w)} title={`Abrir ${unidad.toLowerCase()} ${etiqueta(w)}`}>
                        {etiqueta(w)}
                      </button>
                      {r.abierto && onFechaSemana ? (
                        <input
                          type="date"
                          className="historial-fecha"
                          value={micro.date || ''}
                          aria-label={`Fecha de inicio de ${unidad.toLowerCase()} ${etiqueta(w)}`}
                          onChange={(e) => onFechaSemana(w, e.target.value)}
                        />
                      ) : (
                        <span className="historial-fecha">{micro.date ? shortDate(micro.date) : '—'}</span>
                      )}
                      <span className="historial-kg">{kg > 0 ? `${localeNumber(kg)} kg` : '—'}</span>
                      <span className="historial-ses">
                        {hechas.length}/{(micro.days || []).length}
                      </span>
                    </li>
                  );
                })}
              </ol>

              <Cambios bloque={b} etiqueta={etiqueta} />
            </section>
          );
        })}
      </div>
    </Modal>
  );
};
