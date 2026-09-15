import { useMemo, useState } from 'react';
import { Apple, Plus, Search, StickyNote } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { clientPath } from '@/routes';
import { FOOD_TAG_LABELS, groupInOrder, mergeCatalog, similarNames } from '@/domain/catalog';
import { foodClientsByName } from '@/domain/nutrition';
import { norm } from '@/lib/texto';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { EmptyState } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { Cinta } from '@/components/ui/Cinta';
import { SelectorDeGrupo } from './SelectorDeGrupo';
import { FichaAlimento } from './FichaAlimento';

/**
 * TU DESPENSA: la biblioteca de alimentos.
 *
 * ══ Qué se ve aquí que no se ve en ningún otro sitio ═══════════════════════
 *
 * Los macros por 100 g y la unidad natural ya se usan en cada dieta. Lo que solo
 * se puede ver aquí es **el conjunto**: cuántos alimentos manejas, cuáles son
 * tuyos y cuáles de referencia, qué lleva cada uno y —desde ahora— **en cuántas
 * dietas lo usas**, que es la cifra que convierte una biblioteca en algo que se
 * puede podar.
 *
 * ── Las etiquetas son HECHOS, no permisos ─────────────────────────────────
 * «Contiene gluten» es verdad para todo el mundo; a quién se lo puedes dar es
 * criterio tuyo y lo decide el cruce con sus condicionantes, que vive en la
 * dieta (`foodConflicts`). Aquí solo se dice qué lleva.
 *
 * ══ Y ahora también se CURA, que era lo que faltaba ════════════════════════
 *
 * Esta pantalla era una tabla de solo lectura: ni acción primaria, ni ficha, ni
 * lápiz, ni alta. La única del Taller sin un solo verbo — y encima corregir un
 * alimento sí se podía, pero desde el lápiz de la fila de una dieta, así que la
 * pantalla de la biblioteca era el único sitio donde la biblioteca no se
 * corregía.
 *
 * Se monta el banco de dos planos que ya usa `/ejercicios`: la lista a la
 * izquierda, la ficha a la derecha, con el mismo corte de anchura y las mismas
 * capas. Cero patrón nuevo — es el mueble que ya existe, montado dos veces.
 *
 * ══ Y sigue sin ser una pantalla de importar ══════════════════════════════
 * El catálogo se mezcla en el buscador de la dieta y ahí se copia a tu
 * biblioteca al usarlo. Esto es el inventario y el taller, no la puerta.
 */

/* 4-4-9, la cuenta de siempre. Vive aquí y no en el dominio porque el dominio ya
   la tiene para los totales de una dieta (`nutrition.js`), y lo que hace falta
   en esta lista es la de un alimento suelto por 100 g. */
const kcal100 = (f) =>
  Math.round(
    (Number(f.proteinPer100) || 0) * 4 +
      (Number(f.carbsPer100) || 0) * 4 +
      (Number(f.fatsPer100) || 0) * 9
  );

/**
 * @param banda  Los tramos de la LIBRERÍA (`LibreriaPanel`). Esta mitad pone su
 *   acción y su lista; el título y las pestañas son de la puerta, no suyas.
 */
export const AlimentosPanel = ({ banda }) => {
  const { foodLibrary, catalogFoods, nutrition, clients } = useApp();
  /* De quién es. Era un tramo de la banda y ahora es un filtro —que es lo que
     siempre fue—, combinable con la categoría y con el buscador. */
  const [origen, setOrigen] = useState(null);
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState(null);
  /* Lo tocado en la lista, por nombre. Null NO es «nada»: es «todavía no has
     elegido», y entonces manda el primero (ver `actual`). La misma mecánica que
     `/ejercicios`, incluido el contador de remontaje que hace que cambiar de
     alimento recargue la ficha y que «Cancelar» descarte de verdad. */
  const [elegido, setElegido] = useState(null);
  const [alta, setAlta] = useState(null); // null | {} | {…prerrelleno}
  const [revision, setRevision] = useState(0);

  /* El mismo corte que en `/ejercicios`, y por el mismo motivo: por debajo no
     cabe la ficha al lado y se vuelve a la capa. Se reutiliza el número en vez
     de medir otro porque es el mismo mueble — dos cortes distintos para dos
     pantallas gemelas serían dos comportamientos que explicar. */
  const hayCarril = useMediaQuery('(min-width: 1440px)');

  /* A quién le das cada alimento. Los planes de todos los clientes ya están
     cargados, así que esto no cuesta una consulta (ver `foodClientsByName`), y
     de la misma vuelta salen la cifra de la lista —`.length`— y los nombres que
     enseña la ficha. */
  const quienes = useMemo(() => foodClientsByName(nutrition || {}), [nutrition]);

  /* El nombre de cada uno, para no recorrer la cartera por cada alimento. */
  const nombrePorId = useMemo(
    () => new Map((clients || []).map((c) => [c.id, c.name])),
    [clients]
  );

  const todos = useMemo(() => {
    const mezcla = mergeCatalog(foodLibrary, catalogFoods);
    return mezcla.map((f) => {
      /* Las etiquetas y la categoría son del catálogo: tu copia no las tiene
         (la biblioteca no tiene esas columnas) y se buscan por nombre, igual
         que la ficha del ejercicio. */
      const general = catalogFoods.find((c) => c.name.toLowerCase() === f.name.toLowerCase());
      return {
        ...f,
        tags: (f.tags || []).length > 0 ? f.tags : general?.tags || [],
        category: f.category || general?.category || null,
        /*
          ══ «TUYO» SIGNIFICA TUYO, Y ANTES NO ═══════════════════════════════

          Esto era `!f.fromCatalog`, o sea «tiene fila en tu biblioteca». Y esa
          no es la misma pregunta: al usar «Aceite de oliva» en una dieta se
          copia a tu biblioteca automáticamente (0033), así que pasaba a llevar
          la chapa «Tuyo» — y al abrirlo, la ficha decía «del catálogo, no se
          toca». Dos afirmaciones contradictorias en la misma pantalla, y el
          dueño las vio a la vez: «no entiendo muy bien el tuyo».

          La chapa mentía. Lo que un alimento es depende de si su NOMBRE está en
          el catálogo, no de si tienes copia: si está, sus macros son de
          referencia y no se tocan (es literalmente lo que decide
          `canEditLibraryItem`); si no está, lo diste de alta tú.

          Efecto medido en la demo: «Tuyos» baja de 107 a los que de verdad
          creaste, y ninguna fila con chapa vuelve a abrirse diciendo que es
          del catálogo.
        */
        mio: !general,
        usos: (quienes.get(norm(f.name)) || []).length,
      };
    });
  }, [foodLibrary, catalogFoods, quienes]);

  const categorias = useMemo(() => {
    const cuenta = new Map();
    for (const f of todos) {
      if (!f.category) continue;
      cuenta.set(f.category, (cuenta.get(f.category) || 0) + 1);
    }
    /* Todas, y ya no un tope de ocho: el tope existía porque eran chapas en
       una fila y no cabían. En un menú no hay ancho que repartir, así que
       recortar la lista sólo escondería categorías que sí tienes. */
    return [...cuenta.entries()].sort((a, b) => b[1] - a[1]);
  }, [todos]);

  const visibles = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return todos
      .filter((f) => (origen === 'mios' ? f.mio : origen === 'catalogo' ? !f.mio : true))
      .filter((f) => (categoria ? f.category === categoria : true))
      .filter((f) => (q ? f.name.toLowerCase().includes(q) : true))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [todos, origen, categoria, busca]);

  /* La despensa va por categorías, igual que la otra mitad va por músculos: el
     mismo mueble tiene el mismo índice. Aquí no había columna que quitar —la
     categoría nunca estuvo en la tabla—, así que lo que se gana es lo otro: se
     ve cuántos lácteos tienes y se salta a ellos sin filtrar. El orden es el
     del selector de filtros; ver `groupInOrder`. */
  const grupos = useMemo(
    () => groupInOrder(visibles, 'category', categorias.map(([c]) => c)),
    [visibles, categorias]
  );

  /* El carril no enseña nunca «elige algo de la izquierda»: sin elección manda
     el primero de la lista, y si lo elegido se cae del filtro vuelve a mandar el
     primero en vez de quedarse una ficha huérfana. */
  /* «El primero» es el de la lista agrupada y no el del alfabeto: con la lista
     por categorías, `visibles[0]` era «Aceite de coco» mientras la primera fila
     de la pantalla decía «Cereales», así que la ficha abierta señalaba una fila
     que no estaba a la vista. El porqué largo, en la otra mitad. */
  const actual = useMemo(() => {
    if (alta) return null;
    return visibles.find((f) => f.name === elegido) || grupos[0]?.filas[0] || null;
  }, [visibles, grupos, elegido, alta]);

  const conCarril = hayCarril && (Boolean(actual) || Boolean(alta));

  const elegir = (name) => {
    setAlta(null);
    setElegido(name);
    setRevision((v) => v + 1);
  };

  const abrirAlta = (inicial = null) => {
    setAlta(inicial || {});
    setRevision((v) => v + 1);
  };

  /* «Crear el mío a partir de este»: un alta prerrellenada con los macros del
     catálogo y con el nombre marcado para que se cambie. No se puede guardar con
     el mismo nombre —`upsertByName` identifica por nombre y guardaría los macros
     del catálogo—, así que el sufijo no es decoración: es lo que hace que el alta
     sea válida desde el primer momento. */
  const crearElMio = (base) =>
    abrirAlta({
      name: `${base.name} (el mío)`,
      /* Y con su grupo puesto: tu «Pan integral Bimbo» sale del «Pan integral»
         del catálogo y sigue siendo un cereal. Sin esto nacía sin clasificar y
         desaparecía del filtro por categoría el día que se creaba. */
      category: base.category || null,
      proteinPer100: base.proteinPer100,
      carbsPer100: base.carbsPer100,
      fatsPer100: base.fatsPer100,
      unitLabel: base.unitLabel,
      unitGrams: base.unitGrams,
      /* Lo que lleva y lo que pone el envase viajan con lo demás: tu pan de
         marca sigue llevando gluten, y volver a marcarlo a mano es la clase de
         paso que hace que nadie lo marque. Son un punto de partida —se corrigen
         con el envase delante—, no una copia que mande. */
      tags: base.tags || [],
      fiberPer100: base.fiberPer100 ?? null,
      sugarsPer100: base.sugarsPer100 ?? null,
      saturatesPer100: base.saturatesPer100 ?? null,
      saltPer100: base.saltPer100 ?? null,
    });

  const cerrarFicha = () => {
    setAlta(null);
    setRevision((v) => v + 1);
  };

  const nMios = todos.filter((f) => f.mio).length;

  /* A quién se lo das, con nombre y con puerta. La cuenta ya estaba hecha en
     `quienes`; aquí solo se le pone cara a cada id y se descartan los que ya no
     están en la cartera —un plan de alguien archivado sigue en memoria, y una
     cápsula que lleva a un expediente que no existe es peor que no ponerla—. */
  const enDietasDe = (nombreAlimento) =>
    (quienes.get(norm(nombreAlimento || '')) || [])
      .map((id) => ({ id, name: nombrePorId.get(id), to: clientPath(id, 'nutricion') }))
      .filter((quien) => Boolean(quien.name));

  /* Los que se llaman casi igual: el duplicado que se coló, que es lo que esta
     pantalla prometía poder curar. Ver `similarNames`. */
  const parecidosA = (nombreAlimento) =>
    similarNames(
      nombreAlimento,
      todos.map((f) => f.name)
    );

  /* Lo borrado sale de la lista solo: la biblioteca local ya se refresca en
     `useLibraries`. Lo único que hace falta aquí es soltar la elección, o el
     carril se quedaría apuntando a un nombre que ya no está. */
  const trasBorrar = () => {
    setElegido(null);
    setAlta(null);
    setRevision((v) => v + 1);
  };

  /* La misma ficha en dos sitios —al lado o en capa—, así que el contenido se
     escribe una vez. La `key` con la revisión es lo que fuerza el remontaje. */
  const ficha = (
    <FichaAlimento
      key={`${alta ? '+nuevo' : actual?.name || ''}-${revision}`}
      alimento={alta || actual}
      nuevo={Boolean(alta)}
      enDietas={actual ? enDietasDe(actual.name) : []}
      parecidos={actual ? parecidosA(actual.name) : []}
      onCrearElMio={crearElMio}
      onIr={elegir}
      onCerrar={cerrarFicha}
      onBorrado={trasBorrar}
    />
  );

  return (
    <div className="stack cascada">
      <div className="taller libreria">
        <Cinta
          {...banda}
          accion={
            <button type="button" className="btn btn-primary btn-sm" onClick={() => abrirAlta()}>
              <Plus size={15} /> Nuevo alimento
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
                  placeholder="Buscar alimento…"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  aria-label="Buscar alimento"
                />
              </div>

              {/* La misma barra que la otra mitad de la librería, en el mismo
                  orden: de quién es y después de qué es. `rail-wrap` y no
                  `rail` por el motivo largo que está escrito en la otra mitad:
                  el `overflow` del carril recortaba el menú de «Categoría» y
                  pulsarlo no hacía nada. */}
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

                {categorias.length > 1 && <span className="rail-corte" aria-hidden="true" />}
                {/* Las categorías son diez y no caben; ver `SelectorDeGrupo`. */}
                <SelectorDeGrupo
                  titulo="Categoría"
                  opciones={categorias}
                  valor={categoria}
                  onElegir={setCategoria}
                />
              </div>
            </div>

            {visibles.length === 0 ? (
              <EmptyState
                icon={Apple}
                title="Aquí no hay nada todavía"
                message={
                  busca.trim()
                    ? `Ningún alimento se llama «${busca.trim()}».`
                    : 'Tu despensa se llena sola: cada alimento que eliges al montar una dieta se queda aquí con sus macros.'
                }
              />
            ) : (
              <div className="plantilla">
                <table>
                  <thead>
                    <tr>
                      <th scope="col" className="lib-nombre">
                        Alimento
                      </th>
                      <th scope="col" className="al-num">
                        kcal/100 g
                      </th>
                      <th scope="col" className="al-num">
                        P
                      </th>
                      <th scope="col" className="al-num">
                        HC
                      </th>
                      <th scope="col" className="al-num">
                        G
                      </th>
                      <th scope="col" className="al-oculta">
                        Unidad
                      </th>
                      <th scope="col" className="al-oculta">
                        Lleva
                      </th>
                      <th scope="col" className="al-num">
                        Dietas
                      </th>
                    </tr>
                  </thead>
                  {grupos.map(({ grupo, filas }) => (
                  <tbody key={grupo || '(sin categoría)'}>
                    {/* La cabecera del grupo, con su cuenta. `th` de `colgroup`
                        para que se pueda decir a qué categoría pertenece lo que
                        viene debajo. */}
                    <tr className="fila-grupo">
                      <th scope="colgroup" colSpan={8}>
                        {grupo || 'Sin clasificar'}
                        <span className="chip-count">{filas.length}</span>
                      </th>
                    </tr>
                    {filas.map((f) => (
                      <tr
                        key={f.id || f.name}
                        className={conCarril && actual?.name === f.name ? 'is-elegida' : ''}
                        aria-current={conCarril && actual?.name === f.name ? 'true' : undefined}
                        onClick={() => elegir(f.name)}
                      >
                        <td>
                          <span className="p-name f-nombre">
                            {/* Sigue siendo un botón aunque la fila entera
                                valga: es por donde entra el teclado, igual que
                                en la cartera. */}
                            <button
                              type="button"
                              className="p-abrir"
                              onClick={() => elegir(f.name)}
                            >
                              {f.name}
                            </button>
                            {/* ── De quién es, PEGADO AL NOMBRE ─────────────
                                Era la última columna de la tabla: una cápsula a
                                setecientos píxeles del nombre que califica, y
                                vacía en dos de cada tres filas —una columna
                                entera reservada para la excepción, que es
                                exactamente lo que le pasaba a «Lo tuyo» en los
                                ejercicios antes de bajar al renglón—. Con ella
                                fuera, la fila termina en la cifra de dietas, que
                                es un número y sabe alinearse. */}
                            {f.mio && <span className="badge badge-info">Tuyo</span>}
                            {/* Que le has puesto tu nota. Un glifo y no una
                                columna: es el equivalente de «Lo tuyo» en los
                                ejercicios y aquí solo hay una cosa que marcar. */}
                            {f.note && (
                              <StickyNote
                                size={15}
                                className="al-nota"
                                aria-label="Tiene tu nota"
                              />
                            )}
                          </span>
                        </td>
                        <td className="al-num">{kcal100(f)}</td>
                        <td className="al-num">{Number(f.proteinPer100) || 0}</td>
                        <td className="al-num">{Number(f.carbsPer100) || 0}</td>
                        <td className="al-num">{Number(f.fatsPer100) || 0}</td>
                        <td className="al-oculta">
                          {f.unitLabel ? `1 ${f.unitLabel} = ${f.unitGrams} g` : '—'}
                        </td>
                        {/* Lo que contiene. Nunca a quién se le puede dar: eso lo
                            decide el cruce con sus condicionantes, en la dieta. */}
                        <td className="al-oculta">
                          {(f.tags || []).length > 0 ? (
                            <span className="al-tags">
                              {f.tags.map((t) => (
                                <span key={t} className="badge">
                                  {FOOD_TAG_LABELS[t] || t}
                                </span>
                              ))}
                            </span>
                          ) : null}
                        </td>
                        {/* En cuántas dietas está. El cero se dice con un guion
                            y no con un «0»: es «en ninguna», no una medida que
                            valga cero. */}
                        <td className="al-num">{f.usos > 0 ? f.usos : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  ))}
                </table>
              </div>
            )}
          </div>

          {/* El segundo plano, con la misma gramática que el de `/ejercicios`:
              pegajoso, con su filete a la izquierda, y curar la despensa es
              recorrer la lista con la ficha delante. */}
          {conCarril && (
            <aside
              className="plano-ficha"
              aria-label={alta ? 'Nuevo alimento' : 'La ficha del alimento'}
            >
              {/* El nombre lo pone la FICHA desde que además se escribe: aquí
                  era un titular de 15 px y dos renglones más abajo el mismo
                  nombre otra vez, dentro de un campo. Lo único que queda es
                  decir qué estás haciendo cuando das de alta, que es lo que un
                  campo vacío no puede decir. */}
              {alta && <h2 className="plano-ficha-tit">Nuevo alimento</h2>}
              {ficha}
            </aside>
          )}
        </div>
      </div>

      {/* Sin sitio para el carril, la ficha vuelve a ser una capa. Solo cuando se
          ha tocado algo a propósito: `actual` no vale, porque ese elige el primero
          de la lista él solo y abriría una capa nada más entrar. */}
      {!hayCarril && (elegido || alta) && (
        <Modal
          size="side"
          title={alta ? 'Nuevo alimento' : elegido}
          onClose={() => {
            setAlta(null);
            setElegido(null);
          }}
        >
          <FichaAlimento
            alimento={alta || todos.find((f) => f.name === elegido) || null}
            nuevo={Boolean(alta)}
            enCapa
            enDietas={alta ? [] : enDietasDe(elegido)}
            parecidos={alta ? [] : parecidosA(elegido)}
            onCrearElMio={crearElMio}
            onIr={elegir}
            onCerrar={() => {
              setAlta(null);
              setElegido(null);
            }}
            onBorrado={trasBorrar}
          />
        </Modal>
      )}
    </div>
  );
};
