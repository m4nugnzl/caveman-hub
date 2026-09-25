import { Fragment, useMemo, useRef, useState } from 'react';
import { Coffee, Sun, Trophy, UtensilsCrossed } from 'lucide-react';

import { MAX_MICROCICLOS, loQueDiceLaSemana, microTexto, partirEnTiras } from '@/domain/creadorDelPlan';
import { weekFromStart } from '@/domain/photos';
import { ritmoTexto, tramoDeFechas } from '@/domain/semanasDelPlan';
import { microciclosDeLaSemana } from '@/domain/blocks';
import { addDays, daysBetween, localeNumber, shortDate, weekStart } from '@/lib/dates';
import { Globo, GloboLinea, GloboNada, sitioDelGlobo } from '@/components/ui/Globo';
import { colocarPesos, etiquetaDelBloque, primeraPalabra, rotuloDeFase } from './rotulos';

/**
 * LA BARRA DEL PLAN: la temporada en semanas, sin cajas y sin sombras.
 *
 * ══ Qué se ve ══════════════════════════════════════════════════════════════
 *
 * El boceto aprobado (3.ª vuelta, 22 sep 2026, «El plan en barras»):
 *
 *   · La FASE, una barra de 22 px del color de su dirección, un segmento por
 *     semana, como la barra de progreso de las historias: hueco fino entre
 *     semanas y redondeo solo en los extremos. Lo hecho en sólido; la semana de
 *     hoy rellena hasta hoy, con un punto debajo; lo que queda, en tinte.
 *   · Sobre cada fase su rótulo (título, ritmo, cuenta). Si no cabe, se cae por
 *     orden (`rotuloDeFase`).
 *   · Los PESOS, atados a su extremo (23 sep): uno por unión, encima y con un
 *     tallo, porque la salida de una fase es la entrada de la siguiente
 *     (`colocarPesos`).
 *   · Los BLOQUES debajo, 15 px, en tinta neutra y por DÍAS: UNA pastilla de
 *     principio a fin, y el corte por microciclo, una línea fina dentro. El
 *     borrador, rayado. La descarga, un trazo fino.
 *   · El CRUCE, una fila por camino, cada una del color de su dirección.
 *   · Los HECHOS con su icono y un tallo hasta una muesca en la fase.
 *   · La regla de semanas debajo: cada cuatro, más la de hoy y el destino.
 *
 * Nada de texto dentro de los segmentos: al señalar una semana sale el globo.
 *
 * ══ El arrastre ════════════════════════════════════════════════════════════
 *
 * Las asas salen solo cerca de su final (o con el foco). Arrastrar encaja en la
 * semana —o en la vuelta, si el bloque es rotativo— y lo que se mueve resbala
 * con un muelle discreto (`transition` en `left`/`width`). Mientras se arrastra
 * solo se DIBUJA (`onVistaPrevia`); se escribe al soltar (`onSoltar`), y un
 * arrastre entero es un solo paso de Deshacer. Con el teclado, ← y → sobre el
 * asa, y cada pulsación es un paso.
 *
 *   · Fase: alargarla empuja las siguientes (`estirar_fase`, 0136). No puede
 *     acabar antes de hoy ni durar menos de una semana.
 *   · Bloque abierto: escribe su `plannedWeeks`; NO crea microciclos, que se
 *     siguen creando en Entreno. No baja de los ya escritos.
 *   · Borrador: su `plannedWeeks`. Los de detrás se mueven solos: su sitio se
 *     deriva del final de los de delante.
 *   · Un bloque cerrado no tiene asa.
 */

/* Las alturas del dibujo, en píxeles desde arriba de la tira. */
const Y = {
  cap: 0,
  hecho: 26,
  peso: 44,
  faseTop: 64,
  faseH: 22,
  muesca: 5,
  blkTop: 101,
  blkH: 15,
  descH: 5,
  regla: 129,
  alto: 147,
};

/* La barra de la fase es una barra de progreso, como las de las historias: un
   hueco fino entre semanas, uno algo mayor entre fases, y el redondeo solo en
   los extremos de la fase. Donde la corta el borde de la tira, recta: sigue. */
const HUECO = 2;
const HUECO_FASE = 5;
const RADIO = 6;

const ICONO = { rest: Sun, refeed: UtensilsCrossed, diet_break: Coffee, race: Trophy };

const kg = (v) => localeNumber(v, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/* ¿Cabe el nombre de un hecho antes del siguiente? A 11,5 px de Geist, por
   arriba, como el resto de rótulos (`rotulos.js`). */
const anchoHecho = (t) => String(t || '').length * 6.6 + 22;

export const BarraDelPlan = ({
  linea,
  ancho,
  startDate = null,
  puedeEditar = false,
  seleccion = null,
  compacta = false,
  onSeleccionar,
  onVistaPrevia,
  onSoltar,
}) => {
  const { tiras, col } = useMemo(() => partirEnTiras(linea.lunes.length, ancho), [linea.lunes.length, ancho]);
  const gap = HUECO;
  const tirasRef = useRef([]);
  const lienzoRef = useRef(null);
  const [senalada, setSenalada] = useState(null);
  const [arrastre, setArrastre] = useState(null);
  const [asaConFoco, setAsaConFoco] = useState(null);
  /* El clic que sigue a soltar un arrastre no es un clic: no elige nada. */
  const soltadoRef = useRef(0);

  const lunes0 = linea.lunes[0];
  const hoyIdx = linea.hoyIdx;
  /* Días desde el primer lunes: la unidad del arrastre de bloques. */
  const diaN = (dia) => daysBetween(lunes0, dia) ?? 0;
  const numero = (i) => (startDate ? weekFromStart(startDate, linea.lunes[i]) : i + 1);

  /* ── Dónde está el puntero ───────────────────────────────────────────── */
  const semanaEn = (ev) => {
    for (let t = 0; t < tiras.length; t += 1) {
      const el = tirasRef.current[t];
      if (!el) continue;
      const R = el.getBoundingClientRect();
      if (ev.clientY >= R.top - 9 && ev.clientY <= R.bottom + 9) {
        const i = tiras[t].a + Math.floor((ev.clientX - R.left) / col);
        return i >= tiras[t].a && i < tiras[t].b ? i : null;
      }
    }
    return null;
  };
  /* El punto más cercano en cualquier tira, en días (con decimales). */
  const diasEn = (ev) => {
    let mejor = null;
    let d = Infinity;
    tiras.forEach((tr, t) => {
      const el = tirasRef.current[t];
      if (!el) return;
      const R = el.getBoundingClientRect();
      const dy = ev.clientY < R.top ? R.top - ev.clientY : ev.clientY > R.bottom ? ev.clientY - R.bottom : 0;
      if (dy < d) {
        d = dy;
        mejor = { tr, R };
      }
    });
    if (!mejor) return null;
    const x = Math.max(0, Math.min((mejor.tr.b - mejor.tr.a) * col, ev.clientX - mejor.R.left));
    return (mejor.tr.a + x / col) * 7;
  };

  /* ── El arrastre ─────────────────────────────────────────────────────── */
  const valorEn = (a, dias) => {
    if (a.tipo === 'fase') {
      const k = Math.round(dias / 7) - a.b0;
      return Math.max(a.minimo, k);
    }
    const m = Math.round((dias - diaN(a.desde)) / a.vuelta);
    return Math.max(a.minimo, Math.min(MAX_MICROCICLOS, m));
  };

  const empezar = (ev, a) => {
    if (!puedeEditar) return;
    ev.preventDefault();
    ev.stopPropagation();
    lienzoRef.current?.setPointerCapture?.(ev.pointerId);
    setArrastre({ ...a, valor: a.inicial });
  };

  const moverA = (a, valor) => {
    if (valor === a.valor) return;
    const siguiente = { ...a, valor };
    setArrastre(siguiente);
    onVistaPrevia?.(valor === a.inicial ? null : { tipo: a.tipo, id: a.id, valor });
  };

  const soltar = () => {
    if (!arrastre) return;
    const a = arrastre;
    setArrastre(null);
    soltadoRef.current = Date.now();
    if (a.valor !== a.inicial) onSoltar?.({ tipo: a.tipo, id: a.id, valor: a.valor, antes: a.inicial, titulo: a.titulo });
    else onVistaPrevia?.(null);
  };

  /* Con el teclado, un paso por pulsación, y cada uno se escribe. */
  const teclaDelAsa = (ev, a) => {
    const d = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0;
    if (!d || !puedeEditar) return;
    ev.preventDefault();
    const valor =
      a.tipo === 'fase' ? Math.max(a.minimo, a.inicial + d) : Math.max(a.minimo, Math.min(MAX_MICROCICLOS, a.inicial + d));
    if (valor !== a.inicial) onSoltar?.({ tipo: a.tipo, id: a.id, valor, antes: a.inicial, titulo: a.titulo });
  };

  const alMover = (ev) => {
    if (arrastre) {
      const dias = diasEn(ev);
      if (dias !== null) moverA(arrastre, valorEn(arrastre, dias));
      return;
    }
    const i = semanaEn(ev);
    if (i !== senalada) setSenalada(i);
  };

  const alPulsar = (ev) => {
    if (arrastre || Date.now() - soltadoRef.current < 350) return;
    const blanco = ev.target.closest?.('[data-sel]');
    if (blanco) {
      const [tipo, id] = blanco.dataset.sel.split(':');
      onSeleccionar?.({ tipo, id });
      return;
    }
    const i = semanaEn(ev);
    const f = i === null ? null : linea.fases.find((x) => i >= x.a && i < x.b);
    if (f) onSeleccionar?.({ tipo: 'fase', id: f.fase.id });
  };

  const alTeclear = (ev, tr) => {
    const d = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0;
    if (d) {
      ev.preventDefault();
      const base = senalada ?? Math.max(tr.a, Math.min(hoyIdx, tr.b - 1));
      const i = Math.max(0, Math.min(linea.lunes.length - 1, senalada === null ? base : base + d));
      setSenalada(i);
      const t = tiras.findIndex((x) => i >= x.a && i < x.b);
      if (t >= 0 && tirasRef.current[t] !== ev.currentTarget) tirasRef.current[t]?.focus();
      return;
    }
    if ((ev.key === 'Enter' || ev.key === ' ') && senalada !== null) {
      ev.preventDefault();
      const f = linea.fases.find((x) => senalada >= x.a && senalada < x.b);
      if (f) onSeleccionar?.({ tipo: 'fase', id: f.fase.id });
    }
  };

  /* ── El globo ────────────────────────────────────────────────────────── */
  const semanaDelGlobo = arrastre ? finDelArrastre(arrastre, linea) : senalada;
  const dice = semanaDelGlobo === null ? null : loQueDiceLaSemana(linea, semanaDelGlobo);
  let globo = null;
  if (dice) {
    const t = tiras.findIndex((x) => semanaDelGlobo >= x.a && semanaDelGlobo < x.b);
    const el = tirasRef.current[t];
    const W = lienzoRef.current?.clientWidth || ancho;
    const H = lienzoRef.current?.clientHeight || 0;
    if (el) {
      const x = el.offsetLeft + (semanaDelGlobo - tiras[t].a + 0.5) * col;
      const y = el.offsetTop + Y.faseTop;
      globo = { ...sitioDelGlobo({ x, y, W, H, ancho: 240, alto: 150 }), dice };
    }
  }

  /* Solo se ofrece el asa del final que tienes cerca. */
  const cerca = (finExcl) =>
    (senalada !== null && Math.abs(finExcl - 1 - senalada) <= 2) || arrastre?.finExcl === finExcl;

  const conHecho = new Set(linea.hechos.map((h) => h.i));
  /* Con algo elegido en la barra, lo demás se aparta (el CSS lo atenúa). */
  const hayEleccion = ['fase', 'bloque', 'hecho', 'cruce'].includes(seleccion?.tipo);

  return (
    <div
      className={`creador-lienzo${arrastre ? ' is-arrastrando' : ''}${hayEleccion ? ' hay-eleccion' : ''}`}
      ref={lienzoRef}
      onPointerMove={alMover}
      onPointerUp={soltar}
      onPointerCancel={soltar}
      onPointerLeave={() => {
        if (!arrastre) setSenalada(null);
      }}
      onClick={alPulsar}
    >
      {tiras.map((tr, t) => {
        const X = (i) => (i - tr.a) * col;
        const W = (tr.b - tr.a) * col;
        /* Un día, en píxeles de esta tira. */
        const XD = (dia) => {
          const semana = Math.floor(diaN(weekStart(dia)) / 7);
          const dentro = daysBetween(weekStart(dia), dia) ?? 0;
          return (semana - tr.a) * col + (dentro * col) / 7;
        };
        const diaIni = tr.a < linea.lunes.length ? linea.lunes[tr.a] : null;
        const diaFin = addDays(linea.lunes[tr.b - 1], 6);

        return (
          <div
            key={`${tr.a}-${tr.b}`}
            className="creador-tira"
            ref={(el) => {
              tirasRef.current[t] = el;
            }}
            style={{ height: Y.alto, width: W }}
            tabIndex={0}
            role="group"
            aria-label={`Semanas S${numero(tr.a)} a S${numero(tr.b - 1)}`}
            onKeyDown={(ev) => alTeclear(ev, tr)}
            onFocus={() => {
              if (senalada === null) setSenalada(Math.max(tr.a, Math.min(hoyIdx, tr.b - 1)));
            }}
          >
            {/* Mientras se arrastra no se señala nada: la columna se quedaría en su sitio viejo. */}
            {!arrastre && senalada !== null && senalada >= tr.a && senalada < tr.b && (
              <span
                className="creador-banda"
                style={{ left: X(senalada) - 3, width: col - gap + 6, top: Y.hecho - 12, height: Y.regla - Y.hecho + 8 }}
                aria-hidden="true"
              />
            )}

            {/* ── Las fases, semana a semana ─────────────────────────── */}
            {linea.fases.map((f) => {
              const s = Math.max(f.a, tr.a);
              const e = Math.min(f.b, tr.b);
              if (e <= s) return null;
              const elegida = seleccion?.tipo === 'fase' && seleccion.id === f.fase.id;
              const segmentos = [];
              for (let i = s; i < e; i += 1) {
                const estado =
                  f.estado === 'hecha' || i < hoyIdx ? 'is-hecha' : i === hoyIdx ? 'is-hoy' : 'is-futura';
                const ultima = i === f.b - 1;
                const r0 = i === f.a ? RADIO : 0;
                const r1 = ultima ? RADIO : 0;
                segmentos.push(
                  <span
                    key={`${f.fase.id}-${i - f.a}`}
                    className={`creador-sem ${estado}${conHecho.has(i) ? ' con-muesca' : ''}${elegida ? ' is-elegida' : ''}`}
                    data-sel={`fase:${f.fase.id}`}
                    style={{
                      left: X(i),
                      top: Y.faseTop,
                      width: col - (ultima ? HUECO_FASE : gap),
                      height: Y.faseH,
                      borderRadius: `${r0}px ${r1}px ${r1}px ${r0}px`,
                      '--c': f.color,
                      '--llenado': `${Math.round(linea.hoyFraccion * 100)}%`,
                    }}
                  />
                );
              }

              /* El rótulo: la cuenta solo en la tira donde está hoy. Los pesos
                 no van aquí: van atados a su unión (abajo). */
              const cw = (e - s) * col - HUECO_FASE;
              const cuenta =
                f.estado === 'actual' && hoyIdx >= tr.a && hoyIdx < tr.b ? `${hoyIdx - f.a + 1} de ${f.b - f.a}` : '';
              const rot = rotuloDeFase({
                titulo: f.fase.title,
                ritmo: ritmoTexto(f.fase.direction, f.fase.ratePct),
                cuenta,
                ancho: cw,
              });
              return (
                <FaseEnLaTira key={f.fase.id} segmentos={segmentos}>
                  <span
                    className="creador-rotulo"
                    style={{ left: X(s), top: Y.cap, width: cw }}
                    aria-hidden="true"
                  >
                    <span>
                      {rot.izq.map((p, j) => (
                        <span key={j} className={`is-${p.tono}`}>
                          {p.texto}
                        </span>
                      ))}
                    </span>
                    <span>
                      {rot.der.map((p, j) => (
                        <span key={j} className={`is-${p.tono}`}>
                          {p.texto}
                        </span>
                      ))}
                    </span>
                  </span>
                </FaseEnLaTira>
              );
            })}

            {/* ── El cruce: una fila por camino, del color de su dirección ── */}
            {linea.cruce &&
              (() => {
                const c = linea.cruce;
                const n = c.caminos.length;
                const h = (Y.faseH - (n - 1) * gap) / n;
                const filas = [];
                c.caminos.forEach((cm, j) => {
                  for (let i = Math.max(cm.a, tr.a); i < Math.min(cm.b, tr.b); i += 1) {
                    const ultima = i === cm.b - 1;
                    const r0 = i === cm.a ? 4 : 0;
                    const r1 = ultima ? 4 : 0;
                    filas.push(
                      <span
                        key={`c${j}-${i - cm.a}`}
                        className={`creador-camino${seleccion?.tipo === 'cruce' ? ' is-elegida' : ''}`}
                        data-sel="cruce:cruce"
                        style={{
                          left: X(i),
                          top: Y.faseTop + j * (h + gap),
                          width: col - (ultima ? HUECO_FASE : gap),
                          height: h,
                          borderRadius: `${r0}px ${r1}px ${r1}px ${r0}px`,
                          '--c': cm.color,
                        }}
                      />
                    );
                  }
                });
                /* El rótulo nombra cada camino con su color: la pregunta ya
                   está en la cabecera. */
                const s = Math.max(c.a, tr.a);
                const e = Math.min(Math.max(...c.caminos.map((cm) => cm.b)), tr.b);
                if (e > s) {
                  const fin = X(e) - HUECO_FASE;
                  /* La misma escalera que los bloques: los nombres enteros, su
                     primera palabra, y solo al final la inicial. Sin el peldaño
                     de en medio, un píxel de menos convertía «Transición» y
                     «Seguir definiendo» en «T» y «S». */
                  const versiones = [
                    c.caminos.map((cm) => cm.titulo),
                    c.caminos.map((cm) => primeraPalabra(cm.titulo) || cm.titulo),
                    c.caminos.map((cm) => cm.titulo[0]),
                  ];
                  const mide = (ns) => ns.reduce((w, t) => w + t.length * 6.6 + 14, 0) + 10 * (n - 1);
                  /* Si no caben sobre el cruce, se corren a la izquierda, sobre la
                     cola de la fase anterior, siempre que su rótulo no llegue: la
                     de hoy lleva la cuenta a la derecha y no se le pisa. */
                  const antes = linea.fases.find((f) => f.b === c.a);
                  let libre = X(s);
                  if (antes && antes.estado !== 'actual' && antes.b > tr.a) {
                    const suyo =
                      X(Math.max(antes.a, tr.a)) +
                      antes.fase.title.length * 7.2 +
                      6 +
                      ritmoTexto(antes.fase.direction, antes.fase.ratePct).length * 6.6 +
                      16;
                    libre = Math.min(libre, suyo);
                  }
                  const nombres = versiones.find((v) => mide(v) <= fin - libre) || versiones[versiones.length - 1];
                  const largo = mide(nombres);
                  const left = largo > fin - libre || largo <= fin - X(s) ? X(s) : fin - largo;
                  filas.push(
                    <span
                      key="c-rotulo"
                      className="creador-rotulo is-cruce"
                      style={{ left, top: Y.cap, width: Math.max(0, W - left) }}
                      aria-hidden="true"
                    >
                      <span>
                        {c.caminos.map((cm, j) => (
                          <span key={cm.titulo} className="creador-camino-nombre" style={{ '--c': cm.color }}>
                            <i />
                            {nombres[j]}
                          </span>
                        ))}
                      </span>
                    </span>
                  );
                }
                return filas;
              })()}

            {/* ── Los pesos, atados a su unión ───────────────────────── */}
            {colocarPesos(marcasDePeso(linea, tr, X, compacta), W).map((p) => (
              <Fragment key={`peso-${p.x}`}>
                <span
                  className={`creador-peso is-${p.ancla}`}
                  style={{ left: p.left, top: Y.peso, width: p.ancho }}
                  aria-hidden="true"
                >
                  {p.partes.map((t, j) => (
                    <span key={j}>{t}</span>
                  ))}
                </span>
                <span
                  className="creador-peso-tallo"
                  style={{ left: Math.max(0, Math.min(W - 1, p.x - 0.5)), top: Y.peso + 15, height: Y.faseTop - Y.peso - 16 }}
                  aria-hidden="true"
                />
              </Fragment>
            ))}

            {/* ── Los bloques: una pastilla, un corte fino por microciclo ── */}
            {linea.bloques.map((b) => {
              if (b.hasta < diaIni || b.desde > diaFin) return null;
              const elegido = seleccion?.tipo === 'bloque' && seleccion.id === b.id;
              const h = b.descarga ? Y.descH : Y.blkH;
              const top = Y.blkTop + (Y.blkH - h) / 2;
              const empieza = XD(b.desde) >= 0;
              const acaba = XD(addDays(b.hasta, 1)) <= W;
              const x0 = Math.max(0, XD(b.desde));
              const x1 = (acaba ? XD(addDays(b.hasta, 1)) : W) - gap;
              if (x1 - x0 < 1) return null;
              const r0 = empieza ? (b.descarga ? 3 : 4) : 0;
              const r1 = acaba ? (b.descarga ? 3 : 4) : 0;
              const piezas = [
                <span
                  key={b.id}
                  className={`creador-bloque is-${b.tipo}${b.descarga ? ' is-descarga' : ''}${elegido ? ' is-elegido' : ''}`}
                  data-sel={`bloque:${b.id}`}
                  style={{ left: x0, top, width: x1 - x0, height: h, borderRadius: `${r0}px ${r1}px ${r1}px ${r0}px` }}
                />,
              ];
              /* El corte entre microciclos: una línea fina dentro, que no
                 parte la pastilla. Lo que importa es dónde empieza y acaba. */
              if (!b.descarga) {
                for (let m = 1; m < b.microciclos; m += 1) {
                  const dia = addDays(b.desde, m * b.vuelta);
                  if (dia > b.hasta) break;
                  const x = XD(dia);
                  if (x <= x0 + 2 || x >= x1 - 2) continue;
                  piezas.push(
                    <span
                      key={`${b.id}-corte-${m}`}
                      className="creador-corte"
                      style={{ left: x - 1, top: Y.blkTop + 3, height: Y.blkH - 6 }}
                      aria-hidden="true"
                    />
                  );
                }
              }
              if (!b.descarga) {
                const hoyM =
                  b.tipo === 'abierto'
                    ? microciclosDeLaSemana({ desde: b.desde, vuelta: b.vuelta, total: b.microciclos }, weekStart(linea.hoy))
                    : null;
                const et = etiquetaDelBloque({
                  nombre: b.nombre,
                  intent: b.intent,
                  cola: hoyM ? ` · M${hoyM.primero} de ${b.microciclos}` : '',
                  ancho: x1 - x0,
                });
                if (et.texto) {
                  piezas.push(
                    <span
                      key={`${b.id}-rotulo`}
                      className={`creador-bloque-rotulo is-${b.tipo}${et.letra ? ' is-letra' : ''}`}
                      style={{ left: x0, top: Y.blkTop, width: x1 - x0, height: Y.blkH }}
                      aria-hidden="true"
                    >
                      {et.texto}
                    </span>
                  );
                }
              }
              return piezas;
            })}

            {/* ── Las asas: la de la fase encima de todo ─────────────── */}
            {puedeEditar &&
              linea.bloques.map((b) => {
                if (!b.asa || b.hasta < diaIni || b.hasta > diaFin) return null;
                const finExcl = Math.floor(diaN(b.hasta) / 7) + 1;
                const a = {
                  tipo: b.tipo === 'borrador' ? 'borrador' : 'bloque',
                  id: b.id,
                  inicial: b.microciclos,
                  minimo: b.minimo,
                  desde: b.desde,
                  vuelta: b.vuelta,
                  finExcl,
                  titulo: b.nombre,
                };
                const activa = arrastre?.id === b.id;
                return (
                  <button
                    key={`asa-${b.id}`}
                    type="button"
                    className={`creador-asa is-fina${cerca(finExcl) || asaConFoco === b.id ? ' is-cerca' : ''}${activa ? ' is-activa' : ''}`}
                    style={{ left: XD(addDays(b.hasta, 1)) - 2, top: Y.blkTop + Y.blkH / 2 }}
                    aria-label={`Cambiar lo que dura ${b.nombre}: ${b.microciclos} ${b.microciclos === 1 ? 'microciclo' : 'microciclos'}`}
                    onPointerDown={(ev) => empezar(ev, a)}
                    onKeyDown={(ev) => teclaDelAsa(ev, a)}
                    onFocus={() => setAsaConFoco(b.id)}
                    onBlur={() => setAsaConFoco(null)}
                    onClick={(ev) => ev.stopPropagation()}
                  />
                );
              })}
            {puedeEditar &&
              linea.fases.map((f) => {
                if (!f.asa || f.b <= tr.a || f.b > tr.b) return null;
                const a = {
                  tipo: 'fase',
                  id: f.fase.id,
                  inicial: 0,
                  minimo: f.acortable,
                  b0: f.b,
                  finExcl: f.b,
                  titulo: f.fase.title,
                  semanas: f.b - f.a,
                };
                const activa = arrastre?.id === f.fase.id;
                return (
                  <button
                    key={`asa-${f.fase.id}`}
                    type="button"
                    className={`creador-asa${cerca(f.b) || asaConFoco === f.fase.id ? ' is-cerca' : ''}${activa ? ' is-activa' : ''}`}
                    style={{ left: X(f.b) - HUECO_FASE / 2, top: Y.faseTop + Y.faseH / 2, '--c': f.color }}
                    aria-label={`Cambiar lo que dura ${f.fase.title}: ${f.b - f.a} semanas`}
                    onPointerDown={(ev) => empezar(ev, a)}
                    onKeyDown={(ev) => teclaDelAsa(ev, a)}
                    onFocus={() => setAsaConFoco(f.fase.id)}
                    onBlur={() => setAsaConFoco(null)}
                    onClick={(ev) => ev.stopPropagation()}
                  />
                );
              })}

            {/* ── Los hechos: icono, nombre y tallo hasta la muesca ──── */}
            {linea.hechos
              .filter((h) => h.i >= tr.a && h.i < tr.b)
              .map((h, j, lista) => {
                const cx = X(h.i) + (col - gap) / 2;
                const siguiente = lista[j + 1];
                const sitio = ((siguiente ? siguiente.i : tr.b) - h.i) * col - (col - gap) / 2 + 6;
                const cabe = anchoHecho(h.evento.title) <= sitio;
                const Icono = ICONO[h.evento.kind] || Sun;
                const cabeza = Y.hecho + 8;
                const pie = Y.faseTop + Y.muesca - 1;
                return (
                  <Fragment key={h.evento.id}>
                    <span className="creador-tallo" style={{ left: cx - 0.5, top: cabeza, height: pie - cabeza }} aria-hidden="true" />
                    <span
                      className={`creador-hecho${seleccion?.tipo === 'hecho' && seleccion.id === h.evento.id ? ' is-elegido' : ''}`}
                      data-sel={`hecho:${h.evento.id}`}
                      style={{ left: cx - 6.5, top: Y.hecho - 7 }}
                    >
                      <Icono size={13} aria-hidden="true" />
                      {cabe && <span>{h.evento.title}</span>}
                    </span>
                  </Fragment>
                );
              })}

            {hoyIdx >= tr.a && hoyIdx < tr.b && (
              <span
                className="creador-hoy"
                style={{ left: X(hoyIdx) + (col - gap) / 2 - 2.5, top: Y.faseTop + Y.faseH + 5 }}
                aria-hidden="true"
              />
            )}

            {/* ── La regla ───────────────────────────────────────────── */}
            {Array.from({ length: tr.b - tr.a }, (_, j) => {
              const i = tr.a + j;
              const cx = X(i) + (col - gap) / 2;
              if (linea.destino && i === linea.destino.i) {
                return (
                  <span key={`r${i}`} className="creador-regla is-destino" style={{ left: cx, top: Y.regla }}>
                    <i aria-hidden="true" />
                    {linea.destino.evento.title}
                  </span>
                );
              }
              const n = numero(i);
              const esHoy = i === hoyIdx;
              const lejos = Math.abs(i - hoyIdx) > 2 && (!linea.destino || Math.abs(i - linea.destino.i) > 3);
              if (!esHoy && (n % 4 !== 0 || !lejos || col * 4 < 34)) return null;
              return (
                <span key={`r${i}`} className={`creador-regla${esHoy ? ' is-hoy' : ''}`} style={{ left: cx, top: Y.regla }}>
                  {esHoy ? `S${n} · hoy` : `S${n}`}
                </span>
              );
            })}
          </div>
        );
      })}

      {globo && <GloboDeLaSemana {...globo} numero={numero(semanaDelGlobo)} arrastre={arrastre} linea={linea} />}
    </div>
  );
};

/* Los segmentos de una fase y su rótulo, sin caja: solo agrupa. */
const FaseEnLaTira = ({ segmentos, children }) => (
  <>
    {segmentos}
    {children}
  </>
);

/**
 * Los pesos de una tira, antes de colocarlos (`colocarPesos`): uno por unión de
 * dos fases pegadas, y la entrada o la salida sueltas donde una fase no toca a
 * otra. Una unión que cae justo en el borde se escribe en las dos tiras.
 */
const marcasDePeso = (linea, tr, X, compacta) => {
  const marcas = [];
  const conKg = (v) => [[`${v} kg`], [v]];
  linea.fases.forEach((f, k) => {
    const antes = linea.fases[k - 1];
    const despues = linea.fases[k + 1];
    if (antes && antes.b === f.a) {
      if (f.a < tr.a || f.a > tr.b) return;
      const s = antes.salida === null ? null : kg(antes.salida);
      const e = f.entrada === null ? null : kg(f.entrada);
      if (s === null && e === null) return;
      const x = X(f.a) - HUECO_FASE / 2;
      /* Si coinciden, un número; si la entrada real no es la esperada, los dos:
         la salida a la izquierda del tallo y la entrada a la derecha. */
      const versiones = s === null || e === null || s === e ? conKg(s ?? e) : [[`${s} kg`, `${e} kg`], [s, e]];
      marcas.push({ x, ancla: 'centro', versiones });
    } else if (f.entrada !== null && f.a >= tr.a && f.a < tr.b) {
      marcas.push({ x: X(f.a) + 1, ancla: 'izq', versiones: conKg(kg(f.entrada)) });
    }
    if ((!despues || despues.a !== f.b) && f.salida !== null && f.b > tr.a && f.b <= tr.b) {
      const v = kg(f.salida);
      /* Donde empieza el cruce, la salida es la entrada de los dos caminos. */
      const alCruce = linea.cruce && linea.cruce.a === f.b;
      /* En el teléfono, la salida suelta lleva palabra (bocetos, 22 sep). */
      const versiones = compacta ? [[`sale con ${v}`], ...conKg(v)] : conKg(v);
      marcas.push(
        alCruce
          ? { x: X(f.b) - HUECO_FASE / 2, ancla: 'centro', versiones }
          : { x: X(f.b) - HUECO_FASE - 1, ancla: 'der', versiones }
      );
    }
  });
  return marcas;
};

/** La semana donde acaba lo que se arrastra: ahí va el globo. */
const finDelArrastre = (a, linea) => {
  if (a.tipo === 'fase') {
    const f = linea.fases.find((x) => x.fase.id === a.id);
    return f ? f.b - 1 : null;
  }
  const b = linea.bloques.find((x) => x.id === a.id);
  if (!b) return null;
  const i = Math.floor((daysBetween(linea.lunes[0], b.hasta) ?? 0) / 7);
  return Math.max(0, Math.min(linea.lunes.length - 1, i));
};

const GloboDeLaSemana = ({ left, top, dice, numero, arrastre, linea }) => {
  let cab = `S${numero} · ${tramoDeFechas(dice.lunes, dice.domingo)}`;
  if (arrastre?.tipo === 'fase') {
    const f = linea.fases.find((x) => x.fase.id === arrastre.id);
    if (f) cab = `${f.fase.title} · ${f.b - f.a} semanas`;
  } else if (arrastre) {
    const b = linea.bloques.find((x) => x.id === arrastre.id);
    if (b) cab = `${b.nombre} · ${b.microciclos} ${b.microciclos === 1 ? 'microciclo' : 'microciclos'}`;
  }
  const vacio = !dice.fase && dice.cruce.length === 0 && dice.bloques.length === 0 && dice.hechos.length === 0;
  return (
    <Globo left={left} top={top} ancho={240} cab={cab} marca={dice.esHoy ? 'Hoy' : null}>
      {dice.fase && (
        <GloboLinea muestra="fondo" color={dice.fase.color}>
          <span>
            <b className="creador-globo-fuerte">{dice.fase.fase.title}</b> · semana {dice.fase.n} de {dice.fase.total}
          </span>
        </GloboLinea>
      )}
      {dice.cruce.map((c) => (
        <GloboLinea key={c.titulo} muestra="fondo" color={c.color}>
          <span>
            <b className="creador-globo-fuerte">{c.titulo}</b> · un camino del cruce
          </span>
        </GloboLinea>
      ))}
      {dice.bloques.map(({ bloque: b, micro }) => (
        <GloboLinea key={b.id} muestra="fondo" color="var(--hairline-strong)">
          <span>
            <b className="creador-globo-fuerte">{b.nombre}</b>
            {micro ? ` · ${microTexto(micro)} de ${b.microciclos}` : ''}
            {b.tipo === 'borrador' ? ' · borrador' : ''}
            {b.rotativo && b.vuelta !== 7 ? ` · microciclo de ${b.vuelta} días` : ''}
          </span>
        </GloboLinea>
      ))}
      {dice.hechos.map((h) => (
        <GloboLinea key={h.id}>
          {h.title}
          {h.hasta && h.hasta !== h.date ? ` · del ${shortDate(h.date)} al ${shortDate(h.hasta)}` : ` · ${shortDate(h.date)}`}
          {h.kcal ? ` · ${h.kcal} kcal` : ''}
        </GloboLinea>
      ))}
      {dice.destino && (
        <GloboLinea>
          <span>
            <b className="creador-globo-fuerte">{dice.destino.evento.title}</b> · {shortDate(dice.destino.fecha)}
          </span>
        </GloboLinea>
      )}
      {dice.esperado !== null && (
        <GloboLinea muestra="meta" color={dice.fase?.color || 'var(--text-tertiary)'}>
          Esperado {kg(dice.esperado)} kg
        </GloboLinea>
      )}
      {vacio && <GloboNada>Sin nada planificado</GloboNada>}
    </Globo>
  );
};
