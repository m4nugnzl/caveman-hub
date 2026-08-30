import { isModuleOn, modulesFor, toggleModule } from '@/domain/protocol';
import { clampInt } from '@/lib/num';
import { dayMonthMaybeYear } from '@/lib/dates';
import { Field, OptionCard, SegmentedControl } from '@/components/ui/primitives';

const CYCLE_OPTIONS = [
  { id: 'weekly', label: 'Semanal', hint: 'Atada a lunes–domingo' },
  { id: 'rotating', label: 'Rotativa', tone: 'tone-cyan', hint: 'Ciclo que se repite sin fin' },
];

/**
 * La estructura del programa: un PLIEGUE, y la configuración dentro.
 *
 * ══ De tarjeta a línea, y de línea a pliegue ════════════════════════════════
 *
 * Empezó siendo la primera tarjeta de la pantalla —icono en caja, titular,
 * cadena del patrón, botón— para algo que se configura una vez por cliente. Eso
 * era demasiado peso, así que pasó a una línea de voz baja que abría una
 * VENTANA. Y ese fue el error siguiente: una ventana modal tapa la pantalla y se
 * lleva el foco, y esto no viene de fuera — es el contexto del programa que se
 * está mirando. Se cambia el tipo de ciclo mirando los días que ya hay puestos.
 *
 * Ahora es la primera sección del panel de Ajustes, abierta: un panel que se
 * abre para esto no necesita un pliegue dentro. La cadena del ciclo ya no se
 * repite aquí —está en la pantalla del bloque, encima de las hojas—; el panel
 * dice lo que hay en una línea y deja los campos que lo cambian.
 *
 * Recibe por `children` lo que cada estructura añade (la planificación semanal
 * cuando el ciclo es semanal): así el editor no tiene que saber qué hay dentro
 * de la configuración.
 */
export const CycleSettings = ({
  client,
  onChange,
  protocol,
  onProtocolChange,
  resumenExtra,
  children,
}) => {
  const cycleType = client.cycleType || 'weekly';
  const pattern = client.cyclePattern || { train: 2, rest: 1 };

  /* Lo que el pliegue dice estando CERRADO. `resumenExtra` es lo que aporta
     cada estructura —los días de entreno de la semana natural—: lo pone quien
     pasa el editor de dentro, para que esto no tenga que saber qué lleva. */
  const resumen = [
    cycleType === 'weekly' ? 'Semana natural' : 'Ciclo rotativo',
    cycleType === 'rotating' &&
      `${pattern.train} entreno · ${pattern.rest} descanso`,
    client.startDate && `empieza el ${dayMonthMaybeYear(client.startDate)}`,
    resumenExtra,
  ]
    .filter(Boolean)
    .join('  ·  ');

  return (
    <div className="col gap-5">
        <div className="col gap-1">
          <h3 className="panel-seccion-titulo">Estructura</h3>
          <span className="t-sm t-tertiary">{resumen}</span>
        </div>
        <div className="row wrap gap-5">
          {/*
            ══ Cuándo empieza esta persona ═════════════════════════════════════

            La fecha existía desde el principio en la ficha, pero **no había
            ningún sitio donde escribirla**: se ponía sola el día que se creaba
            el cliente y ahí se quedaba. Y no es un dato decorativo — es el
            ancla de la que sale la «semana N» de las fotos, de los check-ins y
            de la revisión semanal (`domain/photos.js`, `domain/calendar.js`).
            Con alguien dado de alta dos semanas antes de empezar, todo ese eje
            iba corrido dos semanas y no había forma de corregirlo.
          */}
          <Field
            label="Empieza el"
            className="shrink-0"
            hint="De aquí sale la «semana 1» de fotos y check-ins"
          >
            {(props) => (
              <input
                {...props}
                type="date"
                className="input"
                style={{ width: 168 }}
                value={client.startDate || ''}
                onChange={(e) => onChange({ startDate: e.target.value || null })}
              />
            )}
          </Field>

          <Field label="Tipo de estructura">
            <SegmentedControl
              value={cycleType}
              onChange={(value) => onChange({ cycleType: value })}
              options={CYCLE_OPTIONS}
              label="Tipo de estructura"
            />
          </Field>

          {cycleType === 'rotating' && (
            <>
              <Field label="Días de entreno" className="shrink-0">
                {(props) => (
                  <input
                    {...props}
                    type="text"
                    inputMode="numeric"
                    className="input input-center"
                    style={{ width: 84 }}
                    value={pattern.train}
                    onChange={(e) =>
                      onChange({
                        cyclePattern: { ...pattern, train: clampInt(e.target.value, 1, 14, 1) },
                      })
                    }
                  />
                )}
              </Field>
              <Field label="Días de descanso" className="shrink-0">
                {(props) => (
                  <input
                    {...props}
                    type="text"
                    inputMode="numeric"
                    className="input input-center"
                    style={{ width: 84 }}
                    value={pattern.rest}
                    onChange={(e) =>
                      onChange({
                        cyclePattern: { ...pattern, rest: clampInt(e.target.value, 0, 14, 0) },
                      })
                    }
                  />
                )}
              </Field>
            </>
          )}
        </div>

        {children}

        {/*
          ══ Los módulos, AQUÍ y no solo en Ajustes ═══════════════════════════

          Vivían únicamente en Ajustes → Protocolo. Como concepto está bien —el
          entrenador decide qué existe en su app— pero como sitio era invisible:
          nadie va a una pantalla de ajustes a buscar una casilla que no sabe
          que existe. El síntoma exacto fue «das la opción de pautar RIR pero
          no veo dónde se hace en la rutina».

          Así que la decisión se toma donde se nota. Ajustes → Protocolo sigue
          siendo la lista completa y el sitio para dejarlo puesto de una vez
          para todos; esto es el interruptor a mano, para ESTE cliente, en la
          pantalla donde acabas de echarlo en falta.
        */}
        <fieldset className="col gap-2" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="section-label">Qué se usa con este cliente</legend>
          <div className="row wrap gap-4">
            {/* Solo los de ENTRENAMIENTO: esta pantalla es la rutina, y el de
                equivalencias tiene su interruptor a mano en la dieta. */}
            {modulesFor('training').map((mod) => (
              <OptionCard
                key={mod.id}
                inline
                label={mod.label}
                checked={isModuleOn(protocol, mod.id)}
                onChange={() => onProtocolChange(toggleModule(protocol, mod.id))}
              />
            ))}
          </div>
          <span className="t-2xs t-tertiary">
            Solo para {client.name}. En Ajustes → Protocolo lo dejas puesto para toda tu cartera.
          </span>
        </fieldset>
    </div>
  );
};
