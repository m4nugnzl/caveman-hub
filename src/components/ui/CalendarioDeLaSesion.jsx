import { useRef, useState } from 'react';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Plus } from 'lucide-react';

import { LOCALE, shortDate, todayISO, weekdayName } from '@/lib/dates';
import { useCapaFlotante } from '@/lib/useCapaFlotante';
import { useClickOutside } from '@/lib/useClickOutside';
import { useDismissable } from '@/lib/useDismissable';
import { diaElegible, mesDe, otroMes, semanasDelMes } from '@/domain/fechaDeLaSesion';

/**
 * EL PANEL DE LA SESIÓN — el mismo para el entrenador y el cliente (23 sep).
 *
 * Primero fue un menú plano («22 sept · abierta», «Cambiar el día», «Otra
 * sesión de este día», «Quitar esta sesión») y «Cambiar el día» abría un
 * SEGUNDO popover con el calendario. El dueño: «se ve pobre». Ahora es una
 * sola capa, como una hoja de iOS:
 *
 *   · arriba, la sesión: el día en grande y cómo va, con el chip de estado de
 *     las tarjetas del bloque;
 *   · debajo, el calendario, dentro del panel: tocar un día cambia la fecha;
 *   · si la hoja tiene varias sesiones en el microciclo, la lista para saltar;
 *   · al pie, «Añadir otra sesión» en voz baja y «Quitar sesión» aparte, en
 *     rojo y con confirmación.
 *
 * Lo que no le toca a quien mira no se pasa y no se pinta: el cliente no
 * añade ni quita sesiones. Las reglas de qué días valen no viven aquí:
 * `limites` y `ocupados` salen de `domain/fechaDeLaSesion`.
 */

const INICIALES = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
/* La fila del calendario: el día de 36 más el hueco de 2. Con ella se mide la
   ventana que se abre de una semana a un mes. */
const FILA = 38;

const utc = (iso) => new Date(`${iso}T00:00:00Z`);
/* «septiembre 2026» y no «septiembre de 2026»: la cabecera lo pone en
   versalita de inicial y saldría «Septiembre De 2026». */
const nombreDeMes = (iso) =>
  `${utc(iso).toLocaleDateString(LOCALE, { month: 'long', timeZone: 'UTC' })} ${iso.slice(0, 4)}`;
const diaLargo = (iso) =>
  utc(iso).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const diaYMes = (iso) => utc(iso).toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', timeZone: 'UTC' });

/** «septiembre 2026», o «sept – oct 2026» cuando la semana cae entre dos. */
const rotuloDeSemana = (semana) => {
  const [a, b] = [semana[0], semana[6]];
  if (a.slice(0, 7) === b.slice(0, 7)) return nombreDeMes(a);
  const corto = (iso) => utc(iso).toLocaleDateString(LOCALE, { month: 'short', timeZone: 'UTC' }).replace('.', '');
  return `${corto(a)} – ${corto(b)} ${b.slice(0, 4)}`;
};

/**
 * EL CALENDARIO, EN LÍNEA.
 *
 * Por defecto enseña la semana de la sesión, que es donde casi siempre está
 * el día bueno. El rótulo del mes lo abre al mes entero, y ahí las flechas
 * pasan de mes: una sesión puede caer semanas después de su microciclo (el
 * cliente que vuelve de vacaciones).
 *
 * Semana y mes son la MISMA rejilla: la del mes, vista por una ventana de una
 * fila o de todas. Al abrir, la ventana crece y la rejilla baja hasta su sitio,
 * así que el panel no salta de tamaño: se estira.
 */
export const Calendario = ({ fecha, limites, ocupados = new Set(), onElegir }) => {
  const ancla = fecha || limites?.hasta || todayISO();
  const [abierto, setAbierto] = useState(false);
  const [mes, setMes] = useState(() => mesDe(ancla));
  const hoy = todayISO();

  const mesVisto = abierto ? mes : mesDe(ancla);
  const semanas = semanasDelMes(mesVisto);
  const filaDeLaSesion = Math.max(0, semanas.findIndex((s) => s.includes(ancla)));
  const alto = abierto ? semanas.length * FILA - 2 : FILA - 2;
  const baja = abierto ? 0 : -filaDeLaSesion * FILA;

  const puedeAtras = !limites?.desde || mesVisto > mesDe(limites.desde);
  const puedeDelante = mesVisto < mesDe(limites?.hasta || hoy);

  const alternar = () => {
    setMes(mesDe(ancla));
    setAbierto((v) => !v);
  };

  return (
    <div className={`cal-sesion${abierto ? ' is-mes' : ''}`}>
      <div className="cal-sesion-cab">
        <button
          type="button"
          className="cal-sesion-mes"
          aria-expanded={abierto}
          aria-label={abierto ? 'Ver solo la semana' : 'Ver el mes entero'}
          onClick={alternar}
        >
          {abierto ? nombreDeMes(mesVisto) : rotuloDeSemana(semanas[filaDeLaSesion])}
          <ChevronDown size={13} aria-hidden="true" />
        </button>
        <span className="cal-sesion-pasar" aria-hidden={!abierto || undefined}>
          <button
            type="button"
            className="cal-sesion-flecha"
            aria-label="Mes anterior"
            disabled={!abierto || !puedeAtras}
            tabIndex={abierto ? undefined : -1}
            onClick={() => setMes((m) => otroMes(m, -1))}
          >
            <ChevronLeft size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="cal-sesion-flecha"
            aria-label="Mes siguiente"
            disabled={!abierto || !puedeDelante}
            tabIndex={abierto ? undefined : -1}
            onClick={() => setMes((m) => otroMes(m, 1))}
          >
            <ChevronRight size={15} aria-hidden="true" />
          </button>
        </span>
      </div>
      <div className="cal-sesion-sems" aria-hidden="true">
        {INICIALES.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
      <div className="cal-sesion-ventana" style={{ height: alto }}>
        <div className="cal-sesion-rejilla" role="grid" style={{ transform: `translateY(${baja}px)` }}>
          {semanas.map((semana, fila) => {
            const oculta = !abierto && fila !== filaDeLaSesion;
            return (
              <div key={semana[0]} className="cal-sesion-fila" role="row" aria-hidden={oculta || undefined}>
                {semana.map((d) => {
                  const otroDelMes = abierto && d.slice(0, 7) !== mesVisto.slice(0, 7);
                  const vale = diaElegible(d, limites) && !otroDelMes;
                  const elegido = d === fecha;
                  const ocupado = ocupados.has(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      role="gridcell"
                      className={`cal-sesion-dia${elegido ? ' is-elegido' : ''}${d === hoy ? ' is-hoy' : ''}${
                        ocupado ? ' is-ocupado' : ''
                      }${otroDelMes ? ' is-otro-mes' : ''}`}
                      disabled={!vale}
                      tabIndex={oculta || otroDelMes ? -1 : undefined}
                      aria-pressed={elegido}
                      aria-label={`${diaLargo(d)}${ocupado ? ', ya tiene otra sesión de esta hoja' : ''}`}
                      title={ocupado ? 'Ese día ya tiene otra sesión de esta hoja: quedarán las dos' : undefined}
                      onClick={() => {
                        if (!elegido) onElegir(d);
                      }}
                    >
                      {Number(d.slice(8, 10))}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/** El chip de cómo va una sesión: el mismo dibujo que el de las tarjetas. */
const Estado = ({ estado }) =>
  estado ? <span className={`plan-col-estado is-${estado.tono}`}>{estado.texto}</span> : null;

/**
 * @param etiqueta     Lo que dice el botón que lo abre.
 * @param claseBoton   Su vestido: `.tira-sesion` en la hoja del entrenador,
 *                     `.fecha-sesion` en la cabecera del cliente.
 * @param sesion       `{ fecha, estado, fechaPor }` de la que se mira, o `null`.
 * @param motivo       Por qué no se le puede cambiar el día; sin él, se puede.
 * @param sesiones     Todas las de la hoja en el microciclo, `{ id, fecha, estado }`.
 *                     La lista solo sale con dos o más.
 * @param onAnadir / onQuitar  Solo si quien mira puede hacerlo.
 */
export const PanelDeLaSesion = ({
  etiqueta,
  claseBoton,
  conFlecha = true,
  ariaLabel,
  titulo,
  alineado = 'derecha',
  sesion,
  motivo = null,
  limites,
  ocupados,
  onElegir,
  sesiones = [],
  activa = null,
  onSesion,
  onAnadir,
  onQuitar,
}) => {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);
  const capa = useDismissable(abierto);
  const flotante = useCapaFlotante(capa.mounted, ref, capa.ref, { alineado });
  const cerrar = () => setAbierto(false);
  useClickOutside(ref, cerrar, abierto);

  const fecha = sesion?.fecha || null;

  return (
    <div ref={ref} className="cal-sesion-ancla">
      <button
        type="button"
        className={claseBoton}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-label={ariaLabel}
        title={titulo}
        onClick={() => setAbierto((v) => !v)}
      >
        {etiqueta}
        {conFlecha && <ChevronDown size={13} aria-hidden="true" />}
      </button>
      {capa.mounted && (
        <div
          ref={capa.ref}
          className="popover panel-sesion"
          style={flotante.estilo}
          {...flotante.atributos}
          data-state={capa.closing ? 'closing' : 'open'}
          role="dialog"
          aria-label="La sesión"
        >
          <header className="panel-sesion-cab">
            <div className="panel-sesion-linea">
              <span className="panel-sesion-sem">{fecha ? weekdayName(fecha) : 'Sin sesión'}</span>
              <Estado estado={sesion?.estado} />
            </div>
            {fecha && <p className="panel-sesion-dia">{diaYMes(fecha)}</p>}
            {sesion?.fechaPor === 'cliente' && <p className="panel-sesion-nota">Día puesto por tu cliente</p>}
          </header>

          {fecha && !motivo && onElegir && (
            <Calendario fecha={fecha} limites={limites} ocupados={ocupados} onElegir={onElegir} />
          )}
          {fecha && motivo && <p className="panel-sesion-nota is-motivo">{motivo}</p>}

          {sesiones.length > 1 && (
            <ul className="panel-sesion-lista" aria-label="Sesiones de esta hoja">
              {sesiones.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className={`panel-sesion-otra${s.id === activa ? ' is-activa' : ''}`}
                    aria-current={s.id === activa || undefined}
                    onClick={() => onSesion?.(s.id)}
                  >
                    <span className="panel-sesion-otra-dia">
                      {s.fecha ? `${weekdayName(s.fecha).slice(0, 3)} ${shortDate(s.fecha)}` : 'Sin fecha'}
                    </span>
                    <Estado estado={s.estado} />
                    <Check size={15} className="panel-sesion-check" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {(onAnadir || onQuitar) && (
            <footer className="panel-sesion-pie">
              {onAnadir && (
                <button
                  type="button"
                  className="panel-sesion-accion"
                  onClick={() => {
                    cerrar();
                    onAnadir();
                  }}
                >
                  <Plus size={13} aria-hidden="true" />
                  {sesiones.length > 0 ? 'Añadir otra sesión' : 'Añadir una sesión'}
                </button>
              )}
              {onQuitar && (
                <button
                  type="button"
                  className="panel-sesion-accion is-peligro"
                  onClick={() => {
                    cerrar();
                    onQuitar();
                  }}
                >
                  Quitar sesión
                </button>
              )}
            </footer>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * LA FECHA QUE SE TOCA: el día de la sesión en la cabecera del cliente.
 *
 * `dia` es lo que prepara la pantalla (`{ texto, fecha, estado, limites,
 * ocupados, motivo, onElegir }`). Con `motivo` —la semana ya revisada, o fuera
 * de plazo— es texto y el porqué va en su globo: una fecha que no se puede
 * cambiar no se disfraza de botón. Si se puede, abre el MISMO panel que el
 * entrenador, sin sus acciones.
 */
export const FechaTocable = ({ dia, alineado = 'izquierda' }) => {
  if (!dia) return null;
  if (dia.motivo || !dia.onElegir) {
    return <span title={dia.motivo || undefined}>{dia.texto}</span>;
  }
  return (
    <PanelDeLaSesion
      etiqueta={dia.texto}
      claseBoton="fecha-sesion"
      conFlecha={false}
      ariaLabel={`${dia.texto}. Cambiar el día de la sesión`}
      titulo="Cambiar el día"
      alineado={alineado}
      sesion={{ fecha: dia.fecha, estado: dia.estado }}
      limites={dia.limites}
      ocupados={dia.ocupados}
      onElegir={dia.onElegir}
    />
  );
};
