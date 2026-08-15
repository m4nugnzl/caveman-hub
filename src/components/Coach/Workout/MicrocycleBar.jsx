import { ChevronLeft, ChevronRight, Copy, Plus, Trash2 } from 'lucide-react';

import { unitLabel } from '@/domain/training';
import { Panel } from '@/components/ui/primitives';
import { useConfirm } from '@/components/ui/ConfirmProvider';

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
  exerciseCount,
}) => {
  const confirm = useConfirm();
  const unit = unitLabel(cycleType);

  const askRemove = async () => {
    const ok = await confirm({
      title: `¿Eliminar ${unit.toLowerCase()} ${activeWeek}?`,
      message:
        exerciseCount > 0
          ? `Se borrarán sus ${exerciseCount} ejercicios con todas sus series registradas.`
          : `Se eliminará esta ${unit.toLowerCase()}, que está vacía.`,
      detail:
        weeks.length > 1
          ? `Las ${unitLabel(cycleType).toLowerCase()}s restantes se renumeran para que la secuencia siga siendo continua.`
          : 'Es la única que existe: el cliente se quedará sin programa.',
      confirmLabel: `Eliminar ${unit.toLowerCase()}`,
      tone: 'danger',
    });
    if (ok) onRemove();
  };

  return (
    <Panel tight className="col gap-4">
      <div className="row between wrap gap-3">
        <div className="row gap-2">
          <button
            type="button"
            className="btn btn-icon btn-icon-round"
            onClick={onPrev}
            disabled={!canGoPrev}
            aria-label={`${unit} anterior`}
          >
            <ChevronLeft size={17} />
          </button>

          <div style={{ textAlign: 'center', minWidth: 96 }}>
            <h3 style={{ fontSize: '1.02rem', fontWeight: 800 }}>
              {unit} {activeWeek}
            </h3>
            <span className="t-xs t-secondary" style={{ fontWeight: 600 }}>
              {microcycleDate || 'Fecha por definir'}
            </span>
          </div>

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

        <div className="row gap-2 wrap">
          <button type="button" className="btn btn-secondary btn-sm btn-pill" onClick={onClone}>
            <Copy size={15} /> Duplicar {unit.toLowerCase()}
          </button>
          {/*
            ══ Decía «Copiar A otro cliente» y hace lo contrario ═══════════════

            Lo que abre este botón trae el entrenamiento —y la dieta, y el
            calentamiento— DEL cliente que elijas AL que tienes abierto,
            sustituyendo lo suyo. El nombre prometía justo lo contrario en una
            acción destructiva y sin deshacer: quien estuviera en Marta queriendo
            pasarle su rutina a Luis, le borraba la rutina a Marta.

            Y «traer» es además el gesto real: se usa al montar a alguien nuevo
            copiando a otro que ya funciona, no al revés.

            El verbo importa en toda la aplicación: DUPLICAR es dentro de lo
            mismo, TRAER DE viene de fuera hacia aquí, ENVIAR A va de aquí hacia
            fuera. Con tres botones que ponían «copiar» no había forma de saber la
            dirección sin abrirlos.
          */}
          <button
            type="button"
            className="btn btn-secondary btn-sm btn-pill"
            onClick={onToggleCopy}
            aria-expanded={copyOpen}
          >
            <Copy size={15} /> Traer de otro cliente
          </button>
          {/* Faltaba por completo: una semana creada por error no se podía
              eliminar de ninguna forma. */}
          <button
            type="button"
            className="btn btn-danger btn-sm btn-pill"
            onClick={askRemove}
            title={`Eliminar ${unit.toLowerCase()} ${activeWeek}`}
          >
            <Trash2 size={15} /> Eliminar {unit.toLowerCase()}
          </button>
        </div>
      </div>

      <div className="rail" role="tablist" aria-label={`${unit}s del programa`}>
        {weeks.map((week) => (
          <button
            key={week}
            type="button"
            role="tab"
            className="chip"
            aria-pressed={week === activeWeek}
            aria-selected={week === activeWeek}
            onClick={() => onSelect(week)}
          >
            {unit.charAt(0)}
            {week}
          </button>
        ))}
        <button type="button" className="chip chip-dashed" onClick={onAppend}>
          <Plus size={13} /> Nueva
        </button>
      </div>
    </Panel>
  );
};
