import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, MoreVertical, Trash2, Users } from 'lucide-react';

import { unitLabel } from '@/domain/training';
import { shortDate } from '@/lib/dates';
import { useClickOutside } from '@/lib/useClickOutside';
import { useEsTelefono } from '@/lib/useMediaQuery';
import { Panel, WeekPicker } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';

/**
 * Navegación entre semanas/sesiones.
 *
 * Antes había un dropdown flotante (`position: absolute`) superpuesto a un
 * carrusel de chips que hacía lo mismo: con muchas semanas clonadas, el
 * dropdown tapaba el contenido de debajo. Ahora hay un único carril
 * horizontal: sin overlay, sin z-index, sin nada que se recorte.
 */
export const MicrocycleBar = ({
  cycleType,
  weeks,
  activeWeek,
  microcycleDate,
  onChangeDate,
  canGoPrev,
  canGoNext,
  onPrev,
  onNext,
  onSelect,
  onAppend,
  onClone,
  onRemove,
  onToggleCopy,
  copyOpen,
}) => {
  const esTelefono = useEsTelefono();
  /* La hoja de gestión del teléfono: fecha, lista de semanas y acciones. */
  const [gestion, setGestion] = useState(false);
  /* El menú ⋯ del escritorio: lo que no se hace a diario. */
  const [menuAbierto, setMenuAbierto] = useState(false);
  const menuRef = useRef(null);
  useClickOutside(menuRef, () => setMenuAbierto(false), menuAbierto);
  const unit = unitLabel(cycleType);

  /* Sin confirmación: borrar una semana tiene ahora inverso —el aviso con
     «Deshacer» que enseña el editor, con la semana entera y sus sesiones— y lo
     que se puede deshacer no se confirma (la regla, en `ui/ToastProvider`). */
  const askRemove = () => onRemove();

  /*
    ══ En el teléfono, la semana es UNA línea ═════════════════════════════════
    El panel completo —fecha, tres acciones, carril de semanas— son ~340 px de
    gestión que no se toca a diario, delante del día que sí. La línea deja lo
    que se usa siempre (las flechas y saber dónde estás) y el resto vive en su
    hoja: tocar el nombre la abre. Escritorio conserva el panel entero.
  */
  if (esTelefono) {
    return (
      <>
        <Panel tight className="row gap-2">
          <button
            type="button"
            className="btn btn-icon btn-icon-round"
            onClick={onPrev}
            disabled={!canGoPrev}
            aria-label={`${unit} anterior`}
          >
            <ChevronLeft size={17} />
          </button>

          <button type="button" className="week-line" onClick={() => setGestion(true)} aria-haspopup="dialog">
            <strong>
              {unit} {activeWeek}
            </strong>
            <span>
              {microcycleDate ? `empieza el ${shortDate(microcycleDate)}` : 'sin fecha de inicio'}
              {` · ${weeks.length} en total`}
            </span>
          </button>

          <button
            type="button"
            className="btn btn-icon btn-icon-round"
            onClick={onNext}
            disabled={!canGoNext}
            aria-label={`${unit} siguiente`}
          >
            <ChevronRight size={17} />
          </button>
        </Panel>

        {gestion && (
          <Modal title={`${unit} ${activeWeek}`} onClose={() => setGestion(false)}>
            <div className="col gap-5">
              <label className="field">
                <span className="field-label">Empieza el</span>
                <input
                  type="date"
                  className="input"
                  value={microcycleDate || ''}
                  onChange={(e) => onChangeDate(e.target.value)}
                  title={`Cuándo empieza ${unit.toLowerCase()} ${activeWeek} para tu cliente.`}
                />
              </label>

              <div className="col gap-2">
                <span className="section-label">Ir a otra</span>
                <WeekPicker
                  weeks={weeks}
                  value={activeWeek}
                  wrap
                  chipLabel={(week) => `${unit.charAt(0)}${week}`}
                  label={`${unit}s del programa`}
                  onChange={(week) => {
                    onSelect(week);
                    setGestion(false);
                  }}
                  onAdd={() => {
                    onAppend();
                    setGestion(false);
                  }}
                />
              </div>

              <div className="col gap-2">
                <span className="section-label">Acciones</span>
                <div className="row gap-2 wrap">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm btn-pill"
                    onClick={() => {
                      onClone();
                      setGestion(false);
                    }}
                  >
                    <Copy size={15} /> Duplicar {unit.toLowerCase()}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm btn-pill"
                    onClick={() => {
                      onToggleCopy();
                      setGestion(false);
                    }}
                    aria-expanded={copyOpen}
                  >
                    <Copy size={15} /> Traer de otro cliente
                  </button>
                  {/* La hoja se cierra antes de preguntar, como en la ficha de
                      ejercicio: dos diálogos apilados pelean por el foco. */}
                  <button
                    type="button"
                    className="btn btn-danger btn-sm btn-pill"
                    onClick={() => {
                      setGestion(false);
                      askRemove();
                    }}
                  >
                    <Trash2 size={15} /> Eliminar {unit.toLowerCase()}
                  </button>
                </div>
              </div>
            </div>
          </Modal>
        )}
      </>
    );
  }

  return (
    <Panel tight className="col gap-4">
      {/*
        ── La cabecera de la sesión, como cualquier cabecera ──────────────────
        Título y fecha a la izquierda, controles a la derecha. Las flechas
        FLANQUEABAN el título —una a cada lado— y con la fecha debajo el bloque
        central quedaba apretado y descolgado; emparejadas junto a las acciones
        son el mismo par ‹ › de cualquier calendario, y el título respira.
      */}
      <div className="row between wrap gap-3">
        {/*
          ══ La fecha se escribe, no se informa ══════════════════════════════

          Era un rótulo gris con la fecha de creación, y de ahí venía «la rutina
          empieza cuando la creo»: quien monta en agosto lo que arranca en
          septiembre no tenía forma de decirlo. Ahora las fechas se heredan de un
          ciclo al siguiente y esta casilla es donde se corrige la primera —o
          cualquiera detrás de unas vacaciones—.

          No es cosmética: la analítica agrupa por esta fecha, así que es lo que
          coloca el tonelaje y la adherencia en su semana. Va como subtítulo, en
          voz baja y sin caja hasta que se toca: es un dato que se corrige de
          vez en cuando, no un formulario permanente.
        */}
        <div className="col gap-1">
          <h3 style={{ fontSize: '1.02rem', fontWeight: 800 }}>
            {unit} {activeWeek}
          </h3>
          {/* El título va FUERA de la etiqueta: un `label` solo admite
              contenido de frase, y un encabezado dentro no es HTML válido. */}
          <label className="row gap-2 mcb-fecha">
            <span className="t-xs t-tertiary" style={{ fontWeight: 600 }}>Empieza el</span>
            {/* Sin `max`, al revés que la fecha de una sesión: ahí se registra
                algo que ya ocurrió y aquí se planifica algo que aún no. */}
            <input
              type="date"
              className="input input-sm"
              style={{ width: 140 }}
              value={microcycleDate || ''}
              onChange={(e) => onChangeDate(e.target.value)}
              title={`Cuándo empieza ${unit.toLowerCase()} ${activeWeek} para tu cliente.`}
            />
          </label>
        </div>

        {/*
          ══ Una acción visible, el resto en su menú ══════════════════════════
          Duplicar es lo que se hace cada semana y se queda a la vista. Traer de
          otro cliente y eliminar son ocasionales — y un botón ROJO residente a
          la altura de los ojos es un aviso que no avisa: el rojo solo debe
          aparecer cuando ya has abierto el menú con intención. Además, eliminar
          tiene «Deshacer»: no necesita gritar.
        */}
        <div className="row gap-2 wrap">
          <div className="row gap-1">
            <button
              type="button"
              className="btn btn-icon btn-icon-round"
              onClick={onPrev}
              disabled={!canGoPrev}
              aria-label={`${unit} anterior`}
            >
              <ChevronLeft size={17} />
            </button>
            <button
              type="button"
              className="btn btn-icon btn-icon-round"
              onClick={onNext}
              disabled={!canGoNext}
              aria-label={`${unit} siguiente`}
            >
              <ChevronRight size={17} />
            </button>
          </div>

          <button type="button" className="btn btn-secondary btn-sm btn-pill" onClick={onClone}>
            <Copy size={15} /> Duplicar {unit.toLowerCase()}
          </button>

          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              type="button"
              className="btn btn-icon"
              onClick={() => setMenuAbierto((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuAbierto}
              aria-label={`Más acciones de ${unit.toLowerCase()} ${activeWeek}`}
            >
              <MoreVertical size={17} />
            </button>

            {menuAbierto && (
              <div className="popover popover-right" style={{ top: '120%' }} role="menu">
                {/*
                  ══ Decía «Copiar A otro cliente» y hace lo contrario ═════════
                  Lo que abre trae el entrenamiento —y la dieta, y el
                  calentamiento— DEL cliente que elijas AL que tienes abierto,
                  sustituyendo lo suyo. «Traer» es además el gesto real: se usa
                  al montar a alguien nuevo copiando a otro que ya funciona.
                  DUPLICAR es dentro de lo mismo, TRAER DE viene de fuera hacia
                  aquí, ENVIAR A va de aquí hacia fuera.
                */}
                <button
                  type="button"
                  role="menuitem"
                  className="menu-item"
                  onClick={() => {
                    onToggleCopy();
                    setMenuAbierto(false);
                  }}
                >
                  <Users size={15} /> Traer de otro cliente
                </button>
                <hr className="divider" />
                {/* Faltaba por completo: una semana creada por error no se podía
                    eliminar de ninguna forma. */}
                <button
                  type="button"
                  role="menuitem"
                  className="menu-item menu-item-danger"
                  onClick={() => {
                    setMenuAbierto(false);
                    askRemove();
                  }}
                >
                  <Trash2 size={15} /> Eliminar {unit.toLowerCase()}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* EL carril compartido. Aquí compacto (`S4`) porque convive con diez
          semanas y tres botones en la misma barra. */}
      <WeekPicker
        weeks={weeks}
        value={activeWeek}
        onChange={onSelect}
        chipLabel={(week) => `${unit.charAt(0)}${week}`}
        label={`${unit}s del programa`}
        onAdd={onAppend}
      />
    </Panel>
  );
};
