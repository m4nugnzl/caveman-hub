import { useMemo } from 'react';

import { exerciseTrend } from '@/domain/week';
import { toNum } from '@/lib/num';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * La progresión del ejercicio: semanas en filas, series en columnas.
 *
 * ── Por qué esta orientación ────────────────────────────────────────────────
 * Progresar es leer hacia abajo: la serie 1 de la semana 1, debajo la de la 2,
 * debajo la de la 3. Cada serie es un grupo de tres minicolumnas —kg · reps ·
 * rir— siempre en el mismo sitio, así que la vista baja por la columna de kilos
 * y ve si suben. Los kilos que superan la semana anterior van en positivo; los
 * que bajan, en negativo. La semana abierta lleva la marca de brasa.
 *
 * El ejercicio se elige pulsándolo en la hoja o desde el menú de arriba —el
 * mismo menú de la aplicación, no un desplegable del navegador—.
 */
const SEMANAS = 6;
/*
  ── Tres series, porque cinco NO caben ──────────────────────────────────────
  Eran cinco, y cinco series son quince minicolumnas de kg · reps · rir en los
  ~450 px de la tarjeta del costado: 25 px por columna para escribir «102.5».
  Medido sobre la aplicación con datos de verdad, el kilo de la última semana
  se salía de su celda y pisaba el rótulo de al lado — «B3·M2102.!». No era un
  fallo de estilo: era pedirle a la tarjeta el doble de lo que mide.

  La tarjeta enseña lo que cabe y la ventana que abre —«Ver toda la
  progresión»— tiene TODO: todas las semanas y todas las series. Es el reparto
  que su documentación ya decía tener.
*/
const SERIES_MAX = 3;

const numero = toNum;

const CAMPOS = [
  { key: 'kg', label: 'kg' },
  { key: 'reps', label: 'reps' },
  { key: 'rir', label: 'rir' },
];

export const ComparativaEjercicio = ({ microcycles, ejercicios = [], name, weekNumber, onElegir, onAmpliar = null, etiqueta = (w) => `S${w}` }) => {
  /* Recorre el programa entero: no se rehace por cada tecla en una celda. */
  const indice = Math.max(0, ejercicios.findIndex((ex) => ex.name === name));
  const trend = useMemo(() => (name ? exerciseTrend({ microcycles, name, weekNumber }) : null), [microcycles, name, weekNumber]);
  const semanas = trend ? trend.sessions.slice(-SEMANAS) : [];
  const seriesTotales = Math.max(0, ...semanas.map((s) => s.sets.length));
  const series = Math.min(SERIES_MAX, seriesTotales);
  /*
    ── Las columnas tienen un suelo, y por eso la tabla puede desplazarse ─────
    Eran `minmax(0, 1fr)`: con cinco series son quince minicolumnas en unos 450
    px, treinta píxeles cada una, y «102.5» en la tipografía de datos mide más
    que eso. El texto no se recortaba dentro de su celda —se salía— y en la
    captura el kilo de la última semana se comía el rótulo de al lado:
    «B3·M2102.!». Un número que pisa a otro no es un dato, es un borrón.

    Con suelo, cuando de verdad no caben, la tabla se desplaza a lo ancho
    DENTRO de su tarjeta (ver `.comparativa-tabla`) y no se pierde ninguna
    cifra.

    ── Y el rótulo pasa de 44 a 64 px (frame `48:39`) ────────────────────────
    44 eran los justos para que «B2·M1» no se saliera, escrito de corrido y
    tocando los dos cantos de su celda. Ahora el rótulo son dos renglones —el
    bloque encima, el microciclo debajo— y esto es una columna de tabla con
    filete: necesita el aire que el frame le da.
  */
  /*
    ── Y LAS TRES MINICOLUMNAS NO MIDEN LO MISMO ─────────────────────────────
    «Para el caso en el que los kg son 3 cifras se queda muy pegado a las
    reglas.» Las nueve iban a `minmax(32px, 1fr)` y la tabla está EXACTAMENTE
    en su mínimo dentro de la tarjeta —64 + 9×32 = 352 en 354 px—, así que el
    `1fr` no reparte nada: las nueve miden 32 clavados. «104.5» mide 35,3 a 13
    px, o sea que se sale de su celda por los dos lados y toca los filetes.

    No hay sitio que añadir, pero sí que repartir: en un grupo de kg · reps ·
    rir, los kilos son el único dato que puede llevar cuatro cifras y un
    decimal, y al lado hay dos columnas que escriben «8» y «2». El grupo sigue
    midiendo lo mismo —96 px— y por dentro se reparte 44 · 26 · 26, que le deja
    a «104.5» algo más de 4 px a cada lado. Las proporciones van al `fr` para
    que el reparto siga siendo ése cuando la tarjeta es más ancha y el `fr`
    sí tiene algo que repartir.
  */
  const columnas = `64px repeat(${series}, minmax(44px, 1.4fr) minmax(26px, 0.8fr) minmax(26px, 0.8fr))`;

  return (
    <aside className={`comparativa${onAmpliar && name ? ' tarjeta-puerta' : ''}`} aria-label="Progresión del ejercicio">
      {/*
        La cabecera de las tarjetas laterales, siempre igual: el rótulo, el
        título y, si hay entre qué elegir, un paso ‹ › a la derecha. Lo que abre
        la ventana es la TARJETA entera (ver «LA TARJETA-PUERTA»); el paso ‹ ›
        conserva su blanco propio.
      */}
      {onAmpliar && name && (
        <button type="button" className="task-hit" onClick={onAmpliar} aria-label={`${name}: ver toda la progresión`} title="Ver toda la progresión" />
      )}
      <div className="lado-cab">
        <span className="section-label">Progresión</span>
        <div className="lado-cab-fila">
          <span className="lado-titulo">{name || 'Sin ejercicio'}</span>
          {ejercicios.length > 1 && (
            <span className="lado-paso">
              <button type="button" className="btn btn-icon btn-icon-compact" aria-label="Ejercicio anterior" onClick={() => onElegir?.(ejercicios[(indice - 1 + ejercicios.length) % ejercicios.length].name)}>
                <ChevronLeft size={15} />
              </button>
              <button type="button" className="btn btn-icon btn-icon-compact" aria-label="Ejercicio siguiente" onClick={() => onElegir?.(ejercicios[(indice + 1) % ejercicios.length].name)}>
                <ChevronRight size={15} />
              </button>
            </span>
          )}
        </div>
      </div>

      {!trend ? (
        <p className="t-sm t-tertiary">Todavía no hay ninguna serie anotada de este ejercicio.</p>
      ) : (
        <>
          {/*
            ── EL TOPE, Y SU DIFERENCIA EN SU PROPIO RENGLÓN ────────────────
            Iban los tres en la misma línea —«102.5  kg tope  +22.5 desde M1»—
            y son dos cosas de rango distinto: la cifra con su unidad es el
            dato, y la diferencia es lo que le ha pasado. El frame (`48:11`)
            las parte en dos renglones y con eso el «kg tope» deja de leerse
            como parte de la frase del delta.

            ── Y SE VA LA LÍNEA ────────────────────────────────────────────
            La sparkline dibujaba la misma subida que la columna de kilos de
            la tabla de aquí debajo, microciclo a microciclo y con los números
            puestos. El frame no la pinta y tiene razón: en una tarjeta que YA
            enseña la serie entera, el trazo es el mismo dato otra vez y en
            peor resolución.
          */}
          <div className="comparativa-forma">
            <div className="comparativa-tope">
              <span className="v">{trend.to ?? '—'}</span>
              <span className="u">kg tope</span>
            </div>
            {trend.from !== null && trend.to !== null && trend.from !== trend.to && (
              <span className={`delta ${trend.to > trend.from ? 'delta-good' : 'delta-bad'}`}>
                {trend.to > trend.from ? '+' : ''}
                {Math.round((trend.to - trend.from) * 10) / 10} desde {etiqueta(trend.sessions[0].week)}
              </span>
            )}
          </div>

          <div className="comparativa-tabla" role="table" aria-label={`${name}: kilos, repeticiones y RIR por serie, microciclo a microciclo`}>
            {/*
              ── LA TABLA SE CIERRA Y SE DIVIDE (frame 48:37) ────────────────
              Era una rejilla suelta de pastillas hundidas con 2 px de canal.
              En el frame es una TABLA: caja con canto, las dos filas de rótulo
              en banda, un filete entre microciclos y otro entre series — que
              es lo que deja leer «la serie 2 de M3» sin contar minicolumnas.

              El filete vertical lo lleva la ÚLTIMA minicolumna de cada grupo
              (`is-fin`), menos la del último: un filete al canto derecho de la
              tabla sería un segundo canto pegado al primero. Va por clase y no
              por `nth-child` porque las tres filas de esta tabla tienen un
              número de hijos distinto —la de series agrupa de tres en tres— y
              un `3n+1` acertaría en una y fallaría en las otras dos.
            */}
            <div className="comparativa-fila is-series" role="row" style={{ gridTemplateColumns: columnas }}>
              {/* La esquina de la tabla: encabeza la columna de los microciclos
                  y por eso no dice nada. Va en blanco y sin filete — llevaba
                  `is-fin`, y el filete de una celda vacía se queda flotando a
                  media altura del renglón. */}
              <span className="comparativa-esquina" />
              {Array.from({ length: series }, (_, i) => (
                <span
                  key={i}
                  className={`comparativa-serie${i < series - 1 ? ' is-fin' : ''}`}
                  style={{ gridColumn: `span ${CAMPOS.length}` }}
                >
                  Serie {i + 1}
                </span>
              ))}
            </div>
            <div className="comparativa-fila is-head" role="row" style={{ gridTemplateColumns: columnas }}>
              <span className="comparativa-esquina" />
              {Array.from({ length: series }, (_, i) =>
                CAMPOS.map((c, j) => (
                  <span
                    key={`${i}-${c.key}`}
                    className={j === CAMPOS.length - 1 && i < series - 1 ? 'is-fin' : undefined}
                  >
                    {c.label}
                  </span>
                ))
              )}
            </div>
            {semanas.map((s, fila) => {
              /*
                ── CON VARIOS BLOQUES, LA ETIQUETA ES DOS COSAS ──────────────
                `weekLabel` devuelve «M3» mientras hay un solo bloque y
                «B2·M1» en cuanto hay dos. Con seis filas eso es una columna
                que repite «B1·» cuatro veces y luego cambia a «B2·» sin que
                nada lo señale: seis cadenas casi iguales donde lo único que
                importa es DÓNDE cambian.

                Así que la etiqueta se parte por su punto: el bloque en voz
                baja encima y el microciclo debajo, en su sitio de siempre. Y
                el cambio de bloque se dice con un filete más fuerte en la
                fila que lo estrena, que es la pregunta de verdad —«esto de
                aquí para abajo ya es otro bloque»—. Con un solo bloque no
                hay prefijo y la columna se queda exactamente como estaba.
              */
              const rotulo = etiqueta(s.week);
              const corte = rotulo.indexOf('·');
              const deBloque = corte > 0 ? rotulo.slice(0, corte) : null;
              const micro = corte > 0 ? rotulo.slice(corte + 1) : rotulo;
              const rotuloAntes = fila > 0 ? etiqueta(semanas[fila - 1].week) : null;
              const estrena = Boolean(deBloque) && rotuloAntes !== null && !rotuloAntes.startsWith(`${deBloque}·`);
              return (
              <div
                key={s.week}
                className={`comparativa-fila${s.week === weekNumber ? ' is-actual' : ''}${estrena ? ' is-otro-bloque' : ''}`}
                role="row"
                style={{ gridTemplateColumns: columnas }}
              >
                <span className="comparativa-semana is-fin" title={rotulo}>
                  {deBloque && <small>{deBloque}</small>}
                  {micro}
                </span>
                {Array.from({ length: series }, (_, i) => {
                  const set = s.sets[i];
                  const antes = numero(semanas[fila - 1]?.sets[i]?.kg);
                  const kg = numero(set?.kg);
                  /* Tres estados y UN color: la bajada en rojo, lo que se
                     quedó igual en tinta baja y lo que subió en tinta plena.
                     Progresar se ve porque la columna va en negro y se corta
                     donde alguien se atascó (ver `.comparativa-celda.is-igual`). */
                  const tono =
                    kg === null || antes === null ? '' : kg < antes ? 'is-baja' : kg > antes ? '' : 'is-igual';
                  return CAMPOS.map((c, j) => {
                    const v = set?.[c.key];
                    const vacio = v === null || v === undefined || v === '';
                    return (
                      <span
                        key={`${i}-${c.key}`}
                        className={`comparativa-celda${c.key === 'kg' && tono ? ` ${tono}` : ''}${c.key === 'kg' ? ' is-kg' : ''}${vacio ? ' is-vacia' : ''}${j === CAMPOS.length - 1 && i < series - 1 ? ' is-fin' : ''}`}
                      >
                        {vacio ? '·' : v}
                      </span>
                    );
                  });
                })}
              </div>
              );
            })}
          </div>
          {/* Lo que la tarjeta no enseña se dice, no se esconde: el resto de
              las series está en la ventana que abre la propia tarjeta.

              ── Y se dice DE QUÉ es ese total ──────────────────────────────
              Decía «Las 3 primeras de 8 series» al lado de una hoja que ponía
              «4 series», y las dos cifras eran ciertas hablando de cosas
              distintas: la hoja dice lo que toca HOY y este 8 es el máximo que
              ha llegado a hacer en las últimas seis sesiones. Sin decirlo, el
              8 se lee como el número del ejercicio y contradice a la hoja que
              tiene a un palmo. */}
          {seriesTotales > series && (
            <p className="t-xs t-tertiary">
              Las {series} primeras de {seriesTotales} series. Ábrelo para verlas todas.
            </p>
          )}
          {trend.stalled >= 3 && <p className="t-xs t-tertiary">{trend.stalled} microciclos sin superar el tope.</p>}
        </>
      )}
    </aside>
  );
};
