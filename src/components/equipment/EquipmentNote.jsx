import { useState } from 'react';
import { ChevronLeft, ChevronRight, Dumbbell, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useData } from '@/context/AppContext';
import { byMuscle, equipmentHeadline } from '@/domain/equipment';
import { fieldText } from '@/domain/profile';
import { Fold } from '@/components/ui/primitives';
import { VentanaFlotante } from '@/components/ui/VentanaFlotante';
import { Thumb } from '@/components/photos/Thumb';
import { IndiceDeGimnasio, MesaDeMaquinas, aplanar } from './Maquinaria';

/**
 * Su maquinaria, en la pantalla donde se programa.
 *
 * ══ Por qué esto es la mitad que importa ═══════════════════════════════════
 *
 * Guardar las fotos en la ficha no cambia nada por sí solo: seguirían estando en
 * «otro sitio», solo que el otro sitio ya no sería Drive. Lo que cambia el
 * trabajo es tenerlas AQUÍ, plegadas encima del programa, mientras se elige el
 * ejercicio del jueves.
 *
 * Es el mismo razonamiento que `ConditionsNote`: un dato que hay que ir a buscar
 * llega después de la decisión.
 *
 * ── Cerrado de partida y con el recuento en el titular ──────────────────────
 * Quien programa cada semana ya se sabe el gimnasio de su cliente; quien acaba
 * de cogerlo, no. El titular dice cuántas hay y de cuántos grupos, así que
 * cerrado ya informa, y abrirlo es un clic — a diferencia de los condicionantes,
 * aquí no hay nada que pueda ser un veto, así que nunca se abre solo.
 *
 * ══ Y aquí el índice es lo que más falta hacía ═════════════════════════════
 *
 * Porque esta pantalla se abre con una pregunta de un solo grupo: se está
 * montando el día de espalda. Desplegar quince rejillas para encontrar las seis
 * fotos que interesan, encima del programa que se está escribiendo, es lo
 * contrario de tenerlas a mano. Un carril de grupos y una sola rejilla: se abre
 * el pliegue, se pulsa «Dorsal» y ahí está lo que tiene.
 *
 * Se mira y no se toca: ordenar y borrar son cosa de la ficha, que es donde se
 * suben.
 *
 * ══ Y SÍ se abre grande — en una ventana, no en un visor ═══════════════════
 *
 * Aquí ponía que una foto no se podía abrir, y el motivo estaba bien visto: un
 * visor a pantalla completa encima de un programa a medio escribir tapa justo lo
 * que se estaba haciendo. Lo que estaba mal era la conclusión, porque el
 * resultado fue quedarse con miniaturas de 150 px para contestar «¿esta prensa
 * es de placas o de discos?». A ese tamaño no se contesta, y quien programa
 * acababa abriendo la carpeta de Drive en otra pestaña: exactamente lo que estas
 * fotos existen para no tener que hacer.
 *
 * La respuesta no era tapar menos, era **no tapar**: la foto se abre en una
 * ventana flotante que se arrastra a donde no moleste, se estira, se queda
 * mientras se escriben las series y recuerda dónde la dejaste. Ver
 * `ui/VentanaFlotante`.
 *
 * ── Y las flechas recorren el GRUPO que estás mirando ───────────────────────
 * Programando espalda se comparan las tres máquinas de dorsal que tiene, y eso
 * es pasar de una a otra sin volver a la rejilla. Si se cambia de grupo con una
 * ventana abierta, la foto se queda —es la que estabas usando— y las flechas se
 * retiran: ya no pertenece a la lista que hay debajo, y unas flechas que saltan
 * a otro músculo serían mentira.
 */
export const EquipmentNote = () => {
  const { equipment, activeClient } = useData();
  const tandas = byMuscle(equipment);
  const carpeta = fieldText(activeClient?.profile, 'gymFolder');

  const [ejePedido, setEje] = useState(null);
  /* Derivado, como en la ficha: el grupo elegido puede dejar de existir sin que
     esta pantalla haya tocado nada — las fotos se mueven desde la ficha. */
  const eje = tandas.some((t) => t.group === ejePedido) ? ejePedido : null;

  const piezas = aplanar(tandas, eje);
  /* La PIEZA abierta, no su posición: la lista de debajo cambia al elegir otro
     grupo y un índice guardado apuntaría entonces a otra máquina. */
  const [abierta, setAbierta] = useState(null);
  const enLista = abierta ? piezas.findIndex((p) => p.id === abierta.id) : -1;

  const pasar = (paso) => {
    if (enLista < 0) return;
    setAbierta(piezas[(enLista + paso + piezas.length) % piezas.length]);
  };

  /* Sin fotos y sin carpeta no se dice nada. Un hueco permanente con un estado
     vacío encima del programa es cromo que se lee una vez y estorba mil. */
  if (tandas.length === 0 && !carpeta) return null;

  return (
    /*
      La ventana va FUERA del pliegue, y no es colocación decorativa: `Fold` no
      pinta a sus hijos cuando está cerrado, así que plegar la nota mientras se
      mira una máquina la haría desaparecer. Y plegar la nota es lo normal en
      cuanto tienes la foto en la ventana: ya no necesitas la rejilla.
    */
    <>
      <Fold
        icon={Dumbbell}
        title="Su maquinaria"
        summary={equipmentHeadline(equipment) || 'En tu carpeta de fuera'}
      >
        {tandas.length > 0 ? (
          <div className="col gap-3">
            {/* En carril y no en columna: aquí no hay columna de rótulo de la que
                colgar, y el pliegue es ancho y bajo. */}
            <IndiceDeGimnasio
              tandas={tandas}
              total={equipment.length}
              valor={eje}
              onElegir={setEje}
              carril
            />
            <MesaDeMaquinas piezas={piezas} conGrupo={eje === null} onAbrir={setAbierta} />
          </div>
        ) : (
          <p className="t-sm t-secondary">
            Sus fotos están fuera de la aplicación. Puedes subirlas a su ficha y tenerlas aquí sin
            cambiar de pestaña.
          </p>
        )}

        <p className="t-xs t-tertiary">
          {carpeta && (
            <>
              <a href={carpeta} target="_blank" rel="noreferrer noopener">
                <ExternalLink size={13} /> Abrir su carpeta
              </a>
              {' · '}
            </>
          )}
          Se suben y se ordenan en su <Link to={`/c/${activeClient?.id}/ficha`}>ficha</Link>.
        </p>
      </Fold>

      {abierta && (
        <VentanaFlotante
          clave="maquinaria"
          titulo={abierta.name || abierta.grupo || abierta.muscleGroup}
          sub={enLista >= 0 ? `${abierta.grupo} · ${enLista + 1} de ${piezas.length}` : abierta.grupo}
          onClose={() => setAbierta(null)}
          acciones={
            /* Las flechas solo cuando la foto está en la lista de debajo y hay
               más de una: un par de flechas que no llevan a ningún sitio son dos
               botones que hay que probar para descubrir que no hacen nada. */
            enLista >= 0 && piezas.length > 1 ? (
              <>
                <button
                  type="button"
                  className="btn btn-icon btn-icon-compact"
                  aria-label="La máquina anterior"
                  onClick={() => pasar(-1)}
                >
                  <ChevronLeft size={15} />
                </button>
                <button
                  type="button"
                  className="btn btn-icon btn-icon-compact"
                  aria-label="La máquina siguiente"
                  onClick={() => pasar(1)}
                >
                  <ChevronRight size={15} />
                </button>
              </>
            ) : null
          }
        >
          {/* La foto llena la ventana y se ve ENTERA: `contain`, no `cover`. Una
              máquina recortada por los bordes es justo la foto que no contesta
              la pregunta por la que se abre. Se pide a 900 px, que es más de lo
              que puede medir la ventana estirada del todo. */}
          <figure className="vflota-foto">
            <Thumb url={abierta.url} alt={abierta.name || abierta.grupo} width={900} />
          </figure>
        </VentanaFlotante>
      )}
    </>
  );
};
