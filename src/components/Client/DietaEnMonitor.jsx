import { useState } from 'react';

import { Fila, Grupo } from '@/components/ui/Grupo';
import { DiaPopup } from '@/components/nutrition/DiaPopup';
import { MacroTargetCard } from '@/components/nutrition/MacroTargetCard';
import { MealCard } from '@/components/nutrition/MealCard';
import { PlanDia } from '@/components/nutrition/PlanDia';
import { TarjetasDeDia } from '@/components/nutrition/TarjetasDeDia';
import { LecturasDeLaDieta } from '@/components/nutrition/LecturasDeLaDieta';
import { DiaDeManana, DiaEspecial } from './DiaEspecial';

/**
 * «DIETA» EN EL MONITOR — la mesa y el costado del taller, sin sus verbos.
 *
 * ══ Qué se quejaba el dueño ════════════════════════════════════════════════
 *
 *   *«Dieta es feo, cambiar entre opciones se ve mal, son visiones planas y
 *   poco estéticas; en entrenador es mucho mejor.»*
 *
 * Las tres frases apuntan al mismo sitio, y no es el acabado:
 *
 *   · **«Cambiar entre opciones se ve mal.»** El portal enseñaba UNA opción y
 *     al pie un mando callado —*Opción 1 de 4 · Cambiar*— que pasaba a la
 *     siguiente. Para ver la cuarta había que pasar por la segunda y la
 *     tercera, y a ciegas: la única manera de saber qué había en cada una era
 *     ir pulsando. La comida del entrenador tiene las opciones como PESTAÑAS,
 *     con su cifra, y se elige mirando.
 *   · **«Visiones planas.»** Una tabla de tres columnas por comida, sin el
 *     anillo del día, sin los g/kg, sin la evolución de lo pautado. El costado
 *     del entrenador (`LecturasDeLaDieta`) es exactamente eso, y ya existía.
 *   · **«En entrenador es mucho mejor.»** Literal: eran dos dibujos del mismo
 *     plan y el bueno estaba escrito.
 *
 * ══ Se monta la comida del taller, y no una copia ══════════════════════════
 *
 * `MealCard` nace con `editable = false` —lo dice su firma— y trae escrito lo
 * que hace en el portal: plegar todas menos la primera. O sea que la pieza
 * estaba pensada para esto desde el principio. Aquí llega sin `onAddFood`, sin
 * `onGrams`, sin `onRenameMeal` y sin platos ni portapapeles: sin verbos no hay
 * nada que tocar, y no hace falta ningún interruptor de solo-lectura que
 * alguien tenga que acordarse de cruzar.
 *
 * Lo único que sí llega es qué opción se está mirando (`opcion` / `onOpcion`),
 * porque esa elección es del cliente y vive en la pantalla —no se guarda—:
 * elegir «con avena» un martes no es una decisión que su entrenador tenga que
 * ver ni que la aplicación tenga que recordar.
 *
 * ══ Y la cinta de días tampoco se puede tocar ══════════════════════════════
 *
 * `TarjetasDeDia` sin `onRenombrar`: se cambia de día del ciclo y no
 * se puede añadir ni renombrar ninguno. Misma ley que en Entreno — lo que se
 * puede hacer sale de lo que llega.
 *
 * ══ Y LAS CIFRAS OCULTAS NO PASAN POR AQUÍ ═════════════════════════════════
 *
 * Con `Oculto.nutrition` puesto, esta pantalla NO monta `MealCard` ni el
 * costado. No es una preferencia de forma: `MealCard` no pregunta por el
 * contexto de privacidad —pinta las kcal de la comida, las de cada opción y el
 * anillo— y montarla tal cual le habría enseñado a esa persona exactamente las
 * cifras que su entrenador le ocultó. Ese es el fallo que `Oculto.jsx` describe
 * en su cabecera: *«una regla de privacidad que hay que acordarse de pasar es
 * una regla que un día se olvida»*.
 *
 * Lo que se enseña entonces es el menú y nada más: qué comer y cuánto, en
 * gramos o en unidades, sin una sola caloría. No es la misma pantalla capada —
 * es la lista, que es lo que esa persona necesita para comer.
 *
 * El arreglo de raíz sería que `MealCard` consultara `useOculto()` donde pinta
 * cada cifra, y entonces las dos ramas serían una. Son cerca de veinte sitios
 * dentro de mil líneas y no se hace de paso: queda escrito aquí.
 *
 * Y tiene una consecuencia más desde que el portal enseña ALTERNATIVAS: quien
 * tiene las cifras ocultas no las ve en el monitor, porque quien las dibuja es
 * `MealCard`. En el teléfono sí las ve —la lista es suya, sin las dos cifras de
 * al lado— y esa es la asimetría que deja la rama de arriba. Ver
 * `movil/PantallaComer`.
 */
export const DietaEnMonitor = ({ datos }) => {
  const {
    dias,
    diaVisible,
    onDia,
    comidas,
    opcionDe,
    onOpcion,
    catalogo,
    grupos,
    lecturas,
    notas,
    vacia,
    sinCifras,
    menuSinCifras,
    porMacros,
    especial = null,
    manana = null,
  } = datos;
  const [diaAbierto, setDiaAbierto] = useState(false);

  return (
    <div className="layout">
      <div className="dieta-pagina">
        <div className="dieta">
          <div className="dieta-menu">
            <div className="dieta-hoja">
              {/* Los días, en sus tarjetas, igual que en el taller (frame 64:88).
                  Con una sola dieta no se pintan: una pestaña sola no es una
                  elección. Sin `onRenombrar` ni `soltar` — se cambia de día y no
                  se toca nada, que es la misma ley de siempre: lo que se puede
                  hacer sale de lo que llega.

                  Y SIN LA CINTA, que aquí no tiene nada que decir: lleva el
                  nombre del plan, cómo se le pauta y los verbos del entrenador,
                  y las tres cosas son del taller. Una barra con un titular y
                  nada más es un mueble vacío. */}
              {dias.length > 1 ? <TarjetasDeDia dias={dias} activo={diaVisible?.id} onDia={onDia} /> : null}

              <div className="dieta-cuerpo">
                {/* Mañana empieza un refeed o un diet break: una línea para organizarse. */}
                {manana ? <DiaDeManana manana={manana} /> : null}
                {/* Un refeed o un diet break hoy: sus cifras y la indicación, encima de todo. */}
                {especial ? <DiaEspecial especial={especial} /> : null}
                {porMacros ? (
                  /*
                    ── POR MACROS: LA MESA DEL TALLER, EN LECTURA ───────────
                    Lo mismo que ve su entrenador: sin reparto, la prescripción
                    del día en grande; con reparto, la tabla de lo que toca en
                    cada comida. Sin lápiz, sin semáforo y sin la fila de lo
                    que suman los alimentos, que aquí no hay.
                  */
                  sinCifras ? (
                    <p className="t-secondary">
                      Tu dieta va por cifras, y en tu app no se enseñan.
                    </p>
                  ) : comidas.length === 0 && especial?.cifras ? null /* Las cifras de hoy ya las dice el refeed: la de siempre, al lado. */ : comidas.length === 0 ? (
                    <MacroTargetCard
                      forma="mesa"
                      plan={lecturas?.plan}
                      variant={diaVisible?.id}
                      title={dias.length > 1 ? `Lo que te toca · ${diaVisible?.name.toLowerCase()}` : 'Lo que te toca al día'}
                      dice="Sin menú cerrado: cómo llegar a estas cifras lo eliges tú."
                    />
                  ) : (
                    <section className="dieta-reparto" aria-label="El reparto del día">
                      <div className="dieta-reparto-asa">
                        <span className="section-label">El reparto</span>
                        <span className="dieta-reparto-dice">
                          {`${comidas.length} ${comidas.length === 1 ? 'comida' : 'comidas'}`}
                        </span>
                      </div>
                      <PlanDia meals={comidas} targets={lecturas?.targets} juzga={false} conSuma={false} />
                    </section>
                  )
                ) : comidas.length === 0 ? (
                  <p className="t-secondary">{vacia}</p>
                ) : sinCifras ? (
                  /* Sin cifras: el menú a secas. Ver la cabecera. */
                  menuSinCifras.map((c) => (
                    <Grupo key={c.id} title={c.nombre}>
                      {c.alimentos.map((a) => (
                        <Fila key={a.id} title={a.nombre} valor={a.racion} />
                      ))}
                    </Grupo>
                  ))
                ) : (
                  /*
                    ── ABIERTAS, TODAS ──────────────────────────────────────
                    Nacían plegadas menos la primera (`plegadaAlInicio={i > 0}`)
                    para que la dieta cupiera en una pantalla. El dueño lo tumbó
                    el 14 de septiembre de 2026: *«las vistas de comida no han
                    de venir minimizadas»*. Y tiene razón de fondo: la dieta no
                    se consulta, se sigue —a media mañana se mira la comida 2 y
                    a las nueve la 4—, así que lo que ahorraba el pliegue era un
                    desplazamiento y lo que costaba era un clic en cada comida,
                    todos los días. El chevron se queda para cerrar la que
                    estorbe.
                  */
                  comidas.map((meal) => (
                    <MealCard
                      key={meal.id}
                      meal={meal}
                      opcion={opcionDe(meal.id)}
                      onOpcion={(j) => onOpcion(meal.id, j)}
                      /*
                        ── Y CON ESTO SE ENCIENDEN LAS ALTERNATIVAS ──────────
                        `FoodRow` calcula la lista de cada alimento contra el
                        catálogo y la enseña debajo, en la misma rejilla; sin
                        catálogo devuelve `null` y el botón no existe. O sea que
                        la comida del taller ya sabía hacer esto —«el cliente
                        resuelve 'no tengo plátanos' sin escribir a nadie», dice
                        su propio comentario— y lo único que le faltaba era que
                        el portal le pasara con qué. Sin `onSwap` no hay ningún
                        verbo que cambie el plan: se lee y nada más.

                        Los grupos son los de SU entrenador, tal como se los
                        podó (`equiv_groups`, 0113): lo que se le ofrece tiene
                        que ser su criterio y no el que calcula el catálogo.
                      */
                      catalogFoods={catalogo}
                      grupos={grupos}
                    />
                  ))
                )}
              </div>
            </div>
          </div>

          <aside className="dieta-lado" aria-label="Tu objetivo y cómo va">
            {/*
              ── CAJAS SUELTAS, COMO EN EL TALLER (18 sep) ──────────────────
              Llevaba `es-panel`, que funde la columna en una caja con las
              secciones pegadas por un filete. El dueño: «le salen las 3 boxes
              pegadas al cliente; en el entrenador no pasa». El taller las
              separa desde el frame 64:244 y aquí se quedó la clase vieja.

              EL COSTADO DEL TALLER, sin el lápiz. `onEditarObjetivo` va nulo, y
              con él se apaga el único mando que tenía: lo que queda es el
              objetivo del día, lo que suma el menú abierto contra él, el reparto
              del ciclo y la evolución de lo que le fueron pautando. Todo lectura.
            */}
            {lecturas ? (
              <LecturasDeLaDieta
                plan={lecturas.plan}
                variant={lecturas.variant}
                dias={dias}
                casillas={lecturas.casillas}
                meals={comidas}
                targets={lecturas.targets}
                elegidas={lecturas.elegidas}
                registros={lecturas.registros}
                cerrado={lecturas.cerrado}
                onDia={onDia}
                /* La ventana del día, como la del entrenador: se abre desde el
                   título del objetivo. Ver `DiaPopup` abajo. */
                onAbrirDia={comidas.length > 0 ? () => setDiaAbierto(true) : undefined}
                tituloObjetivo={diaVisible?.name || null}
                /* Por macros y sin reparto el objetivo ya está en la mesa, en
                   grande: repetirlo aquí sería la segunda lista de los mismos
                   cuatro números. Misma regla que el taller.
                   Y un día de refeed o diet break tampoco: sus cifras las dice
                   su caja de arriba, y medir su menú contra el objetivo de la
                   dieta base sería medirlo con otra vara. */
                conElDia={!especial && !(porMacros && comidas.length === 0)}
                catalogo={lecturas.catalogo}
                /* LO PAUTADO Y NADA MÁS. Ver `ObjetivoDelDia`: aquí salía
                   «Proteína 111/120 g · −9 g» en rojo, que es el descuadre
                   entre lo que su entrenador pidió y lo que le cuadró al
                   escribir el menú. Eso lo mira quien lo escribe. */
                soloPautado
              />
            ) : null}

            {/*
              LA VENTANA DEL DÍA, en lectura: sin `onTarget` la tabla del
              reparto se lee y no se escribe (ver `PlanDia`), y «Todos los
              días» compara su día con los otros sin tocar nada. Sin el
              desvío (`desvio`): lo real sobre lo pautado es lectura del que
              reparte, y al cliente le basta la planificación.
              Sin semáforo (`juzga`), por lo mismo que el costado va con
              `soloPautado`: el descuadre es del que escribe el menú.
            */}
            {diaAbierto && lecturas ? (
              <DiaPopup
                open
                label={(diaVisible?.name || 'el día').toLowerCase()}
                meals={comidas}
                targets={lecturas.targets}
                elegidas={lecturas.elegidas}
                juzga={false}
                desvio={false}
                dias={dias}
                tituloReparto="Reparto · lo pautado en cada comida"
                onIrA={(i) => {
                  const id = comidas[i]?.id;
                  window.setTimeout(
                    () => document.getElementById(`comida-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
                    50
                  );
                }}
                onClose={() => setDiaAbierto(false)}
              />
            ) : null}

            {/* Lo que le pidió por escrito. Es texto suyo, así que va en su
                grupo y no como una lectura más. */}
            {notas.length > 0 ? (
              <Grupo title="Lo que te pidió">
                {notas.map((n) => (
                  <Fila key={n.id} title={n.titulo} sub={n.cuerpo} />
                ))}
              </Grupo>
            ) : null}
          </aside>
        </div>
      </div>
    </div>
  );
};
