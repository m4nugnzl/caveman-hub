import { NotaDelLogbook } from '../LogbookDelEjercicio';
import { serieEnCorto, textoDelFallo } from '../sesion';

/**
 * LO QUE COMPARTEN LAS DOS PUERTAS A UNA SESIÓN: el modo entreno
 * (`PantallaSesion`, una serie a la vez) y el registro suelto
 * (`RegistroDelEjercicio`, todas a la vez, para pasar lo del papel).
 *
 * Las dos escriben con las mismas funciones de `ClientSesionRoute` sobre la
 * misma sesión; lo que cambia es cómo se rellenan las series. Todo lo demás
 * —qué ejercicio es, lo que pide tu entrenador, tu nota, si se ha guardado—
 * se dice igual, y por eso vive aquí una vez.
 */

/** Los campos de una serie. El RIR, solo si la hoja lo usa. */
export const CAMPOS = [
  { key: 'kg', rotulo: 'kg', nombre: 'Kilos', modo: 'decimal', antes: 'antesKg' },
  { key: 'reps', rotulo: 'reps', nombre: 'Repeticiones', modo: 'numeric', antes: 'antesReps' },
  { key: 'rir', rotulo: 'RIR', nombre: 'RIR', modo: 'numeric', antes: 'antesRir' },
];

/** «55 kg · 6 · RIR 0» — lo que dice una serie cerrada. */
export const resumenDeSerie = (s, showRir) =>
  [serieEnCorto(s), showRir && s.rir !== '' && s.rir != null ? `RIR ${s.rir}` : null]
    .filter(Boolean)
    .join(' · ');

/**
 * El grupo muscular y el objetivo del ejercicio, en chapas. Sus ajustes no van
 * aquí: viven al pie, con sus notas (`NotaDelEjercicio`).
 */
export const ChapasDelEjercicio = ({ musculo, objetivo }) =>
  musculo || objetivo ? (
    <div className="tel-chapas">
      {musculo ? (
        <span className="tel-chapa tel-chapa-grupo">{musculo.charAt(0).toUpperCase() + musculo.slice(1)}</span>
      ) : null}
      {objetivo ? <span className="tel-chapa">Objetivo: {objetivo}</span> : null}
    </div>
  ) : null;

/** Lo que te pide tu entrenador de este ejercicio: la condición con la que se hace. */
export const IndicacionDelEjercicio = ({ texto }) =>
  texto ? (
    <p className="tel-ses-indicacion">
      <span className="tel-ses-k">De tu entrenador</span>
      {texto}
    </p>
  ) : null;

/**
 * LO GUARDADO, dicho en corto.
 *
 * Es la misma lectura que el indicador de la casa (`SaveIndicator`): sin
 * conexión no es un fallo —lo tienes, falta enviarlo— y un fallo de verdad
 * trae su «Reintentar». Sin nada escrito todavía no dice nada: «Guardado»
 * antes de la primera serie sería mentira.
 */
export const EstadoDelGuardado = ({ guardado }) => {
  const status = guardado?.status;
  if (status === 'saved') return <span className="tel-ses-guardado tel-si">Guardado ✓</span>;
  if (status === 'saving') return <span className="tel-ses-guardado">Guardando…</span>;
  if (status === 'pending') return <span className="tel-ses-guardado">Sin conexión · se enviará</span>;
  if (status === 'error') {
    return (
      <span className="tel-ses-guardado tel-no" role="alert">
        {textoDelFallo(guardado)}
        {guardado.onRetry ? (
          <button type="button" onClick={guardado.onRetry}>
            Reintentar
          </button>
        ) : null}
      </span>
    );
  }
  return <span className="tel-ses-guardado" />;
};

/**
 * TU NOTA DE ESTE EJERCICIO, y lo que apuntaste la última vez.
 *
 * Es el logbook (0139): sus ajustes, la nota de la última vez y la de hoy, cada
 * uno en su renglón. La pieza es la misma en el PC: ver `LogbookDelEjercicio`.
 */
export const NotaDelEjercicio = ({ nombre, nota, onNota, ultimaVez = null, ajustes = null }) => (
  <NotaDelLogbook pre="tel" nombre={nombre} nota={nota} onNota={onNota} ultimaVez={ultimaVez} ajustes={ajustes} />
);
