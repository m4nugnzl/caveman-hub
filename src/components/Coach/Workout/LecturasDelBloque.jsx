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

/* ══ EL BLOQUE EN CIFRAS ════════════════════════════════════════════════════ */

const TarjetaCifras = ({ resumen, unidad, onAmpliar }) => (
  <section className="lado-tarjeta tarjeta-puerta" aria-label="El bloque en cifras">
    {/* La tarjeta entera abre su ventana. Ver «LA TARJETA-PUERTA». */}
    <button
      type="button"
      className="task-hit"
      onClick={onAmpliar}
      aria-label="El historial de todos los bloques, con su gráfica"
      title="El historial de todos los bloques, con su gráfica"
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
    <div className="bloque-cifras is-2">
      <div className="bloque-cifra">
        <span className="v">{resumen.series ?? '—'}</span>
        <span className="k">series por {unidad.toLowerCase()}</span>
      </div>
      <div className="bloque-cifra">
        <span className="v">{localeNumber(resumen.kg)}</span>
        <span className="k">kg levantados</span>
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
        <div className="bloque-cifra">
          <span className="v">
            {resumen.hechas}
            <small> / {resumen.planificadas}</small>
          </span>
          <span className="k">entrenamientos</span>
        </div>
      )}
      {resumen.adherencia !== null && resumen.adherencia !== undefined && (
        <div className="bloque-cifra">
          <span className="v">
            {resumen.adherencia}
            <small> %</small>
          </span>
          <span className="k">de lo pautado</span>
        </div>
      )}
    </div>
  </section>
);

/* ══ EL VOLUMEN ═════════════════════════════════════════════════════════════
   La cuenta por grupo vive en el dominio (`volumeByGroup`) y las barras en
   `ui/BarrasDeVolumen`. */

const TarjetaVolumen = ({ grupos, unidad, onAmpliar }) => {
  const pasados = grupos.filter((m) => m.mrv && m.valor > m.mrv).length;
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
          <BarrasDeVolumen grupos={grupos.slice(0, GRUPOS_A_LA_VISTA)} />
          {grupos.length > GRUPOS_A_LA_VISTA && (
            <button type="button" className="lado-mas" onClick={onAmpliar}>
              y {grupos.length - GRUPOS_A_LA_VISTA} más
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
  const peso = (f) => (f.dir === 'down' ? 0 : f.dir === 'flat' ? 1 : 2);
  const orden = [...filas].sort((a, b) => peso(a) - peso(b) || b.delta - a.delta);
  const quietos = filas.filter((f) => f.dir !== 'up').length;

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
        {orden.slice(0, EJERCICIOS_A_LA_VISTA).map((f) => (
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
        {orden.length > EJERCICIOS_A_LA_VISTA && (
          <li className="progresion-mas">y {orden.length - EJERCICIOS_A_LA_VISTA} más</li>
        )}
      </ul>
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
  const resumen = blockSummary(program, bloque);
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
        {plan.sessions.length > 0 && (
          <TarjetaVolumen grupos={grupos} unidad={unidad} onAmpliar={() => setVentana('volumen')} />
        )}
        {progresion.length > 0 && <TarjetaProgresion filas={progresion} unidades={unidades} />}
      </div>

      {/* Las ventanas se montan solo abiertas: cerradas no calculan nada. */}
      {ventana === 'historial' && (
        <HistorialPopup
          open
          onClose={() => setVentana(null)}
          program={program}
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
