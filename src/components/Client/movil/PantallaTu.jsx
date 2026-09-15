import { AccountMenu } from '@/components/AccountMenu';
import { Aire, CabeceraDia, FilaMenu, Record, Tarjeta, Titulillo } from './Piezas';

/**
 * «TÚ» EN EL TELÉFONO — tu cuerpo y tu rastro. Esta pantalla es pasado.
 *
 * ══ El orden ══════════════════════════════════════════════════════════════
 *
 *   1. **El récord** — desde cuándo, cuántas sesiones, cuántas entregas. Es la
 *      cifra que hace que la app valga sin entrenador, y aquí es además quien te
 *      dice quién eres dentro de ella.
 *   2. **La aguja del peso** con su curva y su objetivo.
 *   3. **Tus fotos**, en tira.
 *   4. **El menú**: lo que se hace de vez en cuando.
 *
 * ══ «Cerrar la semana» vive aquí ═══════════════════════════════════════════
 *
 * Y es la consecuencia de que la barra del pulgar tenga cuatro destinos y no
 * cinco: la revisión baja a una fila, con su estado escrito al lado y en azul
 * cuando espera. No se pierde el recordatorio —el pedido de la portada lo sigue
 * sacando arriba el día que toca— y se gana que los cuatro destinos se lean.
 * Ver `CLIENT_SECTIONS` y `BarraDelPulgar`.
 */
export const PantallaTu = ({ datos }) => {
  const { nombre, record, peso, fotos, menu, cuenta } = datos;

  return (
    <>
      <CabeceraDia fecha={nombre} />
      <div className="tel-tramo">
        {record ? <Record items={record} /> : null}

        {peso ? (
          <Tarjeta>
            <div className="tel-aguja">
              <div className="tel-n">
                {peso.ahora}
                <small> kg</small>
              </div>
              {peso.delta ? (
                <div className={`tel-delta${peso.sube ? ' tel-sube' : ''}`}>{peso.delta}</div>
              ) : null}
            </div>
            {peso.puntos.length > 2 ? <Trazo puntos={peso.puntos} /> : null}
            <div className="tel-eje-peso">
              <span>{peso.desde}</span>
              {peso.objetivo ? <span>objetivo {peso.objetivo}</span> : null}
              <span>hoy</span>
            </div>
          </Tarjeta>
        ) : null}

        {fotos.length > 0 ? (
          <>
            <Titulillo accion={<a href="/mi/evolucion/fotos">Todas</a>}>Tus fotos</Titulillo>
            <div className="tel-tiras-foto">
              {fotos.map((f) =>
                f.url ? (
                  <img key={f.id} src={f.url} alt={f.angulo} loading="lazy" />
                ) : (
                  <i key={f.id} />
                )
              )}
            </div>
          </>
        ) : null}

        <div className="tel-menu">
          {menu.map((f) => (
            <FilaMenu key={f.rotulo} {...f} />
          ))}
        </div>

        <div className="tel-menu">
          {cuenta.map((f) => (
            <FilaMenu key={f.rotulo} {...f} />
          ))}
          {/* La cuenta es el menú que ya existe con su traje de fila, no una
              cuarta copia de sus tres opciones. */}
          <div className="tel-fila-menu tel-cuenta">
            <AccountMenu variante="fila" />
          </div>
        </div>

        <Aire />
      </div>
    </>
  );
};

/** La curva del peso, del primer pesaje a hoy. */
const Trazo = ({ puntos }) => {
  const min = Math.min(...puntos);
  const max = Math.max(...puntos);
  const rango = max - min || 1;
  const d = puntos
    .map(
      (v, i) =>
        `${i ? 'L' : 'M'}${((i * 300) / (puntos.length - 1)).toFixed(1)},${(
          62 -
          ((v - min) / rango) * 54
        ).toFixed(1)}`
    )
    .join(' ');
  return (
    <svg viewBox="0 0 300 70" preserveAspectRatio="none" className="tel-trazo" aria-hidden="true">
      <path
        d={d}
        stroke="var(--accent)"
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
