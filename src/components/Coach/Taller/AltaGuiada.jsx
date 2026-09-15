import { useState } from 'react';
import { Dumbbell, Salad } from 'lucide-react';

import { ALERT_DAYS, ALERT_DAYS_MAX, SERVICES, isServiceOn } from '@/domain/protocol';
import { CHECKIN_CADENCES } from '@/domain/calendar';
import { DIAS, sanitizeSchedule } from '@/domain/protocolos';
import { intakeSteps, toggleStep } from '@/domain/intake';
import { clampInt } from '@/lib/num';
import { Modal } from '@/components/ui/Modal';
import { Field, OptionCard, Switch } from '@/components/ui/primitives';

/**
 * TRES PREGUNTAS, LA PRIMERA VEZ.
 *
 * ══ Para quién es ══════════════════════════════════════════════════════════
 *
 * Para quien abre Protocolos el primer día. Lo que se encuentra hoy es una
 * pantalla correcta y seis sustantivos nuevos —protocolo, acción, premisa,
 * formulario, plantilla, enchufe— entre abrir la puerta y montar la primera
 * cosa. Ninguno es gratuito y todos significan algo distinto; el problema es
 * que son seis antes de tocar nada, y quien viene de una hoja de cálculo no
 * tiene dónde agarrarse.
 *
 * Así que el primer día no se le enseña el vocabulario: se le hacen tres
 * preguntas que ya sabe contestar.
 *
 *   1. ¿Qué le das?           → entrenamiento, nutrición o las dos
 *   2. ¿Qué le pides y cuándo? → el cuestionario de entrada y el día del check-in
 *   3. ¿De qué te aviso?       → su silencio
 *
 * Después, la pantalla de siempre. No es un modo distinto ni un producto
 * reducido: las tres preguntas escriben las mismas claves que los mandos de la
 * pantalla, así que lo que se monte aquí se sigue tocando allí.
 *
 * ══ Y no escribe hasta el final ════════════════════════════════════════════
 *
 * Un asistente que va guardando por el camino deja el protocolo a medias si lo
 * cierras en la pregunta dos, y el que vuelve no sabe qué contestó. Aquí se
 * contesta en un borrador y se escribe UNA vez, al pulsar «Montarlo». Cerrar
 * antes no cambia nada.
 *
 * ══ Y se puede no volver a ver ═════════════════════════════════════════════
 *
 * Quien ya tiene su forma de trabajar montada no necesita esto, y un asistente
 * que reaparece se convierte en un paso muerto que hay que esquivar cada vez.
 * La invitación vive en la lista de protocolos con su propio «Ahora no», y eso
 * lo apaga para siempre (ver `ProtocolosPanel`).
 */

const ICONO_SERVICIO = { training: Dumbbell, nutrition: Salad };

const PASOS = [
  {
    id: 'das',
    titulo: '¿Qué le das?',
    sub: 'Lo que lleva quien empiece contigo. A cada cliente se lo puedes cambiar luego en su ficha.',
  },
  {
    id: 'pides',
    titulo: '¿Qué le pides, y cuándo?',
    sub: 'Lo que contesta él: el cuestionario de entrada y su check-in de cada semana.',
  },
  {
    id: 'avisos',
    titulo: '¿De qué te aviso?',
    sub: 'Sale en tu cola de Inicio cuando alguien lleva días callado. El cliente no se entera de esto.',
  },
];

export const AltaGuiada = ({ protocolo, formularios, onMontar, onCerrar }) => {
  const [paso, setPaso] = useState(0);

  const altas = formularios.filter((f) => f.momento === 'alta');
  const horario = sanitizeSchedule(protocolo.schedule);

  /* El borrador: lo contestado, sin tocar el protocolo hasta el final. */
  const [b, setB] = useState(() => ({
    services: { training: isServiceOn(protocolo, 'training'), nutrition: isServiceOn(protocolo, 'nutrition') },
    pideAlta: intakeSteps(protocolo.intake).some((s) => s.id === 'form'),
    altaId: protocolo.forms?.alta || altas[0]?.id || null,
    weekday: horario.weekday,
    everyWeeks: horario.everyWeeks,
    alertDays: {
      training: protocolo.alertDays?.training || 0,
      weight: protocolo.alertDays?.weight || 0,
    },
  }));

  const set = (patch) => setB((v) => ({ ...v, ...patch }));

  /*
    Lo contestado, convertido en protocolo. Se escribe con los mismos ayudantes
    que usan los mandos de la pantalla —`toggleStep` para el paso del alta— para
    que no haya dos formas de encender la misma cosa.
  */
  const montar = () => {
    const tieneForm = intakeSteps(protocolo.intake).some((s) => s.id === 'form');
    const intake =
      b.pideAlta === tieneForm ? protocolo.intake : toggleStep(protocolo.intake, 'form');

    onMontar({
      ...protocolo,
      services: { ...protocolo.services, ...b.services },
      intake,
      forms: { ...protocolo.forms, alta: b.pideAlta ? b.altaId : protocolo.forms?.alta || null },
      schedule: sanitizeSchedule({ ...horario, weekday: b.weekday, everyWeeks: b.everyWeeks }),
      alertDays: { ...protocolo.alertDays, ...b.alertDays },
    });
  };

  /* El último que queda encendido no se puede apagar: sin ninguno de los dos no
     queda aplicación que enseñarle. Es la misma regla que `toggleService`, dicha
     aquí porque aquí el control es una tarjeta y no un interruptor. */
  const soloUno = (id) =>
    b.services[id] && !SERVICES.some((s) => s.id !== id && b.services[s.id]);

  const actual = PASOS[paso];

  return (
    <Modal size="lg" title={actual.titulo} onClose={onCerrar}>
      {/*
        La pregunta la dice la ventana, y aquí NO se repite. Es la misma falta
        que tenía el panel del protocolo —decir dos veces lo mismo hace leer dos
        veces buscando la diferencia—. Lo que sí hace falta es cuántas quedan:
        sin eso, «Siguiente» es una puerta a un número desconocido de pantallas,
        que es lo que hace abandonar un formulario partido.
      */}
      <div className="col gap-5 guiada">
        <div className="col gap-1">
          <p className="t-xs t-tertiary">
            Pregunta {paso + 1} de {PASOS.length}
          </p>
          <p className="selector-sub">{actual.sub}</p>
        </div>

        {/* ── 1 · Qué le das ──────────────────────────────────────────── */}
        {actual.id === 'das' && (
          <div className="col gap-2">
            {SERVICES.map((s) => (
              <OptionCard
                key={s.id}
                icon={ICONO_SERVICIO[s.id]}
                label={s.label}
                hint={
                  soloUno(s.id)
                    ? 'Tiene que quedar al menos uno: sin entrenamiento y sin nutrición no queda nada que enseñarle.'
                    : s.hint
                }
                checked={b.services[s.id]}
                disabled={soloUno(s.id)}
                onChange={(v) => set({ services: { ...b.services, [s.id]: v } })}
              />
            ))}
          </div>
        )}

        {/* ── 2 · Qué le pides ────────────────────────────────────────── */}
        {actual.id === 'pides' && (
          <div className="col gap-4">
            <div className="col gap-2">
              <Switch
                label="Un cuestionario al entrar"
                hint="Lo contesta en su portal antes de empezar: su historia, sus lesiones, cómo come y cómo entrena."
                checked={b.pideAlta}
                onChange={(v) => set({ pideAlta: v })}
              />
              {b.pideAlta && altas.length > 0 && (
                <Field label="Cuál">
                  <select
                    className="select select-sm"
                    value={b.altaId || altas[0].id}
                    onChange={(e) => set({ altaId: e.target.value })}
                  >
                    {altas.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>

            {/*
              El check-in no se pregunta si lo quiere: es la semana cerrándose,
              que es de lo que va la aplicación. Lo que se pregunta es CUÁNDO, y
              se dice en la frase entera y no en dos cajas sueltas — la misma
              gramática que el rótulo de su premisa en la pantalla.
            */}
            <p className="premisa-frase">
              Le pides el check-in los{' '}
              <select
                className="input input-sm premisa-dia"
                value={b.weekday}
                aria-label="Qué día se le pide el check-in"
                onChange={(e) => set({ weekday: Number(e.target.value) })}
              >
                {DIAS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.plural}
                  </option>
                ))}
              </select>
              ,{' '}
              <select
                className="input input-sm premisa-dia"
                value={b.everyWeeks}
                aria-label="Cada cuántas semanas se le pide"
                onChange={(e) => set({ everyWeeks: Number(e.target.value) })}
              >
                {CHECKIN_CADENCES.map((c) => (
                  <option key={c.weeks} value={c.weeks}>
                    {c.weeks === 1 ? 'todas las semanas' : `cada ${c.weeks} semanas`}
                  </option>
                ))}
              </select>
              .
            </p>
          </div>
        )}

        {/* ── 3 · De qué te aviso ─────────────────────────────────────── */}
        {actual.id === 'avisos' && (
          <div className="col gap-3">
            {ALERT_DAYS.map((umbral) => {
              const dias = b.alertDays[umbral.id];
              return (
                <div className="col gap-2" key={umbral.id}>
                  <Switch
                    label={umbral.label}
                    hint={umbral.hint}
                    checked={dias > 0}
                    onChange={(v) =>
                      set({ alertDays: { ...b.alertDays, [umbral.id]: v ? 7 : 0 } })
                    }
                  />
                  {dias > 0 && (
                    <Field label="A los cuántos días">
                      <input
                        className="input input-sm input-center"
                        inputMode="numeric"
                        style={{ width: 80 }}
                        value={dias}
                        aria-label={`Días antes de avisar: ${umbral.label}`}
                        onChange={(e) =>
                          set({
                            alertDays: {
                              ...b.alertDays,
                              [umbral.id]: clampInt(e.target.value, 1, ALERT_DAYS_MAX, 1),
                            },
                          })
                        }
                      />
                    </Field>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="row-end gap-2">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => (paso === 0 ? onCerrar() : setPaso(paso - 1))}
          >
            {paso === 0 ? 'Cancelar' : 'Atrás'}
          </button>
          {paso < PASOS.length - 1 ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setPaso(paso + 1)}>
              Siguiente
            </button>
          ) : (
            <button type="button" className="btn btn-primary btn-sm" onClick={montar}>
              Montarlo
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};
