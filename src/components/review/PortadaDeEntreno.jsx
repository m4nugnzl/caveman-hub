import { useMemo, useState } from 'react';
import { ChevronRight, Pencil } from 'lucide-react';
import { Link } from 'react-router-dom';

import { blockSummary, blocksOf } from '@/domain/blocks';
import { borradoresDe } from '@/domain/borradores';
import { directionById } from '@/domain/goals';
import {
  bandasDeFase,
  gruposPorBloque,
  lineaDeLaReferencia,
  proponerReferencias,
  referenciasAEnsenar,
  tonelaje,
} from '@/domain/lenteDeEntreno';
import { metricColor } from '@/domain/metrics';
import { tramoDeFechas } from '@/domain/semanasDelPlan';
import { localeNumber, shortDate } from '@/lib/dates';
import { semanaPath } from '@/routes';
import { CANAL, partir } from './geometriaDeTiras';

/**
 * REVISIONES, LA LENTE DE ENTRENO: las mismas tiras, contando otra cosa.
 *
 * ══ La forma ════════════════════════════════════════════════════════════════
 *
 *     ┌ SUS SEMANAS ──────────────────────── [Nutrición | Entreno] ┐
 *     │ ─ Bloque 3 · Intensificación   2 mar – 18 may · 8 microciclos │
 *     │                                38 de 40 entrenos · 412 t      │
 *     │   ▔▔▔ Definición ▔▔▔▔▔▔▔▔▔  (la fase, banda fina de fondo)    │
 *     │      ▁▃▅▆▇▆▅▃           (tonelaje, una columna por semana)    │
 *     │           ●●●●○         (los entrenos, solo si faltó alguno)  │
 *     │   [S19][S20][S21]…      (las casillas, las mismas de siempre) │
 *     │   Press banca  ╱‾  100 → 110 kg   (los de referencia)         │
 *     └────────────────────────────────────────────────────────────────┘
 *
 * ── Por qué AQUÍ la unidad es el BLOQUE y no la fase ───────────────────────
 * Porque son dos preguntas distintas sobre el mismo calendario. La lente de
 * Nutrición agrupa por FASE: lo que se lee es la dirección del peso, y una
 * fase es esa decisión. Aquí se lee el entrenamiento, y la decisión de
 * entrenamiento es el BLOQUE —sus hojas, su secuencia, sus semanas—. La fase
 * no desaparece: se queda de fondo, en banda fina, para no perder en qué parte
 * de la temporada caía cada bloque.
 *
 * ── Un solo color, y no codifica nada ──────────────────────────────────────
 * Todas las semanas hechas van del mismo color. La altura ya dice cuánto se
 * levantó y la hilera de puntos ya dice si faltó algún entreno; teñir además
 * por «bien» o «mal» sería el veredicto que esta pantalla no da. Ver la ley
 * del color: el azul invita, el semáforo juzga, y aquí no se juzga.
 *
 * ── La hilera señala EXCEPCIONES ───────────────────────────────────────────
 * Una semana cumplida no lleva puntos. Ponerlos en todas convertiría el dato
 * en decoración: con quince semanas llenas de ●●●●● nadie ve la que tiene un
 * hueco, que es justo lo único que había que ver.
 */

const color = (direccion) => directionById(direccion)?.color || 'var(--text-tertiary)';
const TINTA = metricColor('tonnage');

/* El alto de la caja de columnas. Fijo y compartido: dos bloques con el mismo
   tonelaje tienen que dibujar la misma altura, o compararlos sería mirar dos
   escalas y creer que es una. */
const ALTO = 92;
const TECHO = 14;

/* ── La hilera de entrenos ───────────────────────────────────────────────── */
/*
  ●●●●○ — cuatro de cinco. Es un dibujo y no un «4/5» porque lo que se lee de
  un vistazo en una fila de quince semanas es cuántos huecos hay, no la
  fracción; la fracción va en el texto accesible, que es donde se pregunta.
*/
const Hilera = ({ hechas, pedidos }) => {
  if (pedidos === null || pedidos === undefined || hechas >= pedidos) return <span className="entreno-hilera" />;
  return (
    <span className="entreno-hilera" title={`${hechas} de ${pedidos} entrenos`}>
      {Array.from({ length: pedidos }, (_, i) => (
        <i key={i} className={`entreno-punto${i < hechas ? ' is-hecho' : ''}`} aria-hidden="true" />
      ))}
    </span>
  );
};

/* ── La casilla ─────────────────────────────────────────────────────────── */
const Casilla = ({ s, dato, clientId, compacta, senalada, onSenalar }) => {
  const futura = s.revision5 === 'futura';
  const kg = dato?.tonelaje || 0;

  return (
    <Link
      to={semanaPath(clientId, s.lunes)}
      className={`casilla is-${s.revision5}${compacta ? ' is-compacta' : ''}${senalada ? ' is-senalada' : ''}`}
      aria-label={[
        `Semana ${s.numero ?? ''} del ${shortDate(s.lunes)}`,
        kg > 0 ? `${tonelaje(kg)} levantados` : futura ? 'todavía no' : 'sin entrenos anotados',
        dato?.pedidos ? `${dato.hechas} de ${dato.pedidos} entrenos` : null,
      ]
        .filter(Boolean)
        .join(', ')}
      onMouseEnter={() => onSenalar(s.lunes)}
      onMouseLeave={() => onSenalar(null)}
      onFocus={() => onSenalar(s.lunes)}
      onBlur={() => onSenalar(null)}
    >
      <span className="casilla-cab">
        <b className="casilla-n">{s.numero ? `S${s.numero}` : shortDate(s.lunes)}</b>
        {s.estado === 'hoy' && <span className="casilla-marca is-hoy" aria-hidden="true">hoy</span>}
      </span>
      {!compacta && <span className="casilla-fecha">{shortDate(s.lunes)}</span>}
      <span className={`casilla-kg${kg > 0 ? '' : ' is-esperado'}`}>{kg > 0 ? tonelaje(kg) : '—'}</span>
    </Link>
  );
};

/* ── Las columnas de un tramo ───────────────────────────────────────────── */
const Columnas = ({ semanas, datos, col, tope, senalada, onSenalar, onAbrir }) => {
  const W = CANAL + semanas.length * col;
  const H = ALTO + TECHO + 6;
  const alto = (kg) => (tope > 0 ? Math.max(kg > 0 ? 1.5 : 0, (kg / tope) * ALTO) : 0);
  const bandas = bandasDeFase(semanas);

  return (
    <svg className="tira-svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      {/* La fase, de fondo: banda fina arriba con su tinta y su nombre. Un
          tramo SIN fase no pinta banda: una barra gris sin rótulo no dice
          «aquí no había fase», dice «aquí hay algo que no sé leer». */}
      {bandas.filter((b) => b.fase).map((b) => (
        <g key={`${b.id ?? 'sin'}-${b.desde}`} style={{ '--c': color(b.fase?.direction) }}>
          <rect
            className="entreno-fase"
            x={CANAL + col * b.desde + 1}
            y={0}
            width={col * (b.hasta - b.desde + 1) - 2}
            height={5}
            rx="2"
          />
          {b.fase && col * (b.hasta - b.desde + 1) > 64 && (
            <text className="entreno-fase-t" x={CANAL + col * b.desde + 4} y={TECHO - 2}>
              {b.fase.title}
            </text>
          )}
        </g>
      ))}

      {/* La raya del tope, con su cifra en el canal: la única del eje. Con más
          rayas esto sería una gráfica de precisión, y es una de forma. */}
      {tope > 0 && (
        <>
          <line className="entreno-tope" x1={CANAL} x2={W} y1={TECHO} y2={TECHO} />
          <text className="progreso-eje-y entreno-tope-t" x={CANAL - 8} y={TECHO} textAnchor="end" dominantBaseline="middle">
            {tonelaje(tope)}
          </text>
        </>
      )}

      {semanas.map((s, i) => {
        const d = datos.get(s.lunes);
        const h = alto(d?.tonelaje || 0);
        return (
          <g key={s.lunes}>
            {s.lunes === senalada && <rect className="tira-senal" x={CANAL + col * i} y={0} width={col} height={H} />}
            {h > 0 && (
              <rect
                className={`entreno-columna${s.estado === 'hoy' ? ' is-hoy' : ''}`}
                x={CANAL + col * i + Math.max(2, col * 0.18)}
                y={TECHO + ALTO - h}
                width={col - 2 * Math.max(2, col * 0.18)}
                height={h}
                rx="1.5"
                fill={TINTA}
              />
            )}
          </g>
        );
      })}

      <line className="entreno-suelo" x1={CANAL} x2={W} y1={TECHO + ALTO} y2={TECHO + ALTO} />

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

/* ── La línea de un ejercicio de referencia ─────────────────────────────── */
/*
  Se dibuja con KILOS. El 1RM estimado existe y sirve para ordenar («100×3» y
  «100×10» son el mismo peso y dos esfuerzos), pero es una fórmula con varios
  kilos de margen y esta lente enseña cosas que pasaron.
*/
const LineaReferencia = ({ puntos, col, ancho }) => {
  const vs = puntos.map((p) => p.kg).filter((v) => Number.isFinite(v));
  const H = 26;
  if (vs.length === 0) return null;
  const lo = Math.min(...vs);
  const hi = Math.max(...vs);
  const y = (v) => (hi === lo ? H / 2 : 3 + ((hi - v) / (hi - lo)) * (H - 6));

  /* Tramos seguidos: una semana sin registro es un hueco, no una recta que lo
     atraviesa. Es la misma ley que el trazo del peso. */
  const tramos = [];
  puntos.forEach((p, i) => {
    if (!Number.isFinite(p.kg)) return;
    const ultimo = tramos[tramos.length - 1];
    if (ultimo && ultimo.fin === i - 1) {
      ultimo.fin = i;
      ultimo.puntos.push({ i, kg: p.kg });
    } else tramos.push({ fin: i, puntos: [{ i, kg: p.kg }] });
  });

  return (
    <svg className="entreno-ref-svg" width={ancho} height={H} viewBox={`0 0 ${ancho} ${H}`} aria-hidden="true">
      {tramos.map((t) => (
        <polyline
          key={t.puntos[0].i}
          className="progreso-trazo"
          points={t.puntos.map((p) => `${CANAL + col * (p.i + 0.5)},${y(p.kg)}`).join(' ')}
          fill="none"
          stroke={TINTA}
        />
      ))}
      {puntos.map((p, i) =>
        Number.isFinite(p.kg) ? (
          <circle key={p.lunes} className="progreso-pesaje" cx={CANAL + col * (i + 0.5)} cy={y(p.kg)} r="2.25" fill={TINTA} />
        ) : null
      )}
    </svg>
  );
};

/* ── Los ejercicios de referencia de un bloque ──────────────────────────── */
const Referencias = ({ program, block, client, tramos, col, referencias, propuestas, onCambiar }) => {
  const [eligiendo, setEligiendo] = useState(false);
  const lunes = useMemo(() => tramos.flat().map((s) => s.lunes), [tramos]);

  /* Todo lo que se ha entrenado en el bloque, para poder cambiarlos. Sale del
     plan, que es donde está escrito qué venía a trabajar este bloque. */
  const candidatos = useMemo(
    () => (eligiendo ? proponerReferencias(program, block, client, 40) : []),
    [eligiendo, program, block, client]
  );

  if (referencias.length === 0 && !eligiendo) return null;

  const alternar = (r) => {
    const dentro = referencias.some((x) => x.nombre === r.nombre);
    onCambiar(dentro ? referencias.filter((x) => x.nombre !== r.nombre) : [...referencias, r]);
  };

  return (
    <div className="entreno-refs">
      <div className="entreno-refs-cab">
        <span className="entreno-refs-rotulo">
          Ejercicios de referencia
          {propuestas && <small> · propuestos por series</small>}
        </span>
        <button type="button" className="cab-accion" onClick={() => setEligiendo((v) => !v)} aria-expanded={eligiendo}>
          <Pencil size={13} aria-hidden="true" /> {eligiendo ? 'Listo' : 'Cambiar'}
        </button>
      </div>

      {eligiendo && (
        <ul className="entreno-elige" aria-label="Qué ejercicios seguir en este bloque">
          {candidatos.map((r) => {
            const dentro = referencias.some((x) => x.nombre === r.nombre);
            return (
              <li key={r.nombre}>
                <button type="button" className={`chip${dentro ? ' is-on' : ''}`} onClick={() => alternar(r)} aria-pressed={dentro}>
                  {r.nombre}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {referencias.map((r) => {
        const puntos = lineaDeLaReferencia({ program, referencia: r, lunes });
        const hechos = puntos.filter((p) => Number.isFinite(p.kg));
        const a = hechos[0];
        const z = hechos[hechos.length - 1];
        /* Partida igual que las columnas: una tira larga se corta en tramos y
           la línea tiene que cortarse por el mismo sitio. */
        let i = 0;
        const porTramo = tramos.map((t) => puntos.slice(i, (i += t.length)));
        return (
          <div key={r.nombre} className="entreno-ref">
            {/* El nombre y la cifra en su renglón, y la línea debajo con el
                ancho de la tira: si la línea se estirara para dejarles sitio,
                dejaría de caer sobre la columna de su semana, que es lo único
                que la hace legible —«subió AQUÍ, en la S29»—. */}
            <div className="entreno-ref-say">
              <span className="entreno-ref-n">{r.nombre}</span>
              <span className="entreno-ref-cifra">
                {hechos.length === 0
                  ? 'sin registro en este bloque'
                  : hechos.length === 1
                    ? `${localeNumber(z.kg)} kg`
                    : `${localeNumber(a.kg)} → ${localeNumber(z.kg)} kg`}
              </span>
            </div>
            {porTramo.map((t, n) => (
              <LineaReferencia key={n} puntos={t} col={col} ancho={CANAL + t.length * col} />
            ))}
          </div>
        );
      })}
    </div>
  );
};

/* ── Un bloque ──────────────────────────────────────────────────────────── */
const Bloque = ({ grupo, program, client, datos, medida, tope, clientId, senalada, onSenalar, onAbrir, abierta, onAlternar, onReferencias }) => {
  const { semanas, bloque } = grupo;
  const block = useMemo(() => (bloque?.id ? blocksOf(program).find((b) => b.id === bloque.id) || null : null), [program, bloque?.id]);
  const resumen = useMemo(() => (block ? blockSummary(program, block, client) : null), [program, block, client]);
  const { referencias, propuestas } = useMemo(
    () => (block ? referenciasAEnsenar(program, block, client) : { referencias: [], propuestas: false }),
    [program, block, client]
  );

  const tramos = useMemo(() => partir(semanas, medida.porTira), [semanas, medida.porTira]);
  const hoy = semanas.some((s) => s.estado === 'hoy');
  const tipo = semanas.every((s) => s.estado === 'futura') ? 'futura' : hoy ? 'actual' : 'pasada';
  const plegable = tipo === 'pasada';
  const titulo = bloque?.nombre || 'Sin bloque montado';
  /* «Acumulación · Acumulación» no dice nada dos veces: la intención solo se
     añade cuando el bloque no se llama ya como ella. */
  const intencion = bloque?.intencion && bloque.intencion !== titulo ? bloque.intencion : null;
  /* Un tramo sin nada levantado no tiene columnas que dibujar, y una caja
     vacía de noventa píxeles diría que aquí hubo algo que salió a cero. Se
     queda con sus casillas. Se mira POR TRAMO y no por bloque: en el teléfono
     una tira se parte en varias y la mitad futura no tiene nada que enseñar. */
  const hayColumnas = (tramo) => tramo.some((s) => (datos.get(s.lunes)?.tonelaje || 0) > 0);

  const cifras = [];
  if (resumen) {
    cifras.push(['Entrenos', `${resumen.hechas} de ${resumen.planificadas}`, null]);
    cifras.push(['Levantado', tonelaje(resumen.kg), null]);
    if (resumen.extra > 0) cifras.push(['De más', String(resumen.extra), null]);
  }

  return (
    <section className={`historial-bloque tira-fase tira-bloque is-${tipo}`}>
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
            {tramoDeFechas(grupo.desde, grupo.hasta)} · {semanas.length}{' '}
            {semanas.length === 1 ? 'semana' : 'semanas'}
            {intencion ? ` · ${intencion}` : ''}
          </span>
        </div>
        <div className="tira-cab-derecha">
          <dl className="historial-cifras">
            {cifras.map(([dt, dd]) => (
              <div key={dt}>
                <dt>{dt}</dt>
                <dd>{dd}</dd>
              </div>
            ))}
          </dl>
        </div>
      </header>

      {abierta &&
        tramos.map((tramo) => (
          <div key={tramo[0].lunes} className="tira">
            {hayColumnas(tramo) && (
              <Columnas
                semanas={tramo}
                datos={datos}
                col={medida.col}
                tope={tope}
                senalada={senalada}
                onSenalar={onSenalar}
                onAbrir={onAbrir}
              />
            )}
            <div
              className="entreno-hileras"
              style={{ gridTemplateColumns: `repeat(${tramo.length}, ${medida.col}px)`, paddingLeft: CANAL }}
            >
              {tramo.map((s) => {
                const d = datos.get(s.lunes);
                return <Hilera key={s.lunes} hechas={d?.hechas || 0} pedidos={s.estado === 'futura' ? null : d?.pedidos ?? null} />;
              })}
            </div>
            <div
              className="tira-casillas"
              style={{ gridTemplateColumns: `repeat(${tramo.length}, ${medida.col}px)`, paddingLeft: CANAL }}
            >
              {tramo.map((s) => (
                <Casilla
                  key={s.lunes}
                  s={s}
                  dato={datos.get(s.lunes)}
                  clientId={clientId}
                  compacta={medida.compacta}
                  senalada={s.lunes === senalada}
                  onSenalar={onSenalar}
                />
              ))}
            </div>
          </div>
        ))}

      {abierta && block && (
        <Referencias
          program={program}
          block={block}
          client={client}
          tramos={tramos}
          col={medida.col}
          referencias={referencias}
          propuestas={propuestas}
          onCambiar={(lista) => onReferencias(block.id, lista)}
        />
      )}
    </section>
  );
};

/* ── Un bloque en BORRADOR: contorno y nada más ─────────────────────────── */
/*
  Sin columnas y sin cifras, porque no hay nada que contar todavía: un borrador
  no tiene fechas ni microciclos, solo cuántos se piensan montar. Dibujarle una
  columna a cero diría que entrenó cero, que es mentira; dejarlo fuera de la
  lista escondería que hay algo decidido detrás.
*/
const Borrador = ({ borrador, medida }) => (
  <section className="historial-bloque tira-fase tira-bloque is-borrador">
    <header className="historial-cab">
      <div className="historial-say">
        <span className="historial-nombre is-quieto">{borrador.name}</span>
        <span className="historial-cuando">
          En borrador · {borrador.plannedWeeks} {borrador.plannedWeeks === 1 ? 'microciclo' : 'microciclos'}
          {borrador.sessions?.length ? ` · ${borrador.sessions.length} hojas` : ' · sin hojas todavía'}
        </span>
      </div>
    </header>
    <div className="tira">
      <div
        className="tira-casillas"
        style={{
          gridTemplateColumns: `repeat(${Math.min(borrador.plannedWeeks, medida.porTira)}, ${medida.col}px)`,
          paddingLeft: CANAL,
        }}
      >
        {Array.from({ length: Math.min(borrador.plannedWeeks, medida.porTira) }, (_, i) => (
          <span key={i} className="casilla is-contorno" aria-hidden="true" />
        ))}
      </div>
    </div>
  </section>
);

/* ── La lente ───────────────────────────────────────────────────────────── */
export const PortadaDeEntreno = ({
  program,
  client,
  semanas = [],
  datos,
  medida,
  clientId,
  senalada,
  onSenalar,
  onAbrir,
  onReferencias,
}) => {
  const [plegado, setPlegado] = useState(null);
  const grupos = useMemo(() => gruposPorBloque(semanas), [semanas]);
  const borradores = useMemo(() => borradoresDe(program), [program]);

  /* UN tope para todas las tiras del cliente: es lo que hace que dos bloques se
     puedan comparar de un vistazo. La misma ley que los píxeles por kilo de la
     lente de Nutrición: se comparte la proporción. */
  const tope = useMemo(() => {
    let mayor = 0;
    for (const d of datos.values()) mayor = Math.max(mayor, d.tonelaje || 0);
    return mayor;
  }, [datos]);

  /*
    El último bloque con entrenos anotados se abre solo, aunque ya sea pasado.
    Sin esto, un cliente cuyo bloque acabó la semana pasada abría la lente con
    todo plegado: tres cabeceras y ni una columna, o sea el dibujo escondido
    detrás de un triángulo. La lente de Nutrición hace lo mismo con la fase que
    tiene una semana pendiente.
  */
  const ultimoConDatos = useMemo(() => {
    const conDatos = grupos.filter((g) => g.semanas.some((s) => (datos.get(s.lunes)?.tonelaje || 0) > 0));
    return conDatos[conDatos.length - 1]?.clave ?? null;
  }, [grupos, datos]);

  const esAbierta = (g) => {
    const pasada = g.semanas.every((s) => s.estado === 'pasada');
    if (!pasada) return true;
    if (plegado?.clientId === clientId) return plegado.abiertas.has(g.clave);
    return g.clave === ultimoConDatos;
  };
  const alternar = (g) => {
    const abiertas = new Set(grupos.filter(esAbierta).map((x) => x.clave));
    if (abiertas.has(g.clave)) abiertas.delete(g.clave);
    else abiertas.add(g.clave);
    setPlegado({ clientId, abiertas });
  };

  return (
    <>
      {grupos.map((g) => (
        <Bloque
          key={g.clave}
          grupo={g}
          program={program}
          client={client}
          datos={datos}
          medida={medida}
          tope={tope}
          clientId={clientId}
          senalada={senalada}
          onSenalar={onSenalar}
          onAbrir={onAbrir}
          abierta={esAbierta(g)}
          onAlternar={() => alternar(g)}
          onReferencias={onReferencias}
        />
      ))}
      {borradores.map((b) => (
        <Borrador key={b.id} borrador={b} medida={medida} />
      ))}
    </>
  );
};
