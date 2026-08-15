import { useEffect, useMemo } from 'react';
import { ArrowRight, BellRing, CircleAlert, X } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useActions, useData } from '@/context/AppContext';
import { clientProtocol } from '@/domain/protocol';
import { dismissUpdate, lastSeen, pendingTasks, unseenUpdates } from '@/domain/updates';
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
 *
 * ══ Y por qué el sello también se pone cuando NO hay novedades ══════════════
 *
 * Porque si no, no se pone nunca y esta pantalla no funciona para nadie.
 *
 * `unseenUpdates` devuelve vacío mientras no haya un `seen` guardado —para que
 * quien estrena el portal no vea de golpe tres avisos de cosas que llevan ahí
 * desde marzo—. Pero el ÚNICO sitio que escribe ese `seen` es este efecto, y
 * estaba condicionado a que hubiera novedades. O sea: sin sello no hay novedades,
 * y sin novedades no se escribía el sello.
 *
 * La consecuencia era que el aviso de «tu entrenador te ha cambiado la rutina»
 * no le llegaba nunca a ningún cliente, en silencio y sin nada que lo delatara.
 *
 * Así que la primera visita PONE EL CONTADOR EN MARCHA aunque no haya nada que
 * enseñar. Es lo que hace cierta la promesa del dominio: no ves lo de antes,
 * pero sí todo lo que cambie a partir de ahora.
 */
export const ClientUpdates = ({ client }) => {
  const { anthropometry } = useData();
  const { updateClientPreferences } = useActions();

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

  /* Se sella si hay novedades que dar por vistas, o si no hay sello todavía
     —la primera visita, que es la que arranca el contador—. Sin la segunda
     mitad, `seen` no se escribía jamás y las novedades no llegaban nunca. */
  const estrena = !lastSeen(preferences);

  useEffect(() => {
    if (!clientId || (!hayNovedades && !estrena)) return undefined;
    const id = setTimeout(() => {
      updateClientPreferences(clientId, 'feed', { seen: new Date().toISOString() });
    }, 2000);
    return () => clearTimeout(id);
  }, [clientId, hayNovedades, estrena, updateClientPreferences]);

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
            <div className="alert-card" key={n.id}>
              <Link className="alert-hit" to={n.href}>
                <span className="say">
                  <span className="t">{n.label}</span>
                  <span className="h">{n.hint}</span>
                </span>
                <ArrowRight size={16} className="go" />
              </Link>

              {/* Quitarla. Un aviso que no se puede quitar deja de ser un aviso
                  en cuanto hay dos: se acumulan y se dejan de mirar. */}
              <button
                type="button"
                className="alert-x"
                aria-label={`Descartar «${n.label}»`}
                onClick={() =>
                  updateClientPreferences(clientId, 'feed', {
                    dismissed: dismissUpdate(preferences, n.id, n.at),
                  })
                }
              >
                <X size={14} />
              </button>
            </div>
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

          {/* Los pendientes NO se pueden descartar: no son un aviso de algo que
              ha pasado, son algo que falta por hacer. Desaparecen solos al
              hacerlo, que es la única forma honesta de quitarlos. */}
          {pendientes.map((p) => (
            <Link className="alert-card is-todo" to={p.href} key={p.id}>
              <span className="alert-hit">
                <span className="say">
                  <span className="t">{p.label}</span>
                  <span className="h">{p.hint}</span>
                </span>
                <ArrowRight size={16} className="go" />
              </span>
            </Link>
          ))}
        </div>
      )}
    </Panel>
  );
};
