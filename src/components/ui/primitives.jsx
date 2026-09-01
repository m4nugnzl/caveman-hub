import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Check, CheckCircle2, ChevronRight, Info, Loader2, Plus, TriangleAlert, XCircle } from 'lucide-react';

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

/**
 * Un bloque.
 *
 * ══ Por qué la cabecera va DENTRO del bloque ════════════════════════════════
 *
 * Porque un `<h2>` suelto flotando sobre una rejilla no es un bloque: es texto
 * encima de otra cosa, y el ojo tiene que deducir dónde empieza y dónde acaba lo
 * que ese título nombra. La aplicación estaba llena de eso —«Menú estructurado»
 * sobre una rejilla de tarjetas, «Tu resumen» sobre otra— y es una de las dos
 * razones por las que las pantallas se leían como una pila y no como una
 * estructura. La otra es que no todas tenían cabecera (ver `PageHead`).
 *
 * ── El título va en ETIQUETA TROQUELADA, no en `<h2>` ────────────────────────
 * Los tokens ya dicen que la troquelada «es lo que ordena la pantalla ahora que
 * el cromo no puede usar color para hacerlo», y sin embargo se usaba de adorno
 * en cuatro sitios mientras los bloques se titulaban de cinco formas distintas
 * —`<h2>`, `<h2 class="section-title">`, `<span class="section-title">`, un
 * `<h2>` con `style` inline—. Aquí se cierra: **el título de un bloque es una
 * etiqueta troquelada**, y `SectionTitle` (`h3`) queda para los sub-bloques.
 *
 * ── Y la acción, en la cabecera ─────────────────────────────────────────────
 * Nunca suelta entre el título y el contenido, que es donde estaba en Nutrición
 * —un «Copiar desde días de descanso» flotando al lado de unas pestañas—. Si el
 * bloque tiene algo que hacer, se hace desde su cabecera.
 *
 * @param title   La etiqueta troquelada. Sin ella no se pinta cabecera, que es
 *   el caso legítimo de una tarjeta que ya se explica por su contenido.
 * @param sub     Una línea, opcional, debajo del título.
 * @param action  Lo que se puede hacer con este bloque. A la derecha.
 */
/*
  ══ Los bloques tienen DOS rangos, y la gramática escrita solo tenía uno ═════

  `docs/producto.md` §5.2 dice que el título de un bloque va siempre en etiqueta
  troquelada. Se escribió cuando todos los bloques del producto eran del mismo
  tamaño —una tarjeta, un asunto, cuatro filas— y ahí la regla es correcta.

  El tablero de la revisión enseñó el caso que faltaba. Sus bloques no son
  tarjetas: «Su cuerpo» son tres tramos con lo que cuenta el cliente, sus fotos y
  sus medidas; «Su entreno», una recta por ejercicio con su historial. Nombrar
  eso con la misma versalita de diez píxeles con la que se nombra un tramo de su
  interior deja la pantalla sin un solo nivel de jerarquía: el bloque y las
  piezas de dentro hablan igual de alto.

  Así que la respuesta no era volver a la versalita. Era que existe un rango más,
  y que en vez de vivir en tres archivos del tablero —con `.bloque-head`,
  `.bloque-say`, `.bloque-titulo` y `.bloque-sub`, una copia entera de esta
  cabecera— viva aquí, donde cualquier pantalla con bloques grandes puede
  pedirlo y donde no puede divergir.

  Sigue habiendo cuatro niveles y ni uno más. Lo que cambia es que el tercero,
  el bloque, se dice de dos maneras según lo que pese:

    PageHead     h1                 cómo se llama esta pantalla        1
    GroupHead    h2 troquelada      de qué va esta tanda               0-2
    Panel        troquelada         qué es este bloque                 las que hagan falta
      · rango «bloque»  h2          …cuando el bloque es media pantalla
    SectionTitle h3                 una pieza dentro de un bloque      ídem
*/
export const Panel = ({
  as: Tag = 'section',
  tight,
  plain,
  title,
  sub,
  action,
  rango = 'rotulo',
  className = '',
  children,
  ...rest
}) => (
  <Tag
    className={[plain ? 'card-inset' : 'card', tight && !plain ? 'card-tight' : '', className]
      .filter(Boolean)
      .join(' ')}
    {...rest}
  >
    {(title || action) && (
      <header className="panel-head">
        <div className="panel-head-say">
          {title &&
            (rango === 'bloque' ? (
              <h2 className="panel-head-titulo">{title}</h2>
            ) : (
              <span className="section-label">{title}</span>
            ))}
          {sub && <p className="panel-head-sub">{sub}</p>}
        </div>
        {action}
      </header>
    )}
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
 *
 * ── `remate`: la parte humana del título, en cursiva ────────────────────────
 * La misma forma que los titulares de la portada: «Le montas la semana, *y él
 * la registra*». Dentro del producto es para la frase que acompaña al nombre de
 * la pantalla —el saludo del portal del cliente, sobre todo— y va en un `em` de
 * verdad: énfasis para el lector de pantalla, cursiva de Archivo para el ojo.
 * No es un segundo título: si hacen falta dos frases, la segunda es `sub`.
 */
export const PageHead = ({ title, remate, sub, action }) => (
  <div className="section-head">
    <div>
      <h1>
        {title}
        {remate && <> <em>{remate}</em></>}
      </h1>
      {sub && <p>{sub}</p>}
    </div>
    {action}
  </div>
);

/**
 * El nombre de un GRUPO de bloques.
 *
 * ══ Por qué hace falta un nivel más ═════════════════════════════════════════
 *
 * Porque hay pantallas que no son una lista de bloques sino dos tandas de
 * bloques con asuntos distintos, y sin un nivel para nombrar la tanda acababan
 * teniendo **dos cabeceras de pantalla**: la nutrición abría con «Plan
 * nutricional» en `h2` y a media pantalla ponía «Menú estructurado» en otro
 * `h2` idéntico, así que para un lector de pantalla eran dos pantallas pegadas y
 * para el ojo eran dos productos.
 *
 * La jerarquía completa, y no hay más:
 *
 *   `PageHead`     h1  · cómo se llama esta pantalla        — una por pantalla
 *   `GroupHead`    h2  · de qué va esta tanda de bloques    — cero, una o dos
 *   `Panel title`  —   · qué es este bloque, en troquelada
 *   `SectionTitle` h3  · una pieza dentro de un bloque
 *
 * ── Por qué en troquelada y no a tamaño de titular ──────────────────────────
 * Porque un grupo no compite con la pantalla: la ordena por dentro. A tamaño de
 * titular, «Menú estructurado» pesaba lo mismo que «Plan nutricional» y la
 * pantalla parecía partirse en dos. En troquelada —más grande que la de un
 * bloque, pero troquelada— se lee como un rótulo de tramo.
 */
export const GroupHead = ({ title, sub, action }) => (
  <div className="group-head">
    <div>
      <h2 className="section-label is-group">{title}</h2>
      {sub && <p>{sub}</p>}
    </div>
    {action}
  </div>
);

/**
 * Una fila que se despliega EN SU SITIO.
 *
 * ══ Por qué una primitiva y no otra ventana ═════════════════════════════════
 *
 * Había tres formas para el mismo gesto —«esto está plegado, ábrelo»— y las tres
 * en la misma pantalla: la estructura del programa era una línea de voz baja que
 * abría un **modal**, el calentamiento un panel con `.proto-toggle` que se abría
 * en su sitio, y la planificación semanal otro panel con `.panel-toggle`. Tres
 * aspectos, dos comportamientos y una ventana de por medio para algo que ES el
 * contexto de la página que estás mirando.
 *
 * Una ventana modal interrumpe: tapa la pantalla, se lleva el foco y hay que
 * cerrarla para volver a ver lo que estabas montando. Eso está bien para lo que
 * viene de FUERA —traer de otro cliente, elegir un día ajeno— y está mal para lo
 * que ya está aquí. La configuración del programa se toca mirando el programa.
 *
 * ── Lo que el pliegue enseña estando cerrado ────────────────────────────────
 * `summary` no es decorativo: es la razón de que plegar no sea esconder. «Semana
 * natural · empieza el 12 sept · 4 días de entreno» contesta la pregunta sin
 * abrir nada, y quien la abre es porque viene a cambiarla.
 *
 * Controlado (`open` + `onToggle`) cuando alguien de fuera necesita abrirlo —una
 * acción que lleva ahí—; con su propio estado (`defaultOpen`) en el caso normal.
 */
export const Fold = ({
  icon: Icon,
  title,
  summary,
  defaultOpen = false,
  open: openProp,
  onToggle,
  children,
}) => {
  const [interno, setInterno] = useState(defaultOpen);
  const controlado = openProp !== undefined;
  const open = controlado ? openProp : interno;

  return (
    <div className="fold">
      <button
        type="button"
        className="fold-head"
        aria-expanded={open}
        onClick={() => (controlado ? onToggle() : setInterno((v) => !v))}
      >
        {Icon && <Icon size={15} aria-hidden="true" />}
        <span className="fold-title">{title}</span>
        {summary && <span className="fold-sum">{summary}</span>}
        <ChevronRight size={15} className="chevron" aria-hidden="true" />
      </button>
      {open && <div className="fold-body">{children}</div>}
    </div>
  );
};

/**
 * Una pieza dentro de un bloque (`h3`, el cuarto y último nivel de §5.1 bis).
 *
 * ── Por qué la fila lleva clase propia ──────────────────────────────────────
 * Porque `.section-title` solo tenía tipografía: ni un margen. Mientras un
 * bloque tuvo un solo apartado no se notó, pero en cuanto hay tres o cuatro
 * seguidos —la radiografía tiene paneles con cuatro— cada título sale pegado a
 * lo que termina encima y a lo que empieza debajo. Y **un título pegado a lo de
 * arriba no titula**: se lee como una línea más de aquello.
 *
 * El aire no puede ir en el `h3` porque el `h3` vive dentro de esta fila —que
 * es la que lleva la acción a la derecha—, así que los márgenes del hijo no
 * salen de ella. Va en la fila.
 */
export const SectionTitle = ({ icon: Icon, color, children, action }) => (
  <div className="section-title-row row between wrap gap-2">
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
  /* La lumbre: un vacío suele ser lo único que hay en pantalla, así que puede
     llevar el momento cálido sin pelearse con nadie. Ver `.card-lumbre`. */
  <Panel className="card-lumbre">
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

/**
 * Carga en línea: tres puntos que laten y una frase.
 *
 * Había cinco «Cargando…» escritos a mano —cada uno con sus clases— y el
 * fallback de Suspense era otro. Uno solo, con `role="status"` para que el
 * lector de pantalla lo anuncie sin robar el foco, y deliberadamente SOBRIO:
 * un texto pequeño en tinta terciaria, no un spinner a pantalla completa. La
 * regla global de menos movimiento para los puntos tras un ciclo
 * (`animation-iteration-count: 1`), igual que hace con el punto de «Guardando…».
 */
export const Loading = ({ label = 'Cargando…' }) => (
  <p className="loading" role="status">
    <span className="loading-dots" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
    {label}
  </p>
);

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
 * EL carril de semanas. Uno, para todo el producto (la prohibición 7 de la
 * gramática: había cinco selectores de semana y el objetivo es uno).
 *
 * Había tres copias de este componente (editor de rutina, analítica de volumen
 * y portal del cliente), con estilos que ya habían divergido; y aun después de
 * la primitiva, el editor de rutina y el estudio de fotos seguían escribiendo
 * el mismo `weeks.map(...)` a mano. Lo que necesitaban eran cuatro grados de
 * libertad, no otro componente:
 *
 *   · `chipLabel` — el editor pinta `S4`/`M4` porque su carril convive con diez
 *     semanas y tres botones; el resto pinta `Sem 4`. Es la etiqueta, no el
 *     comportamiento.
 *   · `wrap` — en un panel el carril se desplaza (`.rail`); dentro de una hoja
 *     o de un formulario, envuelve (`.rail-wrap`). Las dos clases ya existían.
 *   · `multiple` — el estudio de fotos ELIGE VARIAS semanas para compararlas:
 *     `value` es un array y `onChange` recibe la semana a conmutar.
 *   · `label` — lo que anuncia el lector de pantalla («Semanas del programa»,
 *     «Semanas a comparar»…).
 */
export const WeekPicker = ({
  weeks,
  value,
  onChange,
  prefix = 'Sem',
  chipLabel,
  label = 'Semanas del programa',
  wrap = false,
  multiple = false,
  onAdd,
  addLabel = 'Nueva',
}) => {
  const texto = chipLabel || ((week) => `${prefix} ${week}`);
  const activa = (week) => (multiple ? value.includes(week) : week === value);

  /*
    Cuando el carril no cabe, se abre por la semana ABIERTA.

    Con siete semanas en un teléfono se ven cuatro, y las que se quedan fuera
    son las últimas: justo la que se está mirando y el «+ Semana 8» que hay
    detrás — o sea, la semana en curso y el gesto de empezar la siguiente. El
    carril arrancaba en la 1, que es la única que nadie busca.

    Se mueve el `scrollLeft` del propio carril y no se usa `scrollIntoView`:
    ese arrastraría también la página, y la lista puede estar a media pantalla.
    Solo al montar; después manda el dedo.
  */
  const carril = useRef(null);
  useEffect(() => {
    const caja = carril.current;
    if (!caja || caja.scrollWidth <= caja.clientWidth) return;
    const chip = caja.querySelector('[aria-pressed="true"]');
    if (!chip) return;
    caja.scrollLeft = chip.offsetLeft - (caja.clientWidth - chip.offsetWidth) / 2;
  }, []);

  return (
    /*
      `group` + `aria-pressed`, NO `tablist`/`tab`. El patrón de tabs exige un
      contrato completo —flechas para moverse, `tabpanel` asociado— que esto no
      tiene ni necesita; y llevaba `aria-pressed` Y `aria-selected` a la vez, así
      que un lector de pantalla anunciaba dos estados. Es el mismo contrato que ya
      usa `SegmentedControl`, y `aria-pressed` cubre igual la selección múltiple.
    */
    <div className={wrap ? 'rail-wrap' : 'rail'} role="group" aria-label={label} ref={carril}>
      {weeks.map((week) => (
        <button
          key={week}
          type="button"
          className="chip"
          aria-pressed={activa(week)}
          onClick={() => onChange(week)}
        >
          {texto(week)}
        </button>
      ))}
      {onAdd && (
        <button type="button" className="chip chip-dashed" onClick={onAdd}>
          <Plus size={13} /> {addLabel}
        </button>
      )}
    </div>
  );
};

/* ==========================================================================
   Renombrar en su sitio
   --------------------------------------------------------------------------
   El nombre de una comida (Dieta) y la pestaña de un día (Entreno) se editaban
   cada uno por su cuenta: en Dieta la casilla era el propio título y en Entreno
   salía una caja gris con relleno que, además, se fijaba al largo del nombre
   original y lo recortaba en cuanto se escribía una letra de más.

   Aquí hay una sola casilla para los dos: hereda la letra de lo que sustituye
   —el título en Dieta, la pestaña en Entreno—, no pinta caja, marca que se está
   editando con un subrayado de acento y crece con lo que se escribe.
   ========================================================================== */

/**
 * @param {string} value        Nombre actual.
 * @param {(nombre: string) => void} onRename  Solo se llama si cambia y no queda vacío.
 * @param {() => void} onDone   Cerrar la edición (Escape, Enter o salir del foco).
 * @param {string} [variante]   Clase de contexto: `is-comida` o `is-dia`.
 */
export const RenombrarEnSitio = ({ value, onRename, onDone, variante = '', label, min = 6 }) => {
  const [texto, setTexto] = useState(value);
  // Enter dispara el submit y, al desmontarse el formulario, también el blur:
  // sin este cerrojo el renombrado se pediría dos veces.
  const [cerrado, setCerrado] = useState(false);

  const confirmar = () => {
    if (cerrado) return;
    setCerrado(true);
    const nombre = texto.trim();
    if (nombre && nombre !== value) onRename(nombre);
    onDone();
  };

  return (
    <form
      className={`renombrar ${variante}`.trim()}
      onSubmit={(e) => {
        e.preventDefault();
        confirmar();
      }}
    >
      <input
        autoFocus
        className="renombrar-input"
        style={{ width: `${Math.max(min, texto.length + 2)}ch` }}
        value={texto}
        aria-label={label}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          setCerrado(true);
          onDone();
        }}
        onBlur={confirmar}
      />
    </form>
  );
};

/**
 * ══ EL BOTÓN QUE TARDA ══════════════════════════════════════════════════════
 *
 * Un botón cuya acción va al servidor: se pulsa, trabaja, y confirma.
 *
 * ── El problema que resuelve ────────────────────────────────────────────────
 * Cada sitio se lo montaba a mano y casi siempre igual de mal: se cambiaba el
 * RÓTULO por «Guardando…». «Cerrar y pasar a Marta →» pasaba a una palabra, o
 * sea que el botón se encogía a la mitad justo al soltarlo y volvía a crecer al
 * terminar — dos saltos de tamaño en el elemento que se acaba de tocar. Y lo
 * peor: al acabar no confirmaba nada. Volvía a su estado inicial, que es
 * exactamente lo mismo que se ve cuando no ha pasado nada.
 *
 * ── Los tres estados, y por qué son tres ────────────────────────────────────
 *   REPOSO   el icono, si lo tiene.
 *   OCUPADO  el giro ocupa el hueco del icono. El rótulo no se mueve.
 *   HECHO    un tic durante 900 ms, DONDE ha ocurrido — no en una esquina.
 *
 * Los 900 ms no son un adorno: son la diferencia entre «se ha guardado» y «no
 * sé si le he dado». Un aviso en la esquina contraria de la pantalla obliga a
 * mirar a otro sitio para enterarse de algo que pasó bajo el dedo.
 *
 * ── El contrato con quien lo usa ────────────────────────────────────────────
 * `onClick` puede ser asíncrono. Si devuelve `false` —o revienta— el botón
 * vuelve a reposo SIN tic: fallar no se celebra. Contar QUÉ ha fallado sigue
 * siendo de quien llama, que es quien tiene el mensaje; esto solo se encarga de
 * no mentir.
 *
 * Y no se puede pulsar dos veces: mientras trabaja está deshabilitado, pero sin
 * apagarse —un botón al 40 % en mitad de su propio trabajo parece averiado—.
 */
/**
 * La máquina de los tres estados, suelta.
 *
 * ── Por qué existe aparte del botón ─────────────────────────────────────────
 * Porque la mitad de los botones que tardan son el `submit` de un formulario, y
 * ahí quien decide cuándo empieza el trabajo NO es el clic: es el `onSubmit`
 * del formulario —que también se dispara con Enter dentro de un campo—. Un
 * botón que se gobernara solo desde su `onClick` dejaría a esa mitad sin giro y
 * sin tic, o peor, obligaría a convertirlos en `type="button"` y a perder el
 * Enter, que es como se rellena un formulario de verdad.
 *
 * Así que el formulario llama a `lanzar(...)` desde su `onSubmit` y le pasa el
 * `estado` al botón. El resto de sitios no se entera de que esto existe: usa
 * `BotonAccion` con su `onClick` y ya.
 */
export const useAccionDeBoton = () => {
  const [estado, setEstado] = useState('reposo');
  /*
    El tic vive 900 ms, y en ese tiempo la fila puede haberse ido. Sin esta
    guarda, `setEstado` sobre un componente ya desmontado.

    ── Y se ENCIENDE al montar, no solo se apaga al desmontar ────────────────
    Escrito como `useEffect(() => () => { vivo.current = false }, [])` esto está
    roto en desarrollo, y lo estuvo: `StrictMode` monta, desmonta y vuelve a
    montar cada componente a propósito, así que la limpieza corre una vez nada
    más arrancar y el testigo se queda apagado PARA SIEMPRE. Efecto visible: el
    botón entraba en «ocupado» y no salía nunca.
  */
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);

  /*
    ── Por qué el cerrojo es un `ref` y no el propio estado ───────────────────
    La primera versión leía el estado DENTRO del actualizador para decidir si
    arrancar: `setEstado((previo) => { arranca = previo === 'reposo'; … })`. Es
    una función de actualización con efecto lateral, y `StrictMode` las invoca
    DOS VECES a propósito para destapar justo eso: la segunda pasada leía ya
    «ocupado», ponía `arranca` a falso y el trabajo no llegaba a lanzarse nunca.

    Desde fuera se veía como un botón que entra en «ocupado» y se queda ahí, sin
    petición ninguna a la red. Un `ref` no pasa por el reconciliador y por tanto
    no se ejecuta dos veces.
  */
  const enMarcha = useRef(false);

  const lanzar = useCallback(async (trabajo, ...args) => {
    /* Doble pulsación: la segunda no vuelve a lanzar el trabajo. */
    if (enMarcha.current) return undefined;
    enMarcha.current = true;
    setEstado('ocupado');

    /*
      Qué cuenta como fracaso, en las tres formas que usa este proyecto:
      reventar, devolver `false`, o devolver el `{ ok: false }` que devuelven las
      acciones del contexto. Sin la tercera, un enlace de invitación que el
      servidor rechaza salía con un tic verde — que es peor que no confirmar
      nada, porque afirma algo falso.
    */
    let salida;
    let bien = true;
    try {
      salida = await trabajo?.(...args);
      bien = salida !== false && !(salida && typeof salida === 'object' && salida.ok === false);
    } catch {
      bien = false;
    }

    enMarcha.current = false;

    if (!vivo.current) return salida;
    if (!bien) {
      setEstado('reposo');
      return salida;
    }
    setEstado('hecho');
    setTimeout(() => {
      if (vivo.current) setEstado('reposo');
    }, 900);
    return salida;
  }, []);

  return { estado, lanzar };
};

export const BotonAccion = ({
  icon: Icon,
  /* Dónde vive el hueco. Delante casi siempre; detrás cuando el icono es una
     flecha que ANTICIPA a dónde lleva pulsar —«Cerrar y pasar a Marta →»—, que
     leída delante del rótulo diría otra cosa. */
  alFinal = false,
  children,
  onClick,
  /* Gobernado desde fuera (formularios). Sin esto, el botón se gobierna solo. */
  estado: estadoFuera,
  className = 'btn btn-secondary',
  disabled = false,
  ...rest
}) => {
  const propio = useAccionDeBoton();
  const estado = estadoFuera ?? propio.estado;

  const pulsar = (e) => propio.lanzar(onClick, e);

  const marca = (
    <span
      className={`btn-glifo${!Icon && estado === 'reposo' ? ' is-hueco' : ''}`}
      aria-hidden="true"
    >
      {estado === 'ocupado' ? (
        <Loader2 size={14} className="spin" />
      ) : estado === 'hecho' ? (
        <Check size={14} />
      ) : Icon ? (
        <Icon size={14} />
      ) : null}
    </span>
  );

  return (
    <button
      type="button"
      {...rest}
      className={`${className}${Icon ? '' : ' is-sin-icono'}`}
      data-estado={estado}
      aria-busy={estado === 'ocupado'}
      disabled={disabled || estado !== 'reposo'}
      /* Sin `onClick` el botón es el `submit` de un formulario: quien lanza el
         trabajo es el `onSubmit`, y engancharse también aquí lo haría dos
         veces. */
      onClick={onClick ? pulsar : undefined}
    >
      {!alFinal && marca}
      {/* El rótulo va envuelto, y no suelto: en los botones SIN icono el giro se
          pone encima y el rótulo se apaga, y para apagar algo hay que poder
          seleccionarlo — un texto suelto dentro del botón no es un elemento. */}
      <span className="btn-rotulo">{children}</span>
      {alFinal && marca}
    </button>
  );
};
