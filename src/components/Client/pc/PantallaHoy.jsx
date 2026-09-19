import {
  BellRing,
  CalendarDays,
  ClipboardList,
  Footprints,
  Scale,
  Salad,
  Send,
  Dumbbell,
} from 'lucide-react';

import { miles } from '@/lib/dates';
import {
  Boton,
  Caja,
  Chispa,
  Descartable,
  Enlace,
  Fila,
  Filas,
  Pildora,
  Teselas,
  Tramos,
} from './Piezas';

/**
 * «HOY» EN EL MONITOR — el saludo, cuatro cifras y dos carriles.
 *
 * ══ Lo que esta pantalla contesta ══════════════════════════════════════════
 *
 * Dos preguntas y en este orden: «¿voy al día?» y «¿qué hago hoy?». La avería
 * E-05 del estudio era que ninguna de las seis pantallas del portal abría con
 * una cifra: las seis abrían con titular y párrafo. Aquí lo primero que hay bajo
 * el saludo son cuatro números.
 *
 * ══ El reparto ════════════════════════════════════════════════════════════
 *
 * Ocho columnas de TRABAJO —la decisión que espera tu respuesta y la mesa del
 * microciclo— y cuatro de CONSULTA: lo de hoy y tu peso. Es el mismo mueble de
 * las otras seis pantallas, no uno propio de esta.
 *
 * ── «Hoy» y «Te espera» son UNA caja ──────────────────────────────────────
 * Eran dos contestando la misma pregunta —qué toca hoy—, y el dueño avisó en la
 * segunda vuelta de que en esta pantalla también ve de más. La entrega, que era
 * la única de «Te espera», es ahora la última fila de «Lo de hoy» con su
 * píldora.
 *
 * ── Y «De tu entrenador» es la otra, con las TRES cosas que vienen de él ───
 * Lo que ha cambiado (las novedades, que se descartan), lo que te ha mandado y
 * lo que te contestó. Eran tres sitios —una lista sin pantalla desde el 14 de
 * septiembre, una fila sin cifra en «Tú» y una caja al pie de esta columna— y
 * son una sola pregunta: **¿qué me ha dicho?**. Va encima de la mesa del
 * microciclo porque debajo de una tabla de siete filas es donde estaba
 * enterrada la respuesta de su entrenador.
 */
export const PantallaHoy = ({ datos }) => {
  const {
    nombre,
    diaDeHoy,
    teselas,
    alta,
    media,
    nueva,
    semana,
    unidad,
    porDonde,
    hoy,
    peso,
    respuesta,
    novedades,
    mandados,
    puertas,
  } = datos;

  return (
    <div className="pc-hoja">
      <div className="pc-titulo">
        <div>
          <div className="pc-fecha">{diaDeHoy}</div>
          {/* El saludo es la firma de esta pantalla, y la excepción a la regla
              de los titulares grandes: las demás se titulan, esta se abre. */}
          <h2 className="pc-saludo">Hola, {nombre}</h2>
        </div>
        <Boton to="/mi/calendario" icono={CalendarDays}>
          Tu calendario
        </Boton>
      </div>

      <Teselas items={teselas} />

      {/* El alta, mientras esté a medias, manda sobre todo lo demás: a quien aún
          no ha contestado el cuestionario se le estaba pidiendo la tercera cosa
          antes que la primera. Terminada, esta barra no existe. */}
      {alta ? (
        <div className="pc-aviso">
          <span className="pc-icono">
            <ClipboardList size={15} />
          </span>
          <span className="pc-cuerpo">
            <span className="pc-rotulo">Cuéntanos de ti</span>
            <span className="pc-frase">{alta.frase}</span>
          </span>
          <Boton pri to="/mi/alta">
            Seguir
          </Boton>
        </div>
      ) : null}

      <div className="pc-rejilla">
        <div className="pc-c8 pc-columna-caja">
          {/*
            LA DECISIÓN. Una sesión a medias o el microciclo nuevo, nunca las
            dos: son dos verbos delante de alguien que va a hacer una cosa.
            Manda la de medias, que es lo único que está esperando una respuesta
            suya — lo otro es una oferta. Ver `la ley del reposo`.
          */}
          {media ? (
            <Caja
              tit="La dejaste a medias"
              meta={media.cuando}
              pie={
                <>
                  <Boton pri onClick={media.onSeguir}>
                    Seguir donde lo dejaste
                  </Boton>
                  <Enlace callado onClick={media.onDescartar}>
                    {media.queSePierde}
                  </Enlace>
                </>
              }
            >
              <div className="pc-nombre-sesion">
                <span className="pc-n">{media.nombre}</span>
                <span className="pc-c">
                  {media.hechas} de {media.series} series · {media.conAlgo} de {media.ejercicios}{' '}
                  ejercicios
                </span>
              </div>
              <Tramos hechas={media.hechas} total={media.series} />
            </Caja>
          ) : null}

          {!media && nueva ? (
            <Caja
              tit={nueva.rotulo}
              meta={porDonde}
              pie={
                <>
                  <Boton pri onClick={nueva.onContinuar}>
                    Abrir el {unidad.toLowerCase()} {nueva.numero}
                  </Boton>
                  <span>Se copia del anterior, con sus pesos</span>
                </>
              }
            >
              <div className="pc-nombre-sesion">
                <span className="pc-n">
                  {unidad} {nueva.numero}
                </span>
                <span className="pc-c">todavía sin escribir</span>
              </div>
            </Caja>
          ) : null}

          {/*
            DE TU ENTRENADOR: lo que cambió, lo que te mandó y lo que contestó.
            En reposo no está — ver la ley del reposo.
          */}
          {novedades.length > 0 || mandados.length > 0 || respuesta ? (
            <Caja tit="De tu entrenador" meta={respuesta?.cuando} sinRelleno>
              <Filas>
                {novedades.map((n) => (
                  <Descartable
                    key={n.id}
                    icono={BellRing}
                    rotulo={n.label}
                    frase={n.hint}
                    to={n.href || undefined}
                    onQuitar={n.onQuitar}
                    etiqueta={`Descartar «${n.label}»`}
                  />
                ))}
                {mandados.map((m) => (
                  <Fila key={m.id} icono={Send} rotulo={m.label} frase={m.hint} to={m.href} />
                ))}
                {respuesta ? (
                  <Fila rotulo={`«${respuesta.texto}»`} to="/mi/evolucion" />
                ) : null}
              </Filas>
            </Caja>
          ) : null}

          {semana?.days?.length > 0 ? (
            <Caja
              tit={`Tu ${unidad.toLowerCase()}`}
              meta={porDonde}
              sinRelleno
              pie={
                <>
                  <span>
                    {semana.sessions.done} de {semana.sessions.planned}{' '}
                    {semana.sessions.done === 1 ? 'anotada' : 'anotadas'}
                  </span>
                  <Enlace to="/mi/rutina">Ver el bloque entero</Enlace>
                </>
              }
            >
              <table className="pc-tabla">
                <thead>
                  <tr>
                    <th>Sesión</th>
                    <th>Día</th>
                    <th className="pc-num">Series</th>
                    <th className="pc-num">Kilos</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {semana.days.map((dia) => {
                    const estado = estadoDeLaFila(dia);
                    return (
                      <tr key={dia.dayName}>
                        <td className="pc-nom">{dia.dayName}</td>
                        <td>{dia.cuando || '—'}</td>
                        <td className="pc-num">
                          {dia.plannedSets > 0
                            ? `${dia.loggedSets} de ${dia.plannedSets}`
                            : dia.loggedSets}
                        </td>
                        <td className="pc-num">{dia.tonnage > 0 ? `${miles(dia.tonnage)} kg` : '—'}</td>
                        <td>
                          <Pildora tono={estado.tono}>{estado.texto}</Pildora>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Caja>
          ) : null}

          {/* Aquí estaba «De tu entrenador», con la respuesta sola dentro. Ha
              subido por encima de la mesa y se ha llevado las novedades y lo
              mandado: son la misma pregunta y estaban en tres sitios. */}
        </div>

        <div className="pc-c4 pc-columna-caja">
          <Caja tit="Lo de hoy" sinRelleno>
            <Filas>
              {hoy.dieta ? (
                <Fila
                  icono={Salad}
                  rotulo={hoy.dieta.rotulo}
                  frase={hoy.dieta.frase}
                  to="/mi/dieta"
                />
              ) : null}
              {hoy.entreno ? (
                <Fila
                  icono={Dumbbell}
                  rotulo={hoy.entreno.rotulo}
                  frase={hoy.entreno.frase}
                  to={hoy.entreno.descanso ? undefined : '/mi/rutina'}
                />
              ) : null}
              {hoy.pasos ? (
                <Fila icono={Footprints} rotulo="Pasos" frase="objetivo del día" cifra={hoy.pasos} />
              ) : null}
              {hoy.pesaje ? (
                <Fila
                  icono={Scale}
                  rotulo="Apuntar tu peso"
                  frase={hoy.pesaje}
                  to="/mi/evolucion"
                />
              ) : null}
              {hoy.revision ? (
                <Fila
                  icono={Send}
                  rotulo="Entregar tu revisión"
                  frase={hoy.revision.frase}
                  pildora={hoy.revision.pildora}
                  to="/mi/evolucion"
                />
              ) : null}
            </Filas>
          </Caja>

          {peso ? (
            <Caja
              tit="Tu peso"
              enlace={<Enlace to="/mi/progreso">Ver a fondo</Enlace>}
              pie={
                <>
                  <span>{peso.desde ? `Empezaste en ${peso.desde}` : 'Tu primer pesaje'}</span>
                  {peso.objetivo ? <span>Objetivo {peso.objetivo}</span> : null}
                </>
              }
            >
              <div className="pc-cifra-grande">
                <span className="pc-n">{peso.ahora}</span>
                <span className="pc-u">kg</span>
                {peso.delta ? (
                  <span className={`pc-delta pc-${peso.delta.tono}`}>{peso.delta.texto}</span>
                ) : null}
              </div>
              {peso.serie.length > 2 ? (
                <div className="pc-chispa">
                  <Chispa puntos={peso.serie} />
                </div>
              ) : null}
            </Caja>
          ) : null}

          {puertas.length > 0 ? (
            <Caja sinRelleno>
              <Filas>
                {puertas.map((p) => (
                  <Fila
                    key={p.rotulo}
                    icono={p.icono}
                    rotulo={p.rotulo}
                    frase={p.frase}
                    cifra={p.cifra}
                    to={p.to}
                    onClick={p.onClick}
                  />
                ))}
              </Filas>
            </Caja>
          ) : null}
        </div>
      </div>
    </div>
  );
};

/**
 * El estado de una sesión de la mesa, en píldora.
 *
 * «A medias» existe y es lo que más se mira: una sesión con una serie apuntada
 * de veintiuna no está anotada, y decir que sí la deja fuera de lo que hay que
 * terminar.
 */
const estadoDeLaFila = ({ done, loggedSets, plannedSets }) => {
  if (!done) return { tono: 'nada', texto: 'sin anotar' };
  if (plannedSets > 0 && loggedSets < plannedSets) return { tono: 'espera', texto: 'a medias' };
  return { tono: 'ok', texto: 'anotada' };
};
