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
  waist: 'var(--data-orange)',

  /* ── El entrenamiento ── */
  tonnage: 'var(--data-violet)',
  /* Teal y no violeta. Compartía color con el tonelaje, y las dos salen juntas
     en la misma fila del resumen y en el mismo eje de la analítica: dos series
     del mismo color en un gráfico son una sola serie mal dibujada. */
  sets: 'var(--data-teal)',
  adherence: 'var(--data-lime)',
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
