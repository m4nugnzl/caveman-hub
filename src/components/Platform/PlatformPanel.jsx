import { useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Ban,
  CalendarClock,
  ChevronRight,
  CircleCheck,
  CircleHelp,
  Clock,
  Database,
  EyeOff,
  Filter,
  MousePointerClick,
  Play,
  Receipt,
  Ruler,
  Search,
  ShieldAlert,
  Stethoscope,
  TrendingUp,
  Wallet,
} from 'lucide-react';

import { norm } from '@/lib/texto';
import { useRadiografia, VENTANAS } from '@/context/useRadiografia';
import { Sparkline } from '@/components/ui/charts';
import { RangeChips } from '@/components/ui/ChartCard';
import { Delta, MetricCard, MetricRow } from '@/components/ui/metrics';
import { ThOrden, ordenar, useOrden } from '@/components/ui/tabla';
import {
  EmptyState,
  Field,
  Fold,
  GroupHead,
  Loading,
  Notice,
  PageHead,
  Panel,
  SectionTitle,
  SegmentedControl,
  TextInput,
} from '@/components/ui/primitives';

/*
  ══ La radiografía, dentro de la aplicación ══════════════════════════════════

  Durante mucho tiempo esto solo existía como un HTML generado en local, por las
  tres razones de `docs/observabilidad.md` §2. Dos han caducado y la tercera se
  contesta en el servidor, no aquí: ver `docs/plataforma.md`.

  ── Lo que esta pantalla NO hace, y es lo importante ────────────────────────
  **No calcula nada.** Ni un umbral, ni un porcentaje, ni un veredicto. Todo eso
  llega ya decidido desde `src/domain/radiografia/`, que es el mismo código que
  ejecuta `npm run radiografia` en la terminal. Si esta pantalla recalculara
  aunque fuera una cifra, habría dos respuestas posibles a «¿qué va mal?» y el
  día que discreparan ninguna de las dos avisaría.

  Aquí solo se pinta. Es deliberado y conviene que siga siendo aburrido.

  ── El orden es el del informe, y no es casual ──────────────────────────────
  Veredicto → indicadores → detalle. Las versiones antiguas del informe abrían
  por agregados y con cuatro cuentas eso no informa: divide y borra los nombres.
  Se abre por lo que hay que atender HOY, que es lo único que se moja.
*/

/* La gravedad de un diagnóstico, con su palabra al lado. Ni un estado se
   distingue solo por el color: es la regla de los gráficos del informe y vale
   igual para esto. */
const GRAVEDAD = {
  atender: { icono: AlertTriangle, label: 'Atender', tono: 'bad' },
  vigilar: { icono: Clock, label: 'Vigilar', tono: 'warn' },
  sin_datos: { icono: CircleHelp, label: 'Sin datos', tono: 'info' },
  bien: { icono: CircleCheck, label: 'Bien', tono: 'ok' },
};

const NIVEL = {
  critico: { label: 'Crítico', tono: 'bad' },
  aviso: { label: 'Aviso', tono: 'warn' },
  info: { label: 'Contexto', tono: 'info' },
};

const num = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString('es-ES') : '—');

/* ══ El veredicto ═══════════════════════════════════════════════════════════
   Lo único del informe que se moja. Cada línea trae su cifra, de dónde sale y
   QUÉ HACER — sin eso sería una lista de datos y no una lista de trabajo. */

/*
  ══ De la cifra a las filas ═════════════════════════════════════════════════

  Cada diagnóstico trae desde el dominio un campo `ancla` que dice a qué sección
  pertenece —el informe HTML lo usa como enlace— y esta pantalla lo ignoraba por
  completo. Era el «no se puede preguntar» de `plataforma.md` §4.1: «cinco cobros
  vencidos, 720 €» y ahí moría, sin camino de la cifra a las filas.

  Las anclas del dominio son nueve y las pestañas son cinco, así que hace falta
  este mapa. No es una traducción arbitraria: cada ancla va donde de verdad está
  su detalle —los tickets («voz») viven en la pestaña de cuentas, el censo y el
  uso en producto—. Una que no esté aquí no rompe nada: se queda sin flecha, que
  es exactamente lo que tiene que pasar con un diagnóstico que no lleva a
  ninguna parte.
*/
const ANCLA_A_VISTA = {
  cuentas: 'cuentas',
  voz: 'cuentas',
  dinero: 'dinero',
  negocio: 'dinero',
  censo: 'producto',
  uso: 'producto',
  actividad: 'producto',
  salud: 'salud',
  seguridad: 'seguridad',
};

const Veredicto = ({ diagnosticos = [], resumen = { atender: 0, vigilar: 0 }, onIr }) => {
  /* Los «bien» no se pintan de uno en uno: son la mayoría y llenarían la
     pantalla de buenas noticias por encima de las malas. Se cuentan y ya. */
  const accionables = diagnosticos.filter((d) => d.gravedad !== 'bien');
  const bien = diagnosticos.length - accionables.length;

  if (accionables.length === 0) {
    return (
      <Notice tone="success">
        Nada que atender. {bien} comprobación{bien === 1 ? '' : 'es'} en verde.
      </Notice>
    );
  }

  return (
    <Panel
      title="Qué atender"
      sub={
        [
          `${resumen.atender} para atender`,
          resumen.vigilar > 0 && `${resumen.vigilar} para vigilar`,
          /* Los «sin datos» SÍ salen en la lista de abajo —son comprobaciones
             que no se han podido hacer, no comprobaciones en verde— y no
             estaban en esta cuenta: el resumen decía «1 para atender · 6 en
             verde» encima de una lista de tres filas. Un recuento que no cuadra
             con lo que hay debajo enseña a no leer el recuento. */
          resumen.sinDatos > 0 && `${resumen.sinDatos} sin datos`,
          bien > 0 && `${bien} en verde`,
        ]
          .filter(Boolean)
          .join(' · ')
      }
    >
      <ul className="list">
        {accionables.map((d) => {
          const g = GRAVEDAD[d.gravedad] || GRAVEDAD.sin_datos;
          const Icono = g.icono;
          return (
            <li key={d.titulo} className="list-row">
              <span className={`badge badge-${g.tono}`}>
                <Icono size={12} />
                {g.label}
              </span>

              <div className="grow" style={{ minWidth: 0 }}>
                <div className="row gap-2 wrap" style={{ alignItems: 'baseline' }}>
                  <strong>{d.titulo}</strong>
                  {d.cifra && <span className="t-sm t-tertiary">{d.cifra}</span>}
                </div>
                {/* `hacer` es la mitad del valor de un diagnóstico: sin él, esto
                    sería una lista de cosas que están mal y no de cosas que se
                    pueden arreglar. */}
                {d.hacer && <p className="t-sm t-secondary">{d.hacer}</p>}

                {/*
                  ══ El porqué se pliega, pero solo cuando es un muro ═════════

                  `porque` es «de dónde sale la cifra», y el dominio lo entrega
                  de dos formas distintas: una LISTA unida por « · » —los siete
                  nombres, los tres asuntos de los tickets— o UNA FRASE («el más
                  antiguo venció hace 22 días»).

                  La lista se pliega, y por eso se puso el pliegue: con siete
                  cuentas son seis líneas de «entró hoy, 0 clientes y 0 acciones»
                  repetido, y ese muro empujaba los otros seis diagnósticos fuera
                  de la pantalla. No se recorta —quién es exactamente hace falta
                  para actuar—, se pliega, que es distinto.

                  La frase NO. Plegar una línea cuesta más cromo del que ahorra:
                  el pliegue mide lo mismo que lo que esconde, y encima esconde
                  justo la mitad del diagnóstico que se puede leer de un vistazo.

                  ── Y el rótulo es «Por qué», no «Quiénes» ──────────────────
                  Porque dentro no siempre hay personas: en el diagnóstico de
                  soporte son asuntos de tickets y en el de seguridad son nombres
                  de tablas. «Quiénes» acertaba en tres de los diez.

                  El resumen del pliegue se ha quitado: era `d.cifra`, o sea la
                  misma cifra que ya está dos líneas más arriba en su píldora. El
                  «7» salía tres veces en la misma fila —en el título, en la
                  píldora y en el pliegue— y tres veces la misma cifra se lee
                  como tres cifras.
                */}
                {d.porque &&
                  (d.porque.includes(' · ') ? (
                    <Fold title="Por qué">
                      <p className="t-xs t-tertiary">{d.porque}</p>
                    </Fold>
                  ) : (
                    <p className="t-xs t-tertiary">{d.porque}</p>
                  ))}
              </div>

              {/* La flecha lleva a la sección donde están las filas que sostienen
                  esta cifra. Solo si el dominio dijo a cuál: un diagnóstico sin
                  ancla se queda sin flecha en vez de llevar a un sitio elegido a
                  ojo, que sería peor que no llevar a ninguno. */}
              {onIr && ANCLA_A_VISTA[d.ancla] && (
                <button
                  type="button"
                  className="btn btn-plain btn-sm"
                  onClick={() => onIr(ANCLA_A_VISTA[d.ancla])}
                  aria-label={`Ver el detalle: ${d.titulo}`}
                >
                  Ver
                  <ChevronRight size={14} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
};

/* ══ Los indicadores ════════════════════════════════════════════════════════
   El nivel que `observabilidad.md` §1 describía y que el HTML nunca llegó a
   pintar: la serie se calculaba y no la leía nadie. Aquí sí. */

/**
 * Para qué métricas subir es una mala noticia.
 *
 * Sin esto, la píldora de variación pinta de verde que los críticos de
 * seguridad hayan subido de 0 a 2, que es exactamente lo contrario de lo que
 * significa. Es la misma regla que `lowerIsBetter` en el resto del producto.
 */
const BAJAR_ES_MEJOR = new Set([
  'seguridad · críticos',
  'fallos · distintos',
  'revisión · entregados sin contestar +7d',
]);

const ETIQUETA_CORTA = {
  'seguridad · críticos': 'Críticos de seguridad',
  'actividad · cuentas esta semana': 'Cuentas activas',
  'clientes · total': 'Clientes',
  'clientes · con portal (%)': 'Con portal',
  'revisión · entregados sin contestar +7d': 'Sin contestar +7d',
  'fallos · distintos': 'Fallos distintos',
};

/*
  ══ Dos filas, y no una de seis ═════════════════════════════════════════════

  `producto.md` §5.4: «una fila de métricas tiene 2 o 4 tarjetas; tres deja un
  hueco que el ojo lee como un error». Seis dejaba DOS huecos.

  Partirlas 4 + 2 cumple la regla, pero lo que decide el corte no es la
  aritmética: son dos preguntas distintas. Las cuatro primeras crecen cuando el
  producto va bien; las dos últimas **tendrían que estar en cero siempre**, y
  mezclarlas obligaría a recordar en cuáles subir es una buena noticia.

  Las claves salen de `CON_TENDENCIA` —la lista del dominio— y la prueba
  comprueba que entre las dos filas están todas: añadir una métrica con
  tendencia y olvidarse de pintarla es un fallo callado.
*/
export const FILAS = [
  {
    titulo: null,
    claves: [
      'actividad · cuentas esta semana',
      'clientes · total',
      'clientes · con portal (%)',
      'revisión · entregados sin contestar +7d',
    ],
  },
  { titulo: 'Lo que debería estar en cero', claves: ['seguridad · críticos', 'fallos · distintos'] },
];

const Indicadores = ({ metricas = {}, series = {}, cambios = [] }) => {
  const porClave = useMemo(() => new Map(cambios.map((c) => [c.clave, c])), [cambios]);

  const tarjetas = (claves) =>
    claves.map((clave) => {
      const valor = metricas[clave];
      if (!Number.isFinite(Number(valor))) return null;

      const serie = series[clave] || [];
      const cambio = porClave.get(clave);
      const unidad = clave.includes('(%)') ? '%' : '';

      return (
        <MetricCard
          key={clave}
          title={ETIQUETA_CORTA[clave] || clave}
          value={num(valor)}
          unit={unidad}
          delta={
            cambio ? (
              <Delta
                value={Number(cambio.ahora) - Number(cambio.antes)}
                unit={unidad}
                lowerIsBetter={BAJAR_ES_MEJOR.has(clave)}
                decimals={unidad === '%' ? 1 : 0}
              />
            ) : null
          }
        >
          {/*
            Una métrica sin serie NO inventa otro dibujo: deja el hueco vacío,
            y ese hueco ya informa —todavía no tiene historia—. `Sparkline`
            devuelve null con menos de dos puntos, así que el hueco sale solo.
          */}
          <div className="widget-spark">
            <Sparkline points={serie.map((p) => ({ value: p.valor }))} />
          </div>
        </MetricCard>
      );
    });

  return FILAS.map((fila) => (
    <div key={fila.titulo || 'principal'}>
      {fila.titulo && <SectionTitle>{fila.titulo}</SectionTitle>}
      <MetricRow>{tarjetas(fila.claves)}</MetricRow>
    </div>
  ));
};

/* ══ Las secciones del detalle ══════════════════════════════════════════════

   Se exportan, y no por gusto: desde que el detalle va en pestañas solo se
   pinta la abierta, y `renderToString` no da clics. Probarlas de una en una es
   la única forma de comprobar lo que de verdad importa de cada una — que lee
   los campos que el dominio produce y no los que uno supone, que es el fallo
   callado que ya ocurrió tres veces al escribir esta pantalla.

   ── La hoja de cuentas ───────────────────────────────────────────────────── */

/*
  Cómo se ordena cada columna de la hoja de cuentas.

  Vive fuera del componente por dos razones: es una constante —recrearla en cada
  render rompería cualquier memoización— y sobre todo porque aquí está la única
  parte de ordenar que no es mecánica. «Última entrada» llega del dominio como
  una FRASE ya hecha («hace 9 días», «nunca») y ordenarla como texto pondría
  «hace 10 días» antes que «hace 9». Se ordena por `entrada.dias`, que es el
  número que hay debajo, y `nunca` llega como `null` — o sea al final, que es
  donde tiene que estar: no haber entrado nunca no es haber entrado hace cero.
*/
const ORDEN_CUENTAS = {
  nombre: (c) => c.nombre,
  plan: (c) => c.planEtiqueta,
  clientes: (c) => c.clientes,
  portal: (c) => c.conPortal,
  entrada: (c) => c.entrada?.dias,
  semana: (c) => c.accionesSemana,
  prueba: (c) => c.diasDePrueba,
};

/*
  Los filtros. Ninguno introduce un umbral nuevo: los cuatro leen un campo que
  el dominio ya calculó, y por eso se pueden escribir aquí sin partir la regla
  de que esta pantalla no decide nada.
*/
const FILTROS_CUENTAS = [
  { id: 'todas', label: 'Todas', pasa: () => true },
  { id: 'riesgo', label: 'En riesgo', pasa: (c, enRiesgo) => enRiesgo.has(c.id) },
  {
    id: 'prueba',
    label: 'De prueba',
    pasa: (c) => c.diasDePrueba !== null && c.diasDePrueba !== undefined,
  },
  { id: 'vacias', label: 'Sin clientes', pasa: (c) => !c.clientes },
];

export const Cuentas = ({ cuentas = [], riesgo = [] }) => {
  /*
    `riesgo` ya viene calculado y cada entrada trae SUS MOTIVOS. Se pintan en la
    fila: teñirla de rojo diría que algo pasa y obligaría a adivinar el qué —y
    además sería distinguir un estado solo por el color—. «la prueba acaba en 3
    días» se lee y se actúa.
  */
  const motivosPor = new Map(riesgo.map((c) => [c.id, c.motivos]));
  const enRiesgo = new Set(riesgo.map((c) => c.id));

  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('todas');
  const orden = useOrden();

  const visibles = useMemo(() => {
    const termino = norm(busca.trim());
    const pasa = (FILTROS_CUENTAS.find((f) => f.id === filtro) || FILTROS_CUENTAS[0]).pasa;
    const filtradas = cuentas.filter(
      (c) =>
        pasa(c, enRiesgo) &&
        (!termino || norm(c.nombre).includes(termino) || norm(c.correo).includes(termino))
    );
    /*
      Sin columna elegida se respeta el orden del dominio, que no es alfabético
      ni casual: `cuentasDe` las devuelve por lo que más urge mirar. Ordenar por
      defecto por algo nuestro taparía ese criterio el 100 % de las veces para
      servir a quien quiera otro el 10 %.
    */
    return ordenar(filtradas, orden, ORDEN_CUENTAS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuentas, busca, filtro, orden.campo, orden.sentido]);

  if (cuentas.length === 0) {
    return <EmptyState icon={Activity} title="Ninguna cuenta" message="No hay equipos todavía." />;
  }

  return (
    <Panel
      title="Cuentas"
      sub={
        visibles.length === cuentas.length
          ? `${cuentas.length} en total · ${riesgo.length} con algo que mirar`
          : `${visibles.length} de ${cuentas.length}`
      }
      action={
        <div className="searchbox">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            className="input"
            placeholder="Buscar cuenta…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            aria-label="Buscar por nombre o correo"
          />
        </div>
      }
    >
      {/* La cifra va en el propio chip: sin ella hay que pulsarlo para saber si
          hay algo detrás, y «Sin clientes 0» es una respuesta tan buena como la
          lista que habría dentro. */}
      <div className="rail-wrap" role="group" aria-label="Filtrar cuentas">
        {FILTROS_CUENTAS.map((f) => {
          const cuantas = cuentas.filter((c) => f.pasa(c, enRiesgo)).length;
          return (
            <button
              key={f.id}
              type="button"
              className="chip"
              aria-pressed={filtro === f.id}
              onClick={() => setFiltro(f.id)}
            >
              {f.label}
              <span className="chip-count">{cuantas}</span>
            </button>
          );
        })}
      </div>

      {visibles.length === 0 ? (
        <Notice tone="info">Ninguna cuenta cuadra con lo que buscas.</Notice>
      ) : (
      <div className="table-scroll">
        <table className="table table-compact">
          <thead>
            <tr>
              <ThOrden orden={orden} campo="nombre">Quién</ThOrden>
              <ThOrden orden={orden} campo="plan">Plan</ThOrden>
              <ThOrden orden={orden} campo="clientes" num>Clientes</ThOrden>
              <ThOrden orden={orden} campo="portal" num>Portal</ThOrden>
              <ThOrden orden={orden} campo="entrada">Última entrada</ThOrden>
              <ThOrden orden={orden} campo="semana" num>7 días</ThOrden>
            </tr>
          </thead>
          <tbody>
            {visibles.map((c) => {
              const motivos = motivosPor.get(c.id) || [];
              return (
                <tr key={c.id}>
                  <td>
                    <div style={{ minWidth: 0 }}>
                      <strong>{c.nombre}</strong>
                      {c.correo && c.correo !== c.nombre && (
                        <div className="t-xs t-tertiary">{c.correo}</div>
                      )}
                      {motivos.length > 0 && (
                        <div className="t-xs t-tertiary">{motivos.join(' · ')}</div>
                      )}
                    </div>
                  </td>
                  <td>
                    {/* La ETIQUETA del plan, no su clave: la del gratuito sigue
                        llamándose `prueba` por la 0056 y diría lo contrario de
                        lo que el plan hace. */}
                    <span className="badge">{c.planEtiqueta}</span>
                    {c.diasDePrueba !== null && c.diasDePrueba !== undefined && (
                      <div className="t-xs t-tertiary">
                        {c.diasDePrueba < 0
                          ? `prueba caducada hace ${-c.diasDePrueba} d`
                          : `prueba: ${c.diasDePrueba} d`}
                      </div>
                    )}
                  </td>
                  <td className="num">
                    {num(c.clientes)}
                    {/* `null` es «sin límite», que no es lo mismo que cero. */}
                    {c.topeClientes !== null && c.topeClientes !== undefined && (
                      <span className="t-xs t-tertiary"> / {c.topeClientes}</span>
                    )}
                  </td>
                  <td className="num">{num(c.conPortal)}</td>
                  {/* `entrada` llega ya en palabras desde el dominio: la misma
                      frase exacta que enseña la terminal. No se reformatea. */}
                  <td className="t-sm t-secondary">{c.entrada?.texto || '—'}</td>
                  <td className="num">{num(c.accionesSemana)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
    </Panel>
  );
};

/* ══ Seguridad ══════════════════════════════════════════════════════════════ */

export const Seguridad = ({ hallazgos = [], aviso = null, onAceptar, dias }) => {
  const [soloPendientes, setSoloPendientes] = useState(true);
  const [elegidas, setElegidas] = useState(() => new Set());
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const visibles = hallazgos.filter((h) => {
    if (h.nivel === 'info') return false;
    return soloPendientes ? !h.aceptado : true;
  });

  const criticos = hallazgos.filter((h) => h.nivel === 'critico' && !h.aceptado).length;
  const nuevos = hallazgos.filter((h) => h.nuevo).length;

  const alternar = (clave) => {
    /* Lo que se guardó la vez anterior deja de ser noticia en cuanto se empieza
       otra tanda: dejarlo puesto haría que el «se guardaron 3» de hace un minuto
       pareciera la respuesta a lo que se está marcando ahora. */
    setResultado(null);
    setElegidas((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(clave)) siguiente.delete(clave);
      else siguiente.add(clave);
      return siguiente;
    });
  };

  const enviar = async () => {
    setGuardando(true);
    const hecho = await onAceptar({ claves: [...elegidas], motivo: motivo.trim(), dias });
    setGuardando(false);

    /*
      ══ Solo se limpia si de verdad se guardó ═══════════════════════════════

      Antes se vaciaban la selección y el motivo pasara lo que pasara. Con la
      función caída, eso era: marcar seis hallazgos, escribir el porqué, pulsar,
      y encontrarse la lista sin marcar, el campo en blanco y el error arriba
      del todo —fuera de la pantalla, porque el botón está al final de la lista—.
      Quien no subiera a leerlo se iba creyendo que estaba hecho.

      `aceptar` devuelve el cuerpo de la respuesta si se guardó y `null` si no.
    */
    if (!hecho) {
      setResultado({ fallo: true });
      return;
    }

    setResultado(hecho);
    setElegidas(new Set());
    setMotivo('');
  };

  /* El motivo es obligatorio y el botón lo dice estando apagado. Es la misma
     regla que impone el CHECK de la 0074 y que exige `--aceptar-nuevos`. */
  const puedeEnviar = elegidas.size > 0 && motivo.trim().length >= 3 && !guardando;

  return (
    <Panel
      title="Seguridad"
      sub={`${criticos} crítico(s) sin aceptar · ${nuevos} nuevo(s)`}
      action={
        <button
          type="button"
          className="btn btn-plain btn-sm"
          onClick={() => setSoloPendientes((v) => !v)}
        >
          {soloPendientes ? 'Ver también lo aceptado' : 'Solo pendientes'}
        </button>
      }
    >
      {aviso && <Notice tone="warn">{aviso}</Notice>}

      {visibles.length === 0 ? (
        <Notice tone="success">Ningún hallazgo pendiente.</Notice>
      ) : (
        <ul className="list">
          {visibles.map((h) => {
            const n = NIVEL[h.nivel] || NIVEL.info;
            return (
              <li key={h.clave} className="list-row">
                {/* Sin aceptar todavía → se puede marcar. Ya aceptado → no hay
                    casilla: retirar una aceptación no es desmarcar una casilla,
                    es añadir una fila que la retira (0074), y eso todavía no
                    tiene pantalla. Una casilla que se desmarca sugeriría que sí. */}
                {h.aceptado ? (
                  <span className={`badge badge-${n.tono}`}>{n.label}</span>
                ) : (
                  <label className="row gap-2" style={{ alignItems: 'center' }}>
                    {/*
                      El nombre accesible tiene que ser el HALLAZGO, no su nivel.
                      Lo único dentro de la etiqueta es la píldora «Crítico», así
                      que un lector de pantalla anunciaba «Crítico, casilla» cinco
                      veces seguidas: cinco casillas indistinguibles para dar por
                      buenos cinco agujeros distintos. El texto va aquí y no en un
                      `<span>` visible porque al ojo se lo dice la fila de al lado.
                    */}
                    <input
                      type="checkbox"
                      aria-label={`Dar por bueno: ${h.objeto} — ${h.detalle}`}
                      checked={elegidas.has(h.clave)}
                      onChange={() => alternar(h.clave)}
                    />
                    <span className={`badge badge-${n.tono}`}>{n.label}</span>
                  </label>
                )}

                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="row gap-2 wrap" style={{ alignItems: 'baseline' }}>
                    <strong>{h.objeto}</strong>
                    {h.nuevo && <span className="badge badge-info">Nuevo</span>}
                  </div>
                  <p className="t-sm t-secondary">{h.detalle}</p>
                  {h.aceptado && (
                    <p className="t-xs t-tertiary">
                      Aceptado el {h.aceptado.desde}: «{h.aceptado.motivo}»
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {elegidas.size > 0 && (
        <>
          {/* Aceptar un crítico se avisa. No se impide —a veces es deliberado,
              y para eso está el motivo— pero no puede pasar sin querer entre
              otros cuatro avisos. */}
          {visibles.some((h) => elegidas.has(h.clave) && h.nivel === 'critico') && (
            <Notice tone="warn">
              Entre lo elegido hay un hallazgo <strong>crítico</strong>. Aceptarlo
              lo saca de la lista de pendientes para siempre: que el motivo
              explique por qué es deliberado.
            </Notice>
          )}

          <Field
            label={`Por qué se dan por buenos estos ${elegidas.size}`}
            hint="Queda escrito con tu nombre y la fecha, y no se puede reescribir después."
          >
            <TextInput
              value={motivo}
              onChange={setMotivo}
              placeholder="Revisados a mano: RLS sin políticas a propósito, solo las lee service_role"
            />
          </Field>

          <button type="button" className="btn btn-primary" onClick={enviar} disabled={!puedeEnviar}>
            {guardando ? 'Guardando…' : `Aceptar ${elegidas.size}`}
          </button>
        </>
      )}

      {/*
        ══ Lo que contestó el servidor, que antes se tiraba ═══════════════════

        La función devuelve `{ aceptadas, desconocidas }` y esta pantalla se
        limitaba a volver a pedir el informe. El caso normal se notaba —el
        hallazgo desaparecía de los pendientes— pero el que importa no: una clave
        que ya no existe NO se acepta a propósito (`plataforma.md` §7), así que
        marcabas cinco, se guardaban tres, y las otras dos volvían a salir en la
        lista sin que nada explicara por qué. Se leía como un fallo del panel.

        Va aquí abajo, donde estaba el botón, y no en la cabecera del bloque: con
        la lista larga, un aviso arriba aparece fuera de la pantalla.
      */}
      {/* Que falló se dice AQUÍ, donde se ha pulsado. El motivo entero está en el
          aviso de la cabecera de la pantalla, y con la lista larga eso queda a
          tres pantallas de distancia: sin esta línea, lo único que se ve tras un
          fallo es el botón volviendo a encenderse, que se lee como que sí. */}
      {resultado?.fallo && (
        <Notice tone="error">
          No se ha guardado nada. Lo elegido y el motivo siguen escritos; el
          porqué está en el aviso del principio de la pantalla.
        </Notice>
      )}

      {resultado && !resultado.fallo && (
        <Notice tone={resultado.desconocidas?.length > 0 ? 'warn' : 'success'}>
          {resultado.aceptadas > 0
            ? `Guardado${resultado.aceptadas === 1 ? '' : 's'} ${resultado.aceptadas} con tu nombre y la fecha.`
            : 'No se ha guardado ninguno.'}
          {resultado.desconocidas?.length > 0 && (
            <>
              {' '}
              {resultado.desconocidas.length === 1 ? 'Otro ya no existe' : `Otros ${resultado.desconocidas.length} ya no existen`}
              , así que no se han aceptado: o se arreglaron desde que se pintó
              esta lista, o cambió su texto y ya son otros.{' '}
              <span className="t-xs t-tertiary">
                {resultado.desconocidas.map((c) => String(c).replaceAll('|', ' · ')).join(' / ')}
              </span>
            </>
          )}
        </Notice>
      )}
    </Panel>
  );
};

/* ══ El dinero ══════════════════════════════════════════════════════════════
   Las DOS capas, separadas y rotuladas, porque las dos se llaman «pagos» y no
   son la misma: lo que te pagan a ti (planes) y lo que le pagan a ellos
   (`client_payments`). Ver la cabecera de `dinero.js`. Nunca se suman. */

const dinero = (importe, moneda) =>
  moneda ? `${num(importe)} ${moneda}` : `${num(importe)} (varias monedas)`;

const ORDEN_NEGOCIO = {
  estado: (n) => n.estado,
  plan: (n) => n.plan,
  cuentas: (n) => n.cuentas,
  activas: (n) => n.activas,
  pct: (n) => n.pctActivas,
};

export const Dinero = ({
  planes = [],
  cobros,
  pruebas = [],
  invitaciones,
  movimiento,
  negocio = [],
}) => {
  const orden = useOrden();
  const negocioOrdenado = useMemo(
    () => ordenar(negocio, orden, ORDEN_NEGOCIO),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [negocio, orden.campo, orden.sentido]
  );

  return (
  <>
    <Panel title="Lo que te pagan a ti" sub="Cuentas por plan y estado">
      {/* No se calcula ningún ingreso recurrente: `plan_limits` guarda límites,
          no precios, y una cifra inventada acaba repitiéndose en una reunión.
          Lo que sí se puede contar es cuántas cuentas hay en cada plan. */}
      {planes.length === 0 ? (
        <Notice tone="info">Ninguna suscripción todavía.</Notice>
      ) : (
        <ul className="list">
          {planes.map((p) => (
            <li key={`${p.plan}·${p.estado}`} className="list-row">
              {/* La ETIQUETA, no la clave: `prueba` es el nombre interno del
                  plan gratuito (0056) y decía lo contrario de lo que hace. La
                  clave se conserva debajo para poder buscarla en Stripe. */}
              <span className="badge">{p.planEtiqueta}</span>
              <div className="grow" style={{ minWidth: 0 }}>
                <span className="t-sm t-secondary">
                  {p.estado}
                  {p.planEtiqueta !== p.plan && (
                    <span className="t-xs t-tertiary"> · {p.plan}</span>
                  )}
                </span>
                {/* QUIÉNES. `porPlan` devuelve los nombres y no los leía nadie:
                    «3 cuentas en Fundador» no se puede accionar y «Ana, Luis y
                    Marta en Fundador» sí. Plegado, que con veinte cuentas la
                    lista taparía los planes. */}
                {p.nombres?.length > 0 && (
                  <Fold title="Quiénes" summary={`${p.nombres.length}`}>
                    <p className="t-xs t-tertiary">{p.nombres.join(' · ')}</p>
                  </Fold>
                )}
              </div>
              <strong>{num(p.cuentas)}</strong>
            </li>
          ))}
        </ul>
      )}

      {/*
        ══ Lo único que Stripe no te puede decir ═══════════════════════════

        `negocio` cruza el estado de la suscripción con si esa cuenta ha dado
        señales de vida en las últimas cuatro semanas. Se calculaba y no se
        pintaba, y es la tabla que decide si el precio está en su sitio: los
        estados sueltos ya se ven en Stripe; que un tercio de quien paga no
        entre, no.
      */}
      {negocio.length > 0 && (
        <>
          <SectionTitle icon={Wallet}>Quién paga y quién lo usa</SectionTitle>
          <div className="table-scroll">
            <table className="table table-compact">
              <thead>
                <tr>
                  <ThOrden orden={orden} campo="estado">Estado</ThOrden>
                  <ThOrden orden={orden} campo="plan">Plan</ThOrden>
                  <ThOrden orden={orden} campo="cuentas" num>Cuentas</ThOrden>
                  <ThOrden orden={orden} campo="activas" num>Activas</ThOrden>
                  <ThOrden orden={orden} campo="pct" num>%</ThOrden>
                </tr>
              </thead>
              <tbody>
                {negocioOrdenado.map((n) => (
                  <tr key={`${n.estado}·${n.plan}`}>
                    <td>{n.estado}</td>
                    <td className="t-sm t-secondary">{n.plan}</td>
                    <td className="num">{num(n.cuentas)}</td>
                    <td className="num">{num(n.activas)}</td>
                    <td className="num">{num(n.pctActivas)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="t-xs t-tertiary">
            «Activas» son las que han hecho algo en las últimas cuatro semanas.
          </p>
        </>
      )}

      {pruebas.length > 0 && (
        <>
          {/* La única lista de todo el negocio con fecha límite: pasado ese día
              no se puede hacer nada. */}
          <SectionTitle icon={CalendarClock}>Pruebas que acaban</SectionTitle>
          <ul className="list">
            {pruebas.map((c) => (
              <li key={c.id} className="list-row">
                <span className={`badge badge-${c.diasDePrueba <= 3 ? 'bad' : 'warn'}`}>
                  {c.diasDePrueba < 0 ? 'Caducada' : `${c.diasDePrueba} d`}
                </span>
                <span className="grow">{c.nombre}</span>
                <span className="t-sm t-tertiary">{c.correo}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>

    <Panel
      title="Lo que le pagan a ellos"
      sub="Cobros de tus entrenadores a sus clientes. No es tu caja"
    >
      {!cobros || cobros.total === 0 ? (
        <Notice tone="info">Ningún cobro registrado.</Notice>
      ) : (
        <>
          <MetricRow>
            <MetricCard
              title="Cobrado"
              value={dinero(cobros.importePagado, cobros.moneda)}
              foot={`${num(cobros.pagados)} de ${num(cobros.total)} cobros`}
            />
            <MetricCard
              title="Sin cobrar"
              value={dinero(cobros.importePendiente, cobros.moneda)}
              foot={`${num(cobros.pendientes)} pendientes · ${num(cobros.fallidos)} fallidos`}
            />
          </MetricRow>

          {/* El importe medio se calculaba y no se pintaba. Es lo que convierte
              «720 € sin cobrar» en algo dimensionable: cinco cobros de ciento y
              pico, no uno enorme. Y `monedas` avisa cuando sumar sería mentir. */}
          <p className="t-xs t-tertiary">
            Cobro medio {dinero(cobros.importeMedio, cobros.moneda)}
            {cobros.monedas?.length > 1 &&
              ` · conviven ${cobros.monedas.length} monedas (${cobros.monedas.join(', ')}), así que no se suman`}
          </p>

          {cobros.proximos?.length > 0 && (
            <>
              <SectionTitle icon={Receipt}>Vencidos o a punto</SectionTitle>
              <ul className="list">
                {cobros.proximos.map((p) => (
                  <li key={p.id || `${p.client_id}-${p.period_end}`} className="list-row">
                    <span className={`badge badge-${p.faltan < 0 ? 'bad' : 'warn'}`}>
                      {p.faltan < 0 ? `${-p.faltan} d de retraso` : `en ${p.faltan} d`}
                    </span>
                    {/*
                      DE QUIÉN es, que es lo que hace accionable esta lista.
                      `cuenta` es el ENTRENADOR: del cliente final no sale ni un
                      nombre, y con quien se habla de un impago es con quien
                      cobra. `etiqueta` es el rótulo de la fila en SU Notion o su
                      Stripe, para que pueda encontrarla cuando se lo cuentes.
                    */}
                    <div className="grow" style={{ minWidth: 0 }}>
                      <strong>{p.cuenta || 'Cuenta desconocida'}</strong>
                      <div className="t-xs t-tertiary">
                        {p.etiqueta ? `${p.etiqueta} · ` : ''}
                        vence {p.period_end}
                      </div>
                    </div>
                    <strong>{dinero(p.amount, p.currency)}</strong>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </Panel>

    <Panel title="Clientes finales e invitaciones">
      <MetricRow>
        <MetricCard
          title="Clientes"
          value={num(movimiento?.total)}
          foot={`${num(movimiento?.archivados)} archivados`}
        >
          {/* Las altas por semana. `movimientoClientes` las devuelve y no las
              leía nadie: «22 clientes» es un saldo y no dice si están entrando
              o si el número lleva parado dos meses. */}
          <div className="widget-spark">
            <Sparkline points={(movimiento?.altas || []).map((s) => ({ value: s.altas }))} bars />
          </div>
        </MetricCard>
        <MetricCard
          title="Invitaciones"
          value={num(invitaciones?.canjeadas)}
          foot={
            `${num(invitaciones?.creadas)} creadas · ` +
            `${num(invitaciones?.pendientes)} sin canjear · ` +
            `${num(invitaciones?.caducadas)} caducadas`
          }
        />
      </MetricRow>
    </Panel>
  </>
  );
};

/* ══ Lo que dicen ═══════════════════════════════════════════════════════════
   La información más cara que se recibe: alguien se paró a escribirla. */

export const Tickets = ({ tickets = [] }) => (
  <Panel title="Soporte" sub={`${tickets.length} ticket(s)`}>
    {tickets.length === 0 ? (
      <Notice tone="info">Ningún ticket.</Notice>
    ) : (
      <ul className="list">
        {tickets.map((t) => (
          <li key={t.id} className="list-row">
            <span className={`badge badge-${t.status === 'open' ? 'warn' : 'ok'}`}>{t.status}</span>
            <div className="grow" style={{ minWidth: 0 }}>
              {/* El asunto LITERAL, no una categoría: es lo que se contesta. Y
                  con quién lo escribió, porque un ticket sin nombre no se puede
                  contestar. */}
              <strong>{t.subject}</strong>
              <div className="t-xs t-tertiary">
                {t.quien || 'sin nombre'} · {String(t.created_at).slice(0, 10)}
              </div>
            </div>
          </li>
        ))}
      </ul>
    )}
  </Panel>
);

/* ══ Qué se rompe ═══════════════════════════════════════════════════════════ */

const bytes = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  if (v < 1024) return `${v} B`;
  if (v < 1048576) return `${Math.round(v / 1024)} KB`;
  return `${Math.round((v / 1048576) * 10) / 10} MB`;
};

const ORDEN_VOLUMEN = {
  tabla: (v) => v.tabla,
  filas: (v) => v.filas,
  bytes: (v) => v.bytes,
  /* La columna que de verdad importa —la señal de `auditoria.md` §1.4— y la
     única que no está en los datos: se calcula para ordenar igual que se
     calcula para pintar. */
  porFila: (v) => (v.filas > 0 ? v.bytes / v.filas : null),
};

export const Salud = ({ fallos = [], volumen = [], fallosDia = [], ventanaDias = 30 }) => {
  const orden = useOrden();
  const volumenOrdenado = useMemo(
    () => ordenar(volumen, orden, ORDEN_VOLUMEN),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [volumen, orden.campo, orden.sentido]
  );

  return (
  <Panel title="Qué se rompe" sub={`${fallos.length} fallo(s) distintos en ${ventanaDias} días`}>
    {/*
      Cuándo empezó. `fallosDia` se calculaba, viajaba por la red y no lo pintaba
      nadie, y es la mitad de la pregunta: una lista de fallos dice QUÉ se rompe
      y no dice si lleva un mes roto o empezó anteayer —que es lo que decide si
      hay que mirar el último despliegue—.
    */}
    {fallosDia.length > 1 && (
      <>
        <SectionTitle icon={Activity}>Cuándo se rompió</SectionTitle>
        <div className="widget-spark">
          <Sparkline points={fallosDia.map((d) => ({ value: d.veces }))} bars />
        </div>
        <p className="t-xs t-tertiary">
          Del {fallosDia[0].dia} al {fallosDia[fallosDia.length - 1].dia} · máximo{' '}
          {num(Math.max(...fallosDia.map((d) => d.veces)))} en un día
        </p>
      </>
    )}

    {fallos.length === 0 ? (
      <Notice tone="success">Ningún fallo registrado en la ventana.</Notice>
    ) : (
      <ul className="list">
        {/*
          Ordenados por CUENTAS AFECTADAS, no por veces, y llegan así del
          análisis. Es la regla más importante de esta sección: un fallo que le
          ocurre doscientas veces a una persona es un caso raro suyo; uno que le
          ocurre una vez a seis personas es un error del producto. Con el orden
          por veces, el segundo no aparece nunca en la primera pantalla.
        */}
        {fallos.map((f) => (
          <li key={`${f.source}|${f.ruta}|${f.code}|${f.message}`} className="list-row">
            <span className="badge badge-bad">{num(f.cuentas)} cuenta(s)</span>
            <div className="grow" style={{ minWidth: 0 }}>
              <strong>{f.message}</strong>
              <div className="t-xs t-tertiary">
                {f.ruta} · {f.source} · {f.roles} · {num(f.veces)} veces · último{' '}
                {String(f.ultimo).slice(0, 10)}
              </div>
            </div>
          </li>
        ))}
      </ul>
    )}

    {volumen.length > 0 && (
      <>
        <SectionTitle icon={Database}>Volumen por tabla</SectionTitle>
        <div className="table-scroll">
          <table className="table table-compact">
            <thead>
              <tr>
                <ThOrden orden={orden} campo="tabla">Tabla</ThOrden>
                <ThOrden orden={orden} campo="filas" num>Filas</ThOrden>
                <ThOrden orden={orden} campo="bytes" num>Tamaño</ThOrden>
                <ThOrden orden={orden} campo="porFila" num>Por fila</ThOrden>
              </tr>
            </thead>
            <tbody>
              {volumenOrdenado.map((v) => (
                <tr key={v.tabla}>
                  <td>{v.tabla}</td>
                  <td className="num">{num(v.filas)}</td>
                  <td className="num">{bytes(v.bytes)}</td>
                  {/* La señal que `auditoria.md` §1.4 dejó pendiente: cuando los
                      bytes por fila de `workout_data` se acerquen al megabyte,
                      cada ráfaga de teclas con debounce mueve un megabyte. */}
                  <td className="num">{v.filas > 0 ? bytes(v.bytes / v.filas) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    )}
  </Panel>
  );
};

/* ══ Qué se usa, y sobre todo qué NO ════════════════════════════════════════ */

const ORDEN_PANTALLAS = {
  nombre: (p) => p.nombre,
  veces: (p) => p.veces,
  cuentas: (p) => p.cuentas,
};

const ORDEN_CAMPOS = {
  campo: (c) => c.campo,
  veces: (c) => c.veces,
  pct: (c) => c.pct,
};

/* ══ El embudo, y por qué vuelve ═════════════════════════════════════════════

   `scripts/radiografia/informe.mjs` lo quitó a propósito —«esto es una hoja de
   registro, no un cuadro de mando»— y daba una razón concreta: con cuatro
   cuentas «el 13 % tiene portal» son 2 de 15, o sea que el porcentaje divide y
   borra los nombres. Era verdad y no es un capricho que se pueda ignorar.

   Vuelve porque hoy son veinte equipos, y sobre todo vuelve CORREGIDO por lo
   que aquella regla protegía de verdad:

     · **La cifra absoluta manda.** «12 de 20», no «60 %». El porcentaje solo
       decide el ancho de la barra, que es donde un porcentaje sí sirve —para
       comparar de un vistazo— y donde no puede mentir sobre el tamaño de la
       muestra.
     · **La caída va al lado**, que es la única cifra del embudo que dice dónde
       trabajar. Un 20 % final puede ser una fuga enorme en el paso 2 o cuatro
       fugas repartidas, y el porcentaje sobre el total no distingue esos dos
       casos —que piden cosas distintas—.
     · **No se nombra el peor paso.** Sería un veredicto, y los veredictos los
       da `diagnosticos.js`, no esta pantalla. Aquí están las cinco cifras y se
       ven las cinco. */

const Embudo = ({ pasos = [] }) => {
  if (pasos.length === 0) return null;
  const total = pasos[0].cuentas;

  return (
    <>
      <SectionTitle icon={Filter}>Hasta dónde llega una cuenta</SectionTitle>
      <div className="embudo">
        {pasos.map((paso, i) => (
          <div className="meter-row" key={paso.hito}>
            <span className="meter-label">{paso.hito}</span>
            <div className="meter-track">
              <div className="meter-fill" style={{ width: `${Math.min(100, paso.pct)}%` }}>
                {paso.cuentas > 0 ? paso.cuentas : ''}
              </div>
            </div>
            {/* El primer paso es el denominador: no se cae de ningún sitio. */}
            <span className="embudo-caida t-xs t-tertiary">
              {i === 0 ? `de ${num(total)}` : paso.caida > 0 ? `−${num(paso.caida)} aquí` : 'sin caída'}
            </span>
          </div>
        ))}
      </div>
      <p className="t-xs t-tertiary embudo-pie">
        Sobre {num(total)} cuenta{total === 1 ? '' : 's'}. La barra es la proporción; la cifra de
        dentro son cuentas, y la de la derecha las que se quedan en ese paso.
      </p>
    </>
  );
};

/* ══ La retención ═══════════════════════════════════════════════════════════
   De las cuentas activas una semana, cuántas siguen activas a la siguiente. Es
   la pregunta que decide si esto es un producto o una demo: sin retención, cada
   venta hay que volver a hacerla.

   Se pinta con la misma corrección que el embudo —«de 17 volvieron 11», no «el
   65 %»— porque con veinte cuentas la diferencia entre el 60 y el 65 % es UNA
   persona, y un porcentaje la disfraza de tendencia. */

const Retencion = ({ semanas = [] }) => {
  if (semanas.length === 0) return null;
  const ultima = semanas[semanas.length - 1];

  return (
    <>
      <SectionTitle icon={TrendingUp}>Quién vuelve a la semana siguiente</SectionTitle>
      {/* Con menos de dos puntos no se dibuja NADA, ni el hueco: una
          «tendencia» de un punto es una raya horizontal que sugiere estabilidad
          donde no hay información, y `Sparkline` ya devuelve null. Lo que hay
          que quitar además es su caja, o queda un hueco vacío con margen que
          separa el título de la frase que sí explica lo que pasa.

          Es distinto del hueco de una tarjeta de métrica, que sí es deliberado:
          allí la fila entera se compara y el vacío informa. Aquí no hay fila. */}
      {semanas.length > 1 && (
        <div className="widget-spark">
          <Sparkline points={semanas.map((s) => ({ value: s.pct }))} />
        </div>
      )}
      <p className="t-sm t-secondary">
        De las {num(ultima.activas)} cuentas activas la semana del {ultima.semana}, volvieron{' '}
        <strong>{num(ultima.vuelven)}</strong> a la siguiente.
      </p>
      {semanas.length < 4 && (
        <p className="t-xs t-tertiary">
          Solo hay {semanas.length} semana{semanas.length === 1 ? '' : 's'} con las que comparar:
          todavía no es una tendencia.
        </p>
      )}
    </>
  );
};

export const Uso = ({
  eventos = [],
  pantallas = { usadas: [], sinUso: [] },
  censo,
  actividad = [],
  embudo = [],
  retencion = [],
}) => {
  const ordenPantallas = useOrden();
  const ordenCampos = useOrden();
  const [todasLasPantallas, setTodasLasPantallas] = useState(false);

  const usadas = useMemo(
    () => ordenar(pantallas.usadas || [], ordenPantallas, ORDEN_PANTALLAS),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pantallas.usadas, ordenPantallas.campo, ordenPantallas.sentido]
  );

  const campos = useMemo(
    () =>
      ordenar(
        censo
          ? [...censo.antropometria.pliegues.campos, ...censo.antropometria.perimetros.campos]
          : [],
        ordenCampos,
        ORDEN_CAMPOS
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [censo, ordenCampos.campo, ordenCampos.sentido]
  );

  return (
  <>
    {/* El embudo va PRIMERO y en su propio bloque: es la única vista que
        contesta «por dónde se cae la gente», y las demás de esta pestaña
        contestan «qué hacen los que se quedan». */}
    {(embudo.length > 0 || retencion.length > 0) && (
      <Panel title="Por dónde se cae" sub="De registrarse a tener el producto funcionando solo">
        <Embudo pasos={embudo} />
        <Retencion semanas={retencion} />
      </Panel>
    )}

    <Panel title="Qué se usa" sub={`${eventos.length} gesto(s) distintos`}>
      {/*
        La lista que decide es la SEGUNDA. Una lista de lo más usado no dice
        nada de lo que sobra, y quitar una pantalla vale más que añadir dos.
      */}
      <SectionTitle icon={EyeOff}>Pantallas que no ha abierto nadie</SectionTitle>
      {pantallas.sinUso.length === 0 ? (
        <Notice tone="success">Todas las pantallas se han abierto al menos una vez.</Notice>
      ) : (
        <div className="row gap-2 wrap">
          {pantallas.sinUso.map((p) => (
            <span key={p} className="badge badge-warn">
              {p}
            </span>
          ))}
        </div>
      )}

      {/* Cuánta gente distinta hubo cada semana. Es la serie que contesta si el
          producto se está usando más o menos, y se calculaba sin que la mirara
          nadie. Va aquí y no en los indicadores porque es una serie larga, no
          una cifra de hoy. */}
      {actividad.length > 1 && (
        <>
          <SectionTitle icon={Activity}>Cuentas activas por semana</SectionTitle>
          <div className="widget-spark">
            <Sparkline points={actividad.map((s) => ({ value: s.cuentas }))} bars />
          </div>
          <p className="t-xs t-tertiary">
            {actividad.length} semanas · de la del {actividad[0].semana} a la del{' '}
            {actividad[actividad.length - 1].semana}
          </p>
        </>
      )}

      {/*
        ── La tabla que faltaba entera ─────────────────────────────────────
        «Lo más usado» era una lista de diez cortada a cuchillo y sin poder
        ordenarse. Las dos columnas contestan preguntas distintas y por eso las
        dos tienen que poder mandar: `veces` dice qué se aporrea y `cuentas` qué
        usa MUCHA gente. Una pantalla con 800 visitas de una sola cuenta y otra
        con 80 de dieciséis no son el mismo hallazgo, y ordenadas por veces la
        segunda no sale nunca.
      */}
      <SectionTitle
        icon={Activity}
        action={
          usadas.length > 10 && (
            <button
              type="button"
              className="btn btn-plain btn-sm"
              onClick={() => setTodasLasPantallas((v) => !v)}
            >
              {todasLasPantallas ? 'Ver solo las diez primeras' : `Ver las ${usadas.length}`}
            </button>
          )
        }
      >
        Lo más usado
      </SectionTitle>
      <div className="table-scroll">
        <table className="table table-compact">
          <thead>
            <tr>
              <ThOrden orden={ordenPantallas} campo="nombre">Pantalla</ThOrden>
              <ThOrden orden={ordenPantallas} campo="cuentas" num>Cuentas</ThOrden>
              <ThOrden orden={ordenPantallas} campo="veces" num>Veces</ThOrden>
            </tr>
          </thead>
          <tbody>
            {(todasLasPantallas ? usadas : usadas.slice(0, 10)).map((p) => (
              <tr key={p.nombre}>
                <td>{p.nombre}</td>
                <td className="num">{num(p.cuentas)}</td>
                <td className="num">{num(p.veces)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/*
        Los GESTOS, que es otra pregunta que la de las pantallas: abrir la rutina
        y guardar una serie son el mismo sitio y no la misma noticia. `porEvento`
        se calculaba y esta pantalla solo contaba cuántos había para ponerlo en
        el subtítulo — el resto se tiraba.
      */}
      {eventos.length > 0 && (
        <>
          <SectionTitle icon={MousePointerClick}>Qué se hace</SectionTitle>
          <ul className="list">
            {eventos.slice(0, 12).map((e) => (
              <li key={e.nombre} className="list-row">
                <span className="grow">{e.nombre}</span>
                <span className="t-sm t-tertiary">{num(e.cuentas)} cuenta(s)</span>
                <strong>{num(e.veces)}</strong>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>

    {censo && (
      <Panel
        title="Qué se rellena de verdad"
        sub="Contado sobre lo guardado, no sobre eventos: contesta hoy y sobre todo el histórico"
      >
        <MetricRow>
          <MetricCard
            title="Con portal"
            value={num(censo.clientes.portal.pct)}
            unit="%"
            foot={`${num(censo.clientes.portal.cuantos)} de ${num(censo.clientes.total)}`}
          />
          <MetricCard
            title="Con sexo"
            value={num(censo.clientes.conSexo)}
            unit="%"
            foot="Sin ese campo la fórmula del % graso no se aplica"
          />
          <MetricCard
            title="Con programa"
            value={num(censo.programas.clientesConPrograma)}
            unit="%"
            foot={`mediana de ${num(censo.programas.microciclosMediana)} microciclos`}
          />
          <MetricCard
            title="Check-in contestado"
            value={num(censo.revision.horasMediana)}
            unit="h"
            foot={`${num(censo.revision.sinContestar)} sin contestar hace +7 días`}
          />
        </MetricRow>

        {/*
          ── La otra mitad del censo, que se calculaba y no se pintaba ───────
          `censo` trae cinco bloques y la pantalla enseñaba cuatro cifras
          sueltas de dos de ellos. Nutrición entera, fotos entera, y la mitad de
          programas y de revisión se quedaban en el JSON. Cada una de estas
          contesta «¿esta parte del producto la usa alguien?», que es la
          pregunta que decide qué se mantiene.
        */}
        <SectionTitle icon={Ruler}>Por partes</SectionTitle>
        <MetricRow>
          <MetricCard
            title="Con plan de dieta"
            value={num(censo.nutricion.clientesConPlan)}
            unit="%"
            foot={`${num(censo.nutricion.conObjetivo)} % con objetivo de kcal`}
          />
          <MetricCard
            title="Con foto"
            value={num(censo.fotos.clientesConAlguna)}
            unit="%"
            foot={`${num(censo.fotos.total)} fotos en total`}
          />
          <MetricCard
            title="Sesiones programadas"
            value={num(censo.programas.sesiones)}
            foot={`${num(censo.programas.conCalentamiento)} % con calentamiento`}
          />
          <MetricCard
            title="Check-ins contestados"
            value={num(censo.revision.pctRevisados)}
            unit="%"
            foot={`${num(censo.revision.revisados)} de ${num(censo.revision.entregados)} entregados`}
          />
        </MetricRow>

        <MetricRow>
          <MetricCard
            title="Con fecha de inicio"
            value={num(censo.clientes.conFechaInicio)}
            unit="%"
            foot={`${num(censo.clientes.activos)} activos · ${num(censo.clientes.archivados)} archivados`}
          />
          <MetricCard
            title="Medidas por cliente"
            value={num(censo.antropometria.registrosPorCliente)}
            foot={`${num(censo.antropometria.clientesConAlguno)} % tiene alguna medida`}
          />
        </MetricRow>

        {/*
          La unidad es el REGISTRO, no el cliente: «el 4 % de las revisiones
          incluye el pliegue de pantorrilla» decide si el campo se queda; «el
          30 % de los clientes lo ha medido alguna vez» no decide nada.

          Y se ordena, que es lo que la hace servir: la pregunta real de esta
          tabla es «¿cuáles están a cero?», y para contestarla había que
          leérsela entera porque llega en el orden del formulario.
        */}
        <SectionTitle icon={Ruler}>
          Campos de medida, sobre {num(censo.antropometria.registros)} registros
        </SectionTitle>
        <div className="table-scroll">
          <table className="table table-compact">
            <thead>
              <tr>
                <ThOrden orden={ordenCampos} campo="campo">Campo</ThOrden>
                <ThOrden orden={ordenCampos} campo="veces" num>Veces</ThOrden>
                <ThOrden orden={ordenCampos} campo="pct" num>%</ThOrden>
              </tr>
            </thead>
            <tbody>
              {campos.map((c) => (
                <tr key={c.campo}>
                  <td>{c.campo}</td>
                  <td className="num">{num(c.veces)}</td>
                  <td className="num">{num(c.pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    )}
  </>
  );
};

/* ══ La pantalla ════════════════════════════════════════════════════════════ */

/**
 * Las pestañas del detalle, con la cifra que hace que sirvan sin entrar.
 *
 * Cada una lleva **lo que hay que atender ahí dentro**, no cuántas filas tiene:
 * «Dinero 5» son cinco cobros vencidos, no diecisiete cobros. Un contador de
 * filas es decoración; uno de pendientes es una razón para entrar.
 *
 * Se calcula a partir del informe ya montado —ni un umbral nuevo aquí— y por eso
 * es una función suelta y no un componente: lo único que hace es leer.
 */
export const pestañas = (informe) => {
  const vencidos = (informe.cobros?.proximos || []).filter((p) => p.faltan < 0).length;
  const criticos = (informe.seguridad || []).filter(
    (h) => h.nivel === 'critico' && !h.aceptado
  ).length;
  const nuevos = (informe.seguridad || []).filter((h) => h.nuevo).length;
  const abiertos = (informe.tickets || []).filter((t) => t.status === 'open').length;

  /* `pendiente` en cero NO pinta cifra: un «0» al lado de cada pestaña es ruido
     que enseña a no mirar las que sí llevan número. */
  const chip = (n) => (n > 0 ? ` ${n}` : '');

  return [
    { id: 'cuentas', label: `Cuentas${chip((informe.riesgo || []).length + abiertos)}` },
    { id: 'dinero', label: `Dinero${chip(vencidos)}` },
    { id: 'producto', label: `Producto${chip((informe.pantallas?.sinUso || []).length)}` },
    { id: 'salud', label: `Salud${chip((informe.fallos || []).length)}` },
    { id: 'seguridad', label: `Seguridad${chip(criticos + nuevos)}` },
  ];
};

export const PlatformPanel = () => {
  const { esAdmin, informe, cargando, error, pedir, aceptar } = useRadiografia();
  const [dias, setDias] = useState(30);
  const [vista, setVista] = useState('cuentas');

  /*
    El carril del detalle, para poder llevar el ojo hasta él desde el veredicto.
    Cambiar la pestaña sin desplazar dejaría la sección abierta media pantalla
    más abajo, fuera de la vista: se habría pulsado «Ver» y aparentemente no
    habría pasado nada.
  */
  const carril = useRef(null);
  const irA = (destino) => {
    setVista(destino);
    /* `nearest` y no `start`: el carril ya es pegajoso, así que llevarlo al
       borde superior lo metería justo debajo de sí mismo. */
    carril.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  /* Mientras no se sabe, no se decide. Enseñar el «no es para ti» durante el
     instante que tarda la comprobación es peor que no enseñar nada. */
  if (esAdmin === null) return <Loading label="Comprobando…" />;

  if (!esAdmin) {
    return (
      <div className="stack">
        <PageHead title="Plataforma" />
        <EmptyState
          icon={Ban}
          title="Esto no es para tu cuenta"
          message="La radiografía la ve quien administra la plataforma."
        />
      </div>
    );
  }

  const cambiarVentana = (nuevos) => {
    setDias(nuevos);
    /* Solo se vuelve a pedir si ya había un informe: si no, cambiar de ventana
       antes de pedir el primero dispararía la petición más cara sin haberlo
       pedido nadie. */
    if (informe) pedir({ dias: nuevos });
  };

  return (
    /*
      ══ `stack`, que es lo que faltaba ══════════════════════════════════════

      Esta pantalla devolvía un fragmento suelto, y `.layout` —el contenedor de
      la aplicación— no reparte aire entre sus hijos: lo pone cada pantalla con
      `.stack`, que es lo que hacen las otras once. Sin él, la cabecera, el
      carril, el veredicto y los ocho paneles salían pegados unos a otros: no
      era que faltara un margen aquí o allá, es que la pantalla no tenía ritmo
      vertical y por eso se leía como un volcado y no como un informe.
    */
    <div className="stack">
      <PageHead
        title="Radiografía"
        sub={
          informe
            ? `${informe.proyecto} · ${new Date(informe.generado).toLocaleString('es-ES')}`
            : 'Qué se usa, qué se rompe, qué se rellena y por dónde se entra'
        }
        action={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => pedir({ dias })}
            disabled={cargando}
          >
            <Play size={15} />
            {cargando ? 'Leyendo…' : informe ? 'Volver a leer' : 'Generar informe'}
          </button>
        }
      />

      <RangeChips value={dias} onChange={cambiarVentana} options={VENTANAS} label="Ventana" />

      {/* El error trae con qué reintentar. Sin eso, la única salida de un corte
          de red es subir a buscar el botón de la cabecera, y en la pantalla que
          más tarda en contestar eso se lee como que se ha roto del todo. */}
      {error && (
        <Notice
          tone="error"
          action={
            <button
              type="button"
              className="btn btn-plain btn-sm"
              onClick={() => pedir({ dias })}
              disabled={cargando}
            >
              Reintentar
            </button>
          }
        >
          {error}
        </Notice>
      )}

      {cargando && !informe && (
        <Loading label="Leyendo dieciocho tablas y el catálogo de la base…" />
      )}

      {!informe && !cargando && !error && (
        /* La acción va TAMBIÉN aquí, y no solo en la cabecera: el vacío es lo
           único que hay en pantalla y es donde está mirando quien acaba de
           entrar. Es el mismo patrón que «Todavía no tienes clientes». */
        <EmptyState
          icon={Stethoscope}
          title="Sin generar"
          message="El informe lee dieciocho tablas enteras y las dos funciones de catálogo. Tarda unos segundos y no se pide solo."
          action={
            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={() => pedir({ dias })}
            >
              <Play size={17} /> Generar informe
            </button>
          }
        />
      )}

      {informe && (
        /*
          ══ Mientras se relee, lo que hay en pantalla NO es lo que se ha pedido ══

          Cambiar la ventana vuelve a pedir el informe entero y eso tarda varios
          segundos. Hasta ahora, en ese rato el chip ya decía «7 días» y debajo
          seguían intactas las cifras de 30: el peor estado posible de un informe,
          que no es estar vacío sino contestar con seguridad a otra pregunta.

          Se apaga y se marca `aria-busy`, que es lo que hace que un lector de
          pantalla no lea una tabla que está a punto de cambiar entera.
        */
        <div
          className={cargando ? 'stack is-releyendo' : 'stack'}
          aria-busy={cargando || undefined}
        >
          {cargando && <Loading label="Actualizando el informe…" />}

          <Veredicto
            diagnosticos={informe.diagnosticos}
            resumen={informe.resumen}
            onIr={irA}
          />

          <GroupHead
            title="Los indicadores"
            sub={
              informe.comparadoCon
                ? `Comparado con el informe del ${new Date(informe.comparadoCon).toLocaleDateString('es-ES')}`
                : 'Todavía no hay con qué comparar: éste es el primero'
            }
          />
          <Indicadores
            metricas={informe.metricas}
            series={informe.series}
            cambios={informe.cambios}
          />

          {/*
            ══ El detalle va en pestañas, y no en una pila ═══════════════════

            Eran ocho paneles seguidos, o sea metro y medio de scroll donde la
            pregunta que traías se perdía por el camino. Y las ocho no compiten
            entre sí: se abre esto sabiendo si vienes a mirar el dinero o a
            mirar qué se rompe.

            Es el «nivel 2, carril de chips» de `producto.md` §5.5. El de
            arriba —la ventana de tiempo— es un control del informe, no
            navegación: por eso uno es `RangeChips` y este es `SegmentedControl`,
            que es la forma que el producto usa para «enséñame esta vista».

            La cifra al lado de cada pestaña es la que hace que sirva sin
            entrar: se puede ver que hay 5 cobros vencidos sin abrir «Dinero».

            ── Y el carril se queda ────────────────────────────────────────
            Lo que hay dentro de cada pestaña son tablas largas —la de cuentas
            sola pasa de una pantalla—, así que al llegar al final el carril
            estaba tres pantallas más arriba, por encima de los seis
            indicadores. Un mapa que hay que ir a buscar deja de ser un mapa.
            Es lo mismo que `.page-nav` resolvió en el protocolo, con la misma
            factura de cristal.
          */}
          <GroupHead title="El detalle" />

          <div className="tab-rail" ref={carril}>
            <SegmentedControl
              value={vista}
              onChange={setVista}
              label="Qué mirar"
              ancho
              options={pestañas(informe)}
            />
          </div>

          {vista === 'cuentas' && (
            <>
              <Cuentas cuentas={informe.cuentas} riesgo={informe.riesgo} />
              <Tickets tickets={informe.tickets} />
            </>
          )}

          {vista === 'dinero' && (
            <Dinero
              planes={informe.planes}
              cobros={informe.cobros}
              pruebas={informe.pruebas}
              invitaciones={informe.invitaciones}
              movimiento={informe.movimiento}
              negocio={informe.negocio}
            />
          )}

          {vista === 'producto' && (
            <Uso
              eventos={informe.eventos}
              pantallas={informe.pantallas}
              censo={informe.censo}
              actividad={informe.actividad}
              embudo={informe.embudo}
              retencion={informe.retencion}
            />
          )}

          {vista === 'salud' && (
            <Salud
              fallos={informe.fallos}
              volumen={informe.volumen}
              fallosDia={informe.fallosDia}
              ventanaDias={informe.ventanaDias}
            />
          )}

          {vista === 'seguridad' && (
            <Seguridad
              hallazgos={informe.seguridad}
              aviso={informe.avisoSeguridad}
              onAceptar={aceptar}
              dias={dias}
            />
          )}

          {/*
            Lo que no se ha podido leer va al final y NO se calla: sin esto, un
            cero de una tabla que falló se lee igual que un cero de verdad.
          */}
          {informe.avisos?.length > 0 && (
            <Panel title="Lo que no se ha podido leer">
              <SectionTitle icon={ShieldAlert}>
                Un cero de arriba puede ser un hueco
              </SectionTitle>
              <ul className="list">
                {informe.avisos.map((a) => (
                  <li key={a} className="list-row">
                    <span className="t-sm t-secondary">{a}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      )}
    </div>
  );
};
