import { useMemo } from 'react';
import { TrendingUp } from 'lucide-react';

import { exerciseTrend } from '@/domain/week';
import { estimatedOneRm } from '@/domain/training';
import { metricColor } from '@/domain/metrics';
import { shortDate } from '@/lib/dates';
import { toNum } from '@/lib/num';
import { Modal } from '@/components/ui/Modal';
import { BandChart } from '@/components/ui/charts';

/**
 * La progresión de un ejercicio, en grande.
 *
 * La tarjeta de al lado de la hoja enseña las últimas seis sesiones y las tres
 * primeras series: lo que cabe. Aquí está TODO: la curva del tope y del 1RM
 * estimado con sus ejes, y la tabla entera —todas las sesiones, todas las
 * series— para leer la progresión de este ejercicio de principio a fin.
 *
 * ══ EL DIBUJO (17 sep · frame 48:180) ══════════════════════════════════════
 *
 * Las piezas ya eran éstas; lo que el frame cambia es que ninguna estaba
 * CERRADA. Las tres cifras flotaban sobre el fondo de la ventana, la tabla era
 * una rejilla de pastillas con 3 px de canal y la leyenda se alineaba a la
 * izquierda como el pie de una foto. Tres cosas sueltas donde el dibujo tiene
 * tres bloques: la caja hundida de las cifras, la curva con su leyenda
 * centrada y la tabla con su canto y su banda de rótulos.
 *
 * Y de camino salieron tres defectos que no eran de estilo:
 *
 *   · LAS DOS SERIES DE LA CURVA IBAN DEL MISMO COLOR. `topKg` y `tonnage`
 *     son los dos `--data-violet`, así que el gráfico dibujaba dos veces la
 *     misma tinta con distinto recorrido. El 1RM tiene su propia desde hace
 *     tiempo (`e1rm`) y no la usaba nadie. Lo dice `metrics.js` por escrito:
 *     «dos series del mismo color en un gráfico son una sola serie mal
 *     dibujada».
 *   · LA COLUMNA «Sem.» ESCRIBÍA EL NÚMERO CRUDO. Ponía `S{week}` —o sea la
 *     semana absoluta del programa, «S27»— mientras la hoja, la tarjeta y la
 *     barra de al lado dicen «M3» o «B2·M1». `etiqueta` llega desde arriba
 *     justo para eso y aquí se usaba solo en el gráfico.
 *   · Y «kg desde S1» tenía el mismo fallo en el rótulo de la cifra.
 */
const numero = toNum;

export const ProgresionPopup = ({ open, onClose, microcycles, name, weekNumber, etiqueta = (w) => `S${w}` }) => {
  const trend = useMemo(() => (name ? exerciseTrend({ microcycles, name, weekNumber }) : null), [microcycles, name, weekNumber]);
  const sesiones = trend?.sessions || [];
  const series = Math.max(0, ...sesiones.map((s) => s.sets.length));
  /* Un solo rótulo para las tres lecturas —el eje, la cifra y la tabla—: es la
     misma sesión nombrada tres veces y no puede tener tres nombres. */
  const rotulo = (s) => etiqueta(s.week);
  const labels = sesiones.map(rotulo);
  const tope = sesiones.map((s) => ({ label: rotulo(s), value: s.topKg }));
  const rm = sesiones.map((s) => ({ label: rotulo(s), value: estimatedOneRm(s.top?.kg, s.top?.reps) }));
  const desde = sesiones[0] ? rotulo(sesiones[0]) : null;
  const delta =
    trend && trend.from !== null && trend.to !== null ? Math.round((trend.to - trend.from) * 10) / 10 : null;

  return (
    <Modal open={open} size="lg" icono={TrendingUp} title={name ? `Progresión · ${name}` : 'Progresión'} onClose={onClose}>
      {!trend ? (
        <p className="t-sm t-tertiary">Todavía no hay ninguna serie anotada de este ejercicio.</p>
      ) : (
        <div className="progresion">
          {/*
            ── LAS TRES CIFRAS ────────────────────────────────────────────
            La unidad se sale del rótulo y se sienta al lado de la cifra
            (`48:192`): «140 kg» es el dato y «Kg tope ahora» es de qué dato
            se está hablando. Mezclados —«140» arriba y «kg tope ahora»
            debajo— el número se quedaba sin unidad y el rótulo tenía que
            hacer dos trabajos.

            Y solo la BAJADA lleva tinta, que es la ley de la casa y también
            lo que hace el frame: el dibujo pinta su «-10 kg» en rojo y no
            pinta de verde ninguna subida.
          */}
          <div className="bloque-cifras is-3 progresion-cifras">
            <div className="bloque-cifra">
              <span className="v">
                {trend.to ?? '—'}
                <small>kg</small>
              </span>
              <span className="k">Kg tope ahora</span>
            </div>
            <div className={`bloque-cifra${delta !== null && delta < 0 ? ' is-mal' : ''}`}>
              <span className="v">
                {delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta}`}
                <small>kg</small>
              </span>
              <span className="k">{desde ? `Desde ${desde}` : 'Sin recorrido'}</span>
            </div>
            <div className="bloque-cifra">
              <span className="v">
                {trend.weeks}
                <small>{trend.weeks === 1 ? 'completada' : 'completadas'}</small>
              </span>
              <span className="k">Sesiones registradas</span>
            </div>
          </div>

          {/* Cuatro líneas de reja, que son las del frame (`48:211`–`48:214`):
              con tres, una curva que se mueve en veinte kilos se lee contra
              dos referencias y parece más plana de lo que es. */}
          <BandChart
            labels={labels}
            series={[
              { id: 'top', label: 'Kg tope', color: metricColor('topKg'), unit: ' kg', decimals: 1, points: tope },
              /* Punteada y en su tinta: el 1RM no se ha levantado nunca, se
                 calcula desde la serie tope. Ver `dash` en `charts.jsx`. */
              { id: 'rm', label: '1RM estimado', color: metricColor('e1rm'), unit: ' kg', decimals: 0, dash: true, points: rm },
            ]}
            height={200}
            gridLines={4}
            showArea={false}
            emptyMessage="Sin series con kilos todavía."
          />

          {/*
            ── LA TABLA ENTERA ────────────────────────────────────────────
            Cada registro va en su pastilla (`48:260`). No es adorno: una fila
            de seis series sin pastilla son seis cifras separadas por un
            espacio, y para saber de cuál es cada una hay que subir a contar
            rótulos. Con la pastilla, la columna se ve.
          */}
          {/* El envoltorio es el que desliza: la mesa mide `max-content` para
              que TODOS los renglones compartan columnas, y eso no lo puede
              hacer la misma caja que recorta. Ver `.progresion-mesa`. */}
          <div className="progresion-mesa">
            <div className="progresion-tabla" role="table" aria-label={`${name}: todos los microciclos`}>
              <div className="progresion-fila is-head" role="row" style={{ gridTemplateColumns: `60px 80px repeat(${series}, minmax(84px, 1fr))` }}>
                <span>Sem.</span>
                <span>Fecha</span>
                {Array.from({ length: series }, (_, i) => (
                  <span key={i}>Serie {i + 1}</span>
                ))}
              </div>
              {sesiones.map((s, fila) => (
                <div key={s.week} className={`progresion-fila${s.week === weekNumber ? ' is-actual' : ''}`} role="row" style={{ gridTemplateColumns: `60px 80px repeat(${series}, minmax(84px, 1fr))` }}>
                  <span className="progresion-sem">{rotulo(s)}</span>
                  <span className="progresion-fecha">{s.date ? shortDate(s.date) : '—'}</span>
                  {Array.from({ length: series }, (_, i) => {
                    const set = s.sets[i];
                    /* La raya, no el punto: es la misma que dice «aquí no hay
                       nada» en la hoja de series, y el frame la usa igual. */
                    if (!set) return <span key={i} className="progresion-celda is-vacia">—</span>;
                    const kg = numero(set.kg);
                    const antes = numero(sesiones[fila - 1]?.sets[i]?.kg);
                    /* Los mismos tres estados que la tarjeta que abre esta
                       ventana: bajada en rojo, igual en voz baja, subida en tinta
                       plena. */
                    const tono =
                      kg === null || antes === null ? '' : kg < antes ? 'is-baja' : kg > antes ? '' : 'is-igual';
                    return (
                      <span key={i} className={`progresion-celda${tono ? ` ${tono}` : ''}`}>
                        {set.kg ?? '—'}×{set.reps ?? '—'}
                        {set.rir !== null && set.rir !== undefined && set.rir !== '' && <small>@{set.rir}</small>}
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};
