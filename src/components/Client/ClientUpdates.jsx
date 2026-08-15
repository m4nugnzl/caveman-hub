import { useEffect, useMemo } from 'react';
import { ArrowRight, BellRing, CircleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useApp } from '@/context/AppContext';
import { clientProtocol } from '@/domain/protocol';
import { pendingTasks, unseenUpdates } from '@/domain/updates';
import { todayISO } from '@/lib/dates';
import { Panel } from '@/components/ui/primitives';

/**
 * Lo primero que ve el cliente al entrar: qué ha cambiado y qué le falta.
 *
 * ══ Por qué va arriba de su panel y no en una pestaña ═══════════════════════
 *
 * Una séptima sección llamada «Avisos» tendría el mismo defecto que lo de ahora:
 * **hay que acordarse de entrar**. Y en el móvil, donde solo caben cuatro
 * destinos en la barra inferior, empujaría algo detrás de «Más».
 *
 * Aquí está en la pantalla en la que aterriza siempre, encima de todo, y
 * desaparece sola cuando no hay nada que decir — que es lo que la hace creíble el
 * día que sí aparece. Un panel permanente que dice «no hay novedades» es ruido
 * constante a cambio de nada.
 *
 * ══ «Visto» se marca al ENTRAR, no al pulsar ═══════════════════════════════
 *
 * Porque una novedad no es un mensaje que haya que leer: es un aviso de que algo
 * cambió de sitio. Haber entrado y haberlo visto en pantalla es exactamente lo
 * que la novedad quería conseguir. Pedirle además que la marque sería inventar un
 * trámite.
 *
 * Se marca con retraso a propósito: si se hiciera al montar, el propio guardado
 * volvería a pintar el componente sin las novedades **antes de que le diera
 * tiempo a leerlas**. Con dos segundos, las ve, y para la próxima visita ya no
 * están.
 */
export const ClientUpdates = ({ client }) => {
  const { anthropometry, updateClientPreferences } = useApp();

  const preferences = client?.preferences;
  /* Memoizado: `|| []` crea un array nuevo en cada render y con él invalidaría el
     cálculo de los pendientes en cada pintada. Es el mismo motivo por el que lo
     hace `AnthropometryPanel` con su historial. */
  const history = useMemo(
    () => anthropometry?.[client?.id]?.history || [],
    [anthropometry, client?.id]
  );

  const novedades = useMemo(() => unseenUpdates(preferences), [preferences]);
  const pendientes = useMemo(
    () =>
      pendingTasks({
        history,
        protocol: clientProtocol(preferences),
        today: todayISO(),
      }),
    [history, preferences]
  );

  const hayNovedades = novedades.length > 0;
  const clientId = client?.id;

  useEffect(() => {
    if (!clientId || !hayNovedades) return undefined;
    const id = setTimeout(() => {
      updateClientPreferences(clientId, 'feed', { seen: new Date().toISOString() });
    }, 2000);
    return () => clearTimeout(id);
  }, [clientId, hayNovedades, updateClientPreferences]);

  if (!hayNovedades && pendientes.length === 0) return null;

  return (
    <Panel className="col gap-3">
      {hayNovedades && (
        <div className="col gap-2">
          <span className="section-label">
            <BellRing size={12} style={{ display: 'inline', verticalAlign: -2, marginRight: 5 }} />
            Novedades
          </span>

          {novedades.map((n) => (
            <Link className="card-inset row between wrap gap-2" to={n.href} key={n.id}>
              <span className="col" style={{ gap: 1, minWidth: 0 }}>
                <span className="t-sm" style={{ fontWeight: 650 }}>
                  {n.label}
                </span>
                <span className="t-2xs t-tertiary">{n.hint}</span>
              </span>
              <ArrowRight size={15} style={{ color: 'var(--data-blue)', flexShrink: 0 }} />
            </Link>
          ))}
        </div>
      )}

      {pendientes.length > 0 && (
        <div className="col gap-2">
          {/*
            Los pendientes van DEBAJO de las novedades y no al revés: lo primero
            que quiere saber alguien al abrir es si hay algo nuevo para él, y
            después qué se espera de él. Al revés, la pantalla se abre riñendo.
          */}
          <span className="section-label">
            <CircleAlert size={12} style={{ display: 'inline', verticalAlign: -2, marginRight: 5 }} />
            Te falta esta semana
          </span>

          {pendientes.map((p) => (
            <Link className="card-inset row between wrap gap-2" to={p.href} key={p.id}>
              <span className="col" style={{ gap: 1, minWidth: 0 }}>
                <span className="t-sm" style={{ fontWeight: 650 }}>
                  {p.label}
                </span>
                <span className="t-2xs t-tertiary">{p.hint}</span>
              </span>
              <ArrowRight size={15} style={{ color: 'var(--warning)', flexShrink: 0 }} />
            </Link>
          ))}
        </div>
      )}
    </Panel>
  );
};
