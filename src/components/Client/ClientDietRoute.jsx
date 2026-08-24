import { useData } from '@/context/AppContext';
import { clientProtocol, isModuleOn } from '@/domain/protocol';
import { PageHead } from '@/components/ui/primitives';
import { ClientDiet } from './ClientDiet';

/** Ruta `/mi/dieta`. */
export const ClientDietRoute = () => {
  /* El catálogo también: es quien sabe de grupos (fruta, carne…) y alimenta las
     equivalencias de cada alimento del menú. Lo puede leer cualquier usuario. */
  const { activeClient, nutrition, catalogFoods } = useData();

  /* Las equivalencias son un módulo del protocolo —el entrenador decide qué
     existe en esta app—. Apagado, la dieta no recibe catálogo y ningún alimento
     enseña el botón: no hay una versión «capada» de la función, no está. */
  const equivalencias = isModuleOn(clientProtocol(activeClient.preferences), 'dietSwaps');

  return (
    <div className="stack">
      <PageHead title="Mi dieta" sub="Lo que te ha pautado tu entrenador, comida a comida." />
      <ClientDiet
        plan={nutrition[activeClient.id]}
        catalogFoods={equivalencias ? catalogFoods : []}
      />
    </div>
  );
};
