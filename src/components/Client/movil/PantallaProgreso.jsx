import { useNavigate } from 'react-router-dom';

import { Aire, Cabecera, Record, Tarjeta, Titulillo } from './Piezas';

/**
 * «PROGRESO» EN EL TELÉFONO.
 *
 * ══ Por qué no está en la barra del pulgar ═════════════════════════════════
 *
 * Porque el progreso se MIRA, no se hace, y la barra son cuatro destinos que se
 * gastan en lo que hay que hacer. Se llega tocando la cifra del peso en la
 * portada y desde «Tú». Es la misma decisión que ya existía (`soloAncho` en
 * `CLIENT_SECTIONS`) y el prototipo del teléfono no la cambia.
 *
 * ══ Y qué enseña ══════════════════════════════════════════════════════════
 *
 * Lo histórico, y solo lo histórico: el récord, la curva del peso y el tonelaje
 * por microciclo. Lo de hoy está en las otras cuatro pantallas.
 */
export const PantallaProgreso = ({ datos }) => {
  const { cabecera, record, peso, tonelaje, plan } = datos;
  const navigate = useNavigate();

  return (
    <>
      {/* Se abre desde tu perfil: lleva su flecha de vuelta. */}
      <Cabecera
        titulo={cabecera.fecha}
        sub={cabecera.donde}
        atras={{ onClick: () => (window.history.length > 1 ? navigate(-1) : navigate('/mi/tu')) }}
      />
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

        {tonelaje.length > 1 ? (
          <>
            <Titulillo>Lo que mueves por microciclo</Titulillo>
            <Tarjeta plana>
              <Columnas valores={tonelaje} />
            </Tarjeta>
          </>
        ) : null}

        {plan.length > 0 ? (
          <>
            <Titulillo>Tu plan</Titulillo>
            <Tarjeta plana>
              {plan.map((f) => (
                <div className="tel-al" key={f.rotulo}>
                  <span>{f.rotulo}</span>
                  <span className="tel-g">{f.cifra}</span>
                </div>
              ))}
            </Tarjeta>
          </>
        ) : null}

        <Aire />
      </div>
    </>
  );
};

/** La curva del peso, a todo lo ancho de su tarjeta. */
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

/** Los kilos movidos en cada microciclo. El último, el de ahora, en acento. */
const Columnas = ({ valores }) => {
  const max = Math.max(...valores) || 1;
  return (
    <div className="tel-columnas">
      {valores.map((v, i) => (
        <span key={i} className={i === valores.length - 1 ? 'tel-ahora' : undefined}>
          <i style={{ height: `${Math.max(4, (v / max) * 100)}%` }} />
        </span>
      ))}
    </div>
  );
};
