import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, TrendingUp, X } from 'lucide-react';

import { weeksOfBlock } from '@/domain/blocks';
import {
  MINIMO_PARA_SEPARAR,
  cambioMedio,
  frenados,
  indiceMedio,
  lecturaDelBloque,
  rendimientoDelBloque,
  rendimientoPorGrupo,
  rendimientoPorHoja,
  variacionTexto,
} from '@/domain/rendimiento';
import { LECTURA_COLORS, SERIES_EN_ORDEN, colorDeSerie, metricColor } from '@/domain/metrics';
import { localeNumber } from '@/lib/dates';
import { round } from '@/lib/num';
import { Modal } from '@/components/ui/Modal';
import { SegmentedControl } from '@/components/ui/primitives';
import { Autocomplete } from '@/components/ui/Autocomplete';
import { BandChart } from '@/components/ui/charts';
import { ProgresionPopup, etiquetaCorta } from './ProgresionPopup';

/**
 * EL RENDIMIENTO DEL BLOQUE: una herramienta para sacar conclusiones (25 sep).
 *
 * Todo en el mismo índice (`rendimiento.js`: cada ejercicio contra su primer
 * microciclo del bloque = 100), que es lo que deja promediar un press de 80 kg
 * con un curl de 12. Tres piezas:
 *
 *   · Las cuatro cifras del bloque, sueltas.
 *   · UNA gráfica, agrupada como se pida (general, por hoja, por grupo o los
 *     ejercicios que se elijan). La leyenda se toca: una entrada AÍSLA su
 *     curva —al frente, más gruesa, con su área— y deja el resto en gris; si
 *     es una hoja o un grupo, salen además sus ejercicios en fino. La media
 *     del bloque siempre punteada, que es contra lo que se lee todo.
 *   · La lectura: qué se sale de la mediana del bloque, por arriba y por
 *     abajo, y qué lleva tres microciclos sin mejorar (`lecturaDelBloque`,
 *     `frenados`). Tocar una fila la aísla en la gráfica.
 *
 * Solo ordena y señala. Ni verde ni rojo, y ningún consejo: por debajo de la
 * mediana puede ser un ejercicio nuevo o uno en mantenimiento, y eso lo sabe
 * el entrenador, no la pantalla (ver `la-app-no-receta`).
 */

const VISTAS = [
  { id: 'general', label: 'General' },
  { id: 'hoja', label: 'Por hoja' },
  { id: 'grupo', label: 'Por grupo' },
  { id: 'ejercicio', label: 'Por ejercicio' },
];
const LECTURAS = [
  { id: 'grupos', label: 'Grupos' },
  { id: 'ejercicios', label: 'Ejercicios' },
];

const COLOR = metricColor('rendimiento');
const GRIS = metricColor('rendimientoMedio');
/** Más curvas que colores no se leen (`SERIES_EN_ORDEN`). */
const CURVAS = SERIES_EN_ORDEN.length;
const MEDIA = 'media';

const pctTexto = (pct) => (pct === null || pct === undefined ? '—' : variacionTexto(Math.round(pct) / 100));
const cuenta = (n, singular, plural) => `${n} ${n === 1 ? singular : plural}`;
const corto = (nombre, max = 16) => (nombre.length > max ? `${nombre.slice(0, max - 1).trimEnd()}…` : nombre);
const ultimoValor = (linea) => [...linea].reverse().find((p) => p.indice !== null)?.indice ?? null;
const diferenciaTexto = (d) => {
  const n = Math.round(d);
  return n >= 0 ? `+${n} sobre la mediana` : `−${Math.abs(n)} bajo la mediana`;
};
const seriesTexto = (n) => (n === null || n === undefined ? null : `${localeNumber(round(n, 0))} series/sem`);
const serieTexto = (s) =>
  s ? `${localeNumber(s.kg)}×${localeNumber(s.reps)}${s.rir !== null && s.rir !== undefined ? ` @${localeNumber(s.rir)}` : ''}` : null;

/* ── La leyenda que se toca ─────────────────────────────────────────────────
   Punto, nombre y valor; sin borde ni fondo. La aislada lleva un fondo suave
   de su color. El valor es el del cursor si lo hay, y si no el último. */
const Entrada = ({ e, valor, aislada, onToggle, onQuitar }) => (
  <span className={`rend-chapa${aislada ? ' is-aislada' : ''}`} style={{ '--c': e.color }}>
    <button type="button" className="rend-chapa-toque" aria-pressed={aislada} onClick={() => onToggle(e.id)}>
      <span className={`rend-chapa-punto${e.dash ? ' is-punteada' : ''}`} aria-hidden="true" />
      <span className="rend-chapa-nombre">{e.nombre}</span>
      <b>{valor === null ? '—' : Math.round(valor)}</b>
    </button>
    {onQuitar && (
      <button type="button" className="rend-chapa-quitar" onClick={() => onQuitar(e.id)} aria-label={`Quitar ${e.nombre}`}>
        <X size={13} aria-hidden="true" />
      </button>
    )}
  </span>
);

/* ── Una fila de la lectura ──────────────────────────────────────────────── */
const Fila = ({ nombre, sub, valor, bajo, ligera, aislada, onClick }) => (
  <li>
    <button
      type="button"
      className={`rend-fila${ligera ? ' is-ligera' : ''}${aislada ? ' is-aislada' : ''}`}
      aria-pressed={aislada}
      onClick={onClick}
    >
      <span className="rend-fila-texto">
        <span className="rend-fila-nombre">{nombre}</span>
        {sub && <span className="rend-fila-sub">{sub}</span>}
      </span>
      <span className="rend-fila-dato">
        <b>{valor}</b>
        {bajo && <span>{bajo}</span>}
      </span>
      <ChevronRight size={15} className="rend-fila-chevron" aria-hidden="true" />
    </button>
  </li>
);

const Seccion = ({ titulo, color, n, children }) => (
  <section className="rend-seccion" aria-label={titulo}>
    <header className="rend-seccion-cab">
      <span className="rend-seccion-punto" style={{ background: color }} aria-hidden="true" />
      <span className="rend-seccion-titulo">{titulo}</span>
      <span className="rend-seccion-n">{n}</span>
    </header>
    {n === 0 ? <p className="rend-seccion-vacia">Ninguno</p> : <ul className="rend-lista">{children}</ul>}
  </section>
);

export const RendimientoDelBloque = ({ open, onClose, program, bloque, etiqueta }) => {
  const [vista, setVista] = useState('general');
  const [elegidos, setElegidos] = useState([]);
  const [busca, setBusca] = useState('');
  const [aislado, setAislado] = useState(null);
  const [lecturaDe, setLecturaDe] = useState('grupos');
  const [cursor, setCursor] = useState(null);
  const [enFoco, setEnFoco] = useState(null);
  const graficaRef = useRef(null);

  const semanas = useMemo(() => (bloque ? weeksOfBlock(program, bloque) : []), [program, bloque]);
  const { ejercicios } = useMemo(() => rendimientoDelBloque(program, bloque), [program, bloque]);
  const medidos = useMemo(
    () =>
      ejercicios
        .filter((e) => e.cambio)
        .map((e) => ({ ...e, id: e.nombre, pct: e.cambio.indice - 100 }))
        .sort((a, b) => b.pct - a.pct || a.nombre.localeCompare(b.nombre)),
    [ejercicios]
  );
  const hojas = useMemo(() => rendimientoPorHoja(program, bloque, { ejercicios }), [program, bloque, ejercicios]);
  const grupos = useMemo(() => rendimientoPorGrupo(program, bloque, { ejercicios }), [program, bloque, ejercicios]);
  const general = useMemo(
    () => ({ linea: indiceMedio(medidos.map((e) => e.linea)), pct: cambioMedio(medidos) }),
    [medidos]
  );

  /* Las cifras son de EJERCICIOS, pase lo que pase con los conmutadores. */
  const lecturaEj = useMemo(() => lecturaDelBloque(medidos), [medidos]);
  const frenadosEj = useMemo(() => frenados(medidos), [medidos]);

  /* La lectura de abajo, de grupos o de ejercicios. */
  const itemsLectura = lecturaDe === 'grupos' ? grupos : medidos;
  const lectura = useMemo(() => (lecturaDe === 'grupos' ? lecturaDelBloque(grupos) : lecturaEj), [lecturaDe, grupos, lecturaEj]);
  const frenadosLectura = useMemo(
    () => (lecturaDe === 'grupos' ? frenados(grupos) : frenadosEj),
    [lecturaDe, grupos, frenadosEj]
  );

  /* Escape suelta la aislada antes de cerrar la ventana. La ventana escucha
     en el documento, en captura; esto va en la ventana, que captura antes. */
  useEffect(() => {
    if (!open || !aislado) return undefined;
    const alPulsar = (event) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setAislado(null);
    };
    window.addEventListener('keydown', alPulsar, true);
    return () => window.removeEventListener('keydown', alPulsar, true);
  }, [open, aislado]);

  /* Los conjuntos de la vista, cada uno con su color. El color se reparte en
     el orden natural (el de las hojas, el alfabético de los grupos, el de
     elección de los ejercicios): una hoja lleva el mismo color la aísle o no. */
  const conjuntos = useMemo(() => {
    if (vista === 'general') return [];
    if (vista === 'ejercicio')
      return elegidos
        .map((n) => medidos.find((e) => e.nombre === n))
        .filter(Boolean)
        .map((e, i) => ({ id: e.nombre, nombre: e.nombre, linea: e.linea, color: colorDeSerie(i) }));
    const todos = vista === 'hoja' ? hojas : grupos;
    const conCurva = new Set(
      [...todos].sort((a, b) => b.ejercicios.length - a.ejercicios.length).slice(0, CURVAS).map((c) => c.nombre)
    );
    let i = 0;
    return todos.map((c) => ({ ...c, id: c.nombre, color: conCurva.has(c.nombre) ? colorDeSerie(i++) : null }));
  }, [vista, hojas, grupos, elegidos, medidos]);

  if (enFoco)
    return (
      <ProgresionPopup
        open
        onClose={() => setEnFoco(null)}
        microcycles={program?.microcycles || []}
        name={enFoco}
        semanas={semanas}
        etiqueta={etiqueta}
      />
    );

  /* El eje X, hasta el último microciclo con algún registro: los que quedan
     por delante no son huecos, todavía no han llegado. */
  const hasta = general.linea.reduce((u, p, i) => (p.indice !== null ? i : u), -1);
  const labels = semanas.slice(0, hasta + 1).map((w) => etiquetaCorta(etiqueta, w));
  const recorta = (linea) => linea.slice(0, hasta + 1);
  const puntos = (linea) => recorta(linea).map((p, i) => ({ label: labels[i], value: p.indice }));
  const valorEn = (linea) => {
    const l = recorta(linea);
    return cursor !== null && l[cursor] ? l[cursor].indice : ultimoValor(l);
  };

  /* Las entradas de la leyenda. Una hoja o un grupo sin color (pasado el
     sexto) entra solo mientras está aislado, y va en el color de la métrica:
     con el resto en gris no se confunde con nadie. */
  const conColor = conjuntos.filter((c) => c.color);
  const aisladoSinColor = conjuntos.find((c) => c.id === aislado && !c.color);
  const entradas =
    vista === 'general'
      ? []
      : [...conColor, ...(aisladoSinColor ? [{ ...aisladoSinColor, color: COLOR }] : [])];
  const media = {
    id: MEDIA,
    nombre: 'Media del bloque',
    linea: general.linea,
    color: vista === 'general' ? COLOR : GRIS,
    dash: vista !== 'general',
  };
  const sinCurva = conjuntos.filter((c) => !c.color).length;
  const aislada = entradas.find((e) => e.id === aislado) || (aislado === MEDIA ? media : null);

  /* Las series: primero las apagadas, luego los ejercicios de la aislada en
     fino, la media, y la aislada encima de todo. */
  const serie = (e, extra = {}) => ({
    id: e.id,
    label: e.nombre,
    color: e.color,
    decimals: 0,
    area: false,
    points: puntos(e.linea),
    ...extra,
  });
  const series = [];
  if (vista === 'general') series.push(serie(media, { area: true }));
  else {
    for (const e of entradas) {
      if (e.id === aislado) continue;
      series.push(serie(e, aislada ? { color: GRIS, opacidad: 0.2, punto: false } : {}));
    }
    if (aislada && aislada.ejercicios)
      for (const ej of aislada.ejercicios)
        series.push(
          serie(
            { id: `ej:${ej.nombre}`, nombre: ej.nombre, linea: ej.linea, color: aislada.color },
            { opacidad: 0.5, grosor: 1.25, punto: false, etiqueta: corto(ej.nombre) }
          )
        );
    series.push(serie(media, { dash: true, punto: !aislada || aislado === MEDIA }));
    if (aislada && aislado !== MEDIA) series.push(serie(aislada, { grosor: 3, area: true }));
  }

  const alternar = (id) => setAislado((a) => (a === id ? null : id));
  const cambiarVista = (v) => {
    setVista(v);
    setAislado(null);
  };
  const elegir = (nombre) => {
    setElegidos((l) => (l.includes(nombre) ? l : [...l, nombre].slice(-CURVAS)));
    setBusca('');
  };
  const quitar = (nombre) => {
    setElegidos((l) => l.filter((n) => n !== nombre));
    if (aislado === nombre) setAislado(null);
  };

  /* Tocar una fila de la lectura la aísla, en la vista que le toca. */
  const aislarFila = (item) => {
    const esGrupo = lecturaDe === 'grupos';
    if (aislado === item.nombre && vista === (esGrupo ? 'grupo' : 'ejercicio')) {
      setAislado(null);
      return;
    }
    if (esGrupo) setVista('grupo');
    else {
      setVista('ejercicio');
      setElegidos((l) => (l.includes(item.nombre) ? l : [...l, item.nombre].slice(-CURVAS)));
    }
    setAislado(item.nombre);
    const reducido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    graficaRef.current?.scrollIntoView({ block: 'nearest', behavior: reducido ? 'auto' : 'smooth' });
  };
  const filaAislada = (item) =>
    aislado === item.nombre && vista === (lecturaDe === 'grupos' ? 'grupo' : 'ejercicio');

  const suben = medidos.filter((e) => e.cambio.dir === 'sube').length;
  const quienes = lecturaDe === 'grupos' ? 'grupos' : 'ejercicios';
  const subDe = (item) =>
    [lecturaDe === 'grupos' ? cuenta(item.ejercicios.length, 'ejercicio', 'ejercicios') : item.grupo, diferenciaTexto(item.diferencia)]
      .filter(Boolean)
      .join(' · ');
  const filaNormal = (item) => (
    <Fila
      key={item.nombre}
      nombre={item.nombre}
      sub={subDe(item)}
      valor={pctTexto(item.pct)}
      bajo={seriesTexto(item.seriesSemana)}
      aislada={filaAislada(item)}
      onClick={() => aislarFila(item)}
    />
  );
  const filaLigera = (item) => (
    <Fila
      key={item.nombre}
      nombre={item.nombre}
      valor={pctTexto(item.pct)}
      ligera
      aislada={filaAislada(item)}
      onClick={() => aislarFila(item)}
    />
  );
  const filaFrenada = (item) => (
    <Fila
      key={item.nombre}
      nombre={item.nombre}
      sub={[lecturaDe === 'grupos' ? null : item.grupo, `desde ${etiquetaCorta(etiqueta, item.desde)}`]
        .filter(Boolean)
        .join(' · ')}
      valor={serieTexto(item.serie) ?? Math.round(ultimoValor(item.linea))}
      bajo={cuenta(item.microciclos, 'microciclo', 'microciclos')}
      aislada={filaAislada(item)}
      onClick={() => aislarFila(item)}
    />
  );

  return (
    <Modal open={open} size="lg" icono={TrendingUp} title={`Rendimiento · ${bloque?.name || 'Bloque'}`} onClose={onClose}>
      {medidos.length === 0 ? (
        <p className="t-sm t-tertiary">
          Todavía no hay ninguna serie con kilos y repeticiones en este bloque. En cuanto se registre la primera, cada
          ejercicio sale aquí con su cambio.
        </p>
      ) : (
        <div className="progresion">
          <div className="bloque-cifras is-4 progresion-cifras is-suelta">
            <div className="bloque-cifra" title="La media de lo que ha cambiado cada ejercicio desde su primer microciclo del bloque">
              <span className="v">{pctTexto(general.pct)}</span>
              <span className="k">Media del bloque</span>
            </div>
            <div className="bloque-cifra">
              <span className="v">
                {suben}
                <small>de {medidos.length}</small>
              </span>
              <span className="k">Ejercicios suben</span>
            </div>
            <div
              className="bloque-cifra"
              title={`Los que se alejan de la mediana del bloque, por arriba o por abajo. Con menos de ${MINIMO_PARA_SEPARAR} ejercicios no se separa.`}
            >
              <span className="v">{lecturaEj.separa ? lecturaEj.encima.length + lecturaEj.debajo.length : '—'}</span>
              <span className="k">Fuera de lo normal</span>
            </div>
            <div className="bloque-cifra" title="Tres microciclos con registro o más sin superar su mejor marca">
              <span className="v">{frenadosEj.length}</span>
              <span className="k">Se han frenado</span>
            </div>
          </div>

          <div className="rend-mandos">
            <SegmentedControl value={vista} onChange={cambiarVista} options={VISTAS} label="Cómo agrupar el rendimiento" />
            <span className="rend-rotulo">Índice · 100 = inicio del bloque</span>
          </div>

          <div className="rend-grafica" ref={graficaRef}>
            {vista === 'ejercicio' && (
              <div className="rend-buscador">
                <Autocomplete
                  value={busca}
                  onChange={setBusca}
                  items={medidos.filter((e) => !elegidos.includes(e.nombre))}
                  getLabel={(e) => e.nombre}
                  getMeta={(e) => pctTexto(e.pct)}
                  onPick={(e) => elegir(e.nombre)}
                  placeholder={elegidos.length >= CURVAS ? `Hasta ${CURVAS} a la vez` : 'Añadir un ejercicio…'}
                  abreVacio
                  maxSuggestions={8}
                  inputProps={{ 'aria-label': 'Añadir un ejercicio a la gráfica', disabled: elegidos.length >= CURVAS }}
                />
              </div>
            )}

            <div className="rend-leyenda">
              {entradas.map((e) => (
                <Entrada
                  key={e.id}
                  e={e}
                  valor={valorEn(e.linea)}
                  aislada={aislado === e.id}
                  onToggle={alternar}
                  onQuitar={vista === 'ejercicio' ? quitar : null}
                />
              ))}
              <Entrada e={media} valor={valorEn(media.linea)} aislada={aislado === MEDIA} onToggle={alternar} />
              {cursor !== null && labels[cursor] && <span className="rend-leyenda-micro">{labels[cursor]}</span>}
            </div>

            <BandChart
              labels={labels}
              series={series}
              referencia={{ valor: 100, rotulo: 'inicio' }}
              smooth
              height={220}
              gridLines={4}
              showArea={false}
              leyenda={false}
              onCursor={setCursor}
            />

            {vista !== 'ejercicio' && sinCurva > 0 && (
              <p className="rend-nota">
                Con curva, las {CURVAS} con más ejercicios; {cuenta(sinCurva, 'otra sale', 'otras salen')} al tocarla en
                la lectura.
              </p>
            )}
            {vista === 'ejercicio' && elegidos.length === 0 && (
              <p className="rend-nota">Elige uno o varios ejercicios para verlos contra la media del bloque.</p>
            )}
            {vista === 'ejercicio' && aislada && aislado !== MEDIA && (
              <button type="button" className="lado-mas" onClick={() => setEnFoco(aislado)}>
                Ver la progresión de {aislado} ›
              </button>
            )}
          </div>

          <div className="rend-lectura-cab">
            <h3 className="section-label">Lectura del bloque</h3>
            <SegmentedControl value={lecturaDe} onChange={setLecturaDe} options={LECTURAS} label="Qué se lee" />
          </div>

          {lectura.separa ? (
            <div className="rend-lectura">
              <div className="rend-lectura-col">
                <Seccion titulo="Muy por encima" color={LECTURA_COLORS.encima} n={lectura.encima.length}>
                  {lectura.encima.map(filaNormal)}
                </Seccion>
                <Seccion titulo="Por debajo" color={LECTURA_COLORS.debajo} n={lectura.debajo.length}>
                  {lectura.debajo.map(filaNormal)}
                </Seccion>
              </div>
              <div className="rend-lectura-col">
                <Seccion titulo="Se han frenado" color={LECTURA_COLORS.frenados} n={frenadosLectura.length}>
                  {frenadosLectura.map(filaFrenada)}
                </Seccion>
                <Seccion titulo="En la media" color={LECTURA_COLORS.media} n={lectura.media.length}>
                  {lectura.media.map(filaLigera)}
                </Seccion>
              </div>
            </div>
          ) : (
            <div className="rend-lectura">
              <div className="rend-lectura-col">
                <p className="rend-nota">
                  Con {cuenta(itemsLectura.filter((i) => Number.isFinite(i.pct)).length, quienes.slice(0, -1), quienes)} no
                  se separa: hacen falta al menos {MINIMO_PARA_SEPARAR} para saber qué es lo normal.
                </p>
                <Seccion titulo="Todos" color={LECTURA_COLORS.media} n={lectura.media.length}>
                  {lectura.media.map(filaLigera)}
                </Seccion>
              </div>
              <div className="rend-lectura-col">
                <Seccion titulo="Se han frenado" color={LECTURA_COLORS.frenados} n={frenadosLectura.length}>
                  {frenadosLectura.map(filaFrenada)}
                </Seccion>
              </div>
            </div>
          )}

          <p className="rend-pie">
            Por encima y por debajo, respecto a la mediana del bloque. Toca una fila para aislarla en la gráfica.
          </p>
        </div>
      )}
    </Modal>
  );
};
