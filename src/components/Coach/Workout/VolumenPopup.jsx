import { BarChart2 } from 'lucide-react';

import { MRV_GOALS } from '@/domain/training';
import { metricColor } from '@/domain/metrics';
import { Modal } from '@/components/ui/Modal';

/**
 * EL VOLUMEN DEL BLOQUE, EXPLICADO: cuánto, de qué, en qué hoja.
 *
 * La tarjeta del costado dice cuántas series lleva cada grupo. Aquí se ve
 * CÓMO se reparten: una fila por grupo, una columna por hoja, y en cada
 * celda las series que esa hoja le da. Con eso se contesta lo que la suma
 * esconde —si el pecho va todo en un día, si la pierna se toca dos veces— y
 * al final de cada fila el total contra el tramo útil: por debajo del MEV no
 * estimula, por encima del MRV no se recupera.
 *
 * ── Las cifras de arriba ────────────────────────────────────────────────────
 * Series totales, cuántas hojas y cuánto toca a cada una, y los grupos fuera
 * de rango. Son las cuatro preguntas que se hace un entrenador antes de tocar
 * una serie: ¿cuánto trabajo?, ¿cómo de largas las sesiones?, ¿me paso en
 * algo?, ¿me quedo corto en algo?
 */
const cuenta = (n, singular, plural) => `${n} ${n === 1 ? singular : plural}`;

export const VolumenPopup = ({ open, onClose, bloque, hojas, unidad }) => {
  const grupos = [...new Set(hojas.flatMap((h) => Object.keys(h.volumen)))]
    .map((name) => {
      const porHoja = hojas.map((h) => h.volumen[name] || 0);
      const total = porHoja.reduce((a, b) => a + b, 0);
      const meta = MRV_GOALS[name] || {};
      return {
        name,
        porHoja,
        total,
        frecuencia: porHoja.filter((n) => n > 0).length,
        mev: meta.mev ?? null,
        mrv: meta.mrv ?? null,
        pasado: Boolean(meta.mrv) && total > meta.mrv,
        corto: Boolean(meta.mev) && total > 0 && total < meta.mev,
      };
    })
    .filter((g) => g.total > 0)
    .sort((a, b) => b.total - a.total);

  const seriesTotales = grupos.reduce((n, g) => n + g.total, 0);
  const pasados = grupos.filter((g) => g.pasado);
  const cortos = grupos.filter((g) => g.corto);
  const tope = Math.max(1, ...grupos.map((g) => g.mrv || g.total));
  /* La barra llena es el MRV, como siempre. Solo al pasarse la barra se
     estira hasta el total y aparece la raya del MRV: lo que queda a su
     derecha es lo que sobra. */
  const escala = (g) => (g.pasado ? g.total : g.mrv || tope);
  const u = unidad.toLowerCase();
  /* ── Las columnas del frame `202:4`, en el mismo orden ───────────────────
     grupo · una por hoja · veces · total · el tramo útil. El total y la barra
     eran UNA celda —«Total · MEV–MRV»— y el frame los separa: son dos lecturas
     distintas (cuánto lleva, y dónde cae eso), y juntas en una celda la cifra
     bailaba a la izquierda de barras de anchos distintos. */
  const columnas = `minmax(110px, 1.3fr) repeat(${hojas.length}, minmax(44px, 1fr)) 52px 64px minmax(120px, 1.4fr)`;

  return (
    <Modal
      open={open}
      size="lg"
      icono={BarChart2}
      title={`Volumen · ${bloque.name}`}
      onClose={onClose}
    >
      {grupos.length === 0 ? (
        <p className="t-sm t-tertiary">Sin ejercicios todavía.</p>
      ) : (
        <div className="volumen">
          <div className="bloque-cifras is-4">
            <div className="bloque-cifra">
              <span className="v">{seriesTotales}</span>
              <span className="k">series por {u}</span>
            </div>
            <div className="bloque-cifra">
              <span className="v">{Math.round(seriesTotales / Math.max(1, hojas.length))}</span>
              <span className="k">series por hoja, de media</span>
            </div>
            <div className="bloque-cifra">
              <span className="v">{pasados.length}</span>
              <span className="k">{pasados.length === 1 ? 'grupo sobre el MRV' : 'grupos sobre el MRV'}</span>
            </div>
            <div className={`bloque-cifra${cortos.length > 0 ? ' is-aviso' : ''}`}>
              <span className="v">{cortos.length}</span>
              <span className="k">{cortos.length === 1 ? 'grupo bajo el MEV' : 'grupos bajo el MEV'}</span>
            </div>
          </div>

          <p className="t-sm t-secondary">
            Series pautadas por {u}, repartidas por hoja. La barra del final es el tramo útil de cada grupo: la marca es el MEV —por debajo apenas estimula— y el
            tope el MRV —por encima cuesta recuperarse; si se pasa, una segunda raya marca dónde estaba—. «Veces» dice en cuántas hojas se trabaja el grupo.
          </p>

          <div className="volumen-tabla" role="table" aria-label="Series por grupo y por hoja">
            <div className="volumen-fila is-head" role="row" style={{ gridTemplateColumns: columnas }}>
              <span>Grupo</span>
              {hojas.map((h) => (
                <span key={h.dayName} className="volumen-hoja" title={h.dayName}>
                  {h.dayName}
                </span>
              ))}
              <span className="volumen-num">Veces</span>
              <span className="volumen-num">Total</span>
              <span>MEV – MRV</span>
            </div>
            {grupos.map((g) => (
              <div key={g.name} className="volumen-fila" role="row" style={{ gridTemplateColumns: columnas }}>
                <span className="volumen-grupo">{g.name}</span>
                {g.porHoja.map((n, i) => (
                  <span key={hojas[i].dayName} className={`volumen-celda${n === 0 ? ' is-vacia' : ''}`} title={n > 0 ? `${cuenta(n, 'serie', 'series')} de ${g.name} en ${hojas[i].dayName}` : undefined}>
                    {n > 0 ? n : '·'}
                  </span>
                ))}
                <span className="volumen-num" title={`${g.name} se trabaja en ${cuenta(g.frecuencia, 'hoja', 'hojas')} por ${u}`}>
                  {g.frecuencia}
                </span>
                <span className={`volumen-v${g.pasado ? ' is-sobre' : g.corto ? ' is-aviso' : ''}`}>
                  {g.total}
                  {g.mrv && <small>/{g.mrv}</small>}
                </span>
                <span className="volumen-barra" aria-hidden="true">
                  <span
                    className="volumen-relleno"
                    style={{ width: `${Math.min(100, (g.total / escala(g)) * 100)}%`, background: g.pasado ? 'var(--data-violet)' : g.corto ? 'var(--warning)' : metricColor('sets') }}
                  />
                  {g.mev && g.mrv && <span className="volumen-mev" style={{ left: `${(g.mev / escala(g)) * 100}%` }} title={`MEV ${g.mev}`} />}
                  {g.pasado && <span className="volumen-mev" style={{ left: `${(g.mrv / escala(g)) * 100}%` }} title={`MRV ${g.mrv}`} />}
                </span>
              </div>
            ))}
            <div className="volumen-fila is-suma" role="row" style={{ gridTemplateColumns: columnas }}>
              <span className="volumen-grupo">Por hoja</span>
              {hojas.map((h) => (
                <span key={h.dayName} className="volumen-celda" title={`${h.series} series en ${h.dayName}`}>
                  {h.series}
                </span>
              ))}
              <span />
              {/* El total del microciclo va en la píldora llena, que es la
                  única de la tabla: todas las demás cifras son partes de ésta.
                  Y a su derecha, escrito, de qué es — sin eso, una cifra sola
                  al pie de una tabla de catorce filas no dice de qué habla. */}
              <span className="volumen-suma">{seriesTotales}</span>
              <span className="volumen-suma-que">Total {u}</span>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};
