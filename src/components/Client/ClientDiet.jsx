import { useState } from 'react';
import { Footprints, HeartPulse, Sparkles, Utensils } from 'lucide-react';

import { cycleMap, dietNotes, mealsForVariant, planDays, targetsFor } from '@/domain/nutrition';
import { WEEK_DAYS } from '@/domain/training';
import { enumeraEs } from '@/lib/texto';
import { Panel, SectionTitle, SegmentedControl } from '@/components/ui/primitives';
import { MealCard } from '@/components/nutrition/MealCard';
import { GoalCard } from '@/components/nutrition/GoalCard';
import { ObjetivoDelDia } from '@/components/nutrition/LecturasDeLaDieta';
import { DiaPopup } from '@/components/nutrition/DiaPopup';
import { PlanDia } from '@/components/nutrition/PlanDia';
import { useOculto } from './Oculto';

/**
 * AQUÍ ESTUVO `VARIANT_OPTIONS`, escrita a mano y con dos entradas: «Días de
 * entreno» y «Días de descanso». Era una de las cinco copias de la misma pareja
 * repartidas por el código, y la que peor envejecía: los días del plan salen de
 * `planDays` y hoy pueden ser uno, dos o siete.
 */

/**
 * QUÉ DÍA DE DIETA LE TOCA HOY, si su entrenador ha repartido su ciclo.
 *
 * ══ Por qué esto es una avería y no una mejora ═════════════════════════════
 *
 * La aplicación SABE qué días entrena esta persona —lo dice el `weeklySplit` de
 * su programa— y aun así le pedía que eligiera a mano su variante con un
 * conmutador, cada vez que abría su dieta, aunque fuera domingo. Preguntarle
 * algo que ya sabes es, en la práctica, pedirle que haga tu trabajo; y quien se
 * equivoca al contestar come lo que no le tocaba.
 *
 * Con el reparto puesto, el conmutador deja de ser una pregunta y pasa a ser un
 * rótulo —«Hoy, jueves: Bajo»— con los otros días detrás por si quiere mirarlos.
 * Sin reparto no se adivina: se abre por el primero y se dice que son suyos
 * todos, que es la verdad de un plan sin repartir.
 *
 * ── «Hoy» solo existe si su ciclo es la semana ────────────────────────────
 * En un ciclo rotativo no hay martes: hay un día 3 de cinco que cae donde caiga
 * según cuándo empezó la vuelta, y la aplicación NO guarda esa fecha en ninguna
 * parte (`buildStrip` marca «hoy» solo en el semanal, por lo mismo). Así que
 * aquí no se adivina: se dice la regla —«Alto los días de Empuje y Tirón»— y
 * elige la persona, que es quien sabe qué entrena hoy.
 */
const diaDeHoy = (plan, casillas) => {
  /* `getDay()` da 0 en domingo; `WEEK_DAYS` empieza en lunes. */
  const hoy = WEEK_DAYS[(new Date().getDay() + 6) % 7];
  const casilla = casillas.find((c) => c.key === hoy);
  if (!casilla) return { weekday: null, dayId: null };
  return { weekday: hoy, dayId: cycleMap(plan, casillas)[hoy] || null };
};

/**
 * LA REGLA, para quien no tiene días de la semana: «Alto los días de Empuje y
 * Tirón · Bajo los días de descanso». Se dice una vez, arriba, y el carril de
 * abajo sigue siendo el que elige.
 */
const reglaDelCiclo = (plan, dias, casillas) => {
  const mapa = cycleMap(plan, casillas);
  return dias
    .map((dia) => {
      const suyas = casillas.filter((c) => mapa[c.key] === dia.id);
      if (suyas.length === 0) return null;
      /* Sin repetir: tres descansos en la misma vuelta son «los días de
         descanso», no «descanso, descanso y descanso». */
      const donde = [...new Set(suyas.map((c) => c.sesion || 'descanso'))];
      return { id: dia.id, name: dia.name, donde: enumeraEs(donde) };
    })
    .filter(Boolean);
};

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
 * Se usa la rejilla que ya existe, sin CSS nuevo. Y ahora también en los planes
 * por macros: la excepción `.dieta.is-macros` —que ponía esa forma de plan en
 * una sola columna, o sea en otra pantalla— se ha ido de las dos caras de la
 * aplicación a la vez. Un plan por macros no es otra pantalla: es la misma con
 * menos que poner.
 */
export const ClientDiet = ({ plan, casillas = [], catalogFoods = [], grupos = [], catalogo = null }) => {
  /* Nulo hasta que se elige otro: entonces manda el que toca hoy, y si no hay
     reparto, el primero. Ver `diaDeHoy`. */
  const [dietView, setDietView] = useState(null);

  /*
    ══ Su menú sin cifras ═════════════════════════════════════════════════════

    Con las kcal ocultas, lo que se va son los NÚMEROS —el objetivo del día, el
    resumen contra ese objetivo, su ventana y las cuatro columnas de cada
    alimento— y lo que se queda es el plan entero: qué come, cuánto pesa cada
    cosa, sus opciones y las pautas escritas de su entrenador. Que es, por
    cierto, como se lleva a esta persona fuera de la aplicación. Ver
    `Oculto.jsx` y `HIDDEN_INFO` en `domain/protocol.js`.
  */
  const oculto = useOculto();

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

  const dias = planDays(plan);
  const hoy = diaDeHoy(plan, casillas);
  /* La regla solo cuando no hay «hoy» que dar: las dos a la vez serían decir lo
     mismo dos veces, y la de hoy es la que contesta la pregunta de verdad. */
  const regla = hoy.dayId ? [] : reglaDelCiclo(plan, dias, casillas);
  /* Lo elegido a mano manda; si no, el que toca hoy; si no hay reparto, el
     primero. `dayById` resuelve el último tramo por si el id se queda rancio. */
  const diaActivo = dias.find((d) => d.id === (dietView || hoy.dayId)) || dias[0];
  const variant = diaActivo.id;
  const meals = mealsForVariant(plan, variant);
  const cerrado = plan.type === 'closed';

  /* `is-portal` se fue con su única regla: existía para subir el objetivo por
     delante del menú en una columna, y eso ya no se hace. Ver `revision.css`,
     «AQUÍ EL OBJETIVO IBA DELANTE DEL MENÚ». */
  return (
    <div className="stack dieta-pagina">
      {/*
        Con varios días, el selector va ARRIBA y manda también sobre el objetivo.
        Antes el objetivo mostraba siempre el de los días de entreno mientras el
        menú de abajo podía estar enseñando el de descanso: dos cifras que se
        contradecían en la misma pantalla.

        ── Y con la semana repartida deja de ser una pregunta ────────────────
        Encima del carril va lo que su entrenador ya decidió: «Hoy, jueves: te
        toca Bajo». El carril se queda para mirar los otros días, no para elegir
        el de hoy. Ver `diaDeHoy`.
      */}
      {dias.length > 1 && (
        <div className="col gap-2">
          {/* El nombre del día va TAL CUAL lo escribió su entrenador: es un
              nombre propio de su plan —«Alto», «Bajo», «Piernas»— y en
              minúsculas se leía como un adjetivo suelto («te toca bajo»). */}
          {hoy.dayId && (
            <p className="t-sm t-secondary" style={{ margin: 0 }}>
              Hoy, {hoy.weekday.toLowerCase()}, te toca{' '}
              <b>{dias.find((d) => d.id === hoy.dayId)?.name}</b>.
            </p>
          )}
          {/* Y si su ciclo no tiene días de la semana, la regla. Ver
              `reglaDelCiclo`: aquí no se adivina qué toca hoy. */}
          {regla.length > 0 && (
            <p className="t-sm t-secondary" style={{ margin: 0 }}>
              {regla.map((r, i) => (
                <span key={r.id}>
                  {i > 0 && ' · '}
                  <b>{r.name}</b> los días de {r.donde}
                </span>
              ))}
              .
            </p>
          )}
          <SegmentedControl
            value={variant}
            onChange={setDietView}
            options={dias.map((d) => ({ id: d.id, label: d.name }))}
            label="Día de dieta"
          />
        </div>
      )}

      <div className="dieta">
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
              {/*
                ── SIN MENÚ NO SE PINTA: cuatro ceros no son una lectura ──────
                Esta tarjeta suma lo que él elige y lo pone contra su objetivo.
                En un día que su entrenador todavía no ha llenado —«te toca
                Bajo» y el Bajo está vacío— salía entera con «0/3050», «0/156 g»,
                «0/320 g» y «0/92 g»: cuatro cifras diciendo que no hay nada,
                justo debajo de la tarjeta que ya le dice cuál es su objetivo.
                Sin comidas no hay elección que hacer y no hay nada que sumar.
              */}
              {/*
                ── Y ESTA TARJETA SE FUE AL PIE, con el objetivo ──────────────
                Sumar lo que él elige es una LECTURA, no lo que tiene que hacer,
                y en el teléfono ocupaba trescientos ochenta píxeles por delante
                del primer alimento. Vive con el objetivo, en el costado, que es
                exactamente donde vive en la pantalla del entrenador. Ver abajo.
              */}

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
                /* «El menú cerrado» es cómo lo llamamos nosotros por dentro, no
                   algo que él haya oído nunca. Lo que necesita saber es que ahí
                   todavía no hay comidas y que no le falta hacer nada. */
                <p className="t-sm t-secondary">
                  {dias.length > 1
                    ? `Tu entrenador todavía no ha puesto las comidas de ${diaActivo.name.toLowerCase()}.`
                    : 'Tu entrenador todavía no ha puesto tus comidas.'}
                </p>
              ) : (
                <div className="col gap-4">
                  {meals.map((meal, i) => (
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
                      grupos={grupos}
                      opcion={elegidas[meal.id] ?? 0}
                      onOpcion={(k) => setElegidas((prev) => ({ ...prev, [meal.id]: k }))}
                      /*
                        ── TODAS PLEGADAS MENOS LA PRIMERA ────────────────────
                        Su dieta empezaba a los novecientos píxeles de deslizar:
                        título, cinta de días, objetivo, pasos y el resumen de
                        macros iban antes que el primer alimento, y su única
                        pregunta es qué come. Con las comidas plegadas el día
                        entero cabe de un vistazo, y la primera está abierta.

                        Plegada no es escondida: cada línea dice su nombre y de
                        qué se compone. Ver «PLEGAR LA COMIDA» en `MealCard`.
                      */
                      plegadaAlInicio={i > 0}
                    />
                  ))}
                </div>
              )}
            </Panel>
          )}

          {plan.type === 'macros' && (
            <Panel className="col gap-4">
              <p className="t-sm t-secondary">
                {oculto.nutrition
                  ? `Tu plan no lleva un menú cerrado: comes lo que acordéis y tu entrenador lleva las cifras.${notas.length > 0 ? ' Sus pautas están aquí debajo.' : ''}`
                  : meals.length > 0
                    ? 'Tu plan es por macros: no hay un menú cerrado, sino un reparto. Come lo que quieras en cada comida mientras cuadres estas cifras.'
                    : 'Tu plan es por macros: no hay un menú cerrado, sino los objetivos de arriba. Reparte los alimentos como quieras siempre que cuadres esas cifras al final del día.'}
              </p>

              {/*
                ── El reparto que le han hecho, si se lo han hecho ───────────
                Cuando el entrenador reparte el día entre comidas, eso ES el
                plan de esta persona, y hasta ahora no salía por ningún lado: se
                escribía en una tabla que solo existía en el lado del
                entrenador. Es la misma pieza sin `onTarget`, o sea en lectura
                (ver `PlanDia`), y sin juzgar nada: cuadrar el reparto es
                trabajo de quien lo montó.
              */}
              {!oculto.nutrition && meals.length > 0 && (
                <PlanDia meals={meals} targets={targetsFor(plan, variant)} elegidas={elegidas} juzga={false} />
              )}
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
        <aside className="dieta-lado es-panel" aria-label={oculto.nutrition ? 'Mi actividad' : 'Mi objetivo'}>
          {/*
            ══ SU OBJETIVO Y SU DÍA: LA MISMA SECCIÓN QUE VE SU ENTRENADOR ════

            Aquí había DOS piezas para lo que en la pantalla del entrenador es
            una: `MacroTargetCard` con el objetivo y, debajo y en otra caja,
            `DiaResumen` —hoy borrada— con lo que suma lo que ha elegido. Dos listas de tres
            macros, dos cifras de kcal, dos dibujos — y ninguna de las dos era
            la que se usa al otro lado, así que cada arreglo había que hacerlo
            dos veces y a veces solo se hacía una. De ahí salieron el «Mi
            objetivo · entreno» que decía «entreno» mirara el día que mirara y
            los cuatro ceros del día sin llenar.

            Es `ObjetivoDelDia`, la misma pieza y la misma maqueta, con tres
            cosas apagadas porque no son suyas:
            · `onEditar` — el objetivo lo pone su entrenador.
            · `juzga` — las cifras se enseñan sin colorear ni dar veredicto: un
              descuadre del plan es del trabajo de su entrenador y él no puede
              tocarlo. (`MacroTargetCard` ya se lo escondía y `DiaResumen` se lo
              volvía a pintar en rojo dos dedos más abajo: una pieza le protegía
              y la otra no.)
            · `conGkg` — los g/kg se leen contra sus pesajes y son la cifra con
              la que se juzga si el plan está bien planteado, no la suya.

            Sin menú no se pinta la suma: en un día que su entrenador todavía no
            ha llenado salían cuatro ceros justo debajo de su objetivo.
          */}
          {!oculto.nutrition && (
            <div className="dieta-objetivos">
              <ObjetivoDelDia
                meals={cerrado ? meals : []}
                targets={targetsFor(plan, variant)}
                elegidas={elegidas}
                juzga={false}
                conGkg={false}
                onAbrir={meals.length > 0 ? () => setDiaAbierto(true) : null}
                /* El nombre del día TAL CUAL lo escribió su entrenador, que es
                   el que lee en la cinta de arriba. Con un solo día no hay
                   nombre que dar: es «su objetivo» y ya. */
                titulo={dias.length > 1 ? diaActivo.name : 'Mi objetivo diario'}
                /* La misma ficha de referencia que usa su entrenador para
                   rellenar lo que la copia congelada del alimento no diga del
                   envase. Sin ella, la fibra de su dieta diría «no dice» en su
                   app y una cifra en la de él: la misma pregunta con dos
                   respuestas según quién mire. Ver `declaredMicro`. */
                catalogo={catalogo}
              />
            </div>
          )}

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
      {diaAbierto && !oculto.nutrition && (
        <DiaPopup
          open
          /* El mismo arreglo que el rótulo del objetivo: el nombre del día que
             está mirando, no la pareja training/rest que ya no existe. */
          label={dias.length > 1 ? `de ${diaActivo.name.toLowerCase()}` : 'diario'}
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
