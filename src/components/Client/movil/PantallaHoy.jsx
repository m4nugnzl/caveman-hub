import { Link } from 'react-router-dom';

import { Anillo, Aire, Aviso, Boton, Cabecera, Chapa, Linea, Tramo } from './Piezas';

/**
 * «HOY» EN EL TELÉFONO — el frame `327:8` del 18 de septiembre de 2026.
 *
 * ══ El orden, y por qué ════════════════════════════════════════════════════
 *
 *   1. **Hola y dónde estás.** «Semana 6 · Microciclo 3 · Definición», y a la
 *      derecha la puerta a tu perfil: «Tú» ya no está en la barra.
 *   2. **La semana en siete discos.** Los hechos con su punto, hoy encendido.
 *   3. **Tu entreno de hoy.** El nombre en grande, los grupos que toca, lo que
 *      llevas en un anillo y UN verbo. Sigue siendo la tesis de «la sesión
 *      manda»: lo que hay que hacer, arriba y a un toque. En descanso, lo que
 *      toca es pesarse y la revisión.
 *   4. **De tu entrenador**, solo si hay algo: su respuesta a tu semana, lo que
 *      ha cambiado y lo que te ha mandado. No está en el dibujo porque el
 *      dibujo es un día sin recados; en reposo no está.
 *   5. **Tu peso**, con su línea. Se toca y lleva al registro.
 *   6. **Sensaciones**: cómo llegaste al último entreno, con su fecha.
 *   7. **Lo último** que has hecho.
 *
 * ── Lo que se fue de esta pantalla ─────────────────────────────────────────
 * El récord (sesiones, kilos movidos) vive ahora en tu perfil, que es donde
 * el dibujo lo pone; y «Esta semana» es la pestaña «Revisión», que vuelve a
 * estar en la barra con su punto cuando espera.
 */
export const PantallaHoy = ({ datos }) => {
  const { cabecera, dias, entreno, preguntaDelCiclo, recados, peso, sensaciones, ultimo } = datos;

  return (
    <>
      <Cabecera {...cabecera} perfil="/mi/tu" />

      {dias ? <SieteDias dias={dias} /> : null}

      {entreno ? <Entreno entreno={entreno} /> : null}

      {preguntaDelCiclo ? <PreguntaDelCiclo pregunta={preguntaDelCiclo} /> : null}

      {recados.length > 0 ? (
        <Tramo rotulo="De tu entrenador">
          <div className="tel-avisos">
            {recados.map((r) => (
              <Aviso key={r.id} {...r} />
            ))}
          </div>
        </Tramo>
      ) : null}

      {peso ? (
        <Tramo>
          <Link to={peso.to} className="tel-peso-puerta" aria-label={`Tu peso: ${peso.valor} kg. Abrir el registro`}>
            <span className="tel-peso-izq">
              <span className="tel-rotulo">
                <span>Peso corporal</span>
              </span>
              <span className="tel-peso-fila">
                <span className="tel-peso-n">{peso.valor} kg</span>
                {peso.delta ? <span className="tel-peso-delta">{peso.delta}</span> : null}
              </span>
            </span>
            <Linea puntos={peso.puntos} />
          </Link>
        </Tramo>
      ) : null}

      {sensaciones ? (
        <Tramo rotulo="Sensaciones" accion={<span className="tel-rotulo-dato">{sensaciones.cuando}</span>}>
          <div className="tel-sensaciones">
            {sensaciones.items.map((s) => (
              <div className="tel-sensacion" key={s.id}>
                <span className="tel-sensacion-cab">
                  <span>{s.corto}</span>
                  <b>
                    {s.valor}/{s.max}
                  </b>
                </span>
                <span className={`tel-barrita tel-${s.tono}`} aria-hidden="true">
                  <i style={{ width: `${Math.max(0, Math.min(100, (s.valor / s.max) * 100))}%` }} />
                </span>
              </div>
            ))}
          </div>
        </Tramo>
      ) : null}

      {ultimo.length > 0 ? (
        <Tramo rotulo="Lo último">
          <ul className="tel-ultimo">
            {ultimo.map((u) => (
              <li key={u.id} className={u.hoy ? 'tel-de-hoy' : undefined}>
                <i aria-hidden="true" />
                <span>{u.texto}</span>
                <span className="tel-ultimo-cuando">{u.cuando}</span>
              </li>
            ))}
          </ul>
        </Tramo>
      ) : null}

      <Aire />
    </>
  );
};

const ESTADOS = { hecho: 'hecho', toca: 'te toca', libre: 'descanso' };

/**
 * LA SEMANA: siete discos con la inicial. Hoy va lleno en azul —«aquí», no un
 * juicio—; los días hechos llevan su punto verde; lo que queda, en gris.
 */
const SieteDias = ({ dias }) => (
  <ol className="tel-dias" aria-label="Tu semana">
    {dias.map((d) => (
      <li
        key={d.dia}
        className={`tel-dia tel-${d.estado}${d.hoy ? ' tel-hoy' : ''}${d.pasado ? ' tel-pasado' : ''}`}
        aria-label={`${d.dia}: ${d.hoy ? 'hoy, ' : ''}${ESTADOS[d.estado]}`}
        aria-current={d.hoy ? 'date' : undefined}
      >
        <span className="tel-dia-disco">{d.corto}</span>
        <span className="tel-dia-punto" aria-hidden="true" />
      </li>
    ))}
  </ol>
);

/**
 * SI EL SIGUIENTE SE ABRE SOLO. Se pregunta una vez, debajo del entreno;
 * contestada, se cambia desde «Tú». Ver `preguntaDelCiclo` en `ClientStart`.
 */
const PreguntaDelCiclo = ({ pregunta }) => (
  <Tramo>
    <div className="tel-caja tel-proxima">
      <div className="tel-proxima-tx">
        <span className="tel-proxima-rot">Tu próximo {pregunta.unidad}</span>
        <span className="tel-proxima-tit">¿Lo abrimos solo cuando acabes este?</span>
        <span className="tel-proxima-sub">
          Con todas las sesiones apuntadas, se crea el siguiente con las mismas sesiones y sin tus
          números.
        </span>
      </div>
      <Boton onClick={pregunta.onSi} className="tel-boton-44">
        Sí, que se abra solo
      </Boton>
      <button type="button" className="tel-enlace" onClick={pregunta.onNo}>
        No, lo abro yo
      </button>
    </div>
  </Tramo>
);

/** TU ENTRENO DE HOY: el nombre, los grupos, lo que llevas y el verbo. */
const Entreno = ({ entreno }) => (
  <Tramo rotulo={entreno.rotulo}>
    <div className="tel-entreno">
      <div className="tel-entreno-tx">
        <h2 className="tel-entreno-tit">{entreno.titulo}</h2>
        {entreno.etiquetas.length > 0 ? (
          <div className="tel-chapas">
            {entreno.etiquetas.map((e) => (
              <Chapa key={e}>{e}</Chapa>
            ))}
          </div>
        ) : entreno.sub ? (
          <p className="tel-entreno-sub">{entreno.sub}</p>
        ) : null}
      </div>
      {entreno.series > 0 ? <Anillo hechas={entreno.hechas} total={entreno.series} /> : null}
    </div>
    {entreno.verbo ? (
      <Boton to={entreno.to || undefined} onClick={entreno.to ? undefined : entreno.onVerbo}>
        {entreno.verbo}
      </Boton>
    ) : null}
    {entreno.pie ? <p className="tel-pie">{entreno.pie}</p> : null}
  </Tramo>
);
