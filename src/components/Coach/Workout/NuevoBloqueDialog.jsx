import { useState } from 'react';

import { blocksOf, lastWeekNumber } from '@/domain/blocks';
import { unitLabel } from '@/domain/training';
import { Modal } from '@/components/ui/Modal';

/**
 * Abrir un bloque nuevo: se pregunta, porque es un cambio de rutina.
 *
 * Cerrar un bloque no borra nada —sus semanas quedan enteras y se siguen
 * viendo—, pero a partir de aquí el cliente entrena OTRA cosa, y eso aparece
 * como un cambio en sus revisiones. No es un clic más en un menú: se le pone
 * nombre, se decide si la primera semana hereda los días o empieza en blanco,
 * y se confirma sabiendo dónde acaba el bloque de antes.
 */
export const NuevoBloqueDialog = ({ open, onClose, program, cliente, onAbrir }) => {
  const bloques = blocksOf(program);
  const actual = bloques[bloques.length - 1];
  const ultima = lastWeekNumber(program?.microcycles);
  const unidad = unitLabel(cliente?.cycleType || 'weekly');
  const dias = (program?.microcycles || []).find((m) => m.weekNumber === ultima)?.days?.map((d) => d.dayName) || [];
  const [nombre, setNombre] = useState(`Bloque ${bloques.length + 1}`);
  const [misma, setMisma] = useState(true);

  const abrir = (e) => {
    e.preventDefault();
    onAbrir({ name: nombre.trim() || null, keepStructure: misma });
    onClose();
  };

  return (
    <Modal open={open} title="Nuevo bloque" onClose={onClose}>
      <form className="nuevo-bloque" onSubmit={abrir}>
        <p className="t-sm t-secondary">
          «{actual.name}» se cierra en {unidad.toLowerCase()} {ultima} y se queda como está: sus semanas siguen ahí para leerlas y compararlas. Lo que cambies a partir de ahora ya es del bloque nuevo, y en sus revisiones se verá como un cambio.
        </p>
        <label className="field">
          <span className="label">Nombre</span>
          <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
        </label>
        <fieldset className="nuevo-bloque-opciones">
          <legend className="label">Primera {unidad.toLowerCase()}</legend>
          <label className={`nuevo-bloque-opcion${misma ? ' is-on' : ''}`}>
            <input type="radio" name="estructura" checked={misma} onChange={() => setMisma(true)} />
            <span>
              <strong>Con los mismos días</strong>
              <small>{dias.length > 0 ? dias.join(' · ') : 'Los del bloque actual'}, sin ejercicios: se rellenan de nuevo.</small>
            </span>
          </label>
          <label className={`nuevo-bloque-opcion${!misma ? ' is-on' : ''}`}>
            <input type="radio" name="estructura" checked={!misma} onChange={() => setMisma(false)} />
            <span>
              <strong>Desde cero</strong>
              <small>Un solo día en blanco, para montar otra estructura.</small>
            </span>
          </label>
        </fieldset>
        <div className="row gap-2" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-quiet btn-sm" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary btn-sm">Cerrar «{actual.name}» y abrir el nuevo</button>
        </div>
      </form>
    </Modal>
  );
};
