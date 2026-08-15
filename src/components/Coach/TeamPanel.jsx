import { useMemo, useState } from 'react';
import { Check, Pencil, UserMinus, UserPlus, Users, X } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import {
  TEAM_ROLES,
  canManageMembers,
  memberName,
  membersWithLoad,
  roleLabel,
} from '@/domain/team';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { EmptyState, Notice, Panel, SectionTitle } from '@/components/ui/primitives';

const initials = (text) =>
  (text || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() || '')
    .join('');

/** Formulario de invitación. Falla de forma explicativa, que es lo que importa. */
const InviteForm = ({ onInvite }) => {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('trainer');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    const clean = email.trim();
    if (!clean) return;

    setBusy(true);
    setError(null);
    setDone(null);
    const result = await onInvite(clean, role);
    setBusy(false);

    if (result.ok) {
      setDone(clean);
      setEmail('');
    } else {
      setError(result.error);
    }
  };

  return (
    <Panel as="form" className="col gap-4" onSubmit={submit}>
      <SectionTitle icon={UserPlus}>Añadir a un entrenador</SectionTitle>

      {error && <Notice tone="error">{error}</Notice>}
      {done && <Notice tone="info">{done} ya forma parte del equipo.</Notice>}

      <div className="row-end wrap gap-3">
        <label className="field grow">
          <span className="field-label">Email de su cuenta</span>
          <input
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="entrenador@ejemplo.com"
          />
        </label>

        <label className="field shrink-0">
          <span className="field-label">Rol</span>
          <select className="select" value={role} onChange={(e) => setRole(e.target.value)}>
            {TEAM_ROLES.filter((r) => r.id !== 'owner').map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>

        <button type="submit" className="btn btn-primary" disabled={busy || !email.trim()}>
          {busy ? 'Añadiendo…' : 'Añadir'}
        </button>
      </div>

      <p className="t-xs t-tertiary">
        Tiene que haberse registrado antes con ese email. Si no existe la cuenta te lo dirá aquí en
        lugar de dejar una invitación colgada.
      </p>
    </Panel>
  );
};

const MemberRow = ({ member, isOwner, canManage, onRole, onRemove }) => (
  <div className="list-row">
    <span className="folio-mark" aria-hidden="true">
      {initials(memberName(member))}
    </span>

    <span className="list-row-label">
      <span className="title">{memberName(member)}</span>
      <span className="sub">{member.email || 'sin email'}</span>
    </span>

    <span className="row-meta">
      {member.clientCount} {member.clientCount === 1 ? 'cliente' : 'clientes'}
    </span>

    {canManage && !isOwner ? (
      <select
        className="select select-sm"
        value={member.role}
        onChange={(e) => onRole(e.target.value)}
        aria-label={`Rol de ${memberName(member)}`}
      >
        {TEAM_ROLES.filter((r) => r.id !== 'owner').map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
      </select>
    ) : (
      <span className="badge badge-info">{roleLabel(member.role)}</span>
    )}

    {canManage && !isOwner && (
      <button
        type="button"
        className="btn btn-icon btn-icon-danger"
        onClick={onRemove}
        aria-label={`Sacar del equipo a ${memberName(member)}`}
      >
        <UserMinus size={15} />
      </button>
    )}
  </div>
);

/**
 * Equipo.
 *
 * ── Qué resuelve ────────────────────────────────────────────────────────────
 * Es la única pantalla nueva que el modelo de equipos necesita. Todo lo demás
 * sigue funcionando sobre «el cliente activo», y quién puede ser el cliente
 * activo lo decide RLS, no la interfaz.
 *
 * Dos decisiones de contenido:
 *  · Cada miembro muestra CUÁNTOS clientes lleva. Una lista de nombres no dice
 *    nada; ver que uno lleva veinte y otro tres es lo que revela un problema de
 *    reparto.
 *  · El reparto se edita aquí mismo, cliente por cliente, con un desplegable. Es
 *    la operación que un entrenador jefe hace al dar de alta y cuando alguien se
 *    va, y no merece una pantalla propia.
 */
export const TeamPanel = () => {
  const {
    team,
    teamMembers,
    clients,
    inviteTeamMember,
    updateTeamMemberRole,
    removeTeamMember,
    assignClient,
    renameTeam,
  } = useApp();

  const confirm = useConfirm();
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [error, setError] = useState(null);

  const { rows, unassigned } = useMemo(
    () => membersWithLoad(teamMembers, clients),
    [teamMembers, clients]
  );

  if (!team) {
    return (
      <EmptyState
        icon={Users}
        title="Los equipos todavía no están activados"
        message="Trabajas como entrenador único: tus clientes son tuyos y nadie más los ve. Trabajar en equipo —repartir la cartera entre varios entrenadores, con sus permisos— todavía no está activo en tu cuenta. Escríbenos desde Ajustes → Ayuda si lo necesitas."
      />
    );
  }

  const canManage = canManageMembers(team.myRole);

  const commitName = async () => {
    const result = await renameTeam(draftName);
    if (result.ok) setRenaming(false);
    else setError(result.error);
  };

  const act = async (promise) => {
    const result = await promise;
    setError(result.ok ? null : result.error);
  };

  const askRemove = async (member) => {
    const ok = await confirm({
      title: `¿Sacar a ${memberName(member)} del equipo?`,
      message:
        member.clientCount > 0
          ? `Sus ${member.clientCount} clientes quedarán sin asignar y tendrás que repartirlos. No se borra nada.`
          : 'Perderá el acceso a los clientes del equipo. No se borra nada.',
      confirmLabel: 'Sacar del equipo',
      tone: 'danger',
    });
    if (ok) act(removeTeamMember(member.profileId));
  };

  return (
    <div className="stack">
      <div className="section-head">
        <div>
          {renaming ? (
            <div className="row gap-2">
              <input
                autoFocus
                className="input"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && commitName()}
                aria-label="Nombre del equipo"
              />
              <button type="button" className="btn btn-primary btn-sm" onClick={commitName}>
                <Check size={14} />
              </button>
              <button
                type="button"
                className="btn btn-icon"
                onClick={() => setRenaming(false)}
                aria-label="Cancelar"
              >
                <X size={15} />
              </button>
            </div>
          ) : (
            <h2 className="row gap-2">
              {team.name}
              {canManage && (
                <button
                  type="button"
                  className="btn btn-icon"
                  onClick={() => {
                    setDraftName(team.name);
                    setRenaming(true);
                  }}
                  aria-label="Cambiar el nombre del equipo"
                >
                  <Pencil size={14} />
                </button>
              )}
            </h2>
          )}
          <p>
            {rows.length} {rows.length === 1 ? 'persona' : 'personas'} · {clients.length}{' '}
            {clients.length === 1 ? 'cliente' : 'clientes'} · entras como {roleLabel(team.myRole).toLowerCase()}
          </p>
        </div>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      <div className="list">
        <div className="list-head">
          <span className="section-label">Miembros</span>
        </div>
        {rows.map((member) => (
          <MemberRow
            key={member.profileId}
            member={member}
            isOwner={member.profileId === team.ownerId}
            canManage={canManage}
            onRole={(role) => act(updateTeamMemberRole(member.profileId, role))}
            onRemove={() => askRemove(member)}
          />
        ))}
      </div>

      {canManage && <InviteForm onInvite={inviteTeamMember} />}

      {/* El reparto. Solo tiene sentido con más de una persona: con una sola,
          todos los clientes son suyos por definición. */}
      {rows.length > 1 && (
        <div className="list">
          <div className="list-head">
            <span className="section-label">Reparto de clientes</span>
            {unassigned > 0 && (
              <span className="badge badge-warn">
                {unassigned} sin asignar
              </span>
            )}
          </div>

          {clients.map((client) => (
            <div className="list-row" key={client.id}>
              <span className="list-row-label">
                <span className="title">{client.name}</span>
                <span className="sub">{client.plan || 'sin plan'}</span>
              </span>

              <select
                className="select select-sm"
                value={client.assignedTo || ''}
                onChange={(e) => assignClient(client.id, e.target.value)}
                aria-label={`Entrenador de ${client.name}`}
              >
                <option value="">Sin asignar</option>
                {rows
                  .filter((m) => m.role !== 'viewer')
                  .map((m) => (
                    <option key={m.profileId} value={m.profileId}>
                      {memberName(m)}
                    </option>
                  ))}
              </select>
            </div>
          ))}
        </div>
      )}

      <div className="list">
        <div className="list-head">
          <span className="section-label">Qué puede hacer cada rol</span>
        </div>
        {TEAM_ROLES.map((role) => (
          <div className="list-row" key={role.id}>
            <span className="list-row-label">
              <span className="title">{role.label}</span>
              <span className="sub">{role.hint}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
