import { useMemo, useRef } from 'react';

import { intentLabel, weeksOfBlock } from '@/domain/blocks';
import { variacionTexto } from '@/domain/rendimiento';
import { cifrasDelPase } from '@/domain/temporadas';
import { daysBetween, shortDate } from '@/lib/dates';
import { MenuAcciones } from '@/components/ui/MenuAcciones';

/**
 * UN BLOQUE COMO UN PASE (25 sep 2026).
 *
 * La lista de bloques se lee como una cartera de pases: cada bloque es una
 * tarjeta con la tinta de su intención, y revisarlo exige abrirlo. El pase
 * dice lo justo para reconocerlo y saber cómo va, nada que haya que leer:
 *
 *   · arriba, qué es —el nombre, el split con sus días, las fechas— y, en el
 *     abierto, por qué microciclo va (el anillo);
 *   · abajo, dos cifras: las series por semana que tiene pautadas y cuánto ha
 *     cambiado el rendimiento desde su primer microciclo;
 *   · de fondo, la curva de ese rendimiento, sin ejes: la forma, no la lectura.
 *
 * Nunca «M3», casillas ni la semana: eso es de DENTRO del bloque.
 *
 * ══ Dos variantes ══════════════════════════════════════════════════════════
 *   · `portada` — el bloque de hoy en la portada de Bloques, con el pie de lo
 *     que viene detrás.
 *   · `temporada` — un pase de la cascada compacta de una funda abierta:
 *     solo su cabecera. El elegido lleva el anillo y su detalle va al lado
 *     (`DetalleDelPase`). Un toque lo elige; dos, lo abren.
 *
 * El color sale de `--pase-tinta` y la pintura es `.fondo-de-pase`
 * (`lista-de-bloques.css`), la misma del pase desplegado.
 */

const cuenta = (n, singular, plural) => `${n} ${n === 1 ? singular : plural}`;

const anoDe = (iso) => Number(String(iso || '').slice(0, 4)) || null;

/**
 * «5 ene – 25 ene». El año solo si no es este, y una vez si los dos días son
 * del mismo: «8 dic – 21 dic 2025». Sin final, «desde el 16 feb».
 */
export const rangoDeFechas = (desde, hasta, { hoy = new Date().toISOString() } = {}) => {
  if (!desde) return null;
  const este = anoDe(hoy);
  const a = anoDe(desde);
  const b = anoDe(hasta);
  const conAno = (iso, ano) => (ano && ano !== este ? `${shortDate(iso)} ${ano}` : shortDate(iso));
  if (!hasta) return `desde el ${conAno(desde, a)}`;
  if (a === b) return `${shortDate(desde)} – ${conAno(hasta, b)}`;
  return `${conAno(desde, a)} – ${conAno(hasta, b)}`;
};

/** Semanas de calendario de un pase, de su primer día al último. */
export const semanasDelPase = (pase) => {
  const dias = pase?.desde && pase?.hasta ? daysBetween(pase.desde, pase.hasta) + 1 : 0;
  return dias > 0 ? Math.max(1, Math.round(dias / 7)) : 0;
};

/** Las cifras de un pase (`cifrasDelPase`), memorizadas: todo sale de SU bloque. */
export const useCifrasDelPase = (pase, program, cliente) =>
  useMemo(() => cifrasDelPase(pase, program, cliente), [pase, program, cliente]);

/* ══ LA CURVA DE FONDO ═════════════════════════════════════════════════════
   El índice medio por microciclo, suavizado (Catmull-Rom a Bézier), sin ejes ni
   puntos. Los microciclos sin dato no son ceros: la curva los salta. Con menos
   de dos puntos no hay forma que enseñar y no se dibuja. */

const ANCHO = 300;
const ALTO = 100;

/** Un trazo suave por los puntos: Catmull-Rom pasado a Bézier. */
export const trazoSuave = (puntos) => {
  let d = `M${puntos[0][0]},${puntos[0][1]}`;
  for (let i = 0; i < puntos.length - 1; i++) {
    const p0 = puntos[i - 1] || puntos[i];
    const p1 = puntos[i];
    const p2 = puntos[i + 1];
    const p3 = puntos[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0]},${p2[1].toFixed(1)}`;
  }
  return d;
};

export const CurvaDeFondo = ({ valores = [] }) => {
  const con = valores.map((v, i) => [i, v]).filter(([, v]) => v !== null && v !== undefined);
  if (con.length < 2) return null;
  const min = Math.min(...con.map(([, v]) => v));
  const max = Math.max(...con.map(([, v]) => v));
  /* Un bloque plano se dibuja plano y a media altura, no estirado a todo el alto. */
  const rango = Math.max(max - min, 4);
  const medio = (max + min) / 2;
  const ultimo = valores.length - 1 || 1;
  const puntos = con.map(([i, v]) => [
    Math.round((i / ultimo) * ANCHO),
    /* La curva vive en la franja de arriba del lienzo, del 10 % al 60 %: el
       lienzo empieza a la altura de las cifras y así pasa por detrás de los
       números, no de sus rótulos. */
    ALTO * 0.35 - ((v - medio) / rango) * ALTO * 0.5,
  ]);
  const linea = trazoSuave(puntos);
  return (
    <svg className="pase-curva" viewBox={`0 0 ${ANCHO} ${ALTO}`} preserveAspectRatio="none" aria-hidden="true">
      <path className="pase-curva-area" d={`${linea} L${puntos.at(-1)[0]},${ALTO} L${puntos[0][0]},${ALTO} Z`} />
      <path className="pase-curva-linea" d={linea} vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

/* ══ EL ANILLO: por qué microciclo va el abierto ═════════════════════════ */

const R = 29;
const VUELTA = 2 * Math.PI * R;

const Anillo = ({ va, de }) => {
  const parte = de ? Math.min(1, va / de) : 0;
  return (
    <span
      className="pase-anillo"
      role="img"
      aria-label={de ? `Microciclo ${va} de ${de}` : `Microciclo ${va}`}
    >
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle className="pase-anillo-pista" cx="32" cy="32" r={R} />
        {parte > 0 && (
          <circle
            className="pase-anillo-arco"
            cx="32"
            cy="32"
            r={R}
            strokeDasharray={`${(parte * VUELTA).toFixed(1)} ${VUELTA.toFixed(1)}`}
            transform="rotate(-90 32 32)"
          />
        )}
      </svg>
      <span className="pase-anillo-cifra">
        {va}
        {de ? <small>/{de}</small> : null}
      </span>
    </span>
  );
};

/** El microciclo por el que va: el que dice Entreno si cae en este bloque; si no, el último escrito. */
export const microcicloEnCurso = (program, bloque, semanaEnCurso) => {
  const semanas = weeksOfBlock(program, bloque);
  const i = semanas.indexOf(semanaEnCurso);
  return i >= 0 ? i + 1 : semanas.length;
};

/* ══ LO QUE DICE A LA DERECHA ══════════════════════════════════════════════
   La chapa —«Ahora» o «Previsto»— y «10 sem · 69 series». Igual en el pase
   de la cascada y en el desplegado; lo que venga detrás va debajo. */

export const ResumenDelPase = ({ pase, series, children = null }) => {
  const previsto = pase.tipo === 'borrador';
  const semanas = semanasDelPase(pase);
  return (
    <div className="pase-resumen">
      {(pase.abierto || previsto) && <span className="pase-chapa">{previsto ? 'Previsto' : 'Ahora'}</span>}
      <span className="pase-dato">
        {[semanas > 0 && `${semanas} sem`, series !== null && `${series} series`].filter(Boolean).join(' · ')}
      </span>
      {children}
    </div>
  );
};

/* ══ EL MENÚ DEL PASE ══════════════════════════════════════════════════════
   El «···» lleva las acciones del bloque. El clic derecho sobre el pase abre
   el mismo menú: se busca su botón y se pulsa, sin un segundo menú. */

const abrirMenuDe = (e, raiz) => {
  const boton = raiz.current?.querySelector('.pase-menu');
  if (!boton) return;
  e.preventDefault();
  boton.click();
};

/* ══ EL PASE ═══════════════════════════════════════════════════════════════ */

export const PaseDeBloque = ({
  pase,
  program,
  cliente,
  variante = 'portada',
  /* En la cascada: el que enseña el detalle. */
  elegido = false,
  semanaEnCurso = null,
  /* Lo que viene detrás, para el pie de la portada. */
  siguiente = null,
  onAbrir,
  /* En la cascada, un toque lo elige. */
  onElegir,
  acciones = [],
  /* Un mando que va encima del pase: «Empezar ahora». */
  mando = null,
  /* Arrastrar en «Editar»: `{ onDragStart, onDragEnd }`. */
  arrastre = null,
  hoy,
}) => {
  const raiz = useRef(null);
  const cifras = useCifrasDelPase(pase, program, cliente);
  const b = pase.bloque;
  const previsto = pase.tipo === 'borrador';
  const intencion = intentLabel(pase.intent);
  const fechas = rangoDeFechas(pase.desde, pase.hasta, { hoy });
  const semanas = semanasDelPase(pase);
  const clase = [
    'pase',
    'fondo-de-pase',
    `is-${variante}`,
    previsto && 'is-previsto',
    pase.abierto && 'is-ahora',
    elegido && 'is-elegido',
    arrastre && 'is-arrastrable',
  ]
    .filter(Boolean)
    .join(' ');

  const enCascada = variante === 'temporada';
  const rotuloAbrir = previsto ? `Rellenar ${b.name}` : `Abrir ${b.name}`;

  const menu =
    acciones.length > 0 ? (
      <MenuAcciones clase="btn btn-icon btn-icon-compact pase-menu" ariaLabel={`Acciones de ${b.name}`} items={acciones} />
    ) : null;

  const pct = cifras.pct === null ? null : variacionTexto(cifras.pct / 100);

  return (
    <article
      ref={raiz}
      className={clase}
      style={{ '--pase-tinta': pase.color }}
      data-intent={pase.intent || undefined}
      aria-label={b.name}
      onContextMenu={acciones.length ? (e) => abrirMenuDe(e, raiz) : undefined}
      draggable={Boolean(arrastre)}
      onDragStart={arrastre?.onDragStart}
      onDragEnd={arrastre?.onDragEnd}
    >
      {enCascada ? (
        /* Un toque lo elige y dos lo abren. `aria-pressed` dice cuál se ve. */
        <button
          type="button"
          className="task-hit"
          onClick={() => onElegir?.(pase)}
          onDoubleClick={() => onAbrir?.(b)}
          aria-pressed={elegido}
          aria-label={`Ver ${b.name}`}
        />
      ) : (
        onAbrir && <button type="button" className="task-hit" onClick={() => onAbrir(b)} aria-label={rotuloAbrir} />
      )}

      {variante === 'portada' ? (
        <>
          {!previsto && <CurvaDeFondo valores={cifras.curva.map((p) => p.indice)} />}
          <div className="pase-cabeza">
            <div className="pase-quien">
              <span className="pase-antetitulo">
                {previsto ? 'Previsto' : 'Ahora'}
                {intencion ? ` · ${intencion}` : ''}
              </span>
              <h3 className="pase-nombre">{b.name}</h3>
              {cifras.split && <span className="pase-split">{cifras.split}</span>}
              {fechas && <span className="pase-fechas">{fechas}</span>}
            </div>
            {pase.abierto && (
              <Anillo va={microcicloEnCurso(program, b, semanaEnCurso)} de={pase.largo > 0 && b.plannedWeeks ? pase.largo : null} />
            )}
          </div>

          <div className="pase-cifras">
            {cifras.series !== null && (
              <span className="pase-cifra">
                <b>{cifras.series}</b>
                <small>series / sem</small>
              </span>
            )}
            {pct && (
              <span className="pase-cifra">
                <b>{pct}</b>
                <small>rendimiento</small>
              </span>
            )}
            {previsto && semanas > 0 && (
              <span className="pase-cifra">
                <b>{semanas}</b>
                <small>{semanas === 1 ? 'semana' : 'semanas'}</small>
              </span>
            )}
          </div>

          {(siguiente || menu || mando) && (
            <footer className="pase-pie">
              <span className="pase-siguiente">
                {siguiente
                  ? `Siguiente · ${siguiente.bloque.name} · ${cuenta(semanasDelPase(siguiente), 'semana', 'semanas')}`
                  : ''}
              </span>
              <span className="pase-mandos">
                {mando}
                {menu}
              </span>
            </footer>
          )}
        </>
      ) : (
        <header className="pase-cabecera">
            <div className="pase-quien">
              <h3 className="pase-nombre">{b.name}</h3>
              {fechas && <span className="pase-fechas">{fechas}</span>}
            </div>
            <ResumenDelPase pase={pase} series={cifras.series} />
        </header>
      )}
    </article>
  );
};
