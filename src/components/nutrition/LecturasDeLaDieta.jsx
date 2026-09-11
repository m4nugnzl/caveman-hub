import { useState } from 'react';
import { Pencil } from 'lucide-react';

import { lastKcalChange, rollingWeightAverage, weightSeries } from '@/domain/anthropometry';
import { MICROS, coverageSaid, microSaid, microVerdict, sumMicros } from '@/domain/micros';
import { cuadra, cycleAverage, cycleMap, macroSplit, optionMacros, targetsFor } from '@/domain/nutrition';
import { metricColor } from '@/domain/metrics';
import { localeNumber, shortDate } from '@/lib/dates';
import { toNum0 } from '@/lib/num';
import { Sparkline } from '@/components/ui/charts';
import { MACRO_META, Medidor, opcionElegida } from './macros';
import { EvolucionPopup } from './EvolucionPopup';

/**
 * LAS LECTURAS DE LA DIETA: el costado, gemelo del de Entreno.
 *
 * ══ Las tres preguntas de quien está tecleando 2.400 ═══════════════════════
 *
 *   · EL DÍA        — lo que suma el menú contra el objetivo, en gramos y en
 *                     gramos por kilo, con la fibra al pie.
 *   · EL CICLO      — a qué casilla le toca cada día y cuánto come de media.
 *   · LA EVOLUCIÓN  — lo pautado contra lo que hizo el peso, fecha a fecha.
 *                     Tarjeta-puerta: abre la historia entera.
 *
 * ══ Eran cuatro, y dos decían lo mismo ═════════════════════════════════════
 *
 * «Esas gráficas se ven feas, no me gustan.»
 *
 * Y lo que se veía en el costado de una dieta cerrada era esto: «El día» con
 * proteína, carbos y grasas, y justo debajo «El reparto» con proteína, carbos y
 * grasas otra vez. La misma lista de tres, dos veces, a dos dedos, cada una con
 * su punto de color —seis puntos— para distinguir tres cosas que ya llevaban su
 * nombre escrito al lado.
 *
 * Y encima mal repartidas: los tres macros caían en una rejilla de DOS columnas,
 * así que la tercera se quedaba sola con un hueco al lado. Un agujero en mitad
 * de la tarjeta que no significaba nada.
 *
 * Ahora es UNA tarjeta y los macros son TRES RENGLONES, que es lo que son: una
 * lista. Cada renglón lleva su nombre a la izquierda y sus cifras alineadas a la
 * derecha —lo que suma contra lo pedido, la diferencia y los gramos por kilo—,
 * de modo que las tres se comparan leyendo en vertical. Ni hueco, ni lista
 * repetida, ni seis puntos de color.
 *
 * ── Los puntos de color se van, y no es sitio ganado ──────────────────────
 * La ley del color de esta casa dice que el disco DISTINGUE. Aquí no distinguía
 * nada: cada renglón lleva la palabra «Proteína» delante. El color se queda
 * donde sí trabaja —la barra del objetivo, el anillo de una opción, la gráfica—
 * y en el costado la única tinta que aparece es la del desvío que se sale.
 *
 * ══ Por qué el costado, y por qué estas clases ═════════════════════════════
 *
 * Medido con cinco comidas: la columna de la derecha de la dieta eran 456 px de
 * tarjetas junto a 2.706 px de menú — **2.250 px de costado vacío, el 83 %**.
 * No estaba vacía por falta de sitio: estaba vacía porque todo lo que se podía
 * leer de un plan se pintaba dentro de la hoja o no se pintaba.
 *
 * Ni una clase nueva de chasis: `.lado-tarjeta`, `.lado-cab`, `.bloque-cifras`,
 * `tarjeta-puerta` y su `.task-hit` son exactamente las del costado del bloque.
 *
 * ══ Y no receta ════════════════════════════════════════════════════════════
 * Ninguna de las tres propone un número. Dicen lo que hay; qué hacer con ello
 * es criterio del entrenador.
 */

/* Los tres que no son la fibra van plegados: la fibra es la que se pauta, y las
   otras tres se consultan cuando alguien pregunta por ellas. */
const OTROS_MICROS = MICROS.filter((m) => m.key !== 'fiber');

const gkg = (gramos, peso) => (peso > 0 && toNum0(gramos) > 0 ? Math.round((toNum0(gramos) / peso) * 100) / 100 : null);

const lecturaKcal = (real, objetivo) => {
  if (!objetivo) return 'sin objetivo en el plan';
  if (cuadra(real, objetivo, 'kcals')) return 'cuadra';
  const diff = real - objetivo;
  return diff > 0 ? `${diff} de más` : `faltan ${Math.abs(diff)}`;
};

/**
 * EL OBJETIVO DEL DÍA: lo que le pides, lo que suma el menú y a cuánto sale por
 * kilo. UNA sección, no dos.
 *
 * ══ Aquí había dos tarjetas con la misma lista de tres macros ══════════════
 *
 * Pegadas, en una columna de 300 px, y medidas en la app real:
 *
 *     ┌ Objetivo · Días de entreno ──────┐   ┌ El día ──────────────────────┐
 *     │ 3100 kcal                        │   │ Kcal      3072/3100  cuadra  │
 *     │ Proteína  120 g          15 %    │   │ Proteína  111/120 g  −9 g    │
 *     │ Carbos    531 g          69 %    │   │ Carbos    521/531 g  −10 g   │
 *     │ Grasas     55 g          16 %    │   │ Grasas     60/55 g   +5 g    │
 *     └──────────────────────────────────┘   └──────────────────────────────┘
 *
 * Proteína, carbos y grasas escritos dos veces a veinte píxeles, y DOS cifras
 * de kcal —3.100 y 3.072/3.100— para la misma pregunta. Es exactamente la
 * avería que este archivo ya cuenta haber corregido dos veces («El día» y «El
 * reparto» primero, «Objetivo» y «El día» después): se arreglaba el dibujo
 * —las dos pasaron a usar el mismo renglón, para que el gramaje cayera bajo el
 * gramaje— pero seguían siendo dos cajas, y dos cajas se leen como dos cosas.
 *
 * Son UNA. Lo que le pides y lo que suma su menú no son dos lecturas: son las
 * dos columnas de la misma lectura, y por eso van en la misma fila —«111/120 g»
 * ya las dice las dos—.
 *
 *     ┌ Objetivo · Días de entreno ────────────────────────── ✎ ┐
 *     │ 3100 kcal                                               │
 *     │ ─────────────────────────────────────────────────────── │
 *     │ Kcal      3072/3100    cuadra                           │
 *     │ Proteína  111/120 g    −9 g       1,89 g/kg             │
 *     │ Carbos    521/531 g    −10 g      8,38 g/kg             │
 *     │ Grasas     60/55 g     +5 g       0,87 g/kg             │
 *     └─────────────────────────────────────────────────────────┘
 *
 * La cifra grande es lo que PAUTAS —es lo que abre el lápiz— y el renglón de
 * kcal lo que suma el menú contra ella. Una cifra por pregunta.
 *
 * Lo único que se pierde es el reparto del objetivo en % (15/69/16). No
 * desaparece: vive en la barra del editor, que es donde ese reparto se decide y
 * donde además se mueve mientras tecleas.
 *
 * Con menú (dieta cerrada) las cifras son «lo que suma / lo que pide» y llevan
 * su diferencia; sin menú (plan por macros) son lo que pide y ya, porque no hay
 * nada que sumar. La sección no cambia de forma entre las dos: cambia lo que
 * tiene dentro, que es la misma regla que sigue la mesa.
 *
 * @param {string} [titulo]   El nombre del día. Con él, la sección es «Objetivo»
 *                            y lleva la cifra grande; sin él es «El día» a secas
 *                            —lo que pasa cuando el objetivo se ha mudado a la
 *                            mesa (plan por macros sin reparto)—.
 * @param {func}   [onEditar] El lápiz. Sin él la sección es de solo lectura, que
 *                            es como la ve el cliente.
 * @param {boolean} [conGkg]  El pie de los g/kg. El portal no tiene los pesajes
 *                            a mano, y «g/kg: sin pesajes todavía» ahí sería
 *                            decirle que le falta algo que no es suyo.
 * @param {func}  [catalogo]  `(alimento) => ficha de referencia | null`, para
 *                            rellenar lo que la copia congelada del alimento no
 *                            diga del envase. Ver `declaredMicro`.
 * @param {boolean} [avanzado] Las cuatro del envase a la vista y contra lo que
 *                            se les pida, en vez de la fibra y un desplegable.
 */
export const ObjetivoDelDia = ({
  meals,
  targets,
  elegidas,
  history,
  juzga,
  onAbrir,
  titulo = null,
  onEditar = null,
  conGkg = true,
  catalogo = null,
  avanzado = false,
}) => {
  const [micros, setMicros] = useState(false);

  const hayMenu = meals.length > 0;

  /* El peso contra el que se leen los g/kg: la media móvil de tres pesajes y no
     el último. Un pesaje suelto se mueve un kilo por la sal de anoche, y con él
     la proteína por kilo cambiaba de 2,1 a 2,0 sin que nadie hubiera tocado la
     dieta. La fecha del último va al lado: un g/kg contra un peso de hace tres
     meses es una cifra que parece fresca y no lo es. */
  const media = rollingWeightAverage(history, 3);
  const puntos = weightSeries(history);
  const peso = media?.average ?? null;
  const cuando = puntos.length > 0 ? puntos[puntos.length - 1].date : null;

  const real = meals.reduce(
    (acc, meal) => {
      const m = optionMacros(opcionElegida(meal, elegidas));
      return {
        protein: acc.protein + m.protein,
        carbs: acc.carbs + m.carbs,
        fats: acc.fats + m.fats,
        kcal: acc.kcal + m.kcal,
      };
    },
    { protein: 0, carbs: 0, fats: 0, kcal: 0 }
  );
  const kcalReal = Math.round(real.kcal);
  const objetivoKcal = toNum0(targets?.targetKcals);

  /* Qué opción está abierta en cada comida, para que se vea con qué se suma. */
  const abiertas = meals.map((meal) => Math.min((elegidas[meal.id] ?? 0) + 1, Math.max(1, (meal.options || []).length)));
  const hayAlternativas = meals.some((meal) => (meal.options || []).length > 1);

  /*
    ══ LA FIBRA QUE NO SUMABA ═══════════════════════════════════════════════

    «La fibra no sé por qué no la añade.»

    Sale de lo que está congelado en cada alimento desde que se guarda la
    declaración del envase (`freezeMicros`). Y ahí estaba el motivo: las cuatro
    cifras del envase llegaron con la migración 0102 y las del catálogo con la
    0104, así que **todo lo pautado antes de eso congeló cuatro ausencias**. Una
    dieta de avena, arroz y lentejas decía «Fibra: no dice» con las tres fichas
    diciéndolo en la biblioteca.

    Así que la copia cae a su ficha de referencia cuando no dice nada, y solo
    entonces (`declaredMicro`). Los macros de la fila no se tocan: una dieta
    pautada en julio sigue sumando lo de julio, que es lo que hace que no se
    mueva sola.

    Se suma lo de las opciones ABIERTAS, que es el mismo día que suman las
    cifras de arriba.
  */
  const alimentos = meals.flatMap((meal) => opcionElegida(meal, elegidas)?.foods || []);
  const resumen = sumMicros(alimentos, catalogo);
  const cobertura = coverageSaid(resumen.fiber);

  /* La cifra que se pauta. `targetKcals` puede ir vacío y salir de los macros:
     entonces se dice, porque no es lo mismo un objetivo escrito que uno
     deducido. Es la misma regla que ya tenía la tarjeta del objetivo. */
  const objetivoEscrito = toNum0(targets?.targetKcals);
  const sumaMacros = macroSplit(targets).total;
  const pautado = objetivoEscrito || (sumaMacros > 0 ? Math.round(sumaMacros) : null);

  return (
    <section className={`lado-tarjeta${onAbrir && hayMenu ? ' tarjeta-puerta' : ''}`} aria-label={titulo ? 'El objetivo del día' : 'El día'}>
      {onAbrir && hayMenu && (
        <button
          type="button"
          className="task-hit"
          onClick={onAbrir}
          aria-label="El día: lo real contra lo esperado y el reparto por comida"
          title="Lo real contra lo esperado y el reparto por comida"
        />
      )}

      <div className="lado-cab">
        <span className="section-label">{titulo ? 'Objetivo' : 'El día'}</span>
        {titulo ? (
          <div className="lado-cab-fila">
            <span className="lado-titulo">{titulo}</span>
            {/* El lápiz es su propio blanco dentro de la tarjeta-puerta: la caja
                entera abre la ventana del día y esto abre el editor del
                objetivo. Dos destinos, dos blancos. Va fuera del `task-hit`
                porque esa capa está DEBAJO del contenido (ver «LA TARJETA-
                PUERTA»), no envolviéndolo. */}
            {onEditar && (
              <button
                type="button"
                className="btn btn-plain btn-icon btn-icon-compact"
                onClick={onEditar}
                aria-label={`Cambiar el objetivo de ${titulo.toLowerCase()}`}
                title="Cambiar el objetivo"
              >
                <Pencil size={15} />
              </button>
            )}
          </div>
        ) : (
          <span className="lado-desde">
            {hayMenu
              ? hayAlternativas
                ? `con las opciones abiertas: ${abiertas.join(' · ')}`
                : 'con lo que hay en cada comida'
              : 'lo que le pides'}
          </span>
        )}
      </div>

      {/* Lo que le PIDES al día, en grande. Debajo, los renglones dicen lo que
          suma su menú contra ella: la cifra grande no se repite ahí —el renglón
          de kcal es «3072/3100», que la lleva dentro—. */}
      {titulo && (
        <>
          <div className="objetivo-cifra">
            <span className="v">{pautado > 0 ? pautado : '—'}</span>
            <span className="u">kcal</span>
          </div>
          {!objetivoEscrito && pautado > 0 && (
            <p className="t-xs t-tertiary">calculadas a partir de los macros</p>
          )}
          {pautado === null && (
            <p className="t-sm t-secondary">
              Sin objetivo puesto{onEditar ? ' — pulsa el lápiz para ponerlo.' : '.'}
            </p>
          )}
          <span className="lado-desde">
            {hayMenu
              ? hayAlternativas
                ? `Su menú, con las opciones abiertas: ${abiertas.join(' · ')}`
                : 'Su menú, con lo que hay en cada comida'
              : 'Sin menú que sumar: lo que cuadra es el día entero'}
          </span>
        </>
      )}

      {/* `is-filas`: los tres macros son una LISTA, no una rejilla de dos con un
          hueco. Ver la cabecera de este archivo. */}
      <div className="medidores is-filas">
        {/* En RENGLÓN como los tres de abajo, y no en columna. Era la única de
            las cuatro cifras que se pintaba con el rótulo encima y el valor
            debajo, así que «1455/3100» caía tres píxeles a la izquierda de
            «83/120 g» y las cuatro no se podían leer en vertical — que es
            exactamente lo que esta sección existe para permitir desde que el
            objetivo y el día son una sola. Sigue separada por su filete: es el
            total de las tres que la descomponen. */}
        {hayMenu && (
          <Medidor
            total
            fila
            label="Kcal"
            campo="kcals"
            juzga={juzga}
            valor={kcalReal}
            objetivo={objetivoKcal}
            lectura={juzga ? lecturaKcal(kcalReal, objetivoKcal) : undefined}
          />
        )}

        {MACRO_META.map(({ key, label }) => {
          const objetivo = toNum0(targets?.[`${key}Grams`]);
          const valor = hayMenu ? Math.round(real[key]) : objetivo;
          const diff = valor - objetivo;
          const porKilo = gkg(objetivo, peso);
          return (
            <Medidor
              key={key}
              fila
              label={label}
              campo={key}
              juzga={juzga && hayMenu}
              valor={valor}
              objetivo={hayMenu ? objetivo : null}
              unidad="g"
              lectura={
                juzga && hayMenu && objetivo
                  ? diff === 0
                    ? 'clavado'
                    : `${diff > 0 ? '+' : '−'}${Math.abs(diff)} g`
                  : undefined
              }
              /* Los gramos por kilo, del OBJETIVO y no de lo que suma el menú:
                 es la cifra con la que se decide si el plan está bien planteado,
                 y no cambia porque hoy se elija otra opción del desayuno. */
              apunte={!conGkg || porKilo === null ? undefined : `${localeNumber(porKilo)} g/kg`}
            />
          );
        })}
      </div>

      {/* El pie de los g/kg solo donde los g/kg existen. En el portal la
          columna no los lleva —no es su cifra, es con la que su entrenador
          juzga el plan— y «g/kg: sin pesajes todavía» allí sería anunciarle que
          le falta algo que nadie le ha pedido. */}
      {conGkg && (
        <p className="t-xs t-tertiary lado-pie">
          {peso ? `g/kg sobre ${localeNumber(peso)} kg` : 'g/kg: sin pesajes todavía'}
          {peso && cuando ? ` · último el ${shortDate(cuando)}` : ''}
        </p>
      )}

      {/*
        ══ LAS CUATRO DEL ENVASE ═══════════════════════════════════════════════

        En reposo, lo de siempre: la fibra dicha en una línea y las otras tres a
        un clic. Con las OPCIONES AVANZADAS puestas son una sección con las
        cuatro a la vista, cada una contra lo que le hayas pedido —si le has
        pedido algo—: es el modo de quien pauta fibra o vigila la sal, y para él
        esconder tres de las cuatro detrás de un botón es un clic por cada vez
        que mira la pantalla.

        Y las dos formas dicen «no dice» mucho menos que antes: ver `alimentos`
        más arriba, donde la copia congelada cae a su ficha de referencia.
      */}
      {hayMenu && avanzado && alimentos.length > 0 && (
        <div className="lado-micros">
          <span className="section-label">Del envase</span>
          <ul className="lado-lineas">
            {MICROS.map(({ key, label, unit, sentido }) => {
              const objetivo = toNum0(targets?.[`${key}Grams`]);
              const veredicto = juzga ? microVerdict(key, resumen[key]?.value, objetivo) : null;
              return (
                <li key={key} className={veredicto && veredicto !== 'ok' ? 'is-fuera' : ''}>
                  <span className="n">{label}</span>
                  <span className="d">
                    {microSaid(key, resumen[key]).replace(` de ${label.toLowerCase()}`, '')}
                    {/* Lo que le pides, con su sentido escrito: un objetivo de
                        fibra es un suelo y uno de sal un techo, y «/30 g» a
                        secas se lee como un macro —o sea, en las dos
                        direcciones—. Ver `MICROS` en `domain/micros.js`. */}
                    {objetivo > 0 && (
                      <small>
                        {sentido === 'min' ? 'mín.' : 'máx.'} {localeNumber(objetivo)} {unit}
                      </small>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          {cobertura && <p className="t-xs t-tertiary lado-pie">{cobertura}</p>}
        </div>
      )}

      {hayMenu && !avanzado && (
        <>
          <p className="t-sm t-secondary">
            {alimentos.length === 0 ? 'Fibra: sin menú que sumar.' : microSaid('fiber', resumen.fiber)}
            {cobertura && <span className="t-tertiary"> · {cobertura}</span>}
          </p>

          {alimentos.length > 0 && (
            <>
              <button type="button" className="lado-mas" onClick={() => setMicros((v) => !v)} aria-expanded={micros}>
                {micros ? 'Ocultar azúcares, saturadas y sal' : 'Azúcares, saturadas y sal'}
              </button>
              {micros && (
                <ul className="lado-lineas">
                  {OTROS_MICROS.map(({ key, label }) => (
                    <li key={key}>
                      <span className="n">{label}</span>
                      <span className="d">{microSaid(key, resumen[key]).replace(` de ${label.toLowerCase()}`, '')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
};

/* ══ EL CICLO ══════════════════════════════════════════════════════════════
   Los días del plan con lo que pide cada uno, el que se está mirando encendido,
   y —cuando el ciclo está repartido— lo que come de media.

   La media ponderada es la cifra que faltaba, y no es un adorno: en un
   alto/bajo ni el alto ni el bajo son «sus calorías». Hasta que existió el mapa
   del ciclo no se podía calcular sin adivinar cuántos días entrena.

   ── Se llamaba «La semana», y para media cartera era mentira ──────────────
   Un ciclo rotativo no tiene semana: tiene una vuelta de tres, cinco o nueve
   días. La tarjeta dice ahora lo que su ciclo dure, y las casillas llegan
   hechas desde `cycleSlots`. */
const TarjetaDelCiclo = ({ plan, dias, casillas, activo, onDia }) => {
  const mapa = cycleMap(plan, casillas);
  const media = cycleAverage(plan, casillas);
  const repartidos = casillas.filter((c) => mapa[c.key]).length;

  return (
    <section className="lado-tarjeta" aria-label="El ciclo">
      <div className="lado-cab">
        <span className="section-label">El ciclo</span>
        <span className="lado-desde">
          {dias.length === 1 ? 'un solo día' : `${dias.length} días de dieta`}
        </span>
      </div>

      <ul className="lado-lineas">
        {dias.map((dia) => {
          const objetivo = toNum0(targetsFor(plan, dia.id).targetKcals);
          /* Cuántas casillas del ciclo le tocan a este. Es lo que convierte la
             lista en un reparto: «Alto ×4 · Bajo ×3» dice el ciclo entero. */
          const veces = casillas.filter((c) => mapa[c.key] === dia.id).length;
          return (
            <li key={dia.id} className={dia.id === activo ? 'is-on' : ''}>
              <button type="button" className="lado-linea-puerta" onClick={() => onDia(dia.id)} title={`Ver ${dia.name.toLowerCase()}`}>
                {dia.name}
                {veces > 0 && <small> ×{veces}</small>}
              </button>
              <span className="d">{objetivo ? `${objetivo} kcal` : 'sin objetivo'}</span>
            </li>
          );
        })}
      </ul>

      {/*
        ══ LA MEDIA, CON SUS MACROS Y EN LA COLUMNA DE LAS CIFRAS ════════════

        «También estaría bien que media fuese pulsable, o no lo sé, y diese la
        media de macros también.»

        Y ya la daba: `cycleAverage` devuelve los cuatro campos del objetivo
        —lo ha hecho desde el primer día— y aquí se leía UNO, dentro de una
        frase, en tinta secundaria, debajo de una lista donde cada día tenía sus
        kcal alineadas a la derecha. La cifra que manda en un ciclado era la
        única de la tarjeta que no estaba en la columna de las cifras.

        Así que no hace falta que sea pulsable: lo que había detrás del clic
        eran tres números que caben en un renglón. Es una fila más de la lista
        —la del total, separada por su filete, como el renglón de kcal de «El
        día»— con los tres macros debajo en voz baja.

        Un ítem que se pulsa para enseñar tres cifras que ya caben es un mando
        de más: ver [[ley-del-reposo]].
      */}
      {dias.length > 1 && (
        media ? (
          <div className="lado-media">
            <div className="lado-media-fila">
              <span className="n">
                De media
                <small> ×{media.days}</small>
              </span>
              <span className="d">{localeNumber(media.targetKcals)} kcal</span>
            </div>
            <p className="lado-media-macros">
              {MACRO_META.map(({ key, label }) => `${label} ${localeNumber(media[`${key}Grams`] ?? 0)} g`).join(' · ')}
            </p>
            {repartidos < casillas.length && (
              <p className="t-xs t-tertiary">
                Sobre {repartidos === 1 ? 'la única casilla repartida' : `las ${repartidos} casillas repartidas`}; quedan{' '}
                {casillas.length - repartidos} sin asignar.
              </p>
            )}
          </div>
        ) : (
          <p className="t-sm t-secondary">
            Sin repartir el ciclo no hay media que dar: reparte los días en la cinta y sale aquí.
          </p>
        )
      )}
    </section>
  );
};

/* ══ LA EVOLUCIÓN ══════════════════════════════════════════════════════════ */
const TarjetaEvolucion = ({ registros, onAmpliar }) => {
  const puntos = weightSeries(registros);
  const ultimo = lastKcalChange(registros);

  return (
    <section className="lado-tarjeta tarjeta-puerta" aria-label="La evolución">
      <button
        type="button"
        className="task-hit"
        onClick={onAmpliar}
        aria-label="La evolución: lo pautado contra el peso, fecha a fecha"
        title="Lo pautado contra el peso, fecha a fecha"
      />
      <div className="lado-cab">
        <span className="section-label">La evolución</span>
        <span className="lado-desde">
          {puntos.length === 0 ? 'sin pesajes' : `${puntos.length} ${puntos.length === 1 ? 'pesaje' : 'pesajes'}`}
        </span>
      </div>

      {puntos.length > 1 && <Sparkline points={puntos} color={metricColor('weight')} height={34} />}

      <p className="t-sm t-secondary">
        {!ultimo
          ? puntos.length === 0
            ? 'En cuanto registre un pesaje, aquí queda lo que tenía pautado ese día.'
            : 'Sus kcal no han cambiado en ningún pesaje ni en ninguna revisión cerrada.'
          : `${ultimo.delta > 0 ? 'Le subiste' : 'Le bajaste'} ${Math.abs(ultimo.delta)} kcal el ${shortDate(ultimo.date)}${
              ultimo.weightDelta === null
                ? ' — todavía sin pesaje posterior.'
                : `; desde entonces, ${ultimo.weightDelta > 0 ? '+' : '−'}${localeNumber(Math.abs(ultimo.weightDelta))} kg.`
            }`}
      </p>
    </section>
  );
};

/**
 * @param registros `dietLog({ history, reviews })` — los pesajes y las fotos de
 *   las revisiones, en una sola lista fechada. Ver `domain/timeline.js`: la
 *   evolución leía solo los pesajes y por eso decía que no había cambios de un
 *   cliente al que se le habían cambiado cuatro veces.
 */
export const LecturasDeLaDieta = ({
  plan,
  variant,
  dias,
  casillas = [],
  meals,
  targets,
  elegidas,
  registros = [],
  cerrado,
  onAbrirDia,
  onDia,
  /* El nombre del día que se está mirando y el lápiz de su objetivo. Van nulos
     cuando el objetivo se ha mudado a la mesa (plan por macros sin reparto):
     entonces esta sección vuelve a ser «El día» a secas y no lo repite. */
  tituloObjetivo = null,
  onEditarObjetivo = null,
  catalogo = null,
  avanzado = false,
  /*
    ── Cuándo NO se pinta «El día» ───────────────────────────────────────────
    Cuando el objetivo se ha mudado a la mesa y no hay menú que sumar (plan por
    macros sin reparto). Entonces esta sección solo podía añadir los g/kg de los
    mismos tres gramajes que la mesa acaba de escribir en grande — la tercera
    lista de macros de la pantalla—. Los g/kg se han ido con ellos, al renglón
    de cada cifra. Ver `MacroTargetCard`, forma «mesa».
  */
  conElDia = true,
}) => {
  const [ventana, setVentana] = useState(null);

  return (
    <div className="dieta-lecturas">
      {conElDia && (
      <ObjetivoDelDia
        meals={cerrado ? meals : []}
        targets={targets}
        elegidas={elegidas}
        history={registros}
        juzga
        onAbrir={onAbrirDia}
        titulo={tituloObjetivo}
        onEditar={onEditarObjetivo}
        catalogo={catalogo}
        avanzado={avanzado}
      />
      )}

      <TarjetaDelCiclo plan={plan} dias={dias} casillas={casillas} activo={variant} onDia={onDia} />

      <TarjetaEvolucion registros={registros} onAmpliar={() => setVentana('evolucion')} />

      {/* La ventana se monta solo abierta: cerrada no calcula nada. */}
      {ventana === 'evolucion' && (
        <EvolucionPopup open registros={registros} onClose={() => setVentana(null)} />
      )}
    </div>
  );
};
