import { useDestino } from '@/lib/portapapeles';

/**
 * «AQUÍ CAE ESTO» — el destino, montado como pieza y no como gancho.
 *
 * El registro es un efecto (`useDestino`), y un efecto no puede ir detrás de un
 * `return` temprano. Las pantallas que reciben cosas —Entreno, la dieta— tienen
 * dos o tres de esos retornos arriba (el programa aún no ha cargado, no hay
 * ninguno) y los verbos de pegar no existen hasta trescientas líneas después,
 * cuando ya se sabe qué hay delante. Montarlo como pieza pone el gancho en un
 * sitio donde SÍ se puede: dentro del árbol, condicionado como cualquier otro
 * nodo, y desmontado —y por tanto dado de baja— al desaparecer la condición.
 *
 * No pinta nada: lo que se ve es la mano.
 *
 * ── Y la mano ya no vive aquí ──────────────────────────────────────────────
 * Está en `Coach/ManoDelPortapapeles`. Desde que desde ella se puede poner una
 * pieza en varios clientes y guardarla en tus plantillas, escribe en el trabajo
 * de la gente y lee del contexto de la aplicación: eso es una pieza del panel
 * del entrenador —donde ya se montaba, `{isCoach && …}`— y no un primitivo de
 * `ui/`, que no importa de `Coach/` en ninguna parte. Esto sí se queda: un
 * destino lo monta cualquier pantalla y no sabe nada de nadie.
 */
export const Destino = ({ tipos, donde, verbo, prioridad, pegar }) => {
  useDestino({ tipos, donde, verbo, prioridad, pegar });
  return null;
};
