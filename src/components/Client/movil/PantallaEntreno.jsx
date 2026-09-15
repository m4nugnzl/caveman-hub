import { Aire, CabeceraDia, Marca, Regla, Tarjeta, Titulillo } from './Piezas';

/**
 * «ENTRENO» EN EL TELÉFONO — el bloque, tus ejercicios y tus bloques.
 *
 * ══ Las tres capas, y las tres son pasado ══════════════════════════════════
 *
 * Es la ley 2 del estudio puesta en una pantalla: *toda pantalla tiene pasado,
 * repartido*. Aquí no hay sección «Historial» —que es donde el pasado se va a
 * morir— sino tres alturas de él, de lo más cercano a lo más lejano:
 *
 *   1. **El microciclo en curso**, con sus sesiones y lo que llevas de cada una.
 *   2. **Tus ejercicios** — el cajón. Cada renglón con tu última marca. Es el
 *      logbook, que hoy no existía en el portal, y es lo que hace que esta
 *      pantalla valga cuando no hay ningún plan puesto.
 *   3. **Tus bloques**, como línea de tiempo con la fecha en el carril. Es lo
 *      que se le copia a Efort, y lo único de los tres que mira meses atrás.
 *
 * ══ Lo que NO hay aquí ═════════════════════════════════════════════════════
 *
 * Ni un campo. Se mira lo que te toca y se entra a la sesión con un verbo; lo
 * de escribir kilos es la otra ruta, que se come la pantalla entera y pierde la
 * barra del pulgar.
 */
export const PantallaEntreno = ({ datos }) => {
  const { cabecera, microciclos, sesiones, cajon, bloques, onEjercicio, onSesion } = datos;

  return (
    <>
      <CabeceraDia {...cabecera} />
      <div className="tel-tramo">
        {/* Un tramo por microciclo del bloque: cuántos llevas y por dónde vas,
            sin una sola palabra. */}
        {microciclos.length > 1 ? <Regla tramos={microciclos} suelta /> : null}

        {sesiones.map((s) => (
          <Tarjeta key={s.dayName} corta>
            <button type="button" className="tel-sesion-boton" onClick={() => onSesion(s)}>
              <div className="tel-sesion-cab">
                <div>
                  <div className="tel-nom">{s.dayName}</div>
                  <div className="tel-meta">{s.meta}</div>
                </div>
                {s.esHoy ? (
                  <span className="tel-hoy">Hoy</span>
                ) : (
                  <span className="tel-est">{s.estado}</span>
                )}
              </div>
            </button>
          </Tarjeta>
        ))}

        {cajon.length > 0 ? (
          <>
            <Titulillo>Tus ejercicios</Titulillo>
            <Tarjeta lista>
              {cajon.map((e) => (
                <button
                  type="button"
                  className="tel-renglon"
                  key={e.nombre}
                  onClick={() => onEjercicio(e)}
                >
                  <span>
                    <span className="tel-nom">{e.nombre}</span>
                    <span className="tel-pauta">{e.cuando}</span>
                  </span>
                  <Marca cifra={e.marca} />
                </button>
              ))}
            </Tarjeta>
          </>
        ) : null}

        {bloques.length > 0 ? (
          <>
            <Titulillo>Tus bloques</Titulillo>
            <Tarjeta plana className="tel-linea-bloques">
              {bloques.map((b) => (
                <div className="tel-bloque-fila" key={b.id}>
                  <div className="tel-cuando">
                    {b.mes}
                    <b>{b.dia}</b>
                  </div>
                  <div>
                    <div className="tel-nom">
                      {b.nombre}
                      {b.enCurso ? <span className="tel-en-curso">en curso</span> : null}
                    </div>
                    <div className="tel-meta">{b.meta}</div>
                  </div>
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
