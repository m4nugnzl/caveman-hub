import { useMemo, useState } from 'react';

import { ACTIVITY_KINDS, buildActivity, dayLabel, groupByDay } from '@/domain/today';
import { allSessions } from '@/domain/sessions';
import { Modal } from '@/components/ui/Modal';
import { Tarjeta, TarjetaVacia } from './Tarjeta';

/**
 * EL HILO — todo lo que le ha pasado a esta persona, por fecha.
 *
 * ══ Por qué existe ═════════════════════════════════════════════════════════
 * Para saber «qué ha pasado con Nerea desde la última vez que hablamos» había
 * que abrir cuatro sitios: sus entrenos en Entreno, sus pesajes y fotos en
 * Revisiones, su check-in en la semana, tu respuesta en el histórico. Ninguna
 * pantalla contaba la historia seguida. Es lo que hacen HubFit y Strava, y es
 * lo primero que un entrenador quiere leer antes de escribirle a alguien.
 *
 * ── Qué lleva ───────────────────────────────────────────────────────────────
 * Los mismos eventos que Inicio (`domain/today.buildActivity`: entrenos,
 * pesajes, fotos, el check-in en curso) más dos que solo tienen sentido en la
 * ficha de UNA persona: cada check-in que entregó y cada respuesta tuya, con
 * la nota que le dejaste. No se inventa ningún dato: todo sale de lo que ya
 * está descargado para pintar el Resumen.
 *
 * ── La forma ────────────────────────────────────────────────────────────────
 * Una tarjeta del mosaico con las dos últimas semanas y una ventana con tres
 * meses. Un evento es una fila: el día, un punto del color de su clase, qué
 * pasó y una cifra. Sin iconos: el color y la frase ya lo dicen.
 */
const KINDS = {
  ...ACTIVITY_KINDS,
  /* El check-in entregado hereda el color de su clase en el dominio: el color
     de dato no se escribe en un componente. */
  entregado: { ...ACTIVITY_KINDS.checkin, id: 'entregado' },
  respuesta: { id: 'respuesta', label: 'Tu respuesta', color: 'var(--brasa)' },
};

/* La tarjeta enseña la última semana y como mucho ocho filas: con dos semanas
   enteras la columna derecha medía el doble que el mosaico. Lo demás, en la
   ventana. */
const MAX_CORTO = 5;

const recorta = (texto, max = 90) => {
  const t = String(texto || '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

/** Los eventos de una persona en los últimos `days` días, del más nuevo al más viejo. */
export const hiloDeCliente = ({ client, program, anthro, photos, checkIns, revisiones, hoy, days }) => {
  const sesiones = allSessions(program?.microcycles || []);
  const base = buildActivity(
    {
      clients: [client],
      training: { [client.id]: { recentSessions: sesiones } },
      anthropometry: { [client.id]: anthro },
      progressPhotos: photos,
      checkIns: {},
    },
    hoy,
    days
  );

  const extra = [];
  const desde = new Date(`${hoy}T00:00:00Z`);
  desde.setUTCDate(desde.getUTCDate() - days);
  const limite = desde.toISOString().slice(0, 10);

  for (const c of checkIns || []) {
    const fecha = String(c.submittedAt || '').slice(0, 10);
    if (!fecha || fecha < limite) continue;
    extra.push({
      id: `entregado:${c.id || c.weekStart}`,
      date: fecha,
      kind: 'entregado',
      title: 'Entregó su check-in',
      detail: c.note ? `«${recorta(c.note, 70)}»` : null,
    });
  }
  for (const r of revisiones || []) {
    const fecha = String(r.reviewedAt || '').slice(0, 10);
    if (!fecha || fecha < limite) continue;
    const cambios = (r.changes || []).length;
    extra.push({
      id: `respuesta:${r.id || r.weekStart}`,
      date: fecha,
      kind: 'respuesta',
      title: r.video ? 'Le contestaste en vídeo' : 'Le contestaste',
      detail:
        recorta(r.coachNotes, 80) ||
        (cambios > 0 ? `${cambios} ${cambios === 1 ? 'cambio' : 'cambios'} en el plan` : 'seguimos igual'),
    });
  }

  return [...base, ...extra].sort((a, b) => String(b.date).localeCompare(String(a.date)));
};

const Fila = ({ ev, hoy = null }) => {
  const kind = KINDS[ev.kind] || KINDS.session;
  return (
    <li className="hilo-fila">
      <span className="hilo-punto" style={{ background: kind.color }} aria-hidden="true" />
      <span className="hilo-que">
        <span className="t">{ev.title}</span>
        {ev.detail && <span className="d">{ev.detail}</span>}
      </span>
      {/* En la tarjeta la fecha va en la fila —cinco filas no merecen cinco
          cabeceras—; en la ventana de tres meses se agrupa por día. */}
      {hoy && <span className="hilo-cuando">{dayLabel(ev.date, hoy).replace(/^(w)/, (c) => c.toUpperCase())}</span>}
    </li>
  );
};

const ListaCorta = ({ eventos, hoy }) => (
  <ul className="hilo-filas is-corta">
    {eventos.map((ev) => (
      <Fila key={ev.id} ev={ev} hoy={hoy} />
    ))}
  </ul>
);

const Lista = ({ eventos, hoy }) => (
  <div className="hilo">
    {groupByDay(eventos, hoy).map((grupo) => (
      <div className="hilo-dia" key={grupo.date}>
        <span className="hilo-fecha">{dayLabel(grupo.date, hoy)}</span>
        <ul className="hilo-filas">
          {grupo.events.map((ev) => (
            <Fila key={ev.id} ev={ev} />
          ))}
        </ul>
      </div>
    ))}
  </div>
);

export const TarjetaHilo = ({ client, program, anthro, photos, checkIns, revisiones, hoy, span = 4 }) => {
  const [abierto, setAbierto] = useState(false);
  const corto = useMemo(
    () => hiloDeCliente({ client, program, anthro, photos, checkIns, revisiones, hoy, days: 7 }).slice(0, MAX_CORTO),
    [client, program, anthro, photos, checkIns, revisiones, hoy]
  );
  const largo = useMemo(
    () => (abierto ? hiloDeCliente({ client, program, anthro, photos, checkIns, revisiones, hoy, days: 90 }) : []),
    [abierto, client, program, anthro, photos, checkIns, revisiones, hoy]
  );

  return (
    <Tarjeta
      rotulo="Lo último"
      span={span}
      vacia={corto.length === 0}
      accion={
        corto.length > 0 ? (
          <button type="button" className="cab-accion is-puerta" onClick={() => setAbierto(true)}>
            Tres meses
          </button>
        ) : null
      }
    >
      {corto.length === 0 ? (
        <TarjetaVacia>Nada esta semana: ni entrenos, ni pesajes, ni fotos.</TarjetaVacia>
      ) : (
        <ListaCorta eventos={corto} hoy={hoy} />
      )}

      <Modal open={abierto} title={`${client.name} · los últimos tres meses`} onClose={() => setAbierto(false)} size="side">
        {largo.length === 0 ? (
          <p className="t-sm t-tertiary">Nada en los últimos tres meses.</p>
        ) : (
          <Lista eventos={largo} hoy={hoy} />
        )}
      </Modal>
    </Tarjeta>
  );
};
