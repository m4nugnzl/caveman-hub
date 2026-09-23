import { useMemo } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

import { metricPoints } from '@/domain/analytics';
import { perimeterSeries, seriesDelta, weightSeries } from '@/domain/anthropometry';
import { directionById } from '@/domain/goals';
import { allSessions } from '@/domain/sessions';
import { trainingDayCount } from '@/domain/training';
import { daysBetween, localeNumber, shortDate } from '@/lib/dates';
import { fmt } from '@/lib/num';
import { useOculto } from '@/components/Client/Oculto';

const signo = (v, decimals = 1) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${fmt(Math.abs(v), { decimals })}`;
const kg = (v) => localeNumber(v, { maximumFractionDigits: 1 });

const FLECHA = { up: ArrowUpRight, down: ArrowDownRight, flat: Minus };

/*
  Hacia dónde se movió una cifra y, solo si hay contra qué juzgarlo, si eso es
  lo que se buscaba. El peso se juzga contra el OBJETIVO que tiene puesto
  (bajar, mantener, subir); sin objetivo, o para el cliente, la flecha dice
  hacia dónde va y nada más: la nota es de su entrenador (ver `TarjetaProgreso`).
*/
const tendencia = (delta, sentido = null) => {
  if (delta === null || delta === undefined || !Number.isFinite(delta)) return null;
  const dir = Math.abs(delta) < 0.05 ? 'flat' : delta > 0 ? 'up' : 'down';
  if (sentido === null || sentido === undefined || dir === 'flat') return { dir, tono: 'flat' };
  if (sentido === 0) return { dir, tono: 'flat' };
  return { dir, tono: Math.sign(delta) === Math.sign(sentido) ? 'good' : 'bad' };
};

/**
 * LA FRANJA DE CIFRAS — lo que ha cambiado desde el primer día, arriba del todo.
 *
 * ══ Por qué sale de «El progreso» (19 sep, tercera vuelta) ═════════════════
 *
 * Eran seis o siete cajas grises al pie de la gráfica: el contexto del dibujo,
 * leído DESPUÉS del dibujo. El dueño pidió la forma de cualquier panel de
 * producto —Linear, Vercel—: una fila de mini-tarjetas encima de todo, cada
 * una con su rótulo pequeño, su cifra grande en monoespaciada y, al lado, hacia
 * dónde se mueve. Es lo primero que se lee al abrir a una persona, y lo que se
 * compara entre personas.
 *
 *     ┌ PESO TOTAL ──┐ ┌ ESTA SEMANA ─┐ ┌ CINTURA ─────┐ ┌ ENTRENOS ─┐
 *     │ +1,5 kg  ↗   │ │ −0,2 kg  ↘   │ │ −2,8 cm  ↘   │ │ 38 ses.   │
 *     │ de 78,4 a 79,9│ │ desde el lunes│ │ desde el inicio│ │ 4 a la sem.│
 *     └──────────────┘ └──────────────┘ └──────────────┘ └───────────┘
 *
 * Sigue siendo una lista variable: la cintura no existe hasta que hay dos
 * perímetros, y a quien le ocultan el peso se le retiran las dos cifras del
 * peso —las otras siguen, porque cuánto ha cambiado no es solo la báscula—.
 * La fase ya no va aquí (21 sep): la dice la tarjeta «Roadmap» de la columna
 * de al lado (`TarjetaRoadmap`), con su semana, su desvío y lo que viene.
 */
export const FranjaCifras = ({
  serie,
  history,
  microcycles,
  program,
  startDate,
  hoy,
  checkIn,
  pesoWow,
  goal,
  isClient = false,
}) => {
  const oculto = useOculto();
  const sentido = !isClient && goal ? (directionById(goal.direction)?.sign ?? null) : null;
  const pesajes = metricPoints(serie, 'weight').length;

  const cifras = useMemo(() => {
    const out = [];

    const pesos = weightSeries(history);
    const peso = seriesDelta(pesos);
    if (peso && pesos.length > 1 && !oculto.weight) {
      out.push({
        id: 'peso',
        k: 'Peso total',
        num: signo(peso.delta),
        unidad: 'kg',
        s: `de ${kg(peso.from)} a ${kg(peso.to)} kg`,
        t: tendencia(peso.delta, sentido),
      });
    }

    if (pesoWow?.delta !== null && pesoWow?.delta !== undefined && !oculto.weight) {
      out.push({
        id: 'semana',
        k: 'Esta semana',
        num: signo(pesoWow.delta),
        unidad: 'kg',
        s: 'contra la anterior',
        t: tendencia(pesoWow.delta, sentido),
      });
    }

    const cintura = perimeterSeries(history, 'ombligo');
    const dc = seriesDelta(cintura);
    if (dc && cintura.length > 1) {
      out.push({ id: 'cintura', k: 'Cintura', num: signo(dc.delta), unidad: 'cm', s: 'desde el inicio', t: tendencia(dc.delta) });
    }

    const sesiones = allSessions(microcycles).length;
    if (sesiones > 0) {
      const dias = program?.weeklySplit ? trainingDayCount(program.weeklySplit) : null;
      out.push({
        id: 'sesiones',
        k: 'Entrenos',
        num: String(sesiones),
        unidad: sesiones === 1 ? 'sesión' : 'ses.',
        s: dias ? `${dias} a la semana` : null,
      });
    }

    const semanasVividas = startDate
      ? Math.max(1, Math.floor((daysBetween(startDate, hoy) ?? 0) / 7) + 1)
      : null;
    if (semanasVividas) {
      out.push({ id: 'tiempo', k: 'Semanas', num: String(semanasVividas), unidad: 'sem.', s: `desde el ${shortDate(startDate)}` });
    }

    if (checkIn && pesajes > 0) {
      out.push({
        id: 'pesajes',
        k: 'Pesajes',
        num: checkIn.asked ? `${checkIn.count}/${checkIn.target}` : `${checkIn.count}`,
        unidad: null,
        s: 'esta semana',
      });
    }

    return out;
  }, [history, microcycles, program, startDate, hoy, oculto.weight, checkIn, pesajes, pesoWow, sentido]);

  return (
    /* A lo ancho de las dos columnas: la fase, que ocupaba la celda de
       encima de «El plan», es ahora la tarjeta «Roadmap» de esa columna. */
    <section className="kpis" aria-label={isClient ? 'Tus cifras' : 'Sus cifras'}>
      <div className="kpis-trabajo">
        {cifras.map((c) => {
          const Flecha = c.t ? FLECHA[c.t.dir] : null;
          return (
            <div className="kpi" key={c.id}>
              <span className="kpi-k">{c.k}</span>
              <span className="kpi-fila">
                <span className="kpi-v">
                  {c.num}
                  {c.unidad && <small>{c.unidad}</small>}
                </span>
                {Flecha && (
                  <span className={`kpi-tendencia is-${c.t.tono}`} aria-hidden="true">
                    <Flecha size={13} strokeWidth={2.5} />
                  </span>
                )}
              </span>
              {c.s && <span className="kpi-s">{c.s}</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
};
