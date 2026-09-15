import { Link } from 'react-router-dom';

import { Aire, Aviso, Boton, CabeceraDia, Pedido, Record, Titulillo } from './Piezas';

/**
 * «HOY» EN EL TELÉFONO — la portada de `docs/la-sesion-manda.md`.
 *
 * ══ La tesis ═══════════════════════════════════════════════════════════════
 *
 * El cliente no entra a consultar cinco secciones: entra a hacer una sesión y a
 * saber si va bien. La portada de antes le daba un índice —la tarjeta de la
 * sesión con sus tres primeros ejercicios, tres cifras, y abajo lo demás—; esta
 * le da **el gesto del día**, arriba y a un toque.
 *
 * ══ El orden, y por qué ════════════════════════════════════════════════════
 *
 *   1. **El héroe.** Lo que hay que hacer ahora: empezar la sesión (directo a
 *      entrenar, no a la lista de días), seguir la que dejó a medias, o —en
 *      descanso— pesarse y las fotos. Nunca está vacío.
 *   2. **La tira de la semana.** Siete días: los hechos, hoy, lo que queda y los
 *      descansos del reparto. Es el «¿voy al día?» sin abrir nada.
 *   3. **Tu entrenador te ha contestado.** La respuesta a su revisión, que es el
 *      momento que cierra el círculo del producto y vivía dos niveles dentro de
 *      «Revisión». Solo si la hay.
 *   4. **Mi progreso.** El peso con su cambio, lo que lleva desde el inicio y
 *      por dónde va del bloque — y debajo, «Esta semana»: lo que le queda por
 *      entregar.
 *   5. **Su registro**, lo que llevan sumado sus sesiones: el récord que no
 *      caduca cuando se acaba el bloque.
 *   6. **Lo demás que viene de su entrenador** y lo que le han pedido, solo si
 *      lo hay.
 *
 * ── Lo que sale de aquí ───────────────────────────────────────────────────
 * La lista de los tres primeros ejercicios dentro de la tarjeta. Con el héroe
 * llevando directo a la sesión, repetirlos era enseñar el índice del modo
 * entreno delante de su puerta; dentro, el carril los tiene todos con nombre.
 */
export const PantallaHoy = ({ datos }) => {
  const { cabecera, heroe, tira, respuesta, progreso, semana, record, pedidos, novedades, mandados } = datos;

  return (
    <>
      <CabeceraDia {...cabecera} />
      <div className="tel-tramo">
        {heroe ? <Heroe heroe={heroe} /> : null}

        {tira ? (
          <ol className="tel-semana" aria-label="Tu semana">
            {tira.map((d) => (
              <li
                key={d.dia}
                className={`tel-semana-dia tel-${d.estado}${d.hoy ? ' tel-hoy' : ''}`}
                aria-label={`${d.dia}: ${d.hoy ? 'hoy, ' : ''}${ESTADOS[d.estado]}`}
                aria-current={d.hoy ? 'date' : undefined}
              >
                <span className="tel-semana-d">{d.corto}</span>
                <span className="tel-semana-m" aria-hidden="true" />
              </li>
            ))}
          </ol>
        ) : null}

        {respuesta ? (
          <Link className="tel-contestado" to={respuesta.to}>
            <span className="tel-contestado-punto" aria-hidden="true" />
            <span className="tel-contestado-tx">
              <b>{respuesta.que}</b>
              <span>{respuesta.cual}</span>
            </span>
            <span className="tel-flecha" aria-hidden="true">
              ›
            </span>
          </Link>
        ) : null}

        {progreso.length > 0 || semana ? (
          <>
            <div className="tel-progreso-tit">
              <span>Mi progreso</span>
              <Link to="/mi/progreso">Ver todo</Link>
            </div>
            {progreso.length > 0 ? (
              <div className="tel-cifras">
                {progreso.map((c) => (
                  <div className="tel-cifra" key={c.k}>
                    <span className="tel-cifra-k">{c.k}</span>
                    <span className="tel-cifra-v">
                      {c.v}
                      {c.de ? <small>{c.de}</small> : null}
                      {c.delta ? <small className={`tel-delta tel-${c.delta.tono}`}>{c.delta.texto}</small> : null}
                    </span>
                    <span className="tel-cifra-u">{c.u}</span>
                  </div>
                ))}
              </div>
            ) : null}
            {semana ? <Pedido que={semana.que} cual={semana.cual} to={semana.to} /> : null}
          </>
        ) : null}

        {record ? <Record items={record} /> : null}

        {novedades.length > 0 || mandados.length > 0 ? (
          <>
            <Titulillo>De tu entrenador</Titulillo>
            <div className="tel-avisos">
              {novedades.map((n) => (
                <Aviso
                  key={n.id}
                  que={n.label}
                  cual={n.hint}
                  to={n.href || undefined}
                  onQuitar={n.onQuitar}
                  etiqueta={`Descartar «${n.label}»`}
                />
              ))}
              {mandados.map((m) => (
                <Aviso key={m.id} que={m.label} cual={m.hint} to={m.href} />
              ))}
            </div>
          </>
        ) : null}

        {pedidos.length > 0 ? (
          <>
            <Titulillo>Te han pedido</Titulillo>
            {pedidos.map((p) => (
              <Pedido key={p.que} {...p} />
            ))}
          </>
        ) : null}

        <Aire />
      </div>
    </>
  );
};

const ESTADOS = { hecho: 'hecho', toca: 'te toca', libre: 'descanso' };

/**
 * EL HÉROE: el gesto del día.
 *
 * Un titular grande —lo que toca—, una línea de datos debajo y UN verbo. La luz
 * de detrás es `--luz`, la de la única superficie encendida de una pantalla: de
 * todo lo que hay en la portada, esto es lo que se hace.
 */
const Heroe = ({ heroe }) => (
  <section className={`tel-heroe${heroe.viva ? ' tel-viva' : ''}`} aria-label={heroe.titulo}>
    <span className="tel-heroe-rot">{heroe.rotulo}</span>
    <span className="tel-heroe-tit">{heroe.titulo}</span>
    {heroe.sub ? <span className="tel-heroe-sub">{heroe.sub}</span> : null}
    {heroe.verbo ? (
      <Boton to={heroe.to || undefined} onClick={heroe.to ? undefined : heroe.onVerbo}>
        {heroe.verbo}
      </Boton>
    ) : null}
    {heroe.pie ? <span className="tel-heroe-pie">{heroe.pie}</span> : null}
  </section>
);
