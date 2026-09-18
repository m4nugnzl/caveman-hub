import { useMemo, useState } from 'react';
import { Camera, ClipboardCheck, Dumbbell, History, MessageSquare, Scale } from 'lucide-react';

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
 * Una tarjeta del mosaico con las seis últimas cosas que pasaron y una ventana
 * con los tres meses enteros. Un evento es una fila: qué pasó, cuándo, y una
 * línea con la cifra debajo.
 *
 * ── Y ahora SÍ lleva icono (frame 258:154, 17 sep) ──────────────────────────
 * Aquí ponía «sin iconos: el color y la frase ya lo dicen», y la ley de la casa
 * es que una tarjeta no lleva icono DECORATIVO delante de su rótulo. Estos no lo
 * son: son el disco de clase que ya estaba —el punto de ocho píxeles del color
 * del evento— con el glifo de lo que pasó dentro. Hace un trabajo que el punto
 * no hacía: distinguir un pesaje de una foto sin leer la frase, que es
 * exactamente para lo que se baja la vista a esta lista. El color sigue saliendo
 * del dominio (`ACTIVITY_KINDS`), no del componente.
 */
const GLIFOS = {
  session: Dumbbell,
  weight: Scale,
  photo: Camera,
  checkin: ClipboardCheck,
  entregado: ClipboardCheck,
  respuesta: MessageSquare,
};
const KINDS = {
  ...ACTIVITY_KINDS,
  /* El check-in entregado hereda el color de su clase en el dominio: el color
     de dato no se escribe en un componente. */
  entregado: { ...ACTIVITY_KINDS.checkin, id: 'entregado' },
  respuesta: { id: 'respuesta', label: 'Tu respuesta', color: 'var(--brasa)' },
};

/* La ventana del hilo: tres meses, los mismos que abre «Tres meses». Es una
   sola consulta para las dos vistas — ver el comentario de `TarjetaHilo`. */
const DIAS = 90;
/* Y la tarjeta enseña su cabeza: las seis últimas cosas que pasaron, en dos
   filas de tres a lo ancho del mosaico (ver `.hilo-tarjeta` en revision.css).
   El resto, en la ventana de tres meses. */
const MAX_CORTO = 6;

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
  const Glifo = GLIFOS[ev.kind] || Dumbbell;
  return (
    <li className="hilo-fila">
      <span className="hilo-disco" style={{ color: kind.color }} aria-hidden="true">
        <Glifo size={15} strokeWidth={2} />
      </span>
      <span className="hilo-que">
        <span className="hilo-linea">
          <span className="t">{ev.title}</span>
          {/* En la tarjeta la fecha va en la fila —cinco filas no merecen cinco
              cabeceras—; en la ventana de tres meses se agrupa por día. */}
          {hoy && (
            <span className="hilo-cuando">
              {dayLabel(ev.date, hoy).replace(/^(w)/, (c) => c.toUpperCase())}
            </span>
          )}
        </span>
        {ev.detail && <span className="d">{ev.detail}</span>}
      </span>
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

export const TarjetaHilo = ({ client, program, anthro, photos, checkIns, revisiones, hoy, span = 12 }) => {
  const [abierto, setAbierto] = useState(false);
  /*
    UN solo hilo, y la tarjeta enseña su cabeza.

    Antes eran dos consultas: la tarjeta pedía SIETE DÍAS y la ventana tres
    meses. Y con una semana tranquila —que las hay, y son la mitad— salía una
    tarjeta con su rótulo, su puerta y UNA fila debajo: casi toda marco. El
    vacío formal solo salta con cero eventos, así que uno o dos caían en la
    tierra de nadie que se lee como avería.

    «Lo último» no deja de existir porque esta semana haya sido tranquila. Se
    piden los tres meses y se enseñan las cinco últimas cosas que pasaron, con
    la fecha de cada fila diciendo cuándo fue —que ya la lleva, y `dayLabel`
    pone «Jueves 12 ago» en cuanto se sale de la semana—. Así la tarjeta tiene
    siempre el cuerpo que su cabecera promete.

    De paso es una consulta menos: la ventana ya no recalcula, reparte.
  */
  const hilo = useMemo(
    () => hiloDeCliente({ client, program, anthro, photos, checkIns, revisiones, hoy, days: DIAS }),
    [client, program, anthro, photos, checkIns, revisiones, hoy]
  );
  const corto = hilo.slice(0, MAX_CORTO);

  return (
    <Tarjeta
      rotulo="Lo último"
      span={span}
      className="hilo-tarjeta"
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
        <TarjetaVacia>Nada en tres meses: ni entrenos, ni pesajes, ni fotos.</TarjetaVacia>
      ) : (
        <ListaCorta eventos={corto} hoy={hoy} />
      )}

      {/*
        Una ventana en el centro, como las otras puertas del Resumen, y no el
        panel del canto derecho. Era la ÚNICA de la pantalla que salía de lado
        («me sale lateralmente en vez de como popup»): `side` es para mirar
        un detalle sin tapar aquello con lo que se compara, y aquí no hay nada
        con qué compararlo — es leer tres meses seguidos. Con la cabecera de
        todas: placa con el signo, titular y la frase de qué va.
      */}
      <Modal
        open={abierto}
        icono={History}
        title="Lo último"
        sub={`Todo lo que le ha pasado a ${client.name} en los últimos tres meses`}
        onClose={() => setAbierto(false)}
      >
        {hilo.length === 0 ? (
          <p className="t-sm t-tertiary">Nada en los últimos tres meses.</p>
        ) : (
          <Lista eventos={hilo} hoy={hoy} />
        )}
      </Modal>
    </Tarjeta>
  );
};
