import { useId } from 'react';
import { Check, CheckCircle2, Info, TriangleAlert, XCircle } from 'lucide-react';

/**
 * Primitivas de presentación compartidas.
 *
 * Cada una sustituye una duplicación real detectada en el código anterior:
 * la tarjeta de dato estaba reimplementada cuatro veces, el banner de aviso
 * tres, el estado vacío no existía (los módulos se limitaban a fallar), y el
 * indicador de guardado mentía diciendo "Guardado" cuando la escritura había
 * fallado.
 */

// ── Panel ──────────────────────────────────────────────────────────────────

export const Panel = ({ as: Tag = 'section', tight, plain, className = '', children, ...rest }) => (
  <Tag
    className={[plain ? 'card-inset' : 'card', tight && !plain ? 'card-tight' : '', className]
      .filter(Boolean)
      .join(' ')}
    {...rest}
  >
    {children}
  </Tag>
);

/**
 * La cabecera de una pantalla: cómo se llama esto y qué se hace aquí.
 *
 * ══ Por qué hace falta un componente ════════════════════════════════════════
 *
 * Solo DOS de las siete secciones de un cliente tenían cabecera. Progreso y
 * Nutrición abrían diciendo qué eran; Rutina, Revisión, Calendario y Ficha
 * entraban directamente en controles —selectores de semana, barras de
 * herramientas, formularios—. El efecto era que cambiar de sección se sentía como
 * cambiar de aplicación, y en el móvil, donde el carril se pierde al desplazar,
 * no quedaba nada que dijera dónde estás.
 *
 * El patrón existía (`.section-head`) pero estaba copiado a mano en nueve
 * archivos, que es justo la forma de que la décima pantalla no lo lleve.
 *
 * ── Por qué emite un `h1` ───────────────────────────────────────────────────
 * Porque ninguna pantalla del panel tenía uno: la jerarquía empezaba en `h2` y
 * colgaba de la nada. El único `h1` del portal era «Hola, Marta», repetido
 * idéntico en las siete secciones — para un lector de pantalla, siete pantallas
 * con el mismo nombre. El saludo es cortesía; el título es estructura.
 */
export const PageHead = ({ title, sub, action }) => (
  <div className="section-head">
    <div>
      <h1>{title}</h1>
      {sub && <p>{sub}</p>}
    </div>
    {action}
  </div>
);

export const SectionTitle = ({ icon: Icon, color, children, action }) => (
  <div className="row between wrap gap-2">
    <h3 className="section-title" style={color ? { color } : undefined}>
      {Icon && <Icon size={17} />}
      {children}
    </h3>
    {action}
  </div>
);

// ── Tarjeta de dato ────────────────────────────────────────────────────────

export const StatCard = ({ label, value, color, sub, center = true }) => (
  <div className={`stat${center ? ' stat-center' : ''}`}>
    <span className="stat-label">{label}</span>
    <span className="stat-value" style={color ? { color } : undefined}>
      {value}
    </span>
    {sub && <span className="stat-sub">{sub}</span>}
  </div>
);

// ── Avisos ─────────────────────────────────────────────────────────────────

const NOTICE_ICONS = {
  error: XCircle,
  success: CheckCircle2,
  info: Info,
  warn: TriangleAlert,
};

export const Notice = ({ tone = 'info', children, action }) => {
  const Icon = NOTICE_ICONS[tone] || Info;
  return (
    <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon size={16} style={{ flexShrink: 0, marginTop: 1 }} />
      <span className="grow">{children}</span>
      {action}
    </div>
  );
};

// ── Estado vacío ───────────────────────────────────────────────────────────

export const EmptyState = ({ icon: Icon, title, message, action }) => (
  <Panel>
    <div className="empty">
      {Icon && (
        <span className="empty-icon">
          <Icon size={26} />
        </span>
      )}
      <h3>{title}</h3>
      {message && <p>{message}</p>}
      {action}
    </div>
  </Panel>
);

// ── Indicador de guardado ──────────────────────────────────────────────────

/**
 * Muestra el estado REAL de la escritura. El comportamiento anterior era
 * mostrar "✓ Guardado" siempre que no hubiera una petición en vuelo, incluso
 * si la última había fallado: el usuario perdía trabajo creyéndolo a salvo.
 */
export const SaveIndicator = ({ status, error, onRetry }) => {
  if (status === 'saving') {
    return (
      <span className="save-indicator is-saving" role="status">
        <span className="save-dot" />
        Guardando…
      </span>
    );
  }

  if (status === 'error') {
    return (
      <span className="save-indicator is-error" role="alert">
        <XCircle size={13} />
        {error ? `No se guardó: ${error}` : 'No se pudo guardar'}
        {onRetry && (
          <button type="button" className="btn btn-danger btn-sm" onClick={onRetry}>
            Reintentar
          </button>
        )}
      </span>
    );
  }

  if (status === 'saved') {
    return (
      <span className="save-indicator is-saved" role="status">
        <CheckCircle2 size={13} color="var(--accent)" />
        Guardado
      </span>
    );
  }

  return null;
};

// ── Controles de formulario ────────────────────────────────────────────────

export const Field = ({ label, hint, error, children, className = '' }) => {
  const id = useId();
  const isRenderProp = typeof children === 'function';
  const control = isRenderProp ? children({ id, 'aria-invalid': Boolean(error) }) : children;

  /*
   * `htmlFor` solo cuando el control recibe de verdad ese id (render prop). Con
   * hijos normales —un SegmentedControl, un grupo de chips— el id nunca llega a
   * ningún elemento, y un <label for> que apunta a la nada es peor que no tener
   * label: los lectores de pantalla anuncian una etiqueta huérfana. En ese caso
   * se usa un <span> y el grupo lleva su propio aria-label.
   */
  return (
    <div className={`field ${className}`}>
      {label &&
        (isRenderProp ? (
          <label className="field-label" htmlFor={id}>
            {label}
          </label>
        ) : (
          <span className="field-label">{label}</span>
        ))}
      {control}
      {error ? <span className="field-error">{error}</span> : hint && <span className="field-hint">{hint}</span>}
    </div>
  );
};

/**
 * Campo numérico. `type="text"` + `inputMode="decimal"` a propósito: en
 * `type="number"` la rueda del ratón cambia el valor sin querer y Safari no
 * respeta el separador decimal de la configuración regional.
 */
export const NumberInput = ({ value, onChange, center = true, className = '', ...rest }) => (
  <input
    type="text"
    inputMode="decimal"
    autoComplete="off"
    className={`input${center ? ' input-center' : ''} ${className}`}
    value={value ?? ''}
    onChange={(e) => onChange(e.target.value)}
    {...rest}
  />
);

export const TextInput = ({ value, onChange, className = '', ...rest }) => (
  <input
    type="text"
    className={`input ${className}`}
    value={value ?? ''}
    onChange={(e) => onChange(e.target.value)}
    {...rest}
  />
);

/* ==========================================================================
   Elegir cosas: la tarjeta y el interruptor
   --------------------------------------------------------------------------
   ══ Qué había antes ═════════════════════════════════════════════════════════

   Un `<input type="checkbox">` con `accent-color` y una cadena de texto al lado,
   repetido en diez sitios bajo la misma clase (`.checkbox-row`). Debajo de esa
   única forma convivían tres gestos que no se parecen:

     · ELEGIR QUÉ INCLUIR — «copiar entrenamiento, dieta y calentamiento», «qué
       módulos existen para este cliente». Opciones con nombre, explicación y
       consecuencias: una de ellas sustituye doce semanas de programa, y estaba
       representada por un tic gris de 16 px.
     · ENCENDER UNA OPCIÓN — «dos dietas distintas», «fase abierta». Un ajuste.
     · MARCAR UNA TAREA — los pasos del alta, el consentimiento legal. Ahí una
       casilla es lo correcto, y se queda.

   Y el tic era el del sistema operativo, que no es del producto: cambia de forma
   entre Windows, macOS y Android, no respeta el radio ni el color de nada, y con
   `accent-color` lo único configurable es el relleno.

   ══ Por qué las dos montan sobre un `<input>` de verdad ════════════════════

   Porque es lo que da gratis el teclado (tabulador y espacio), el foco, el
   `:checked` desde CSS y el anuncio correcto en un lector de pantalla. Un `<div
   role="checkbox">` obliga a reimplementar las cuatro cosas y a acordarse de las
   cuatro en cada sitio.

   El input se esconde con `.pick-input` —posición absoluta y opacidad cero, NO
   `display: none`, que lo sacaría del árbol de accesibilidad— y lo que se pinta
   es un hermano suyo. El estado sale de `:has(.pick-input:checked)`.
   ========================================================================== */

/**
 * Una opción que se incluye o no: icono, nombre y por qué importa.
 *
 * `hint` no es decorativo. Estas listas deciden cosas irreversibles —copiar
 * SUSTITUYE lo que hubiera— y el nombre suelto no basta para saber qué se lleva
 * por delante «Entrenamiento».
 *
 * @param inline  Para listas de opciones cortas y sin explicación, donde la
 *   tarjeta a lo ancho sería una fila de rectángulos medio vacíos.
 */
export const OptionCard = ({
  icon: Icon,
  label,
  hint,
  checked,
  onChange,
  disabled = false,
  inline = false,
  name,
}) => (
  /* El estado marcado va en la clase y no en un `:has()` sobre el input. React ya
     lo sabe, y si el selector no se resolviera el fallo no sería estético: una
     opción marcada se vería igual que una sin marcar. Ver el bloque de CSS. */
  <label
    className={[
      'opt-card',
      inline && 'is-inline',
      checked && 'is-on',
      disabled && 'is-off',
    ]
      .filter(Boolean)
      .join(' ')}
  >
    <input
      type="checkbox"
      className="pick-input"
      name={name}
      checked={Boolean(checked)}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
    />
    <span className="mark" aria-hidden="true">
      <Check size={13} strokeWidth={3} />
    </span>
    <span className="body">
      <span className="nm">
        {Icon && <Icon size={14} />}
        {label}
      </span>
      {hint && <span className="hint">{hint}</span>}
    </span>
  </label>
);

/**
 * Un ajuste con dos estados.
 *
 * La diferencia con `OptionCard` no es estética: una tarjeta dice «esto entra en
 * la operación que estás a punto de lanzar» y un interruptor dice «esto queda
 * así a partir de ahora». Usarlos al revés hace que una lista de opciones parezca
 * un panel de preferencias, que es lo que pasaba.
 */
export const Switch = ({ label, hint, checked, onChange, disabled = false }) => (
  <label className={['switch-row', checked && 'is-on', disabled && 'is-off'].filter(Boolean).join(' ')}>
    <input
      type="checkbox"
      role="switch"
      className="pick-input"
      checked={Boolean(checked)}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
    />
    <span className="track" aria-hidden="true" />
    <span className="body">
      <span className="nm">{label}</span>
      {hint && <span className="hint">{hint}</span>}
    </span>
  </label>
);

// ── Segmented control ──────────────────────────────────────────────────────

/**
 * @param ancho  A todo lo ancho del contenedor, con las opciones repartidas a
 *   partes iguales. Por defecto NO: el carril mide lo que miden sus opciones,
 *   porque colgando de una columna —dentro de un `.field`, de un `.col`— lo
 *   estiraba el contenedor y las dos opciones se quedaban a la izquierda de un
 *   rectángulo gris medio vacío.
 *
 *   Se pide cuando el control hace de cabecera de una tarjeta estrecha y las
 *   opciones son las dos caras de lo mismo (entrar / crear cuenta): ahí, media
 *   tarjeta hueca al lado de las pestañas también se lee mal.
 */
export const SegmentedControl = ({ value, onChange, options, tone = '', label, ancho = false }) => (
  <div className={`segmented${ancho ? ' is-full' : ''}`} role="group" aria-label={label}>
    {options.map((opt) => (
      <button
        key={opt.id}
        type="button"
        className={`segmented-item ${opt.tone || tone}`}
        aria-pressed={value === opt.id}
        onClick={() => onChange(opt.id)}
        title={opt.hint}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

// ── Selector de semana / sesión ────────────────────────────────────────────

/**
 * Carril horizontal de semanas. Había tres copias de este componente (editor
 * de rutina, analítica de volumen y portal del cliente), con estilos que ya
 * habían divergido entre sí.
 */
export const WeekPicker = ({ weeks, value, onChange, prefix = 'Sem', onAdd, addLabel = 'Nueva' }) => (
  <div className="rail" role="tablist" aria-label="Semanas del programa">
    {weeks.map((week) => (
      <button
        key={week}
        type="button"
        role="tab"
        className="chip"
        aria-pressed={week === value}
        aria-selected={week === value}
        onClick={() => onChange(week)}
      >
        {prefix} {week}
      </button>
    ))}
    {onAdd && (
      <button type="button" className="chip chip-dashed" onClick={onAdd}>
        + {addLabel}
      </button>
    )}
  </div>
);
