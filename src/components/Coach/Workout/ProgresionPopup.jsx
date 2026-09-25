import { useMemo, useState } from 'react';
import { TrendingUp } from 'lucide-react';

import {
  cambioEnElBloque,
  cargaIndexada,
  lineaDeRendimiento,
  seriesDelMicrociclo,
  variacionDelCambio,
} from '@/domain/rendimiento';
import { metricColor } from '@/domain/metrics';
import { localeNumber, shortDate } from '@/lib/dates';
import { Modal } from '@/components/ui/Modal';
import { SegmentedControl } from '@/components/ui/primitives';
import { BandChart } from '@/components/ui/charts';

/**
 * La progresión de un ejercicio, en grande.
 *
 * ══ EL MODELO DE SIEMPRE, CON OTRA VARA (25 sep) ═══════════════════════════
 * Las piezas son las de la ventana del 17 sep (frame 48:180): la caja hundida
 * de las cifras, la curva con su leyenda y la tabla entera en pastillas. Lo
 * que cambia es la métrica: donde había kilos tope y un máximo estimado, ahora
 * está el ÍNDICE DE RENDIMIENTO (`lineaDeRendimiento`: la mejor serie de cada
 * microciclo, Epley con el RIR dentro, primer registro del tramo = 100). Los
 * kilos solos no comparan 34 × 8 con 36 × 4; el índice sí. Y el máximo
 * teórico no sale nunca a la pantalla.
 *
 * La segunda serie es la CARGA en el mismo índice (`cargaIndexada`), punteada
 * y en gris: dice de dónde sale la subida. Si sube con el rendimiento, subió
 * el peso; si se queda en 100, subieron las repeticiones o bajó el RIR.
 *
 * ── Un microciclo sin registro ─────────────────────────────────────────────
 * En la curva, se une el de antes con el de después: la línea no se corta. En
 * la tabla sí se ve, con su renglón «sin registro».
 *
 * ── Sin juicio ─────────────────────────────────────────────────────────────
 * Ni verde ni rojo. La serie que da el punto lleva un filo del color de la
 * curva —es LA que se está dibujando—, y el resto van iguales.
 *
 * @param semanas los `weekNumber` del bloque, en orden. Con ellos sale el
 *   conmutador «Este bloque / Todo el historial»; sin ellos, todo.
 */

const COLOR = metricColor('rendimiento');

const VISTAS = [
  { id: 'bloque', label: 'Este bloque' },
  { id: 'todo', label: 'Todo el historial' },
];

/** «B2·M3» → «M3»: dentro de un bloque, el bloque ya se sabe. */
export const etiquetaCorta = (etiqueta, w) => String(etiqueta(w)).split('·').pop();

const serieCorta = (s) => `${localeNumber(s.kg)}×${localeNumber(s.reps)}`;

export const ProgresionPopup = ({ open, onClose, microcycles, name, semanas = null, etiqueta = (w) => `S${w}` }) => {
  const [vista, setVista] = useState(semanas ? 'bloque' : 'todo');
  const enBloque = vista === 'bloque' && Boolean(semanas);

  const linea = useMemo(() => {
    if (!name) return [];
    if (enBloque) return lineaDeRendimiento(microcycles, name, semanas);
    /* Todo el historial, del primer microciclo en que lo hizo al último: los
       de antes y después no son huecos, son otra época. */
    const entera = lineaDeRendimiento(microcycles, name);
    const con = entera.map((p, i) => (p.indice !== null ? i : -1)).filter((i) => i >= 0);
    return con.length ? entera.slice(con[0], con[con.length - 1] + 1) : [];
  }, [microcycles, name, semanas, enBloque]);

  const porSemana = useMemo(() => new Map((microcycles || []).map((m) => [m.weekNumber, m])), [microcycles]);
  const filas = useMemo(
    () => linea.map((p) => ({ ...p, registro: seriesDelMicrociclo(porSemana.get(p.semana), name) })),
    [linea, porSemana, name]
  );

  const cambio = cambioEnElBloque(linea);
  const carga = cargaIndexada(linea);
  const conDato = linea.filter((p) => p.indice !== null);
  const primera = conDato[0];
  const ultima = conDato[conDato.length - 1];
  const rotulo = (w) => (enBloque ? etiquetaCorta(etiqueta, w) : etiqueta(w));
  const labels = linea.map((p) => rotulo(p.semana));
  const columnas = Math.max(1, ...filas.map((f) => f.registro?.series.length || 0));
  const rejilla = { gridTemplateColumns: `60px 80px repeat(${columnas}, minmax(84px, 1fr)) 56px` };

  return (
    <Modal open={open} size="lg" icono={TrendingUp} title={name ? `Progresión · ${name}` : 'Progresión'} onClose={onClose}>
      <div className="progresion">
        {semanas && (
          <SegmentedControl value={vista} onChange={setVista} options={VISTAS} label="Qué tramo se mide" />
        )}

        {!cambio ? (
          <p className="t-sm t-tertiary">
            {enBloque
              ? 'Todavía no hay ninguna serie con kilos y repeticiones de este ejercicio en el bloque.'
              : 'Todavía no hay ninguna serie con kilos y repeticiones de este ejercicio.'}
          </p>
        ) : (
          <>
            <div className="bloque-cifras is-3 progresion-cifras">
              <div className="bloque-cifra">
                <span className="v">{variacionDelCambio(cambio)}</span>
                <span className="k">{enBloque ? 'Rendimiento en el bloque' : 'Rendimiento en el historial'}</span>
              </div>
              <div className="bloque-cifra">
                <span className="v">
                  {serieCorta(ultima)}
                  {ultima.rir !== null && <small>@{localeNumber(ultima.rir)}</small>}
                </span>
                <span className="k">Mejor serie ahora</span>
                {conDato.length > 1 && <span className="k is-desde">desde {serieCorta(primera)}</span>}
              </div>
              <div className="bloque-cifra">
                <span className="v">
                  {conDato.length}
                  <small>de {linea.length}</small>
                </span>
                <span className="k">Microciclos registrados</span>
              </div>
            </div>

            {/* El 100 es el primer registro del tramo: «inicio». Cuatro rejas,
                las del frame (`48:211`–`48:214`). */}
            <BandChart
              labels={labels}
              series={[
                {
                  id: 'rend',
                  label: 'Rendimiento',
                  color: COLOR,
                  decimals: 0,
                  points: linea.map((p, i) => ({ label: labels[i], value: p.indice })),
                },
                {
                  id: 'carga',
                  label: 'Carga',
                  color: metricColor('cargaIndexada'),
                  decimals: 0,
                  dash: true,
                  area: false,
                  points: carga.map((v, i) => ({ label: labels[i], value: v })),
                },
              ]}
              referencia={{ valor: 100, rotulo: 'inicio' }}
              /* Suavizada, con los extremos en su dato: el primero es el 100. */
              smooth
              height={200}
              gridLines={4}
            />

            {/* La tabla entera: todas las series de cada microciclo. La mesa
                mide las columnas una vez para todos los renglones (ver
                `.progresion-mesa`). */}
            <div className="progresion-mesa">
              <div className="progresion-tabla" role="table" aria-label={`${name}: todas las series de cada microciclo`}>
                <div className="progresion-fila is-head" role="row" style={rejilla}>
                  <span role="columnheader">Micro</span>
                  <span role="columnheader">Fecha</span>
                  {Array.from({ length: columnas }, (_, i) => (
                    <span key={i} role="columnheader">
                      Serie {i + 1}
                    </span>
                  ))}
                  <span role="columnheader" className="progresion-indice">
                    Índice
                  </span>
                </div>
                {filas.map((f) => (
                  <div key={f.semana} className="progresion-fila" role="row" style={rejilla}>
                    <span className="progresion-sem" role="rowheader">
                      {rotulo(f.semana)}
                    </span>
                    <span className="progresion-fecha" role="cell">
                      {f.registro?.fecha ? shortDate(f.registro.fecha) : '—'}
                    </span>
                    {!f.registro ? (
                      <span className="progresion-sin" role="cell" style={{ gridColumn: `3 / span ${columnas}` }}>
                        sin registro
                      </span>
                    ) : (
                      Array.from({ length: columnas }, (_, i) => {
                        const set = f.registro.series[i];
                        if (!set) return <span key={i} className="progresion-celda is-vacia" role="cell">—</span>;
                        const cuenta = i === f.registro.cuenta;
                        return (
                          <span
                            key={i}
                            role="cell"
                            className={`progresion-celda${cuenta ? ' is-cuenta' : ''}`}
                            style={cuenta ? { '--filo': COLOR } : undefined}
                            title={cuenta ? 'La serie que da el punto de la curva' : undefined}
                          >
                            {set.kg === null ? '—' : localeNumber(set.kg)}×{set.reps === null ? '—' : localeNumber(set.reps)}
                            {set.rir !== null && <small>@{localeNumber(set.rir)}</small>}
                          </span>
                        );
                      })
                    )}
                    <span className="progresion-indice" role="cell">
                      {f.indice === null ? '—' : Math.round(f.indice)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};
