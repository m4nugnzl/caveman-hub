import { useState } from 'react';
import { Camera, Dumbbell } from 'lucide-react';

import { useActions, useData } from '@/context/AppContext';
import { muscleColor } from '@/domain/training';
import { byMuscle, groupOptions, unsortedCount } from '@/domain/equipment';
import { Notice, Panel } from '@/components/ui/primitives';
import { GymPicker } from '@/components/equipment/GymPicker';
import { Thumb } from '@/components/photos/Thumb';

/**
 * Las fotos de su gimnasio, subidas POR ÉL.
 *
 * ══ Por qué esto no puede ser cosa del entrenador ══════════════════════════
 *
 * Porque quien está en el gimnasio es el cliente. El flujo real hasta ahora era:
 * el entrenador le pide fotos, el cliente manda cuarenta por WhatsApp, y el
 * entrenador las descarga una a una y las sube a una carpeta de Drive. Eso son
 * dos personas haciendo el trabajo de cero, y es exactamente lo que sobra.
 *
 * La política de la 0079 le deja INSERTAR y no borrar ni cambiar: puede añadir
 * lo que ve, y no puede quitar de un plumazo la referencia con la que le montaron
 * la rutina.
 *
 * ══ Y ordenarlas también es cosa suya ══════════════════════════════════════
 *
 * Es él quien está delante de la máquina y sabe si esa polea es de dorsal o de
 * tríceps. Dejar cuarenta fotos sin clasificar para que las coloque el entrenador
 * le devuelve el trabajo que esto venía a quitarle.
 *
 * Pero NO es un requisito para subir. Se elige el grupo de la tanda antes —o se
 * deja en la bandeja— y se ordena después, foto a foto, viendo la imagen.
 * Obligarle a clasificar para poder mandar convertiría dos minutos de fotos en un
 * formulario de veinte, y el resultado sería que no manda ninguna.
 *
 * Lo que sigue sin poder es BORRAR: eso se lo cierra la 0079 y ahí no ha
 * cambiado nada — quitar de un plumazo la referencia con la que le montaron la
 * rutina no aporta nada.
 */
export const ClientGymUpload = ({ client }) => {
  const { equipment } = useData();
  const { addEquipment, setEquipmentGroup } = useActions();
  const [fallo, setFallo] = useState(null);

  const tandas = byMuscle(equipment);
  const pendientes = unsortedCount(equipment);

  return (
    <Panel
      title="El gimnasio donde entrenas"
      sub="Fotos de las máquinas que tienes. Con ellas te montan la rutina con lo que de verdad hay."
      className="col gap-3"
    >
      {fallo && <Notice tone="error">{fallo}</Notice>}

      <div className="card-inset col gap-2">
        <span className="row gap-2 t-sm">
          <Camera size={15} /> Haz una foto a cada máquina y súbelas todas de golpe.
        </span>
        <span className="t-xs t-tertiary">
          Con el móvil puedes seleccionarlas todas a la vez. No hace falta que sepas de qué es
          cada una: déjalas en «Sin clasificar» y tu entrenador las coloca.
        </span>
      </div>

      {/*
        El mismo lote que usan las fotos de una revisión: se eligen, se ven, se
        dice qué es cada una y se suben en serie. Ver `GymPicker`.
      */}
      <GymPicker
        clientId={client.id}
        onUpload={({ clientId, file, muscleGroup }) => addEquipment(clientId, { file, muscleGroup })}
      />

      {equipment.length > 0 && (
        <p className="t-xs t-tertiary">
          {equipment.length === 1 ? '1 foto subida' : `${equipment.length} fotos subidas`}
          {pendientes > 0 && ` · ${pendientes} por clasificar`}
        </p>
      )}

      {tandas.length === 0 ? (
        <p className="t-xs t-tertiary row gap-2">
          <Dumbbell size={14} /> Todavía no has subido ninguna.
        </p>
      ) : (
        <div className="col gap-4">
          {tandas.map((tanda) => (
            <div key={tanda.group} className="col gap-2">
              <span className="section-label" style={{ color: muscleColor(tanda.group) }}>
                {tanda.group} · {tanda.items.length}
              </span>
              <div className="gym-grid">
                {tanda.items.map((pieza) => (
                  <figure key={pieza.id} className="gym-shot">
                    {pieza.url && (
                      <Thumb url={pieza.url} alt={pieza.name || tanda.group} width={320} />
                    )}
                    {/*
                      Puede reclasificar, y no puede borrar. La primera pasa por
                      `set_equipment_group` (0080), que escribe una sola columna;
                      la segunda no existe para él y por eso no hay papelera —
                      enseñar un botón que va a fallar es peor que no tenerlo.
                    */}
                    <select
                      className="select select-xs"
                      aria-label="De qué es esta máquina"
                      value={pieza.muscleGroup}
                      onChange={async (e) => {
                        const res = await setEquipmentGroup(pieza.id, e.target.value);
                        setFallo(res.ok ? null : res.error);
                      }}
                    >
                      {groupOptions().map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </figure>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
};
