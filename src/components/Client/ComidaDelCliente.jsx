import { useMemo, useState } from 'react';
import { IconoEquivalencia } from '@/components/ui/IconoEquivalencia';

import {
  abreviarUnidad,
  displayAsUnits,
  foodMacros,
  foodUnits,
  hasUnits,
  mealTarget,
  optionMacros,
  optionName,
  unitsLabel,
} from '@/domain/nutrition';
import { equivalencesFor, racionDe } from '@/domain/foodEquiv';
import { grupoDe } from '@/domain/gruposEquiv';
import { miles } from '@/lib/dates';
import { SegmentedControl } from '@/components/ui/primitives';
import { Desvio, MACRO_META } from '@/components/nutrition/macros';
import { dibujoDeComida } from '@/components/nutrition/dibujoDeComida';
import { useOculto } from './Oculto';

/**
 * UNA COMIDA, PARA QUIEN SE LA COME.
 *
 * ══ Por qué existe, que es la avería que arregla ═══════════════════════════
 *
 * El cliente montaba `MealCard` con `editable={false}`. `MealCard` es la pieza
 * con la que el entrenador MONTA una dieta: mil seiscientas líneas de asa de
 * arrastre, renombrar en sitio, duplicar la opción, guardarla como plato,
 * copiarla al portapapeles, la nota, los micros y el diálogo del alimento. En
 * modo consulta todo eso se apaga, pero lo que queda es su ESQUELETO, y el
 * esqueleto es el del editor:
 *
 *   · la cabecera numerada y el acordeón con su chevron;
 *   · `FoodTableHead` —«Alimento · Cantidad · P · C · G · Kcal»—, seis columnas
 *     que son las de quien cuadra un día, no las de quien se lo come;
 *   · el anillo «Objetivo de esta comida», que además SOLO se pintaba para el
 *     cliente (`!editable`) y contradice la ley escrita en `CifraDelDia`: la
 *     dieta pauta, no contabiliza, y aquí no hay nada que aprobar ni suspender.
 *
 * Mientras su dieta montara esa pieza, la pantalla no podía parecerse a
 * `docs/portal-dos-aparatos.html` por mucho que se corrigiera lo de alrededor:
 * la comida es ocho de cada diez píxeles de esa pantalla.
 *
 * ══ Lo que sí se comparte, y por qué ══════════════════════════════════════
 *
 * Nada de esto es una segunda copia de la dieta: los macros, la ración, el
 * reparto de equivalencias y el juicio del desvío siguen saliendo del dominio
 * y de `macros`. Lo único que deja de compartirse es la MAQUETA, que es justo
 * lo que tenía que dejar de compartirse.
 *
 * ══ Las dos formas ════════════════════════════════════════════════════════
 *
 *   · **teléfono** — una opción a la vista, elegida con el segmentado. Cuatro
 *     listas desplegadas a la vez son el acordeón que el dueño ya señaló como
 *     incómodo, y además se llevan la mitad del scroll.
 *   · **escritorio** — todas las opciones en una fila, que es lo que en 392 px
 *     no cabe y en un monitor se mira de un vistazo. Ahí el segmentado sobra.
 */

/** «100 g», «2 ud» — y el nombre entero en el `title`, como en la hoja. */
const cantidadDe = (food) => {
  if (!displayAsUnits(food)) return { texto: `${food.grams} g`, titulo: undefined };
  return {
    texto: `${String(foodUnits(food)).replace('.', ',')} ${abreviarUnidad(food.unitLabel)}`,
    titulo: hasUnits(food) ? `${unitsLabel(food)} · ${food.grams} g` : undefined,
  };
};

/**
 * UN ALIMENTO, Y SU SALIDA.
 *
 * Tres columnas —qué, cuánto, cuántas kcal— y nada más. Las cuatro cifras de la
 * tabla del entrenador (P, C, G y kcal alimento a alimento) son el instrumental
 * de quien cuadra el día: el que come ya tiene la cuenta hecha arriba.
 *
 * ══ Y aquí es donde viven las equivalencias ════════════════════════════════
 *
 * El sitio donde se pregunta «no tengo plátanos» es ESTA fila, con el desayuno
 * delante. El cliente no decide nada —no cambia su dieta—, así que no hay «Usar»
 * ni ventana: se abre, se lee lo que hay que pesar y se cierra. Lo único que se
 * añade es el dibujo del cambio pegado al nombre, que es lo que dice que esa
 * fila tiene salida.
 */
const AlimentoDelCliente = ({ food, catalogFoods, grupos, sinCifras, conKcal }) => {
  const [abierto, setAbierto] = useState(false);
  const macros = foodMacros(food);
  const { texto, titulo } = cantidadDe(food);

  /* Tu grupo manda sobre el catálogo: si este alimento está en uno, la lista
     son los que escribió tu entrenador y ninguno más. */
  const grupo = useMemo(
    () => grupoDe(food.name, grupos, catalogFoods),
    [food.name, grupos, catalogFoods]
  );
  const equivalencias = useMemo(
    () => (catalogFoods.length ? equivalencesFor(food, catalogFoods, [], { grupo }) : null),
    [food, catalogFoods, grupo]
  );
  /* Un alimento excluido no enseña botón: para él la lista no existe, no está
     «desactivada». Ver `MealCard`, que es donde el entrenador la apaga. */
  const conSalida = Boolean(equivalencias && !food.equivHidden);

  const nombre = (
    <span className="cc-a">
      {food.name}
      {conSalida && (
        <span className="cc-cambio" aria-hidden="true">
          <IconoEquivalencia size={13} />
        </span>
      )}
    </span>
  );

  const cifras = (
    <>
      <span className="cc-q" title={titulo}>
        {texto}
      </span>
      {conKcal && !sinCifras && <span className="cc-k">{Math.round(macros.kcal)}</span>}
    </>
  );

  const macroMeta = MACRO_META.find((m) => m.key === equivalencias?.macro);
  const nombreMacro = (macroMeta?.label || '').toLowerCase();

  return (
    <>
      {conSalida ? (
        <button
          type="button"
          className="cc-alim es-abre"
          aria-expanded={abierto}
          onClick={() => setAbierto((v) => !v)}
          aria-label={`Con qué puedes cambiar ${food.name}`}
        >
          {nombre}
          {cifras}
        </button>
      ) : (
        <div className="cc-alim">
          {nombre}
          {cifras}
        </div>
      )}

      {abierto && conSalida && (
        <div className="cc-equivs" role="group" aria-label={`Equivalencias de ${food.name}`}>
          {/* Con un grupo TUYO van todas: esa lista la podó tu entrenador y es
              corta por construcción, así que cortarle la cola sería esconder la
              mitad de una decisión ya tomada. Sin grupo, tres: aquí se viene a
              ver que HAY salida, no a comparar el catálogo entero. */}
          {(equivalencias.grupo ? equivalencias.items : equivalencias.items.slice(0, 3)).map(
            (item) => (
              <div className="cc-eq" key={item.food.id || item.food.name}>
                <div className="cc-eq-l1">
                  <span className="cc-a">{item.food.name}</span>
                  <span className="cc-q">{racionDe(item, { corta: true })}</span>
                </div>
                {!sinCifras && (
                  <p className="cc-eq-c">
                    {item.macroGrams} g de {nombreMacro}
                    <Desvio
                      diff={item.macroDiff}
                      de={item.macroGrams - item.macroDiff}
                      campo={equivalencias.macro}
                    />
                    <span className="cc-sep">·</span>
                    {item.kcal} kcal
                    <Desvio diff={item.kcalDiff} de={item.kcal - item.kcalDiff} campo="kcals" />
                  </p>
                )}
              </div>
            )
          )}
        </div>
      )}
    </>
  );
};

/** Los alimentos de UNA opción. */
const ListaDeAlimentos = ({ foods, catalogFoods, grupos, sinCifras, conKcal }) =>
  foods.length === 0 ? (
    <p className="t-sm t-tertiary">Tu entrenador no ha detallado esta opción.</p>
  ) : (
    foods.map((food) => (
      <AlimentoDelCliente
        key={food.id}
        food={food}
        catalogFoods={catalogFoods}
        grupos={grupos}
        sinCifras={sinCifras}
        conKcal={conKcal}
      />
    ))
  );

/**
 * @param meal     La comida (`{ id, name, note, target, options }`).
 * @param opcion   Índice de la opción abierta. La guarda quien monta la
 *   pantalla, no esta tarjeta: lo que suman las opciones abiertas se lee en una
 *   fila de más abajo, y ese levantamiento ya lo hacía la hoja del entrenador.
 * @param onOpcion Al cambiar de opción.
 * @param aLoAncho Todas las opciones a la vez (escritorio).
 * @param catalogFoods / @param grupos  De dónde salen las equivalencias. Sin
 *   catálogo —el módulo apagado— ningún alimento enseña salida.
 */
export const ComidaDelCliente = ({
  meal,
  opcion = 0,
  onOpcion,
  aLoAncho = false,
  catalogFoods = [],
  grupos = [],
}) => {
  const oculto = useOculto();
  const sinCifras = oculto.nutrition;

  const options = meal?.options || [];
  const Dibujo = dibujoDeComida(meal?.name);
  /* Lo ESTIPULADO para esta comida, no lo que suma la opción abierta: su plan es
     lo que su entrenador fijó, y no cambia según la alternativa que mire. Sin
     objetivo escrito, la cabecera calla en vez de inventar una cifra. */
  const objetivo = mealTarget(meal);
  const kcal = objetivo?.kcals || 0;

  const activa = Math.min(Math.max(opcion, 0), Math.max(options.length - 1, 0));

  return (
    <section className="comida-cliente" id={`comida-${meal.id}`}>
      <header className="cc-cab">
        <span className="list-icon" aria-hidden="true">
          <Dibujo size={15} />
        </span>
        <h3 className="cc-nombre">{meal.name}</h3>
        {options.length > 1 && (
          /* «4 opciones» en el teléfono y «4 opciones · elige una» en el
             monitor. La segunda mitad es la instrucción, y en el teléfono no
             hace falta: allí las opciones se cambian con un segmentado que se
             ve, y debajo hay UNA lista. En el monitor están las cuatro en fila
             y sin esa media línea parecen cuatro cosas que comer. */
          <span className="cc-meta">
            {options.length} opciones{aLoAncho ? ' · elige una' : ''}
          </span>
        )}
        {kcal > 0 && !sinCifras && <span className="cc-kcal">{miles(kcal)} kcal</span>}
      </header>

      {/* La pauta que escribió su entrenador —«2 h antes de dormir», «el yogur,
          de la marca X»—. Va encima de los alimentos porque es el marco en el
          que se leen. */}
      {meal.note && <p className="cc-nota">{meal.note}</p>}

      {aLoAncho && options.length === 1 ? (
        /* ── UNA SOLA OPCIÓN NO ES UNA OPCIÓN ──────────────────────────────
           Medido contra la dieta de la demo: con una alternativa, la rejilla
           daba una caja hundida a todo lo ancho rotulada «Opción 1», o sea una
           pared y una etiqueta alrededor de la única lista que hay. Elegir
           entre una no es elegir, y en el teléfono ya se resolvía así —el
           segmentado no se pinta—; esto es la misma regla en el monitor. */
        <ListaDeAlimentos
          foods={options[0]?.foods || []}
          catalogFoods={catalogFoods}
          grupos={grupos}
          sinCifras={sinCifras}
          conKcal
        />
      ) : aLoAncho ? (
        /* Todas las opciones, una al lado de otra. Las columnas se cuentan
           solas: da igual que su entrenador monte dos alternativas o seis. */
        <div className="cc-ops">
          {options.map((option, i) => (
            <div className="cc-op" key={option.id || i}>
              <div className="cc-ot">
                <b>{optionName(option, i)}</b>
                {!sinCifras && <span>{Math.round(optionMacros(option).kcal)}</span>}
              </div>
              <ListaDeAlimentos
                foods={option.foods || []}
                catalogFoods={catalogFoods}
                grupos={grupos}
                sinCifras={sinCifras}
                conKcal={false}
              />
            </div>
          ))}
        </div>
      ) : (
        <>
          {options.length > 1 && (
            <SegmentedControl
              label={`Las opciones de ${meal.name}`}
              value={String(activa)}
              onChange={(v) => onOpcion?.(Number(v))}
              options={options.map((option, i) => ({
                id: String(i),
                /* La primera dice «Opción 1» y las demás su número: la palabra
                   una vez enseña de qué va la fila, y repetida cuatro veces se
                   come el ancho que necesitan los números. */
                label: i === 0 ? optionName(option, i) : String(i + 1),
              }))}
            />
          )}
          {/* Aquí había un renglón explicando que hay que elegir una de las N
              opciones. Se va: lo dice el segmentado, que está justo encima y es
              un mando de toda la vida, y lo dice la cabecera. Una frase que
              explica el control que tiene al lado es la primera que sobra
              cuando la pantalla se ve cargada, que es de lo que se quejó el
              dueño del teléfono. */}
          <ListaDeAlimentos
            foods={options[activa]?.foods || []}
            catalogFoods={catalogFoods}
            grupos={grupos}
            sinCifras={sinCifras}
            conKcal
          />
        </>
      )}
    </section>
  );
};
