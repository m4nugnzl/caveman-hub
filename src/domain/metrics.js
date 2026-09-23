/**
 * El color de cada métrica. Un solo sitio, para toda la aplicación.
 *
 * ══ Por qué existe ══════════════════════════════════════════════════════════
 *
 * La regla del proyecto es «el cromo no tiene color, el color es del dato»
 * (`styles/tokens.css`), y estaba a medio cumplir: el color del dato existía,
 * pero **lo elegía cada pantalla por su cuenta**. El resultado es que la misma
 * métrica salía de tres colores distintos según dónde se mirara:
 *
 *   · el peso era `--accent` en la analítica, `--data-blue` en el resumen y
 *     `--data-amber` en el check-in;
 *   · las series efectivas eran violeta en `analytics.js` y teal en el panel,
 *     o sea del mismo color que el tonelaje en una pantalla y de otro en la
 *     siguiente;
 *   · y tres métricas —adherencia, cintura y % de proteína— llevaban un color
 *     LITERAL escrito a mano, fuera del sistema de tokens y por tanto fuera del
 *     tema oscuro: en hierro se pintaban con la misma tinta clara que en papel.
 *
 * Un color que cambia de pantalla no es información: es ruido con aspecto de
 * información. Aquí se decide una vez y no se vuelve a decidir.
 *
 * ── La regla, en dos líneas ─────────────────────────────────────────────────
 *   1. Una métrica CON serie temporal tiene un color, y es siempre el mismo.
 *   2. Una métrica SIN serie no lleva color: va en tinta plena.
 *
 * La segunda es la que se incumplía más. «4 de 3 pesajes» salía en verde y «12
 * fotos» en ámbar, y esos colores no distinguen nada de nada porque no hay otra
 * serie de la que distinguirse — solo gastan la única señal que le queda a una
 * pantalla sin cromo de color. Cuando todo tiene color, el color deja de avisar.
 *
 * ── De dónde salen los valores ──────────────────────────────────────────────
 * De los discos, como toda la paleta de datos: el peso es el azul del de 20, el
 * % graso el rojo del de 25. Lo que no es del cuerpo hereda el color de aquello
 * de lo que se deriva —el ritmo del peso es peso, el % de kcal en proteína es
 * proteína—, que es lo que hace que dos cifras emparentadas se lean como
 * emparentadas sin escribirlo en ninguna parte.
 */
import { macroColor } from './nutrition';

/**
 * Métrica → color. Lo que NO está aquí no lleva color, y eso es una decisión y
 * no un olvido: ver la regla 2 de la cabecera.
 */
export const METRIC_COLORS = {
  /* ── El cuerpo ── */
  weight: 'var(--data-blue)',
  /* El ritmo ES el peso, medido de otra forma. Mismo color a propósito: son la
     misma serie y en el resumen aparecen una al lado de la otra. */
  rate: 'var(--data-blue)',
  fat: 'var(--data-rose)',
  /* ── La cintura se junta con el % graso (20 sep) ────────────────────────
     Era `--data-orange`, y esa tinta ya no existe: estaba a 8° de matiz del
     naranja del AVISO, o sea que una serie de cintura y una advertencia se
     pintaban del mismo color (ver `docs/lenguaje-visual.md` §7.3).

     Comparte el rojo del % graso y no otro de los cinco libres porque es la
     misma familia y así lo dice la regla de arriba: las dos miden LA FORMA del
     cuerpo, no su masa, y cuando se comparan es precisamente porque cuentan la
     misma historia —la cintura baja y el % graso con ella—. Es el mismo
     argumento que empareja el peso con el ritmo dos líneas más arriba. */
  waist: 'var(--data-rose)',

  /* ── El entrenamiento ── */
  tonnage: 'var(--data-violet)',
  /* Teal y no violeta. Compartía color con el tonelaje, y las dos salen juntas
     en la misma fila del resumen y en el mismo eje de la analítica: dos series
     del mismo color en un gráfico son una sola serie mal dibujada. */
  sets: 'var(--data-teal)',
  /* ── Y la adherencia se junta con las series (20 sep) ───────────────────
     Era `--data-lime`, que se va con el naranja: de las nueve tintas era la
     que menos distinguía —verde contra el verde del BIEN— y la que menos
     trabajo hacía.

     Teal, con las series efectivas, porque las dos dicen lo mismo desde dos
     lados: cuánto del trabajo previsto se ha hecho de verdad. Ojo, ésta es la
     adherencia al ENTRENAMIENTO; la de la dieta vive en `protocol.js` y va en
     el ámbar de la comida, que es otra pregunta y otra familia. */
  adherence: 'var(--data-teal)',
  /* La carga de la serie tope de un ejercicio, que es la serie que dibuja su
     progresión en la revisión. Comparte el violeta del tonelaje porque es lo
     mismo medido de otra forma —los kilos del entrenamiento— y nunca salen las
     dos en el mismo gráfico: el tonelaje vive en la analítica y ésta en la
     ficha de un ejercicio. */
  topKg: 'var(--data-violet)',
  /* El 1RM estimado iba en `--accent`, o sea pintado con la tinta del CROMO. Es
     una serie con su propio gráfico y le toca color de dato como a las demás;
     además comparte selector con el tonelaje y el volumen, y desde el pizarrón
     no se distinguía de la interfaz que lo rodea. */
  e1rm: 'var(--data-slate)',

  /* ── La comida ──
     El ámbar de la kcal es el mismo que el de los carbohidratos, y es correcto:
     la kcal de un día ES mayoritariamente su carbohidrato. Lo que no puede
     compartir es el ámbar del AVISO, y por eso están separados en los tokens. */
  kcals: 'var(--data-amber)',
  /* Los pasos que le pones al día. Son una serie como las calorías —se ponen y
     siguen puestos hasta que los cambias— y se dibujan en la misma banda de la
     gráfica del peso, alternando con ellas: por eso NO pueden compartir el
     ámbar, que es lo único que distingue una escalera de la otra.

     Rosa y no cualquiera de los libres: el naranja es la cintura y el lima la
     adherencia, y las tres salen en el mismo panel. El rosa solo lo usa una
     pregunta del check-in (el estrés), que vive en otra familia —las escalas
     subjetivas— y nunca se dibuja en el mismo gráfico que esto. */
  steps: 'var(--data-pink)',
  proteinShare: macroColor('protein'),
};

/**
 * El color de una métrica, o `null` si no le toca ninguno.
 *
 * Devuelve `null` y no un gris por defecto a propósito: quien pinta la cifra
 * tiene que poder distinguir «esta métrica va en su color» de «esta métrica va
 * en tinta plena», y un gris de relleno convierte la segunda en una tercera
 * cosa que no existe.
 */
export const metricColor = (id) => METRIC_COLORS[id] || null;

/**
 * El color de una MEDIDA del entrenador.
 *
 * Va aquí y no en `domain/medidas.js` por la regla de la cabecera: el color de
 * un dato se decide en un solo sitio. Lo que la definición de la medida trae es
 * el color ya elegido —de fábrica el suyo, y el de una inventada rota por la
 * paleta— y esto es la puerta por la que las pantallas lo piden, para que
 * pedirle el color a una medida y a una métrica sea el mismo gesto.
 *
 * `null` cuando la medida no lo dice, que es lo mismo que contesta
 * `metricColor`: quien pinta tiene que poder distinguir «va en su color» de «va
 * en tinta plena».
 */
export const medidaColor = (medida) => medida?.color || null;
