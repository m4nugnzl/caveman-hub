import { useState } from 'react';

import { blockPlan, blockSummary, isCurrentBlock, volumeByGroup } from '@/domain/blocks';
import { unitLabel, unitLabelPlural } from '@/domain/training';
import { strengthByExercise } from '@/domain/reading';
import { localeNumber, shortDate } from '@/lib/dates';
import { BarrasDeVolumen } from '@/components/ui/BarrasDeVolumen';
import { HistorialPopup } from './HistorialPopup';
import { VolumenPopup } from './VolumenPopup';

/**
 * CÓMO VA EL BLOQUE: las tres lecturas, en el costado.
 *
 * ══ De dónde vienen ════════════════════════════════════════════════════════
 * Estas tarjetas han vivido en cuatro sitios en una semana: un margen fijo de
 * 300 px, una capa detrás del verbo «Cómo va el bloque», sueltas debajo de la
 * rejilla, y una pestaña «Análisis». El dueño las describió al verlas colgando
 * del final del plan: «las gráficas o información visual está debajo tirada sin
 * mucha lógica».
 *
 * No estaban tiradas por estar abajo: estaban tiradas por no tener COLUMNA. El
 * sitio es el costado del bloque, la misma columna en la que, con una hoja
 * abierta, van la progresión del ejercicio y cómo lo llevó. En la mesa, lo que
 * hay que hacer; en el costado, con qué se juzga. Siempre, en las dos vistas,
 * en el mismo canto de la pantalla.
 *
 * ══ Y siguen sin recetar ═══════════════════════════════════════════════════
 * Señalan: qué sube, qué lleva semanas clavado, dónde el plan se aparta, cuánto
 * volumen lleva cada grupo contra su MRV. Qué hacer con ello es del entrenador.
 */

const GRUPOS_A_LA_VISTA = 6;

/** «3 semanas», «1 hoja»… */
const cuenta = (n, singular, plural) => `${n} ${n === 1 ? singular : plural}`;

/* La carga del bloque, en la celda de 72 px que le da el frame: «490.250» son
   seis cifras a 18 px —83 px medidos— y no caben en ninguna de las cuatro. A
   partir de diez mil kilos se dice en miles —«490k», como en el frame— y del
   millón en adelante en millones, que es la precisión que esta lectura
   necesita: se usa para comparar un bloque con otro, no para cuadrar una suma.
   Por debajo se escribe entera, porque ahí sí cabe y «8k» sería redondear lo
   que no hace falta redondear. */
const kgCorto = (kg) => {
  if (kg >= 1000000) return `${localeNumber(kg / 1000000, { maximumFractionDigits: 1 })}M`;
  if (kg >= 10000) return `${localeNumber(Math.round(kg / 1000))}k`;
  return localeNumber(kg);
};

/* ══ EL BLOQUE EN CIFRAS ════════════════════════════════════════════════════ */

const TarjetaCifras = ({ resumen, unidad, onAmpliar }) => (
  <section className="lado-tarjeta tarjeta-puerta" aria-label="El bloque en cifras">
    {/* La tarjeta entera abre su ventana. Ver «LA TARJETA-PUERTA». */}
    <button
      type="button"
      className="task-hit"
      onClick={onAmpliar}
      aria-label="Ver el historial de bloques"
      title="Ver el historial de bloques"
    />
    {/* «2 microciclos» era el titular de esta tarjeta y se ha ido: la tira del
        programa los dibuja uno a uno —`M1 · M2 · en curso`— dos dedos más
        arriba, así que aquí era contarlos otra vez con palabras. Queda el
        rótulo y las dos cifras que no están en ningún otro sitio. */}
    {/*
      ── Y DESDE CUÁNDO VA, QUE TAMBIÉN BAJA DE LA CABECERA ──────────────────
      «Desde el 14 ago» fue la última frase que quedaba en la fila del bloque, y
      el dueño siguió viendo allí demasiado: «sigo viendo mucha información en
      la cabecera». Es una lectura —cuándo empezó esto—, no una identidad, así
      que su sitio es esta tarjeta, con las otras cuatro. Al lado del rótulo y
      no como una cifra más: no es una cifra, es la fecha desde la que cuentan
      las cifras de debajo.
    */}
    <div className="lado-cab">
      <span className="section-label">Este bloque</span>
      {resumen.desde && <span className="lado-desde">desde el {shortDate(resumen.desde)}</span>}
    </div>
    {/*
      ── LAS CUATRO, EN UNA SOLA CAJA Y EN UN RENGLÓN (17 sep · nodo 204:4) ──
      Eran cuatro casillas rellenas en dos por dos, con la cifra arriba y el
      rótulo debajo. En el frame son UN renglón de cuatro columnas dentro de una
      sola caja hundida, y el rótulo va ENCIMA de la cifra.

      Las dos cosas cambian por el mismo motivo. Cuatro casillas separadas se
      leen como cuatro lecturas independientes —que es lo que la vuelta anterior
      quiso decir— y no lo son: son las cuatro medidas del MISMO bloque, y lo
      que se hace con ellas es compararlas de un vistazo. Una caja, cuatro
      columnas. Y en un renglón de cuatro el ojo baja por cada columna, así que
      con la cifra delante hay que volver atrás en cada una para saber de qué
      era; con el rótulo delante, la fila se lee de corrido.

      Los rótulos son los del frame —una palabra— y la frase entera se queda en
      el `title`: «series por microciclo» no cabe en 68 px sin partirse en tres
      renglones, y cuatro celdas así son una caja de noventa píxeles de alto
      para cuatro números.
    */}
    <div className="bloque-cifras is-compacta">
      <div className="bloque-cifra" title={`Series pautadas por ${unidad.toLowerCase()}`}>
        <span className="k">series</span>
        <span className="v">{resumen.series ?? '—'}</span>
      </div>
      <div className="bloque-cifra" title="Kilos levantados en este bloque">
        <span className="k">carga</span>
        <span className="v">
          {kgCorto(resumen.kg)}
          <small>kg</small>
        </span>
      </div>
      {/*
        ── Y VUELVEN LOS ENTRENAMIENTOS Y LA ADHERENCIA ──────────────────────
        Se fueron de aquí a la cabecera del bloque el día que esa fila tenía
        830 px de hueco al que echarles. Ya no los tiene: con las chapas, la
        fecha, el indicador de guardado y el «···», la cabecera es lo que el
        dueño llamó «tanta información atora un poco».

        Aquí son lo que son: dos lecturas más de «cómo va este bloque», al lado
        de las otras dos y con su misma forma. La cabecera se queda con lo que
        IDENTIFICA el bloque —su nombre, su estado y desde cuándo va—, que es
        para lo que sirve una cabecera.
      */}
      {resumen.planificadas > 0 && (
        <div className="bloque-cifra" title="Entrenamientos hechos de los planificados">
          <span className="k">sesiones</span>
          <span className="v">
            {resumen.hechas}
            <small>/{resumen.planificadas}</small>
          </span>
        </div>
      )}
      {/* «Cumplido» y «carga», cortas otra vez desde el 21 sep: las cuatro
          vuelven a un renglón (el dueño prefirió la caja única a las
          mini-tarjetas de 2 × 2) y «cumplimiento» no cabe en su cuarto. La
          frase entera sigue en el `title`. */}
      {resumen.adherencia !== null && resumen.adherencia !== undefined && (
        <div className="bloque-cifra" title="Series hechas sobre las pautadas">
          <span className="k">cumplido</span>
          <span className="v">
            {resumen.adherencia}
            <small>%</small>
          </span>
        </div>
      )}
    </div>
  </section>
);

/* ══ EL VOLUMEN ═════════════════════════════════════════════════════════════
   La cuenta por grupo vive en el dominio (`volumeByGroup`) y las barras en
   `ui/BarrasDeVolumen`. */

/* Exportada porque el COMPOSITOR necesita decir lo mismo: cuántas series lleva
   cada grupo en el bloque que se está montando. Es presentación pura —recibe
   los grupos ya contados— así que vale igual para un bloque guardado y para uno
   que todavía no está escrito en ninguna parte. Escribir allí una segunda
   tarjeta sería tener dos maneras de decir la misma cifra. */
export const TarjetaVolumen = ({ grupos, unidad, onAmpliar }) => {
  /*
    ── «Y 8 MÁS» ABRE AQUÍ, NO EN OTRA PANTALLA (20 sep) ───────────────────
    Este verbo abría la ventana del volumen, que es la tabla de grupos POR
    HOJA: para leer los ocho grupos que faltaban había que salir del costado,
    cruzar una capa y volver a buscar la columna del total. La ventana sigue
    estando —la abre la tarjeta entera, que es su puerta— pero para lo que de
    verdad dice: cómo reparte el bloque ese volumen hoja a hoja.

    Lo que pide «y 8 más» es el RESTO DE ESTA LISTA, y el resto de esta lista
    cabe donde está. Es el mismo gesto que los micros de la dieta
    (`LecturasDeLaDieta`): un `.lado-mas` con `aria-expanded` que enseña y
    esconde lo suyo sin sacar a nadie de su sitio. Y el verbo se mantiene en
    el nombre al volver —«Ocultar los otros 8»—, que es la señalización de la
    casa: una acción conserva su nombre en todo el camino.
  */
  const [todos, setTodos] = useState(false);
  const pasados = grupos.filter((m) => m.mrv && m.valor > m.mrv).length;
  const ocultos = grupos.length - GRUPOS_A_LA_VISTA;
  return (
    <section className={`lado-tarjeta${grupos.length > 0 ? ' tarjeta-puerta' : ''}`} aria-label="Volumen por grupo">
      {grupos.length > 0 && (
        <button
          type="button"
          className="task-hit"
          onClick={onAmpliar}
          aria-label="Todos los grupos contra su MRV"
          title="Todos los grupos contra su MRV"
        />
      )}
      <div className="lado-cab">
        <span className="section-label">Volumen por {unidad.toLowerCase()}</span>
        <div className="lado-cab-fila">
          <span className="lado-titulo">{cuenta(grupos.length, 'grupo', 'grupos')}</span>
          {pasados > 0 && (
            <span className="lado-aviso" title="Grupos por encima de su MRV estimado">
              {pasados} sobre el MRV
            </span>
          )}
        </div>
      </div>
      {grupos.length === 0 ? (
        <p className="t-sm t-tertiary">Sin ejercicios todavía.</p>
      ) : (
        <>
          <BarrasDeVolumen grupos={todos ? grupos : grupos.slice(0, GRUPOS_A_LA_VISTA)} />
          {ocultos > 0 && (
            <button
              type="button"
              className="lado-mas"
              onClick={() => setTodos((v) => !v)}
              aria-expanded={todos}
            >
              {todos ? `Ocultar los otros ${ocultos}` : `y ${ocultos} más`}
            </button>
          )}
        </>
      )}
    </section>
  );
};

/* ══ LA PROGRESIÓN: qué se mueve y qué lleva semanas clavado ════════════════
   Sale de `strengthByExercise` —el mismo 1RM estimado que usa la lectura del
   Resumen— filtrado a los ejercicios de ESTE bloque. Señala; qué hacer con
   ellos es cosa del entrenador. */

/* Cuatro y no seis. Con seis, las tres tarjetas medían 745 px y empujaban la
   página 95 px por debajo de la ventana a 1600 × 950: lo que se caía por el
   canto de abajo era el «+ hoja» de la mesa, o sea el verbo para añadir una
   hoja al bloque. Cuatro sigue siendo una LISTA —que es lo que se pidió cuando
   esto era una frase suelta— y cabe. Las que no entran siguen contándose en
   «y N más». */
const EJERCICIOS_A_LA_VISTA = 4;

/*
  ── Era una frase, y ahora es una lectura ─────────────────────────────────
  Esta tarjeta decía «Progresión · sube en 18 de 18» y, cuando no había ninguno
  atascado, ahí se acababa: un rótulo y una oración donde las otras dos tienen
  cifra y barras. El dueño, literal: «progresión es un texto, solo dice
  progresión en 18 de 18, queda fatal».

  Ahora enseña SIEMPRE la lista, con el mismo renglón para todos —nombre a la
  izquierda, cuánto se ha movido a la derecha— y en el orden en que se mira:
  primero lo que baja, luego lo clavado, y después lo que más sube. La cifra de
  arriba pasa a ser una cuenta, como en las otras dos tarjetas, y el aviso de
  «sin moverse» se queda porque es lo único que la lista no dice de un vistazo
  cuando hay más de seis.

  Sigue sin recetar: dice cuánto se ha movido cada uno, no qué hacer con ello.
*/
const TarjetaProgresion = ({ filas, unidades }) => {
  /* Ver la nota de `TarjetaVolumen`: el mismo verbo, el mismo gesto. Aquí
     además «y 16 más» ERA UN `<li>`: iba pintado de azul y en negrita —la
     forma con la que esta casa dice «esto se pulsa»— y no se podía pulsar. La
     única manera de ver el ejercicio diecisiete no existía. */
  const [todos, setTodos] = useState(false);
  const peso = (f) => (f.dir === 'down' ? 0 : f.dir === 'flat' ? 1 : 2);
  const orden = [...filas].sort((a, b) => peso(a) - peso(b) || b.delta - a.delta);
  const quietos = filas.filter((f) => f.dir !== 'up').length;
  const ocultos = orden.length - EJERCICIOS_A_LA_VISTA;

  /* Lo que dice el renglón de la derecha: los kilos ganados o perdidos sobre su
     1RM estimado, y en los clavados cuántos entrenamientos llevan sin subir,
     que es el dato y no el adjetivo. */
  const movimiento = (f) => {
    if (f.dir === 'flat') return `${f.weeks} sin subir`;
    const signo = f.delta > 0 ? '+' : '−';
    return `${signo}${localeNumber(Math.abs(f.delta))} kg`;
  };

  return (
    <section className="lado-tarjeta" aria-label="Progresión de los ejercicios">
      <div className="lado-cab">
        <span className="section-label">Progresión</span>
        <div className="lado-cab-fila">
          <span className="lado-titulo">{cuenta(filas.length, 'ejercicio', 'ejercicios')}</span>
          {quietos > 0 && (
            <span className="lado-aviso" title={`Sin mejorar su 1RM estimado en ${unidades} seguidos`}>
              {quietos} sin moverse
            </span>
          )}
        </div>
      </div>
      <ul className="progresion-quietos">
        {(todos ? orden : orden.slice(0, EJERCICIOS_A_LA_VISTA)).map((f) => (
          <li
            key={f.name}
            title={`${f.name}: 1RM estimado ${
              f.dir === 'down' ? 'a la baja' : f.dir === 'flat' ? 'plano' : 'al alza'
            } en sus últimos ${f.weeks} entrenamientos`}
          >
            <span className="n">{f.name}</span>
            <span className={`d is-${f.dir}`}>{movimiento(f)}</span>
          </li>
        ))}
      </ul>
      {/* Fuera del `<ul>`: no es una fila de la lista, es el verbo de la
          tarjeta, y así es EXACTAMENTE el mismo objeto que el del volumen —un
          `.lado-mas` detrás del filete que cierra la lista—. Dos tarjetas
          vecinas con el mismo verbo se escriben una sola vez. */}
      {ocultos > 0 && (
        <button
          type="button"
          className="lado-mas"
          onClick={() => setTodos((v) => !v)}
          aria-expanded={todos}
        >
          {todos ? `Ocultar los otros ${ocultos}` : `y ${ocultos} más`}
        </button>
      )}
    </section>
  );
};

/* ══ EL REGISTRO SE FUE, Y NO SE HA PERDIDO NADA ═══════════════════════════
   Aquí había una cuarta tarjeta con la lista de cambios del bloque, cada uno
   con su tramo y sus tres verbos («volver al bloque», «dejarlo más tiempo»,
   «aplicar al bloque»). Era una SEGUNDA COPIA: los mismos tres verbos ya están
   en la fila del ejercicio al que afectan, dentro de la hoja
   (`HojaDeSeries.jsx`), que es donde se decide y donde se ve contra qué se
   decide. El dueño: «registro ya aparece en las estadísticas de bloque».

   El camino completo sigue existiendo y no pasa por aquí: el bloque marca con
   «✱ M9» qué hojas llevan una excepción y en qué microciclos
   (`.plan-col-excepcion`), y al abrir esa hoja el cambio está en su renglón
   con sus verbos. Se dice UNA vez, donde se puede hacer algo con ello.
   ══════════════════════════════════════════════════════════════════════════ */

/* ══ LA PESTAÑA ═════════════════════════════════════════════════════════════ */

export const LecturasDelBloque = ({
  program,
  cliente,
  bloque,
  semanaEnCurso,
  onIrBloque,
  onIrSemana,
  onFechaSemana,
}) => {
  const [ventana, setVentana] = useState(null); // 'historial' | 'volumen'

  const plan = blockPlan(program, bloque);
  const esActual = isCurrentBlock(program, bloque);
  const cycleType = cliente?.cycleType || 'weekly';
  const unidad = unitLabel(cycleType);
  const unidades = unitLabelPlural(cycleType);
  const resumen = blockSummary(program, bloque, cliente);
  const grupos = volumeByGroup(plan.sessions);

  /* La progresión de los ejercicios de ESTE bloque, solo en el actual: en un
     bloque cerrado la hoja es archivo y ya no hay microciclo que montar. Con
     menos de 3 entrenamientos por ejercicio, `strengthByExercise` calla solo. */
  const progresion = esActual
    ? strengthByExercise(program?.microcycles || []).filter((f) =>
        plan.sessions.some((h) => (h.exercises || []).some((ex) => ex.name === f.name))
      )
    : [];

  return (
    <div className="bloque-lecturas">
      <div className="bloque-comova">
        <TarjetaCifras
          resumen={resumen}
          unidad={unidad}
          onAmpliar={() => setVentana('historial')}
        />
        {/* La `key` es el bloque, y es lo que devuelve las dos listas a su medida
            al cambiar de bloque: dejar «y 8 más» abierto y saltar a uno de cinco
            grupos enseña una tarjeta desplegada que nadie ha desplegado. Un
            estado de VISTA no sobrevive al objeto que se está viendo. */}
        {plan.sessions.length > 0 && (
          <TarjetaVolumen
            key={bloque?.id}
            grupos={grupos}
            unidad={unidad}
            onAmpliar={() => setVentana('volumen')}
          />
        )}
        {progresion.length > 0 && (
          <TarjetaProgresion key={bloque?.id} filas={progresion} unidades={unidades} />
        )}
      </div>

      {/* Las ventanas se montan solo abiertas: cerradas no calculan nada. */}
      {ventana === 'historial' && (
        <HistorialPopup
          open
          onClose={() => setVentana(null)}
          program={program}
          cliente={cliente}
          bloque={bloque}
          semanaEnCurso={semanaEnCurso}
          unidad={unidad}
          unidades={unidades}
          onIrBloque={(b) => {
            setVentana(null);
            onIrBloque(b);
          }}
          onIrSemana={(w) => {
            setVentana(null);
            onIrSemana(w);
          }}
          onFechaSemana={onFechaSemana}
        />
      )}
      {ventana === 'volumen' && (
        <VolumenPopup open onClose={() => setVentana(null)} bloque={bloque} hojas={plan.sessions} unidad={unidad} />
      )}
    </div>
  );
};
