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

          {/*
            ══ La fecha se escribe, no se informa ══════════════════════════════

            Era un rótulo gris con la fecha de creación, y de ahí venía «la rutina
            empieza cuando la creo»: quien monta en agosto lo que arranca en
            septiembre no tenía forma de decirlo. Ahora las fechas se heredan de un
            ciclo al siguiente y esta casilla es donde se corrige la primera —o
            cualquiera detrás de unas vacaciones—.

            No es cosmética: la analítica agrupa por esta fecha, así que es lo que
            coloca el tonelaje y la adherencia en su semana.
          */}
          <div className="col gap-1" style={{ alignItems: 'center', minWidth: 150 }}>
            <h3 style={{ fontSize: '1.02rem', fontWeight: 800 }}>
              {unit} {activeWeek}
            </h3>
            {/* El título va FUERA de la etiqueta: un `label` solo admite
                contenido de frase, y un encabezado dentro no es HTML válido. */}
            <label className="col gap-1" style={{ alignItems: 'center' }}>
              <span className="section-label">Empieza el</span>
              {/* Sin `max`, al revés que la fecha de una sesión: ahí se registra
                  algo que ya ocurrió y aquí se planifica algo que aún no. */}
              <input
                type="date"
                className="input input-sm input-center"
                style={{ width: 150 }}
                value={microcycleDate || ''}
                onChange={(e) => onChangeDate(e.target.value)}
                title={`Cuándo empieza ${unit.toLowerCase()} ${activeWeek} para tu cliente.`}
              />
            </label>
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

      {/* `group` + `aria-pressed`, no `tablist`: sin flechas ni `tabpanel` el
          patrón de tabs queda a medias, y los dos estados a la vez confundían
          al lector de pantalla. Mismo contrato que `WeekPicker`. */}
      <div className="rail" role="group" aria-label={`${unit}s del programa`}>
        {weeks.map((week) => (
          <button
            key={week}
            type="button"
            className="chip"
            aria-pressed={week === activeWeek}
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
