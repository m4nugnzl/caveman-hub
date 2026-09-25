import { ArrowLeft, Check, CloudOff } from 'lucide-react';

import { FechaTocable } from '@/components/ui/CalendarioDeLaSesion';
import { shortDate } from '@/lib/dates';
import { Boton } from './Piezas';
import {
  CAMPOS,
  ChapasDelEjercicio,
  EstadoDelGuardado,
  IndicacionDelEjercicio,
  NotaDelEjercicio,
} from './PiezasDelEjercicio';

/**
 * EL REGISTRO SUELTO DE UN EJERCICIO — la otra puerta a la sesión (23 sep).
 *
 * ══ Para quién ═════════════════════════════════════════════════════════════
 *
 * Para quien entrena sin el móvil, lo apunta en papel y lo pasa después (la
 * idea es de un cliente). El modo entreno estorba ahí: una serie a la vez, con
 * su «Registrar serie» y su descanso, son tres toques por serie para copiar
 * números que ya tienes delante. Aquí están todas las series a la vez, una fila
 * cada una, y el teclado salta de campo en campo.
 *
 * ══ Es la misma sesión ═════════════════════════════════════════════════════
 *
 * No es un modo ni otra copia de los datos: escribe con las mismas funciones
 * de `ClientSesionRoute` que el modo entreno, sobre la misma sesión. Se puede
 * empezar guiado y terminar aquí, o al revés. Cada campo se guarda al
 * escribirlo; «Guardar» vuelve a la hoja, y solo se queda si el servidor ha
 * rechazado algo, para que se vea.
 *
 * En gris, dentro de cada campo, lo que hiciste la última vez en ESA serie.
 */
export const RegistroDelEjercicio = ({ datos }) => {
  const { cabecera, ejercicio: ej, showRir, onCampo, guardado, bloqueo, onGuardar } = datos;
  const campos = CAMPOS.filter((c) => c.key !== 'rir' || showRir);
  const conAntes = ej.series.some((s) => campos.some((c) => s[c.antes]));

  /* «Siguiente» en el teclado del teléfono: al campo de al lado, y al acabar
     la fila, a la primera de la siguiente. */
  const alSiguiente = (ev) => {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    const todos = [...ev.currentTarget.form.querySelectorAll('input')];
    const i = todos.indexOf(ev.currentTarget);
    if (i >= 0 && i < todos.length - 1) todos[i + 1].focus();
    else ev.currentTarget.blur();
  };

  return (
    <>
      <header className="tel-cab tel-cab-atras">
        <div className="tel-cab-linea">
          <button type="button" className="tel-atras" aria-label={`Volver a ${cabecera.nombre}`} onClick={onGuardar}>
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
          <h1 className="tel-cab-tit">{ej.nombre}</h1>
        </div>
        <div className="tel-cab-sub">
          {[cabecera.nombre, cabecera.cuando].filter(Boolean).join(' · ')}
          {cabecera.dia ? (
            <>
              {' · '}
              <FechaTocable dia={{ ...cabecera.dia, texto: cabecera.dia.corto || cabecera.dia.texto }} />
            </>
          ) : null}
        </div>
      </header>

      <section className="tel-seccion tel-reg">
        <ChapasDelEjercicio musculo={ej.musculo} objetivo={ej.pauta} />
        <IndicacionDelEjercicio texto={ej.indicacion} />

        {bloqueo ? <p className="tel-bloqueo">{bloqueo}</p> : null}

        <form className="tel-reg-form" onSubmit={(ev) => ev.preventDefault()}>
          <fieldset className="tel-reg-tabla" disabled={Boolean(bloqueo)}>
            <legend className="sr-only">Series de {ej.nombre}</legend>
            <div className={`tel-reg-fila tel-reg-rotulos${campos.length === 3 ? ' tel-tres' : ''}`} aria-hidden="true">
              <span>Serie</span>
              {campos.map((c) => (
                <span key={c.key}>{c.rotulo}</span>
              ))}
              <span />
            </div>
            {ej.series.map((s, i) => (
              <div key={i} className={`tel-reg-fila${campos.length === 3 ? ' tel-tres' : ''}${s.hecha ? ' tel-hecha' : ''}`}>
                <span className="tel-reg-num">{i + 1}</span>
                {campos.map((c) => (
                  <input
                    key={c.key}
                    className="tel-reg-campo"
                    type="number"
                    inputMode={c.modo}
                    enterKeyHint="next"
                    step={c.key === 'kg' ? '0.5' : '1'}
                    value={s[c.key]}
                    placeholder={s[c.antes] || '—'}
                    aria-label={`${c.nombre} de la serie ${i + 1}${s[c.antes] ? `. La última vez, ${s[c.antes]}` : ''}`}
                    onChange={(ev) => onCampo(ej.id, i, c.key, ev.target.value)}
                    onKeyDown={alSiguiente}
                  />
                ))}
                <span className="tel-reg-marca">
                  {s.noGuardada ? (
                    <CloudOff size={15} strokeWidth={2.4} aria-label="No guardada" />
                  ) : s.hecha ? (
                    <Check size={15} strokeWidth={2.6} aria-label="Apuntada" />
                  ) : null}
                </span>
              </div>
            ))}
          </fieldset>
        </form>
        {conAntes ? (
          <p className="tel-reg-pista">
            En gris, lo que hiciste {ej.ultimaVez?.fecha ? `el ${shortDate(ej.ultimaVez.fecha)}` : 'la última vez'}.
          </p>
        ) : null}

        <NotaDelEjercicio nombre={ej.nombre} nota={ej.nota} onNota={ej.onNota} ultimaVez={ej.ultimaVez} ajustes={ej.ajustes} />
      </section>

      <div className="tel-reg-pie">
        <EstadoDelGuardado guardado={guardado} />
        <Boton onClick={onGuardar} className="tel-boton-44">
          Guardar
        </Boton>
      </div>
    </>
  );
};
