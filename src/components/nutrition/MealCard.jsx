import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, BookmarkPlus, ChevronDown, ClipboardPaste, Copy, CopyPlus, GripVertical, Pencil, Quote, Trash2, X } from 'lucide-react';

import {
  abreviarUnidad,
  claseDe,
  displayAsUnits,
  foodMacros,
  foodUnits,
  gramsFromUnits,
  hasUnits,
  macroError,
  mealTarget,
  optionMacros,
  optionName,
  unitsLabel,
} from '@/domain/nutrition';
import { canEditLibraryItem } from '@/domain/catalog';
import { equivalencesFor, racionDe } from '@/domain/foodEquiv';
import { grupoDe } from '@/domain/gruposEquiv';
import { coverageSaid, microSaid, sumMicros } from '@/domain/micros';
import { toNum, toNum0 } from '@/lib/num';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { BotonMas } from '@/components/ui/BotonMas';
import { IconoEquivalencia } from '@/components/ui/IconoEquivalencia';
import { Modal } from '@/components/ui/Modal';
import { Field, Notice, RenombrarEnSitio, SegmentedControl } from '@/components/ui/primitives';
import { AddFoodControl } from './AddFoodControl';
import { dibujoDeComida } from './dibujoDeComida';
import { FoodEquivalences } from './FoodEquivalences';
import { Desvio, MACRO_META } from './macros';
import { useOculto } from '@/components/Client/Oculto';

/**
 * La columna de cantidad mide 74 px contando la casilla, así que ahí no cabe
 * «cucharada». Se abrevian las medidas que tienen abreviatura reconocible y el
 * resto cae en «ud», que es lo que se entiende sin aprender nada.
 *
 * El nombre completo no se pierde: va en el `title` de la casilla —«2 huevos ·
 * 110 g»— y en la etiqueta que leen los lectores de pantalla.
 */
/* El dibujo de cada comida vive en `dibujoDeComida`: lo dibujan esta hoja y la
   comida del cliente, y para la misma palabra tienen que pintar lo mismo. */

/* La tabla de abreviaturas vive en el dominio (`abreviarUnidad`): la piden esta
   tabla y la del cliente, y es vocabulario de la nutrición, no de esta pieza. */
const abreviar = abreviarUnidad;

/**
 * Encabezado de la tabla de alimentos.
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 * Antes cada fila llevaba escrito «P 38  C 85  G 8». Con cinco alimentos eran
 * quince letras repetidas que no informaban de nada y que hacían leer las cifras
 * como texto en lugar de como una columna.
 *
 * Las etiquetas van una sola vez, aquí, y con el color de su macro: los mismos
 * del anillo de arriba, de modo que la tabla y el gráfico son el mismo lenguaje.
 */
const FoodTableHead = ({ editable, sinCifras = false }) => (
  <div className={`food-head${sinCifras ? ' sin-cifras' : ''}`} aria-hidden="true">
    {/* La primera columna es la del asa de arrastre y existe siempre —también al
        consultar, donde va vacía— para que la tabla del cliente y la del
        entrenador queden alineadas entre sí. */}
    <span />
    <span>Alimento</span>
    <span>Cantidad</span>
    {/* Las tres letras van en la tinta de cualquier otro encabezado de columna.
        El color de cada macro está ganado donde DISTINGUE una serie de otra —la
        barra del objetivo, el anillo del día, la gráfica—, y aquí no distingue
        nada: las columnas ya están separadas y rotuladas. Coloreadas eran la
        cuarta repetición de la misma leyenda en la misma pantalla. */}
    {/* Las cuatro cifras no existen para el cliente que las tiene ocultas: su
        menú se lee igual —alimento y cantidad— sin la columna que juzga. */}
    {!sinCifras &&
      MACRO_META.map(({ key, short }) => (
        <span key={key}>{short}</span>
      ))}
    {!sinCifras && <span>Kcal</span>}
    {/* Y la última es la de borrar, que solo existe al editar. */}
    {editable && <span />}
  </div>
);

const CELL = ['is-p', 'is-c', 'is-f'];

/* `Desvio` —lo que se paga por cambiar un alimento por otro— vive en `macros`:
   lo escriben esta tabla y la del cliente, y el juicio tiene que ser el mismo. */

/**
 * Un alimento: solo números, alineados con el encabezado.
 *
 * ── Gramos o unidades ──────────────────────────────────────────────────────
 * Un alimento con unidad definida (huevos, plátanos, rebanadas) se escribe y se
 * lee EN UNIDADES, porque es como se compra y como se come. Los gramos siguen
 * siendo lo que se guarda y lo que alimenta el cálculo de macros —la conversión
 * vive entera en `domain/nutrition.js`—, y aquí solo se eligen las palabras.
 *
 * El equivalente en gramos no desaparece: va en el `title` de la casilla. Hace
 * falta para quien sí pesa, y ocuparle una columna a algo que se consulta de
 * uvas a peras rompería la rejilla en el móvil.
 */
const FoodRow = ({
  food,
  editable,
  catalogFoods = [],
  libraryFoods = [],
  coachId = null,
  clientSwapsOn = false,
  /* Tus grupos de equivalencia. Sin ellos —el portal del cliente— la lista es
     la calculada de siempre. Ver `domain/gruposEquiv`. */
  grupos = [],
  onSaveGrupo = null,
  onRemoveGrupo = null,
  onSwap,
  onSetEquivalences,
  onGrams,
  onSetDisplay,
  onSetFixed,
  onEditFood,
  onMove,
  onRemove,
  first,
  last,
  dragging,
  dropTarget,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}) => {
  const macros = foodMacros(food);
  /* Ver `Client/Oculto.jsx`: en el portal del cliente al que su entrenador le
     oculta las kcal, la fila pierde sus cuatro cifras y la rejilla se reparte
     entre lo que queda (`.food-row.sin-cifras` en `trabajo.css`). */
  const oculto = useOculto();
  const sinCifras = oculto.nutrition && !editable;
  const [editando, setEditando] = useState(false);
  /* `false`, o cómo se abre la ventana: 'lista' o 'buscando' (con «+ alimento»
     ya puesto, desde el pie de las filas de abajo). */
  const [equivalenciasAbiertas, setEquivalenciasAbiertas] = useState(false);
  /* Si las equivalencias están desplegadas DEBAJO de esta fila. La ventana
     (`equivalenciasAbiertas`) es otra cosa y sigue viva: ver `equivFilas`. */
  const [equivAbajo, setEquivAbajo] = useState(false);
  const sePuede = hasUnits(food);
  const porUnidades = displayAsUnits(food);
  /*
    ¿Este alimento lo diste de alta TÚ? Es lo único que se puede corregir: los
    del catálogo son de referencia y se quedan como están, y la biblioteca es
    del EQUIPO. La regla entera —y por qué el catálogo va aparte de la lista
    mezclada— está en `canEditLibraryItem`.

    Se resuelve por NOMBRE, porque la entrada de la dieta es una copia congelada
    y no guarda de quién era el original. Ni debe: el original puede cambiar de
    manos o desaparecer y la copia sigue siendo la misma.
  */
  const mio = useMemo(
    () => canEditLibraryItem(food.name, { library: libraryFoods, catalog: catalogFoods, coachId }),
    [food.name, libraryFoods, catalogFoods, coachId]
  );

  /*
    ── Las equivalencias de este alimento ─────────────────────────────────────
    Se calculan aquí y no al abrir el diálogo porque deciden si hay botón: un
    icono que al pulsarlo dijera «no hay equivalencias» enseñaría a desconfiar
    de la pantalla. Memoizado sobre la entrada: solo se rehace al cambiar los
    gramos o el alimento, no en cada render de la comida.
  */
  /* Tu grupo manda sobre el catálogo: si este alimento está en uno, la lista
     son los que escribiste y ninguno más (`domain/gruposEquiv`). */
  const grupo = useMemo(
    () => grupoDe(food.name, grupos, catalogFoods),
    [food.name, grupos, catalogFoods]
  );

  const equivalencias = useMemo(
    () => (catalogFoods.length ? equivalencesFor(food, catalogFoods, libraryFoods, { grupo }) : null),
    [food, catalogFoods, libraryFoods, grupo]
  );

  /* La lista larga, la de marcar, la calcula la ventana y solo al marcar: es la
     familia entera del catálogo sin filtros, y calcularla en cada fila de cada
     comida sería pagarla diecisiete veces para no enseñarla. */

  /* Al cliente, un alimento excluido no le enseña botón: para él la lista no
     existe, no está «desactivada». El entrenador lo sigue viendo —es su
     herramienta— con el icono apagado, que es lo que deja ver de un barrido a
     qué alimentos les quitó el margen. */
  const conBoton = equivalencias && (editable || !food.equivHidden);

  // Lo que se enseña en la casilla y lo que significa al escribirlo.
  const valor = porUnidades ? foodUnits(food) : food.grams;
  const alEscribir = (raw) => onGrams(porUnidades ? gramsFromUnits(food, raw) : raw);

  // El equivalente en la OTRA medida, que es lo que se pierde de vista al elegir
  // una. Va en el `title` porque se consulta de uvas a peras y una columna más
  // rompería la rejilla en el móvil.
  const equivalencia = sePuede ? `${unitsLabel(food)} · ${food.grams} g` : undefined;

  const row = (
    <div
      className={`food-row${sinCifras ? ' sin-cifras' : ''}${equivAbajo && equivalencias ? ' con-equiv-abiertas' : ''}${dropTarget ? ' is-drop-target' : ''}${dragging ? ' is-dragging' : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/*
        Reordenar es exactamente el mismo gesto que en la lista de ejercicios
        (`Coach/Workout/ExerciseList.jsx`): un asa al principio, arrastre desde
        ella y Alt + flechas para quien no use el ratón.

        Se arrastra SOLO desde el asa, no desde la fila entera: con la fila
        arrastrable el gesto compite con escribir en la casilla de cantidad, y a
        veces no se puede teclear. Ese problema ya se resolvió una vez en la
        rutina; repetir la solución es más barato que volver a descubrirlo.
      */}
      {editable && onMove && (
        <button
          type="button"
          className="drag-handle"
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onKeyDown={(e) => {
            if (!e.altKey) return;
            if (e.key === 'ArrowUp' && !first) {
              e.preventDefault();
              onMove(-1);
            } else if (e.key === 'ArrowDown' && !last) {
              e.preventDefault();
              onMove(1);
            }
          }}
          aria-label={`Reordenar ${food.name}. Alt y flechas para mover.`}
          title="Arrastra para reordenar (o Alt + ↑/↓)"
        >
          <GripVertical size={15} />
        </button>
      )}

      {/* En táctil el arrastre no dispara: las flechas son EL camino (ver
          `.touch-reorder`). Reclaman su propia fila en el reflujo del móvil. */}
      {editable && onMove && (
        <span className="touch-reorder">
          <button
            type="button"
            className="btn btn-icon btn-icon-compact"
            disabled={first}
            onClick={() => onMove(-1)}
            aria-label={`Subir ${food.name}`}
          >
            <ArrowUp size={15} />
          </button>
          <button
            type="button"
            className="btn btn-icon btn-icon-compact"
            disabled={last}
            onClick={() => onMove(1)}
            aria-label={`Bajar ${food.name}`}
          >
            <ArrowDown size={15} />
          </button>
        </span>
      )}

      {/*
        ══ El hueco del asa existe SIEMPRE ═══════════════════════════════════

        Sin esto, cuando no hay asa —la vista del cliente, que no reordena nada—
        no se pintaba nada en la primera celda, y la rejilla corre a los hijos una
        posición: el NOMBRE caía en la columna de 20 px del asa y se quedaba en
        «C…», mientras la suya se la llevaba la cantidad.

        Es el mismo hueco vacío que ya pinta `FoodTableHead` por el mismo motivo,
        y por eso las dos tablas quedan alineadas entre sí. Que el fallo solo se
        viera «como cliente» es exactamente lo que costó encontrarlo: en la
        pantalla del entrenador el asa ocupa su celda y todo cuadra.
      */}
      {!(editable && onMove) && <span aria-hidden="true" />}

      <span className="name">
        <span className="txt">{food.name}</span>
        {/*
          Las equivalencias, pegadas al nombre: son OTRA forma de decirlo
          («150 g de plátano», «250 g de manzana»), no una acción sobre la fila,
          y por eso no viven con borrar ni con la cantidad. El botón solo existe
          cuando hay lista que enseñar — también al consultar, que es donde el
          cliente resuelve «no tengo plátanos» sin escribir a nadie.
        */}
        {/*
          ══ Y AHORA EL BOTÓN ABRE LAS FILAS, NO LA VENTANA ═══════════════════

          Saber por qué se puede cambiar un alimento costaba abrir un diálogo con
          velo, leerlo y cerrarlo — por CADA alimento, y el cliente en la
          frutería tiene diecisiete. Las tres primeras raciones caben debajo, en
          la misma rejilla y sin tapar nada, que es donde de verdad se consultan.

          La ventana no desaparece: se queda para lo que sí es una decisión —
          «Usar» esta ración en la dieta, y si el cliente ve esta lista—, y se
          entra por el verbo del pie. Ver `equivFilas` más abajo.
        */}
        {/*
          ══ EL SIGNO Y CUÁNTAS ═══════════════════════════════════════════════
          Las flechas del intercambio (ver `IconoEquivalencia`) con el número de
          raciones detrás: el número dice ANTES de pulsar si hay una salida o
          doce, que es lo que el glifo a secas obligaba a abrir para saber.
          Desplegado se queda encendido, para que se vea de qué alimento cuelgan
          las filas.
        */}
        {conBoton && (
          <button
            type="button"
            className={`equiv-marca${editable && food.equivHidden ? ' is-off' : ''}`}
            onClick={() => setEquivAbajo((v) => !v)}
            aria-expanded={equivAbajo}
            aria-label={`${equivalencias.items.length} equivalencias de ${food.name}`}
            title={editable && food.equivHidden ? 'Equivalencias (el cliente no las ve)' : 'Equivalencias'}
          >
            <IconoEquivalencia size={13} />
            <span>{equivalencias.items.length}</span>
          </button>
        )}

        {/*
          Corregir el alimento. Aquí, pegado al nombre, porque lo que se corrige
          es QUÉ ES este alimento —sus macros por 100 g, su unidad—, no cuánto
          hay de él en esta comida, que es la columna de al lado.

          Sin esto un macro mal tecleado no tenía vuelta atrás: el alimento solo
          se podía tocar al crearlo, y volver a añadirlo devolvía de la
          biblioteca la misma cifra equivocada. Ver `FoodDialog`.
        */}
        {editable && onEditFood && mio && (
          <button
            type="button"
            className="btn btn-plain btn-icon btn-icon-compact"
            onClick={() => setEditando(true)}
            aria-label={`Editar ${food.name}`}
            title="Editar macros y unidad"
          >
            <Pencil size={13} />
          </button>
        )}
      </span>

      <span className="grams" title={equivalencia}>
        {editable ? (
          /*
            ══ LA CANTIDAD Y SU MEDIDA SON UNA SOLA CAJA ═══════════════════════

            Y no dos, que es de donde venían todos los problemas de esta celda.

            Primero fue un `<select>` nativo: caja con flecha, menú pintado por el
            SISTEMA —un rectángulo de Windows en medio de una tabla oscura— y un
            clic de más para elegir entre dos cosas. Después un conmutador con
            las dos opciones a la vista, y ahí aparecieron dos fallos peores: dos
            recuadros distintos en una celda de 112 px, y sobre todo que la
            columna dejaba de estar alineada porque «vaso» es más ancho que «ud».

            El error de fondo era tratar esto como un CONTROL cuando el 95 % del
            tiempo es un DATO: la unidad de un alimento se decide una vez, al
            añadirlo, y a partir de ahí solo se lee. Lo que hay que enseñar es
            «100 g» y «1 ud», no un selector permanente por fila.

            Así que la medida se mete DENTRO del campo, que es el patrón que esta
            misma pantalla ya usa dos tarjetas más arriba —«9000 pasos»— y el que
            usa el resto del producto (`.input-suffix`). Una caja por fila, todas
            del mismo ancho, nada que desalinear, y la unidad donde se lee sin
            mover el ojo.

            Cuando hay algo que elegir, esa medida es un botón que conmuta —dos
            opciones no necesitan un menú— y lleva fondo para que se note que se
            puede pulsar. Cuando no lo hay, es texto gris: mismo sitio, misma
            silueta, sin prometer una acción que no existe.
          */
          <span className="input-suffix cantidad">
            <input
              type="text"
              inputMode="decimal"
              className="input input-sm"
              value={valor ?? ''}
              onChange={(e) => alEscribir(e.target.value)}
              aria-label={
                porUnidades ? `${food.unitLabel} de ${food.name}` : `Gramos de ${food.name}`
              }
            />
            {sePuede ? (
              <button
                type="button"
                className="ud"
                onClick={() => onSetDisplay(porUnidades ? 'grams' : 'units')}
                title={
                  porUnidades
                    ? `Contarlo en gramos${equivalencia ? ` · ${equivalencia}` : ''}`
                    : `Contarlo en ${food.unitLabel}${equivalencia ? ` · ${equivalencia}` : ''}`
                }
                aria-label={`Medida de ${food.name}: ${
                  porUnidades ? food.unitLabel : 'gramos'
                }. Cambiar a ${porUnidades ? 'gramos' : food.unitLabel}`}
              >
                {porUnidades ? abreviar(food.unitLabel) : 'g'}
              </button>
            ) : (
              <span aria-hidden="true">g</span>
            )}
          </span>
        ) : (
          <span className="fixed">{valor}</span>
        )}

        {/*
          ── Y «Definir unidad…» ya no está en ninguna parte de esta celda ────
          Estaba dentro del desplegable original, y era la razón de que hubiera
          un desplegable: una ACCIÓN metida entre dos medidas, que además
          obligaba a un ancho fijo para que su texto largo no empujara la
          casilla fuera de la rejilla.

          No hacía falta: definir la unidad abre `FoodDialog`, que es justo lo
          que hace el lápiz que esta misma fila ya lleva al lado del nombre
          —«Editar macros y unidad»—. Dos puertas a la misma pantalla, y una de
          ellas deformaba la tabla. De paso desaparece un fallo latente: esa
          opción se pintaba con `mio` a secas, y guardar el diálogo llama a
          `onEditFood`, que en la vista del cliente no existe.
        */}
        {/* Al consultar no hay campo: la medida es una palabra gris detrás de la
            cifra, que es como se lee un plan que no se toca. */}
        {!editable && (
          <span className="unit">{porUnidades ? abreviar(food.unitLabel) : 'g'}</span>
        )}
      </span>

      {!sinCifras &&
        MACRO_META.map(({ key, short, label }, index) => (
          <span
            key={key}
            className={`n ${CELL[index]}`}
            data-macro={short}
            aria-label={`${label} de ${food.name}`}
          >
            {Math.round(macros[key])}
          </span>
        ))}

      {!sinCifras && <span className="kcal">{Math.round(macros.kcal)}</span>}

      {editable && (
        <button
          type="button"
          className="btn btn-icon btn-icon-compact btn-icon-danger del"
          onClick={onRemove}
          aria-label={`Quitar ${food.name}`}
        >
          <X size={13} />
        </button>
      )}
    </div>
  );

  /*
    ══ LAS EQUIVALENCIAS, DEBAJO Y EN LA MISMA REJILLA ════════════════════════

    Filas hijas de `.food-row`, no una tabla aparte: así la ración cae bajo la
    columna de cantidad y el nombre bajo el nombre, y la comida se sigue leyendo
    como una sola tabla. Las cifras van con la ración porque la gracia está en
    lo que se conserva y en lo que se paga —«61 g de proteína, +2»—; sin ellas
    la lista parecería salida de una tabla mágica.

    TRES y no las doce que calcula `equivalencesFor`: aquí se viene a ver que
    hay salida, no a comparar el grupo entero. Las demás siguen en la ventana,
    detrás del verbo del pie, que además es donde se «usa» una.
  */
  const equivFilas =
    equivAbajo && equivalencias
      ? (() => {
          const macro = MACRO_META.find((m) => m.key === equivalencias.macro);
          const nombreMacro = (macro?.label || '').toLowerCase();
          /* Tres, porque aquí se viene a ver que HAY SALIDA, no a comparar el
             grupo entero del catálogo. Con un grupo TUYO no: esa lista la
             podaste tú y es corta por construcción, así que cortarle la cola
             sería esconder la mitad de una decisión que ya está tomada. */
          const primeras = equivalencias.grupo ? equivalencias.items : equivalencias.items.slice(0, 3);
          const restan = equivalencias.items.length - primeras.length;
          return (
            <div className="equiv-hijas" role="group" aria-label={`Equivalencias de ${food.name}`}>
              {primeras.map((item) => (
                /*
                  ══ UNA CAJA, NO UNA FILA DE LA TABLA (frame 64:183) ══════

                  Colgaban de la rejilla del padre: el ≈ en la columna del
                  asa, el nombre bajo el nombre, la ración bajo la cantidad.
                  Leía bien de lejos y mal de cerca — una equivalencia no
                  tiene P, C, G ni kcal que poner en esas columnas, así que
                  media tabla se quedaba en blanco y las dos cifras que sí
                  tiene («28 g de carbos · 119 kcal») acababan volcadas al
                  otro canto, lejos de la palabra que describen.

                  El frame las saca de la rejilla y las hace cajas blancas
                  sobre la banda de acento, con lo que dicen junto: qué es,
                  cuánto es y qué aporta. Lo que las ata al alimento de
                  arriba es el RAÍL de la izquierda.
                */
                <div
                  className={"equiv-fila" + (sinCifras ? " sin-cifras" : "")}
                  key={item.food.id || item.food.name}
                >
                  <span className="equiv-nombre">
                    {item.food.name}
                    {/*
                      ── EL VERBO, AQUÍ MISMO ────────────────────────────
                      Cambiar un alimento por su equivalente exigía abrir la
                      ventana, buscar la misma fila que ya estabas leyendo y
                      pulsar «Usar». Con la ración delante, el gesto es el de
                      la casa: la caja se enciende y el verbo aparece en azul
                      (ver `ley-de-los-gestos`).
                    */}
                    {editable && onSwap && (
                      <button
                        type="button"
                        className="equiv-usar"
                        onClick={() => onSwap(item)}
                        aria-label={`Cambiar ${food.name} por ${racionDe(item)} de ${item.food.name}`}
                      >
                        Usar
                      </button>
                    )}
                  </span>
                  {/* La ración, entre rayas: es la medida de ESTA
                      equivalencia, no una columna. Las rayas las pone el CSS. */}
                  <span className="equiv-racion">{racionDe(item, { corta: true })}</span>
                  {!sinCifras && (
                    <span className="equiv-cifras">
                      <b>
                        {item.macroGrams} g de {nombreMacro}
                      </b>
                      <Desvio diff={item.macroDiff} de={item.macroGrams - item.macroDiff} campo={equivalencias.macro} />
                      <span className="sep">·</span>
                      {item.kcal} kcal
                      <Desvio diff={item.kcalDiff} de={item.kcal - item.kcalDiff} campo="kcals" />
                    </span>
                  )}
                </div>
              ))}
              {/* El pie: la ventana, que es donde se elige una y donde se decide
                  si el cliente ve la lista; y «+ alimento», que abre esa misma
                  ventana con el buscador puesto para meter uno a mano. */}
              <div className="equiv-hijas-pie">
                <button type="button" className="equiv-hijas-mas" onClick={() => setEquivalenciasAbiertas('lista')}>
                  {restan > 0
                    ? `Ver las ${equivalencias.items.length} y ${editable ? 'cambiar' : 'sus cifras'}`
                    : editable
                      ? 'Cambiar por una de estas'
                      : 'Ver sus cifras'}
                </button>
                {editable && onSaveGrupo && (
                  /* «equivalencia» y no «alimento»: dos filas más abajo está el
                     «+ alimento» de la comida, que hace otra cosa. */
                  <BotonMas
                    palabra="equivalencia"
                    onClick={() => setEquivalenciasAbiertas('buscando')}
                    title={`Meter a mano un alimento que valga por ${food.name.toLowerCase()}`}
                  />
                )}
              </div>
            </div>
          );
        })()
      : null;

  return (
    <>
      {row}
      {equivFilas}
      {editando && (
        <FoodDialog
          food={food}
          onClose={() => setEditando(false)}
          onSetDisplay={onSetDisplay}
          onSetFixed={onSetFixed}
          onSave={(cambios) => {
            onEditFood(cambios);
            setEditando(false);
          }}
        />
      )}
      {equivalenciasAbiertas && equivalencias && (
        <FoodEquivalences
          food={food}
          equivalences={equivalencias}
          clientSwapsOn={clientSwapsOn}
          /* Sin `onSwap` el diálogo es de solo lectura, que es la vista del
             cliente: su plan es lo estipulado y aquí no hay nada que cambie. */
          onSwap={
            editable && onSwap
              ? (item) => {
                  onSwap(item);
                  setEquivalenciasAbiertas(false);
                }
              : null
          }
          onSetVisible={editable && onSetEquivalences ? onSetEquivalences : null}
          grupos={grupos}
          catalogFoods={catalogFoods}
          libraryFoods={libraryFoods}
          abrirBuscando={equivalenciasAbiertas === 'buscando'}
          onSaveGrupo={editable ? onSaveGrupo : null}
          onRemoveGrupo={editable ? onRemoveGrupo : null}
          onClose={() => setEquivalenciasAbiertas(false)}
        />
      )}
    </>
  );
};

/**
 * Corregir un alimento sin salir de la dieta: sus macros y cómo se cuenta.
 *
 * ── Por qué aquí y no en una pantalla de biblioteca ─────────────────────────
 * Porque no existe una: un alimento solo se podía tocar EN EL MOMENTO DE
 * CREARLO —las casillas de `AddFoodControl`— y a partir de ahí quedaba
 * congelado. Quien tecleaba «135» donde iban «13,5» no tenía ningún camino de
 * vuelta, y quitarlo y volverlo a añadir tampoco servía: lo que vuelve de la
 * biblioteca es exactamente lo que se guardó mal.
 *
 * Y este es además el sitio donde uno se da cuenta: montando la dieta, viendo
 * unas kcal que no cuadran, no administrando una lista.
 *
 * También es la puerta de la unidad para un alimento dado de alta antes de que
 * existieran las unidades —o con un nombre que no está en la lista de la 0030,
 * como «Huevos enteros frescos»—, que era lo único que este diálogo hacía
 * antes. Es la misma pregunta —«qué es este alimento»— y por eso es un solo
 * diálogo y no dos.
 *
 * ── Escribe en DOS sitios, y es deliberado ──────────────────────────────────
 *   1. **La entrada abierta**, para que el cambio se vea al instante. No es un
 *      atajo: una entrada de dieta es una FOTO del alimento (ver
 *      `buildFoodEntry`) y no se recalcula sola cuando cambia la biblioteca.
 *   2. **La biblioteca**, para no repetir la corrección cada vez que se añada.
 *
 * Y esa misma foto es el motivo de que las OTRAS dietas que ya llevan este
 * alimento se queden como estaban. Es a propósito —corregir un alimento no
 * puede reescribirle la dieta a veinte clientes a sus espaldas— y significa que
 * ahí la corrección hay que repetirla.
 */
const FoodDialog = ({ food, onClose, onSetDisplay, onSetFixed, onSave }) => {
  /* Como texto y no como número: son casillas, y mientras se escribe hay que
     poder distinguir «0» de «vacío» (ver `toNum` en `lib/num.js`). */
  const [macros, setMacros] = useState(() =>
    Object.fromEntries(MACRO_META.map(({ key }) => [key, String(food[`${key}Per100`] ?? '')]))
  );
  const [label, setLabel] = useState(food.unitLabel || '');
  const [grams, setGrams] = useState(food.unitGrams || '');

  const errores = Object.fromEntries(MACRO_META.map(({ key }) => [key, macroError(macros[key])]));
  const hayError = Object.values(errores).some(Boolean);

  const limpio = label.trim();
  const gramos = toNum(grams);
  const unidadValida = limpio.length > 0 && gramos !== null && gramos > 0;
  /* Sin etiqueta se le QUITA la unidad al alimento, y las dos columnas viajan
     juntas o no viaja ninguna (CHECK de la 0030): vaciar solo la etiqueta y
     dejar los gramos huérfanos lo rechaza la base. Con etiqueta escrita, los
     gramos son obligatorios; sin ella, sobran. */
  const unidadCompleta = unidadValida || limpio.length === 0;
  const valido = !hayError && unidadCompleta;

  /* Lo que se va a guardar, ya en números. Es también lo que alimenta la
     previsualización de abajo, así que lo que se lee ahí es exactamente lo que
     se escribe al pulsar Guardar. */
  const cambios = {
    ...Object.fromEntries(MACRO_META.map(({ key }) => [`${key}Per100`, toNum0(macros[key])])),
    unitLabel: unidadValida ? limpio : null,
    unitGrams: unidadValida ? gramos : null,
  };

  const antes = foodMacros(food);
  const despues = foodMacros({ ...food, ...cambios });
  const cambiaKcal = Math.round(antes.kcal) !== Math.round(despues.kcal);
  const cambiaUnidad =
    unidadValida && (limpio !== (food.unitLabel || '') || gramos !== toNum(food.unitGrams));

  const guardar = (e) => {
    e.preventDefault();
    if (valido) onSave(cambios);
  };

  return (
    <Modal
      title={`Editar ${food.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form="food-form" className="btn btn-primary" disabled={!valido}>
            Guardar
          </button>
        </>
      }
    >
      {/* El `form` va dentro del cuerpo y los botones en el pie del diálogo, así
          que se enlazan por `form="food-form"`. Es lo que permite que Enter
          guarde desde cualquiera de los campos sin duplicar el manejador. */}
      <form id="food-form" className="col gap-4" onSubmit={guardar}>
        {/*
          ── Los macros, primero ──────────────────────────────────────────────
          Es lo que trae aquí a casi todo el mundo: la cifra que se tecleó mal.
          Van con el color de su macro, el mismo del anillo y de la cabecera de
          la tabla, para que se lean como las tres columnas de las que salen.
        */}
        <div className="row-end wrap gap-2">
          {MACRO_META.map(({ key, label: nombre, color }) => (
            <Field
              key={key}
              /* El nombre entero y con el color de su macro: los mismos del
                 anillo y de la cabecera de la tabla, para que las tres casillas
                 se lean como las tres columnas de las que salen. Aquí hay sitio
                 para escribirlo; en la fila de la tabla no lo hay. */
              label={
                <>
                  <span style={{ color }}>{nombre}</span> /100 g
                </>
              }
              error={errores[key]}
              className="grow"
            >
              {(props) => (
                <input
                  {...props}
                  type="text"
                  inputMode="decimal"
                  className="input input-center"
                  value={macros[key]}
                  onChange={(e) => setMacros({ ...macros, [key]: e.target.value })}
                  aria-label={`${nombre} por 100 g de ${food.name}`}
                />
              )}
            </Field>
          ))}
        </div>

        {/*
          Elegir la medida solo tiene sentido cuando hay dos entre las que
          elegir. Con el alimento sin unidad definida, aquí no hay nada que
          elegir.

          Cambiar de medida se aplica al momento y cierra: es una elección, no
          algo que haya que confirmar. Guardar, en cambio, escribe en la
          biblioteca y sí pasa por el botón.
        */}
        {hasUnits(food) && (
          <Field label="Contar este alimento en">
            <SegmentedControl
              value={displayAsUnits(food) ? 'units' : 'grams'}
              onChange={(mode) => {
                onSetDisplay(mode);
                onClose();
              }}
              options={[
                { id: 'grams', label: 'Gramos' },
                { id: 'units', label: `${food.unitLabel}s` },
              ]}
              label="Medida"
            />
          </Field>
        )}

        {/*
          ══ Y si este alimento se mueve o no al ajustar ═════════════════════

          El recorte de un ajuste sale de una cesta —cereales, tubérculos,
          legumbres y dulces para los hidratos—, y eso acierta el caso normal.
          Lo que no acierta es lo de cada persona: el plátano de después de
          entrenar, el aceite de la ensalada, los 30 g de avena que son el
          desayuno entero de alguien.

          Va aquí, pegado a la medida, porque es la misma clase de decisión
          —cómo se comporta ESTE alimento en ESTA dieta— y con el mismo
          precedente: lo que se cuenta por unidades ya es un alimento fijo, solo
          que hoy lo decide la aplicación.

          Se aplica al momento, como la medida: es una elección, no algo que
          haya que confirmar.
        */}
        {onSetFixed && (
          <label className={`switch-row${food.fijo === true ? ' is-on' : ''}`}>
            <span className="col" style={{ gap: 1, minWidth: 0 }}>
              <span className="t-sm" style={{ fontWeight: 600 }}>
                No lo muevas al ajustar
              </span>
              <span className="t-xs t-tertiary">
                Al reajustar el menú a otro objetivo, este alimento se queda con sus{' '}
                {toNum0(food.grams)} g.
              </span>
            </span>
            {/*
              `pick-input` es lo que saca de la vista al input de verdad
              dejándolo en el árbol de accesibilidad; sin él, esta fila pintaba
              la casilla nativa del navegador Y el carril dibujado, o sea dos
              mandos para el mismo ajuste. Se vio al enderezar el renglón.
            */}
            <input
              type="checkbox"
              role="switch"
              className="pick-input"
              checked={food.fijo === true}
              onChange={(e) => onSetFixed(e.target.checked)}
            />
            <span className="track" aria-hidden="true" />
          </label>
        )}

        {/*
          Los dos campos de la unidad, en rejilla de dos columnas y ambos al
          ancho de su celda.

          Antes era una fila flexible con el segundo a 90 px fijos: el primero
          crecía, el segundo no, y quedaban de tamaños distintos y sin alinear
          entre sí. Aquí son dos mitades iguales, que es lo que hace que se lean
          como un par —«esto se cuenta en X» y «una X pesa Y»—.
        */}
        <div className="grid-2">
          <Field
            label="Se cuenta en (opcional)"
            /*
              Los ejemplos van de lo general a lo concreto: «unidad» sirve para
              casi todo —un huevo, una manzana, un yogur— y es la que más se va a
              escribir. Las otras dos cubren los dos casos que NO son piezas: lo
              que se sirve con cuchara y lo que se corta en rodajas.

              Antes ponía «ramillete», que es exacto para el brócoli y no le
              sugiere nada a quien está dando de alta arroz.
            */
            hint="En singular: unidad, cucharada, rebanada, lata, vaso…"
          >
            {(props) => (
              <input
                {...props}
                className="input"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                /*
                  Neutro a propósito. Ponía «huevo», y este diálogo lo abre
                  cualquier alimento: leer «Editar Brócoli → huevo» hace dudar de
                  si el campo está relleno o de si la aplicación se ha equivocado
                  de alimento.
                */
                placeholder="Se pesa en gramos"
              />
            )}
          </Field>

          <Field
            label="Gramos por unidad"
            hint="Lo que pesa una, en crudo."
            error={limpio && !unidadValida ? 'Hace falta el peso de una.' : null}
          >
            {(props) => (
              <input
                {...props}
                type="text"
                inputMode="decimal"
                className="input"
                value={grams}
                onChange={(e) => setGrams(e.target.value)}
                // Sin etiqueta este número no significa nada, igual que en el
                // alta (`AddFoodControl`): las dos columnas van juntas.
                disabled={!limpio}
              />
            )}
          </Field>
        </div>

        {/*
          Lo que va a pasar con ESTE alimento y sus gramos actuales, antes de
          guardar. Es lo que convierte unas casillas en una decisión: se ve al
          momento si el 135 que se acaba de corregir era de verdad el error —las
          kcal caen a la décima parte— o si 55 es el peso de una pieza.
        */}
        <Notice tone={valido ? 'info' : 'warn'}>
          {!valido ? (
            'Revisa lo que está marcado en rojo: así no se puede guardar.'
          ) : (
            <>
              {cambiaKcal && (
                <>
                  Los <strong>{food.grams} g</strong> de esta comida pasan de{' '}
                  <strong>{Math.round(antes.kcal)}</strong> a{' '}
                  <strong>{Math.round(despues.kcal)} kcal</strong>.{' '}
                </>
              )}
              {cambiaUnidad && (
                <>
                  1 {limpio} = {gramos} g, así que se leerán como{' '}
                  <strong>{unitsLabel({ ...food, unitLabel: limpio, unitGrams: gramos })}</strong>.{' '}
                </>
              )}
              Se guarda en esta comida y en tu biblioteca. Las dietas que ya llevan este alimento se
              quedan como están.
            </>
          )}
        </Notice>
      </form>
    </Modal>
  );
};

/**
 * Una comida de la hoja de dieta.
 *
 * ══ La forma, la misma que un ejercicio en la hoja de Entreno ═══════════════
 *
 *     1  Comida 1                      2 opciones · 908 kcal              ···
 *        OBJETIVO  [900] kcal  [40] P  [140] C  [20] G
 *        + nota para el cliente
 *        Opción 1 908 · Opción 2 966 · + alternativa                     ···
 *        ALIMENTO            CANTIDAD      P     C     G   KCAL
 *        Avena                80 g        11    53     6    320
 *        …
 *        Suma                             37/40 138/140 23/20 908/900
 *        + alimento
 *
 * Antes cada comida era una tarjeta con seis iconos, un carril de chips, un
 * anillo de 86 px y cuatro barras de objetivo: dos pantallas por comida. Ahora
 * es una sección de la hoja con un número, un nombre, una línea de objetivo, sus
 * opciones como pestañas y la tabla; lo que se compara —lo puesto contra lo
 * pedido— va en la fila de SUMA de la propia tabla, cifra a cifra y en color.
 *
 * ── Dónde vive cada acción ──────────────────────────────────────────────────
 *   · Sobre la COMIDA (copiar, eliminar): iconos en su cabecera. Renombrar es
 *     tocar el nombre y mover es arrastrar por el asa: ninguno necesita botón.
 *   · Sobre la OPCIÓN abierta (pegar, duplicar, copiar, guardar como plato,
 *     quitar): iconos en la fila de las pastillas.
 *   · El objetivo de la comida se escribe aquí, en su línea, y no en una tabla
 *     aparte: es de esta comida.
 *
 * El cliente (`editable=false`) ve lo mismo sin mandos: su comida, su nota, sus
 * opciones y, si su entrenador fijó un objetivo, el anillo de lo estipulado.
 */
/* Puesto contra pedido. El margen —y su suelo— lo pone el dominio: aquí vivía
   una copia del 5 % pelado, y con ella una comida de 4 g de grasa pautados no
   podía estar en verde nunca. Ver `estadoDe` en `domain/nutrition.js`. */

/*
  ══ Las acciones, a la vista y con icono, como en la hoja de Entreno ═════════
  Nada dentro de un «···»: lo que se le hace a una comida (copiar, eliminar) y a
  la opción abierta (pegar, duplicar, copiar, guardar como plato, quitar) son
  iconos en su fila, atenuados hasta pasar por encima.
*/
/*
  ── AQUÍ VIVÍA «COPIAR A…», Y SE HA IDO ─────────────────────────────────────
  Un ⇄ en la fila de la alternativa que abría la lista de días y la copiaba a la
  comida que se llamara igual en el elegido. Se quedó cuando el de la comida se
  fue, y con una razón escrita: la mano no sabía llevar una alternativa suelta,
  así que era el único camino que tenía una ración para salir de su comida.

  Ya lo sabe (`TIPO.PLATO`), y entonces esto era el camino PEOR de los dos: solo
  llegaba a los días de esta persona, elegía la comida de destino por su cuenta
  —la que se llamara igual— y no pasaba por la mano, así que no se podía ver lo
  que llevabas ni cuadrarlo al objetivo de donde cae.

  En su lugar, los dos verbos de siempre: ⧉ copia la ración al portapapeles y el
  pegar de la fila la mete como una alternativa más de ESTA comida.
*/
const Accion = ({ icon: Icon, label, onClick, danger = false }) => (
  <button
    type="button"
    className={`btn btn-icon btn-icon-compact${danger ? ' btn-icon-danger' : ''}`}
    onClick={onClick}
    aria-label={label}
    title={label}
  >
    <Icon size={13} />
  </button>
);

export const MealCard = ({
  meal,
  editable = false,
  foodLibrary = [],
  catalogFoods = [],
  coachId = null,
  clientSwapsOn = false,
  onSwapFood,
  onSetEquivalences,
  onRenameMeal,
  onRemoveMeal,
  onAddOption,
  onRemoveOption,
  onRenameOption = null,
  /* Si esta comida nace plegada. El portal del cliente pliega todas menos la
     primera; montando, ninguna. Ver el bloque «PLEGAR LA COMIDA». */
  plegadaAlInicio = false,
  onAddFood,
  /* Tus platos: la ración guardada con nombre. `onAddPlato` la despliega aquí y
     `onSavePlato` guarda esta opción como una. Sin ellos, la comida se comporta
     exactamente como antes — el portal del cliente no los pasa. */
  platos = [],
  onAddPlato = null,
  onSavePlato = null,
  /* Tus grupos de equivalencia: qué vale por qué, dicho por ti. Se montan desde
     la ventana de un alimento, que es donde se ve la lista que sobra. */
  grupos = [],
  onSaveGrupo = null,
  onRemoveGrupo = null,
  onRemoveFood,
  onGrams,
  onSetDisplay,
  /* El alimento que no se mueve al ajustar. Ver el mando en `FoodDialog`. */
  onSetFixed = null,
  onEditFood,
  onMoveFood,
  /* Copiar la comida al PORTAPAPELES, y es el ÚNICO verbo de copiar que le
     queda a la comida. Al lado había dos que hacían copiar-y-pegar de un tirón
     —duplicarla aquí y llevarla al otro día—; los dos son esto mismo con el
     destino cableado, y por eso ninguno llegaba a otra persona. Ver la fila de
     `.comida-acciones` y `lib/portapapeles`. */
  onCopiarComida,
  /*
    ── LO QUE SE LLEVA, PARA QUE ENTRE AQUÍ COMO ALTERNATIVA ─────────────────
    `enMano` es la pieza copiada y `onPegarEnMano()` la mete en esta comida, que
    conserva su nombre y su sitio. Son las dos formas de la dieta que caben
    dentro de una comida y el gesto es el mismo:

      · una COMIDA entera mete todas sus alternativas (`pegarComoOpcion`);
      · un PLATO es una sola ración y entra como una más, cuadrada al objetivo
        si se sale (`pegarPlato`).

    Y llega UNA, no dos: cuál se pega lo decide la mano con la ley de siempre
    —lo último copiado, la misma que ⌘V—, y no esta fila ofreciendo dos pegares
    seguidos que habría que distinguir por el orden.

    Sale solo mientras se lleva algo, que es la ley del reposo de la casa; y como
    todo lo de aquí, solo si llega su manejador: en el portal del cliente no
    llega.
  */
  enMano = null,
  onPegarEnMano = null,
  /* «Estoy trabajando en esta comida»: lo que ⌘C copia. Se avisa al entrar el
     cursor —con el ratón o con el tabulador—, que es lo mismo que hace la hoja
     de series con el ejercicio en foco. Ver `useAtajosDeCopia`. */
  onFoco = null,
  onDuplicateOption,
  /*
    ── COPIAR ESTA ALTERNATIVA AL PORTAPAPELES ──────────────────────────────
    Aquí había un «copiar a otro día» y su razón para seguir vivo: la pieza más
    pequeña que sabía llevar la dieta era una comida entera con todas sus
    opciones, así que una ración suelta no tenía cómo salir de aquí.

    Ya la tiene. Lo que se lleva es EL PLATO —una ración con su nombre, la misma
    forma que se guarda en la vitrina— y dónde cae lo dice el destino: otra
    comida de este día, la de otro día, la de otra persona. Ver `copiarPlato`.
  */
  onCopiarPlato = null,
  onNote = () => {},
  /* El arrastre entre comidas lo lleva la hoja (`NutritionModule`), como el de
     los ejercicios lo lleva `HojaDeSeries`: aquí solo se pinta el asa y se
     obedece. `{ dragging, dropTarget, onDragStart, onDragEnd, onDragOver,
     onDragLeave, onDrop }`. */
  arrastre = null,
  /* Encendida porque lo que se está arrastrando desde la mano cae AQUÍ DENTRO
     —como otra alternativa—, que no es lo mismo que el filo de arriba con el
     que se reordena: uno dice «entra en ésta» y el otro «va antes que ésta».
     Ver `useZonasDeSoltar`. */
  recibiendo = false,
  /* La opción abierta, controlada desde la hoja cuando el resumen del día tiene
     que verla: `opcion` (índice) y `onOpcion(índice)`. Sin ellos, estado propio. */
  opcion = null,
  onOpcion = null,
}) => {
  const confirm = useConfirm();
  const [opcionPropia, setOpcionPropia] = useState(0);
  const activeOption = opcion ?? opcionPropia;
  const setActiveOption = onOpcion || setOpcionPropia;
  const [renombrando, setRenombrando] = useState(false);
  /* La nota se pliega a una línea de «+ nota» mientras está vacía: seis comidas
     con seis cajas vacías era la mitad de la densidad de la pantalla. */
  const [notaAbierta, setNotaAbierta] = useState(false);
  /* Y el buscador de alimentos, por lo MISMO y con la misma mecánica: en reposo
     es «+ alimento» y solo hay campo en la comida que se está llenando. Ver el
     bloque `.comida-alta`, al final de esta pieza. */
  const [buscando, setBuscando] = useState(false);
  /* Qué alternativa se está renombrando, por índice. Ver la fila de pastillas. */
  const [renombrandoOpcion, setRenombrandoOpcion] = useState(null);
  /*
    ══ PLEGAR LA COMIDA ═══════════════════════════════════════════════════════

    Montando, la comida nace ABIERTA: la mesa es el trabajo y esconderlo de
    entrada sería pedirle al entrenador un clic por comida para ver lo que vino
    a ver. El chevron está para la vuelta —repasar cinco comidas de un vistazo
    cuando ya están montadas—, y es estado de pantalla, no del plan: no se
    guarda, porque plegar no es una decisión sobre la dieta de nadie.

    Leyéndola es al revés, y de ahí `plegadaAlInicio`: al cliente le nacen
    plegadas todas menos la primera. Su dieta empezaba a los novecientos píxeles
    de deslizamiento —título, objetivo, pasos, macros— y su única pregunta es
    qué come.
  */
  const [plegada, setPlegada] = useState(plegadaAlInicio);
  // Estado del arrastre, igual que en `ExerciseList`: quién se arrastra y sobre
  // quién se está soltando, para poder pintar las dos filas de forma distinta.
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);

  const options = meal.options || [];
  const index = Math.min(activeOption, Math.max(0, options.length - 1));
  const option = options[index];
  /* Cómo se llama la alternativa abierta: la que le puso el entrenador, o el
     ordinal de siempre. Lo llevan todos los verbos que actúan sobre ella. */
  const nombreOpcion = optionName(option, index);
  const totals = optionMacros(option);
  /* Lo que el entrenador estipuló para esta comida. Es lo que ve el cliente…
     salvo que le tenga ocultas las kcal: entonces el anillo del objetivo y las
     columnas de macros no se pintan, y queda el menú. Ver `Client/Oculto.jsx`. */
  const oculto = useOculto();
  const sinCifras = oculto.nutrition && !editable;
  const objetivo = mealTarget(meal);
  const foods = option?.foods || [];

  const askRemoveOption = async () => {
    const ok = await confirm({
      title: `¿Quitar ${nombreOpcion.toLowerCase()}?`,
      message:
        foods.length === 0
          ? 'No tiene alimentos.'
          : `Se borrará${foods.length === 1 ? '' : 'n'} su${foods.length === 1 ? '' : 's'} ${foods.length} alimento${foods.length === 1 ? '' : 's'}.`,
      confirmLabel: 'Quitar opción',
      tone: 'danger',
    });
    if (ok) {
      onRemoveOption(index);
      setActiveOption(Math.max(0, index - 1));
    }
  };


  const contexto = options.length > 1 ? `${options.length} opciones` : '';

  /*
    Lo que dice una comida plegada además de su nombre: de qué se compone. Los
    dos primeros alimentos y cuántos quedan —«Huevo entero, avena y 1 más»—,
    que es lo que deja reconocerla sin abrirla. Con las kcal ocultas al cliente
    sigue valiendo: son nombres, no cifras.
  */
  /* La fibra de la opción abierta, con su cobertura. `null` si nadie declara:
     entonces no se escribe nada, que no es lo mismo que escribir «0 g». */
  const fibra = sumMicros(foods).fiber;

  /* Sin memoizar: son tres o cuatro nombres y se recorren una vez. */
  const resumenPlegado = (() => {
    const nombres = foods.map((f) => f.name);
    if (nombres.length === 0) return '';
    if (nombres.length <= 2) return nombres.join(' y ');
    return `${nombres[0]}, ${nombres[1].toLowerCase()} y ${nombres.length - 2} más`;
  })();

  const hayNota = Boolean(meal.note?.trim());
  const conNota = editable && Boolean(onNote) && (hayNota || notaAbierta);

  /* El dibujo de la comida, cuando la casilla de la izquierda no la ocupa su
     número. El porqué, en la cabecera. */
  const Dibujo = dibujoDeComida(meal.name);

  return (
    <section
      id={`comida-${meal.id}`}
      className={`comida${editable ? '' : ' is-lectura'}${arrastre?.dragging ? ' is-dragging' : ''}${arrastre?.dropTarget ? ' is-drop-target' : ''}${recibiendo ? ' is-recibe' : ''}`}
      aria-label={meal.name}
      /* En captura y los dos gestos: pulsar dentro de la tarjeta no siempre
         deja el foco en algo enfocable —el nombre, la tabla— y entonces el
         `focus` no llega nunca. */
      onFocusCapture={onFoco || undefined}
      onPointerDownCapture={onFoco || undefined}
      onDragOver={arrastre?.onDragOver}
      onDragLeave={arrastre?.onDragLeave}
      onDrop={arrastre?.onDrop}
    >
      <header className="comida-cab">
        {editable && arrastre && (
          <button
            type="button"
            className="hoja-asa"
            draggable
            onDragStart={arrastre.onDragStart}
            onDragEnd={arrastre.onDragEnd}
            aria-label={`Arrastrar ${meal.name} para reordenar`}
            title="Arrastra para reordenar"
          >
            <GripVertical size={15} />
          </button>
        )}
        {/*
          ── LA CASILLA DE LA IZQUIERDA DICE QUÉ ES ESTA COMIDA ─────────────
          El dibujo, y solo el dibujo: es lo que deja encontrar la cena sin
          leerse las cuatro tarjetas. La tesela es `.list-icon`, la de las
          filas del teléfono, y es gris: quien distingue es el dibujo. Ver
          `la ley del color`.

          ══ Y AQUÍ IBA EL NÚMERO DE LA COMIDA ═══════════════════════════════

          «No quiero que comida sea 1 Comida 1, 2 Comida 2: quita el 1, 2.»
          Estaba porque al que MONTA la hoja le servía el orden y al que la
          COME el dibujo, y parecían dos lecturas de la misma casilla. No lo
          eran: la hoja ya está en orden de arriba abajo, así que el número no
          añadía nada que la propia lista no dijera — y con los nombres por
          defecto lo decía dos veces en la misma línea, «1 Comida 1».

          El frame la escribe así (nodo 64:132) y aquí manda el dueño: el
          ordinal se va de las tres pantallas que lo pintaban —esta cabecera,
          la mesa del reparto y las tarjetas de desvío—, porque media medida
          habría sido peor que ninguna.

          Con él se va su prop `numero`, que ya no la pasa nadie: la hoja del
          entrenador (`NutritionModule`) y la del monitor del cliente
          (`DietaEnMonitor`) le daban el índice y ninguna de las dos lo
          necesita para nada más.
        */}
        <span className="list-icon" aria-hidden="true">
          <Dibujo size={15} />
        </span>
        {renombrando && editable ? (
          <RenombrarEnSitio
            variante="is-comida"
            value={meal.name}
            label="Nombre de la comida"
            onRename={onRenameMeal}
            onDone={() => setRenombrando(false)}
          />
        ) : (
          <h4
            className={`comida-nombre${editable ? ' is-editable' : ''}`}
            onClick={editable ? () => setRenombrando(true) : undefined}
            title={editable ? 'Pulsa para renombrar' : undefined}
          >
            {meal.name}
          </h4>
        )}
        {contexto && <span className="comida-meta">{contexto}</span>}
        {/* Lo que suma la opción abierta contra lo que pide el plan, en color.
            En la ESCALA DE UNA COMIDA (`MARGEN_COMIDA_KCALS`), que es la misma
            con la que se pinta su anillo en la ventana del día: la misma cifra
            no puede salir verde aquí y ámbar allí. */}
        {editable && foods.length > 0 && (
          <span className={`comida-kcal${claseDe(totals.kcal, objetivo?.kcals, 'kcals', 'comida')}`}>
            <b>{Math.round(totals.kcal)}</b>
            {objetivo?.kcals ? ` / ${objetivo.kcals}` : ''} kcal
          </span>
        )}
        {/*
          ── Y AL CLIENTE, LO PAUTADO EN EL MISMO SITIO ────────────────────
          La misma línea, con una cifra en vez de dos y sin color: lo que su
          entrenador fijó para esta comida. Aquí no va lo que suma la opción
          abierta —eso es el descuadre del menú, que mira quien lo escribe— ni
          el semáforo que lo juzga. Ver `soloPautado` en `LecturasDeLaDieta`.

          Esto sustituye al anillo de 86 px que colgaba al pie de la comida
          rotulado «Objetivo de esta comida», que era la última pieza que solo
          existía en el portal: el dueño pidió que la comida se dibujara igual
          en los dos sitios.
        */}
        {!editable && !sinCifras && objetivo?.kcals ? (
          <span className="comida-kcal">
            <b>{objetivo.kcals}</b> kcal
          </span>
        ) : null}
        {/*
          ── Plegada, la comida sigue diciendo QUÉ ES ───────────────────────
          El chevron esconde la tabla, no la comida: arriba se quedan el número,
          el nombre, sus kcal y —solo estando plegada— de qué se compone, para
          que la línea no se convierta en un título mudo que hay que abrir para
          saber si es la que buscas.

          Al cliente le sirve para otra cosa: sus comidas nacen plegadas menos
          la primera (`plegadaAlInicio`), y por eso su dieta pasa a caber en una
          pantalla en vez de empezar a los novecientos píxeles.
        */}
        {plegada && foods.length > 0 && (
          <span className="comida-meta comida-plegada-dice">{resumenPlegado}</span>
        )}

        {editable && (
          <div className="comida-acciones">
            {/* Renombrar es tocar el nombre; mover es arrastrar por el asa:
                ninguno de los dos necesita botón.

                ── AQUÍ HABÍA TRES VERBOS DE COPIAR, Y AHORA HAY UNO ─────────
                «Duplicar con sus alternativas» (⧉₊), «Copiar al portapapeles»
                (⧉) y «Copiar esta comida a low» (⇄), tres dibujos casi iguales
                uno al lado del otro. Los dos que se han ido eran copiar y pegar
                hechos de un tirón, cada uno con su destino cableado —«aquí al
                lado» y «el otro día»—, y por eso ninguno servía para llevarse
                la comida a otra persona.

                Queda el que copia. Dónde cae se dice después: en la mano, con
                su verbo; arrastrándola a la pestaña del día al que vaya; o en
                otro cliente, que es lo que ninguno de los otros dos podía. Es
                la misma corrección que ya hizo Entreno con el ⧉ de la hoja.
                Ver `lib/portapapeles`. */}
            {/*
              ── LA NOTA, DONDE ESTÁN LOS DEMÁS VERBOS ────────────────────
              Era un «+ nota para el cliente» en azul debajo del título, y
              la hoja de entrenamiento resuelve lo mismo con un icono en la
              fila de acciones del ejercicio. Misma pieza y mismo dibujo
              (`Quote`, 13 px): escribirle algo a alguien sobre una comida y
              sobre una serie es el mismo gesto, y tenerlo en dos sitios con
              dos formas es lo que hace que la aplicación se lea como dos.
              Ver `Coach/Workout/HojaDeSeries`.

              Solo cuando no hay nota: con una escrita el hueco ya está
              abierto debajo y un botón que lleva a él sobraría.
            */}
            {onNote && !conNota && (
              <Accion icon={Quote} label="Añadir una nota" onClick={() => setNotaAbierta(true)} />
            )}
            {onCopiarComida && <Accion icon={Copy} label="Copiar al portapapeles" onClick={onCopiarComida} />}
            {/* Sin confirmación: borrar una comida tiene inverso —el aviso con
                «Deshacer» de `NutritionModule`— y lo que se deshace no se
                confirma. */}
            <Accion icon={Trash2} label="Quitar la comida" onClick={onRemoveMeal} danger />
          </div>
        )}

        {/*
          El chevron va el ÚLTIMO y fuera de `.comida-acciones`: esas se atenúan
          hasta pasar por encima —son verbos que se usan de uvas a peras— y este
          no puede, porque en una comida plegada es el único camino de vuelta.
          Ver [[ley-del-reposo]]: un hecho se queda, una oferta se apaga, y esto
          es un hecho (dice si está abierta o cerrada).
        */}
        {foods.length > 0 && (
          <button
            type="button"
            className="comida-plegar"
            onClick={() => setPlegada((v) => !v)}
            aria-expanded={!plegada}
            aria-controls={`comida-cuerpo-${meal.id}`}
            aria-label={plegada ? `Abrir ${meal.name}` : `Plegar ${meal.name}`}
            title={plegada ? 'Abrir' : 'Plegar'}
          >
            <ChevronDown size={15} />
          </button>
        )}
      </header>

      <div className="comida-cuerpo" id={`comida-cuerpo-${meal.id}`} hidden={plegada}>

      {/*
        Las opciones como pestañas —dónde estás, y añadir otra—, y a la derecha
        lo que se le hace a la abierta. Crear una alternativa te DEJA en ella:
        la nueva se añade al final (ver `addMealOption`).

        ══ Y VAN PEGADAS A LA CABECERA, DENTRO DE SU BANDA (nodo 64:130) ═════

        «El prototipo usa otro diseño para las opciones: van dentro de la caja.»
        El frame mete el renglón de las alternativas DENTRO del bloque gris de
        la cabecera —mismo fondo, mismos 16 px de sangrado, 12 de hueco—, y con
        razón: la pestaña abierta es lo que decide qué dice todo lo de abajo,
        así que pertenece al encabezado de la comida y no a la mesa.

        Estaba debajo, sobre papel blanco y con un filete propio, o sea una
        tercera banda entre la cabecera y la tabla.

        Por eso la NOTA baja y ahora va después: estaba en medio, y una caja
        blanca entre dos grises parte la banda en dos.
      */}
      {(options.length > 1 || editable) && (
        <div className="comida-opciones">
          <div className="comida-opciones-tabs" role="tablist" aria-label={`Opciones de ${meal.name}`}>
            {options.map((opt, i) =>
              /*
                ══ LA ALTERNATIVA ABIERTA SE RENOMBRA PULSÁNDOLA ══════════════
                El mismo gesto que el día en la cinta y que el nombre de la
                comida aquí arriba: pulsar la pastilla que ya está abierta no
                hacía nada, y ese es exactamente el hueco donde va renombrar.

                Y hace falta porque «Opción 1» dice dónde está la cosa en una
                lista, no qué es — y lo lee el CLIENTE, que es quien tiene que
                elegir una. Entre «Opción 1» y «Opción 2» no hay nada que
                decidir; entre «Con avena» y «Con tostada», sí. El nombre es
                opcional: sin él se sigue leyendo «Opción 1». Ver `optionName`.
              */
              renombrandoOpcion === i && editable ? (
                <RenombrarEnSitio
                  key={opt.id}
                  value={optionName(opt, i)}
                  label={`Nombre de ${optionName(opt, i).toLowerCase()}`}
                  onRename={(name) => onRenameOption?.(i, name)}
                  onDone={() => setRenombrandoOpcion(null)}
                />
              ) : (
                <button
                  key={opt.id}
                  type="button"
                  role="tab"
                  aria-selected={i === index}
                  className={`comida-opcion${i === index ? ' is-on' : ''}${i === index && editable && onRenameOption ? ' is-editable' : ''}`}
                  onClick={() => (i === index && editable && onRenameOption ? setRenombrandoOpcion(i) : setActiveOption(i))}
                  title={i === index && editable && onRenameOption ? 'Pulsa otra vez para ponerle nombre' : undefined}
                >
                  {optionName(opt, i)}
                  {/* Las kcal de cada alternativa: al programar sirven para ver
                      que las opciones son de verdad intercambiables, y al
                      cliente para elegir sabiendo lo que pesa cada una. La
                      misma pestaña en los dos lados (18 sep); solo se calla
                      con las cifras ocultas. */}
                  {!sinCifras && <small>{Math.round(optionMacros(opt).kcal)}</small>}
                </button>
              )
            )}
            {editable && (
              <button
                type="button"
                className="comida-opcion is-nueva"
                onClick={() => {
                  onAddOption();
                  setActiveOption(options.length);
                }}
              >
                + alternativa
              </button>
            )}
          </div>
          {/*
            Delante de estos iconos había un rótulo «Opción 1», para decir sobre
            cuál actúan. Pero la pastilla encendida lo dice ya, a cuatro
            centímetros y en voz más alta —y cuando la comida tiene UNA sola
            opción lo decía igual, o sea que la mesa se llenaba de «Opción 1 …
            Opción 1» en cada comida sin nada que distinguir—. Sobre quién actúa
            cada icono lo dice su propio `aria-label`.
          */}
          {editable && (foods.length > 0 || options.length > 1 || (enMano && onPegarEnMano)) && (
            <div className="comida-opciones-acciones">
              {/* Lo primero, porque es lo que construye: lo que llevas entra aquí
                  como alternativa. Ver `enMano`. */}
              {enMano && onPegarEnMano && (
                <Accion
                  icon={ClipboardPaste}
                  label={`Pegar «${enMano.titulo}» como otra alternativa de ${meal.name}`}
                  onClick={onPegarEnMano}
                />
              )}
              {/*
                ── ⧉₊ Y NO ⧉, QUE ES LO QUE SIGNIFICA ────────────────────────
                Este verbo duplica la alternativa aquí mismo; el ⧉ de la fila de
                arriba copia al portapapeles. Con el mismo dibujo eran dos cosas
                distintas a cuatro centímetros una de otra, que es la avería que
                el dueño señaló mirando esta pantalla.

                La ley que sale de ahí, y vale para toda la casa: **`Copy` es
                siempre «al portapapeles» y `CopyPlus` es siempre «otra igual
                aquí»**. El dibujo que sobraba en la fila de la comida es
                exactamente el que le faltaba a ésta.
              */}
              {foods.length > 0 && onDuplicateOption && (
                <Accion
                  icon={CopyPlus}
                  label={`Duplicar ${nombreOpcion.toLowerCase()}`}
                  onClick={() => {
                    onDuplicateOption(index);
                    /* La copia se inserta DETRÁS de la original y se abre: duplicas
                       para cambiarle algo, y quedarte en el original es quedarte en
                       lo que no vas a tocar. */
                    setActiveOption(index + 1);
                  }}
                />
              )}
              {/* Y ⧉ a secas, que por la misma ley es «al portapapeles»: la
                  ración sale de aquí y cae donde tú digas. El de la cabecera
                  copia la comida ENTERA; éste, esta alternativa. */}
              {foods.length > 0 && onCopiarPlato && (
                <Accion
                  icon={Copy}
                  label={`Copiar ${nombreOpcion.toLowerCase()} al portapapeles`}
                  onClick={() => onCopiarPlato(index)}
                />
              )}
              {/*
                ── Guardar la ración con nombre ──────────────────────────────
                Aquí y no en una pantalla de platos, por lo mismo que un día de
                entreno se guarda desde el cajón del bloque: el momento en que
                sabes que este desayuno es «el bueno» es cuando acabas de
                cuadrarlo, no media hora después administrando una vitrina.
              */}
              {foods.length > 0 && onSavePlato && (
                <Accion
                  icon={BookmarkPlus}
                  label={`Guardar ${nombreOpcion.toLowerCase()} como plato`}
                  onClick={() => onSavePlato(index)}
                />
              )}
              {options.length > 1 && <Accion icon={Trash2} label={`Quitar ${nombreOpcion.toLowerCase()}`} onClick={askRemoveOption} danger />}
            </div>
          )}
        </div>
      )}

      {/* Aquí iba «Elige UNA de las N opciones…» para el cliente, en una
          franja suelta entre las pestañas y la tabla. Se fue el 18 sep: las
          pestañas ya dicen que se elige una, y era lo único que hacía que su
          comida no se dibujara como la del entrenador. */}

      {/*
        ══ LA NOTA DE LA COMIDA, IGUAL QUE LA DEL EJERCICIO ════════════════

        La pauta de esta comida —«2 h antes de dormir», «el yogur, de la marca
        X»— va encima de los alimentos porque es el marco en el que se leen.

        Y con el marcado de `HojaDeSeries`: rótulo de sección y `textarea`.
        Aquí hubo un `input` de una línea con un rótulo al canto, y antes de
        eso una caja hundida; las dos eran una tercera forma de escribir lo
        mismo. El verbo que la abre está arriba, con los demás.
      */}
      {conNota ? (
        <label className="hoja-nota">
          <span className="section-label">Nota para el cliente</span>
          <textarea
            className="textarea"
            rows={2}
            autoFocus={notaAbierta && !hayNota}
            placeholder="La verá junto a la comida. Ej: el plátano, mejor maduro."
            value={meal.note ?? ''}
            maxLength={200}
            onChange={(e) => onNote(e.target.value)}
            onBlur={() => !String(meal.note || '').trim() && setNotaAbierta(false)}
            aria-label={`Nota de ${meal.name}`}
          />
        </label>
      ) : (
        /* Al cliente, la misma nota en el mismo sitio y con su rótulo: lo que
           el entrenador escribe en la caja, el cliente lo lee en una caja. */
        hayNota && (
          <div className="hoja-nota is-lectura">
            <span className="section-label">Nota de tu entrenador</span>
            <p className="comida-nota-lectura">{meal.note}</p>
          </div>
        )
      )}

      {/*
        ── AQUÍ ESTUVO EL ANILLO, Y SE HA IDO ─────────────────────────────────
        Un `MacroRing` de 86 px rotulado «Objetivo de esta comida» con la
        proteína, los carbos y las grasas estipulados, y se pintaba SOLO para
        el cliente (`!editable`). Era la última pieza que hacía que la misma
        comida se dibujara de dos maneras distintas según quién la mirase, y es
        lo que el dueño llamó «el diseño antiguo» el 14 de septiembre de 2026:
        *«el diseño de la dieta es el antiguo que teníamos; ahora el entrenador
        tiene un diseño distinto»*.

        Lo pautado no se pierde: sube a la cabecera de la comida, al mismo
        renglón donde el entrenador lee sus kcal. Una comida, un dibujo.
      */}
      {foods.length === 0 && !editable ? (
        <p className="t-sm t-tertiary">Tu entrenador no ha detallado esta opción.</p>
      ) : (
        <div className="food-table">
          <FoodTableHead editable={editable} sinCifras={sinCifras} />
          {foods.length === 0 && <p className="food-vacia t-sm t-tertiary">Sin alimentos todavía.</p>}
          {foods.map((food, foodIndex) => (
            <FoodRow
              key={food.id}
              food={food}
              editable={editable}
              catalogFoods={catalogFoods}
              libraryFoods={foodLibrary}
              coachId={coachId}
              clientSwapsOn={clientSwapsOn}
              grupos={grupos}
              onSaveGrupo={onSaveGrupo}
              onRemoveGrupo={onRemoveGrupo}
              onSwap={onSwapFood ? (item) => onSwapFood(index, food.id, item.food, item.grams) : null}
              onSetEquivalences={
                onSetEquivalences ? (visible) => onSetEquivalences(index, food.id, visible) : null
              }
              first={foodIndex === 0}
              last={foodIndex === foods.length - 1}
              onGrams={(grams) => onGrams(index, food.id, grams)}
              onSetDisplay={(mode) => onSetDisplay?.(index, food.id, mode)}
              onSetFixed={
                editable && onSetFixed ? (fijo) => onSetFixed(index, food.id, fijo) : null
              }
              onEditFood={(cambios) => onEditFood?.(index, food, cambios)}
              onMove={
                onMoveFood ? (delta) => onMoveFood(index, foodIndex, foodIndex + delta) : null
              }
              onRemove={() => onRemoveFood(index, food.id)}
              dragging={dragIndex === foodIndex}
              dropTarget={overIndex === foodIndex && dragIndex !== foodIndex}
              onDragStart={(e) => {
                setDragIndex(foodIndex);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setOverIndex(foodIndex);
              }}
              onDragLeave={() => setOverIndex((i) => (i === foodIndex ? null : i))}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null && dragIndex !== foodIndex) {
                  onMoveFood?.(index, dragIndex, foodIndex);
                }
                setDragIndex(null);
                setOverIndex(null);
              }}
            />
          ))}

          {/*
            La SUMA, al pie de la tabla: lo puesto y, detrás y en pequeño, lo
            pedido en el plan del día, en el color de si cuadra. Al cliente, la
            suma sola, sin lo pedido ni el color: la comparación no le toca
            resolverla, pero el total de lo que come sí es suyo, y sin esta fila
            su tabla acababa en el último alimento y no como la del entrenador.
          */}
          {foods.length > 0 && (editable || !sinCifras) && (
            <div className="food-row is-suma" aria-label={`Suma de ${nombreOpcion.toLowerCase()}`}>
              <span aria-hidden="true" />
              <span className="name">
                <span className="txt">Total {nombreOpcion.toLowerCase()}</span>
                {/*
                  ══ LA FIBRA, EN EL HUECO QUE YA HABÍA ═══════════════════════

                  Cada alimento trae congelada la fibra que declara su envase
                  (`freezeMicros`) y no se enseñaba en ninguna comida: la única
                  cifra de fibra de toda la pantalla era la del día entero, al
                  costado. Repartirla por comida es lo que la hace accionable —
                  la fibra se arregla cambiando UN alimento, no el día.

                  Va en la celda del nombre porque esa celda estaba vacía a
                  partir de la palabra «Suma»: seiscientos píxeles de renglón en
                  blanco hasta la primera columna de cifras. Ni pie nuevo ni
                  columna nueva; la rejilla de la tabla no se toca.

                  Y con su COBERTURA cuando no todos declaran, que es la regla
                  que `domain/micros.js` no negocia: un suelo presentado como
                  total es peor que no dar cifra.
                */}
                {!sinCifras && fibra && (
                  <span className="food-fibra">
                    {microSaid('fiber', fibra)}
                    {coverageSaid(fibra) && <em> · {coverageSaid(fibra)}</em>}
                  </span>
                )}
              </span>
              <span className="grams" />
              {MACRO_META.map(({ key, short }, i) => (
                <span
                  key={key}
                  className={`n ${CELL[i]}${editable ? claseDe(totals[key], objetivo?.[key], key, 'comida') : ''}`}
                  data-macro={short}
                >
                  {Math.round(totals[key])}
                  {editable && objetivo?.[key] ? <small>/{objetivo[key]}</small> : null}
                </span>
              ))}
              <span className={`kcal${editable ? claseDe(totals.kcal, objetivo?.kcals, 'kcals', 'comida') : ''}`}>
                {Math.round(totals.kcal)}
                {editable && objetivo?.kcals ? <small>/{objetivo.kcals}</small> : null}
              </span>
              <span aria-hidden="true" />
            </div>
          )}
        </div>
      )}

      {/*
        ══ EN REPOSO NO HAY BUSCADOR, HAY UN VERBO ════════════════════════════

        Cada comida terminaba en un campo de búsqueda vacío. Con cinco comidas
        eso son CINCO cajas idénticas de sesenta píxeles, todas en blanco y
        todas diciendo lo mismo, repartidas por la mesa entera — y una caja de
        formulario vacía es la pieza más pesada que se puede poner en una hoja.

        Ahora, en reposo, hay «+ alimento» en azul; el campo aparece al pulsarlo
        y se retira solo al salir sin escribir nada. Es la misma mecánica que ya
        tenía la nota de la comida un poco más arriba —y la misma ley: un hecho
        se queda, una oferta se apaga—.

        La comida VACÍA es la excepción, y hace falta: ahí el buscador no es una
        oferta, es el trabajo. Sin él la comida recién creada no diría cómo se
        llena.
      */}
      {editable && (
        <div className="comida-alta">
          {buscando || foods.length === 0 ? (
            <AddFoodControl
              foodLibrary={foodLibrary}
              onAdd={(food) => onAddFood(index, food)}
              platos={platos}
              onAddPlato={onAddPlato ? (plato) => onAddPlato(index, plato) : null}
              inputProps={{
                autoFocus: buscando,
                onBlur: (e) => !e.target.value.trim() && setBuscando(false),
              }}
            />
          ) : (
            <BotonMas palabra="alimento" onClick={() => setBuscando(true)} title={`Añadir un alimento a ${meal.name}`} />
          )}
        </div>
      )}
      </div>
    </section>
  );
};
