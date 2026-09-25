import { useMemo, useState } from 'react';
import { CalendarCheck, ChevronRight } from 'lucide-react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';

import { useApp } from '@/context/AppContext';
import { resolvedMicrocycles } from '@/domain/blocks';
import { kindMeta } from '@/domain/calendar';
import { entrenoDeLasSemanas, gruposPorBloque } from '@/domain/lenteDeEntreno';
import { metricColor } from '@/domain/metrics';
import { tramoDeFechas } from '@/domain/semanasDelPlan';
import { localeNumber, shortDate, weekStart } from '@/lib/dates';
import { useElementWidth } from '@/lib/useElementWidth';
import { useEsTelefono } from '@/lib/useMediaQuery';
import { semanaPath } from '@/routes';
import { EmptyState, SegmentedControl } from '@/components/ui/primitives';
import { Tarjeta } from '@/components/dashboard/Tarjeta';
import { PlanDelRoadmap } from '@/components/roadmap/PlanDelRoadmap';
import { TrazoDelPeso } from '@/components/roadmap/TrazoDelPeso';
import { escalaPorColumnas } from '@/components/roadmap/geometria';
import { conY, marcasDe, porFase, pxPorKilo } from '@/components/roadmap/escalaDePeso';
import { LineaDeTiempo } from '@/components/temporada/LineaDeTiempo';
import { useReviewRows } from './useReviewRows';
import { useSemanasDeRevision } from './useSemanasDeRevision';
import { CANAL, medirColumnas, partir } from './geometriaDeTiras';
import { PortadaDeEntreno } from './PortadaDeEntreno';

/**
 * REVISIONES: PRIMERO LAS SEMANAS, DESPUÉS LA REVISIÓN (22 sep 2026).
 *
 * ══ La forma ════════════════════════════════════════════════════════════════
 *
 *     Te toca revisar la S11 · del 14 sept · Entregó
 *     ┌ SUS SEMANAS ───────────────────────────── [Nutrición | Entreno] ┐
 *     │ › Volumen      2 mar – 18 may · 12 semanas      ╱╲  84,1 86,5 +2,3 │
 *     │ ─ Definición   6 jul – 19 oct · 16 semanas         79,8 79,8  0,0 │
 *     │   ·•—•—•—•—•—•  (la gráfica de peso, una columna por semana)      │
 *     │   [S19][S20][S21][S22]…[S30 hoy][S31]…   (las casillas)           │
 *     │ ─ Transición   prevista                                           │
 *     └───────────────────────────────────────────────────────────────────┘
 *
 * Cada fase es una tira, con la cabecera de Historial: la gráfica arriba y sus
 * casillas debajo, alineadas columna a columna. Las pasadas van plegadas, la
 * actual abierta y las futuras debajo. Señalar una columna enciende su casilla
 * y al revés. Pulsar una abre esa semana, que tiene su propia dirección.
 *
 * ── La casilla dice su estado por su FORMA ─────────────────────────────────
 * Plana, sin sombras: revisada (tinte suave y tic), pendiente (la única
 * rellena, de azul: te toca), en curso (canto azul), sin check-in (canto
 * discontinuo) y futura (canto punteado, con el peso esperado). Sin verde ni
 * rojo: la forma dice en qué punto está la revisión, no si la semana fue bien.
 * Ver `domain/estadosDeSemana.js` y `geometriaDeTiras.js`.
 */

/*
  Las dos lentes miran las MISMAS semanas y cuentan cosas distintas: la de
  Nutrición agrupa por fase y dibuja el peso; la de Entreno agrupa por bloque y
  dibuja el tonelaje. Las columnas son las mismas en las dos —mismo ancho,
  mismas casillas, mismo gesto— porque es el mismo calendario.
*/
const LENTES = [
  { id: 'nutricion', label: 'Nutrición' },
  { id: 'entreno', label: 'Entreno' },
];

/*
  El conmutador de la portada (24 sep 2026): las tiras de siempre o la línea
  de tiempo nueva (`components/temporada/`). Conviven mientras se construye la
  línea, para poder compararlas con datos reales; en la fase 7 la línea pasa
  a ser la portada y el conmutador desaparece. Va en la dirección
  (`?vista=linea`) para que se pueda enlazar y sobreviva a recargar.
*/
const VISTAS_PORTADA = [
  { id: 'tiras', label: 'Tiras' },
  { id: 'linea', label: 'Línea de tiempo' },
];

const kg = (v) => localeNumber(v, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const signo = (v) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${kg(Math.abs(v))}`;

const DICHO = {
  revisada: 'revisada',
  pendiente: 'te toca revisarla',
  curso: 'en curso',
  sin: 'sin check-in',
  futura: 'prevista',
};

/* El número de la semana, o su fecha si el cliente no tiene alta. */
const nombre = (s) => (s.numero ? `S${s.numero}` : shortDate(s.lunes));

/* ── La casilla ─────────────────────────────────────────────────────────── */
const Casilla = ({ s, clientId, compacta, senalada, onSenalar }) => {
  const futura = s.revision5 === 'futura';
  const valor = futura ? s.esperado : s.media;
  const { posicion, semanas } = s.periodo;
  const pegada = semanas > 1 ? (posicion === 0 ? ' is-pega-d' : posicion === semanas - 1 ? ' is-pega-i' : ' is-pega-i is-pega-d') : '';
  const kcal = !futura && s.pauta?.kcals ? s.pauta.kcals : null;
  const estado =
    s.revision5 === 'pendiente' ? (s.entregada ? 'entregó y espera tu respuesta' : 'sin subir, te toca revisarla') : DICHO[s.revision5];

  return (
    <Link
      to={semanaPath(clientId, s.lunes)}
      className={`casilla is-${s.revision5}${compacta ? ' is-compacta' : ''}${senalada ? ' is-senalada' : ''}${pegada}`}
      aria-label={[
        `Semana ${s.numero ?? ''} del ${shortDate(s.lunes)}`,
        estado,
        valor !== null ? `${futura ? 'esperado' : 'media'} ${kg(valor)} kg` : null,
        kcal ? `${localeNumber(kcal)} kcal` : null,
      ]
        .filter(Boolean)
        .join(', ')}
      title={compacta ? `Del ${shortDate(s.lunes)} · ${estado}` : undefined}
      onMouseEnter={() => onSenalar(s.lunes)}
      onMouseLeave={() => onSenalar(null)}
      onFocus={() => onSenalar(s.lunes)}
      onBlur={() => onSenalar(null)}
    >
      <span className="casilla-cab">
        <b className="casilla-n">{nombre(s)}</b>
        {s.revision5 === 'revisada' && <span className="casilla-marca" aria-hidden="true">✓</span>}
        {s.estado === 'hoy' && <span className="casilla-marca is-hoy" aria-hidden="true">hoy</span>}
      </span>
      {!compacta && <span className="casilla-fecha">{shortDate(s.lunes)}</span>}
      <span className={`casilla-kg${futura ? ' is-esperado' : ''}`}>
        {valor === null ? '—' : kg(valor)}
        {valor !== null && !compacta && <small>{futura ? ' esp.' : ' kg'}</small>}
      </span>
      {kcal && <span className="casilla-kcal">{compacta ? String(Math.round(kcal)) : `${localeNumber(kcal)} kcal`}</span>}
    </Link>
  );
};

/* ── La gráfica de un tramo de tira ─────────────────────────────────────── */
/*
  ── ES LA GRÁFICA DE LA TEMPORADA, A OTRO ZOOM ────────────────────────────
  El eje de kilos (`escalaDePeso`), el día a píxel (`escalaPorColumnas`) y el
  trazo del peso (`TrazoDelPeso`) son los mismos que dibujan la temporada
  entera en la ventana del plan. Aquí cambian dos cosas y ninguna es el
  dibujo: el ancho se reparte por SEMANAS y no por fechas, y el rango es el de
  la fase y no el de la ventana. Lo de esta tira y solo de esta tira es lo que
  queda: la rejilla, los hechos de fondo, la línea del esperado y los toques.
*/
const Grafica = ({ semanas, escala, col, color, senalada, onSenalar, onAbrir }) => {
  const TECHO = 14;
  const H = escala.alto + TECHO + 6;
  const W = CANAL + semanas.length * col;
  const { y } = conY(escala, TECHO);
  const X = escalaPorColumnas(semanas[0].lunes, CANAL, col);
  const marcas = marcasDe(escala);

  const esperado = semanas
    .map((s) => (s.esperado !== null ? `${X(s.jueves)},${y(s.esperado)}` : null))
    .filter(Boolean)
    .join(' ');

  return (
    <svg className="tira-svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <g className="progreso-rejilla">
        {marcas.map((v) => (
          <line key={v} x1={CANAL} x2={W} y1={y(v)} y2={y(v)} />
        ))}
      </g>
      <g className="progreso-eje-y">
        {marcas.map((v) => (
          <text key={v} x={CANAL - 8} y={y(v)} textAnchor="end" dominantBaseline="middle">
            {kg(v)}
          </text>
        ))}
      </g>

      {semanas.map((s, i) => (
        <g key={s.lunes}>
          {s.lunes === senalada && <rect className="tira-senal" x={CANAL + col * i} y={0} width={col} height={H} />}
          {s.hechos
            .filter((h) => h.kind === 'refeed' || h.kind === 'diet_break')
            .slice(0, 1)
            .map((h) => (
              <g key={h.id || h.date}>
                <rect className="tira-hecho" x={CANAL + col * i + 2} y={TECHO} width={col - 4} height={escala.alto} />
                <text className="tira-hecho-t" x={X(s.jueves)} y={TECHO - 4} textAnchor="middle">
                  {kindMeta(h.kind).label}
                </text>
              </g>
            ))}
        </g>
      ))}

      {esperado && <polyline className="progreso-meta" points={esperado} stroke={color} />}

      <TrazoDelPeso
        semanas={semanas}
        X={X}
        Y={y}
        color={color}
        radio={(s) => (s.lunes === senalada ? 4.5 : 3.5)}
        grueso={(s) => s.estado === 'hoy'}
      />

      {/* Las columnas se señalan y se pulsan con el ratón; con el teclado,
          por las casillas de debajo, que son enlaces. */}
      {semanas.map((s, i) => (
        <rect
          key={`h-${s.lunes}`}
          className="tira-toque"
          x={CANAL + col * i}
          y={0}
          width={col}
          height={H}
          onMouseEnter={() => onSenalar(s.lunes)}
          onMouseLeave={() => onSenalar(null)}
          onClick={() => onAbrir(s.lunes)}
        />
      ))}
    </svg>
  );
};

/* La línea mínima de una fase plegada: sus medias, sin ejes. */
const LineaMinima = ({ semanas, color }) => {
  const vs = semanas.map((s) => s.media).filter((v) => v !== null);
  if (vs.length < 2) return null;
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  const W = 96;
  const H = 24;
  const puntos = vs
    .map((v, i) => `${(i / (vs.length - 1)) * W},${max === min ? H / 2 : 2 + ((max - v) / (max - min)) * (H - 4)}`)
    .join(' ');
  return (
    <svg className="tira-minima" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <polyline className="progreso-trazo" points={puntos} fill="none" stroke={color} />
    </svg>
  );
};

/* Las cifras de la cabecera, con la gramática de Historial. */
const Cifras = ({ filas }) => (
  <dl className="historial-cifras">
    {filas.map(([dt, dd, u]) => (
      <div key={dt}>
        <dt>{dt}</dt>
        <dd>
          {dd}
          {u && <small> {u}</small>}
        </dd>
      </div>
    ))}
  </dl>
);

const cifrasDe = (semanas, tipo) => {
  const conMedia = semanas.filter((s) => s.media !== null);
  const primera = conMedia[0];
  const ultima = conMedia[conMedia.length - 1];
  if (tipo === 'futura') {
    const esp = semanas.filter((s) => s.esperado !== null);
    if (!esp.length) return [];
    return [
      ['Empieza', kg(esp[0].esperado), 'kg'],
      ['Al acabar', kg(esp[esp.length - 1].esperado), 'kg'],
    ];
  }
  if (!ultima) return [];
  if (tipo === 'pasada') {
    return [
      ['Empezó', kg(primera.media), 'kg'],
      ['Acabó', kg(ultima.media), 'kg'],
      ['Cambio', signo(ultima.media - primera.media), null],
    ];
  }
  return [
    ['Media', kg(ultima.media), 'kg'],
    ...(ultima.esperado !== null
      ? [
          ['Esperado', kg(ultima.esperado), 'kg'],
          ['Desvío', signo(ultima.media - ultima.esperado), null],
        ]
      : []),
  ];
};

/* ── Una fase ───────────────────────────────────────────────────────────── */
const Fase = ({ grupo, tipo, abierta, onAlternar, medida, ppk, color, clientId, senalada, onSenalar, onAbrir }) => {
  const { semanas } = grupo;
  const escala = useMemo(() => porFase(semanas, ppk), [semanas, ppk]);
  const titulo = grupo.fase?.title || 'Sin fase';
  const plegable = tipo === 'pasada';

  return (
    <section className={`historial-bloque tira-fase is-${tipo}`}>
      <header className="historial-cab">
        <div className="historial-say">
          {plegable ? (
            <button type="button" className="historial-nombre" aria-expanded={abierta} onClick={onAlternar}>
              <ChevronRight size={15} aria-hidden="true" className="tira-pliegue" />
              {titulo}
            </button>
          ) : (
            <span className="historial-nombre is-quieto">{titulo}</span>
          )}
          <span className="historial-cuando">
            {tipo === 'futura' ? 'Prevista · ' : ''}
            {tramoDeFechas(grupo.desde, grupo.hasta)} · {semanas.length} {semanas.length === 1 ? 'semana' : 'semanas'}
            {medida.compacta && abierta ? ' · kg y kcal' : ''}
          </span>
        </div>
        <div className="tira-cab-derecha">
          {plegable && !abierta && <LineaMinima semanas={semanas} color={color} />}
          <Cifras filas={cifrasDe(semanas, tipo)} />
        </div>
      </header>

      {abierta &&
        partir(semanas, medida.porTira).map((tramo) => (
          <div key={tramo[0].lunes} className="tira">
            {escala && (
              <Grafica
                semanas={tramo}
                escala={escala}
                col={medida.col}
                color={color}
                senalada={senalada}
                onSenalar={onSenalar}
                onAbrir={onAbrir}
              />
            )}
            <div
              className="tira-casillas"
              style={{ gridTemplateColumns: `repeat(${tramo.length}, ${medida.col}px)`, paddingLeft: CANAL }}
            >
              {tramo.map((s) => (
                <Casilla
                  key={s.lunes}
                  s={s}
                  clientId={clientId}
                  compacta={medida.compacta}
                  senalada={s.lunes === senalada}
                  onSenalar={onSenalar}
                />
              ))}
            </div>
          </div>
        ))}
    </section>
  );
};

/* ── La portada ─────────────────────────────────────────────────────────── */
export const PortadaDeSemanas = () => {
  const { activeClient, workoutData, ponerReferenciasDelBloque } = useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const vista = params.get('vista') === 'linea' ? 'linea' : 'tiras';
  const cambiarVista = (v) => {
    const siguiente = new URLSearchParams(params);
    if (v === 'linea') siguiente.set('vista', 'linea');
    else siguiente.delete('vista');
    setParams(siguiente, { replace: true });
  };
  const telefono = useEsTelefono();
  const [refAncho, ancho] = useElementWidth(960);
  const [senalada, setSenalada] = useState(null);
  const [lente, setLente] = useState('nutricion');
  const [plegado, setPlegado] = useState(null);
  /* La ventana del plan: fases, cruce, destino y peso objetivo. Se abría
     desde la banda de fase de la espina; ahora, desde aquí. */
  const [verPlan, setVerPlan] = useState(false);

  const { rows: revisiones, checkIns: entregas, cargando } = useReviewRows(activeClient?.id, { conEnlaces: false });
  const { plan, estados, hoy } = useSemanasDeRevision({ revisiones, entregas });
  const color = metricColor('weight');

  /* Los grupos del plan, con el estado de cada semana y su tipo: pasada,
     actual (la de hoy o la que espera respuesta) o futura. */
  const grupos = useMemo(() => {
    if (!plan || !estados) return [];
    return plan.grupos.map((g) => {
      const semanas = g.semanas.map((s) => estados.porLunes.get(s.lunes) || s);
      const tieneHoy = semanas.some((s) => s.estado === 'hoy');
      const pendiente = semanas.some((s) => s.revision5 === 'pendiente');
      const tipo = semanas.every((s) => s.estado === 'futura') ? 'futura' : tieneHoy ? 'actual' : 'pasada';
      return { ...g, semanas, tipo, pendiente, clave: g.clave ?? `sin-${g.desde}` };
    });
  }, [plan, estados]);

  /* El programa de entreno, con el plan del bloque ya puesto en cada semana
     (`resolvedMicrocycles`), igual que lo lee la revisión de una semana. */
  const program = useMemo(() => {
    const suyo = workoutData?.[activeClient?.id];
    return suyo ? { ...suyo, microcycles: resolvedMicrocycles(suyo) } : null;
  }, [workoutData, activeClient?.id]);

  /* Los grupos de la lente de Entreno: los mismos lunes, partidos por bloque. */
  const porBloque = useMemo(
    () => gruposPorBloque(grupos.flatMap((g) => g.semanas)),
    [grupos]
  );

  /*
    UNA sola medida de columna para las dos lentes, y por eso `mayor` sale del
    tramo más largo de cualquiera de los dos agrupamientos: cambiar de lente
    tiene que cambiar lo que cuentan las columnas, no dónde están. Si el ancho
    saltara al pulsar la pestaña, la portada se leería como dos pantallas.
  */
  const medida = useMemo(
    () =>
      medirColumnas({
        ancho,
        mayor: Math.max(1, ...grupos.map((g) => g.semanas.length), ...porBloque.map((g) => g.semanas.length)),
        telefono,
      }),
    [ancho, grupos, porBloque, telefono]
  );
  const ppk = useMemo(() => pxPorKilo(grupos.map((g) => g.semanas)), [grupos]);

  const entreno = useMemo(
    () => entrenoDeLasSemanas({ program, client: activeClient, semanas: porBloque.flatMap((g) => g.semanas) }),
    [program, activeClient, porBloque]
  );

  if (!activeClient) return null;

  /* `?en=hoy` venía del Resumen: ahora la semana de hoy tiene su dirección. */
  if (params.get('en') === 'hoy') return <Navigate to={semanaPath(activeClient.id, weekStart(hoy))} replace />;

  /* Discreto, en texto: se va en la fase 7, cuando la línea de tiempo sea la portada. */
  const conmutador = (
    <div className="portada-vista" role="group" aria-label="Cómo ver sus semanas">
      {VISTAS_PORTADA.map((v) => (
        <button key={v.id} type="button" className="portada-vista-opcion" aria-pressed={vista === v.id} onClick={() => cambiarVista(v.id)}>
          {v.label}
        </button>
      ))}
    </div>
  );

  const aRevisar = estados?.aRevisar ? estados.porLunes.get(estados.aRevisar) : null;
  const masPendientes = Math.max(0, (estados?.pendientes.length || 0) - 1);
  const teToca =
    !cargando && estados?.aRevisar ? (
      <p className="semanas-toca">
        Te toca revisar{' '}
        <Link to={semanaPath(activeClient.id, estados.aRevisar)}>
          {aRevisar?.numero ? `la S${aRevisar.numero}` : 'la semana'} · del {shortDate(estados.aRevisar)}
        </Link>
        {aRevisar && <span> · {aRevisar.entregada ? 'Entregó' : 'Sin subir'}</span>}
        {masPendientes > 0 && (
          <span> · y {masPendientes} {masPendientes === 1 ? 'más sin contestar' : 'más sin contestar'}</span>
        )}
      </p>
    ) : null;

  /* La línea de tiempo espera a las entregas, como las tiras: sin ellas no se
     sabe el estado de ninguna semana. */
  if (vista === 'linea') {
    return (
      <div className="revision-pagina cascada portada-semanas">
        {teToca}
        {conmutador}
        {!cargando && <LineaDeTiempo plan={plan} estados={estados} />}
      </div>
    );
  }

  /*
    Cada lente tiene su propio vacío, porque cada una mira otra cosa. Alguien
    que entrena y no se pesa nunca tiene semanas que contar en Nutrición y
    TODAS en Entreno; con una sola condición —la del peso— la lente de Entreno
    se quedaba en blanco delante de un programa lleno.
  */
  const hayPeso = grupos.some((g) => g.fase) || grupos.some((g) => g.semanas.some((s) => s.media !== null || s.entrega));
  const hayEntreno = Boolean(plan?.hayBloques) || [...entreno.values()].some((d) => d.tonelaje > 0);
  if (!cargando && plan && !(lente === 'entreno' ? hayEntreno : hayPeso)) {
    return (
      <div className="stack">
        <Tarjeta
          rotulo="Sus semanas"
          span={12}
          className="tarjeta-semanas"
          accion={<SegmentedControl value={lente} onChange={setLente} options={LENTES} label="Qué cifras llevan las casillas" />}
        >
          <EmptyState
            icon={CalendarCheck}
            title="Todavía no hay ninguna semana que revisar"
            message={
              lente === 'entreno'
                ? 'Cuando le montes su primer bloque y entrene, aquí verás cuánto levantó cada semana y qué entrenos hizo.'
                : 'Cuando se pese o te entregue su primer check-in, aquí verás sus semanas, una a una, y cuál te toca revisar.'
            }
          />
        </Tarjeta>
      </div>
    );
  }

  /* Las pasadas, plegadas; la que tiene una semana pendiente se abre sola. */
  const esAbierta = (g) =>
    g.tipo !== 'pasada' ? true : plegado?.clientId === activeClient.id ? plegado.abiertas.has(g.clave) : g.pendiente;
  const alternar = (g) => {
    const abiertas = new Set(grupos.filter(esAbierta).map((x) => x.clave));
    if (abiertas.has(g.clave)) abiertas.delete(g.clave);
    else abiertas.add(g.clave);
    setPlegado({ clientId: activeClient.id, abiertas });
  };

  const abrir = (lunes) => navigate(semanaPath(activeClient.id, lunes));

  return (
    <div className="revision-pagina cascada portada-semanas">
      {teToca}
      {conmutador}

      <Tarjeta
        rotulo="Sus semanas"
        span={12}
        className="tarjeta-semanas"
        accion={
          <span className="row gap-3 wrap">
            <button type="button" className="cab-accion is-puerta" aria-haspopup="dialog" onClick={() => setVerPlan(true)}>
              El plan
            </button>
            <SegmentedControl value={lente} onChange={setLente} options={LENTES} label="Qué cifras llevan las casillas" />
          </span>
        }
      >
        {lente === 'entreno' ? (
          <ul className="progreso-leyenda" aria-label="Qué es cada trazo del dibujo">
            <li>
              <svg className="progreso-muestra" viewBox="0 0 24 12" aria-hidden="true">
                <rect className="entreno-columna" x="3" y="4" width="6" height="8" rx="1.5" fill={metricColor('tonnage')} />
                <rect className="entreno-columna" x="14" y="1" width="6" height="11" rx="1.5" fill={metricColor('tonnage')} />
              </svg>
              lo que levantó esa semana
            </li>
            <li>
              <span className="entreno-hilera is-muestra" aria-hidden="true">
                <i className="entreno-punto is-hecho" />
                <i className="entreno-punto is-hecho" />
                <i className="entreno-punto" />
              </span>
              los entrenos que faltaron
            </li>
          </ul>
        ) : (
        <ul className="progreso-leyenda" aria-label="Qué es cada trazo del dibujo">
          <li>
            <svg className="progreso-muestra" viewBox="0 0 24 12" aria-hidden="true">
              <circle className="progreso-pesaje" cx="6" cy="6" r="2" fill={color} />
              <circle className="progreso-pesaje" cx="16" cy="4" r="2" fill={color} />
            </svg>
            pesajes
          </li>
          <li>
            <svg className="progreso-muestra" viewBox="0 0 24 12" aria-hidden="true">
              <polyline className="progreso-trazo" points="2,9 12,5 22,3" fill="none" stroke={color} />
              <circle className="progreso-punto" cx="12" cy="5" r="2.75" fill={color} />
            </svg>
            media de la semana
          </li>
          <li>
            <svg className="progreso-muestra" viewBox="0 0 24 12" aria-hidden="true">
              <line className="progreso-meta" x1="2" y1="6" x2="22" y2="6" stroke={color} />
            </svg>
            esperado
          </li>
        </ul>
        )}

        {/* Hasta que llegan sus entregas no se sabe qué casilla es qué: se
            espera en vez de pintar un instante semanas «sin check-in». */}
        <div className="tira-fases" ref={refAncho} aria-busy={cargando || undefined}>
          {!cargando && lente === 'entreno' && (
            <PortadaDeEntreno
              program={program}
              client={activeClient}
              semanas={porBloque.flatMap((g) => g.semanas)}
              datos={entreno}
              medida={medida}
              clientId={activeClient.id}
              senalada={senalada}
              onSenalar={setSenalada}
              onAbrir={abrir}
              onReferencias={(blockId, lista) => ponerReferenciasDelBloque(activeClient.id, blockId, lista)}
            />
          )}
          {!cargando && lente === 'nutricion' && grupos.map((g) => (
            <Fase
              key={g.clave}
              grupo={g}
              tipo={g.tipo}
              abierta={esAbierta(g)}
              onAlternar={() => alternar(g)}
              medida={medida}
              ppk={ppk}
              color={color}
              clientId={activeClient.id}
              senalada={senalada}
              onSenalar={setSenalada}
              onAbrir={abrir}
            />
          ))}
        </div>
      </Tarjeta>

      {verPlan && <PlanDelRoadmap onClose={() => setVerPlan(false)} />}
    </div>
  );
};
