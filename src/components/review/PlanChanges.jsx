import { ArrowRight } from 'lucide-react';

import { groupChanges } from '@/domain/reviews';

/**
 * LO QUE CAMBIA EN EL PLAN: en rojo lo que sale, en verde lo que entra.
 *
 * ══ Por qué es un componente y no el trozo de una pantalla ══════════════════
 *
 * Porque el mismo diff hace falta en TRES momentos distintos:
 *
 *   1. **Mientras decides** — en la revisión, comparando la foto del plan de su
 *      última revisión con el plan tal y como está AHORA. Es lo que convierte
 *      «le he tocado algo» en «le he bajado los hidratos de 280 a 240».
 *   2. **Cuando él lo lee** — en su portal, al lado de tu respuesta. Un aviso
 *      que dice «tu dieta ha cambiado» y no dice qué obliga a ir a buscarlo.
 *   3. **Dos meses después** — en el histórico.
 *
 * Tres copias del mismo render habrían acabado divergiendo, y el día que una
 * pinte la bajada de calorías de otro color habrá dos productos.
 *
 * ══ TODAS las líneas tienen la misma forma: rótulo · lo de antes → lo de ahora ══
 *
 * Y ése es el cambio de esta versión. Había tres formas distintas de pintar un
 * cambio en el mismo bloque —la cifra con su flecha, el «−2 / +1» de la
 * estructura y las series con un sangrado de 100 px escrito a mano— así que doce
 * líneas seguidas eran tres tablas encajadas una dentro de otra. Con las tres
 * como la misma rejilla de dos columnas, el bloque se lee de arriba abajo.
 *
 * Importa más de lo que parece porque este diff se lee en sitios estrechos —el
 * pliegue de la barra de cierre, el aviso del portal—: con el sangrado a mano,
 * «Hack Squat / 2 / 3 series» se partía en tres renglones y dejaba de leerse
 * como una cosa.
 *
 * ── El color no dice si está bien ───────────────────────────────────────────
 * Bajar calorías puede ser exactamente lo correcto. Dice qué se retiró y qué se
 * puso, que es lo que se busca al mirar un cambio.
 *
 * ── Qué NO decide este componente ───────────────────────────────────────────
 * Qué poner cuando no hay nada que enseñar. «Sin cambios en el plan» en el
 * histórico y «no le has tocado nada todavía» mientras revisas son dos frases
 * distintas porque son dos situaciones distintas, así que la elige quien llama
 * y llega por `empty`.
 */

/**
 * Hasta tres nombres y el resto contado.
 *
 * La lista completa de un día reprogramado son treinta nombres que nadie lee. El
 * recuento va delante —es lo que se busca— y estos tres sirven para reconocer de
 * qué se está hablando.
 */
const nombres = (lista) => {
  const primeros = lista.slice(0, 3).join(', ');
  return lista.length > 3 ? `${primeros} y ${lista.length - 3} más` : primeros;
};

/**
 * Una línea del diff: el rótulo a la izquierda y lo que le pasó a la derecha.
 *
 * Es la única forma que tiene este bloque. Lo que cambia entre una calorías y un
 * día reprogramado es lo que va en `children`, no la estructura de la fila.
 */
const Fila = ({ que, children }) => (
  <div className="diff-row">
    <span className="diff-what">{que}</span>
    <span className="diff-vals">{children}</span>
  </div>
);

/**
 * Lo de antes y lo de ahora, con su flecha.
 *
 * ── La raya no es un cero ───────────────────────────────────────────────────
 * `from` o `to` pueden ser nulos: es «no lo tenía» y «se lo has quitado»
 * (ver `snapshotChanges`). Ponerle 10.000 pasos a quien no los tenía es un
 * cambio de revisión como cualquier otro, y escribir «0 → 10.000» ahí afirmaría
 * que antes le habías puesto cero.
 */
const DeA = ({ from, to, unit = '' }) => (
  <>
    {from === null || from === undefined ? (
      <span className="t-tertiary">—</span>
    ) : (
      <span className="diff-out">
        {from}
        {unit}
      </span>
    )}
    <ArrowRight size={11} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
    {to === null || to === undefined ? (
      <span className="t-tertiary">—</span>
    ) : (
      <span className="diff-in">
        {to}
        {unit}
      </span>
    )}
  </>
);

/*
  ── Hubo una segunda forma, en fichas, y se ha ido ──────────────────────────
  La barra de cierre pintaba estos mismos cambios como píldoras que envuelven,
  con el argumento de que en una barra acoplada una lista de seis renglones crece
  hacia arriba y tapa media revisión. El argumento era bueno; la forma, no: seis
  píldoras con tachados en rojo y cifras en verde son mucho ruido para un acuse
  de recibo, y encima había que cortarlas a cuatro.

  Lo que la barra necesitaba no era otra maqueta del diff: era no enseñarlo
  entero todo el rato. Ahora enseña el RECUENTO y despliega esta misma lista
  cuando se pide, así que hay una sola forma de pintar un cambio de plan — que es
  lo que evita el día en que la bajada de calorías salga de dos colores distintos
  según dónde se mire.
*/
export const PlanChanges = ({ changes = [], structure = [], empty = null }) => {
  if (changes.length === 0 && structure.length === 0) return empty;

  return (
    <div className="diff-list">
      {/* Las CIFRAS del plan: calorías, macros, pasos, cardio. */}
      {changes.map((c) => (
        <Fila key={c.key} que={c.label}>
          <DeA from={c.from} to={c.to} unit={c.unit} />
        </Fila>
      ))}

      {/*
        Y la ESTRUCTURA, agrupada por sitio. El sitio SIEMPRE encabeza su grupo
        —también cuando lo único que cambió fue un número de series—: sin él,
        «Hack Squat 2 → 3 series» no dice de qué semana ni de qué día habla, y en
        un programa de ocho semanas eso no se adivina.

        Lo que entra y lo que sale va en esa misma línea, con signo y no con
        flecha: «− Prensa» y «+ Hack» se leen de un vistazo, y «de Prensa a Hack»
        obligaría a inventar una correspondencia que no existe. Debajo, cada
        cambio de cifra en su propia fila, con la misma forma que las de arriba.
      */}
      {groupChanges(structure).map((g) => (
        <div className="diff-group" key={g.sitio}>
          <span className="diff-where">
            {g.sitio}
            {g.removed.length > 0 && (
              <span className="diff-out">
                −{g.removed.length} {nombres(g.removed)}
              </span>
            )}
            {g.added.length > 0 && (
              <span className="diff-in">
                +{g.added.length} {nombres(g.added)}
              </span>
            )}
          </span>

          {g.changed.map((c) => (
            <Fila key={c.label} que={c.label}>
              <DeA from={c.from} to={c.to} unit={c.unit} />
            </Fila>
          ))}
        </div>
      ))}
    </div>
  );
};
