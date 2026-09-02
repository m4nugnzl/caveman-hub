import { useMemo } from 'react';

import { weekAdherence } from '@/domain/analytics';
import { blockPlannedVolume, blocksOf, currentBlock, weekLabel, weeksOfBlock } from '@/domain/blocks';
import { metricColor } from '@/domain/metrics';
import { MapaMuscular } from '@/components/ui/MapaMuscular';
import { executedSessions } from '@/domain/sessions';
import { MRV_GOALS, unitLabel, weekTonnage } from '@/domain/training';
import { BarBandChart } from '@/components/ui/charts';
import { Tarjeta, TarjetaVacia } from './Tarjeta';

/** Semanas de tonelaje que caben como columnas legibles. */
const MAX_SEMANAS = 12;

/**
 * EL ENTRENO — cuánto mueve cada semana, y cuánto le has puesto a cada músculo.
 *
 *     TONELAJE POR SEMANA                 VOLUMEN DEL BLOQUE
 *     ▂▃▄▅▆▇ ╱ 7.418 kg                   pecho     ▓▓▓▓▓▓░░░  11/20
 *     S1 … S7                             tríceps   ▓▓▓▓▓░░░░   9/18
 *
 * ══ Las dos formas, y por qué son las de siempre ═══════════════════════════
 *
 * · El tonelaje son BARRAS con la línea que las une (`BarBandChart`): una
 *   magnitud desde cero, semana a semana, la misma pieza que tenía el panel
 *   desde el principio y la que se lee de un vistazo.
 * · El volumen son las MISMAS barras de escala que «Cómo lo lleva», al lado:
 *   un valor sobre su tope (las series pautadas sobre el MRV), con la cifra a la
 *   derecha. Un anillo por músculo era otro idioma para el mismo tipo de dato.
 *
 * El color es del dato y es uno: el tonelaje lleva el suyo y las series el
 * suyo. Solo se pinta distinto lo que se pasa del MRV.
 *
 * La rutina por días, la carga ejercicio a ejercicio y lo que cuenta al acabar
 * cada sesión se abren en su ventana (`PanelEntreno`).
 */
export const TarjetaEntreno = ({ program, microcycles, cycleType, latestWeek, isClient = false, onAbrir }) => {
  const unit = unitLabel(cycleType);
  const bloque = useMemo(() => currentBlock(program), [program]);
  const bloques = useMemo(() => blocksOf(program), [program]);
  const semanasBloque = useMemo(() => weeksOfBlock(program, bloque || {}), [program, bloque]);
  const pautado = useMemo(() => blockPlannedVolume(program, bloque || {}), [program, bloque]);
  const adherencia = latestWeek ? weekAdherence(microcycles, latestWeek) : null;

  /* La semana EN CURSO se dibuja apagada: a mitad de semana su tonelaje es la
     mitad, y apagada se lee como lo que es —sin cerrar— y no como una caída. */
  const enCurso = useMemo(() => {
    const ultima = [...microcycles].sort((a, b) => b.weekNumber - a.weekNumber)[0];
    return ultima && executedSessions(ultima).length < (ultima.days || []).length ? ultima.weekNumber : null;
  }, [microcycles]);

  const tonelaje = useMemo(
    () =>
      semanasBloque
        .slice(-MAX_SEMANAS)
        .map((w) => ({
          label: weekLabel(program, w, unit.charAt(0)).replace(/^B\d+·/, ''),
          value: weekTonnage(microcycles, w),
          highlight: w !== enCurso,
        }))
        /* Una semana sin sesión anotada es un hueco, no un cero: en barras un
           cero es una caída que no ha existido. */
        .filter((t) => t.value > 0),
    [semanasBloque, microcycles, program, unit, enCurso]
  );
  const conKilos = tonelaje.length > 0;

  const musculos = useMemo(
    () =>
      Object.entries(pautado.porMusculo)
        .map(([name, v]) => ({ name, media: v.media ?? 0, mrv: MRV_GOALS[name]?.mrv ?? null }))
        .filter((m) => m.media > 0)
        .sort((a, b) => b.media - a.media),
    [pautado]
  );
  /* El tope de las barras: el MRV del grupo, y para los que no lo tienen, el
     mayor de la lista, para que sigan siendo comparables entre sí. */
  const topeSinMrv = Math.max(1, ...musculos.map((m) => m.mrv || m.media));

  const contexto = [
    bloque?.name || 'Bloque 1',
    semanasBloque.length > 0 ? `${unit.charAt(0)}${semanasBloque[0]}–${semanasBloque[semanasBloque.length - 1]}` : null,
    pautado.media !== null ? `${pautado.media} series/${unit.toLowerCase()}` : null,
    adherencia ? `${adherencia.pct} % registradas` : null,
    bloques.length > 1 ? `${bloques.length} bloques` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const vacio = !conKilos && musculos.length === 0;

  return (
    <Tarjeta
      rotulo={isClient ? 'Tu entreno' : 'El entreno'}
      span={12}
      vacia={vacio}
      accion={
        <button type="button" className="cab-accion is-puerta" aria-haspopup="dialog" onClick={onAbrir}>
          Ver a fondo
        </button>
      }
    >
      {vacio ? (
        <TarjetaVacia>
          {isClient ? 'Cuando tengas rutina y sesiones anotadas, aquí verás cuánto mueves.' : 'Sin rutina montada ni sesiones anotadas todavía.'}
        </TarjetaVacia>
      ) : (
        <>
          <span className="tarjeta-meta">{contexto}</span>
          <div className="entreno-par">
            <section className="hoja-tramo">
              <h3 className="bloque-titulo">Tonelaje por {unit.toLowerCase()}</h3>
              {!conKilos ? (
                <TarjetaVacia>Sin series anotadas en este bloque.</TarjetaVacia>
              ) : (
                <>
                  <BarBandChart bars={tonelaje} color={metricColor('tonnage')} unit=" kg" height={236} />
                  <p className="tarjeta-pie">
                    Kilos totales que movió cada {unit.toLowerCase()} del bloque.
                    {enCurso !== null ? ' La apagada es la que está en curso.' : ''}
                  </p>
                </>
              )}
            </section>

            <section className="hoja-tramo">
              <h3 className="bloque-titulo">Volumen del bloque</h3>
              {musculos.length === 0 ? (
                <TarjetaVacia>Sin ejercicios escritos en este bloque.</TarjetaVacia>
              ) : (
                <div className="volumen-par">
                  {/* El mapa a la izquierda de las barras: la misma cifra dos
                      veces, una para mirar y otra para leer. */}
                  <MapaMuscular musculos={musculos} />
                  <div className="subjetivo is-volumen">
                    {musculos.map((m) => {
                      const tope = m.mrv || topeSinMrv;
                      const pasado = Boolean(m.mrv) && m.media > m.mrv;
                      return (
                        <div className="subjetivo-fila" key={m.name} title={m.mrv ? `${m.name}: ${m.media} series de un MRV de ${m.mrv}` : m.name}>
                          <span className="subjetivo-k">{m.name}</span>
                          <span className="subjetivo-barra" aria-hidden="true">
                            <span
                              className="subjetivo-relleno"
                              style={{
                                width: `${Math.min(100, (m.media / tope) * 100)}%`,
                                background: pasado ? 'var(--negative)' : metricColor('sets'),
                              }}
                            />
                          </span>
                          <span className="subjetivo-v" style={pasado ? { color: 'var(--negative)' } : undefined}>
                            {m.media}
                            {m.mrv && <small>/{m.mrv}</small>}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="tarjeta-pie">Series pautadas por {unit.toLowerCase()} sobre el MRV estimado de cada grupo.</p>
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </Tarjeta>
  );
};
