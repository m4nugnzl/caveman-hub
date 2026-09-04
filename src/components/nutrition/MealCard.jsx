import { useMemo, useState } from 'react';
import { ArrowDown, ArrowRightLeft, ArrowUp, Copy, GripVertical, Pencil, Trash2, X } from 'lucide-react';

import {
  displayAsUnits,
  foodMacros,
  foodUnits,
  gramsFromUnits,
  hasUnits,
  macroError,
  mealTarget,
  optionMacros,
  unitsLabel,
} from '@/domain/nutrition';
import { canEditLibraryItem } from '@/domain/catalog';
import { equivalencesFor } from '@/domain/foodEquiv';
import { toNum, toNum0 } from '@/lib/num';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { Modal } from '@/components/ui/Modal';
import { Field, Notice, RenombrarEnSitio, SegmentedControl } from '@/components/ui/primitives';
import { AddFoodControl } from './AddFoodControl';
import { FoodEquivalences } from './FoodEquivalences';
import { MACRO_META, MacroRing } from './macros';

/**
 * La columna de cantidad mide 74 px contando la casilla, así que ahí no cabe
 * «cucharada». Se abrevian las medidas que tienen abreviatura reconocible y el
 * resto cae en «ud», que es lo que se entiende sin aprender nada.
 *
 * El nombre completo no se pierde: va en el `title` de la casilla —«2 huevos ·
 * 110 g»— y en la etiqueta que leen los lectores de pantalla.
 */
const ABREVIATURAS = {
  cucharada: 'cda',
  cucharadita: 'cdta',
  rebanada: 'reb',
  vaso: 'vaso',
  lata: 'lata',
  cazo: 'cazo',
  filete: 'fil',
};

const abreviar = (label) => ABREVIATURAS[String(label || '').toLowerCase()] || 'ud';

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
const FoodTableHead = ({ editable }) => (
  <div className="food-head" aria-hidden="true">
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
    {MACRO_META.map(({ key, short }) => (
      <span key={key}>{short}</span>
    ))}
    <span>Kcal</span>
    {/* Y la última es la de borrar, que solo existe al editar. */}
    {editable && <span />}
  </div>
);

const CELL = ['is-p', 'is-c', 'is-f'];

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
  onSwap,
  onSetEquivalences,
  onGrams,
  onSetDisplay,
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
  const [editando, setEditando] = useState(false);
  const [equivalenciasAbiertas, setEquivalenciasAbiertas] = useState(false);
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
  const equivalencias = useMemo(
    () => (catalogFoods.length ? equivalencesFor(food, catalogFoods, libraryFoods) : null),
    [food, catalogFoods, libraryFoods]
  );

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
      className={`food-row${dropTarget ? ' is-drop-target' : ''}${dragging ? ' is-dragging' : ''}`}
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
          <GripVertical size={14} />
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
            <ArrowUp size={14} />
          </button>
          <button
            type="button"
            className="btn btn-icon btn-icon-compact"
            disabled={last}
            onClick={() => onMove(1)}
            aria-label={`Bajar ${food.name}`}
          >
            <ArrowDown size={14} />
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
        {conBoton && (
          <button
            type="button"
            className={`btn btn-icon btn-icon-compact equiv-btn${editable && food.equivHidden ? ' is-off' : ''}`}
            onClick={() => setEquivalenciasAbiertas(true)}
            aria-label={`Equivalencias de ${food.name}`}
            title={editable && food.equivHidden ? 'Equivalencias (el cliente no las ve)' : 'Equivalencias'}
          >
            <ArrowRightLeft size={12} />
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
            <Pencil size={12} />
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

      {MACRO_META.map(({ key, short, label }, index) => (
        <span
          key={key}
          className={`n ${CELL[index]}`}
          data-macro={short}
          aria-label={`${label} de ${food.name}`}
        >
          {Math.round(macros[key])}
        </span>
      ))}

      <span className="kcal">{Math.round(macros.kcal)}</span>

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

  return (
    <>
      {row}
      {editando && (
        <FoodDialog
          food={food}
          onClose={() => setEditando(false)}
          onSetDisplay={onSetDisplay}
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
const FoodDialog = ({ food, onClose, onSetDisplay, onSave }) => {
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
 *   · Sobre la COMIDA (renombrar, duplicar, copiar al otro día, subir, bajar,
 *     eliminar): el «···» de su cabecera. Renombrar también con doble clic.
 *   · Sobre la OPCIÓN abierta (duplicar, copiar, quitar): el «···» de la fila
 *     de opciones. Con una sola cosa que hacer, es una papelera y no un menú.
 *   · El objetivo de la comida se escribe aquí, en su línea, y no en una tabla
 *     aparte: es de esta comida.
 *
 * Los menús son `MenuAcciones` y viven FUERA de cualquier contenedor con
 * desplazamiento: el carril anterior recortaba el desplegable y «Quitar la
 * opción» no se veía nunca.
 *
 * El cliente (`editable=false`) ve lo mismo sin mandos: su comida, su nota, sus
 * opciones y, si su entrenador fijó un objetivo, el anillo de lo estipulado.
 */
/** Puesto contra pedido, con el mismo margen del 5 % que tenía el objetivo. */
const estadoDe = (actual, objetivo) => {
  if (!objetivo) return '';
  const margen = objetivo * 0.05;
  const diff = actual - objetivo;
  return diff > margen ? ' is-over' : diff < -margen ? ' is-under' : ' is-ok';
};

/*
  ══ Las acciones, a la vista y con icono, como en la hoja de Entreno ═════════
  Nada dentro de un «···»: lo que se le hace a una comida (renombrar, duplicar,
  copiar al otro día, subir, bajar, eliminar) y a la opción abierta (duplicar,
  copiar, quitar) son iconos en su fila, atenuados hasta pasar por encima.
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
  numero = null,
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
  onAddFood,
  onRemoveFood,
  onGrams,
  onSetDisplay,
  onEditFood,
  onMoveFood,
  onDuplicateMeal,
  onDuplicateOption,
  onCopyMeal,
  onCopyOption,
  onNote = () => {},
  otherVariantLabel = '',
  /* El arrastre entre comidas lo lleva la hoja (`NutritionModule`), como el de
     los ejercicios lo lleva `HojaDeSeries`: aquí solo se pinta el asa y se
     obedece. `{ dragging, dropTarget, onDragStart, onDragEnd, onDragOver,
     onDragLeave, onDrop }`. */
  arrastre = null,
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
  // Estado del arrastre, igual que en `ExerciseList`: quién se arrastra y sobre
  // quién se está soltando, para poder pintar las dos filas de forma distinta.
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);

  const options = meal.options || [];
  const index = Math.min(activeOption, Math.max(0, options.length - 1));
  const option = options[index];
  const totals = optionMacros(option);
  /* Lo que el entrenador estipuló para esta comida. Es lo que ve el cliente. */
  const objetivo = mealTarget(meal);
  const foods = option?.foods || [];

  const askRemoveOption = async () => {
    const ok = await confirm({
      title: `¿Quitar la opción ${index + 1}?`,
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

  const hayNota = Boolean(meal.note?.trim());

  return (
    <section
      id={`comida-${meal.id}`}
      className={`comida${editable ? '' : ' is-lectura'}${arrastre?.dragging ? ' is-dragging' : ''}${arrastre?.dropTarget ? ' is-drop-target' : ''}`}
      aria-label={meal.name}
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
            <GripVertical size={14} />
          </button>
        )}
        {numero !== null && <span className="comida-n">{numero}</span>}
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
        {/* Lo que suma la opción abierta contra lo que pide el plan, en color. */}
        {editable && foods.length > 0 && (
          <span className={`comida-kcal${estadoDe(totals.kcal, objetivo?.kcals)}`}>
            <b>{Math.round(totals.kcal)}</b>
            {objetivo?.kcals ? ` / ${objetivo.kcals}` : ''} kcal
          </span>
        )}

        {editable && (
          <div className="comida-acciones">
            {/* Renombrar es tocar el nombre; mover es arrastrar por el asa:
                ninguno de los dos necesita botón. */}
            {onDuplicateMeal && <Accion icon={Copy} label="Duplicar con sus alternativas" onClick={onDuplicateMeal} />}
            {/* Llevarse esta comida al otro día. Solo existe cuando el plan
                tiene dos días distintos: sin variantes no hay «el otro». */}
            {onCopyMeal && <Accion icon={ArrowRightLeft} label={`Copiar a ${otherVariantLabel}`} onClick={onCopyMeal} />}
            {/* Sin confirmación: borrar una comida tiene inverso —el aviso con
                «Deshacer» de `NutritionModule`— y lo que se deshace no se
                confirma. */}
            <Accion icon={Trash2} label="Eliminar comida" onClick={onRemoveMeal} danger />
          </div>
        )}
      </header>

      {/*
        La pauta de esta comida: «2 h antes de dormir», «el yogur, de la marca
        X». Va encima de los alimentos porque es el marco en el que se leen.
        Al montar, plegada en «+ nota» hasta que hay algo que decir.
      */}
      {editable ? (
        hayNota || notaAbierta ? (
          <label className="comida-nota">
            <span className="comida-objetivo-k">Nota</span>
            <input
              autoFocus={notaAbierta && !hayNota}
              className="comida-nota-texto"
              value={meal.note ?? ''}
              maxLength={200}
              placeholder="Cómo cocinarlo, marcas, sustituciones… lo verá tal cual"
              onChange={(e) => onNote(e.target.value)}
              onBlur={() => !meal.note?.trim() && setNotaAbierta(false)}
              aria-label={`Nota de ${meal.name}`}
            />
          </label>
        ) : (
          <button type="button" className="comida-nota-mas" onClick={() => setNotaAbierta(true)}>
            + nota para el cliente
          </button>
        )
      ) : (
        hayNota && <p className="comida-nota-lectura">{meal.note}</p>
      )}

      {/*
        Las opciones como pestañas —dónde estás, y añadir otra—, y a la derecha
        lo que se le hace a la abierta. Crear una alternativa te DEJA en ella:
        la nueva se añade al final (ver `addMealOption`).
      */}
      {(options.length > 1 || editable) && (
        <div className="comida-opciones">
          <div className="comida-opciones-tabs" role="tablist" aria-label={`Opciones de ${meal.name}`}>
            {options.map((opt, i) => (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={i === index}
                className={`comida-opcion${i === index ? ' is-on' : ''}`}
                onClick={() => setActiveOption(i)}
              >
                Opción {i + 1}
                {/* Las kcal de cada alternativa, solo al programar: sirven para
                    ver que las opciones son de verdad intercambiables. */}
                {editable && <small>{Math.round(optionMacros(opt).kcal)}</small>}
              </button>
            ))}
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
          {editable && (foods.length > 0 || options.length > 1) && (
            <div className="comida-opciones-acciones">
              <span className="comida-opciones-k">Opción {index + 1}</span>
              {foods.length > 0 && onDuplicateOption && (
                <Accion
                  icon={Copy}
                  label={`Duplicar la opción ${index + 1}`}
                  onClick={() => {
                    onDuplicateOption(index);
                    /* La copia se inserta DETRÁS de la original y se abre: duplicas
                       para cambiarle algo, y quedarte en el original es quedarte en
                       lo que no vas a tocar. */
                    setActiveOption(index + 1);
                  }}
                />
              )}
              {foods.length > 0 && onCopyOption && (
                <Accion icon={ArrowRightLeft} label={`Copiar la opción ${index + 1} a ${otherVariantLabel}`} onClick={() => onCopyOption(index)} />
              )}
              {options.length > 1 && <Accion icon={Trash2} label={`Quitar la opción ${index + 1}`} onClick={askRemoveOption} danger />}
            </div>
          )}
        </div>
      )}

      {options.length > 1 && !editable && (
        <p className="t-xs t-tertiary">
          Elige UNA de las {options.length} opciones, la que mejor te encaje ese día.
        </p>
      )}

      {/*
        Al cliente, lo ESTIPULADO como anillo: su plan es lo que su entrenador
        fijó para esa comida, y no cambia según la alternativa que abra. Sin
        objetivo no hay nada estipulado que enseñar.
      */}
      {!editable && foods.length > 0 && objetivo && (
        <div className="card-inset row wrap gap-4">
          <MacroRing
            protein={objetivo.protein}
            carbs={objetivo.carbs}
            fats={objetivo.fats}
            kcals={objetivo.kcals}
            size={86}
            caption="Objetivo de esta comida"
          />
        </div>
      )}

      {foods.length === 0 && !editable ? (
        <p className="t-sm t-tertiary">Tu entrenador no ha detallado esta opción.</p>
      ) : (
        <div className="food-table">
          <FoodTableHead editable={editable} />
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
              onSwap={onSwapFood ? (item) => onSwapFood(index, food.id, item.food, item.grams) : null}
              onSetEquivalences={
                onSetEquivalences ? (visible) => onSetEquivalences(index, food.id, visible) : null
              }
              first={foodIndex === 0}
              last={foodIndex === foods.length - 1}
              onGrams={(grams) => onGrams(index, food.id, grams)}
              onSetDisplay={(mode) => onSetDisplay?.(index, food.id, mode)}
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
            pedido en el plan del día, en el color de si cuadra. Solo al montar:
            al cliente la comparación no le toca resolverla.
          */}
          {editable && foods.length > 0 && (
            <div className="food-row is-suma" aria-label={`Suma de la opción ${index + 1}`}>
              <span aria-hidden="true" />
              <span className="name">
                <span className="txt">Suma</span>
              </span>
              <span className="grams" />
              {MACRO_META.map(({ key, short }, i) => (
                <span key={key} className={`n ${CELL[i]}${estadoDe(totals[key], objetivo?.[key])}`} data-macro={short}>
                  {Math.round(totals[key])}
                  {objetivo?.[key] ? <small>/{objetivo[key]}</small> : null}
                </span>
              ))}
              <span className={`kcal${estadoDe(totals.kcal, objetivo?.kcals)}`}>
                {Math.round(totals.kcal)}
                {objetivo?.kcals ? <small>/{objetivo.kcals}</small> : null}
              </span>
              <span aria-hidden="true" />
            </div>
          )}
        </div>
      )}

      {editable && (
        <div className="comida-alta">
          <AddFoodControl foodLibrary={foodLibrary} onAdd={(food) => onAddFood(index, food)} />
        </div>
      )}
    </section>
  );
};
