/**
 * Qué OFRECE la aplicación, leído del propio código.
 *
 * ══ Para qué hace falta ═════════════════════════════════════════════════════
 *
 * Para las dos secciones del informe que de verdad hacen decidir algo, y las dos
 * son negativas:
 *
 *   · «estas pantallas no las ha abierto nadie»
 *   · «este pliegue no lo ha medido nadie nunca»
 *
 * Ninguna se puede contestar con los datos. Los eventos dicen lo que SÍ pasó;
 * para saber lo que no pasó hay que saber antes qué podía pasar, y eso solo está
 * en el código.
 *
 * ══ Por qué se lee el código en vez de copiar la lista aquí ═════════════════
 *
 * Porque una copia se queda vieja EN SILENCIO, y en este caso el silencio se lee
 * al revés de lo que es: una pantalla añadida el mes pasado no estaría en la
 * lista, así que nunca aparecería como «sin uso» — justo cuando es la candidata
 * más probable a que no la use nadie.
 *
 * Este proyecto ya se tropezó con eso: la prueba de privacidad de
 * `lib/analytics.test.js` comprobaba una lista escrita a mano de secciones, se
 * fundieron dos en una y la prueba siguió pasando mientras dejaba de comprobar
 * las rutas nuevas.
 *
 * ══ Lo que esto es, y su riesgo ════════════════════════════════════════════
 *
 * Es análisis de texto con expresiones regulares, no un intérprete. Funciona
 * porque los dos archivos que lee tienen una forma muy estable —listas de
 * objetos con `path:` y objetos de etiquetas—, y no funcionaría si alguien los
 * reescribiera de otra manera.
 *
 * El riesgo no es que falle: es que devuelva una lista VACÍA y el informe diga
 * «no falta nada». Por eso `catalogoDe` no devuelve solo las listas, devuelve
 * también qué no ha podido extraer, y por eso hay una prueba que corre contra
 * los archivos de verdad y se rompe el día que cambien de forma.
 *
 * ── Por qué no se importan los módulos y ya está ────────────────────────────
 * `src/routes.jsx` es JSX e importa iconos de `lucide-react`, y
 * `src/domain/anthropometry.js` importa con el alias `@/`. Los dos necesitan el
 * empaquetador para cargarse, y esto es un script de Node suelto. Meter Vite
 * aquí para leer dos listas sería mucho más frágil que estas dos expresiones.
 */

/**
 * Las claves de primer nivel de un objeto exportado.
 *
 *     export const FOLDS_LABELS = {
 *       tricipital: 'Tricipital',    →  ['tricipital', …]
 *     };
 */
export const clavesDeObjeto = (fuente, nombre) => {
  const bloque = new RegExp(`export const ${nombre} = \\{([\\s\\S]*?)\\n\\};`).exec(fuente || '');
  if (!bloque) return [];
  return [...bloque[1].matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:/gm)].map((m) => m[1]);
};

/**
 * Los `path` (y sus `also`) de una lista de secciones exportada.
 *
 * Los `also` entran porque son secciones de verdad —`revision/fotos` es una
 * pantalla que se abre— y dejarlos fuera las contaría siempre como no usadas.
 */
export const seccionesDe = (fuente, nombre) => {
  const bloque = new RegExp(`export const ${nombre} = \\[([\\s\\S]*?)\\n\\];`).exec(fuente || '');
  if (!bloque) return [];

  const paths = [...bloque[1].matchAll(/path:\s*'([^']+)'/g)].map((m) => m[1]);
  const also = [...bloque[1].matchAll(/also:\s*\[([^\]]*)\]/g)].flatMap((m) =>
    [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
  );
  return [...new Set([...paths, ...also])];
};

/**
 * El catálogo completo, más la lista de lo que no se ha podido extraer.
 *
 * Las etiquetas de pantalla se componen EXACTAMENTE igual que en `pantallaDe`
 * (`src/App.jsx`), porque son las que van a compararse con lo que hay en
 * `product_events`. Si las dos formas dejaran de coincidir, todas las pantallas
 * saldrían como no usadas — y eso sí se nota, que es lo bueno de que el fallo
 * sea escandaloso en lugar de sutil.
 */
export const catalogoDe = ({ rutas = '', antropometria = '' } = {}) => {
  const deCliente = seccionesDe(rutas, 'COACH_CLIENT');
  const deAjustes = seccionesDe(rutas, 'SETTINGS_SECTIONS');
  const pliegues = clavesDeObjeto(antropometria, 'FOLDS_LABELS');
  const perimetros = clavesDeObjeto(antropometria, 'PERIMETER_LABELS');

  const avisos = [];
  if (deCliente.length < 4 || deAjustes.length < 4) {
    avisos.push(
      'La lista de pantallas se extrae de src/routes.jsx y ha salido más corta de lo esperado ' +
        `(${deCliente.length} de cliente, ${deAjustes.length} de ajustes). La sección «pantallas ` +
        'que no ha abierto nadie» puede estar incompleta.'
    );
  }
  if (pliegues.length < 3 || perimetros.length < 3) {
    avisos.push(
      'Los campos de medidas se extraen de src/domain/anthropometry.js y han salido más cortos ' +
        `de lo esperado (${pliegues.length} pliegues, ${perimetros.length} perímetros). El censo ` +
        'de medidas puede estar incompleto.'
    );
  }

  return {
    pantallas: [
      'hoy',
      'clientes',
      /* Redirige a `/clientes` pero `pantallaDe` la reconoce, así que puede
         aparecer en los eventos de quien tenga un marcador antiguo. */
      'cartera',
      ...deCliente.map((s) => `cliente_${s.replace(/\//g, '_')}`),
      ...deAjustes.map((s) => `ajustes_${s}`),
    ],
    pliegues,
    perimetros,
    avisos,
  };
};
