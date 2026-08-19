import {
  ArrowLeft,
  ArrowRight,
  BookmarkPlus,
  Check,
  Columns2,
  Plus,
  RectangleHorizontal,
  RotateCcw,
  Users,
  X,
} from 'lucide-react';

import {
  CARDS,
  DASHBOARD_PRESETS,
  WIDGETS,
  cardById,
  cardSpan,
  matchingPreset,
} from '@/domain/preferences';

/**
 * Herramientas que aparecen SOBRE cada pieza del panel en modo edición.
 *
 * ── Por qué encima de la pieza y no en una lista aparte ─────────────────────
 * Antes la personalización era un modal con dos listas de nombres. Elegías a
 * ciegas: «Volumen por músculo» no dice qué tamaño ocupa ni qué aspecto tiene, y
 * había que cerrar el diálogo para descubrirlo. Aquí se toca la pieza real, en su
 * sitio, y el panel se reordena debajo del dedo.
 */
export const SlotTools = ({ label, index, total, span, onMove, onToggleSpan, onHide }) => (
  <div className="slot-tools" role="group" aria-label={`Ajustar ${label}`}>
    <button
      type="button"
      className="slot-btn"
      disabled={index === 0}
      onClick={() => onMove('up')}
      aria-label={`Mover ${label} antes`}
      title="Mover antes"
    >
      <ArrowLeft size={13} />
    </button>
    <button
      type="button"
      className="slot-btn"
      disabled={index === total - 1}
      onClick={() => onMove('down')}
      aria-label={`Mover ${label} después`}
      title="Mover después"
    >
      <ArrowRight size={13} />
    </button>

    {onToggleSpan && (
      <button
        type="button"
        className="slot-btn"
        onClick={onToggleSpan}
        aria-label={span === 'full' ? `Poner ${label} a media fila` : `Poner ${label} a fila completa`}
        title={span === 'full' ? 'Media fila' : 'Fila completa'}
      >
        {span === 'full' ? <Columns2 size={13} /> : <RectangleHorizontal size={13} />}
      </button>
    )}

    <button
      type="button"
      className="slot-btn is-danger"
      onClick={onHide}
      aria-label={`Quitar ${label} del panel`}
      title="Quitar del panel"
    >
      <X size={13} />
    </button>
  </div>
);

/** Bandeja de lo que está oculto, para volver a añadirlo. */
const Tray = ({ title, catalogue, chosen, onAdd }) => {
  const hidden = catalogue.filter((item) => !chosen.includes(item.id));
  if (hidden.length === 0) return null;

  return (
    <div className="tray">
      <span className="tray-title">{title}</span>
      <div className="rail">
        {hidden.map((item) => (
          <button
            key={item.id}
            type="button"
            className="chip chip-dashed"
            onClick={() => onAdd(item.id)}
            title={item.hint}
          >
            <Plus size={13} /> {item.label}
          </button>
        ))}
      </div>
    </div>
  );
};

/**
 * Barra de edición del panel: perfiles, extras y salida.
 *
 * ── Los perfiles son la pieza importante ────────────────────────────────────
 * Elegir ocho cifras y cinco gráficos de una lista es trabajo, y casi nadie lo
 * hace: la personalización que exige media hora no se usa. Un perfil deja el
 * panel montado de un toque, y el ajuste fino queda para quien lo quiera.
 */
export const DashboardEditBar = ({
  prefs,
  onApplyPreset,
  onToggleMetricList,
  onReset,
  onDone,
  onSaveAsDefault,
  onApplyToAll,
  audience,
}) => {
  const preset = matchingPreset(prefs);

  return (
    <div className="editbar">
      <div className="editbar-head">
        <div>
          <span className="section-label">Estás personalizando el resumen</span>
          <p className="t-xs t-tertiary">
            {audience === 'client'
              ? 'Mueve, redimensiona o quita cada pieza. Se guarda en tu cuenta al instante.'
              : 'Mueve, redimensiona o quita cada pieza. Se guarda en la ficha del cliente al instante.'}
          </p>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={onDone}>
          <Check size={14} /> Listo
        </button>
      </div>

      <div className="col gap-2">
        <span className="tray-title">Perfiles</span>
        <div className="rail">
          {DASHBOARD_PRESETS.map((option) => (
            <button
              key={option.id}
              type="button"
              className="chip"
              aria-pressed={preset?.id === option.id}
              onClick={() => onApplyPreset(option.prefs)}
              title={option.hint}
            >
              {option.label}
            </button>
          ))}
          <button type="button" className="chip chip-dashed" onClick={onReset}>
            <RotateCcw size={13} /> Por defecto
          </button>
        </div>
      </div>

      {/*
        Sacar esta configuración del cliente y convertirla en la TUYA.

        Es la pieza que faltaba. Configurar el resumen se hacía por cliente, así
        que un entrenador con veinte carteras lo repetía veinte veces —y cuando
        cambiaba de opinión, otras veinte—. El resultado real era que nadie
        personalizaba nada: se quedaba el panel por defecto porque no compensaba.

        Solo para el entrenador: un cliente configura su propio panel y no tiene
        a quién aplicárselo.
      */}
      {audience !== 'client' && (onSaveAsDefault || onApplyToAll) && (
        <div className="col gap-2">
          <span className="tray-title">Tu plantilla</span>
          <div className="rail">
            {onSaveAsDefault && (
              <button
                type="button"
                className="chip"
                onClick={onSaveAsDefault}
                title="Los clientes nuevos empezarán con este resumen. Los que ya tengas no se tocan."
              >
                <BookmarkPlus size={13} /> Guardar como mi plantilla
              </button>
            )}
            {onApplyToAll && (
              <button
                type="button"
                className="chip"
                onClick={onApplyToAll}
                title="Sustituye el resumen de todos tus clientes activos por este"
              >
                <Users size={13} /> Aplicar a todos
              </button>
            )}
          </div>
          <p className="t-2xs t-tertiary">
            «Mi plantilla» solo afecta a los clientes NUEVOS. «Aplicar a todos» sustituye el
            resumen de los que ya tienes, incluidos los que hubieras ajustado a mano.
          </p>
        </div>
      )}

      <div className="col gap-2">
        <span className="tray-title">Extras</span>
        <div className="rail">
          <button
            type="button"
            className="chip"
            aria-pressed={prefs.showMetricList}
            onClick={onToggleMetricList}
          >
            {prefs.showMetricList ? <Check size={13} /> : <Plus size={13} />} Lista de todas las
            métricas
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Las dos bandejas de piezas ocultas, bajo el panel.
 *
 * `visible` filtra el catálogo por lo que le llevas a este cliente: ofrecer «Kcal
 * objetivo» a quien no tiene nutrición sería un botón que añade una pieza que no
 * se va a pintar, y de las que no se entiende por qué. Por defecto entra todo, que
 * es lo que hacía antes de que las secciones se pudieran quitar.
 */
export const DashboardTrays = ({ prefs, onAddWidget, onAddCard, visible = () => true }) => (
  <>
    <Tray
      title="Cifras que puedes añadir"
      catalogue={WIDGETS.filter((w) => visible(w.id))}
      chosen={prefs.widgets}
      onAdd={onAddWidget}
    />
    <Tray
      title="Gráficos que puedes añadir"
      catalogue={CARDS.filter((c) => visible(c.id))}
      chosen={prefs.cards}
      onAdd={onAddCard}
    />
  </>
);

/** Etiqueta y ancho de una tarjeta, para las herramientas de su hueco. */
export const cardMeta = (prefs, id) => {
  const card = cardById(id);
  return {
    label: card?.label || id,
    span: cardSpan(prefs, id),
    fixed: Boolean(card?.fixed),
  };
};
