import { useMemo } from 'react';
import { CalendarClock, CalendarPlus, FileText, PlayCircle, Upload, X } from 'lucide-react';

import { useActions, useApp } from '@/context/AppContext';
import { hecha, origenDice, vigente } from '@/domain/envios';
import { dayMonthMaybeYear, todayISO, weekdayName } from '@/lib/dates';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useToast } from '@/components/ui/ToastProvider';
import { EmptyState } from '@/components/ui/primitives';

/**
 * LO QUE SALE: una sola lista, dos mitades — va a salir y ya salió.
 *
 * ══ Esto sustituye al «Review first» de Coachway ═══════════════════════════
 *
 * Ellos tienen un paso que te pide el visto bueno antes de que salga nada. **No
 * hace falta.** Con el motor 1 la fila se escribe con fecha futura, así que lo
 * que va a salir se puede ver y cancelar durante días. Una cola visible es más
 * natural que una bandeja de aprobaciones: **no te pide trabajo, te enseña el
 * tuyo.**
 *
 * ══ Y por qué se juntan lo tuyo y lo automático ════════════════════════════
 *
 * Porque para el que mira es la misma pregunta: *¿qué está saliendo en mi
 * nombre?* Partirlo en dos listas obligaría a sumarlas mentalmente para
 * contestarla. Lo que sí dice cada fila es de dónde viene —«Se lo mandaste tú» o
 * «Se lo mandó Cada lunes»—, que es la información que de verdad se busca aquí:
 * lo que uno no recuerda haber mandado.
 *
 * ══ Lo que NO se puede cancelar ════════════════════════════════════════════
 *
 * Lo que ya contestó alguien. Quitar de en medio una petición que ya no viene a
 * cuento es una cosa; borrar la respuesta de quien se molestó en darla es otra,
 * y esta pantalla no hace la segunda ni por descuido. Es la misma regla que
 * `dejarDePedir` y `quitarPedido` ya hacen cumplir en la base.
 */

const TONO = { form: 4, pide: 4, documento: 2, video: 2 };

const ICONO = {
  form: <FileText size={13} />,
  pide: <Upload size={13} />,
  documento: <FileText size={13} />,
  video: <PlayCircle size={13} />,
};

/*
  El día, dicho como se dice en una agenda: «mar 15». Con el día de la semana
  delante, porque lo que se está mirando es una semana de trabajo y «el 15» no
  dice si cae en fin de semana. Lo de hoy y lo de mañana se dicen con su palabra:
  nadie cuenta los días hasta mañana.
*/
const cuando = (iso, hoy) => {
  if (!iso) return 'Hoy';
  if (iso === hoy) return 'Hoy';
  const dia = weekdayName(iso).slice(0, 3);
  return `${dia} ${dayMonthMaybeYear(iso)}`;
};

/**
 * PRÓXIMAS SALIDAS: la cola de «Lo que sale», en columna.
 *
 * El dibujo del protocolo (Figma 98:86) la pone al lado de todo lo demás, y
 * tiene sentido: lo que va a salir es lo único de un protocolo que caduca, y en
 * un tramo aparte no se ve mientras se decide qué pedir. Aquí se lee; quitar de
 * la cola se sigue haciendo en su tramo, que es donde se ve a quién le toca.
 *
 * Con `clientId` es la de UNA persona: la columna de su pestaña «Protocolo».
 */
export const ProximasSalidas = ({ clientId = null, max = 8 }) => {
  const { envioRows, clients } = useApp();
  const hoy = todayISO();

  const filas = useMemo(
    () =>
      (envioRows || [])
        .filter((f) => f.tipo && !vigente(f, hoy) && !hecha(f))
        .filter((f) => !clientId || f.client_id === clientId)
        .sort((a, b) => String(a.due).localeCompare(String(b.due))),
    [envioRows, hoy, clientId]
  );

  const nombreDe = (id) => (clients || []).find((c) => c.id === id)?.name || 'Alguien';

  return (
    <aside className="salidas" aria-labelledby="salidas-tit">
      <h2 className="salidas-tit" id="salidas-tit">
        Próximas salidas
      </h2>
      {filas.length === 0 ? (
        <div className="salidas-vacio">
          <CalendarPlus size={20} aria-hidden="true" />
          <p>
            Nada programado. Lo que {clientId ? 'le mandes' : 'mandes'} con fecha aparecerá aquí
            antes de llegar.
          </p>
        </div>
      ) : (
        <ol className="salidas-lista">
          {filas.slice(0, max).map((f) => (
            <li className="salidas-fila" key={f.id}>
              <span className="f-disco" data-tono={TONO[f.tipo] ?? 4} aria-hidden="true">
                {ICONO[f.tipo] || <FileText size={13} />}
              </span>
              <span className="salidas-que">
                <span className="salidas-nombre">{f.title}</span>
                <span className="salidas-dice">
                  {clientId ? origenDice(f) : nombreDe(f.client_id)}
                </span>
              </span>
              <span className="salidas-dia">{cuando(f.due, hoy)}</span>
            </li>
          ))}
        </ol>
      )}
      {filas.length > max && (
        <p className="salidas-mas">
          Y {filas.length - max} más{clientId ? '.' : ' en «Lo que sale».'}
        </p>
      )}
    </aside>
  );
};

export const LoQueSale = () => {
  const { envioRows, clients } = useApp();
  const { quitarPedido } = useActions();
  const confirm = useConfirm();
  const toast = useToast();
  const hoy = todayISO();

  const nombreDe = useMemo(() => {
    const mapa = new Map((clients || []).map((c) => [c.id, c.name]));
    return (id) => mapa.get(id) || 'Alguien';
  }, [clients]);

  /*
    El corte es `vigente`, la misma función que decide qué ve el cliente en su
    portal. No una comparación de fechas escrita aquí: dos formas de contestar
    «¿esto ya está fuera?» acabarían discrepando, y el día que discrepen esta
    pantalla diría que algo no ha salido cuando el cliente ya lo tiene delante.
  */
  const { sale, salio } = useMemo(() => {
    const filas = [...(envioRows || [])].filter((f) => f.tipo);
    const futuras = filas
      .filter((f) => !vigente(f, hoy) && !hecha(f))
      .sort((a, b) => String(a.due).localeCompare(String(b.due)));
    const pasadas = filas
      .filter((f) => vigente(f, hoy) || hecha(f))
      .sort((a, b) => String(b.due || b.sent_at).localeCompare(String(a.due || a.sent_at)))
      .slice(0, 40);
    return { sale: futuras, salio: pasadas };
  }, [envioRows, hoy]);

  const cancelar = async (fila) => {
    const ok = await confirm({
      title: '¿Quitarlo de la cola?',
      message: `${nombreDe(fila.client_id)} no recibirá «${fila.title}». Si lo manda una automatización, no se lo vuelve a mandar: lo que ya corrió no vuelve a correr.`,
      confirmLabel: 'Quitarlo',
      tone: 'danger',
    });
    if (!ok) return;
    const res = await quitarPedido(fila.id);
    toast({
      text: res.ok ? 'Quitado de la cola.' : res.error,
      tone: res.ok ? undefined : 'danger',
    });
  };

  const Fila = ({ fila, futura }) => (
    <tr>
      <td className="cola-dia">{cuando(fila.due, hoy)}</td>
      <td>{nombreDe(fila.client_id)}</td>
      <td>
        <span className="p-name f-nombre">
          <span className="f-disco" data-tono={TONO[fila.tipo] ?? 4} aria-hidden="true">
            {ICONO[fila.tipo] || <FileText size={13} />}
          </span>
          <span className="q-titulo">{fila.title}</span>
        </span>
      </td>
      <td className="t-xs t-tertiary">{origenDice(fila)}</td>
      <td>
        {futura ? (
          <button
            type="button"
            className="btn btn-icon btn-icon-danger"
            aria-label={`Quitar ${fila.title} de la cola`}
            onClick={() => cancelar(fila)}
          >
            <X size={15} />
          </button>
        ) : (
          <span className="t-xs t-tertiary">{hecha(fila) ? 'Hecho' : 'Pendiente'}</span>
        )}
      </td>
    </tr>
  );

  const Tabla = ({ filas, futura, rot }) => (
    <>
      <p className="rotulo-tramo">{rot}</p>
      <div className="plantilla">
        <table>
          <thead>
            <tr>
              <th scope="col">Cuándo</th>
              <th scope="col">A quién</th>
              <th scope="col">Qué</th>
              <th scope="col">Quién lo manda</th>
              {/* El rótulo de la columna dice el MISMO verbo que el botón que
                lleva dentro —«Quitar de la cola»—. Decía «Cancelar», que es una
                cuarta palabra para este gesto y solo la oía quien navega a
                ciegas. Ver `docs/producto.md` §5.8. */}
            <th scope="col" aria-label={futura ? 'Quitar de la cola' : 'Cómo va'} />
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <Fila key={f.id} fila={f} futura={futura} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );

  if (sale.length === 0 && salio.length === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="Todavía no sale nada"
        message="Aquí se ve lo que les va a llegar a tus clientes antes de que les llegue —lo que mandes tú y lo que manden tus automatizaciones—, con días de margen para quitarlo."
      />
    );
  }

  return (
    <div className="stack">
      {sale.length > 0 ? (
        <Tabla filas={sale} futura rot="Va a salir" />
      ) : (
        <>
          <p className="rotulo-tramo">Va a salir</p>
          <p className="t-sm t-tertiary">
            Nada por delante. Lo que pauten tus automatizaciones aparecerá aquí en cuanto se les
            ponga fecha.
          </p>
        </>
      )}

      {salio.length > 0 && <Tabla filas={salio} futura={false} rot="Ya salió" />}
    </div>
  );
};
