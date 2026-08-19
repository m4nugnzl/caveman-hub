import { useRef, useState } from 'react';
import {
  ArrowRightLeft,
  ChevronDown,
  ChevronUp,
  Copy,
  GripVertical,
  MoreVertical,
  NotebookPen,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';

import {
  displayAsUnits,
  foodMacros,
  foodUnits,
  gramsFromUnits,
  hasUnits,
  mealTarget,
  optionMacros,
  unitsLabel,
} from '@/domain/nutrition';
import { useClickOutside } from '@/lib/useClickOutside';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { Modal } from '@/components/ui/Modal';
import { Field, Notice, SegmentedControl } from '@/components/ui/primitives';
import { AddFoodControl } from './AddFoodControl';
import { MACRO_META, MacroRing } from './macros';
import { MealGoal } from './MealGoal';

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
    {MACRO_META.map(({ key, short, color }) => (
      <span key={key} style={{ color }}>
        {short}
      </span>
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
  onGrams,
  onSetDisplay,
  onDefineUnit,
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
  const [definiendo, setDefiniendo] = useState(false);
  const sePuede = hasUnits(food);
  const porUnidades = displayAsUnits(food);

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

      <span className="name">{food.name}</span>

      <span className="grams" title={equivalencia}>
        {editable ? (
          <input
            type="text"
            inputMode="decimal"
            className="input input-sm input-center"
            style={{ width: 46 }}
            value={valor ?? ''}
            onChange={(e) => alEscribir(e.target.value)}
            aria-label={
              porUnidades ? `${food.unitLabel} de ${food.name}` : `Gramos de ${food.name}`
            }
          />
        ) : (
          <span className="fixed">{valor}</span>
        )}

        {/*
          La medida, como desplegable.
          ────────────────────────────────────────────────────────────────────
          Por defecto gramos, y se cambia abriéndolo. Un desplegable dice por sí
          solo que hay más de una opción detrás, que es lo que fallaba en los
          primeros intentos —una palabra suelta o un subrayado no lo dicen—.

          ── El ancho es fijo A PROPÓSITO ─────────────────────────────────────
          Un `select` se dimensiona por su opción MÁS LARGA, y aquí hay una que
          lo es («Definir unidad…»). Sin ancho fijo estiraba la columna hasta
          empujar la casilla de la cantidad fuera de la rejilla, y el número
          desaparecía. Cerrado solo se lee la opción elegida —«g», «ud»—, que
          siempre es corta; la larga se ve entera al desplegarlo, que es donde
          hace falta.
        */}
        {editable ? (
          <select
            className="select unit-select"
            value={porUnidades ? 'units' : 'grams'}
            aria-label={`Medida de ${food.name}`}
            title={equivalencia}
            onChange={(e) => {
              /*
                «Definir» no es una medida, es una acción: abre el diálogo y no
                se queda seleccionada. Como el `value` lo manda el alimento y no
                el evento, el desplegable vuelve solo a lo que estaba.
              */
              if (e.target.value === 'define') setDefiniendo(true);
              else onSetDisplay(e.target.value);
            }}
          >
            <option value="grams">g</option>
            {sePuede && <option value="units">{abreviar(food.unitLabel)}</option>}
            <option value="define">
              {sePuede ? `Cambiar ${food.unitLabel}…` : 'Definir unidad…'}
            </option>
          </select>
        ) : (
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
          className="btn btn-icon btn-icon-danger del"
          style={{ width: 26, height: 26 }}
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
      {definiendo && (
        <UnitDialog
          food={food}
          onClose={() => setDefiniendo(false)}
          onSetDisplay={onSetDisplay}
          onSave={(unitLabel, unitGrams) => {
            onDefineUnit(unitLabel, unitGrams);
            setDefiniendo(false);
          }}
        />
      )}
    </>
  );
};

/**
 * Definir cuánto pesa una unidad, sin salir de la dieta.
 *
 * ── Por qué aquí y no en la biblioteca ──────────────────────────────────────
 * Porque no existe una pantalla de biblioteca: un alimento solo se podía tocar
 * EN EL MOMENTO DE CREARLO, y a partir de ahí quedaba congelado. Así que un
 * alimento dado de alta antes de que existieran las unidades —o con un nombre que
 * no estaba en la lista de la 0030, como «Huevos enteros frescos»— no tenía forma
 * de recibir la suya.
 *
 * Y este es además el sitio donde te das cuenta de que la necesitas: montando la
 * dieta, no administrando una lista.
 *
 * Lo que se guarda va a la BIBLIOTECA, no solo a esta entrada: la próxima vez que
 * añadas ese alimento a cualquier dieta ya vendrá con su unidad puesta.
 */
const UnitDialog = ({ food, onClose, onSetDisplay, onSave }) => {
  const [label, setLabel] = useState(food.unitLabel || '');
  const [grams, setGrams] = useState(food.unitGrams || '');

  const limpio = label.trim();
  const gramos = Number(String(grams).replace(',', '.'));
  const valido = limpio.length > 0 && Number.isFinite(gramos) && gramos > 0;

  const guardar = (e) => {
    e.preventDefault();
    if (valido) onSave(limpio, gramos);
  };

  return (
    <Modal
      title={`Cómo se cuenta ${food.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form="unit-form" className="btn btn-primary" disabled={!valido}>
            Guardar
          </button>
        </>
      }
    >
      {/* El `form` va dentro del cuerpo y los botones en el pie del diálogo, así
          que se enlazan por `form="unit-form"`. Es lo que permite que Enter
          guarde desde cualquiera de los dos campos sin duplicar el manejador. */}
      <form id="unit-form" className="col gap-4" onSubmit={guardar}>
        {/*
          Elegir la medida solo tiene sentido cuando hay dos entre las que elegir.
          Con el alimento sin unidad definida, este diálogo es únicamente el
          formulario de abajo.

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
          Los dos campos en rejilla de dos columnas y ambos al ancho de su celda.

          Antes era una fila flexible con el segundo a 90 px fijos: el primero
          crecía, el segundo no, y quedaban de tamaños distintos y sin alinear
          entre sí. Aquí son dos mitades iguales, que es lo que hace que se lean
          como un par —«esto se cuenta en X» y «una X pesa Y»—.
        */}
        <div className="grid-2">
          <Field
            label="Se cuenta en"
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
                autoFocus
                className="input"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                /*
                  Neutro a propósito. Ponía «huevo», y este diálogo lo abre
                  cualquier alimento: leer «Cómo se cuenta Brócoli → huevo» hace
                  dudar de si el campo está relleno o de si la aplicación se ha
                  equivocado de alimento.
                */
                placeholder="unidad"
              />
            )}
          </Field>

          <Field label="Gramos por unidad" hint="Lo que pesa una, en crudo.">
            {(props) => (
              <input
                {...props}
                type="text"
                inputMode="decimal"
                className="input"
                value={grams}
                onChange={(e) => setGrams(e.target.value)}
              />
            )}
          </Field>
        </div>

        {/*
          Lo que va a pasar con ESTE alimento y sus gramos actuales, antes de
          guardar. Es lo que convierte dos casillas en una decisión: se ve al
          momento si 55 es el peso de una pieza o si te has equivocado de orden
          de magnitud.
        */}
        <Notice tone="info">
          {valido ? (
            <>
              1 {limpio} = {gramos} g, así que los <strong>{food.grams} g</strong> de esta comida
              pasarán a leerse como{' '}
              <strong>{unitsLabel({ ...food, unitLabel: limpio, unitGrams: gramos })}</strong>.
            </>
          ) : (
            'Escribe cómo se cuenta y cuánto pesa una unidad. Se guarda en tu biblioteca, así que la próxima vez que añadas este alimento a cualquier dieta ya vendrá con su unidad.'
          )}
        </Notice>
      </form>
    </Modal>
  );
};

/**
 * Una comida del menú cerrado.
 *
 * Dos niveles, no tres: la comida es una tarjeta, **las opciones son pestañas**
 * —lo que además comunica que se elige UNA, no todas— y los alimentos son cajas
 * flotantes. Antes eran cajas dentro de cajas dentro de cajas.
 *
 * El mismo componente sirve al entrenador y al cliente; `editable` decide.
 */
export const MealCard = ({
  meal,
  editable = false,
  foodLibrary = [],
  onRenameMeal,
  onRemoveMeal,
  onAddOption,
  onRemoveOption,
  onAddFood,
  onRemoveFood,
  onGrams,
  onSetDisplay,
  onDefineUnit,
  onMoveFood,
  onMoveMeal,
  onDuplicateMeal,
  onDuplicateOption,
  onCopyMeal,
  onCopyOption,
  onNote = () => {},
  otherVariantLabel = '',
  firstMeal,
  lastMeal,
}) => {
  const confirm = useConfirm();
  const [activeOption, setActiveOption] = useState(0);
  const [editingName, setEditingName] = useState(false);
  /* El menú de acciones de la comida. Mismo patrón que la cabecera de un día. */
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  useClickOutside(menuRef, () => setMenuOpen(false), menuOpen);

  /* El de la OPCIÓN abierta, que es otro plano: la cabecera actúa sobre la
     comida entera y esto sobre una de sus alternativas. */
  const [opcionMenu, setOpcionMenu] = useState(false);
  const opcionMenuRef = useRef(null);
  useClickOutside(opcionMenuRef, () => setOpcionMenu(false), opcionMenu);
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

  /*
    ══ De quién es cada cifra ═════════════════════════════════════════════════

    El anillo enseña una cosa distinta a cada uno, y no por adornar:

    · Al ENTRENADOR, el reparto REAL de la opción que tiene abierta. Es lo que
      está montando, y lo que compara contra su objetivo en las barras de al
      lado.
    · Al CLIENTE, lo ESTIPULADO. Su plan es lo que su entrenador fijó para esa
      comida, y no cambia según la alternativa que abra. La suma de los
      alimentos es una cifra aproximada que además se contradice a sí misma al
      cambiar de opción — la misma razón por la que la cabecera ya enseña el
      objetivo y no el total.

    Sin objetivo puesto el cliente no ve anillo: no hay nada estipulado que
    enseñar, y el real es precisamente el que no le toca ver.
  */
  const anillo = editable
    ? { protein: totals.protein, carbs: totals.carbs, fats: totals.fats, kcals: totals.kcal }
    : objetivo;

  const askRemoveMeal = async () => {
    const ok = await confirm({
      title: `¿Eliminar «${meal.name}»?`,
      message: `Se borrarán sus ${options.length} ${options.length === 1 ? 'opción' : 'opciones'} y todos sus alimentos.`,
      confirmLabel: 'Eliminar comida',
      tone: 'danger',
    });
    if (ok) onRemoveMeal();
  };

  const askRemoveOption = async () => {
    const ok = await confirm({
      title: `¿Eliminar la opción ${index + 1}?`,
      message: `Se borrarán sus ${foods.length} alimentos.`,
      confirmLabel: 'Eliminar opción',
      tone: 'danger',
    });
    if (ok) {
      onRemoveOption(index);
      setActiveOption(Math.max(0, index - 1));
    }
  };

  return (
    <article className="meal">
      <header className="meal-head">
        {editingName && editable ? (
          <input
            autoFocus
            className="input grow"
            style={{ fontWeight: 650 }}
            value={meal.name}
            onChange={(e) => onRenameMeal(e.target.value)}
            onBlur={() => setEditingName(false)}
            onKeyDown={(e) => e.key === 'Enter' && setEditingName(false)}
            aria-label="Nombre de la comida"
          />
        ) : (
          <h4 className="meal-title">
            {meal.name}
            {editable && (
              <button
                type="button"
                className="btn btn-icon"
                style={{ width: 24, height: 24 }}
                onClick={() => setEditingName(true)}
                aria-label={`Renombrar ${meal.name}`}
              >
                <Pencil size={12} />
              </button>
            )}
          </h4>
        )}

        {/*
          ── Aquí ya no va ninguna cifra ──────────────────────────────────────
          Había una pastilla de kcal, y decía cosas distintas a cada uno: al
          entrenador la suma de la opción abierta, al cliente lo estipulado. Las
          dos sobraban por el mismo motivo: **el anillo de abajo ya las dice**,
          con su reparto al lado, y una cifra suelta a dos centímetros de otra
          igual solo invita a compararlas y a preguntarse por qué no coinciden.
        */}
        <div className="row gap-2 shrink-0">
          {editable && (
            <>
              {/*
                ══ Por qué solo quedan tres iconos aquí ═══════════════════════

                Eran SEIS seguidos —renombrar, subir, bajar, duplicar, copiar al
                otro día y borrar—, todos del mismo tamaño, el mismo color y la
                misma caja, sin una palabra. El sexto borraba la comida entera.
                Un día de dieta son cinco o seis comidas: treinta iconos mudos en
                una pantalla, con los destructivos escondidos entre ellos.

                El razonamiento original —«un menú para tres cosas es un clic de
                más en la operación que más se repite»— sigue siendo bueno; lo
                que pasó es que dejaron de ser tres.

                Se quedan fuera las que se usan MONTANDO, que son las repetidas:
                subir y bajar. Lo demás pasa al menú de al lado, con borrar
                separado y en su tono.
              */}
              {onMoveMeal && (
                <>
                  <button
                    type="button"
                    className="btn btn-icon"
                    onClick={() => onMoveMeal(-1)}
                    disabled={firstMeal}
                    aria-label={`Subir ${meal.name}`}
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-icon"
                    onClick={() => onMoveMeal(1)}
                    disabled={lastMeal}
                    aria-label={`Bajar ${meal.name}`}
                  >
                    <ChevronDown size={14} />
                  </button>
                </>
              )}
              {/*
                El resto, en el mismo menú de desbordamiento que ya usa la
                cabecera de un día en el editor de rutina (`Workout/DayHeader`).
                Mismo gesto, mismo sitio, misma forma: no hay nada nuevo que
                aprender.
              */}
              <div ref={menuRef} style={{ position: 'relative' }}>
                <button
                  type="button"
                  className="btn btn-icon"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-label={`Acciones de ${meal.name}`}
                >
                  <MoreVertical size={16} />
                </button>

                {menuOpen && (
                  <div className="popover popover-right" style={{ top: '120%' }} role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      className="menu-item"
                      onClick={() => {
                        setEditingName(true);
                        setMenuOpen(false);
                      }}
                    >
                      <Pencil size={15} /> Renombrar
                    </button>

                    {onDuplicateMeal && (
                      <button
                        type="button"
                        role="menuitem"
                        className="menu-item"
                        onClick={() => {
                          onDuplicateMeal();
                          setMenuOpen(false);
                        }}
                      >
                        <Copy size={15} /> Duplicar con sus alternativas
                      </button>
                    )}

                    {/*
                      Llevarse esta comida al otro día. Solo existe cuando el plan
                      tiene dos días distintos: sin variantes no hay «el otro», y
                      la entrada sería un adorno que no lleva a ninguna parte.
                    */}
                    {onCopyMeal && (
                      <button
                        type="button"
                        role="menuitem"
                        className="menu-item"
                        onClick={() => {
                          onCopyMeal();
                          setMenuOpen(false);
                        }}
                      >
                        <ArrowRightLeft size={15} /> Copiar a {otherVariantLabel}
                      </button>
                    )}

                    {/* Separado y en su tono: es la única de las cuatro que no se
                        puede deshacer. */}
                    <hr className="divider" />
                    <button
                      type="button"
                      role="menuitem"
                      className="menu-item menu-item-danger"
                      onClick={() => {
                        setMenuOpen(false);
                        askRemoveMeal();
                      }}
                    >
                      <Trash2 size={15} /> Eliminar comida
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </header>

      {/*
        ── La pauta de esta comida ────────────────────────────────────────────
        Lo que no cabe en un gramo: «aproximadamente 2 h antes de dormir», «el
        yogur, de la marca X», «si entrenas por la tarde, cámbiala por la cena».

        Va debajo de la cabecera y encima de los alimentos porque es el marco en
        el que se leen: una indicación que apareciera al final se lee después de
        haber entendido mal la comida.

        Editando siempre se ve el campo —si hay que buscar dónde escribir, no se
        escribe—; en modo consulta solo aparece si tiene algo, y con los saltos de
        línea conservados.
      */}
      {editable ? (
        <label className="meal-note">
          <NotebookPen size={14} aria-hidden="true" />
          <input
            className="input input-sm"
            value={meal.note ?? ''}
            maxLength={200}
            placeholder="Cómo cocinarlo, marcas, sustituciones… lo verá tal cual"
            onChange={(e) => onNote(e.target.value)}
            aria-label={`Pauta de ${meal.name}`}
          />
        </label>
      ) : (
        meal.note?.trim() && (
          <p className="t-sm t-secondary" style={{ whiteSpace: 'pre-wrap' }}>
            {meal.note}
          </p>
        )
      )}

      {(options.length > 1 || editable) && (
        <div className="rail" role="tablist" aria-label={`Opciones de ${meal.name}`}>
          {options.map((opt, i) => (
            <button
              key={opt.id}
              type="button"
              role="tab"
              className="chip"
              aria-pressed={i === index}
              aria-selected={i === index}
              onClick={() => setActiveOption(i)}
            >
              Opción {i + 1}
              {/*
                Las kcal de cada alternativa, solo al programar: son la suma de
                sus alimentos, y sirven para comprobar que las opciones de una
                misma comida son de verdad intercambiables. Al cliente le
                enseñaban cuatro cifras distintas para una comida que su
                entrenador fijó en una sola.
              */}
              {editable && (
                <span className="t-xs" style={{ opacity: 0.75 }}>
                  {Math.round(optionMacros(opt).kcal)}
                </span>
              )}
            </button>
          ))}
          {editable && (
            /*
              ══ Crear una alternativa te DEJA en ella ══════════════════════════

              Antes no: la pestaña nueva aparecía al final del carril y tú seguías
              en la de antes, mirando los alimentos de la opción que ya tenías
              montada. El gesto no tenía ninguna consecuencia visible salvo un
              chip más, así que se lee como que no ha funcionado — y eso lleva a
              pulsarlo dos o tres veces y acabar con alternativas vacías de más.

              La nueva se añade AL FINAL (ver `addMealOption`), así que su índice
              es el número de opciones que había. Si por lo que sea no llegara a
              crearse, el índice se recorta solo unas líneas más arriba y esto no
              deja la comida en una pestaña que no existe.
            */
            <button
              type="button"
              className="chip chip-dashed"
              onClick={() => {
                onAddOption();
                setActiveOption(options.length);
              }}
            >
              <Plus size={13} /> Alternativa
            </button>
          )}
          {/*
            ══ Y las acciones SOBRE la opción abierta, en un menú ═════════════

            El carril tenía cuatro clases de cosa seguidas y todas con la misma
            forma: las pestañas de cada opción —que son dónde ESTÁS—, «+
            Alternativa» —que crea—, «Duplicar» y «A días de descanso» —que
            actúan sobre la abierta—, y más abajo, suelto, un botón rojo de
            quitar. Con tres alternativas eran siete controles en una comida, y
            una comida no es la única de la pantalla.

            Ahora el carril dice lo que es —en qué opción estás, y añadir otra— y
            lo que se le HACE a la abierta vive en un menú, igual que en la
            cabecera de la comida. Quitar entra ahí también: estaba lejos de las
            otras tres y es la que hay que mirar dos veces antes de pulsar.
          */}
          {editable && (
            <div ref={opcionMenuRef} style={{ position: 'relative' }}>
              <button
                type="button"
                className="btn btn-icon"
                onClick={() => setOpcionMenu((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={opcionMenu}
                aria-label={`Acciones de la opción ${index + 1}`}
              >
                <MoreVertical size={16} />
              </button>

              {opcionMenu && (
                <div className="popover popover-right" style={{ top: '120%' }} role="menu">
                  {/* Solo con alimentos dentro: duplicar una opción vacía crea
                      otra vacía, que es lo mismo que «Alternativa». */}
                  {foods.length > 0 && (
                    <button
                      type="button"
                      role="menuitem"
                      className="menu-item"
                      onClick={() => {
                        onDuplicateOption(index);
                        /* La copia se inserta DETRÁS de la original (ver
                           `duplicateOption`), y se abre por lo mismo que la
                           alternativa nueva: duplicas para cambiarle algo, y
                           quedarte en el original es quedarte en lo que no vas a
                           tocar. */
                        setActiveOption(index + 1);
                        setOpcionMenu(false);
                      }}
                    >
                      <Copy size={15} /> Duplicar esta opción
                    </button>
                  )}

                  {/* Llevarse SOLO esta alternativa al otro día. Aterriza en la
                      comida que se llama igual, que es siempre la respuesta. */}
                  {foods.length > 0 && onCopyOption && (
                    <button
                      type="button"
                      role="menuitem"
                      className="menu-item"
                      onClick={() => {
                        onCopyOption(index);
                        setOpcionMenu(false);
                      }}
                    >
                      <ArrowRightLeft size={15} /> Copiar a {otherVariantLabel}
                    </button>
                  )}

                  {options.length > 1 && (
                    <>
                      <hr className="divider" />
                      <button
                        type="button"
                        role="menuitem"
                        className="menu-item menu-item-danger"
                        onClick={() => {
                          setOpcionMenu(false);
                          askRemoveOption();
                        }}
                      >
                        <Trash2 size={15} /> Quitar la opción {index + 1}
                      </button>
                    </>
                  )}
                </div>
              )}
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
        El reparto de ESTA opción, como anillo.
        --------------------------------------------------------------------
        Es lo que permite ver de un vistazo si una opción está desequilibrada y
        comparar dos alternativas de la misma comida sin hacer cuentas: dos
        anillos con el mismo lenguaje al lado. El total del día usa una barra
        —otra forma para otra escala— y la diferencia es intencionada.
      */}
      {foods.length > 0 && anillo && (
        <div className="card-inset row wrap gap-4">
          <MacroRing
            protein={anillo.protein}
            carbs={anillo.carbs}
            fats={anillo.fats}
            kcals={anillo.kcals}
            size={86}
            /*
              El pie dice de QUÉ son las cifras, que es lo que cambia entre los
              dos. Al entrenador, de la opción abierta —solo hace falta cuando
              hay más de una—. Al cliente, de la comida entera: el anillo es el
              mismo abra la opción que abra, y titularlo «Opción 1 de 3» le haría
              creer que esos gramos son los de esa alternativa.
            */
            caption={
              editable
                ? options.length > 1
                  ? `Opción ${index + 1} de ${options.length}`
                  : undefined
                : 'Objetivo de esta comida'
            }
          />
          {/*
            El objetivo, solo al programar. El cliente se queda con su anillo y
            nada más: la comparación no la puede resolver él, y metida en esta
            misma fila estrujaba la tabla de alimentos hasta dejar los nombres
            en dos letras.
          */}
          {editable && <MealGoal meal={meal} optionIndex={index} />}
        </div>
      )}

      {foods.length === 0 ? (
        <p className="t-sm t-secondary">
          {editable ? 'Sin alimentos todavía.' : 'Tu entrenador no ha detallado esta opción.'}
        </p>
      ) : (
        <div className="food-table">
          <FoodTableHead editable={editable} />
          {foods.map((food, foodIndex) => (
            <FoodRow
              key={food.id}
              food={food}
              editable={editable}
              first={foodIndex === 0}
              last={foodIndex === foods.length - 1}
              onGrams={(grams) => onGrams(index, food.id, grams)}
              onSetDisplay={(mode) => onSetDisplay?.(index, food.id, mode)}
              onDefineUnit={(label, grams) => onDefineUnit?.(index, food, label, grams)}
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
        </div>
      )}

      {editable && (
        <div className="row between wrap gap-2">
          <div className="grow" style={{ minWidth: 210 }}>
            <AddFoodControl foodLibrary={foodLibrary} onAdd={(food) => onAddFood(index, food)} />
          </div>
        </div>
      )}
    </article>
  );
};
