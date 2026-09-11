import { Trash2 } from 'lucide-react';

import { muscleColor } from '@/domain/training';
import { UNSORTED, groupOptions } from '@/domain/equipment';
import { MenuAcciones } from '@/components/ui/MenuAcciones';
import { Thumb } from '@/components/photos/Thumb';

/**
 * La maquinaria de un gimnasio, mirada.
 *
 * ══ Qué se venía haciendo mal ══════════════════════════════════════════════
 *
 * Los grupos se apilaban: «Pecho · 11» y su rejilla, «Dorsal · 6» y la suya,
 * quince veces. Con veintiséis fotos eso da tres cosas, todas malas:
 *
 *  · **Un desplegable por foto repitiendo el rótulo que tiene encima.** Debajo
 *    de cada máquina de pecho ponía «Pecho», con su marco y su flecha, a ancho
 *    completo. El control de recolocar —que se usa una vez de cada veinte—
 *    pesaba más que la fotografía, y la pantalla se leía como filas de botones
 *    en vez de como una hoja de contactos.
 *  · **Las filas no cuadran nunca.** Once fotos en una rejilla de nueve son
 *    nueve y dos, con un palmo de vacío al lado; seis son seis de nueve. Cada
 *    grupo abre y cierra su propia rejilla, así que los huecos se multiplican.
 *  · **No se puede preguntar nada.** Para ver qué tiene de tríceps hay que bajar
 *    por delante de todo lo demás, y este bloque ya vive al final de una ficha
 *    larga.
 *
 * ══ Esto no es un álbum, es un inventario ══════════════════════════════════
 *
 * Nadie viene aquí a recorrer las fotos del gimnasio: se viene con una pregunta
 * —«¿qué tiene para dorsal?»— el día que se programa dorsal. Así que se enseña
 * **un grupo cada vez**, a lo ancho, y los grupos son el índice por el que se
 * entra. Recorrerlo entero sigue existiendo: es «Todo», y es una opción más.
 *
 * ══ Y clasificar deja de ser mobiliario ════════════════════════════════════
 *
 * Mover una foto de grupo es una acción, y una acción en reposo no está (la ley
 * del reposo). Baja al «···» de la propia foto, con la gramática de cualquier
 * otra fila de mando de la casa. El desplegable a la vista sobrevive en un solo
 * sitio —el alta del cliente—, porque allí decir de qué es cada foto no es una
 * corrección: es LA tarea.
 *
 * ══ Y vive aquí porque lo pintan TRES pantallas ════════════════════════════
 *
 * La ficha, la nota plegada encima del programa y el alta del cliente tenían la
 * misma rejilla copiada tres veces, y ya habían empezado a separarse. Lo que se
 * comparte es la pieza, no el recorte y pega.
 */

const Eje = ({ nombre, cuantas, color, activo, onClick }) => (
  <button type="button" className="gym-eje" aria-current={activo ? 'true' : undefined} onClick={onClick}>
    {/* Siempre, también en «Todo» —ahí vacío—: sin el hueco, las etiquetas
        dejarían de estar alineadas, que es la mitad del trabajo de una lista. */}
    <span className="gym-eje-disco" style={color ? { background: color } : undefined} aria-hidden="true" />

    <span className="gym-eje-nm">{nombre}</span>
    <span className="gym-eje-n">{cuantas}</span>
  </button>
);

/**
 * El índice del gimnasio: los grupos con su cifra.
 *
 * ── Por qué cuelga del rótulo y no es un carril encima de las fotos ────────
 * Porque el bloque de la ficha YA es de dos columnas —260 px de rótulo y la
 * banda de datos—, y la columna del rótulo es exactamente eso: de qué va esto y
 * qué puedes hacerle. Un carril encima de la rejilla gastaría un renglón de alto
 * y se perdería de vista en cuanto bajas; aquí el índice se queda quieto
 * mientras recorres las fotos, y no añade ni un mueble nuevo a la pantalla.
 *
 * Debajo del ancho de trabajo el bloque se apila solo, y entonces el índice SÍ
 * es un carril de chapas: es la misma lista, puesta como cabe. Lo hace el CSS.
 * Donde no hay columna de rótulo —la nota de encima del programa— se pide de
 * partida con `carril`.
 *
 * ── El color, en un disco ─────────────────────────────────────────────────
 * El grupo llevaba su color en el propio rótulo, y cinco titulares en rosa,
 * cian, azul y morado compiten entre sí como si uno de ellos fuese urgente. El
 * dato es el mismo —sale de `muscleColor`, como el volumen semanal—, pero dicho
 * en un disco de ocho píxeles: distingue sin gritar.
 *
 * @param tandas  Lo que devuelve `byMuscle`: `[{ group, items }]`.
 * @param valor   El grupo elegido, o `null` para «Todo».
 */
export const IndiceDeGimnasio = ({ tandas = [], total = 0, valor, onElegir, carril = false }) => {
  /* Con un solo grupo no hay nada que elegir: el índice sería una lista de una
     línea y «Todo», que son la misma cosa dicha dos veces. */
  if (tandas.length < 2) return null;

  return (
    <nav className={`gym-indice${carril ? ' es-carril' : ''}`} aria-label="Los grupos de su gimnasio">
      <Eje nombre="Todo" cuantas={total} activo={valor === null} onClick={() => onElegir(null)} />
      {tandas.map((tanda) => (
        <Eje
          key={tanda.group}
          nombre={tanda.group}
          cuantas={tanda.items.length}
          /* La bandeja no es una parte del cuerpo, así que no lleva disco de
             músculo: lleva el ámbar de lo que está pendiente. */
          color={tanda.group === UNSORTED ? 'var(--warning)' : muscleColor(tanda.group)}
          activo={valor === tanda.group}
          onClick={() => onElegir(tanda.group)}
        />
      ))}
    </nav>
  );
};

/**
 * Una máquina.
 *
 * En reposo es la foto y nada más. Al pasar por encima se enciende: el «···»
 * arriba —mover de grupo, borrar— y su nombre al pie sobre un velo, si lo tiene.
 * En táctil no hay «encima», así que allí el «···» está puesto: una acción que
 * no se puede alcanzar con el dedo no existe.
 *
 * @param grupo     De qué es. Se ENSEÑA solo con `conGrupo`, o sea mirando
 *   «Todo»: dentro de un grupo es la palabra que ya está en el índice.
 * @param onMover   `(destino) => void`. Sin esto no hay menú de grupos.
 * @param onBorrar  Sin esto no hay papelera. El cliente no puede borrar (0079).
 */
export const Maquina = ({ pieza, grupo, conGrupo = false, onAbrir, onMover, onBorrar, children }) => {
  const titulo = pieza.name || grupo;

  return (
    <figure className="gym-pieza">
      <div className="gym-foto">
        {pieza.url ? (
          onAbrir ? (
            /* Se pulsa y se abre grande, como en la galería del móvil. Es un
               botón y no una imagen con `onClick`: así se llega con el tabulador
               y se abre con Intro, y un lector de pantalla lo anuncia. */
            <button type="button" className="gym-abrir" aria-label={`Ver ${titulo} en grande`} onClick={onAbrir}>
              <Thumb url={pieza.url} alt={titulo} width={480} />
            </button>
          ) : (
            <Thumb url={pieza.url} alt={titulo} width={480} />
          )
        ) : (
          /* Firmar puede fallar sin que la pieza deje de existir. Se dice, en vez
             de enseñar un cuadro roto. */
          <span className="gym-sinfoto t-2xs">No se pudo cargar</span>
        )}

        {conGrupo && <span className="gym-tag">{grupo}</span>}
        {pieza.name && <figcaption className="gym-nombre">{pieza.name}</figcaption>}

        {(onMover || onBorrar) && (
          <div className="gym-mas">
            <MenuAcciones
              clase="gym-mas-btn"
              alineado="derecha"
              ariaLabel={`Qué hacer con ${titulo}`}
              items={[
                /* Los grupos como ajuste marcado y no como acciones sueltas: lo
                   que se ve al abrir es DÓNDE ESTÁ esta foto, y elegir otro la
                   mueve. Es el mismo menú-selector con el que se filtra la
                   Librería, y así no hace falta un segundo control a la vista. */
                ...(onMover
                  ? groupOptions().map((g) => ({
                      label: g,
                      on: pieza.muscleGroup === g,
                      run: () => onMover(g),
                    }))
                  : []),
                onBorrar && null,
                onBorrar && { label: 'Borrar la foto', icon: Trash2, danger: true, run: onBorrar },
              ]}
            />
          </div>
        )}
      </div>

      {/* Lo que cuelgue debajo de la foto — el desplegable del alta del cliente,
          que allí es la tarea y no una corrección. */}
      {children}
    </figure>
  );
};

/**
 * La hoja de contactos: una sola rejilla, llena.
 *
 * @param piezas  Ya aplanadas y en el orden en que se ven, cada una con `grupo`.
 */
export const MesaDeMaquinas = ({ piezas = [], conGrupo = false, onAbrir, onMover, onBorrar }) => (
  <div className="gym-grid">
    {piezas.map((pieza) => (
      <Maquina
        key={pieza.id}
        pieza={pieza}
        grupo={pieza.grupo}
        conGrupo={conGrupo}
        /* Se devuelve la PIEZA y no su posición: el álbum del visor solo lleva
           las que se pudieron firmar, así que la posición en la rejilla y la
           posición en el álbum no son el mismo número. */
        onAbrir={onAbrir ? () => onAbrir(pieza) : undefined}
        onMover={onMover ? (destino) => onMover(pieza, destino) : undefined}
        onBorrar={onBorrar ? () => onBorrar(pieza) : undefined}
      />
    ))}
  </div>
);

/**
 * Las tandas de `byMuscle`, aplanadas en el MISMO orden en que se ven y
 * acotadas al grupo que se está mirando.
 *
 * El visor recorre lo que hay en la rejilla —de la primera a la última sin
 * cerrar— y el orden tiene que ser exactamente el de la pantalla: si «la
 * siguiente» no es la que está al lado, pasar fotos deja de tener sentido. Por
 * eso mismo filtra por el grupo elegido: estando en «Dorsal», la siguiente foto
 * es la de dorsal, no la de pecho que se quedó arriba.
 */
export const aplanar = (tandas = [], grupo = null) =>
  tandas
    .filter((tanda) => grupo === null || tanda.group === grupo)
    .flatMap((tanda) => tanda.items.map((pieza) => ({ ...pieza, grupo: tanda.group })));
