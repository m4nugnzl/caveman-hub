import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react';

import { Hoja } from '@/components/ui/Hoja';
import { mesDe, otroMes, semanasDelMes } from '@/domain/fechaDeLaSesion';
import { MAX_DIAS_DE_ATRASO, diaCorto, marcaDelDia } from '@/domain/planDeSesiones';
import { addDays, weekdayName } from '@/lib/dates';
import { Boton } from './Piezas';

/**
 * EL CALENDARIO DE TUS SESIONES: la semana que se despliega en el mes.
 *
 * ══ Cómo se mueve ══════════════════════════════════════════════════════════
 *
 * En reposo es la fila de siete días de siempre. Tirando hacia abajo —o
 * tocando el nombre del mes— se despliega el mes entero, y la semana elegida
 * se queda en su sitio mientras las demás aparecen alrededor, como el
 * calendario del teléfono. El gesto sigue al dedo y se pliega igual.
 *
 * A los lados se pasa de semana (plegado) o de mes (desplegado).
 *
 * ══ Qué dice cada día ══════════════════════════════════════════════════════
 *
 * Un punto por sesión: verde si está hecha, azul si toca y todavía no ha
 * llegado su día, y un aro gris si su día pasó sin hacerla. Ese gris es
 * neutro a propósito: no es un fallo, es lo que queda.
 *
 * Tocar un día con sesiones abre su hoja: qué hay, «Abrir», y desde hoy en
 * adelante «Atrasar», que es lo único que el cliente cambia del plan.
 */

const FILA = 52;
const INICIALES = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const ESTADO = { hecha: 'Hecha', planificada: 'Planificada', pendiente: 'Pendiente', sin_planificar: 'Por hacer' };
const UMBRAL_EJE = 8;
const UMBRAL_PASO = 56;

const nombreDelMes = (mes, hoy) => {
  const d = new Date(`${mes}T00:00:00Z`);
  const nombre = d.toLocaleDateString('es-ES', {
    month: 'long',
    ...(mes.slice(0, 4) !== hoy.slice(0, 4) ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  });
  return nombre.charAt(0).toUpperCase() + nombre.slice(1);
};

const vibrar = () => {
  try {
    navigator.vibrate?.(8);
  } catch {
    /* Sin vibración no pasa nada: es un acompañamiento, no la respuesta. */
  }
};

export const CalendarioDeSesiones = ({ calendario }) => {
  const { hoy, dias, resumen, inicios } = calendario;
  const [seleccionado, setSeleccionado] = useState(hoy);
  const [mes, setMes] = useState(() => mesDe(hoy));
  const [abierto, setAbierto] = useState(false);
  /* Mientras se arrastra, cuánto está desplegado (0…1). */
  const [arrastre, setArrastre] = useState(null);
  const [diaDeLaHoja, setDiaDeLaHoja] = useState(null);

  const semanas = useMemo(() => semanasDelMes(mes), [mes]);
  const fila = Math.max(0, semanas.findIndex((s) => s.includes(seleccionado)));
  const p = arrastre ?? (abierto ? 1 : 0);
  const desplegado = p > 0;

  const elegir = (fecha) => {
    setSeleccionado(fecha);
    if (!abierto) setMes(mesDe(fecha));
  };

  const cambiarMes = (n) => {
    const nuevo = otroMes(mes, n);
    setMes(nuevo);
    setSeleccionado(mesDe(hoy) === nuevo ? hoy : nuevo);
  };

  const plegar = (valor) => {
    if (!valor && !semanasDelMes(mes).some((s) => s.includes(seleccionado))) setSeleccionado(mes);
    setAbierto(valor);
  };

  const irAHoy = () => {
    setSeleccionado(hoy);
    setMes(mesDe(hoy));
  };

  /* Un día del mes de al lado lleva a su mes, como en el calendario del
     teléfono. Plegado no se nota: la semana es la misma. Un día pasado vacío
     no abre nada; uno de hoy en adelante, siempre: dice qué hay (o que nada). */
  const tocarDia = (fecha) => {
    setSeleccionado(fecha);
    if (mesDe(fecha) !== mes) setMes(mesDe(fecha));
    if ((dias.get(fecha) || []).length > 0 || fecha >= hoy) setDiaDeLaHoja(fecha);
  };

  /* ── El gesto: vertical despliega, horizontal pasa página ─────────────── */
  const gesto = useRef(null);
  const suprimirClic = useRef(false);

  const alBajar = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    gesto.current = { x: e.clientX, y: e.clientY, eje: null, p0: abierto ? 1 : 0, id: e.pointerId };
  };

  const alMover = (e) => {
    const g = gesto.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.eje) {
      if (Math.abs(dx) < UMBRAL_EJE && Math.abs(dy) < UMBRAL_EJE) return;
      g.eje = Math.abs(dy) > Math.abs(dx) ? 'y' : 'x';
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    if (g.eje === 'y') {
      const recorrido = Math.max(FILA, (semanas.length - 1) * FILA);
      setArrastre(Math.min(1, Math.max(0, g.p0 + dy / recorrido)));
    }
  };

  const alSoltar = (e) => {
    const g = gesto.current;
    gesto.current = null;
    if (!g || !g.eje) return;
    suprimirClic.current = true;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (g.eje === 'y') {
      const abrir = g.p0 === 0 ? dy > 40 : dy > -40;
      setArrastre(null);
      if (abrir !== abierto) {
        plegar(abrir);
        vibrar();
      }
      return;
    }
    if (Math.abs(dx) < UMBRAL_PASO) return;
    const paso = dx < 0 ? 1 : -1;
    if (abierto) {
      cambiarMes(paso);
    } else {
      elegir(addDays(seleccionado, paso * 7));
    }
  };

  const alCancelar = () => {
    gesto.current = null;
    setArrastre(null);
  };

  const enHoy = seleccionado === hoy && mes === mesDe(hoy);

  return (
    <section className={`tel-cal${desplegado ? ' is-desplegado' : ''}${arrastre !== null ? ' is-arrastrando' : ''}`}>
      <div className="tel-cal-cab">
        <button type="button" className="tel-cal-mes" onClick={() => plegar(!abierto)} aria-expanded={abierto}>
          {nombreDelMes(mes, hoy)}
        </button>
        <span className="tel-cal-mandos">
          {!enHoy ? (
            <button type="button" className="tel-cal-hoy" onClick={irAHoy}>
              Hoy
            </button>
          ) : null}
          {abierto ? (
            <>
              <button type="button" className="tel-cal-paso" onClick={() => cambiarMes(-1)} aria-label="Mes anterior">
                <ChevronLeft size={20} aria-hidden="true" />
              </button>
              <button type="button" className="tel-cal-paso" onClick={() => cambiarMes(1)} aria-label="Mes siguiente">
                <ChevronRight size={20} aria-hidden="true" />
              </button>
            </>
          ) : null}
        </span>
      </div>
      {resumen ? <p className="tel-cal-resumen">{resumen.texto}</p> : null}

      <div
        className="tel-cal-cuerpo"
        onPointerDown={alBajar}
        onPointerMove={alMover}
        onPointerUp={alSoltar}
        onPointerCancel={alCancelar}
        onClickCapture={(e) => {
          if (!suprimirClic.current) return;
          suprimirClic.current = false;
          e.stopPropagation();
          e.preventDefault();
        }}
      >
        <div className="tel-cal-iniciales" aria-hidden="true">
          {INICIALES.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>

        <div
          className="tel-cal-rejilla"
          style={{ height: FILA + p * (semanas.length - 1) * FILA }}
          role="grid"
          aria-label={nombreDelMes(mes, hoy)}
        >
          <div className="tel-cal-semanas" style={{ transform: `translateY(${-(1 - p) * fila * FILA}px)` }}>
            {semanas.map((semana, i) => {
              const inicio = semana.find((d) => inicios.has(d));
              return (
                <div
                  key={semana[0]}
                  className="tel-cal-semana"
                  role="row"
                  style={{ opacity: i === fila ? 1 : p }}
                  aria-hidden={i !== fila && !abierto ? true : undefined}
                >
                  {inicio ? (
                    <span className="tel-cal-micro" aria-hidden="true">
                      M{inicios.get(inicio)}
                    </span>
                  ) : null}
                  {semana.map((fecha) => (
                    <Dia
                      key={fecha}
                      fecha={fecha}
                      hoy={hoy}
                      sesiones={dias.get(fecha) || []}
                      elegido={fecha === seleccionado}
                      fuera={desplegado && mesDe(fecha) !== mes}
                      empiezaMicro={inicios.has(fecha) && fecha !== semana[0]}
                      tabIndex={i === fila || abierto ? 0 : -1}
                      onClick={() => tocarDia(fecha)}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          className="tel-cal-asa"
          onClick={() => plegar(!abierto)}
          aria-label={abierto ? 'Plegar el mes' : 'Ver el mes'}
        >
          <span aria-hidden="true" />
        </button>
      </div>

      <HojaDelDia
        fecha={diaDeLaHoja}
        calendario={calendario}
        onCerrar={() => setDiaDeLaHoja(null)}
      />
    </section>
  );
};

const Dia = ({ fecha, hoy, sesiones, elegido, fuera, empiezaMicro, tabIndex, onClick }) => {
  const marca = marcaDelDia(sesiones);
  const clases = [
    'tel-cal-dia',
    fecha === hoy ? 'is-hoy' : '',
    elegido ? 'is-elegido' : '',
    fecha < hoy ? 'is-pasado' : '',
    fuera ? 'is-fuera' : '',
    empiezaMicro ? 'is-inicio' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const dicho = sesiones.length
    ? sesiones.map((s) => `${s.hoja}, ${ESTADO[s.estado]?.toLowerCase() || ''}`).join('; ')
    : 'sin sesiones';
  return (
    <button
      type="button"
      role="gridcell"
      className={clases}
      onClick={onClick}
      tabIndex={tabIndex}
      aria-selected={elegido}
      aria-current={fecha === hoy ? 'date' : undefined}
      aria-label={`${weekdayName(fecha, { conFecha: true })}${fecha === hoy ? ', hoy' : ''}: ${dicho}`}
      data-marca={marca || undefined}
    >
      <span className="tel-cal-n">{Number(fecha.slice(8, 10))}</span>
      <span className="tel-cal-puntos" aria-hidden="true">
        {sesiones.slice(0, 3).map((s) => (
          <i key={s.clave} className={`tel-cal-punto is-${s.estado}`} />
        ))}
      </span>
    </button>
  );
};

/* ── La hoja del día ───────────────────────────────────────────────────────── */

const titularDe = (fecha) => {
  const t = weekdayName(fecha, { conFecha: true }).replace(',', '');
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const HojaDelDia = ({ fecha, calendario, onCerrar }) => {
  const [paso, setPaso] = useState('dia');
  const [n, setN] = useState(1);
  const [enviando, setEnviando] = useState(false);

  /* Cada día abre en su lista, con un día de atraso por defecto. */
  useEffect(() => {
    if (!fecha) return;
    setPaso('dia');
    setN(1);
    setEnviando(false);
  }, [fecha]);

  const sesiones = fecha ? calendario.dias.get(fecha) || [] : [];
  const atrasable = fecha ? calendario.puedeAtrasar(fecha) : false;
  /* Lo que no tiene día se puede hacer cualquiera de hoy en adelante. */
  const sinDia = fecha && fecha >= calendario.hoy ? calendario.sinDia || [] : [];

  const confirmar = async () => {
    setEnviando(true);
    const res = await calendario.onAtrasar(fecha, n);
    setEnviando(false);
    if (res?.ok) onCerrar();
  };

  return (
    <Hoja abierta={Boolean(fecha)} onCerrar={onCerrar} etiqueta={fecha ? titularDe(fecha) : 'Día'}>
      {fecha ? (
        <div className="tel-cal-hoja">
          {paso === 'dia' ? (
            <>
              <h2 className="tel-cal-hoja-tit">{titularDe(fecha)}</h2>
              {sesiones.length > 0 ? (
                <ListaDelDia sesiones={sesiones} fecha={fecha} onAbrir={calendario.onAbrir} />
              ) : (
                <p className="tel-cal-vacio">{calendario.conDias ? 'Descanso' : 'Sin sesión este día'}</p>
              )}
              {sinDia.length > 0 ? (
                <>
                  <h3 className="tel-cal-hoja-sub">Sin día fijo</h3>
                  <ListaDelDia sesiones={sinDia} fecha={fecha} onAbrir={calendario.onAbrir} />
                </>
              ) : null}
              {atrasable ? (
                <Boton className="tel-cal-tintado" onClick={() => setPaso('atrasar')}>
                  Atrasar
                </Boton>
              ) : null}
            </>
          ) : (
            <Atrasar
              fecha={fecha}
              n={n}
              setN={setN}
              calendario={calendario}
              enviando={enviando}
              onConfirmar={confirmar}
              onVolver={() => setPaso('dia')}
            />
          )}
        </div>
      ) : null}
    </Hoja>
  );
};

const ListaDelDia = ({ sesiones, fecha, onAbrir }) => (
  <ul className="tel-cal-sesiones">
    {sesiones.map((s) => (
      <li key={s.clave}>
        <span className="tel-cal-sesion-tx">
          <span className="tel-cal-sesion-nombre">{s.hoja}</span>
          <span className={`tel-cal-estado is-${s.estado}`}>
            {/* Qué aparición es («Jueves», «2.ª vez») solo si no lo dice ya el
                titular: una del jueves atrasada al sábado sí lo necesita. */}
            {[ESTADO[s.estado], s.cuando && s.cuando.toLowerCase() !== weekdayName(fecha) ? s.cuando : null]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
        <button type="button" className="tel-cal-abrir" onClick={() => onAbrir(s)}>
          Abrir
        </button>
      </li>
    ))}
  </ul>
);

/** Un paso más o menos, y manteniendo pulsado sigue sumando, como el de iOS. */
const usePulsado = (accion) => {
  const temporizador = useRef(null);
  const parar = () => {
    clearTimeout(temporizador.current);
    clearInterval(temporizador.current);
    temporizador.current = null;
  };
  useEffect(() => parar, []);
  return {
    onPointerDown: () => {
      accion();
      parar();
      temporizador.current = setTimeout(() => {
        temporizador.current = setInterval(accion, 90);
      }, 420);
    },
    onPointerUp: parar,
    onPointerLeave: parar,
    onPointerCancel: parar,
    onKeyDown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        accion();
      }
    },
  };
};

const Atrasar = ({ fecha, n, setN, calendario, enviando, onConfirmar, onVolver }) => {
  const menos = usePulsado(() => setN((v) => Math.max(1, v - 1)));
  const mas = usePulsado(() => setN((v) => Math.min(MAX_DIAS_DE_ATRASO, v + 1)));
  const vista = calendario.vistaPrevia(fecha, n);
  const movidas = vista.ok ? vista.movidas : [];
  const ultima = movidas.at(-1);

  const consecuencia =
    movidas.length === 0
      ? vista.motivo
      : movidas.length === 1
        ? `${movidas[0].hoja} pasa al ${diaCorto(movidas[0].despues)}.`
        : `Se corren ${movidas.length} sesiones. La última, al ${diaCorto(ultima.despues)}.`;

  return (
    <>
      <h2 className="tel-cal-hoja-tit">Atrasar desde el {diaCorto(fecha)}</h2>
      <div className="tel-cal-pasos">
        <button type="button" className="tel-cal-paso-n" aria-label="Un día menos" disabled={n <= 1} {...menos}>
          <Minus size={20} aria-hidden="true" />
        </button>
        <span className="tel-cal-cuantos" aria-live="polite">
          <b>{n}</b> {n === 1 ? 'día' : 'días'}
        </span>
        <button
          type="button"
          className="tel-cal-paso-n"
          aria-label="Un día más"
          disabled={n >= MAX_DIAS_DE_ATRASO}
          {...mas}
        >
          <Plus size={20} aria-hidden="true" />
        </button>
      </div>
      <p className="tel-cal-consecuencia">{consecuencia}</p>
      <p className="tel-cal-nota">
        {calendario.ajustaDieta ? 'Tu entrenador lo verá y tu dieta se ajusta.' : 'Tu entrenador lo verá.'}
      </p>
      <Boton onClick={onConfirmar} disabled={enviando || movidas.length === 0}>
        Atrasar
      </Boton>
      <button type="button" className="tel-enlace" onClick={onVolver}>
        Cancelar
      </button>
    </>
  );
};
