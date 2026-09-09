import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useApp } from '@/context/AppContext';
import { mergeCatalog } from '@/domain/catalog';
import { AlimentosPanel } from './AlimentosPanel';
import { EjerciciosPanel } from './EjerciciosPanel';

/**
 * LA LIBRERÍA: tu material, en una puerta y no en dos.
 *
 * ══ Por qué se juntan ══════════════════════════════════════════════════════
 *
 * Porque eran la misma pantalla. No parecida: **la misma**. El banco de dos
 * planos, la lista a la izquierda, la ficha en dos capas a la derecha —lo del
 * catálogo, que no se toca, y lo tuyo, que sí—, el mismo corte de 1560 px y la
 * misma CSS (`.es-banco`, `.plano-ficha`, `.ficha-capa`). Dos filas en la barra
 * para un solo mueble montado dos veces.
 *
 * Y al juntarlas aparece la simetría que las dos puertas escondían, que es la
 * que ya estaba escrita en el producto:
 *
 *     Librería    el material suelto     un ejercicio · un alimento
 *     Plantillas  lo compuesto con él    un día       · un plato
 *
 * Un ejercicio es a un día lo que un alimento es a un plato.
 *
 * ══ El tramo ES la ruta ════════════════════════════════════════════════════
 *
 * `/ejercicios` y `/alimentos` siguen existiendo y no se tocan: cambiar de
 * tramo NAVEGA. Así el sitio donde estás se puede enlazar y compartir, el botón
 * de atrás hace lo que tiene que hacer y la medición sigue diciendo en cuál de
 * los dos se trabaja. Un tramo que fuera estado interno perdería las tres cosas
 * a cambio de nada.
 *
 * ── Y por eso «Tuyos / Del catálogo» baja al filtro ───────────────────────
 * La banda ya tiene sus tramos de verdad. «Todos · Tuyos · Del catálogo» nunca
 * fue una sección: es un filtro sobre la misma lista, y estaba arriba porque la
 * banda estaba libre. Ahora vive donde viven los filtros —junto al buscador y a
 * las chapas de músculo o categoría—, que además es donde se puede combinar con
 * ellos. Ver `.cartera-barra` en las dos mitades.
 *
 * ══ Lo que esta pantalla NO es ═════════════════════════════════════════════
 *
 * Sigue sin ser una puerta de importar. `catalog.js` decidió que no hubiera
 * pantalla de catálogo porque el momento en que necesitas «Lentejas» es
 * mientras montas la dieta, no media hora antes administrando una lista. Eso no
 * cambia: los buscadores de la hoja y de la dieta siguen siendo la entrada. Lo
 * que la Librería da es lo otro —**curar**: tu vídeo, tus pautas, tu nota, el
 * alérgeno de tu marca, los dos «Pan integral» que se colaron—.
 */
export const LibreriaPanel = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { exerciseLibrary, catalogExercises, foodLibrary, catalogFoods } = useApp();

  const tramo = pathname === '/alimentos' ? 'alimentos' : 'ejercicios';

  /* Las dos cifras de la banda. Es la misma mezcla que hace cada mitad por su
     cuenta —lo tuyo primero y el catálogo detrás, sin repetidos—, y aquí solo
     se cuenta: contar es barato y decir cuánto hay detrás de un tramo es lo que
     hace que se pulse. */
  const nEjercicios = useMemo(
    () => mergeCatalog(exerciseLibrary, catalogExercises).length,
    [exerciseLibrary, catalogExercises]
  );
  const nAlimentos = useMemo(
    () => mergeCatalog(foodLibrary, catalogFoods).length,
    [foodLibrary, catalogFoods]
  );

  const banda = {
    titulo: 'Librería',
    tramos: [
      { id: 'ejercicios', label: 'Ejercicios', n: nEjercicios },
      { id: 'alimentos', label: 'Alimentos', n: nAlimentos },
    ],
    tramo,
    onTramo: (id) => navigate(id === 'alimentos' ? '/alimentos' : '/ejercicios'),
  };

  return tramo === 'alimentos' ? <AlimentosPanel banda={banda} /> : <EjerciciosPanel banda={banda} />;
};
