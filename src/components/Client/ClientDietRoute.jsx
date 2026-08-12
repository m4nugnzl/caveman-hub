import { useApp } from '@/context/AppContext';
import { ClientDiet } from './ClientDiet';

/** Ruta `/mi/dieta`. */
export const ClientDietRoute = () => {
  const { activeClient, nutrition } = useApp();
  return <ClientDiet plan={nutrition[activeClient.id]} />;
};
