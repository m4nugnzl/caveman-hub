// app/page.tsx
import { CoachDashboard } from '@/components/CoachDashboard';

export default async function Home() {
  // Si necesitas traer clientes desde Supabase en el servidor:
  // const clients = await getClientsFromSupabase();

  const mockClients = [
    { id: '1', name: 'Atleta Ejemplo 1' },
    { id: '2', name: 'Atleta Ejemplo 2' },
  ];

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6">
      <CoachDashboard initialClients={mockClients} />
    </main>
  );
}