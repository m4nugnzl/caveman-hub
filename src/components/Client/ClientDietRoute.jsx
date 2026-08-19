import { useData } from '@/context/AppContext';
import { PageHead } from '@/components/ui/primitives';
import { ClientDiet } from './ClientDiet';

/** Ruta `/mi/dieta`. */
export const ClientDietRoute = () => {
  const { activeClient, nutrition } = useData();

  return (
    <div className="stack">
      <PageHead title="Mi dieta" sub="Lo que te ha pautado tu entrenador, comida a comida." />
      <ClientDiet plan={nutrition[activeClient.id]} />
    </div>
  );
};
