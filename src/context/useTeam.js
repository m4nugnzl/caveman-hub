import { useCallback, useState } from 'react';

import { supabase } from '@/lib/supabaseClient';
import { mapPlanFromDb } from '@/lib/mappers';
import { track } from '@/lib/analytics';

/*
  ══ El equipo y el plan, fuera de AppContext ═════════════════════════════════

  Con la convención de `useRoadmap.js` y la variante de `useCheckIns.js`: el
  estado lo SIEMBRA el arranque (`loadForUser` resuelve el equipo, sus miembros
  y el plan), así que el gancho devuelve también los setters.

  `assignClient` NO está aquí aunque la fachada lo agrupe con el equipo: es un
  delegado de `updateClient` (dominio de clientes) y se queda con él.

  Recibe `clientsRef`/`setClients` para una sola cosa: al sacar a un miembro,
  sus clientes quedan «sin asignar» y eso toca la cartera.
*/

export const useTeam = ({ clientsRef, setClients }) => {
  const [team, setTeam] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [plan, setPlan] = useState(null);

  // ── Equipo ─────────────────────────────────────────────────────────────────
  //
  // Estas operaciones son puntuales y no van por la cola de guardado: la cola
  // existe para escrituras repetidas de un mismo bloque (los kilos de una
  // serie, el historial de peso). Aquí cada acción es un acto deliberado del
  // usuario y devuelve su resultado para que la vista lo muestre.

  const reloadTeamMembers = useCallback(async (teamId) => {
    const { data, error } = await supabase
      .from('team_members')
      .select('profile_id, role, profiles(full_name, email)')
      .eq('team_id', teamId);

    if (error) return;
    setTeamMembers(
      (data || []).map((row) => ({
        profileId: row.profile_id,
        role: row.role,
        name: row.profiles?.full_name || '',
        email: row.profiles?.email || '',
      }))
    );
  }, []);

  const inviteTeamMember = useCallback(
    async (email, role = 'trainer') => {
      if (!team) return { ok: false, error: 'Todavía no hay ningún equipo.' };

      const { error } = await supabase.rpc('invite_team_member', {
        target_team: team.id,
        member_email: email,
        member_role: role,
      });
      if (error) return { ok: false, error: error.message };

      await reloadTeamMembers(team.id);
      /* Un equipo que crece es una cuenta que crece, y es el único camino de este
         producto hacia un contrato más grande que el de una persona. El rol va
         entero porque es una categoría cerrada de la 0006, no un dato de nadie. */
      track('equipo_invitado', { rol: role });
      return { ok: true };
    },
    [reloadTeamMembers, team]
  );

  const updateTeamMemberRole = useCallback(
    async (profileId, role) => {
      if (!team) return { ok: false, error: 'Todavía no hay ningún equipo.' };
      if (profileId === team.ownerId) {
        return { ok: false, error: 'El dueño del equipo no puede cambiar de rol.' };
      }

      const { error } = await supabase
        .from('team_members')
        .update({ role })
        .eq('team_id', team.id)
        .eq('profile_id', profileId);
      if (error) return { ok: false, error: error.message };

      await reloadTeamMembers(team.id);
      return { ok: true };
    },
    [reloadTeamMembers, team]
  );

  const removeTeamMember = useCallback(
    async (profileId) => {
      if (!team) return { ok: false, error: 'Todavía no hay ningún equipo.' };
      if (profileId === team.ownerId) {
        return { ok: false, error: 'No se puede sacar del equipo a quien lo creó.' };
      }

      const { error } = await supabase
        .from('team_members')
        .delete()
        .eq('team_id', team.id)
        .eq('profile_id', profileId);
      if (error) return { ok: false, error: error.message };

      /*
        Sus clientes quedan sin asignar, no se borran ni se reparten solos: quién
        se hace cargo de cada uno es una decisión del entrenador jefe, y adivinarla
        sería peor que preguntarla. La cartera los muestra como «sin asignar».
      */
      const orphans = clientsRef.current.filter((c) => c.assignedTo === profileId);
      if (orphans.length > 0) {
        await supabase
          .from('clients')
          .update({ assigned_to: null })
          .in('id', orphans.map((c) => c.id));
        setClients(
          clientsRef.current.map((c) => (c.assignedTo === profileId ? { ...c, assignedTo: null } : c))
        );
      }

      await reloadTeamMembers(team.id);
      return { ok: true, unassigned: orphans.length };
    },
    [clientsRef, reloadTeamMembers, setClients, team]
  );

  const renameTeam = useCallback(
    async (name) => {
      const clean = String(name || '').trim();
      if (!team || !clean) return { ok: false, error: 'El nombre no puede estar vacío.' };

      const { error } = await supabase.from('teams').update({ name: clean }).eq('id', team.id);
      if (error) return { ok: false, error: error.message };

      setTeam({ ...team, name: clean });
      return { ok: true };
    },
    [team]
  );

  /**
   * Vuelve a leer el plan.
   *
   * Hace falta cuando cambia el recuento de clientes —alta, archivo, borrado— y
   * al volver de pagar. La cifra sale de la base y no de `clients.length` a
   * propósito: quien impone el límite es el disparador de Postgres, y una segunda
   * cuenta hecha en el navegador acabaría discrepando el día que dos pestañas den
   * de alta a la vez. Se enseña la misma que manda.
   */
  const refreshPlan = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_team_plan');
    if (error) return { ok: false, error: error.message };
    setPlan(mapPlanFromDb(data?.[0]));
    return { ok: true };
  }, []);

  return {
    team,
    setTeam,
    teamMembers,
    setTeamMembers,
    plan,
    setPlan,
    reloadTeamMembers,
    inviteTeamMember,
    updateTeamMemberRole,
    removeTeamMember,
    renameTeam,
    refreshPlan,
  };
};
