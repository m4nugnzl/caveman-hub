import { Fila, Grupo } from '@/components/ui/Grupo';
import { MealCard } from '@/components/nutrition/MealCard';
import { TiraDeLaDieta } from '@/components/nutrition/TiraDeLaDieta';
import { LecturasDeLaDieta } from '@/components/nutrition/LecturasDeLaDieta';

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
 * `TiraDeLaDieta` sin `onMas` ni `onRenombrar`: se cambia de día del ciclo y no
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
  } = datos;

  return (
    <div className="layout">
      <div className="dieta-pagina">
        <div className="dieta">
          <div className="dieta-menu">
            <div className="dieta-hoja">
              {/* La cinta es la cabecera de la caja, igual que en el taller: dice
                  qué día del ciclo se está mirando. Con una sola dieta no se
                  pinta — una pestaña sola no es una elección. */}
              {dias.length > 1 ? (
                <TiraDeLaDieta dias={dias} activo={diaVisible?.id} onDia={onDia} />
              ) : null}

              <div className="dieta-cuerpo">
                {comidas.length === 0 ? (
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
                  comidas.map((meal, i) => (
                    <MealCard
                      key={meal.id}
                      meal={meal}
                      numero={i + 1}
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

          <aside className="dieta-lado es-panel" aria-label="Tu objetivo y cómo va">
            {/*
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
                tituloObjetivo={diaVisible?.name || null}
                catalogo={lecturas.catalogo}
                /* LO PAUTADO Y NADA MÁS. Ver `ObjetivoDelDia`: aquí salía
                   «Proteína 111/120 g · −9 g» en rojo, que es el descuadre
                   entre lo que su entrenador pidió y lo que le cuadró al
                   escribir el menú. Eso lo mira quien lo escribe. */
                soloPautado
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
