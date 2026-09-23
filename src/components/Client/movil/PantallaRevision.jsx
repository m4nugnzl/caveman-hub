import { Check } from 'lucide-react';

import { Aire, Boton, Cabecera, Fila, Lista, Tramo } from './Piezas';

/**
 * «REVISIÓN» EN EL TELÉFONO — el frame `328:111` del 18 de septiembre de 2026.
 *
 * ══ Vuelve a la barra, y esta pantalla es una lista de lo que se entrega ════
 *
 * El titular, el plazo, cuánto llevas de la entrega en una barra, y los pasos
 * uno debajo de otro, cada uno con su círculo: verde lleno si está hecho,
 * vacío si no. Cada paso se toca y abre su parte, que guarda al momento: el
 * peso, su registro; las fotos (`328:518`) y el cuestionario (`128:195`), sus
 * pantallas; las medidas, su asistente. Debajo, el verbo de entregar —que ya no
 * abre nada: lo entregado está guardado y entregar es avisar— y lo que te dijo
 * tu entrenador la vez pasada, que es lo que se lee mientras se prepara la
 * siguiente.
 *
 * ── Lo que el dibujo pide y aquí no está ───────────────────────────────────
 * «Nota al entrenador» como quinto paso. No existe como paso: la nota de la
 * semana es una pregunta de texto del cuestionario (`week_note`) y va dentro de
 * él. Un paso que abre lo mismo que otro son dos puertas a un sitio.
 *
 * ── El botón no se apaga ───────────────────────────────────────────────────
 * El dibujo lo pinta gris hasta que está todo. Aquí se puede entregar sin las
 * fotos —eso no es un aviso, es un permiso que ya existía—, así que el botón
 * sigue en azul; lo que falta lo dicen los círculos vacíos.
 */
export const PantallaRevision = ({ datos }) => {
  const { titulo, periodo, pasos, entrega, respuesta, atrasadas, atras = null, pasada = false } = datos;
  const hechos = pasos.filter((p) => p.hecho).length;

  return (
    <>
      {/* Una semana pasada se abre desde «Semanas anteriores» y vuelve allí. */}
      <Cabecera titulo={titulo} sub={periodo} grande={!atras} atras={atras ? { to: atras, etiqueta: 'Semanas anteriores' } : null} />

      {pasos.length > 0 ? (
        <div className="tel-entrega-estado">
          <div className="tel-rotulo">
            <span>Estado de la entrega</span>
            <span className={`tel-rotulo-dato tel-rotulo-cuenta${hechos > 0 ? ' tel-hecho' : ''}`}>
              {hechos} de {pasos.length} {pasos.length === 1 ? 'completado' : 'completados'}
            </span>
          </div>
          <span className="tel-barrita tel-barrita-6" aria-hidden="true">
            <i style={{ width: `${(hechos / pasos.length) * 100}%` }} />
          </span>
        </div>
      ) : null}

      <Tramo className="tel-pasos">
        <Lista className="tel-lista-suelta">
          {pasos.map((p) => (
            <Fila
              key={p.id}
              delante={
                <span className={`tel-circulo${p.hecho ? ' tel-hecho' : ''}`} aria-hidden="true">
                  {p.hecho ? <Check size={13} strokeWidth={3} /> : null}
                </span>
              }
              titulo={p.titulo}
              sub={p.sub}
              apagada={!p.hecho}
              to={p.to}
              onClick={p.to ? undefined : p.onAbrir}
            />
          ))}
        </Lista>
      </Tramo>

      <Tramo>
        {entrega.verbo ? (
          <Boton onClick={entrega.onEntregar} disabled={entrega.ocupado}>
            {entrega.verbo}
          </Boton>
        ) : null}
        {entrega.error ? (
          <p className="tel-pie tel-error" role="alert">
            {entrega.error}
          </p>
        ) : null}
        <p className="tel-pie">{entrega.pie}</p>
      </Tramo>

      {respuesta ? (
        <Tramo rotulo="Lo que te dijo tu entrenador">
          <div className="tel-caja tel-respuesta">
            <div className="tel-respuesta-cab">
              <b>{respuesta.titulo}</b>
              {respuesta.cuando ? <span>{respuesta.cuando}</span> : null}
            </div>
            <p>{respuesta.texto}</p>
          </div>
        </Tramo>
      ) : null}

      {pasada ? null : (
        <Tramo>
          <Lista>
            <Fila
              titulo="Semanas anteriores"
              sub={atrasadas > 0 ? `${atrasadas} por completar` : 'tus medidas y lo que entregaste'}
              to="/mi/evolucion/semanas"
            />
            <Fila titulo="Tus fotos" sub="todas, por semana" to="/mi/evolucion/fotos" />
          </Lista>
        </Tramo>
      )}

      <Aire />
    </>
  );
};
