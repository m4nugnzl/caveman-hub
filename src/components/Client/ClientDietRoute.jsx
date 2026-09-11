import { useMemo } from 'react';

import { useData } from '@/context/AppContext';
import { blockPlan, currentBlock, structureOfBlock } from '@/domain/blocks';
import { clientProtocol, isModuleOn } from '@/domain/protocol';
import { cycleSlots } from '@/domain/training';
import { norm } from '@/lib/texto';
import { PageHead } from '@/components/ui/primitives';
import { ClientDiet } from './ClientDiet';

/** Ruta `/mi/dieta`. */
export const ClientDietRoute = () => {
  /* El catálogo también: es quien sabe de grupos (fruta, carne…) y alimenta las
     equivalencias de cada alimento del menú. Lo puede leer cualquier usuario. */
  const { activeClient, nutrition, catalogFoods, gruposEquiv, workoutData } = useData();

  /*
    ══ LAS CASILLAS DE SU CICLO ═══════════════════════════════════════════════

    Las mismas que usa su entrenador para repartirle la dieta (`cycleSlots`), y
    por eso se arman igual: siete días con nombre si entrena por semanas, los
    del microciclo —con sus descansos— si su ciclo es rotativo. Sin ellas, la
    dieta no puede decir ni qué le toca hoy ni con qué sesión va cada día, que
    es justo lo que un alto/bajo necesita contestar.
  */
  const programa = workoutData?.[activeClient.id];
  const casillas = useMemo(() => {
    const bloque = currentBlock(programa);
    const rotativo = (activeClient.cycleType || 'weekly') === 'rotating';
    return cycleSlots({
      cycleType: activeClient.cycleType,
      pattern: activeClient.cyclePattern,
      sessions: rotativo && bloque ? blockPlan(programa, bloque).sessions : [],
      weeklySplit: bloque ? structureOfBlock(programa, bloque).weeklySplit || {} : {},
    });
  }, [programa, activeClient.cycleType, activeClient.cyclePattern]);

  /* La ficha de referencia de cada alimento por su nombre. Ver el porqué abajo,
     en `catalogo`, y la regla en `declaredMicro`. */
  const fichaDelAlimento = useMemo(() => {
    const porNombre = new Map((catalogFoods || []).map((f) => [norm(f?.name), f]));
    return (entrada) => porNombre.get(norm(entrada?.name)) || null;
  }, [catalogFoods]);

  /* Las equivalencias son un módulo del protocolo —el entrenador decide qué
     existe en esta app—. Apagado, la dieta no recibe catálogo y ningún alimento
     enseña el botón: no hay una versión «capada» de la función, no está. */
  const equivalencias = isModuleOn(clientProtocol(activeClient.preferences), 'dietSwaps');

  return (
    <div className="stack">
      <PageHead title="Mi dieta" sub="Lo que te ha pautado tu entrenador, comida a comida." />
      {/* Y los grupos que le puso su entrenador (0113): con la lista podada,
          «no tengo huevos» se resuelve con los tres alimentos que él eligió y
          no con los cinco huevos casi iguales del catálogo. Por la misma puerta
          del módulo que el catálogo: apagado, no llega nada. */}
      <ClientDiet
        plan={nutrition[activeClient.id]}
        casillas={casillas}
        catalogFoods={equivalencias ? catalogFoods : []}
        grupos={equivalencias ? gruposEquiv : []}
        /*
          Y el catálogo OTRA VEZ, sin la puerta del módulo. No es la misma
          pregunta: `catalogFoods` enciende las equivalencias —una función que
          el entrenador decide si existe en su app— y esto solo rellena lo que
          la copia congelada de un alimento no diga del envase, para que la
          fibra de su dieta sea la misma cifra que ve su entrenador. Apagar las
          equivalencias no puede cambiarle los gramos de fibra.
        */
        catalogo={fichaDelAlimento}
      />
    </div>
  );
};
