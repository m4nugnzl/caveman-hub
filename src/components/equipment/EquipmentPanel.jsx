import { useState } from 'react';
import { X } from 'lucide-react';

import { useActions, useData } from '@/context/AppContext';
import { UNSORTED, byMuscle, equipmentFileName, unsortedCount } from '@/domain/equipment';
import { COACH_FIELDS, cleanProfile, fieldText } from '@/domain/profile';
import { Field, Notice, Panel } from '@/components/ui/primitives';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { descargarFoto } from '@/lib/descargas';
import { Gallery } from '@/components/photos/Gallery';
import { GymPicker } from './GymPicker';
import { IndiceDeGimnasio, MesaDeMaquinas, aplanar } from './Maquinaria';

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
 * Y eso es lo que se mira: **un grupo cada vez**, elegido en el índice que
 * cuelga del rótulo. Los quince apilados, cada uno con su rejilla a medio
 * llenar y un desplegable bajo cada foto repitiendo el rótulo de encima, eran
 * un álbum — y de los incómodos. La pieza y el porqué, en `Maquinaria`.
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
    ══ Qué grupo se está mirando ══════════════════════════════════════════════

    `null` es «Todo». Y se DERIVA de las tandas en vez de guardarse a secas:
    mover la última foto de tríceps a bíceps hace desaparecer el grupo que estaba
    elegido, y sin esto la banda se quedaría en blanco con un índice donde ya no
    está lo marcado. Se cae a «Todo», que es donde sigue estando la foto.
  */
  const [ejePedido, setEje] = useState(null);
  const eje = tandas.some((t) => t.group === ejePedido) ? ejePedido : null;

  const visibles = aplanar(tandas, eje);

  /*
    ══ El álbum, en el MISMO orden en que se ve ══════════════════════════════

    El visor recorre de corrido lo que hay en la rejilla, como el carrete de un
    teléfono, y el orden tiene que ser exactamente ese: si «la siguiente» no es
    la que está al lado, pasar fotos deja de tener sentido. Por eso sale de
    `visibles` y no del gimnasio entero — mirando dorsal, la siguiente es de
    dorsal.

    Solo las que tienen enlace firmado: una foto sin URL no se puede enseñar
    grande, y meterla en el álbum sería un hueco negro a mitad del recorrido.
  */
  const album = visibles
    .filter((pieza) => pieza.url)
    .map((pieza) => ({
      id: pieza.id,
      url: pieza.url,
      /* La pieza entera viaja con su renglón: para descargarla hace falta su
         grupo y su nombre, que es con lo que se llama el archivo. */
      pieza,
      caption: pieza.name ? `${pieza.grupo} · ${pieza.name}` : pieza.grupo,
    }));
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
      className="bloque-gym"
      action={
        <div className="gym-cabeza">
          {/*
            ══ El índice, colgando del rótulo ══════════════════════════════════

            La columna del rótulo dice de qué va el bloque y qué puedes hacerle;
            los grupos de su gimnasio son lo primero. Se queda quieto mientras se
            recorren las fotos, que es lo que no hacía ningún carril puesto
            encima de la rejilla. Ver `IndiceDeGimnasio`.
          */}
          {!vacio && (
            <IndiceDeGimnasio
              tandas={tandas}
              total={equipment.length}
              valor={eje}
              onElegir={setEje}
            />
          )}

          {!editandoCarpeta && (
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
          )}
        </div>
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

      {pendientes > 0 && eje !== UNSORTED && (
        /*
          La bandeja es una TAREA, así que se dice cuántas quedan. Sin esto, unas
          fotos sin grupo son solo un titular más de la lista y se quedan ahí.

          Y ahora el aviso LLEVA a la tarea en vez de describirla: la bandeja es
          una parada del índice, así que el verbo la abre y deja delante solo lo
          que hay que colocar. Estando ya dentro, el aviso sobra — es el rótulo
          de lo que se está mirando.
        */
        <Notice tone="info">
          {pendientes === 1 ? 'Queda 1 foto sin ordenar.' : `Quedan ${pendientes} fotos sin ordenar.`}{' '}
          <button type="button" className="cab-accion is-puerta" onClick={() => setEje(UNSORTED)}>
            Colocarlas
          </button>
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
        <MesaDeMaquinas
          piezas={visibles}
          /* De qué es cada foto solo se dice mirando «Todo»: dentro de un grupo
             sería la misma palabra veintiséis veces, que es de lo que se venía. */
          conGrupo={eje === null}
          onAbrir={(pieza) => setAbierta(album.findIndex((f) => f.id === pieza.id))}
          onMover={mover}
          onBorrar={borrar}
        />
      )}

      {/* El recuento vivía aquí —«26 fotos en 5 grupos»— y ahora lo dice el
          índice, grupo a grupo y con la cifra al canto. Lo que queda es lo único
          que este pie aportaba de su cosecha: que estas fotos no se quedan en la
          ficha. */}
      {!vacio && (
        <p className="t-xs t-tertiary">Las ves al montar su rutina, sin salir de la pantalla.</p>
      )}

      {/* Y a pantalla completa, recorriendo el gimnasio entero. Ver `Gallery`. */}
      {abierta !== null && album[abierta] && (
        <Gallery
          items={album}
          index={abierta}
          onIndex={setAbierta}
          onClose={() => setAbierta(null)}
          /* Una foto de una máquina también se manda por WhatsApp —«¿es esta?»—
             y se guarda. Es el mismo verbo que en el archivo de progreso. */
          onDescargar={async (item) => {
            const res = await descargarFoto({
              url: item.url,
              nombre: equipmentFileName(item.pieza, { clientName: client?.name }),
            });
            if (!res.ok) setFallo(res.error);
          }}
        />
      )}
    </Panel>
  );
};
