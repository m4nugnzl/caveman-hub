import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Flag, Trophy } from 'lucide-react';

import { MONTH_NAMES, WEEKDAYS } from '@/domain/calendar';
import { weekStart } from '@/lib/dates';
import { SegmentedControl } from '@/components/ui/primitives';
import {
  altoDeSemana,
  altoEnLista,
  altoEnMes,
  cajaDeSemana,
  celdaDeSemana,
  ESTADO_DE_REVISION,
  LISTA,
  mesDeLaSemana,
  posiciones,
} from './semanasDelCalendario';
import { diaTexto, nombreDeHecho } from './lectura';
import { tramoCorto } from './PiezasDelInspector';

/* Lo que se monta por encima y por debajo de lo que se ve: un mes largo. */
const COLCHON = 700;
/* Lo que hay que mantener el dedo quieto para empezar a seleccionar. */
const PULSACION_LARGA = 380;
const UMBRAL = 8;

const MESES = MONTH_NAMES.map((m) => m.charAt(0).toUpperCase() + m.slice(1));
const INICIALES = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MODOS_TELEFONO = [
  { id: 'mes', label: 'Mes' },
  { id: 'lista', label: 'Lista' },
];
const SESION = { hecha: 'hecha', falta: 'sin hacer', prevista: 'prevista' };

const carrilesDe = (s) => s.barras.reduce((n, b) => Math.max(n, b.carril + 1), 0);
const colorDeFranja = (s) => s.franja[0]?.color || 'transparent';

/** Lo que dice el día al pasar por encima y al lector de pantalla. */
const rotuloDelDia = (d) =>
  [
    diaTexto(d.fecha),
    d.pesaje && `pesaje ${d.pesaje} kg`,
    d.intervencion && `${d.intervencion.evento.title || d.intervencion.nombre || 'intervención'}${d.intervencion.kcals ? `, ${d.intervencion.kcals} kcal` : ''}`,
    d.tipo && `día ${d.tipo}`,
    ...d.sesiones.map((n) => `${n}, ${SESION[d.sesion]}`),
    ...d.carreras.map((c) => c.nombre),
  ]
    .filter(Boolean)
    .join('. ');

/** El punto de la sesión: relleno si se hizo; hueco si se pidió (y no se hizo, o aún no ha llegado). */
const PuntoDeSesion = ({ sesion }) => (sesion ? <i className={`tl-cal-punto is-${sesion}`} aria-hidden="true" /> : null);

/** La semana y su revisión: «S37 · sin check-in». */
const CabezaDeSemana = ({ s }) => (
  <span className={`tl-cal-col-cabeza is-${s.estado}`}>
    <b>{s.numero ? `S${s.numero}` : tramoCorto(s.lunes, s.domingo)}</b>
    {s.estado !== 'futura' && ` · ${ESTADO_DE_REVISION[s.estado]}`}
  </span>
);

const Extremo = ({ extremo }) => (extremo ? <span className={`tl-cal-extremo is-${extremo.tono}`}>{extremo.texto}</span> : null);

/**
 * EL CALENDARIO: la temporada día a día, en filas de lunes a domingo (25 sep
 * 2026).
 *
 * Complementa a la gráfica: la misma temporada y el mismo estado (el rango
 * elegido, lo que abre el inspector). Es un fondo tranquilo donde solo
 * destaca lo que pasó: un día vacío es su número, sin caja; las semanas, una
 * línea fina entre ellas, y cada una mide lo que lleva. Se lee sin leer números:
 *
 *   · Los días distintos, teñidos: el refeed y el diet break con su color y su
 *     cifra; los días altos de una semana con tipos, con un tinte suave.
 *   · Las sesiones, un punto en la esquina: relleno si se hizo, hueco si se
 *     pidió y no se hizo (o aún no ha llegado).
 *
 * Cada fila lleva la franja del color de su fase a la izquierda y, a la
 * derecha, su semana en tres líneas: la revisión, el peso medio y su cambio.
 * El detalle (kcal, entrenos, sensaciones), en la ficha de la semana.
 *
 * Desplazamiento vertical continuo con el mes fijo arriba. Solo se montan las
 * semanas cercanas a lo que se ve: cada fila sabe lo que mide sin montarse
 * (`semanasDelCalendario.js`).
 *
 * En el teléfono, dos modos: Mes (la cuadrícula compacta) y Lista (una
 * tarjeta por semana con sus días en filas), que
 * es el de partida.
 *
 * Gestos: pulsar un día abre su ficha; pulsar la semana, la suya; pulsar un
 * refeed o un hecho, lo suyo. Arrastrar sobre varios días (en el teléfono,
 * mantener pulsado y arrastrar) elige un rango de semanas.
 *
 * @param semanas `semanasDelCalendario`.
 * @param seleccion el rango `{ desde, hasta, fin }`, o `null`.
 * @param elegida lo abierto en el inspector, para marcarlo.
 * @param onPieza abre una pieza en el inspector.
 * @param onSeleccion recibe `{ a, b, fin }`: dos fechas sin ordenar.
 * @param onMes recibe el tramo del mes que se ve arriba, `{ desde, hasta }`.
 */
export const Calendario = ({ semanas, hoy, seleccion = null, elegida = null, telefono = false, onPieza, onSeleccion, onMes }) => {
  const [modo, setModo] = useState('lista');
  const tipo = telefono ? modo : 'escritorio';

  const altos = useMemo(
    () => semanas.map((s) => (tipo === 'escritorio' ? altoDeSemana(s) : tipo === 'lista' ? altoEnLista(s) : altoEnMes(s))),
    [semanas, tipo]
  );
  const { tops, total, indice } = useMemo(() => posiciones(altos), [altos]);

  const scrollRef = useRef(null);
  const [scroll, setScroll] = useState({ top: 0, alto: 600 });
  const marco = useRef(0);
  /* La semana del centro de la vista y lo que se ha entrado en ella: cada fila
     mide lo que lleva, así que cuando llegan los datos las filas crecen, y lo
     que se veía tiene que seguir en su sitio. */
  const ancla = useRef(null);
  const leer = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setScroll({ top: el.scrollTop, alto: el.clientHeight });
    const medio = el.scrollTop + el.clientHeight / 2;
    const i = semanas.length ? indice(medio) : -1;
    ancla.current = i >= 0 ? { lunes: semanas[i].lunes, dentro: medio - tops[i] } : null;
  }, [semanas, tops, indice]);
  const alDesplazar = () => {
    if (marco.current) return;
    marco.current = requestAnimationFrame(() => {
      marco.current = 0;
      leer();
    });
  };
  useEffect(() => () => cancelAnimationFrame(marco.current), []);

  /* Llevar una semana a la vista: centrada (hoy) o arriba (un rango). */
  const irA = useCallback(
    (lunes, { centrada = true, suave = false } = {}) => {
      const el = scrollRef.current;
      const i = semanas.findIndex((s) => s.lunes === lunes);
      if (!el || i < 0) return false;
      const top = centrada ? tops[i] - (el.clientHeight - altos[i]) / 2 : tops[i] - 8;
      el.scrollTo({ top: Math.max(0, top), behavior: suave ? 'smooth' : 'auto' });
      leer();
      return true;
    },
    [semanas, tops, altos, leer]
  );

  /* Al abrir (y al cambiar de modo en el teléfono): el rango elegido o la
     semana de hoy. Las semanas llegan a tandas con los datos (las futuras, las
     últimas), así que hasta que el entrenador mueve la vista se vuelve a ese
     sitio cada vez que cambian las filas. Después, manda el ancla. */
  const inicial = useRef(null);
  useLayoutEffect(() => {
    inicial.current =
      seleccion?.fin && !inicial.current && !ancla.current
        ? { lunes: weekStart(seleccion.desde), centrada: false }
        : { lunes: weekStart(hoy), centrada: true };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo]);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (inicial.current) {
      irA(inicial.current.lunes, { centrada: inicial.current.centrada });
      return;
    }
    const a = ancla.current;
    const i = a ? semanas.findIndex((s) => s.lunes === a.lunes) : -1;
    if (i < 0) return;
    const top = Math.max(0, tops[i] + Math.min(a.dentro, altos[i]) - el.clientHeight / 2);
    if (Math.abs(el.scrollTop - top) > 1) el.scrollTop = top;
    leer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tops, tipo]);
  /* El entrenador mueve la vista: deja de volver al sitio de partida. */
  const soltarInicio = () => {
    inicial.current = null;
  };

  /* El mes de arriba: el título fijo y lo que resume el periodo. */
  const primera = semanas.length ? indice(scroll.top + 32) : -1;
  const mes = primera >= 0 ? mesDeLaSemana(semanas[primera].lunes, MESES) : '';
  useEffect(() => {
    if (!mes || !onMes) return;
    const suyas = semanas.filter((s) => mesDeLaSemana(s.lunes, MESES) === mes);
    if (suyas.length) onMes({ desde: suyas[0].lunes, hasta: suyas[suyas.length - 1].domingo });
  }, [mes, semanas, onMes]);

  /* ── Arrastrar para elegir un rango ────────────────────────────────────── */
  const arrastre = useRef(null);
  const tragarClic = useRef(false);
  const fechaEn = (x, y) => document.elementFromPoint(x, y)?.closest('[data-fecha]')?.dataset.fecha || null;
  const soltar = () => {
    if (arrastre.current?.espera) clearTimeout(arrastre.current.espera);
    arrastre.current = null;
  };
  const alBajar = (e) => {
    if (e.button !== 0) return;
    const fecha = e.target.closest?.('[data-fecha]')?.dataset.fecha;
    if (!fecha) return;
    const a = { inicio: fecha, fin: fecha, activo: false, x: e.clientX, y: e.clientY, tactil: e.pointerType !== 'mouse' };
    if (a.tactil)
      a.espera = setTimeout(() => {
        a.activo = true;
        onSeleccion({ a: fecha, b: fecha, fin: false });
      }, PULSACION_LARGA);
    arrastre.current = a;
  };
  const alMover = (e) => {
    const a = arrastre.current;
    if (!a) return;
    if (!a.activo) {
      if (a.tactil) {
        /* El dedo se movió antes de tiempo: es desplazar, no elegir. */
        if (Math.hypot(e.clientX - a.x, e.clientY - a.y) > UMBRAL) soltar();
        return;
      }
      const f = fechaEn(e.clientX, e.clientY);
      if (!f || f === a.inicio) return;
      a.activo = true;
    }
    const f = fechaEn(e.clientX, e.clientY);
    if (f && f !== a.fin) {
      a.fin = f;
      onSeleccion({ a: a.inicio, b: f, fin: false });
    }
  };
  const alSubir = () => {
    const a = arrastre.current;
    if (a?.activo) {
      onSeleccion({ a: a.inicio, b: a.fin, fin: true });
      tragarClic.current = true;
    }
    soltar();
  };
  /* Mientras se elige con el dedo, la lista no se desplaza. */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const alTocar = (e) => {
      if (arrastre.current?.activo) e.preventDefault();
    };
    el.addEventListener('touchmove', alTocar, { passive: false });
    return () => el.removeEventListener('touchmove', alTocar);
  }, []);

  const pulsar = (pieza) => (e) => {
    e.stopPropagation();
    if (tragarClic.current) {
      tragarClic.current = false;
      return;
    }
    onPieza(pieza);
  };
  const abrirHecho = (evento) => pulsar({ tipo: 'hechos', eventos: [evento] });

  /* ── Las filas que se montan ───────────────────────────────────────────── */
  const i0 = semanas.length ? indice(Math.max(0, scroll.top - COLCHON)) : 0;
  const i1 = semanas.length ? indice(scroll.top + scroll.alto + COLCHON) : -1;
  const lunesDeHoy = weekStart(hoy);

  const claseDia = (d, extra = '') =>
    [
      'tl-cal-dia',
      extra,
      /* Solo el día con algo lleva fondo; el vacío es su número. */
      (d.pesaje || d.intervencion || d.alto || d.carreras.length > 0) && 'is-lleno',
      d.futuro && 'is-futuro',
      d.intervencion && 'is-pauta',
      d.alto && 'is-alto',
      d.faseNueva && new Date(`${d.fecha}T00:00:00Z`).getUTCDay() !== 1 && 'is-cambia-fase',
      elegida?.tipo === 'dia' && elegida.fecha === d.fecha && 'is-elegido',
    ]
      .filter(Boolean)
      .join(' ');

  const estiloDia = (d) => ({
    ...(d.faseNueva ? { '--fase-nueva': d.faseNueva.color } : null),
    ...(d.intervencion ? { '--tinta': d.intervencion.color } : null),
  });

  const numeroDelDia = (d) => (
    <span className={`tl-cal-numero${d.esHoy ? ' is-hoy' : ''}${d.mes ? ' is-uno' : ''}`}>
      {d.numero}
      {d.mes && <span className="tl-cal-numero-mes">&nbsp;{d.mes}</span>}
    </span>
  );

  /* Lo que dice el día debajo del pesaje: el refeed con su cifra o la competición. */
  const pieDelDia = (d) => {
    if (d.intervencion && (d.intervencion.nombre || d.intervencion.cifra))
      return (
        <button type="button" className={`tl-cal-intervencion tnum${d.pesaje ? '' : ' is-sin-pesaje'}`} onClick={abrirHecho(d.intervencion.evento)}>
          {d.intervencion.nombre && <span>{d.intervencion.nombre}</span>}
          {d.intervencion.cifra && <span>{d.intervencion.cifra}</span>}
        </button>
      );
    const c = d.carreras[0];
    if (c)
      return (
        <button type="button" className="tl-cal-carrera" onClick={c.destino ? pulsar({ tipo: 'destino' }) : abrirHecho(c.evento)}>
          {c.destino ? <Flag size={12} aria-hidden="true" /> : <Trophy size={12} aria-hidden="true" />}
          <span>{c.nombre}</span>
        </button>
      );
    return null;
  };

  /* La línea de encima de una fila: el mes que empieza en lunes y la fase
     que empieza esa semana, junto a la franja. */
  const rotuloDeFila = (s, conFase = true) =>
    s.rotulo || (conFase && s.fase) ? (
      <div className="tl-cal-rotulo">
        {s.rotulo && <span className="tl-cal-rotulo-mes">{s.rotulo}</span>}
        {conFase && s.fase && (
          <button
            type="button"
            className="tl-cal-rotulo-fase"
            style={{ '--fase': s.fase.color, '--columna': s.fase.columna }}
            data-a-la-par={s.rotulo && s.fase.columna === 0 ? '' : undefined}
            onClick={pulsar({ tipo: 'fase', fase: s.fase.fase })}
          >
            {s.fase.nombre}
          </button>
        )}
      </div>
    ) : null;

  const filaDeEscritorio = (s, i) => (
    <div
      key={s.lunes}
      data-lunes={s.lunes}
      className={`tl-cal-semana${s.futura ? ' is-futura' : ''}${s.lunes === lunesDeHoy ? ' is-actual' : ''}`}
      style={{ top: tops[i], height: altos[i] }}
      role="group"
      aria-label={`${s.numero ? `Semana ${s.numero}, ` : ''}${tramoCorto(s.lunes, s.domingo)}`}
    >
      {rotuloDeFila(s)}
      <div className="tl-cal-celdas" style={{ height: celdaDeSemana(s), '--cal-carriles': carrilesDe(s) }}>
        <span className="tl-cal-franja" style={{ '--fase': colorDeFranja(s) }} aria-hidden="true" />
        {s.dias.map((d) => (
          <div key={d.fecha} className={claseDia(d)} data-fecha={d.fecha} style={estiloDia(d)}>
            <button type="button" className="tl-cal-dia-boton" aria-label={rotuloDelDia(d)} title={rotuloDelDia(d)} onClick={pulsar({ tipo: 'dia', fecha: d.fecha })} />
            <div className="tl-cal-dia-cabeza">
              {numeroDelDia(d)}
              <PuntoDeSesion sesion={d.sesion} />
            </div>
            {d.pesaje && <p className="tl-cal-pesaje tnum">{d.pesaje}</p>}
            {pieDelDia(d)}
          </div>
        ))}
        {s.barras.length > 0 && (
          <div className="tl-cal-barras">
            {s.barras.map((b) => (
              <button
                key={`${b.evento.id || b.evento.date}-${s.lunes}`}
                type="button"
                className={`tl-cal-barra${b.prevista ? ' is-prevista' : ''}`}
                style={{ gridColumn: `${b.desde + 2} / ${b.hasta + 3}`, gridRow: b.carril + 1, '--tinta': b.color }}
                onClick={abrirHecho(b.evento)}
                aria-label={b.nombre || nombreDeHecho(b.evento)}
                title={nombreDeHecho(b.evento)}
              >
                {b.nombre}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          className={`tl-cal-col${elegida?.tipo === 'semana' && elegida.lunes === s.lunes ? ' is-elegido' : ''}`}
          data-fecha={s.domingo}
          onClick={pulsar({ tipo: 'semana', lunes: s.lunes })}
        >
          <CabezaDeSemana s={s} />
          {s.columna.peso && <span className="tl-cal-col-peso tnum">{s.columna.peso}</span>}
          {s.columna.cambio && <span className="tl-cal-col-cambio">{s.columna.cambio}</span>}
          <Extremo extremo={s.columna.extremo} />
        </button>
      </div>
    </div>
  );

  const filaDelMes = (s, i) => (
    <div key={s.lunes} data-lunes={s.lunes} className={`tl-cal-semana is-mes${s.futura ? ' is-futura' : ''}`} style={{ top: tops[i], height: altos[i] }} role="group" aria-label={tramoCorto(s.lunes, s.domingo)}>
      {rotuloDeFila(s, false)}
      <div className="tl-cal-celdas">
        <span className="tl-cal-franja" style={{ '--fase': colorDeFranja(s) }} aria-hidden="true" />
        {s.dias.map((d) => (
          <div key={d.fecha} className={claseDia(d)} data-fecha={d.fecha} style={estiloDia(d)}>
            <button type="button" className="tl-cal-dia-boton" aria-label={rotuloDelDia(d)} onClick={pulsar({ tipo: 'dia', fecha: d.fecha })} />
            <div className="tl-cal-dia-cabeza">
              {numeroDelDia(d)}
              <PuntoDeSesion sesion={d.sesion} />
            </div>
            {d.pesaje && <p className="tl-cal-pesaje tnum">{d.pesaje}</p>}
          </div>
        ))}
      </div>
    </div>
  );

  const tarjeta = (s, i) => (
    <div key={s.lunes} data-lunes={s.lunes} className="tl-cal-hueco-tarjeta" style={{ top: tops[i], height: altos[i] - LISTA.hueco }}>
      {s.rotulo && <p className="tl-cal-rotulo-mes is-lista">{s.rotulo}</p>}
      <article
        className={`tl-cal-tarjeta${s.futura ? ' is-futura' : ''}`}
        style={{ '--fase': s.franja[0]?.color || 'var(--hairline)' }}
      >
        <button type="button" className="tl-cal-tarjeta-cabeza" data-fecha={s.lunes} onClick={pulsar({ tipo: 'semana', lunes: s.lunes })}>
          <CabezaDeSemana s={s} />
          <span className="tl-cal-tarjeta-tramo">{tramoCorto(s.lunes, s.domingo)}</span>
        </button>
        {(s.columna.peso || s.columna.extremo) && (
          <p className="tl-cal-tarjeta-peso">
            {s.columna.peso && <span className="tl-cal-col-peso tnum">{s.columna.peso}</span>}
            {s.columna.cambio && <span className="tl-cal-col-cambio">{s.columna.cambio}</span>}
            <Extremo extremo={s.columna.extremo} />
          </p>
        )}
        <ul className="tl-cal-tarjeta-dias">
          {s.dias.map((d) => (
            <li key={d.fecha} className={claseDia(d, 'tl-cal-fila')} data-fecha={d.fecha} style={estiloDia(d)}>
              <button type="button" className="tl-cal-dia-boton" aria-label={rotuloDelDia(d)} onClick={pulsar({ tipo: 'dia', fecha: d.fecha })} />
              <span className="tl-cal-fila-fecha">
                <span className="tl-cal-fila-semana">{WEEKDAYS[(new Date(`${d.fecha}T00:00:00Z`).getUTCDay() + 6) % 7]}</span>
                {numeroDelDia(d)}
              </span>
              {d.pesaje && <span className="tl-cal-fila-pesaje tnum">{d.pesaje}</span>}
              <span className={`tl-cal-fila-pie${d.pesaje ? '' : ' is-ancho'}`}>{pieDelDia(d)}</span>
              <PuntoDeSesion sesion={d.sesion} />
            </li>
          ))}
        </ul>
      </article>
    </div>
  );

  /* El rango elegido: un contorno alrededor de sus semanas, que no tapa los
     tintes de los días. */
  const rango = (() => {
    if (!seleccion) return null;
    const a = semanas.findIndex((s) => s.domingo >= seleccion.desde);
    const b = semanas.findLastIndex((s) => s.lunes <= seleccion.hasta);
    if (a < 0 || b < a) return null;
    const top = tops[a] + cajaDeSemana(semanas[a], tipo).arriba;
    return { top, height: tops[b] + cajaDeSemana(semanas[b], tipo).abajo - top };
  })();

  const pintar = tipo === 'escritorio' ? filaDeEscritorio : tipo === 'mes' ? filaDelMes : tarjeta;

  return (
    <div className={`tl-cal is-${tipo}`}>
      <div className="tl-cal-titular">
        <h3 className="tl-cal-mes">{mes}</h3>
        <div className="tl-cal-titular-derecha">
          {telefono && <SegmentedControl value={modo} onChange={setModo} options={MODOS_TELEFONO} label="Cómo se ve el calendario" />}
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => {
              soltarInicio();
              irA(lunesDeHoy, { suave: true });
            }}>
            Hoy
          </button>
        </div>
      </div>
      {tipo !== 'lista' && (
        <div className="tl-cal-cabecera" aria-hidden="true">
          <span />
          {(tipo === 'mes' ? INICIALES : WEEKDAYS).map((d) => (
            <span key={d}>{d}</span>
          ))}
          {tipo === 'escritorio' && <span>Semana</span>}
        </div>
      )}
      <div
        ref={scrollRef}
        className="tl-cal-scroll"
        onScroll={alDesplazar}
        onWheel={soltarInicio}
        onTouchStart={soltarInicio}
        onKeyDown={soltarInicio}
        onPointerDown={(e) => {
          soltarInicio();
          alBajar(e);
        }}
        onPointerMove={alMover}
        onPointerUp={alSubir}
        onPointerCancel={soltar}
        onContextMenu={(e) => {
          if (arrastre.current) e.preventDefault();
        }}
      >
        <div className="tl-cal-lienzo" style={{ height: total }}>
          {semanas.slice(i0, i1 + 1).map((s, k) => pintar(s, i0 + k))}
          {rango && <div className={`tl-cal-rango${seleccion.fin ? '' : ' is-eligiendo'}`} style={rango} aria-hidden="true" />}
        </div>
      </div>
    </div>
  );
};
