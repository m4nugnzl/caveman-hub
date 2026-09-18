import { useMemo } from 'react';

import { blocksOf, currentBlock, weekLabel, weeksOfBlock } from '@/domain/blocks';
import { metricColor } from '@/domain/metrics';
import { executedSessions } from '@/domain/sessions';
import { unitLabel, weekTonnage } from '@/domain/training';
import { localeNumber } from '@/lib/dates';
import { Tarjeta, TarjetaVacia } from './Tarjeta';

/*
  Ocho columnas y no doce. La tarjeta pasó a medir media fila con el rediseño
  (frame 50:211), y ahí doce columnas dejan cada una en 26 px: la cifra que va
  encima de la barra —«21,9k»— mide más que su propia columna y se pisa con la
  vecina. Ocho es lo que el frame dibuja y lo que cabe con su cifra. La historia
  entera sigue en la ventana «a fondo», que es donde vive el detalle.
*/
const MAX_SEMANAS = 8;

/* La tendencia es la media de los TRES últimos microciclos cerrados. */
const VENTANA = 3;

/** 21.868 → «21,9k». La cifra exacta vive en el `title` y en el total. */
const corto = (v) =>
  v >= 1000 ? `${localeNumber(v / 1000, { maximumFractionDigits: 1 })}k` : localeNumber(v);

/** 0,038 → «+4 %»; con el signo menos de verdad, no el guion. */
const cambio = (r) => {
  const p = Math.round(r * 100);
  if (p === 0) return '=';
  return `${p > 0 ? '+' : '−'}${localeNumber(Math.abs(p))} %`;
};

/**
 * EL TONELAJE — cuántos kilos mueve cada microciclo del bloque.
 *
 * ══ Por qué es una tarjeta y no medio «El entreno» (frame 50:211) ══════════
 *
 * Eran dos gráficos dentro de una misma caja a lo ancho, y la gramática de la
 * casa lo dice desde el principio: *«una tarjeta que enseña dos gráficos es dos
 * tarjetas»* (ver `Tarjeta`). El prototipo lo corrige: dos cajas de media fila,
 * una para el tonelaje y otra para el volumen, cada una con su título, su frase
 * y su pie. Son dos preguntas distintas —cuánto movió y dónde se lo pusiste— y
 * ahora se leen como tales.
 *
 * ── Las barras van en HTML y no en SVG ─────────────────────────────────────
 * Porque el dibujo del frame no es una gráfica con ejes: es una fila de
 * columnas con su cifra encima y su nombre debajo. Puesto en SVG habría que
 * componer cada rótulo a mano sin saber lo que mide la letra, y el eje de la
 * izquierda —que el frame no tiene— volvería a comerse cuarenta píxeles de los
 * trescientos que mide la caja. Aquí la cifra ES el eje.
 *
 * ── Y la que está en curso sigue apagada ───────────────────────────────────
 * El frame pinta la última columna en acento, como «activa». Aquí no: a mitad
 * de semana el tonelaje de la semana en curso es la mitad, y encendida se leería
 * como el récord del bloque. Va con el canto DISCONTINUO —la ley de la casa:
 * continuo es lo que pasó, discontinuo lo que aún no— y el pie lo dice con
 * todas las letras.
 *
 * ── «La veo pobre» (18 sep, cuarta vuelta) ──────────────────────────────────
 * Eran ocho columnas del mismo morado y una cifra encima: se veía que subía,
 * y nada más. Ahora debajo de cada cifra va el cambio contra la anterior, en
 * tinta y sin semáforo —que el tonelaje baje no es malo: una descarga baja a
 * propósito, y la app no juzga lo que no sabe—, y la última CERRADA va en su
 * color entero y las de antes en el mismo color rebajado: es la que se mira.
 *
 * Hubo también una MEDIA del bloque, en cápsula y en raya discontinua sobre
 * las barras. Se quitó el mismo día («quita la media»): con la tendencia al
 * lado eran dos líneas contando casi lo mismo, y la raya cortaba las barras.
 *
 * ── El conjunto (18 sep, quinta vuelta) ─────────────────────────────────────
 * «Haz más bonito el conjunto». Tres cajas sobraban: las dos cifras de la
 * cabecera iban en cápsulas con canto y el dibujo en una bandeja hundida,
 * todo dentro de la tarjeta — caja sobre caja sobre caja. Ahora las cifras
 * son dos datos sueltos con un filete entre ellos, y las barras se asientan
 * directamente en la tarjeta sobre su suelo.
 *
 * ── Y la tendencia, una MEDIA MÓVIL en puntos y línea (18 sep) ─────────────
 * La media dice «mucho o poco»; no dice «hacia dónde». Encima de las barras va
 * la media de los tres últimos microciclos cerrados en cada columna, con su
 * punto. Primero fue una recta de mínimos cuadrados y el dueño la tumbó con
 * razón: un bloque que sube cuatro microciclos y cae en la descarga salía
 * «todo hacia abajo», porque la recta reparte la caída del final entre todo
 * el bloque. La media móvil sigue a los datos: sube mientras suben y solo al
 * final acusa la caída. Las dos primeras columnas promedian lo que hay (una y
 * dos), para que la línea empiece donde empieza el bloque. La de en curso no
 * entra: su media semana no es un dato todavía. Con menos de tres cerradas no
 * se pinta, que la media móvil sería la propia barra.
 */
export const TarjetaTonelaje = ({ program, microcycles, cycleType, isClient = false, onAbrir }) => {
  const unit = unitLabel(cycleType);
  const bloque = useMemo(() => currentBlock(program), [program]);
  const bloques = useMemo(() => blocksOf(program), [program]);
  const semanasBloque = useMemo(() => weeksOfBlock(program, bloque || {}), [program, bloque]);

  /* La semana EN CURSO se dibuja apagada: a mitad de semana su tonelaje es la
     mitad, y apagada se lee como lo que es —sin cerrar— y no como una caída. */
  const enCurso = useMemo(() => {
    const ultima = [...microcycles].sort((a, b) => b.weekNumber - a.weekNumber)[0];
    return ultima && executedSessions(ultima).length < (ultima.days || []).length ? ultima.weekNumber : null;
  }, [microcycles]);

  const barras = useMemo(
    () =>
      semanasBloque
        .slice(-MAX_SEMANAS)
        .map((w) => ({
          week: w,
          label: weekLabel(program, w, unit.charAt(0)).replace(/^B\d+·/, ''),
          value: weekTonnage(microcycles, w),
          cerrada: w !== enCurso,
        }))
        /* Una semana sin sesión anotada es un hueco, no un cero: en barras un
           cero es una caída que no ha existido. */
        .filter((t) => t.value > 0),
    [semanasBloque, microcycles, program, unit, enCurso]
  );

  const total = barras.reduce((a, b) => a + b.value, 0);
  const cerradas = barras.filter((b) => b.cerrada);
  /* Las cerradas son siempre las primeras —la de en curso es la última—, así
     que el índice de la media móvil es el de la columna. */
  const movil =
    cerradas.length >= VENTANA
      ? cerradas.map((_, i) => {
          const tramo = cerradas.slice(Math.max(0, i - VENTANA + 1), i + 1);
          return tramo.reduce((a, b) => a + b.value, 0) / tramo.length;
        })
      : null;
  const tope = Math.max(1, ...barras.map((b) => b.value));
  const pct = (v) => Math.min(100, Math.max(0, (v / tope) * 100));
  const alto = (i) => 100 - pct(movil[i]);
  const abierta = barras.find((b) => !b.cerrada) || null;
  const ultimaCerrada = cerradas[cerradas.length - 1]?.week ?? null;
  /* Hacia dónde va la tendencia: su último punto contra el anterior. */
  const giro = movil && movil.length > 1 ? movil[movil.length - 1] / movil[movil.length - 2] - 1 : null;

  return (
    <Tarjeta
      rotulo={`Tonelaje por ${unit.toLowerCase()}`}
      sub={`Kilos que movió cada ${unit.toLowerCase()} de ${bloque?.name || 'este bloque'}`}
      span={6}
      className="tonelaje"
      vacia={barras.length === 0}
      accion={
        barras.length === 0 ? null : (
          <div className="ton-sumas">
            <span className="ton-suma">
              <span className="k">Total</span>
              <span className="v">{corto(total)} kg</span>
            </span>
            {movil && (
              <span className="ton-suma" title={`Media de los ${VENTANA} últimos microciclos cerrados`}>
                <span className="k">
                  <i className="ton-muestra-recta" aria-hidden="true" />
                  Tendencia
                </span>
                <span className="v">
                  {corto(Math.round(movil[movil.length - 1]))} kg
                  {giro !== null && <small> {cambio(giro)}</small>}
                </span>
              </span>
            )}
          </div>
        )
      }
    >
      {barras.length === 0 ? (
        <TarjetaVacia>
          {isClient
            ? 'Cuando entrenes, aquí verás cuántos kilos mueves cada semana.'
            : 'Sin series anotadas en este bloque.'}
        </TarjetaVacia>
      ) : (
        <>
          <div className="ton-plot" style={{ '--dato': metricColor('tonnage') }}>
            {barras.map((b, i) => {
              const antes = i > 0 ? barras[i - 1].value : null;
              /* La línea, columna a columna: de la mitad de la calle izquierda
                 al centro, y del centro a la mitad de la derecha. Entre dos
                 puntos la línea es recta, así que en la calle vale la media de
                 los dos y los trozos casan. */
              const conPunto = Boolean(movil) && i < movil.length;
              const yc = conPunto ? alto(i) : 0;
              const yi = conPunto && i > 0 ? (alto(i - 1) + yc) / 2 : null;
              const yd = conPunto && i + 1 < movil.length ? (alto(i + 1) + yc) / 2 : null;
              const clase = !b.cerrada ? ' is-abierta' : b.week === ultimaCerrada ? ' is-ultima' : '';
              return (
                <div
                  className={`ton-col${clase}`}
                  key={b.week}
                  title={`${b.label}: ${localeNumber(b.value)} kg${b.cerrada ? '' : ' — en curso'}`}
                >
                  <span className="ton-v">
                    {corto(b.value)}
                    {/* El cambio contra la anterior; la de en curso no lo lleva:
                        a media semana saldría «−60 %» y no ha bajado nada. */}
                    <small>{b.cerrada && antes ? cambio(b.value / antes - 1) : ' '}</small>
                  </span>
                  <span className="ton-caja" aria-hidden="true">
                    {/* El color es del DATO y se escribe una vez, en el dominio:
                        el tonelaje tiene el suyo en todo el producto (`--dato`). */}
                    <i style={{ height: `${Math.max(3, pct(b.value))}%` }} />
                    {conPunto && (
                      <svg className="ton-recta" viewBox="0 0 100 100" preserveAspectRatio="none">
                        {yi !== null && <line x1="0" y1={yi} x2="50" y2={yc} vectorEffect="non-scaling-stroke" />}
                        {yd !== null && <line x1="50" y1={yc} x2="100" y2={yd} vectorEffect="non-scaling-stroke" />}
                      </svg>
                    )}
                    {conPunto && <b className="ton-punto" style={{ bottom: `${100 - yc}%` }} />}
                  </span>
                  <span className="ton-k">{b.label}</span>
                </div>
              );
            })}
          </div>
          {/* El pie del frame —de qué microciclos habla y cuál está en curso—
              con la puerta al final, en el mismo renglón: una tarjeta de media
              fila no tiene ancho que gastar en una línea para un verbo. */}
          <div className="ton-pie">
            <span className="tarjeta-pie">
              {barras.length > 1
                ? `${unit}s ${barras[0].label}–${barras[barras.length - 1].label}`
                : `${unit} ${barras[0].label}`}
              {bloques.length > 1 ? ` · ${bloques.length} bloques` : ''}
            </span>
            <span className="ton-pie-mandos">
              {abierta && <span className="ton-chapa">{abierta.label} en curso</span>}
              <button type="button" className="cab-accion is-puerta" aria-haspopup="dialog" onClick={onAbrir}>
                Ver a fondo
              </button>
            </span>
          </div>
        </>
      )}
    </Tarjeta>
  );
};
