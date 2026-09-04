import { useState } from 'react';
import { Trash2, X } from 'lucide-react';

import { useActions, useData } from '@/context/AppContext';
import { muscleColor } from '@/domain/training';
import {
  byMuscle,
  equipmentHeadline,
  groupOptions,
  unsortedCount,
} from '@/domain/equipment';
import { COACH_FIELDS, cleanProfile, fieldText } from '@/domain/profile';
import { Field, Notice, Panel } from '@/components/ui/primitives';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { Gallery } from '@/components/photos/Gallery';
import { Thumb } from '@/components/photos/Thumb';
import { GymPicker } from './GymPicker';

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

  const [fallo, setFallo] = useState(null);
  /* El enlace a la carpeta de fuera: se edita aquí y no en «Cómo entrena»,
     porque no es un dato de la persona sino una decisión tuya sobre dónde viven
     sus fotos. Ver `COACH_FIELDS` en `domain/profile.js`. */
  const [editandoCarpeta, setEditandoCarpeta] = useState(false);
  /* La zona de soltar, pedida a mano cuando el bloque ya tiene fotos. */
  const [subiendo, setSubiendo] = useState(false);
  const [enlace, setEnlace] = useState('');

  const carpeta = fieldText(client.profile, 'gymFolder');
  const tandas = byMuscle(equipment);
  const pendientes = unsortedCount(equipment);

  /*
    ══ El álbum, aplanado en el MISMO orden en que se ve ══════════════════════

    El visor recorre todas las fotos del gimnasio de corrido —de «Pecho» a
    «Espalda» sin cerrar— como el carrete de un teléfono. Y el orden tiene que
    ser exactamente el de la rejilla: si «la siguiente» no es la que está al
    lado, pasar fotos deja de tener sentido.

    Solo las que tienen enlace firmado: una foto sin URL no se puede enseñar
    grande, y meterla en el álbum sería un hueco negro a mitad del recorrido.
  */
  const album = tandas.flatMap((tanda) =>
    tanda.items
      .filter((pieza) => pieza.url)
      .map((pieza) => ({
        id: pieza.id,
        url: pieza.url,
        caption: pieza.name ? `${tanda.group} · ${pieza.name}` : tanda.group,
      }))
  );
  const [abierta, setAbierta] = useState(null); // índice dentro de `album`

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

  const vacio = tandas.length === 0;

  return (
    <Panel
      desnudo
      rango="bloque"
      title="Su maquinaria"
      sub={vacio ? 'Las máquinas que tiene delante. Es lo que decide qué le puedes prescribir.' : undefined}
      action={
        !editandoCarpeta && (
          /*
            Tres verbos en columna bajo el rótulo, no tres iconos en fila contra
            el canto derecho: un «+», una flecha y un eslabón sueltos a mil
            píxeles del título no dicen de qué bloque son ni qué hacen, y había
            que pasar el ratón por encima para averiguarlo.

            ── Con fotos, la zona de soltar se PIDE ───────────────────────────
            Estaba siempre: un blanco del ancho de la pantalla, con su icono y
            sus tres frases, encima de las veintitrés fotos que ya están
            subidas. Con el bloque lleno lo que se viene a hacer es MIRARLO —se
            programa con estas fotos delante—, no a subir la veinticuatro.
          */
          <div className="bloque-verbos">
            {!vacio && (
              <button
                type="button"
                className="cab-accion is-puerta"
                onClick={() => setSubiendo((v) => !v)}
              >
                {subiendo ? 'Cerrar' : 'Añadir fotos'}
              </button>
            )}
            {carpeta && (
              <a
                className="cab-accion is-puerta"
                href={carpeta}
                target="_blank"
                rel="noreferrer noopener"
              >
                Abrir carpeta
              </a>
            )}
            <button
              type="button"
              className="cab-accion is-puerta"
              onClick={() => {
                setEnlace(carpeta || '');
                setEditandoCarpeta(true);
              }}
            >
              {carpeta ? 'Cambiar carpeta' : 'Enlazar carpeta'}
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

      {/*
        El lote, con el mismo aparato que las fotos de una revisión: se eligen
        todas, se ven antes de mandarlas, se dice qué es cada una y se suben en
        serie sabiendo cuál falló. Ver `GymPicker`.

        Sin fotos está abierto —el vacío INVITA, y aquí la invitación es la zona
        de soltar—; con fotos lo abre el «+» de la cabecera.
      */}
      {(vacio || subiendo) && (
        <GymPicker
          clientId={client.id}
          onUpload={({ clientId, file, muscleGroup }) =>
            addEquipment(clientId, { file, muscleGroup })
          }
        />
      )}

      {/*
        ══ El vacío se dice UNA vez ══════════════════════════════════════════

        Aquí había una segunda caja —«Todavía no hay fotos de su gimnasio», y
        debajo la invitación a pedírselas— pegada justo bajo la zona de soltar,
        que ya dice «Trae las fotos del gimnasio · suéltalas aquí · una a cada
        máquina». Dos invitaciones al mismo gesto, a diez píxeles, y la segunda
        sin ningún botón: la ficha de alguien recién dado de alta llevaba dos
        vacíos seguidos donde bastaba con el que se puede pulsar.

        La única frase que aportaba algo —para qué sirven estas fotos— es
        exactamente lo que hace el subtítulo del bloque, y ahí ya estaba dicha.
      */}
      {!vacio && (
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
                      /* Se pulsa y se abre grande, como en la galería del móvil.
                         Es un botón y no una imagen con `onClick`: así se llega
                         con el tabulador y se abre con Intro, y un lector de
                         pantalla lo anuncia como lo que es. */
                      <button
                        type="button"
                        className="gym-shot-open"
                        aria-label={`Ver ${pieza.name || tanda.group} en grande`}
                        onClick={() => setAbierta(album.findIndex((f) => f.id === pieza.id))}
                      >
                        <Thumb url={pieza.url} alt={pieza.name || tanda.group} width={320} />
                      </button>
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

      {!vacio && (
        <p className="t-xs t-tertiary">
          {equipmentHeadline(equipment)}. Las ves al montar su rutina sin salir de la pantalla.
        </p>
      )}

      {/* Y a pantalla completa, recorriendo el gimnasio entero. Ver `Gallery`. */}
      {abierta !== null && album[abierta] && (
        <Gallery
          items={album}
          index={abierta}
          onIndex={setAbierta}
          onClose={() => setAbierta(null)}
        />
      )}
    </Panel>
  );
};
