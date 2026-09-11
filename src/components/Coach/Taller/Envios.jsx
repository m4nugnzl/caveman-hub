import { useEffect } from 'react';

import {
  ArrowLeft,
  Bell,
  CalendarClock,
  FileText,
  PlayCircle,
  Send,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';

import { useActions, useApp } from '@/context/AppContext';
import {
  audienciaLegible,
  avanceDe,
  hecha,
  pendientesDe,
  porLeer,
  vigente,
} from '@/domain/envios';
import { columnasDe, respuestaLegible } from '@/domain/formulario';
import { coachProtocolos } from '@/domain/protocolos';
import { dayMonthMaybeYear, todayISO } from '@/lib/dates';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { EmptyState } from '@/components/ui/primitives';

/**
 * LOS ENVÍOS: lo que has mandado una vez, y lo que ha vuelto.
 *
 * ══ Por qué viven en Protocolos y no en su propia pantalla ═════════════════
 *
 * Porque es la misma clase de cosa. Un protocolo es una acción cuya audiencia es
 * «los que lo llevan» y cuyo momento es un tramo de la vida del cliente; un
 * envío es la misma acción con la audiencia dicha a mano y el momento dicho
 * ahora. Se leen con la misma gramática —verbo, qué, a quién, cuándo— y
 * separarlos habría obligado a mirar en dos sitios para contestar una sola
 * pregunta: qué les está pasando a mis clientes.
 *
 * Por eso la pantalla tiene dos rótulos y no dos pestañas: **SIEMPRE** y
 * **UNA VEZ**.
 *
 * ══ Y la tabla de resultados es lo que justifica todo lo demás ═════════════
 *
 * Ni Coachway ni Efort la tienen: sus automatizaciones mandan y se olvidan. Una
 * columna por pregunta y una fila por persona convierte «he preguntado» en «ya
 * sé», que es lo que el encargo pedía con «empoderarnos de información».
 */

const fecha = (iso) => (iso ? dayMonthMaybeYear(iso.slice(0, 10)) : '—');

/*
  Dos familias y dos discos: lo que le pides (azul) y lo que le das (verde). Son
  los tonos que ya existen en `taller.css` —no se inventa ninguno—, y el criterio
  es el mismo de la Librería: el disco distingue la clase, el acento sigue siendo
  solo lo que se puede tocar.
*/
const TONO_DE = { form: 4, pide: 4, documento: 2, video: 2 };

const ICONO_DE = {
  form: <FileText size={13} />,
  pide: <Upload size={13} />,
  documento: <FileText size={13} />,
  video: <PlayCircle size={13} />,
};

// ══ La lista ═══════════════════════════════════════════════════════════════

export const EnviosSeccion = ({ envios, onAbrir, onMandar }) => {
  const { coachPrefs } = useApp();
  const protocolos = coachProtocolos(coachPrefs);
  const hoy = todayISO();

  if (envios.length === 0) {
    return (
      <EmptyState
        icon={Send}
        title="No has mandado nada suelto"
        message="Un envío es lo que le pides a unas cuantas personas concretas sin cambiarles el protocolo: un cuestionario de sueño, un vídeo, un aviso."
        action={
          <button type="button" className="btn btn-primary btn-sm" onClick={onMandar}>
            <Send size={15} /> Mandar algo
          </button>
        }
      />
    );
  }

  return (
    <div className="plantilla">
      <table>
        <thead>
          <tr>
            <th scope="col">Qué mandaste</th>
            <th scope="col">A quién</th>
            <th scope="col">Cuándo</th>
            {/* «Han contestado» era verdad cuando lo único que se podía mandar
                era un cuestionario. Un vídeo no se contesta, se abre. */}
            <th scope="col">Cómo va</th>
          </tr>
        </thead>
        <tbody>
          {envios.map((e) => {
            const avance = avanceDe(e);
            /* Programado = ninguna de sus filas le toca todavía a nadie. Se
               calcula al leer, porque no hay servidor que lo dispare. */
            const programado = e.filas.every((f) => !vigente(f, hoy));
            return (
              <tr key={e.id}>
                <td>
                  <span className="p-name f-nombre">
                    {/*
                      El disco dice de qué clase es, con la misma mecánica que
                      los de la Librería. Estaba clavado en `data-tono={1}`, que
                      NO existe en `taller.css`: sin `--fd-h` asignado el `hsl()`
                      entero es inválido y el disco salía sin pintar —un fallo
                      que `verify` no ve, porque el token no falta: falta el
                      valor—. Ahora sale del tipo, que es lo que significaba.
                    */}
                    <span className="f-disco" data-tono={TONO_DE[e.tipo] ?? 4} aria-hidden="true">
                      {ICONO_DE[e.tipo] || <FileText size={13} />}
                    </span>
                    <button type="button" className="p-abrir" onClick={() => onAbrir(e.id)}>
                      {e.title}
                    </button>
                  </span>
                </td>
                <td className="t-sm t-secondary">
                  <Users size={13} className="icon-inline" aria-hidden="true" />
                  {e.mandados} · {audienciaLegible(e.audiencia, { protocolos })}
                </td>
                <td className="t-sm t-secondary">
                  {programado ? (
                    <>
                      <CalendarClock size={13} className="icon-inline" aria-hidden="true" />
                      {fecha(e.filas[0]?.due)}
                    </>
                  ) : (
                    fecha(e.sentAt)
                  )}
                </td>
                <td>
                  {programado ? (
                    <span className="badge badge-warn">Programado</span>
                  ) : (
                    <span className="avance">
                      <span className="avance-via">
                        <i style={{ width: `${Math.round(avance.parte * 100)}%` }} />
                      </span>
                      <span className="avance-dice">{avance.dice}</span>
                      {/* Y cuántas de esas respuestas no has abierto todavía
                          (0108). Sin esto, «3 contestados» de hoy y de la semana
                          pasada se leen igual, y la única diferencia es
                          acordarse. Se apaga al abrir el envío. */}
                      {e.nuevas > 0 && (
                        <span className="badge badge-info">
                          {e.nuevas === 1 ? '1 sin leer' : `${e.nuevas} sin leer`}
                        </span>
                      )}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// ══ Uno abierto: la tabla que devuelve la información ══════════════════════

export const EnvioAbierto = ({ envio, onVolver }) => {
  const { clients, coachPrefs } = useApp();
  const { dejarDePedir, marcarVisto } = useActions();
  const confirm = useConfirm();

  /*
    ══ Abrirlo ES leerlo ══════════════════════════════════════════════════════

    Ésta es la pantalla donde lo contestado se lee, así que aquí se da por leído
    (`seen_at`, migración 0108) y la cola «Leer lo que te han contestado» se
    vacía sola. Un botón de «marcar como leído» encima de la tabla que acabas de
    leer sería trabajo de archivo, no de entrenador.

    La lista de ids viaja como CADENA a propósito: es lo que hace que el efecto
    dependa de un valor estable y no del envío, que se reconstruye entero cada
    vez que llega una respuesta nueva. Marcadas, la cadena se queda vacía y el
    efecto no vuelve a escribir.
  */
  const porLeerIds = porLeer(envio.filas)
    .map((f) => f.id)
    .join(',');

  useEffect(() => {
    if (porLeerIds) marcarVisto(porLeerIds.split(','));
  }, [porLeerIds, marcarVisto]);

  const columnas = columnasDe(envio.elementos);
  const avance = avanceDe(envio);
  const pendientes = pendientesDe(envio);
  const protocolos = coachProtocolos(coachPrefs);

  const nombreDe = (id) => (clients || []).find((c) => c.id === id)?.name || 'Alguien';

  /* Los que han contestado arriba y los que no, abajo y en gris: lo que se viene
     a leer es lo que ha vuelto, no lo que falta. */
  const filas = [...envio.filas].sort((a, b) => {
    if (hecha(a) !== hecha(b)) return hecha(a) ? -1 : 1;
    return nombreDe(a.client_id).localeCompare(nombreDe(b.client_id));
  });

  const dejarlo = async () => {
    const ok = await confirm({
      title: '¿Dejar de pedirlo?',
      message: `Se lo quitas de los pendientes a ${pendientes.length === 1 ? 'la persona' : `las ${pendientes.length} personas`} que no lo ha${pendientes.length === 1 ? '' : 'n'} contestado. Lo que ya te han mandado se queda.`,
      confirmLabel: 'Dejar de pedirlo',
      tone: 'danger',
    });
    if (!ok) return;
    await dejarDePedir(envio.id);
    onVolver();
  };

  return (
    <div className="stack cascada">
      <div className="taller">
        <header className="cartera-cab cinta-pagina">
          <div className="cartera-cab-in">
            <div className="cartera-cab-linea">
              <button
                type="button"
                className="cab-volver"
                onClick={onVolver}
                aria-label="Volver a Protocolos"
              >
                <ArrowLeft size={20} />
              </button>
              <h1 className="cartera-cab-titulo">{envio.title}</h1>
              <span className="t-xs t-tertiary">
                mandado el {fecha(envio.sentAt)} a {envio.mandados} ·{' '}
                {audienciaLegible(envio.audiencia, { protocolos })}
              </span>
              <div className="cartera-cab-acciones">
                <span className={`badge ${avance.cerrado ? 'badge-ok' : 'badge-info'}`}>
                  {avance.dice}
                </span>
                {pendientes.length > 0 && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={dejarlo}>
                    <Trash2 size={15} /> Dejar de pedirlo
                  </button>
                )}
              </div>
            </div>
          </div>
        </header>

        <div className="cartera-cuerpo">
          <div className="plantilla tabla-ancha">
            <table>
              <thead>
                <tr>
                  <th scope="col">Cliente</th>
                  <th scope="col">Entregó</th>
                  {columnas.map((c) => (
                    <th scope="col" key={c.id}>
                      {c.rot}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => {
                  const hecho = hecha(f);
                  return (
                    <tr key={f.id} className={hecho ? '' : 'es-pendiente'}>
                      <td>{nombreDe(f.client_id)}</td>
                      <td className="t-sm t-secondary">
                        {hecho ? (
                          fecha(f.submitted_at)
                        ) : (
                          <>
                            <Bell size={13} className="icon-inline" aria-hidden="true" />
                            Pendiente
                          </>
                        )}
                      </td>
                      {columnas.map((c) => {
                        const elem = envio.elementos.find((e) => e.id === c.id);
                        return (
                          <td key={c.id} className="t-sm">
                            {hecho ? respuestaLegible(elem, (f.answers || {})[c.id]) : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="t-xs t-tertiary taller-pie">
            Una columna por pregunta. Lo que contestan cae aquí, y las medidas —peso, perímetros,
            pliegues— entran además en la evolución de cada uno.
          </p>
        </div>
      </div>
    </div>
  );
};
