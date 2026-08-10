import {
  ArrowLeft,
  ArrowRight,
  Check,
  Columns2,
  Plus,
  RectangleHorizontal,
  RotateCcw,
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
export const DashboardEditBar = ({ prefs, onApplyPreset, onToggleMetricList, onReset, onDone, audience }) => {
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

/** Las dos bandejas de piezas ocultas, bajo el panel. */
export const DashboardTrays = ({ prefs, onAddWidget, onAddCard }) => (
  <>
    <Tray title="Cifras que puedes añadir" catalogue={WIDGETS} chosen={prefs.widgets} onAdd={onAddWidget} />
    <Tray title="Gráficos que puedes añadir" catalogue={CARDS} chosen={prefs.cards} onAdd={onAddCard} />
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
