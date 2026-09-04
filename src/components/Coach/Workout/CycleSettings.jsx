import { isModuleOn, modulesFor, toggleModule } from '@/domain/protocol';
import { clampInt } from '@/lib/num';
import { Field, SegmentedControl, Switch } from '@/components/ui/primitives';

const CYCLE_OPTIONS = [
  { id: 'weekly', label: 'Semanal', hint: 'Atada a lunes–domingo' },
  { id: 'rotating', label: 'Rotativa', tone: 'tone-cyan', hint: 'Ciclo que se repite sin fin' },
];

/**
 * Los ajustes del programa: lo que se decide UNA VEZ por cliente.
 *
 * ══ De tarjeta a línea, de línea a pliegue, de pliegue a panel ═════════════
 *
 * Empezó siendo la primera tarjeta de la pantalla —icono en caja, titular,
 * cadena del patrón, botón— para algo que se configura una vez por cliente. Eso
 * era demasiado peso, así que pasó a una línea de voz baja que abría una
 * ventana; luego a la primera sección de un panel lateral del alto de la
 * pantalla. Y el panel lateral fallaba por dos motivos: un carril a plomo con
 * el contenido acabado al tercio deja dos tercios de columna vacía, y `side`
 * está para MIRAR un detalle sin soltar el trabajo —el histórico de un
 * ejercicio— no para decidir. Esto se decide: es un diálogo.
 *
 * ══ La gramática es la de «Ajustes del plan» ═══════════════════════════════
 *
 * La dieta ya tenía este mismo artefacto (`nutrition/AjustesPlan`): rótulo de
 * grupo en voz baja, el carril de dos opciones con su explicación debajo —que
 * cambia según cuál esté puesta—, un filete, y lo que son interruptores puestos
 * como interruptores. Aquí se repite tal cual, que es lo que hace que las dos
 * pantallas se lean como el mismo producto.
 *
 * Los módulos ESTABAN como `OptionCard`, y esa es la confusión que el propio
 * `ui/primitives` advierte: una tarjeta marcable dice «esto entra en la
 * operación que vas a lanzar» y un interruptor dice «esto queda así a partir de
 * ahora». Cinco tarjetas en dos columnas desiguales leían como una lista de
 * opciones de un asistente; son preferencias.
 *
 * Recibe por `children` lo que cada estructura añade (la planificación semanal
 * cuando el ciclo es semanal): así el editor no tiene que saber qué hay dentro
 * de la configuración.
 */
export const CycleSettings = ({ client, onChange, protocol, onProtocolChange, children }) => {
  const cycleType = client.cycleType || 'weekly';
  const pattern = client.cyclePattern || { train: 2, rest: 1 };

  return (
    <div className="col gap-4">
      <div className="col gap-3">
        <span className="section-label">Cómo se estructura</span>

        <div className="row-end wrap">
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
        </div>

        {cycleType === 'rotating' && (
          <div className="row wrap gap-4">
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
          </div>
        )}

        {/* La explicación del carril, debajo y en voz baja: cambia con lo que
            esté puesto, igual que en los ajustes de la dieta. */}
        <p className="t-xs t-tertiary">
          {cycleType === 'weekly'
            ? 'Sus semanas van de lunes a domingo, y cada día del microciclo cae en un día de la semana.'
            : 'Su ciclo se repite sin fin, sin atarse al calendario: los días se numeran dentro del ciclo.'}
        </p>

        {children}
      </div>

      <hr className="menu-sep" />

      {/*
        ══ Los módulos, AQUÍ y no solo en Ajustes ═══════════════════════════

        Vivían únicamente en Ajustes → Protocolo. Como concepto está bien —el
        entrenador decide qué existe en su app— pero como sitio era invisible:
        nadie va a una pantalla de ajustes a buscar una casilla que no sabe
        que existe. El síntoma exacto fue «das la opción de pautar RIR pero
        no veo dónde se hace en la rutina».

        Así que la decisión se toma donde se nota. Ajustes → Protocolo sigue
        siendo la lista completa —con la explicación de cada uno— y el sitio
        para dejarlo puesto de una vez para todos; esto es el interruptor a
        mano, para ESTE cliente, en la pantalla donde acabas de echarlo en
        falta. Por eso aquí van solo los rótulos: la letra pequeña de allí
        habla de «las preguntas que elijas abajo», y ese abajo no existe aquí.
      */}
      <fieldset className="col gap-3" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="section-label">Qué se usa con este cliente</legend>
        {/* Solo los de ENTRENAMIENTO: esta pantalla es la rutina, y el de
            equivalencias tiene su interruptor a mano en la dieta. */}
        <div className="col gap-3">
          {modulesFor('training').map((mod) => (
            <Switch
              key={mod.id}
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
