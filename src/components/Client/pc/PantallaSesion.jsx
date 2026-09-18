import { useState } from 'react';

import { mmss } from '@/context/SesionEnCurso';
import { miles, shortDate } from '@/lib/dates';
import { objetivoDeSerie, serieEnCorto, siguientePorHacer } from '../sesion';
import { Boton } from './Piezas';
import { WarmupView } from '@/components/Coach/Workout/WarmupBlock';
import { ComparativaEjercicio } from '@/components/Coach/Workout/ComparativaEjercicio';
import { ComoLoLlevo } from '@/components/Coach/Workout/ComoLoLlevo';
import { ProgresionPopup } from '@/components/Coach/Workout/ProgresionPopup';
import { SensacionesPopup } from '@/components/Coach/Workout/SensacionesPopup';

/**
 * «EN SESIÓN» EN EL MONITOR — el puesto de `docs/la-sesion-manda.md`.
 *
 * ══ Qué corrige ════════════════════════════════════════════════════════════
 *
 * En el monitor la sesión era la app del teléfono estirada: una columna de
 * 620 px centrada en una pantalla de 1.920, con el sobrante en blanco, y lo que
 * haría falta al lado —contra qué se mide cada ejercicio— detrás de un botón
 * de historial.
 *
 * El puesto reparte el ancho en tres, que es lo que se hace con un monitor:
 *
 *   · **a la izquierda, dónde estás** — el carril del portal, con el bloque y
 *     la semana (`CarrilDelPortal`, montado por el marco);
 *   · **en el centro, lo que haces** — la sesión en su medida legible, todos
 *     los ejercicios a la vez, porque aquí caben y los campos no piden gesto;
 *   · **a la derecha, contra qué te mides** — las tarjetas de la hoja del
 *     entrenador: la progresión del ejercicio en el que estás y cómo lo vienes
 *     llevando, cada una con su ventana.
 *
 * ══ «En el que estás» es donde tienes el foco ══════════════════════════════
 *
 * El costado sigue al ejercicio que tocas: al pinchar o tabular dentro de su
 * caja, el costado cambia a ese. Sin tocar nada, el primero que queda por
 * hacer. No se mueve solo al terminar una serie, por lo mismo que en el
 * teléfono: la pantalla no hace nada que no hayas pedido.
 *
 * ══ Las columnas, y una reversión que hay que saber ════════════════════════
 *
 *   SERIE · OBJ · KG · REPS · (RIR) · LA ÚLTIMA VEZ
 *
 * El 14 de septiembre el dueño podó esta tabla a «Rango · Kg · Reps» y quitó
 * «Antes» porque ya era el gris del campo. El prototipo del puesto la devuelve
 * con «La última vez» escrita en su columna, y el dueño pidió el escritorio
 * **tal cual el prototipo**. Aquí gana el prototipo, que es la decisión más
 * reciente; el gris del campo se queda igual, porque es lo que se lee al
 * escribir. El RIR, solo con su módulo encendido.
 *
 * «La última vez» además se puede pulsar: pone esos números en la serie. Es el
 * «igual que la vez anterior» de siempre, sin una columna de vistos que no
 * decía nada hasta que se pulsaba.
 */
export const PantallaSesion = ({ datos }) => {
  const {
    cabecera,
    preambulo = null,
    ejercicios,
    showRir = false,
    descanso = null,
    onSaltarDescanso,
    onCampo,
    onFicha,
    onAcabar,
    guardado = null,
    lecturas,
  } = datos;
  const { microcycles, weekNumber, etiqueta, preguntas, ultimaConSensaciones } = lecturas;

  const porDefecto = Math.max(
    0,
    ejercicios.findIndex((e) => siguientePorHacer(e.series) >= 0)
  );
  const [foco, setFoco] = useState(null);
  const [ventana, setVentana] = useState(null);
  const n = foco !== null && foco < ejercicios.length ? foco : porDefecto;
  const enFoco = ejercicios[n] || null;

  return (
    <div className="pc-puesto">
      <div className="pc-puesto-centro">
        <div className="pc-puesto-cab">
          <div>
            <h2 className="pc-puesto-tit">{cabecera.nombre}</h2>
            <div className="pc-puesto-fecha">
              {[cabecera.rotulo, cabecera.fecha].filter(Boolean).join(' · ')}
            </div>
          </div>
          <div className="pc-puesto-dcha">
            {descanso ? <CuentaAtras descanso={descanso} onSaltar={onSaltarDescanso} /> : null}
            <span className="pc-puesto-cuenta">
              <b>{cabecera.hechas}</b> de {cabecera.series} series
              {cabecera.tonelaje > 0 ? ` · ${miles(Math.round(cabecera.tonelaje))} kg` : ''}
            </span>
            <Boton pri onClick={onAcabar}>
              Terminar
            </Boton>
          </div>
        </div>
        <div className="pc-puesto-riel" aria-hidden="true">
          <i style={{ width: `${cabecera.series > 0 ? (cabecera.hechas / cabecera.series) * 100 : 0}%` }} />
        </div>
        {guardado ? <EstadoDelGuardado guardado={guardado} /> : null}

        {/* Lo que se lee antes de empezar: la indicación del día y el
            calentamiento. Ver `ClientSesionRoute`. */}
        {preambulo ? (
          <section className="pc-puesto-preambulo" aria-label="Antes de empezar">
            {preambulo.indicacion ? (
              <p className="pc-puesto-indicacion">
                <span className="pc-rot">De tu entrenador</span>
                {preambulo.indicacion}
              </p>
            ) : null}
            <WarmupView drills={preambulo.calentamiento} />
          </section>
        ) : null}

        {ejercicios.map((e, k) => {
          const hechos = e.series.length > 0 && e.series.every((s) => s.hecha);
          const viva = k === n ? siguientePorHacer(e.series) : -1;
          return (
            <section
              key={e.id}
              className={`pc-puesto-ej${k === n ? ' pc-en-foco' : ''}`}
              aria-label={e.nombre}
              onFocusCapture={() => setFoco(k)}
              onMouseDown={() => setFoco(k)}
            >
              <div className="pc-puesto-ej-cab">
                <span className={`pc-puesto-num${hechos ? ' pc-ok' : k === n ? ' pc-aqui' : ''}`}>
                  {k + 1}
                </span>
                <button type="button" className="pc-puesto-nom" onClick={() => onFicha(e)}>
                  {e.nombre}
                </button>
                {e.musculo ? <span className="pc-puesto-gr">{e.musculo}</span> : null}
                {e.descanso ? <span className="pc-puesto-des">descanso {e.descanso}</span> : null}
              </div>

              {/* Lo que te pide tu entrenador de este ejercicio, antes de las
                  series: es la condición con la que se hacen. */}
              {e.indicacion ? (
                <p className="pc-puesto-indicacion">
                  <span className="pc-rot">De tu entrenador</span>
                  {e.indicacion}
                </p>
              ) : null}

              <div className={`pc-puesto-filas${showRir ? ' pc-con-rir' : ''}`}>
                <div className="pc-puesto-fila pc-cab" aria-hidden="true">
                  <span>Serie</span>
                  <span>Obj</span>
                  <span>Kg</span>
                  <span>Reps</span>
                  {showRir ? <span>RIR</span> : null}
                  <span>La última vez</span>
                </div>
                {e.series.map((s, i) => (
                  <div
                    key={i}
                    className={`pc-puesto-fila${s.hecha ? ' pc-hecha' : i === viva ? ' pc-viva' : ' pc-pendiente'}`}
                  >
                    <span className="pc-puesto-s">
                      {i + 1}
                      {s.hecha ? <span aria-label="hecha"> ✓</span> : null}
                    </span>
                    <span className="pc-puesto-obj">{objetivoDeSerie(s) || '—'}</span>
                    <input
                      className="pc-puesto-dato"
                      type="number"
                      inputMode="decimal"
                      step="0.5"
                      value={s.kg}
                      placeholder={s.antesKg || '—'}
                      aria-label={`Kilos de la serie ${i + 1} de ${e.nombre}`}
                      onChange={(ev) => onCampo(e.id, i, 'kg', ev.target.value)}
                    />
                    <input
                      className="pc-puesto-dato"
                      type="number"
                      inputMode="numeric"
                      value={s.reps}
                      placeholder={s.antesReps || '—'}
                      aria-label={`Repeticiones de la serie ${i + 1} de ${e.nombre}`}
                      onChange={(ev) => onCampo(e.id, i, 'reps', ev.target.value)}
                    />
                    {showRir ? (
                      <input
                        className="pc-puesto-dato"
                        type="number"
                        inputMode="numeric"
                        value={s.rir}
                        placeholder={s.antesRir || '—'}
                        aria-label={`RIR de la serie ${i + 1} de ${e.nombre}`}
                        onChange={(ev) => onCampo(e.id, i, 'rir', ev.target.value)}
                      />
                    ) : null}
                    {s.antesReps && s.onIgual ? (
                      <button
                        type="button"
                        className="pc-puesto-ant"
                        aria-label={`Poner lo de la vez anterior en la serie ${i + 1}: ${serieEnCorto({ kg: s.antesKg, reps: s.antesReps })}`}
                        onClick={s.onIgual}
                      >
                        {[
                          serieEnCorto({ kg: s.antesKg, reps: s.antesReps }),
                          showRir && s.antesRir ? `RIR ${s.antesRir}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </button>
                    ) : (
                      <span className="pc-puesto-ant pc-nada">—</span>
                    )}
                  </div>
                ))}
              </div>

              <NotaDelEjercicio nombre={e.nombre} nota={e.nota} onNota={e.onNota} />
            </section>
          );
        })}
      </div>

      {/*
        ══ EL COSTADO ES EL DEL TALLER, CON SUS DOS VENTANAS (18 sep) ═══════
        Aquí había un costado propio —«Contra qué te mides»: una tabla de
        semanas, el tonelaje dibujado a mano y cuatro barritas— separado de la
        sesión por un filete vertical. El dueño: «no pueden ver el popup de
        progresión ni la tabla de progreso y se ve distinto; ha de ser igual a
        lo del entrenador».

        Son las dos tarjetas de la hoja del entrenador tal cual
        (`ComparativaEjercicio` y `ComoLoLlevo`), y cada una abre su ventana:
        la progresión entera del ejercicio y las sensaciones sesión a sesión.
        Lo único que cambia es la persona de los textos.
      */}
      <aside className="pc-puesto-lado lado-de-la-hoja" aria-label="Tu progresión">
        <ComparativaEjercicio
          etiqueta={etiqueta}
          microcycles={microcycles}
          ejercicios={ejercicios.map((e) => ({ name: e.nombre }))}
          name={enFoco?.nombre || null}
          weekNumber={weekNumber}
          onElegir={(nombre) => setFoco(Math.max(0, ejercicios.findIndex((e) => e.nombre === nombre)))}
          onAmpliar={() => setVentana('progresion')}
        />
        <ComoLoLlevo
          sesion={ultimaConSensaciones}
          preguntas={preguntas}
          fecha={ultimaConSensaciones?.date ? shortDate(ultimaConSensaciones.date) : null}
          rotulo="Cómo lo llevas"
          pista="Ver cómo lo llevas, sesión a sesión"
          onAmpliar={() => setVentana('sensaciones')}
        />
      </aside>

      {/* Las ventanas se montan solo abiertas: cerradas no calculan nada. */}
      {ventana === 'progresion' ? (
        <ProgresionPopup
          etiqueta={etiqueta}
          open
          onClose={() => setVentana(null)}
          microcycles={microcycles}
          name={enFoco?.nombre || null}
          weekNumber={weekNumber}
        />
      ) : null}
      {ventana === 'sensaciones' ? (
        <SensacionesPopup
          etiqueta={etiqueta}
          open
          onClose={() => setVentana(null)}
          microcycles={microcycles}
          preguntas={preguntas}
          titulo="Cómo lo llevas"
          escrito="Lo que escribiste"
        />
      ) : null}
    </div>
  );
};

/** Lo guardado, en una línea bajo el riel. La lectura es la de `SaveIndicator`. */
const EstadoDelGuardado = ({ guardado }) => {
  const { status } = guardado;
  if (status === 'saved') return <p className="pc-puesto-guardado pc-si">Guardado ✓</p>;
  if (status === 'saving') return <p className="pc-puesto-guardado">Guardando…</p>;
  if (status === 'pending') return <p className="pc-puesto-guardado">Sin conexión · se enviará al volver</p>;
  if (status === 'error') {
    return (
      <p className="pc-puesto-guardado pc-no" role="alert">
        No se guardó.{' '}
        <button type="button" onClick={guardado.onRetry}>
          Reintentar
        </button>
      </p>
    );
  }
  return null;
};

/**
 * TU NOTA DE ESTE EJERCICIO — el pie de la caja.
 *
 * Va al pie porque es donde se escribe: al acabar la última serie, con los
 * kilos delante. En reposo es una sola palabra, y sin sesión empezada dice qué
 * falta en vez de abrir un campo que no guardaría nada.
 */
const NotaDelEjercicio = ({ nombre, nota, onNota }) => {
  const [abierta, setAbierta] = useState(false);
  const escrita = String(nota || '').trim().length > 0;

  if (!abierta && !escrita) {
    return (
      <div className="pc-ej-nota">
        <button type="button" className="pc-nota-mas" onClick={() => setAbierta(true)}>
          + Nota
        </button>
      </div>
    );
  }

  return (
    <div className="pc-ej-nota">
      {onNota ? (
        <label className="pc-nota-campo">
          <span className="pc-rot">Tu nota</span>
          <textarea
            rows={2}
            value={nota || ''}
            placeholder="Lo que quieras recordar de este ejercicio."
            aria-label={`Tu nota de ${nombre}`}
            onChange={(ev) => onNota(ev.target.value)}
          />
          <span className="pc-nota-pie">La lee tu entrenador, con tus series.</span>
        </label>
      ) : (
        <p className="pc-nota-pie">Apunta una serie de este ejercicio y podrás anotar aquí.</p>
      )}
    </div>
  );
};

/**
 * LA CUENTA ATRÁS DEL DESCANSO, en la cabecera.
 *
 * Solo con descanso pautado (`empezarDescanso`). En la cabecera y no sobre las
 * series porque una pastilla ancha empujaría los campos hacia abajo cada dos
 * minutos. Su barrita no va en azul: el azul de esta pantalla ya significa
 * series hechas, y un descanso es tiempo que se va, no progreso.
 */
const CuentaAtras = ({ descanso, onSaltar }) => (
  <button
    type="button"
    className="pc-sesion-descanso"
    aria-label={`Saltar el descanso. Quedan ${mmss(descanso.restante)}`}
    onClick={onSaltar}
  >
    <span>
      <span className="pc-rot">Descanso</span>
      <b>{mmss(descanso.restante)}</b>
    </span>
    <span className="pc-sesion-descanso-barra" aria-hidden="true">
      <i style={{ width: `${Math.max(0, Math.min(100, (descanso.restante / descanso.total) * 100))}%` }} />
    </span>
  </button>
);
