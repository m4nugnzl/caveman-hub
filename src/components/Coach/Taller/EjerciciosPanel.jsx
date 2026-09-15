import { useMemo, useState } from 'react';
import { Dumbbell, Plus, Quote, Search, Video } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { findByName, groupInOrder, mergeCatalog } from '@/domain/catalog';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { EmptyState } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { Cinta } from '@/components/ui/Cinta';
import { SelectorDeGrupo } from './SelectorDeGrupo';
import { FichaEjercicio } from './FichaEjercicio';

/**
 * TUS EJERCICIOS: la biblioteca, que hasta ahora no tenía pantalla.
 *
 * ══ Y `catalog.js` dice que no debería haberla ═════════════════════════════
 *
 * Dice, literalmente, «por qué no hay pantalla de catálogo»: porque obligaría a
 * un paso previo —ir a importar— que nadie da, ya que el momento en el que
 * necesitas «Lentejas» es mientras montas la dieta. **Eso sigue siendo verdad y
 * no cambia nada**: el autocompletado de la hoja (`AddExerciseForm`) sigue
 * siendo la entrada principal y esta pantalla no es un paso previo de nada.
 *
 * Lo que esta pantalla da es lo otro, que un buscador no puede dar: **curar**.
 * Poner tu vídeo y tus pautas, dejar previstas las alternativas, ver qué
 * llevas puesto y con qué material. Si al usarla aparece un flujo de «ir a
 * preparar la biblioteca antes de programar», está mal construida.
 *
 * ── Lo tuyo y lo del catálogo, en una sola lista ───────────────────────────
 * Con `mergeCatalog`, que es el mismo mezclador del buscador: tu biblioteca
 * primero y el catálogo detrás, sin repetidos. La cápsula dice de dónde viene
 * cada uno — saber que algo TODAVÍA no es tuyo explica por qué al ponerle un
 * vídeo aparece de repente en tu biblioteca.
 */

/**
 * @param banda  Los tramos de la LIBRERÍA (`LibreriaPanel`), que es quien sabe
 *   cuántos ejercicios y cuántos alimentos hay y a dónde lleva cada pestaña.
 *   Esta mitad solo pone su título y su acción — la de la lista que enseña.
 */
export const EjerciciosPanel = ({ banda }) => {
  const { exerciseLibrary, catalogExercises } = useApp();
  /* De quién es: `null` todos, `mios`, `catalogo`. Era un tramo de la banda y
     ahora es un filtro, que es lo que siempre fue: no parte la lista en dos
     pantallas, la acota — y aquí abajo se puede combinar con el músculo y con
     el buscador, que arriba no podía. */
  const [origen, setOrigen] = useState(null);
  const [busca, setBusca] = useState('');
  const [musculo, setMusculo] = useState(null);
  /* Lo que hay tocado en la lista, por nombre. Null NO es «nada»: es «todavía
     no has elegido», y entonces manda el primero de la lista (ver `actual`). */
  const [elegido, setElegido] = useState(null);
  const [nuevo, setNuevo] = useState(false);
  /* El contador de remontaje. La ficha guarda su borrador en estado propio, así
     que para que cambiar de ejercicio la recargue —y para que «Cancelar»
     descarte de verdad— hay que darle una `key` nueva. Sin esto, tocar otro
     ejercicio dejaba el vídeo y las pautas del anterior escritos en los campos. */
  const [revision, setRevision] = useState(0);

  /* El corte del carril. Por debajo no cabe la ficha al lado y se vuelve a la
     capa de siempre, que es lo correcto en un portátil pequeño y en el móvil.
     Son DOS ÁRBOLES distintos —la misma ficha en dos sitios—, que es
     exactamente el caso para el que existe este gancho (ver `useMediaQuery`).

     El número sale de una cuenta, no del gusto: a la lista le hacen falta unos
     850 px para que la tabla no se estrangule, la ficha pide 340 y la calle 22.
     Sumando el ancho de la barra lateral y los márgenes de la hoja, eso son
     1560 px de ventana. Se probó a 1240 y salía lo previsible: «Banda elástica»
     partida en dos líneas y la columna «Lo tuyo» fuera de la vista. Un banco
     que no cabe es peor que una capa que sí. */
  const hayCarril = useMediaQuery('(min-width: 1440px)');

  /* La lista mezclada, con la ficha del catálogo pegada a cada uno: la
     biblioteca no guarda `equipment` ni `description` —son del catálogo, 0094—
     así que se buscan por nombre igual que hace el resto del producto. */
  const todos = useMemo(() => {
    const mezcla = mergeCatalog(exerciseLibrary, catalogExercises);
    return mezcla.map((ex) => {
      const general = findByName(catalogExercises, ex.name);
      return {
        ...ex,
        description: ex.description || general?.description || null,
        /* «Tuyo» = lo diste de alta tú, no «tienes fila». Escribir un ejercicio
           del catálogo en una hoja lo copia a tu biblioteca, así que con
           `!ex.fromCatalog` acababa con chapa de «Tuyo» y con una ficha que
           decía «del catálogo». El porqué largo está en `AlimentosPanel`, donde
           el dueño lo cazó. */
        mio: !general,
      };
    });
  }, [exerciseLibrary, catalogExercises]);

  const musculos = useMemo(() => {
    const cuenta = new Map();
    for (const ex of todos) {
      const m = ex.muscle || null;
      if (!m) continue;
      cuenta.set(m, (cuenta.get(m) || 0) + 1);
    }
    /* Los que de verdad tienes, por tamaño: el vocabulario entero
       (`MUSCLE_GROUPS`) son veintitantos y la mayoría estarían a cero. Sin tope
       de ocho desde que esto es un menú: allí no hay ancho que repartir. */
    return [...cuenta.entries()].sort((a, b) => b[1] - a[1]);
  }, [todos]);

  const visibles = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return todos
      .filter((ex) => (origen === 'mios' ? ex.mio : origen === 'catalogo' ? !ex.mio : true))
      .filter((ex) => (musculo ? ex.muscle === musculo : true))
      .filter((ex) => (q ? ex.name.toLowerCase().includes(q) : true))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [todos, origen, musculo, busca]);

  /*
    ══ LA LISTA VA POR MÚSCULOS, Y ASÍ SE VA EL SOCAVÓN ══════════════════════

    Medido en la pantalla real a 1920: el nombre acababa en x≈590 y «Dorsal»
    empezaba en x≈1024. Seiscientos píxeles de nada en cada una de las 239
    filas, porque una tabla de dos columnas es una lista disfrazada de tabla —y
    la segunda columna repetía fila a fila lo que el filtro de arriba ya
    ofrecía—.

    Agrupada, la clasificación se dice UNA vez por grupo y de paso dice cuántos
    hay, que es lo que una columna repetida nunca podrá decir. El orden es el
    del selector de filtros (por cuántos hay) para que la pantalla tenga un solo
    orden; el porqué de no usar `MUSCLE_GROUPS`, en `groupInOrder`.
  */
  const grupos = useMemo(
    () => groupInOrder(visibles, 'muscle', musculos.map(([m]) => m)),
    [visibles, musculos]
  );

  /*
    ══ QUÉ ENSEÑA EL CARRIL: NUNCA NADA ══════════════════════════════════════
    La regla del banco de dos planos es que el carril derecho no se queda vacío.
    Así que sin elección explícita manda el primero de la lista: al entrar ya se
    ve una ficha, y filtrar por «Dorsal» enseña el primer dorsal. Un carril con
    «elige algo de la izquierda» es media pantalla pidiendo permiso para
    trabajar.

    Y si lo elegido se cae del filtro, no se queda una ficha huérfana de algo
    que ya no está en la lista: vuelve a mandar el primero.

    ── «El primero» es el de la lista AGRUPADA, no el del alfabeto ─────────
    Desde que la lista va por músculos, `visibles[0]` es «Ab rollout en barra»
    —abdominales— mientras arriba del todo se lee «Dorsal». O sea: la ficha
    abierta señalaba una fila que no estaba a la vista y la marca de «estás
    aquí» quedaba a mil píxeles de desplazamiento. El primero es el que se ve.
  */
  const actual = useMemo(() => {
    if (nuevo) return null;
    return visibles.find((e) => e.name === elegido) || grupos[0]?.filas[0] || null;
  }, [visibles, grupos, elegido, nuevo]);

  /* Sin nada que enseñar no hay dos planos: la rejilla se deshace y el vacío
     ocupa la hoja entera. Un carril vacío al lado de un «aquí no hay nada» son
     dos vacíos para el mismo hecho. */
  const conCarril = hayCarril && (Boolean(actual) || nuevo);

  /* Tocar un ejercicio: sale del modo «nuevo» si estaba, apunta a este y fuerza
     el remontaje de la ficha para que cargue lo suyo. */
  const elegir = (name) => {
    setNuevo(false);
    setElegido(name);
    setRevision((v) => v + 1);
  };

  const nMios = todos.filter((e) => e.mio).length;

  /* Lo borrado sale de la lista solo —`useLibraries` refresca la biblioteca
     local—; aquí solo hay que soltar la elección, o el carril se quedaría
     apuntando a un nombre que ya no está. */
  const trasBorrar = () => {
    setNuevo(false);
    setElegido(null);
    setRevision((v) => v + 1);
  };

  return (
    <div className="stack cascada">
      <div className="taller libreria">
        <Cinta
          {...banda}
          accion={
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                setNuevo(true);
                setRevision((v) => v + 1);
              }}
            >
              <Plus size={15} /> Nuevo ejercicio
            </button>
          }
        />

        <div className={`cartera-cuerpo${conCarril ? ' es-banco' : ''}`}>
          <div className="plano-lista">
          <div className="cartera-barra">
            <div className="searchbox">
              <Search size={15} aria-hidden="true" />
              <input
                type="search"
                className="input input-sm"
                placeholder="Buscar ejercicio…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                aria-label="Buscar ejercicio"
              />
            </div>

            {/* De quién es y de qué es, en el mismo carril y en este orden: lo
                primero que se acota es «enséñame solo lo mío», y después por
                dónde. Dos chapas y no tres: «Todos» es no pulsar ninguna, que
                es como funciona el resto de chapas de la aplicación.

                ── Y `rail-wrap`, que es lo que hacía que el menú NO SE VIERA ──
                `.rail` lleva `overflow-x: auto`, y en CSS un `overflow` en un
                eje convierte el otro en `auto` también: el popover del selector
                de músculo se montaba, decía estar visible y quedaba RECORTADO
                por el propio carril —comprobado con `elementFromPoint`, que en
                mitad del menú devolvía la tabla de debajo—. Encima el `mask`
                del degradado lo desvanecía. Pulsar «Músculo» no hacía nada.

                Con `rail-wrap` el desbordamiento vuelve a `visible` y el menú
                se pinta. Y es además la variante correcta por doctrina: las
                opciones son excluyentes y hay que verlas todas para elegir
                (ver `.rail` en `layout.css`). Desde que los ejes largos se
                pliegan en `SelectorDeGrupo` aquí no queda nada que rodar. */}
            <div className="rail rail-wrap" role="group" aria-label="Filtrar la lista">
              <button
                type="button"
                className="chip"
                aria-pressed={origen === 'mios'}
                onClick={() => setOrigen(origen === 'mios' ? null : 'mios')}
              >
                Tuyos
                <span className="chip-count">{nMios}</span>
              </button>
              <button
                type="button"
                className="chip"
                aria-pressed={origen === 'catalogo'}
                onClick={() => setOrigen(origen === 'catalogo' ? null : 'catalogo')}
              >
                Del catálogo
                <span className="chip-count">{todos.length - nMios}</span>
              </button>

              {musculos.length > 1 && <span className="rail-corte" aria-hidden="true" />}
              {/* Los músculos son ocho y no caben; ver `SelectorDeGrupo`. */}
              <SelectorDeGrupo
                titulo="Músculo"
                opciones={musculos}
                valor={musculo}
                onElegir={setMusculo}
              />
            </div>
          </div>

          {visibles.length === 0 ? (
            <EmptyState
              icon={Dumbbell}
              title="Aquí no hay nada todavía"
              message={
                busca.trim()
                  ? `Ningún ejercicio se llama «${busca.trim()}». Se da de alta desde la hoja de un cliente o con «Nuevo ejercicio».`
                  : 'Tu biblioteca se llena sola: cada ejercicio que escribes en una hoja se queda aquí, listo para ponerle tu vídeo y tu clave.'
              }
            />
          ) : (
            <div className="plantilla">
              <table>
                <thead>
                  <tr>
                    <th scope="col" className="lib-nombre">
                      Ejercicio
                    </th>
                    {/*
                      ── Y en su hueco, QUÉ ES ────────────────────────────────
                      El socavón no se arregla estrechando la tabla: se arregla
                      poniendo dentro algo que valga la pena leer. La descripción
                      del catálogo existe en 148 de los 239 y es justo lo que
                      distingue dos nombres parecidos sin abrir ninguno de los
                      dos. Donde no la hay, la celda calla — que es lo que hace
                      una columna secundaria, y lo contrario de lo que hacía «Lo
                      tuyo» cuando ocupaba un tercio del ancho para estar vacía
                      en 238 filas.
                    */}
                    <th scope="col" className="ej-quees">
                      Qué es
                    </th>
                  </tr>
                </thead>
                {grupos.map(({ grupo, filas }) => (
                <tbody key={grupo || '(sin músculo)'}>
                  {/* La cabecera del grupo. Es `th` de `colgroup` y no una fila
                      más: un lector de pantalla tiene que poder decir a qué
                      músculo pertenece lo que viene debajo. */}
                  <tr className="fila-grupo">
                    <th scope="colgroup" colSpan={2}>
                      {grupo || 'Sin músculo'}
                      <span className="chip-count">{filas.length}</span>
                    </th>
                  </tr>
                  {filas.map((ex) => (
                    <tr
                      key={ex.id || ex.name}
                      className={conCarril && actual?.name === ex.name ? 'is-elegida' : ''}
                      aria-current={conCarril && actual?.name === ex.name ? 'true' : undefined}
                      onClick={() => elegir(ex.name)}
                    >
                      <td>
                        <span className="p-name f-nombre">
                          {/* Sigue siendo un botón aunque la fila entera valga:
                              es por donde entra el teclado, igual que en la
                              cartera. */}
                          <button type="button" className="p-abrir" onClick={() => elegir(ex.name)}>
                            {ex.name}
                          </button>
                          {/*
                            ── Lo tuyo, PEGADO AL NOMBRE ────────────────────
                            Esto era una columna de 34 % titulada «Lo tuyo», y
                            en una biblioteca recién estrenada está vacía en 238
                            de 239 filas: un tercio del ancho reservado para la
                            excepción. Ahora son marcas junto al nombre, que es
                            la misma ley que ya rige el renglón del entreno («la
                            cadenita junto al nombre») y la nota del alimento
                            dos columnas más allá.

                            Sin la columna, las dos mitades de la librería
                            tienen por fin la misma fila: nombre con sus marcas,
                            su clasificación, y a la derecha lo que se lee en
                            vertical.
                          */}
                          {/* ── Y de quién es, TAMBIÉN pegado al nombre ────
                              Vivía en la última columna, a seiscientos píxeles
                              del nombre al que califica y vacía en la mayoría
                              de las filas: la misma avería que ya se le quitó a
                              «Lo tuyo» dos párrafos más arriba, sobreviviendo
                              en la otra punta de la misma fila. Con ella fuera,
                              las dos mitades de la librería vuelven a tener la
                              misma fila: nombre con sus marcas y su origen, y
                              después su clasificación.

                              Y sigue marcando lo TUYO y no lo del catálogo, que
                              es lo contrario de Coachway y por un motivo: allí
                              lo personal es raro y el sistema son 1.772 filas,
                              así que «System» repetido mil veces es ruido. Lo
                              excepcional es lo que merece chapa. */}
                          {ex.mio && <span className="badge badge-info">Tuyo</span>}
                          {/* Lo que TÚ le has puesto. Suben de terciario a
                              secundario y de 13 a 14 px: eran la única señal de
                              esta pantalla que decía «aquí ya has trabajado» y
                              estaban en la tinta más callada de la casa, al
                              lado de un nombre en tinta plena. */}
                          <span className="ej-marcas">
                            {ex.videoUrl && <Video size={15} aria-label="Tiene tu vídeo" />}
                            {/* La frase entera se lee en la ficha, a dos dedos
                                de aquí; en la lista lo que hace falta saber es
                                si la hay. */}
                            {ex.cue && <Quote size={15} aria-label="Tiene tus pautas" />}
                          </span>
                        </span>
                      </td>
                      <td className="ej-quees">{ex.description || ''}</td>
                    </tr>
                  ))}
                </tbody>
                ))}
              </table>
            </div>
          )}
          </div>

          {/*
            ══ EL SEGUNDO PLANO ══════════════════════════════════════════════
            La ficha ERA una capa que se ponía encima de la lista: para poner un
            vídeo había que tapar los 294 ejercicios, y comparar dos era abrir,
            cerrar y volver a abrir. Al lado, curar la biblioteca es recorrer la
            lista con la ficha delante — que es el trabajo que esta pantalla
            existe para hacer.

            Pegajoso y con su filete a la izquierda: la misma gramática que el
            panel de la pregunta en el constructor de formularios. Dos planos
            del mismo mueble, no dos inventos.
          */}
          {conCarril && (
            <aside className="plano-ficha" aria-label={nuevo ? 'Nuevo ejercicio' : 'La ficha del ejercicio'}>
              {/* El nombre lo pone la FICHA. Ver la otra mitad. */}
              {nuevo && <h2 className="plano-ficha-tit">Nuevo ejercicio</h2>}
              <FichaEjercicio
                key={`${nuevo ? '+nuevo' : actual.name}-${revision}`}
                nombre={nuevo ? '' : actual.name}
                nuevo={nuevo}
                lista={todos}
                /* En un carril no hay nada que cerrar: «Cancelar» descarta el
                   borrador (remontar) y guardar lo recarga ya guardado. Salir
                   del alta sí es volver a la lista. */
                onIr={elegir}
                onCerrar={() => {
                  setNuevo(false);
                  setRevision((v) => v + 1);
                }}
                onBorrado={trasBorrar}
              />
            </aside>
          )}
        </div>
      </div>

      {/* Sin sitio para el carril, la ficha vuelve a ser una capa. Solo cuando
          se ha tocado algo a propósito: aquí `actual` no vale, porque ese elige
          el primero de la lista él solo y abriría una capa nada más entrar. */}
      {!hayCarril && (elegido || nuevo) && (
        <Modal
          size="side"
          title={nuevo ? 'Nuevo ejercicio' : elegido}
          onClose={() => {
            setNuevo(false);
            setElegido(null);
          }}
        >
          <FichaEjercicio
            nombre={nuevo ? '' : elegido}
            nuevo={nuevo}
            enCapa
            lista={todos}
            onIr={elegir}
            onCerrar={() => {
              setNuevo(false);
              setElegido(null);
            }}
            onBorrado={trasBorrar}
          />
        </Modal>
      )}
    </div>
  );
};
