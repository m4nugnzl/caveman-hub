import { useState } from 'react';
import { ChevronDown, ChevronUp, Copy, Pencil, Plus, Trash2, X } from 'lucide-react';

import {
  displayAsUnits,
  foodMacros,
  foodUnits,
  gramsFromUnits,
  hasUnits,
  mealKcalRange,
  optionMacros,
  unitsLabel,
} from '@/domain/nutrition';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { Field } from '@/components/ui/primitives';
import { AddFoodControl } from './AddFoodControl';
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
    <span>Alimento</span>
    <span>Cantidad</span>
    {MACRO_META.map(({ key, short, color }) => (
      <span key={key} style={{ color }}>
        {short}
      </span>
    ))}
    <span>Kcal</span>
    {/* Dos huecos al editar: ordenar y borrar. Uno solo desalinearía la columna
        de kcal respecto a las filas. */}
    {editable && <span />}
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
const FoodRow = ({ food, editable, onGrams, onSetDisplay, onDefineUnit, onMove, onRemove, first, last }) => {
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
    <div className="food-row">
      <span className="name">{food.name}</span>

      <span className="grams" title={equivalencia}>
        {editable ? (
          <input
            type="text"
            inputMode="decimal"
            className="input input-sm input-center"
            style={{ width: 54 }}
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
          La medida es un desplegable mientras se edita, y texto cuando solo se
          consulta —al cliente no le sirve de nada un control que no puede usar—.

          «Definir…» es la tercera opción y la que faltaba: sin ella, un alimento
          que ya está en la biblioteca sin unidad no tenía NINGÚN camino para
          recibirla, porque el único formulario que la pedía era el de alta.
        */}
        {editable ? (
          <select
            className="unit-select"
            value={porUnidades ? 'units' : 'grams'}
            onChange={(e) =>
              e.target.value === 'define' ? setDefiniendo(true) : onSetDisplay(e.target.value)
            }
            aria-label={`Medida de ${food.name}`}
          >
            <option value="grams">g</option>
            {sePuede && <option value="units">{abreviar(food.unitLabel)}</option>}
            <option value="define">{sePuede ? 'Cambiar unidad…' : 'Definir unidad…'}</option>
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

      {/*
        Subir y bajar el alimento.

        Van dentro de la celda de borrar y no en una columna propia: siete
        columnas ya son las que caben, y en el móvil la rejilla se parte en dos
        filas. Aparecen al pasar por encima o al enfocar con el teclado —el CSS lo
        resuelve—, así que no compiten con las cifras, que es lo que se lee.
      */}
      {editable && onMove && (
        <span className="food-order">
          <button
            type="button"
            className="btn-plain"
            onClick={() => onMove(-1)}
            disabled={first}
            aria-label={`Subir ${food.name}`}
          >
            <ChevronUp size={12} />
          </button>
          <button
            type="button"
            className="btn-plain"
            onClick={() => onMove(1)}
            disabled={last}
            aria-label={`Bajar ${food.name}`}
          >
            <ChevronDown size={12} />
          </button>
        </span>
      )}

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

  if (!definiendo) return row;

  return (
    <div className="col gap-2">
      {row}
      <UnitForm
        food={food}
        onCancel={() => setDefiniendo(false)}
        onSave={(unitLabel, unitGrams) => {
          onDefineUnit(unitLabel, unitGrams);
          setDefiniendo(false);
        }}
      />
    </div>
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
const UnitForm = ({ food, onCancel, onSave }) => {
  const [label, setLabel] = useState(food.unitLabel || '');
  const [grams, setGrams] = useState(food.unitGrams || '');

  const limpio = label.trim();
  const gramos = Number(String(grams).replace(',', '.'));
  const valido = limpio.length > 0 && Number.isFinite(gramos) && gramos > 0;

  return (
    <form
      className="card-inset col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valido) onSave(limpio, gramos);
      }}
    >
      <span className="section-label">Cómo se cuenta {food.name}</span>

      <div className="row-end wrap gap-2">
        <Field label="Se cuenta en" hint="En singular: huevo, rebanada, cucharada…" className="grow">
          {(props) => (
            <input
              {...props}
              autoFocus
              className="input"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="huevo"
            />
          )}
        </Field>

        <Field label="g por unidad" className="shrink-0">
          {(props) => (
            <input
              {...props}
              type="text"
              inputMode="decimal"
              className="input input-center"
              style={{ width: 72 }}
              value={grams}
              onChange={(e) => setGrams(e.target.value)}
              placeholder="55"
            />
          )}
        </Field>
      </div>

      {/*
        Lo que va a pasar con ESTE alimento y sus gramos actuales, antes de
        guardar. Es lo que convierte dos casillas en una decisión: se ve al
        momento si 55 es el peso correcto de una pieza o si te has equivocado de
        orden de magnitud.
      */}
      <p className="t-xs t-secondary">
        {valido ? (
          <>
            1 {limpio} = {gramos} g. Los {food.grams} g de ahora se leerán como{' '}
            <strong>{unitsLabel({ ...food, unitLabel: limpio, unitGrams: gramos })}</strong>.
          </>
        ) : (
          'Se guarda en tu biblioteca: la próxima vez que añadas este alimento a cualquier dieta ya vendrá con su unidad.'
        )}
      </p>

      <div className="row gap-2">
        <button type="submit" className="btn btn-primary btn-sm" disabled={!valido}>
          Guardar
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
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
  firstMeal,
  lastMeal,
}) => {
  const confirm = useConfirm();
  const [activeOption, setActiveOption] = useState(0);
  const [editingName, setEditingName] = useState(false);

  const options = meal.options || [];
  const index = Math.min(activeOption, Math.max(0, options.length - 1));
  const option = options[index];
  const kcal = mealKcalRange(meal);
  const totals = optionMacros(option);
  const foods = option?.foods || [];

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

        <div className="row gap-2 shrink-0">
          <span className="meal-kcal">
            {kcal.first} kcal
            {kcal.varies && (
              <span className="t-xs" style={{ opacity: 0.75, fontWeight: 550 }}>
                {' '}
                ({kcal.min}–{kcal.max})
              </span>
            )}
          </span>
          {editable && (
            <>
              {/* Mover la comida y duplicarla. En la cabecera y no en un menú:
                  son tres acciones, y un menú para tres cosas es un clic de más
                  en la operación que más se repite al montar un día. */}
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
              {onDuplicateMeal && (
                <button
                  type="button"
                  className="btn btn-icon"
                  onClick={onDuplicateMeal}
                  aria-label={`Duplicar ${meal.name}`}
                  title="Duplicar la comida con todas sus alternativas"
                >
                  <Copy size={14} />
                </button>
              )}
              <button
                type="button"
                className="btn btn-icon btn-icon-danger"
                onClick={askRemoveMeal}
                aria-label={`Eliminar ${meal.name}`}
              >
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      </header>

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
              <span className="t-xs" style={{ opacity: 0.75 }}>
                {Math.round(optionMacros(opt).kcal)}
              </span>
            </button>
          ))}
          {editable && (
            <button type="button" className="chip chip-dashed" onClick={onAddOption}>
              <Plus size={13} /> Alternativa
            </button>
          )}
          {/*
            Duplicar la alternativa abierta.

            Es el atajo que más se usa y el que faltaba: la segunda opción de una
            comida casi nunca se monta desde cero, sino que es la primera con el
            arroz cambiado por pasta. Sin esto había que volver a buscar y añadir
            los cinco alimentos uno a uno.

            Solo aparece con alimentos dentro: duplicar una opción vacía crea otra
            vacía, que es lo mismo que «Alternativa» y confunde tener las dos.
          */}
          {editable && foods.length > 0 && (
            <button
              type="button"
              className="chip chip-dashed"
              onClick={() => onDuplicateOption(index)}
              title={`Crear una alternativa copiando la opción ${index + 1}`}
            >
              <Copy size={13} /> Duplicar
            </button>
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
      {foods.length > 0 && (
        <div className="card-inset">
          <MacroRing
            protein={totals.protein}
            carbs={totals.carbs}
            fats={totals.fats}
            kcals={totals.kcal}
            size={86}
            caption={options.length > 1 ? `Opción ${index + 1} de ${options.length}` : undefined}
          />
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
            />
          ))}
        </div>
      )}

      {editable && (
        <div className="row between wrap gap-2">
          <div className="grow" style={{ minWidth: 210 }}>
            <AddFoodControl foodLibrary={foodLibrary} onAdd={(food) => onAddFood(index, food)} />
          </div>
          {options.length > 1 && (
            <button type="button" className="btn btn-danger btn-sm" onClick={askRemoveOption}>
              <Trash2 size={13} /> Quitar opción {index + 1}
            </button>
          )}
        </div>
      )}
    </article>
  );
};
