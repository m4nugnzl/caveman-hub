import { useState } from 'react';

import { blocksOf, lastWeekNumber } from '@/domain/blocks';
import { unitIsFeminine, unitLabel } from '@/domain/training';
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
  /* De dónde salen los días de la primera sesión: de los de ahora, de nada, o
     de una hoja de cálculo. */
  const [desde, setDesde] = useState('misma');

  const abrir = (e) => {
    e.preventDefault();
    onAbrir({
      name: nombre.trim() || null,
      keepStructure: desde === 'misma',
      desdeFichero: desde === 'fichero',
    });
    onClose();
  };

  return (
    <Modal open={open} title="Nuevo bloque" onClose={onClose}>
      <form className="nuevo-bloque" onSubmit={abrir}>
        <p className="t-sm t-secondary">
          «{actual.name}» se cierra en {unidad.toLowerCase()} {ultima} y se queda como está: lo que lleva dentro sigue ahí para leerlo y compararlo. Lo que cambies a partir de ahora ya es del bloque nuevo, y en sus revisiones se verá como un cambio.
        </p>
        <label className="field">
          <span className="label">Nombre</span>
          <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
        </label>
        {/*
          ── Y la tercera: que la traiga la hoja ──────────────────────────────
          Un bloque nuevo es un cambio de rutina, y muchos cambios de rutina ya
          están escritos en un Excel antes de entrar aquí —el mismo con el que
          se trabajaba antes de la aplicación—. Sin esta opción había que abrir
          el bloque, borrar el día en blanco y buscar «Traer de un fichero» en
          el menú de la hoja: tres pasos para el gesto más normal del mundo.
          Abre el mismo importador que el resto de la casa y se llama igual.
        */}
        <fieldset className="nuevo-bloque-opciones">
          <legend className="label">
            {unitIsFeminine(cliente?.cycleType) ? 'Primera' : 'Primer'} {unidad.toLowerCase()}
          </legend>
          <label className={`nuevo-bloque-opcion${desde === 'misma' ? ' is-on' : ''}`}>
            <input type="radio" name="estructura" checked={desde === 'misma'} onChange={() => setDesde('misma')} />
            <span>
              <strong>Con los mismos días</strong>
              <small>{dias.length > 0 ? dias.join(' · ') : 'Los del bloque actual'}, sin ejercicios: se rellenan de nuevo.</small>
            </span>
          </label>
          <label className={`nuevo-bloque-opcion${desde === 'fichero' ? ' is-on' : ''}`}>
            <input type="radio" name="estructura" checked={desde === 'fichero'} onChange={() => setDesde('fichero')} />
            <span>
              <strong>Traer de un fichero</strong>
              <small>Subes tu Excel y los días del bloque salen de él. También lee Word, PDF y CSV.</small>
            </span>
          </label>
          <label className={`nuevo-bloque-opcion${desde === 'cero' ? ' is-on' : ''}`}>
            <input type="radio" name="estructura" checked={desde === 'cero'} onChange={() => setDesde('cero')} />
            <span>
              <strong>Desde cero</strong>
              <small>Un solo día en blanco, para montar otra estructura.</small>
            </span>
          </label>
        </fieldset>
        <div className="row gap-2" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary btn-sm">Cerrar «{actual.name}» y abrir el nuevo</button>
        </div>
      </form>
    </Modal>
  );
};
