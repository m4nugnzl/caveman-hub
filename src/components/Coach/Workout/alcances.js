/**
 * HASTA CUÁNDO VALE LO QUE SE METE EN UNA HOJA.
 *
 * Las tres respuestas de siempre, en un solo sitio porque ahora hay DOS caminos
 * que llevan al mismo destino y tienen que preguntar lo mismo con las mismas
 * palabras: escribir un ejercicio (`AddExerciseForm`) y pegar uno del
 * portapapeles (`TramoDelPegado`). Escritas dos veces se habrían separado a la
 * segunda corrección de estilo, y entonces el mismo alta diría dos cosas.
 *
 * Por debajo son `addPlanExercise(…, { hasta })`: sin número, el ejercicio entra
 * en el plan del bloque y lo ven todos sus microciclos; con número, se queda en
 * una excepción con su tramo. Ver `domain/blocks`.
 */

/* Un cambio se hace para quedarse, así que el bloque va primero; lo de a prueba
   y lo puntual existen porque también son de verdad —«le meto esto tres semanas
   y vemos»—. */
export const ALCANCES = {
  bloque: 'Entra en el plan del bloque: lo ven todos sus microciclos.',
  unas: 'Tres microciclos desde este. Después vuelve solo al plan.',
  una: 'Solo aquí. El bloque no se toca.',
};

/** Cómo se llama cada respuesta cuando hay que elegirla. */
export const ALCANCE_TITULO = {
  bloque: 'En el bloque, mientras dure',
  unas: 'Unas semanas, a prueba',
  una: 'Solo este microciclo',
};

/** Cuántos microciclos dura cada una. `undefined` es «los que dure el bloque». */
export const SEMANAS = { bloque: undefined, unas: 3, una: 1 };

/** El de siempre: lo normal es que un cambio se quede. */
export const ALCANCE_POR_DEFECTO = 'bloque';
