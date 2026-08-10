/**
 * Equipo: un negocio con varios entrenadores.
 *
 * ── El concepto ─────────────────────────────────────────────────────────────
 * `clients.coach_id` significaba dos cosas a la vez: de quién ES el cliente y
 * quién lo LLEVA. Con un entrenador solo coinciden; con un equipo, no. Se separan
 * en `teamId` (el negocio) y `assignedTo` (el entrenador responsable).
 *
 * ── Degradación deliberada ──────────────────────────────────────────────────
 * Mientras la migración 0006 no esté aplicada no hay equipo, y TODO sigue
 * funcionando como antes: un entrenador con sus clientes. `hasTeams` distingue
 * los dos mundos, y ninguna pantalla necesita saber más.
 */

export const TEAM_ROLES = [
  {
    id: 'owner',
    label: 'Dueño',
    hint: 'Ve y gestiona todo el equipo, incluidos los miembros y sus roles',
  },
  { id: 'admin', label: 'Gestor', hint: 'Ve y gestiona todos los clientes; no toca los miembros' },
  { id: 'trainer', label: 'Entrenador', hint: 'Solo ve y gestiona los clientes que tiene asignados' },
  { id: 'viewer', label: 'Invitado', hint: 'Ve todos los clientes en solo lectura' },
];

export const roleLabel = (id) => TEAM_ROLES.find((r) => r.id === id)?.label || 'Sin rol';

/** Roles que pueden trabajar con cualquier cliente del equipo. */
const FULL_ACCESS = new Set(['owner', 'admin']);

export const canManageMembers = (role) => role === 'owner';
export const canSeeWholeTeam = (role) => FULL_ACCESS.has(role) || role === 'viewer';
export const canAssignClients = (role) => FULL_ACCESS.has(role);
export const isReadOnly = (role) => role === 'viewer';

/**
 * Miembros con su carga de trabajo.
 *
 * Contar clientes por miembro es lo que convierte la lista en información útil:
 * un equipo donde uno lleva veinte y otro tres tiene un problema de reparto, y
 * eso no se ve en una lista de nombres.
 */
export const membersWithLoad = (members, clients) => {
  const counts = new Map();
  let unassigned = 0;

  for (const client of clients) {
    if (!client.assignedTo) unassigned += 1;
    else counts.set(client.assignedTo, (counts.get(client.assignedTo) || 0) + 1);
  }

  const rows = members.map((member) => ({
    ...member,
    clientCount: counts.get(member.profileId) || 0,
  }));

  // Por rol y luego por carga: el dueño primero, y dentro de cada rol quien más
  // gente lleva.
  const order = TEAM_ROLES.map((r) => r.id);
  rows.sort((a, b) => {
    const byRole = order.indexOf(a.role) - order.indexOf(b.role);
    if (byRole !== 0) return byRole;
    return b.clientCount - a.clientCount;
  });

  return { rows, unassigned };
};

/** Nombre corto de un miembro, para etiquetas y filtros. */
export const memberName = (member) => {
  const full = (member?.name || '').trim();
  if (full) return full;
  return member?.email || 'Sin nombre';
};

/** Opciones del selector de entrenador responsable. */
export const assignableMembers = (members) =>
  members.filter((m) => m.role !== 'viewer').map((m) => ({ value: m.profileId, label: memberName(m) }));
