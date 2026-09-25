import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, CloudOff, History, Minus, Plus } from 'lucide-react';

import { mmss } from '@/context/SesionEnCurso';
import { useDeslizarEntreDestinos } from '@/lib/useDeslizarEntreDestinos';
import { WarmupView } from '@/components/Coach/Workout/WarmupBlock';
import { objetivoDeSerie, pasoDelCampo, serieEnCorto, siguientePorHacer } from '../sesion';
import { Descanso } from './Descanso';
import {
  CAMPOS,
  ChapasDelEjercicio,
  EstadoDelGuardado,
  IndicacionDelEjercicio,
  NotaDelEjercicio,
  resumenDeSerie,
} from './PiezasDelEjercicio';
import { FechaTocable } from '@/components/ui/CalendarioDeLaSesion';

/**
 * «EN SESIÓN» EN EL TELÉFONO — el modo entreno de `docs/la-sesion-manda.md`.
 *
 * ══ La tesis ═══════════════════════════════════════════════════════════════
 *
 * El cliente no entra aquí a consultar: entra a hacer una sesión. Y en un
 * gimnasio se hacen dos cosas que no son la misma —repasar el día, una vez, y
 * apuntar la serie que acabas de hacer, sesenta veces, de pie, con una mano y
 * el pulso alto—. Esta pantalla es la segunda: **un ejercicio a la vez, y dentro
 * una serie a la vez**. El repaso es «Mi rutina», de la que se entra.
 *
 * ══ Moverse: el carril y el dedo ═══════════════════════════════════════════
 *
 * El dueño lo puso por delante de todo lo demás: *«un sistema cómodo de pasar
 * de un ejercicio a otro, moverse e interactuar para rellenar»*.
 *
 *   · **El carril de arriba** tiene el NOMBRE de cada ejercicio, con un visto
 *     en los terminados y el tuyo encendido. Se toca para ir.
 *   · **Deslizar** el cuerpo lleva al de al lado, con el mismo gesto con el que
 *     fuera de la sesión se cambia de destino (`useDeslizarEntreDestinos`).
 *   · **Y el pie** tiene «Siguiente», donde llega el pulgar.
 *
 * Cada ejercicio recuerda qué serie tenía abierta: ir a ver el siguiente y
 * volver te deja donde estabas, no en la primera.
 *
 * ══ Rellenar: la serie viva ════════════════════════════════════════════════
 *
 * La serie que toca va alzada, con un − y un + por campo y el número en medio,
 * que sigue siendo un campo: de 40 a 100 kg se escribe, no se toca veinticuatro
 * veces. El primer toque en un campo vacío pone lo de la vez anterior en ESA
 * serie (`pasoDelCampo`). «Hecha» la cierra y abre la siguiente.
 *
 * ══ Corregir: nada se cierra con llave ═════════════════════════════════════
 *
 * *«Que incluso si te confundes puedas darle otra vez y corregir.»* Una serie
 * hecha es un botón con sus valores dentro: tocarla la vuelve a abrir, igual
 * que estaba. Cerrar es una marca, no un cerrojo — y reabrir para corregir no
 * arranca otro descanso, porque no se ha terminado ninguna serie.
 *
 * ══ Dónde estás es donde has tocado algo ═══════════════════════════════════
 *
 * La serie abierta es ESTADO, y se fija al tocar. Derivarla de «la primera sin
 * hacer» la haría saltar sola: en este modelo una serie está hecha en cuanto
 * tiene repeticiones (`isSetLogged`), así que el primer «+» en las reps
 * teletransportaría la tarjeta a la serie siguiente con el dedo encima.
 *
 * ══ Lo que el prototipo tenía y aquí no ════════════════════════════════════
 *
 * **El reloj de la sesión** (el «12:04» de la cabecera). Se retiró el 11 de
 * septiembre por orden del dueño —«es un poco estresante»— y no ha vuelto: la
 * duración se dice una vez, en el cierre. En su sitio va «Terminar», que es la
 * salida que siempre tiene que estar a la vista.
 */
export const PantallaSesion = ({ datos }) => {
  const {
    cabecera,
    preambulo = null,
    ejercicios,
    showRir = false,
    activo = 0,
    onIr,
    descanso = null,
    onSumarDescanso,
    onSaltarDescanso,
    onCampo,
    onCerrarSerie,
    onFicha,
    onSalir,
    onAcabar,
    guardado = null,
    bloqueo = null,
  } = datos;

  /* El índice se acota aquí: los ejercicios de un día pueden cambiar de número
     con la pantalla abierta —su entrenador edita la hoja— y uno fuera del array
     dejaría la pantalla en blanco sin ningún error. */
  const n = ejercicios.length > 0 ? Math.min(Math.max(activo, 0), ejercicios.length - 1) : 0;
  const ej = ejercicios[n] || null;
  const siguiente = n < ejercicios.length - 1 ? ejercicios[n + 1] : null;

  /* Qué serie tiene abierta cada ejercicio, y si se abrió para corregir. */
  const [abiertas, setAbiertas] = useState({});
  const [corrigiendo, setCorrigiendo] = useState(null);
  const abierta = ej ? (abiertas[ej.id] ?? siguientePorHacer(ej.series)) : -1;
  const abrir = (i, { corregir = false } = {}) => {
    if (!ej) return;
    setAbiertas((a) => ({ ...a, [ej.id]: i }));
    setCorrigiendo(corregir ? `${ej.id}:${i}` : null);
  };

  /*
    El descanso tapa la pantalla, y se puede destapar sin pararlo: quien se da
    cuenta de que apuntó 8 en vez de 6 tiene que poder corregirlo con la cuenta
    corriendo. Se guarda el `fin` del descanso tapado para que el SIGUIENTE —otro
    `fin`— vuelva a salir solo.
  */
  const [tapado, setTapado] = useState(null);
  const descansoVisible = Boolean(descanso) && tapado !== descanso.fin;

  const cuerpo = useDeslizarEntreDestinos({
    indice: n,
    total: ejercicios.length,
    activo: ejercicios.length > 1 && !descansoVisible,
    alIr: (i) => onIr(i),
  });

  /* El carril se mueve con el ejercicio: el chip encendido siempre a la vista. */
  const carril = useRef(null);
  useEffect(() => {
    const chip = carril.current?.querySelector('[aria-current="step"]');
    chip?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
  }, [n]);

  if (!ej) return null;

  const escribir = (i, campo, valor) => {
    abrir(i, { corregir: corrigiendo === `${ej.id}:${i}` });
    onCampo(ej.id, i, campo, valor);
  };

  const cerrar = (i) => {
    const eraCorreccion = corrigiendo === `${ej.id}:${i}`;
    const ok = onCerrarSerie(ej.id, i, { descansar: !eraCorreccion });
    if (!ok) return;
    const conEsta = ej.series.map((s, k) => (k === i ? { ...s, hecha: true } : s));
    abrir(siguientePorHacer(conEsta, i));
  };

  const igual = (i, s) => {
    s.onIgual?.();
    const conEsta = ej.series.map((x, k) => (k === i ? { ...x, hecha: true } : x));
    abrir(siguientePorHacer(conEsta, i));
  };

  /* Lo que viene después del descanso, para que la pantalla que lo tapa lo diga. */
  const despues = (() => {
    if (abierta >= 0) {
      const s = ej.series[abierta];
      return { nombre: `${ej.nombre} · serie ${abierta + 1}`, meta: metaDeSerie(s) };
    }
    for (const otro of ejercicios.slice(n + 1)) {
      const k = siguientePorHacer(otro.series);
      if (k >= 0) return { nombre: `${otro.nombre} · serie ${k + 1}`, meta: metaDeSerie(otro.series[k]) };
    }
    return null;
  })();

  const campos = CAMPOS.filter((c) => c.key !== 'rir' || showRir);
  const cerradas = ej.series.map((s, i) => ({ s, i })).filter(({ s, i }) => s.hecha && i !== abierta);
  const pendientes = ej.series.map((s, i) => ({ s, i })).filter(({ s, i }) => !s.hecha && i !== abierta);
  const porcentaje = cabecera.series > 0 ? Math.round((cabecera.hechas / cabecera.series) * 100) : 0;

  return (
    <>
      {/* ── La cabecera de la sesión, en tinta: qué, cuánto llevas, la salida
          y el carril de ejercicios. Frame `327:337`, sin su reloj: la duración
          se dice una vez, al cerrar (el dueño, 11 y 18 sep). */}
      <div className="tel-ses-cab barra-tinta">
        <div className="tel-ses-linea">
          <button type="button" className="tel-atras" aria-label="Salir de la sesión" onClick={onSalir}>
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
          <span className="tel-ses-quien">
            <span className="tel-ses-rot">En sesión · {cabecera.nombre}</span>
            <span className="tel-ses-cuenta">
              {cabecera.hechas}/{cabecera.series} series
              {cabecera.dia ? (
                <>
                  {' · '}
                  <FechaTocable dia={{ ...cabecera.dia, texto: cabecera.dia.corto || cabecera.dia.texto }} />
                </>
              ) : null}
            </span>
          </span>
          {descanso && !descansoVisible ? (
            <button
              type="button"
              className="tel-ses-reposo"
              aria-label={`Ver el descanso. Quedan ${mmss(descanso.restante)}`}
              onClick={() => setTapado(null)}
            >
              {mmss(descanso.restante)}
            </button>
          ) : null}
          <button type="button" className="tel-terminar" onClick={onAcabar}>
            Terminar
          </button>
        </div>

        <nav className="tel-ses-carril" ref={carril} aria-label="Ejercicios de la sesión">
          {ejercicios.map((e, i) => {
            const hechos = e.series.length > 0 && e.series.every((s) => s.hecha);
            return (
              <button
                key={e.id}
                type="button"
                className={`tel-ses-chip${i === n ? ' tel-viva' : hechos ? ' tel-ok' : ''}`}
                aria-current={i === n ? 'step' : undefined}
                onClick={() => onIr(i)}
              >
                {hechos && i !== n ? <Check size={13} strokeWidth={3} aria-label="terminado" /> : null}
                {e.nombre}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="tel-ses-cuerpo" ref={cuerpo}>
        {/* Antes del primer ejercicio, lo que se lee antes de empezar: la
            indicación del día y el calentamiento. Ver `ClientSesionRoute`. */}
        {n === 0 && preambulo ? (
          <div className="tel-ses-preambulo">
            {preambulo.indicacion ? (
              <p className="tel-ses-indicacion">
                <span className="tel-ses-k">De tu entrenador</span>
                {preambulo.indicacion}
              </p>
            ) : null}
            <WarmupView drills={preambulo.calentamiento} />
          </div>
        ) : null}

        <div className="tel-ses-ej">
          <button type="button" className="tel-ses-titulo" onClick={() => onFicha(ej)}>
            {ej.nombre}
          </button>
          <span className="tel-ses-pos">
            {n + 1} de {ejercicios.length}
          </span>
        </div>
        <ChapasDelEjercicio musculo={ej.musculo} objetivo={ej.objetivo ? `${ej.objetivo} reps` : null} />

        {/* Lo que te pide tu entrenador de este ejercicio, antes de las
            series: es la condición con la que se hacen. */}
        <IndicacionDelEjercicio texto={ej.indicacion} />

        {/* La frontera de las revisiones: lo revisado se lee, no se escribe. */}
        {bloqueo ? <p className="tel-bloqueo">{bloqueo}</p> : null}

        <div className="tel-ses-series">
          {/* `display: contents`: el fieldset solo apaga, no dibuja. «Ir ›»
              queda fuera, porque moverse no es escribir. */}
          <fieldset className="fieldset-plano" disabled={Boolean(bloqueo)}>
          {/* Las hechas, arriba: un botón con sus valores que se toca para
              corregir. Cerrar es una marca, no un cerrojo. */}
          {cerradas.length > 0 ? (
            <>
              <span className="tel-ses-k tel-ses-k-izq">Series hechas</span>
              {cerradas.map(({ s, i }) => (
                <button
                  key={i}
                  type="button"
                  className={`tel-ses-fila tel-cerrada${s.noGuardada ? ' tel-no-guardada' : ''}`}
                  aria-label={`${s.noGuardada ? 'No guardada. ' : ''}Corregir la serie ${i + 1}: ${resumenDeSerie(s, showRir)}`}
                  onClick={() => abrir(i, { corregir: true })}
                >
                  <span className="tel-ses-num">{i + 1}</span>
                  <span className="tel-ses-res">{resumenDeSerie(s, showRir)}</span>
                  <span className="tel-ses-toca">{s.noGuardada ? 'No guardada' : 'Corregir'}</span>
                  {s.noGuardada ? (
                    <CloudOff className="tel-ses-tic" size={15} strokeWidth={2.4} aria-hidden="true" />
                  ) : (
                    <Check className="tel-ses-tic" size={15} strokeWidth={2.6} aria-hidden="true" />
                  )}
                </button>
              ))}
            </>
          ) : null}

          {abierta >= 0 ? (
            (() => {
              const i = abierta;
              const s = ej.series[i];
              const corrige = corrigiendo === `${ej.id}:${i}`;
              const puedeCerrar =
                s.hecha || Boolean(s.antesReps) || Boolean(s.pideReps && /^\d+$/.test(s.pideReps));
              return (
                <div className="tel-ses-viva">
                  <div className="tel-ses-viva-cab">
                    <span className="tel-ses-idx">Serie {i + 1}</span>
                    {s.noGuardada ? <span className="tel-ses-noguardada">No guardada</span> : null}
                    {objetivoDeSerie(s) ? (
                      <span className="tel-ses-obj">Objetivo: {objetivoDeSerie(s)}</span>
                    ) : null}
                  </div>

                  <div className={`tel-ses-campos${campos.length === 3 ? ' tel-tres' : ''}`}>
                    {campos.map((c) => (
                      <div className="tel-ses-campo" key={c.key}>
                        <span className="tel-ses-k">{c.rotulo}</span>
                        <div className="tel-ses-paso">
                          <button
                            type="button"
                            aria-label={`Bajar ${c.nombre} de la serie ${i + 1}`}
                            onClick={() =>
                              escribir(i, c.key, pasoDelCampo({ valor: s[c.key], previo: s[c.antes], campo: c.key, dir: -1 }))
                            }
                          >
                            <Minus size={13} aria-hidden="true" />
                          </button>
                          <input
                            type="number"
                            inputMode={c.modo}
                            step={c.key === 'kg' ? '0.5' : '1'}
                            value={s[c.key]}
                            placeholder={s[c.antes] || '—'}
                            aria-label={`${c.nombre} de la serie ${i + 1} de ${ej.nombre}`}
                            onChange={(ev) => escribir(i, c.key, ev.target.value)}
                          />
                          <button
                            type="button"
                            aria-label={`Subir ${c.nombre} de la serie ${i + 1}`}
                            onClick={() =>
                              escribir(i, c.key, pasoDelCampo({ valor: s[c.key], previo: s[c.antes], campo: c.key, dir: 1 }))
                            }
                          >
                            <Plus size={13} aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="tel-ses-viva-pie">
                    <History size={13} aria-hidden="true" />
                    <span className="tel-ses-ult">
                      {s.antesReps ? (
                        <>
                          Última vez:{' '}
                          <b>
                            {[
                              serieEnCorto({ kg: s.antesKg, reps: s.antesReps }),
                              showRir && s.antesRir !== '' && s.antesRir != null ? `RIR ${s.antesRir}` : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </b>
                        </>
                      ) : (
                        'Es la primera vez que haces esta serie'
                      )}
                    </span>
                    {s.antesReps && s.onIgual ? (
                      <button type="button" className="tel-ses-igual" onClick={() => igual(i, s)}>
                        = Igual
                      </button>
                    ) : null}
                  </div>

                  <button type="button" className="tel-ses-hecha" disabled={!puedeCerrar} onClick={() => cerrar(i)}>
                    {corrige ? 'Guardar la corrección' : 'Registrar serie'}
                  </button>
                </div>
              );
            })()
          ) : null}

          {pendientes.map(({ s, i }) => (
            <button
              key={i}
              type="button"
              className="tel-ses-fila tel-pendiente"
              aria-label={`Abrir la serie ${i + 1}`}
              onClick={() => abrir(i)}
            >
              <span className="tel-ses-num">{i + 1}</span>
              <span className="tel-ses-res">
                {objetivoDeSerie(s, { conKg: false }) ? `objetivo ${objetivoDeSerie(s, { conKg: false })}` : '—'}
              </span>
            </button>
          ))}
          </fieldset>

          {/* Todas hechas: lo siguiente es una puerta que se pulsa, no un salto. */}
          {abierta === -1 ? (
            <button type="button" className="tel-ses-fin" onClick={() => (siguiente ? onIr(n + 1) : onAcabar())}>
              <span className="tel-ses-k">Hecho</span>
              <span className="tel-ses-fin-n">{siguiente ? siguiente.nombre : 'Última serie de la sesión'}</span>
              <span className="tel-ses-fin-ir">{siguiente ? 'Ir ›' : 'Terminar ›'}</span>
            </button>
          ) : null}
        </div>

        <NotaDelEjercicio nombre={ej.nombre} nota={ej.nota} onNota={ej.onNota} ultimaVez={ej.ultimaVez} ajustes={ej.ajustes} />
      </div>

      {/* ── El pie: lo que llevas, lo guardado y el siguiente paso ────────── */}
      <div className="tel-ses-pie">
        <div className="tel-ses-pie-linea">
          <span className="tel-ses-pie-cuenta">
            {cabecera.hechas} de {cabecera.series} series ({porcentaje} %)
          </span>
          <button type="button" className="tel-ses-sig" onClick={() => (siguiente ? onIr(n + 1) : onAcabar())}>
            {siguiente ? 'Siguiente ›' : 'Terminar ›'}
          </button>
        </div>
        <span className="tel-barrita tel-barrita-6" aria-hidden="true">
          <i style={{ width: `${porcentaje}%` }} />
        </span>
        <EstadoDelGuardado guardado={guardado} />
      </div>

      {descansoVisible ? (
        <Descanso
          descanso={descanso}
          despues={despues}
          onSumar={() => onSumarDescanso?.(30)}
          onSaltar={onSaltarDescanso}
          onVolver={() => setTapado(descanso.fin)}
        />
      ) : null}
    </>
  );
};

/** «objetivo 8-10 · la última vez 45 kg · 8», para lo que viene después. */
const metaDeSerie = (s) =>
  [
    objetivoDeSerie(s, { conKg: false })
      ? `objetivo ${objetivoDeSerie(s, { conKg: false })}`
      : null,
    s?.antesReps ? `la última vez ${serieEnCorto({ kg: s.antesKg, reps: s.antesReps })}` : null,
  ]
    .filter(Boolean)
    .join(' · ') || null;
