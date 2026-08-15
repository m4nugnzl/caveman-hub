import { useData } from '@/context/AppContext';
import { ClientDiet } from './ClientDiet';

/** Ruta `/mi/dieta`. */
export const ClientDietRoute = () => {
  const { activeClient, nutrition } = useData();
  return <ClientDiet plan={nutrition[activeClient.id]} />;
};
