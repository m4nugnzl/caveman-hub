import { ChevronRight, Link as Eslabon } from 'lucide-react';

import { WarmupView } from '@/components/Coach/Workout/WarmupBlock';
import { shortDate } from '@/lib/dates';
import { ChapasDeAjustes } from '../LogbookDelEjercicio';
import { Aire, Boton, Cabecera, Chapa, Estado } from './Piezas';

/**
 * LA HOJA ANTES DE EMPEZAR — el frame `328:299` del 18 de septiembre de 2026.
 *
 * Es lo que se lee UNA vez, en el vestuario: qué ejercicios, cuántas series y
 * qué repeticiones, qué hiciste la última vez, y lo que te dice tu entrenador.
 * Luego se entra a la sesión, que es la pantalla de las sesenta veces.
 *
 * ── Lo que no está en el dibujo y aquí va ──────────────────────────────────
 * La indicación del día y el calentamiento (movilidad), antes de los
 * ejercicios, con sus interruptores del protocolo. Son lo que se lee antes de
 * empezar por definición, y perderlos al rehacer la pantalla ya pasó una vez
 * (ver `ClientSesionRoute`, «LO QUE SE LEE ANTES DE EMPEZAR»).
 *
 * ── Cada fila abre su registro (23 sep) ─────────────────────────────────────
 * Para quien entrena sin el móvil y lo pasa después: tocar un ejercicio abre
 * sus series para escribirlas, sin iniciar la sesión ni pasar por los de antes
 * (`RegistroDelEjercicio`). A la derecha, lo apuntado sobre lo pautado —«2/3»—
 * y el galón. Es la misma sesión que la del botón de abajo: son dos puertas.
 *
 * ── El eslabón, un botón aparte ────────────────────────────────────────────
 * Dice que tu entrenador le ha puesto ficha a ese ejercicio —su vídeo o sus
 * pautas—. Hasta el 23 sep la fila entera abría la ficha; ahora la fila
 * registra, y la ficha es un botón de 44 px al canto, hermano de la fila (un
 * botón dentro de otro no es HTML válido). Sin ficha, no hay eslabón.
 *
 * Con la semana ya revisada (`bloqueo`) las filas se leen y no se tocan, y la
 * frase dice por qué.
 */
export const HojaAntesDeEmpezar = ({ hoja }) => {
  const {
    titulo,
    sub,
    resumen,
    indicacion,
    calentamiento,
    ejercicios,
    verbo,
    onEmpezar,
    onTerminar = null,
    onVolver,
    bloqueo = null,
  } = hoja;

  return (
    <>
      <Cabecera titulo={titulo} sub={sub} atras={{ onClick: onVolver, etiqueta: 'Volver a Entreno' }} />

      <p className="tel-resumen">
        <b>{resumen.ejercicios}</b> {resumen.ejercicios === 1 ? 'ejercicio' : 'ejercicios'} ·{' '}
        <b>{resumen.series}</b> series
        {resumen.minutos ? (
          <>
            {' '}
            · <b>~{resumen.minutos} min</b> la última vez
          </>
        ) : null}
      </p>

      {indicacion || calentamiento.length > 0 ? (
        <section className="tel-seccion tel-antes">
          {indicacion ? (
            <p className="tel-indicacion">
              <span className="tel-rotulo">
                <span>De tu entrenador</span>
              </span>
              {indicacion}
            </p>
          ) : null}
          <WarmupView drills={calentamiento} />
        </section>
      ) : null}

      <section className="tel-seccion">
        {bloqueo ? <p className="tel-bloqueo tel-bloqueo-arriba">{bloqueo}</p> : null}
        <ul className="tel-hoja">
          {ejercicios.map((e) => {
            const registra = Boolean(e.onRegistrar) && !bloqueo;
            const tono = e.series > 0 && e.hechas >= e.series ? 'hecho' : e.hechas > 0 ? 'medias' : 'nada';
            const dentro = (
              <>
                <span className="tel-hoja-tx">
                  <span className="tel-hoja-nom">{e.nombre}</span>
                  <span className="tel-hoja-datos">
                    {e.musculo ? <Chapa>{e.musculo}</Chapa> : null}
                    {e.pauta ? <span className="tel-hoja-pauta">{e.pauta}</span> : null}
                    {e.ultima ? (
                      <span className="tel-hoja-ultima">
                        Última vez: <b>{e.ultima}</b>
                      </span>
                    ) : null}
                    {/* Sus ajustes, de solo leer: la fila entera es un botón,
                        y se cambian dentro del registro. */}
                    <ChapasDeAjustes textos={e.ajustes || []} />
                  </span>
                  {e.nota ? <span className="tel-hoja-nota">«{e.nota}»</span> : null}
                  {e.notaTuya ? (
                    <span className="tel-hoja-nota tel-hoja-tuya">
                      <b>Tu nota{e.notaTuya.fecha ? ` del ${shortDate(e.notaTuya.fecha)}` : ''}:</b> {e.notaTuya.texto}
                    </span>
                  ) : null}
                </span>
                {e.series > 0 ? (
                  <span className="tel-hoja-lleva">
                    <Estado tono={tono}>
                      <span className="sr-only">Llevas </span>
                      {e.hechas}/{e.series}
                      <span className="sr-only"> series</span>
                    </Estado>
                    {registra ? <ChevronRight className="tel-galon" size={15} aria-hidden="true" /> : null}
                  </span>
                ) : null}
              </>
            );
            return (
              <li key={e.id} className="tel-hoja-item">
                {registra ? (
                  <button
                    type="button"
                    className="tel-hoja-ej"
                    aria-label={`Apuntar ${e.nombre}: llevas ${e.hechas} de ${e.series} series`}
                    onClick={e.onRegistrar}
                  >
                    {dentro}
                  </button>
                ) : (
                  <div className="tel-hoja-ej">{dentro}</div>
                )}
                {e.conFicha ? (
                  <button
                    type="button"
                    className="tel-hoja-ficha"
                    aria-label={`Ver la ficha de ${e.nombre}`}
                    title="La ficha de tu entrenador"
                    onClick={e.onFicha}
                  >
                    <Eslabon size={15} aria-hidden="true" />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <div className="tel-hoja-pie">
        <Boton onClick={onEmpezar}>{verbo}</Boton>
        {onTerminar ? (
          <button type="button" className="tel-hoja-terminar" onClick={onTerminar}>
            Terminar la sesión
          </button>
        ) : null}
      </div>

      <Aire />
    </>
  );
};
