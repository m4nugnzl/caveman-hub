import { useMemo } from 'react';

import { allSessions } from '@/domain/sessions';
import { shortDate } from '@/lib/dates';
import { Modal } from '@/components/ui/Modal';
import { BandChart } from '@/components/ui/charts';
import { Subjetivo } from './Subjetivo';

/**
 * Las sensaciones, sesión a sesión.
 *
 * Lo que el cliente contó al acabar cada entreno —fatiga, dolor, energía,
 * ánimo…— dibujado en el tiempo: una línea por pregunta, con su color, sobre
 * todas las sesiones registradas. Debajo, la última sesión como barras y las
 * notas que dejó, de la más reciente a la más antigua. Es el contexto de todo
 * lo demás: los kilos que suben con la fatiga por las nubes no cuentan la
 * misma historia que los que suben descansado.
 */
export const SensacionesPopup = ({ open, onClose, microcycles, preguntas = [], etiqueta = (w) => `S${w}` }) => {
  const sesiones = useMemo(
    () => allSessions(microcycles).filter((s) => s.feedback && preguntas.some((q) => String(s.feedback[q.id] ?? '').trim() !== '')),
    [microcycles, preguntas]
  );
  const labels = sesiones.map((s) => (s.date ? shortDate(s.date) : etiqueta(s.weekNumber)));
  const series = preguntas.map((q) => ({
    id: q.id,
    label: q.short || q.label,
    color: q.color,
    unit: '',
    decimals: 0,
    points: sesiones.map((s, i) => {
      const v = Number(s.feedback?.[q.id]);
      return { label: labels[i], value: Number.isFinite(v) ? v : null };
    }),
  }));
  const ultima = sesiones[sesiones.length - 1] || null;
  const medias = preguntas
    .map((q) => {
      const valores = sesiones.map((s) => Number(s.feedback?.[q.id])).filter(Number.isFinite);
      return valores.length ? { q, media: Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * 10) / 10, n: valores.length } : null;
    })
    .filter(Boolean);
  const notas = [...sesiones].reverse().filter((s) => s.clientNote?.trim());

  return (
    <Modal open={open} size="lg" title="Cómo lo lleva" onClose={onClose}>
      {sesiones.length === 0 ? (
        <p className="t-sm t-tertiary">Todavía no ha contado nada al acabar ninguna sesión.</p>
      ) : (
        <div className="progresion">
          <div className={`bloque-cifras is-${Math.min(4, Math.max(1, medias.length))}`}>
            {medias.slice(0, 4).map(({ q, media, n }) => (
              <div key={q.id} className="bloque-cifra">
                <span className="v" style={q.color ? { color: q.color } : undefined}>{media}<small>/{q.max || 10}</small></span>
                <span className="k">{q.short || q.label} · media de {n}</span>
              </div>
            ))}
          </div>
          <BandChart labels={labels} series={series} height={220} fromZero showArea={false} emptyMessage="Sin respuestas todavía." />
          {ultima && (
            <section className="bloque-seccion">
              <h3 className="bloque-titulo">Última sesión · {ultima.date ? shortDate(ultima.date) : etiqueta(ultima.weekNumber)}{ultima.dayName ? ` · ${ultima.dayName}` : ''}</h3>
              <Subjetivo preguntas={preguntas} answers={ultima.feedback} />
            </section>
          )}
          {notas.length > 0 && (
            <section className="bloque-seccion">
              <h3 className="bloque-titulo">Lo que escribió</h3>
              <ul className="sensaciones-notas">
                {notas.map((s) => (
                  <li key={s.id || `${s.weekNumber}-${s.date}`}>
                    <span className="sensaciones-nota-fecha">{s.date ? shortDate(s.date) : etiqueta(s.weekNumber)}{s.dayName ? ` · ${s.dayName}` : ''}</span>
                    <span className="sensaciones-nota-texto">«{s.clientNote.trim()}»</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
};
