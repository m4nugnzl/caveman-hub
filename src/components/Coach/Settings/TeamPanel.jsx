import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Pencil, UserMinus, UserPlus, Users, X } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { supabase } from '@/lib/supabaseClient';
import {
  TEAM_ROLES,
  assignableMembers,
  canManageMembers,
  memberName,
  membersWithLoad,
  roleLabel,
} from '@/domain/team';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { Notice, PageHead, Panel, SectionTitle } from '@/components/ui/primitives';
import { Avatar } from '@/components/ui/Avatar';

/**
 * El tope de asientos del plan actual (0064; la columna existe desde la 0019).
 *
 * Mismo patrón que `has_integrations` en el catálogo: quien lo IMPONE es un
 * disparador de Postgres; esta consulta hace que la pantalla lo EXPLIQUE antes
 * de chocar con él. `null` = sin dato (columna sin migrar, cuenta sin plan) y
 * entonces no se capa nada desde aquí — la última palabra la tiene la base.
 */
const useMaxSeats = (planId) => {
  const [maxSeats, setMaxSeats] = useState(null);
  useEffect(() => {
    if (!planId) return undefined;
    let alive = true;
    supabase
      .from('plan_limits')
      .select('max_seats')
      .eq('plan', planId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (alive && !error) setMaxSeats(data?.max_seats ?? null);
      });
    return () => {
      alive = false;
    };
  }, [planId]);
  return maxSeats;
};

/** Formulario de invitación. Falla de forma explicativa, que es lo que importa. */
const InviteForm = ({ onInvite, cupoLleno }) => {
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

      {/* El cupo, dicho ANTES de rellenar el formulario y no al pulsar: quien
          va a chocar con el tope debe saberlo antes de escribir el email. El
          disparador de la 0064 lo impone igualmente en el servidor. */}
      {cupoLleno && (
        <Notice tone="info">
          Tu plan no tiene asientos libres. Para añadir a alguien más,{' '}
          <Link to="/ajustes/plan">amplía tu plan</Link> o saca antes a un miembro.
        </Notice>
      )}

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

        <button type="submit" className="btn btn-primary" disabled={busy || !email.trim() || cupoLleno}>
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
    <Avatar name={memberName(member)} size="md" className="folio-mark" />

    <span className="list-row-label">
      <span className="title">{memberName(member)}</span>
      <span className="sub">{member.email || 'sin email'}</span>
    </span>

    <span className="row-meta">
      {member.clientCount} {member.clientCount === 1 ? 'cliente' : 'clientes'}
    </span>

    {canManage && !isOwner ? (
      /* El significado del rol elegido, debajo del selector: la tabla aparte de
         «qué puede hacer cada rol» obligaba a mirar dos sitios para una
         decisión; aquí la explicación acompaña a la elección. */
      <span className="col" style={{ gap: 2, alignItems: 'flex-end', maxWidth: 260 }}>
        <select
          className="select select-sm"
          value={member.role}
          onChange={(e) => onRole(e.target.value)}
          aria-label={`Rol de ${memberName(member)}`}
          aria-describedby={`rol-hint-${member.profileId}`}
        >
          {TEAM_ROLES.filter((r) => r.id !== 'owner').map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
        <span
          id={`rol-hint-${member.profileId}`}
          className="t-2xs t-tertiary"
          style={{ textAlign: 'right' }}
        >
          {TEAM_ROLES.find((r) => r.id === member.role)?.hint}
        </span>
      </span>
    ) : (
      <span
        className="badge badge-info"
        title={TEAM_ROLES.find((r) => r.id === member.role)?.hint}
      >
        {roleLabel(member.role)}
      </span>
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
    plan,
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
  const maxSeats = useMaxSeats(plan?.plan);

  /* `ensure_my_team()` crea el equipo al arrancar, así que esto solo es cierto
     durante el primer tick de carga: no hay nada que explicar, solo esperar. */
  if (!team) return null;

  const canManage = canManageMembers(team.myRole);
  const cupoLleno = maxSeats != null && rows.length >= maxSeats;

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
      {/*
        El nombre del equipo se queda SIEMPRE en el título y el renombrado ocurre
        en la acción, a su lado. Antes el campo sustituía al titular, así que al
        empezar a escribir la pantalla se quedaba sin nombre y no se sabía qué se
        estaba renombrando —y de paso metía un `<input>` dentro de un
        encabezado, que para un lector de pantalla no es un encabezado—.
      */}
      {/* El título es el nombre de la PANTALLA, y el del equipo es un dato
          suyo: pulsando «Equipo» en la lista de ajustes se aterrizaba en «Los
          Cavernícolas», y quien no recuerde cómo llamó a su equipo no sabe si
          ha llegado. El nombre va de remate, que es donde va la parte humana de
          un titular en este producto. Se sigue cambiando desde el mismo sitio. */}
      <PageHead
        title="Equipo"
        remate={team.name}
        sub={`${rows.length} ${rows.length === 1 ? 'persona' : 'personas'} · ${clients.length} ${
          clients.length === 1 ? 'cliente' : 'clientes'
        }${
          /* Los asientos del plan, donde ya se cuentan personas. Sin la 0064 no
             hay dato y la frase se queda como estaba. */
          maxSeats != null ? ` · ${rows.length} de ${maxSeats} asientos` : ''
        } · entras como ${roleLabel(team.myRole).toLowerCase()}`}
        action={
          renaming ? (
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
            canManage && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setDraftName(team.name);
                  setRenaming(true);
                }}
              >
                <Pencil size={14} /> Cambiar el nombre
              </button>
            )
          )
        }
      />

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

      {/*
        El estado «solo»: la pantalla existía sin explicar para qué sirve un
        equipo a quien todavía no lo tiene. Es la única sección de Ajustes cuyo
        valor no se ve hasta ser dos, así que se dice qué da —reparto y roles—
        y, si el plan trae un solo asiento, qué hace falta para ser más.
      */}
      {rows.length === 1 && (
        <Panel className="col gap-2">
          <SectionTitle icon={Users}>Trabajar en equipo</SectionTitle>
          <p className="t-sm t-secondary">
            Invita a otro entrenador y reparte la cartera: quién lleva a cada cliente se decide
            aquí, cada rol ve solo lo suyo, y las bibliotecas de ejercicios y alimentos son del
            equipo — lo que uno crea le sirve a todos.
          </p>
          {maxSeats === 1 && (
            <p className="t-sm t-secondary">
              Tu plan incluye un asiento. Para añadir entrenadores,{' '}
              <Link to="/ajustes/plan">mira los planes con equipo</Link>.
            </p>
          )}
        </Panel>
      )}

      {canManage && <InviteForm onInvite={inviteTeamMember} cupoLleno={cupoLleno} />}

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
                {assignableMembers(rows).map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      {/* La tabla estática de «qué puede hacer cada rol» se fue: la explicación
          del rol vive ahora pegada al selector de cada miembro, que es donde se
          decide. Una lista de referencia aparte obligaba a mirar dos sitios. */}
    </div>
  );
};
