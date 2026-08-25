import { useRef, useState } from 'react';
import { Dumbbell, ExternalLink, Link2, Loader2, Trash2, Upload, X } from 'lucide-react';

import { useActions, useData } from '@/context/AppContext';
import { muscleColor } from '@/domain/training';
import {
  UNSORTED,
  byMuscle,
  equipmentHeadline,
  groupOptions,
  unsortedCount,
} from '@/domain/equipment';
import { COACH_FIELDS, cleanProfile, fieldText } from '@/domain/profile';
import { Field, Notice, Panel } from '@/components/ui/primitives';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { Thumb } from '@/components/photos/Thumb';

/**
 * Su maquinaria: las fotos del gimnasio donde entrena.
 *
 * ══ De dónde sale esta pantalla ════════════════════════════════════════════
 *
 * De cómo se trabaja de verdad: el entrenador le pide fotos de las máquinas, las
 * sube a una carpeta de Drive y **monta la rutina mirando esas fotos en otra
 * pestaña**. Antes esto era un campo de texto —«Dónde entrena: Fitness Park»— y
 * esa línea no contesta la pregunta que se hace programando: «¿la prensa es de
 * placas o de discos?, ¿el remo lleva pecho apoyado?». Eso solo lo dice la foto.
 *
 * ══ Las carpetas son los grupos musculares, y no un árbol nuevo ════════════
 *
 * `MUSCLE_GROUPS` ya es el vocabulario del entrenamiento entero. Con él, el día
 * que se programa pecho se puede enseñar lo que tiene PARA PECHO — que es lo
 * único que separa esto de un álbum.
 *
 * ══ Y la carpeta de fuera sigue valiendo ═══════════════════════════════════
 *
 * Quien ya tiene sus fotos en Drive no tiene por qué moverlas. El enlace se
 * guarda con el resto de datos del gimnasio y se abre desde aquí y desde su
 * rutina, que es donde hacía falta tenerlo a mano. La aplicación ofrece traerlo
 * dentro; no lo exige.
 */
const CARPETA = COACH_FIELDS.find((f) => f.id === 'gymFolder');

export const EquipmentPanel = ({ client, onSaveProfile }) => {
  const { equipment } = useData();
  const { addEquipment, setEquipmentGroup, removeEquipment } = useActions();
  const confirm = useConfirm();
  const input = useRef(null);

  /*
    Se sube a la BANDEJA por defecto, no a un músculo.

    Subir y clasificar son dos gestos y pasan en momentos distintos: quien está
    en el gimnasio hace cuarenta fotos seguidas, y decidir de qué músculo es cada
    máquina mientras las hace convierte una tanda de dos minutos en un formulario
    de veinte. Quien SÍ lo sabe puede elegir el grupo aquí y saltarse el paso.
  */
  const [grupo, setGrupo] = useState(UNSORTED);
  const [subiendo, setSubiendo] = useState(false);
  const [fallo, setFallo] = useState(null);
  /* El enlace a la carpeta de fuera: se edita aquí y no en «Cómo entrena»,
     porque no es un dato de la persona sino una decisión tuya sobre dónde viven
     sus fotos. Ver `COACH_FIELDS` en `domain/profile.js`. */
  const [editandoCarpeta, setEditandoCarpeta] = useState(false);
  const [enlace, setEnlace] = useState('');

  const carpeta = fieldText(client.profile, 'gymFolder');
  const tandas = byMuscle(equipment);
  const pendientes = unsortedCount(equipment);

  /*
    Varias fotos de golpe, y de UNA en una hacia el servidor.

    Un gimnasio son cuarenta máquinas y nadie las sube de cuarenta en cuarenta
    clics. En paralelo sería más rápido y también la forma de chocar contra la
    cuota con media subida hecha y sin saber cuál falló; en serie, el primer
    fallo corta y dice cuántas entraron.
  */
  const subir = async (archivos) => {
    const lista = Array.from(archivos || []);
    if (lista.length === 0) return;

    setSubiendo(true);
    setFallo(null);

    let hechas = 0;
    for (const archivo of lista) {
      const res = await addEquipment(client.id, { file: archivo, muscleGroup: grupo });
      if (!res.ok) {
        setFallo(
          hechas > 0
            ? `${res.error} (se subieron ${hechas} de ${lista.length})`
            : res.error
        );
        break;
      }
      hechas += 1;
    }

    setSubiendo(false);
    if (input.current) input.current.value = '';
  };

  const mover = async (pieza, destino) => {
    const res = await setEquipmentGroup(pieza.id, destino);
    setFallo(res.ok ? null : res.error);
  };

  const borrar = async (pieza) => {
    const ok = await confirm({
      title: '¿Borrar esta foto?',
      message: 'Se quita de su ficha y del almacenamiento. No hay deshacer.',
      confirmLabel: 'Borrar',
      tone: 'danger',
    });
    if (!ok) return;
    const res = await removeEquipment(pieza);
    setFallo(res.ok ? null : res.error);
  };

  return (
    <Panel
      title="Su maquinaria"
      sub="Las máquinas que tiene delante. Es lo que decide qué le puedes prescribir."
      className="col gap-3"
      action={
        !editandoCarpeta && (
          <div className="row gap-2">
            {carpeta && (
              <a
                className="btn btn-secondary btn-sm"
                href={carpeta}
                target="_blank"
                rel="noreferrer noopener"
              >
                <ExternalLink size={13} /> Abrir carpeta
              </a>
            )}
            <button
              type="button"
              className="btn btn-plain btn-sm"
              onClick={() => {
                setEnlace(carpeta || '');
                setEditandoCarpeta(true);
              }}
            >
              <Link2 size={13} /> {carpeta ? 'Cambiar' : 'Enlazar carpeta'}
            </button>
          </div>
        )
      }
    >
      {fallo && <Notice tone="error">{fallo}</Notice>}

      {editandoCarpeta && (
        <form
          className="card-inset row-end wrap gap-3 swap-in"
          onSubmit={(e) => {
            e.preventDefault();
            /* Se manda el perfil ENTERO porque la columna es una y el entrenador
               escribe por UPDATE directo: solo así vaciar el campo lo borra de
               verdad. La mezcla es del cliente (ver la 0080). */
            onSaveProfile(cleanProfile({ ...(client.profile || {}), gymFolder: enlace.trim() }));
            setEditandoCarpeta(false);
          }}
        >
          <Field label={CARPETA.label} hint={CARPETA.hint} className="grow">
            {(props) => (
              <input
                {...props}
                autoFocus
                type="url"
                className="input"
                placeholder={CARPETA.placeholder}
                value={enlace}
                onChange={(e) => setEnlace(e.target.value)}
              />
            )}
          </Field>
          <button type="submit" className="btn btn-primary btn-sm">
            Guardar
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setEditandoCarpeta(false)}
          >
            <X size={13} /> Cancelar
          </button>
        </form>
      )}

      {pendientes > 0 && (
        /* La bandeja es una TAREA, así que se dice cuántas quedan. Sin esto, unas
           fotos sin grupo son solo un titular más de la lista y se quedan ahí. */
        <Notice tone="info">
          {pendientes === 1
            ? 'Queda 1 foto sin ordenar. Dile de qué es debajo de la imagen.'
            : `Quedan ${pendientes} fotos sin ordenar. Diles de qué son debajo de cada imagen.`}
        </Notice>
      )}

      <div className="row-end wrap gap-3">
        <Field
          label="Van a"
          hint="Puedes subirlas todas y ordenarlas después."
          className="grow"
        >
          {(props) => (
            <select
              {...props}
              className="select"
              value={grupo}
              onChange={(e) => setGrupo(e.target.value)}
            >
              {groupOptions().map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          )}
        </Field>

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={subiendo}
          onClick={() => input.current?.click()}
        >
          {subiendo ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
          {subiendo ? 'Subiendo…' : 'Subir fotos'}
        </button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => subir(e.target.files)}
        />
      </div>

      {tandas.length === 0 ? (
        <div className="card-inset col gap-2">
          <span className="row gap-2 t-sm t-secondary">
            <Dumbbell size={15} /> Todavía no hay fotos de su gimnasio.
          </span>
          <span className="t-xs t-tertiary">
            Pídeselas y súbelas de golpe: puedes decir después de qué es cada una. Las tendrás
            delante al montarle la rutina, en vez de en otra pestaña.
            {carpeta && ' Tu carpeta de fuera sigue enlazada arriba.'}
          </span>
        </div>
      ) : (
        <div className="col gap-4">
          {tandas.map((tanda) => (
            <div key={tanda.group} className="col gap-2">
              {/* El color del grupo muscular es el MISMO que en el volumen
                  semanal y en la analítica: sale de `domain/training.js` y no se
                  elige aquí. Es un dato, así que puede llevar color. */}
              <span className="section-label" style={{ color: muscleColor(tanda.group) }}>
                {tanda.group} · {tanda.items.length}
              </span>
              <div className="gym-grid">
                {tanda.items.map((pieza) => (
                  <figure key={pieza.id} className="gym-shot">
                    {pieza.url ? (
                      <Thumb url={pieza.url} alt={pieza.name || tanda.group} width={320} />
                    ) : (
                      /* Firmar puede fallar sin que la pieza deje de existir. Se
                         dice, en vez de enseñar un cuadro roto. */
                      <span className="gym-shot-missing t-2xs t-tertiary">No se pudo cargar</span>
                    )}

                    {/*
                      Clasificar DESPUÉS, debajo de la foto que se está mirando.

                      Es el gesto para el que existe la bandeja: se sube la tanda
                      entera de una vez y luego se recorre diciendo qué es cada
                      cosa. Un selector por foto y no una pantalla aparte de
                      «ordenar», porque la decisión se toma viendo la imagen — y
                      mover una que ya está colocada es el mismo control.
                    */}
                    <select
                      className="select select-xs"
                      aria-label={`Grupo muscular de ${pieza.name || 'esta máquina'}`}
                      value={pieza.muscleGroup}
                      onChange={(e) => mover(pieza, e.target.value)}
                    >
                      {groupOptions().map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>

                    {pieza.name && <figcaption className="t-2xs t-tertiary">{pieza.name}</figcaption>}
                    <button
                      type="button"
                      className="gym-shot-del"
                      aria-label={`Borrar ${pieza.name || 'la foto'}`}
                      onClick={() => borrar(pieza)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </figure>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tandas.length > 0 && (
        <p className="t-xs t-tertiary">
          {equipmentHeadline(equipment)}. Las ves al montar su rutina sin salir de la pantalla.
        </p>
      )}
    </Panel>
  );
};
