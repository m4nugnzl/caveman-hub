import { useState } from 'react';
import { Footprints, HeartPulse, Sparkles, Utensils } from 'lucide-react';

import { dietNotes, mealsForVariant, targetsFor } from '@/domain/nutrition';
import { Panel, SectionTitle, SegmentedControl } from '@/components/ui/primitives';
import { MealCard } from '@/components/nutrition/MealCard';
import { MacroTargetCard } from '@/components/nutrition/MacroTargetCard';
import { GoalCard } from '@/components/nutrition/GoalCard';
import { DiaResumen } from '@/components/nutrition/DiaResumen';
import { DiaPopup } from '@/components/nutrition/DiaPopup';

const VARIANT_OPTIONS = [
  { id: 'training', label: 'Días de entreno' },
  { id: 'rest', label: 'Días de descanso', tone: 'tone-cyan' },
];

/**
 * Dieta del cliente, en modo lectura.
 *
 * Reutiliza el bloque de objetivo del panel y las mismas tarjetas de comida que
 * usa el entrenador. Antes había dos renderizados distintos del mismo dato —con
 * aspecto y estructura diferentes— y el del cliente era el peor de los dos.
 *
 * ══ Y ahora también la misma MAQUETA ═══════════════════════════════════════
 *
 * Compartían las piezas y no el reparto: esto era una pila (`.stack`) de
 * paneles a todo lo ancho, mientras el lado del entrenador usa `.dieta` —el
 * menú a lo ancho y el objetivo en una columna de 300 px que le acompaña—.
 * En un portátil de 1440 px la consecuencia era una franja de mil cuatrocientos
 * píxeles para decir «1950 kcal», otra igual para «9000 pasos», y media
 * pantalla en blanco debajo.
 *
 * Se usa la rejilla que ya existe, sin CSS nuevo, incluido su caso de plan por
 * macros: sin menú no hay dos columnas, así que `.dieta.is-macros` lo pone todo
 * en una sola con ancho de documento. El porqué largo de ese reparto está en
 * `index.css`, junto a las reglas.
 */
export const ClientDiet = ({ plan, catalogFoods = [] }) => {
  const [dietView, setDietView] = useState('training');

  /*
    ══ La opción abierta de cada comida, aquí y no dentro de cada tarjeta ═════

    `MealCard` sabe llevarla sola, y así estaba. Pero desde que el portal tiene
    el resumen del día, la elección deja de ser asunto de una tarjeta: si el
    desayuno cambia a la opción 2, las kcal del día cambian. Es el mismo
    levantamiento que hace la hoja del entrenador — de ahí que `MealCard`
    acepte `opcion`/`onOpcion` desde fuera— y lo que permite contestar «si hoy
    elijo la 2 en el desayuno, ¿cuánto llevo?».
  */
  const [elegidas, setElegidas] = useState({});
  const [diaAbierto, setDiaAbierto] = useState(false);

  /* Se normaliza al leer, no al guardar: hay planes con el formato viejo —una
     cadena por nota— y tienen que seguir viéndose. */
  const notas = dietNotes(plan?.habitsNotes);

  if (!plan) {
    return (
      <Panel>
        <p className="t-sm t-secondary">Tu entrenador aún no ha configurado tu plan nutricional.</p>
      </Panel>
    );
  }

  const variant = plan.hasDayVariants ? dietView : 'default';
  const meals = mealsForVariant(plan, variant);
  const cerrado = plan.type === 'closed';

  return (
    <div className="stack dieta-pagina is-portal">
      {/*
        Con dos dietas, el selector va ARRIBA y manda también sobre el objetivo.
        Antes el objetivo mostraba siempre el de los días de entreno mientras el
        menú de abajo podía estar enseñando el de descanso: dos cifras que se
        contradecían en la misma pantalla.
      */}
      {plan.hasDayVariants && (
        <SegmentedControl
          value={dietView}
          onChange={setDietView}
          options={VARIANT_OPTIONS}
          label="Variante de dieta"
        />
      )}

      <div className={`dieta${cerrado ? '' : ' is-macros'}`}>
        {/* ── Lo que hay que hacer: el menú, o lo que lo sustituye ────────── */}
        <div className="dieta-menu">
          {cerrado && (
            <Panel className="col gap-4">
              {/*
                ══ El día, encima de las comidas ══════════════════════════════

                La misma cabecera que lleva la hoja del entrenador: lo que suman
                las opciones abiertas contra lo que le han pautado, macro a
                macro, y una puerta a la ventana del día.

                Al cliente le contesta la única pregunta que el menú por sí solo
                no contesta —«si hoy elijo esta opción en el desayuno y aquella
                en la cena, ¿me cuadra?»—, que antes había que resolver sumando
                a mano las kcal de cada comida. Y el aviso de descuadre del PLAN
                sigue sin salirle: eso es cosa de quien lo monta; esto es la
                suma de lo que él elige.
              */}
              <DiaResumen
                meals={meals}
                targets={targetsFor(plan, variant)}
                elegidas={elegidas}
                onAbrir={() => setDiaAbierto(true)}
              />

              <div className="row between wrap gap-3">
                {/* Sin `color`: el acento ES la tinta del texto, así que pintarlo
                    era un no-op — y el prop de color en un título queda para el
                    DATO (ver `ChartCard`), nunca para decorar el cromo. */}
                <SectionTitle icon={Utensils}>Mi menú</SectionTitle>
                {/*
                  ── Aquí ya no va ninguna cifra ──────────────────────────────
                  Había un «~3072 kcal/día (2081–3203)»: un total aproximado,
                  porque se calculaba con la primera opción de cada comida y
                  dejaba de ser cierto en cuanto el cliente elegía otra, más un
                  rango que tampoco se explicaba solo.

                  Y no había nada que hacer con esa cifra. El objetivo del día
                  está al lado, en su tarjeta, con las cifras que su entrenador
                  fijó; lo que se come está en cada comida. Un tercer número
                  aproximado entre los dos solo invitaba a comparar dos cosas que
                  no se comparan.
                */}
              </div>

              {meals.length === 0 ? (
                <p className="t-sm t-secondary">Tu entrenador aún no ha configurado el menú cerrado.</p>
              ) : (
                <div className="col gap-4">
                  {meals.map((meal) => (
                    /* Con el catálogo, cada alimento enseña sus equivalencias en
                       lectura: «no tengo plátanos» se resuelve aquí, sin escribir
                       al entrenador. Cambiar nada sigue sin poderse — y la lista
                       solo existe si el entrenador encendió el módulo del
                       protocolo: sin catálogo no hay botón, que es como se apaga. */
                    <MealCard
                      key={meal.id}
                      meal={meal}
                      editable={false}
                      catalogFoods={catalogFoods}
                      opcion={elegidas[meal.id] ?? 0}
                      onOpcion={(i) => setElegidas((prev) => ({ ...prev, [meal.id]: i }))}
                    />
                  ))}
                </div>
              )}
            </Panel>
          )}

          {plan.type === 'macros' && (
            <Panel>
              <p className="t-sm t-secondary">
                Tu plan es por macros: no hay un menú cerrado, sino los objetivos de arriba. Reparte
                los alimentos como quieras siempre que cuadres esas cifras al final del día.
              </p>
            </Panel>
          )}

          {/*
            Las pautas de su entrenador.

            Antes eran frases de una línea con un ✓ delante, y ese ✓ las convertía
            en una lista de normas. Ahora cada una puede llevar título y varios
            párrafos —«teniendo en cuenta tu patología…»— y por eso se pintan como
            texto y no como casillas: `pre-wrap` conserva los saltos de línea
            exactamente como los escribió, que es lo que hace que se lea como algo
            dirigido a ti.

            Van con el menú y no en la columna del objetivo porque son lo mismo
            que él: lo que hay que hacer, escrito. La columna de al lado son las
            cifras contra las que se comprueba.
          */}
          {notas.length > 0 && (
            <Panel className="col gap-3">
              <SectionTitle icon={Sparkles}>Pautas de tu entrenador</SectionTitle>
              {notas.map((note) => (
                <div className="card-inset col gap-1" key={note.id}>
                  {note.title && <span className="t-sm t-strong">{note.title}</span>}
                  <p className="t-sm pre-wrap">{note.body}</p>
                </div>
              ))}
            </Panel>
          )}
        </div>

        {/* ── Contra qué se comprueba: el objetivo y la actividad ─────────── */}
        <aside className="dieta-lado" aria-label="Mi objetivo">
          <div className="dieta-objetivos">
            <MacroTargetCard
              plan={plan}
              variant={variant}
              title={
                plan.hasDayVariants
                  ? `Mi objetivo · ${variant === 'rest' ? 'descanso' : 'entreno'}`
                  : 'Mi objetivo diario'
              }
            />
          </div>

          {/* La actividad no cambia entre las dos dietas, así que va fuera de la
              tarjeta de objetivo y no se mueve al cambiar de día. Sin objetivo
              puesto, la tarjeta no aparece: un hueco vacío solo le haría
              preguntarse si tiene que hacer algo. */}
          <div className="dieta-actividad">
            <GoalCard icon={Footprints} label="Pasos diarios" value={plan.stepsGoal} unit="pasos" numeric />
            <GoalCard icon={HeartPulse} label="Cardio de alta intensidad" value={plan.cardioGoal} />
          </div>
        </aside>
      </div>

      {/*
        La ventana del día: el anillo de lo que suma, las cuatro cifras contra
        el objetivo y la tabla del reparto por comida.

        Sin `onTarget`, que es lo que la deja de LEER: el reparto por comida lo
        decide quien monta el plan, y aquí las mismas celdas se pintan como
        texto (ver `PlanDia`). Se monta solo abierta: cerrada no calcula nada.
      */}
      {diaAbierto && (
        <DiaPopup
          open
          label={plan.hasDayVariants ? (variant === 'rest' ? 'de descanso' : 'de entreno') : 'diario'}
          meals={meals}
          targets={targetsFor(plan, variant)}
          elegidas={elegidas}
          onIrA={(i) => {
            const id = meals[i]?.id;
            setDiaAbierto(false);
            window.setTimeout(
              () => document.getElementById(`comida-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
              50
            );
          }}
          onClose={() => setDiaAbierto(false)}
        />
      )}
    </div>
  );
};
