import { Link as Eslabon } from 'lucide-react';

import { WarmupView } from '@/components/Coach/Workout/WarmupBlock';
import { Aire, Boton, Cabecera, Chapa } from './Piezas';

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
 * ── El eslabón junto al nombre ─────────────────────────────────────────────
 * Dice que tu entrenador le ha puesto ficha a ese ejercicio —su vídeo o sus
 * pautas— y la fila entera la abre. Sin ficha, no hay eslabón y la fila no se
 * toca: lo que no abre nada no se dibuja como si abriera.
 */
export const HojaAntesDeEmpezar = ({ hoja }) => {
  const { titulo, sub, resumen, indicacion, calentamiento, ejercicios, verbo, onEmpezar, onVolver } = hoja;

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
        <ul className="tel-hoja">
          {ejercicios.map((e) => {
            const dentro = (
              <>
                <span className="tel-hoja-fila">
                  <span className="tel-hoja-nom">
                    {e.nombre}
                    {e.conFicha ? <Eslabon size={15} aria-label="con ficha de tu entrenador" /> : null}
                  </span>
                  {e.pauta ? <span className="tel-hoja-pauta">{e.pauta}</span> : null}
                </span>
                {e.musculo || e.ultima ? (
                  <span className="tel-hoja-fila">
                    {e.musculo ? <Chapa>{e.musculo}</Chapa> : <span />}
                    {e.ultima ? (
                      <span className="tel-hoja-ultima">
                        Última vez: <b>{e.ultima}</b>
                      </span>
                    ) : null}
                  </span>
                ) : null}
                {e.nota ? <span className="tel-hoja-nota">«{e.nota}»</span> : null}
              </>
            );
            return (
              <li key={e.id}>
                {e.conFicha ? (
                  <button type="button" className="tel-hoja-ej" onClick={e.onFicha}>
                    {dentro}
                  </button>
                ) : (
                  <div className="tel-hoja-ej">{dentro}</div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <div className="tel-hoja-pie">
        <Boton onClick={onEmpezar}>{verbo}</Boton>
      </div>

      <Aire />
    </>
  );
};
