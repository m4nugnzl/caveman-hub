import { useMemo } from 'react';

import { perimeterSeries, seriesDelta, weightSeries } from '@/domain/anthropometry';
import { metricColor } from '@/domain/metrics';
import { allSessions } from '@/domain/sessions';
import { trainingDayCount } from '@/domain/training';
import { daysBetween, shortDate } from '@/lib/dates';
import { fmt } from '@/lib/num';
import { Tarjeta, TarjetaVacia } from './Tarjeta';

const signo = (v, decimals = 1) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v), { decimals })}`;

/**
 * DESDE QUE EMPEZÓ — lo que ha cambiado, en cuatro cifras.
 *
 * ══ Por qué esto y no la adherencia ════════════════════════════════════════
 *
 * Aquí iba «esta semana»: series anotadas, sesiones hechas, pesajes. Son cosas
 * que se dan por hechas —lo raro es que falten, y de eso ya avisa la cabecera—
 * y una tarjeta que casi siempre dice «todo bien» deja de mirarse.
 *
 * Lo que sí se mira, y lo que se le enseña a la persona cuando flaquea, es la
 * HISTORIA: cuánto ha bajado desde el primer día, cuánto ha estrechado, cuánto
 * lleva. Es la razón por la que paga, contada en cuatro números.
 *
 *     −3,4 kg        −2,8 cm         47 sesiones       15 semanas
 *     de peso        de cintura      4 a la semana     desde el 18 may
 *
 * ── Sin el «mejor ejercicio» ────────────────────────────────────────────────
 * Estuvo: «+62 kg en prensa 45°». El ejercicio que más sube es casi siempre el
 * que más carga admite, no el que importa, y una cifra así se lee como un
 * titular de gimnasio. La fuerza se cuenta en su tarjeta, con su curva.
 */
export const TarjetaDesde = ({ history, microcycles, program, startDate, hoy, isClient = false }) => {
  const cifras = useMemo(() => {
    const out = [];

    const pesos = weightSeries(history);
    const peso = seriesDelta(pesos);
    if (peso && pesos.length > 1) {
      out.push({ id: 'peso', v: signo(peso.delta), u: 'kg', k: 'de peso', color: metricColor('weight') });
    }

    const cintura = perimeterSeries(history, 'ombligo');
    const dc = seriesDelta(cintura);
    if (dc && cintura.length > 1) {
      out.push({ id: 'cintura', v: signo(dc.delta), u: 'cm', k: 'de cintura', color: metricColor('waist') });
    }

    const sesiones = allSessions(microcycles).length;
    if (sesiones > 0) {
      const dias = program?.weeklySplit ? trainingDayCount(program.weeklySplit) : null;
      out.push({
        id: 'sesiones',
        v: `${sesiones}`,
        u: sesiones === 1 ? 'sesión' : 'sesiones',
        k: dias ? `${dias} a la semana` : 'anotadas',
        color: null,
      });
    }

    const semanas = startDate ? Math.max(1, Math.floor((daysBetween(startDate, hoy) ?? 0) / 7) + 1) : null;
    if (semanas) {
      out.push({
        id: 'tiempo',
        v: `${semanas}`,
        u: semanas === 1 ? 'semana' : 'semanas',
        k: `desde el ${shortDate(startDate)}`,
        color: null,
      });
    }
    return out;
  }, [history, microcycles, program, startDate, hoy]);

  return (
    <Tarjeta rotulo={isClient ? 'Desde que empezaste' : 'Desde que empezó'} span={4} vacia={cifras.length === 0}>
      {cifras.length === 0 ? (
        <TarjetaVacia>
          {isClient ? 'Con tus primeros pesajes y sesiones, aquí verás cuánto has cambiado.' : 'Con dos pesajes o dos sesiones, aquí se cuenta cuánto ha cambiado.'}
        </TarjetaVacia>
      ) : (
        <ul className="desde">
          {cifras.map((c) => (
            <li className="desde-cifra" key={c.id}>
              <span className="desde-v" style={c.color ? { color: c.color } : undefined}>
                {c.v}
                <small> {c.u}</small>
              </span>
              <span className="desde-k">{c.k}</span>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
};
