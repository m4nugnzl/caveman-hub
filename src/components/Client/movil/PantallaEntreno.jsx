import { Anillo, Aire, Boton, Cabecera, Estado, Fila, Lista, Tramo } from './Piezas';
import { HojaAntesDeEmpezar } from './HojaAntesDeEmpezar';

/**
 * «ENTRENO» EN EL TELÉFONO — el frame `327:148` del 18 de septiembre de 2026.
 *
 * ══ Tres alturas, de lo que toca a lo que fue ══════════════════════════════
 *
 *   1. **El bloque**: su nombre, por qué microciclo vas y una raya por cada uno
 *      —los hechos en tinta, el tuyo en azul, los que faltan en gris—.
 *   2. **La próxima sesión**, en su caja: lo que llevas y el verbo, que entra
 *      directo a entrenar.
 *   3. **Las sesiones del microciclo**, cada una con su estado. Tocar una abre
 *      su HOJA —qué ejercicios, cuántas series, qué hiciste la última vez y lo
 *      que te dice tu entrenador— antes de empezarla (frame `328:299`). Hasta
 *      el 18 sep tocar una sesión te metía a entrenar sin haberla visto.
 *
 * Y debajo, lo que no está en el dibujo pero no se puede perder: **tus
 * ejercicios** (el cajón con tu última marca, que es lo que hace que esta
 * pantalla valga sin plan) y **tus bloques**, como línea de tiempo.
 *
 * Ni un campo: lo de escribir kilos es la otra ruta, la de la sesión.
 */
export const PantallaEntreno = ({ datos }) => {
  if (datos.hoja) return <HojaAntesDeEmpezar hoja={datos.hoja} />;

  const { cabecera, microciclos, proxima, sesiones, cajon, bloques, onEjercicio } = datos;

  return (
    <>
      <Cabecera {...cabecera} />

      {microciclos.length > 1 ? (
        <div className="tel-rayas" aria-hidden="true">
          {microciclos.map((m, i) => (
            <i key={i} className={`tel-raya-${m}`} />
          ))}
        </div>
      ) : null}

      {proxima ? (
        <Tramo>
          <div className="tel-caja tel-proxima">
            <div className="tel-proxima-cab">
              <div className="tel-proxima-tx">
                <span className="tel-proxima-rot">{proxima.rotulo}</span>
                <span className="tel-proxima-tit">{proxima.titulo}</span>
                <span className="tel-proxima-sub">{proxima.sub}</span>
              </div>
              {proxima.series > 0 ? <Anillo hechas={proxima.hechas} total={proxima.series} tam={48} /> : null}
            </div>
            <Boton onClick={proxima.onEmpezar} className="tel-boton-44">
              {proxima.verbo}
            </Boton>
          </div>
        </Tramo>
      ) : null}

      {sesiones.length > 0 ? (
        <Tramo rotulo={`Sesiones del ${cabecera.unidad || 'microciclo'}`}>
          <Lista>
            {sesiones.map((s) => (
              <Fila
                key={s.dayName}
                titulo={s.dayName}
                sub={s.meta}
                derecha={<Estado tono={s.tono}>{s.estado}</Estado>}
                onClick={s.onAbrir}
                galon={false}
              />
            ))}
          </Lista>
        </Tramo>
      ) : null}

      {cajon.length > 0 ? (
        <Tramo rotulo="Tus ejercicios">
          <Lista>
            {cajon.map((e) => (
              <Fila
                key={e.nombre}
                titulo={e.nombre}
                sub={e.cuando}
                derecha={<span className="tel-marca">{e.marca}</span>}
                onClick={() => onEjercicio(e)}
              />
            ))}
          </Lista>
        </Tramo>
      ) : null}

      {bloques.length > 0 ? (
        <Tramo rotulo="Tus bloques">
          <ol className="tel-bloques">
            {bloques.map((b) => (
              <li key={b.id}>
                <span className="tel-bloque-cuando">
                  {b.mes}
                  <b>{b.dia}</b>
                </span>
                <span className="tel-fila-tx">
                  <span className="tel-fila-tit">
                    {b.nombre}
                    {b.enCurso ? <span className="tel-en-curso">en curso</span> : null}
                  </span>
                  <span className="tel-fila-sub">{b.meta}</span>
                </span>
              </li>
            ))}
          </ol>
        </Tramo>
      ) : null}

      <Aire />
    </>
  );
};
