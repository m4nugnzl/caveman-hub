import { useState } from 'react';

import { buildWeightLog, weekDates } from '@/domain/anthropometry';
import { inicialDelDia } from '@/domain/blocks';
import { localeNumber, todayISO, weekStart, weekdayName } from '@/lib/dates';
import { Panel } from '@/components/ui/primitives';

/**
 * APUNTAR EL PESO, ahí mismo.
 *
 * ══ Qué sustituye, y por qué era lo que el dueño llamaba complicado ════════
 *
 * Nada, y ese es el problema. Apuntar el peso desde «Tu revisión» costaba
 * abrir un ASISTENTE de cuatro pantallas: la fila «Tu peso» llevaba su verbo,
 * el verbo abría `ReviewWizard` por el paso del peso, y allí había una casilla,
 * dos botones de navegación y tres pasos más detrás. Para escribir un número de
 * cuatro caracteres que se escribe siete veces por semana.
 *
 * El dueño lo dijo dos veces, y la segunda sin rodeos: *«en vez de ir pulsando
 * y que vayan saliendo pantallas que te piden cosas… la revisión debería ser
 * sencilla de hacer»*.
 *
 * Así que el campo vive donde se pregunta. Es la pieza que el prototipo pone
 * PRIMERA en el teléfono (`docs/portal-dos-aparatos.html`, «Tu peso de hoy») y
 * dentro del primer paso en el monitor.
 *
 * ── Dos gestos, no cinco ──────────────────────────────────────────────────
 * La cifra viene puesta con el último pesaje: se mira y se pulsa. Si estaba
 * mal, se escribe encima y el botón vuelve a ofrecerse solo — sin modo
 * «editar», que era la tercera puerta que el prototipo mandó cerrar.
 *
 * ── Y la semana no es una barra de progreso: es el mando ──────────────────
 * Siete letras con su punto: los días en los que hay pesaje, el elegido
 * encendido. No lleva porcentaje ni semáforo. Dice cuántos hay y cuáles; de los
 * que faltan no se echa la culpa a nadie (`la-app-no-receta`, `ley-del-color`).
 *
 * Y cada casilla se toca, que es lo que arregla el aviso de un cliente que se
 * pesa a diario y transcribe la semana entera el domingo desde la aplicación de
 * su báscula: con un solo día escribible, de siete pesajes entraba uno y la
 * media del periodo —la cifra con la que su entrenador decide— salía de ése.
 * Los días que no han llegado se pintan y no responden.
 *
 * ── El asistente NO se va ─────────────────────────────────────────────────
 * Sigue siendo el sitio de las medidas y del cuestionario, que sí son
 * formularios largos y sí se agradecen por pasos. Lo que deja de estar detrás
 * de él es lo que se hace a diario.
 *
 * ── Y es `card-decide`, que es la excepción de A-03 ───────────────────────
 * En el teléfono el portal aplana sus bloques (`A-03`) salvo UNO por pantalla:
 * el que está esperando una decisión. En «Tu revisión» ese es este —lo demás
 * son estados de la entrega y listas de consulta— así que la caja se queda y la
 * cuenta de «una superficie elevada por pantalla» sigue cuadrando. En el
 * monitor no hay nada que exceptuar: allí todas son tarjetas.
 *
 * @param resumen  `weeklyCheckIn(...)` del periodo que se entrega: sus pesajes,
 *   la media y la de la semana anterior. Se calcula una vez en la pantalla.
 * @param semana   El lunes del periodo (`weekStart`), que es el que fija las
 *   siete casillas. No es «esta semana» cuando se entrega con retraso.
 * @param historial Su antropometría en crudo, para poner el punto en los días
 *   que ya tienen pesaje. Hace falta el historial y no los pesajes del periodo
 *   porque la tira puede enseñar DOS semanas —la que se entrega y la de hoy—.
 * @param revision Cómo se llama la revisión que se debe de antes («tu revisión
 *   del 18 sept»), para poder decir qué es cada fila de la tira. `null` cuando
 *   no se debe ninguna, que es cuando la tira tiene una sola semana.
 * @param ultimo   El último pesaje de su historial, venga de donde venga.
 * @param foto     `cycleFoto(...)` — las kcal vigentes, que viajan con el
 *   pesaje para poder cruzar dieta y peso después. Lo mismo que guarda el
 *   asistente: si aquí no viajara, la mitad de los puntos de esa serie saldrían
 *   sin plan y la escalera se leería como un cambio que nadie hizo.
 * @param onApuntar `(log)` — escribe. La ruta decide si ese día ya existe: un
 *   registro con medidas no se puede sustituir entero por un peso.
 * @param conMedia  El renglón de la media al pie. En el MONITOR va a `false`:
 *   allí la media es la cifra grande del costado (`RevisionEnMonitor · TuMedia`)
 *   y decirla dos veces en la misma pantalla, una en 12 px y otra en 34, es la
 *   avería que este archivo ya corrigió una vez con el verbo del botón. En el
 *   teléfono no hay costado, así que se queda donde estaba.
 */
const kg = (v) => localeNumber(v, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const PesoDeHoy = ({
  resumen,
  semana,
  historial = [],
  revision = null,
  ultimo = null,
  foto = null,
  onApuntar,
  conMedia = true,
}) => {
  /* `null` mientras no se ha tocado: entonces manda la propuesta. En cuanto se
     escribe, manda lo escrito — incluido el vacío, que es alguien borrando para
     poner otra cifra y no «vuelve a proponerme la tuya». */
  const [escrito, setEscrito] = useState(null);
  /* Qué día se está apuntando. `null` es hoy, que es el caso de casi siempre. */
  const [dia, setDia] = useState(null);

  const hoy = todayISO();

  /*
    Las siete casillas del periodo que se entrega. Con cadencia quincenal el
    periodo mide catorce días; se enseña la semana del lunes de la entrega, que
    es la que la casilla de «hoy» puede marcar.

    ── Y la semana de HOY detrás, cuando no son la misma ────────────────────
    Es la ventana de entrega tardía: la revisión que se debe es la del viernes
    pasado y hoy es martes. Con solo la semana de la entrega, quien se pesa a
    diario no tenía dónde apuntar el de hoy; con solo la de hoy —que es lo que
    hacía el teléfono— no tenía dónde apuntar el que su revisión le pide. Las
    dos, en dos filas de siete alineadas por día de la semana, dicen «la de tu
    revisión y ésta» sin ningún rótulo. Lo apuntado en la segunda cuenta igual
    para la revisión que se entrega (`selloDelPeriodo`).
  */
  const lunes = weekStart(hoy);
  const dias = [...weekDates(semana), ...(weekStart(semana) === lunes ? [] : weekDates(lunes))];
  /* Del historial entero y no de los pesajes del periodo: la segunda fila es de
     otra semana, y sus puntos saldrían todos vacíos. Con la lista sin pasar
     —cualquier otro que monte esta pieza— se cae a los del periodo. */
  const pesajes = historial.length > 0 ? historial : resumen.entries || [];
  const porFecha = new Map(
    pesajes.filter((h) => h?.date && h.weight !== null && h.weight !== '').map((h) => [h.date, h])
  );

  /* Hoy si cae dentro de los días que se enseñan; si no, el último que ya pasó:
     el día elegido por defecto tiene que existir en la tira. */
  const pordefecto = dias.includes(hoy) ? hoy : dias.filter((d) => d <= hoy).pop() || dias[0] || hoy;
  const elegido = dia ?? pordefecto;
  const delDia = porFecha.get(elegido) || null;

  /* Qué dice la casilla: lo de ese día si ya se apuntó, y si no, el último
     pesaje. Proponer el anterior es lo que hace que esto sean dos gestos. */
  const propuesta = delDia?.weight ?? ultimo?.weight ?? null;
  const valor = escrito ?? (propuesta === null ? '' : String(propuesta));

  const numero = Number(String(valor).replace(',', '.'));
  const valido = Number.isFinite(numero) && numero > 0;
  /* Ya apuntado y sin tocar la cifra: no hay nada que hacer. Tocarla vuelve a
     ofrecer el verbo, que es cómo se corrige sin un modo «editar». */
  const yaEsta = delDia !== null && numero === Number(delDia.weight);

  const apuntar = () => {
    if (!valido) return;
    onApuntar(buildWeightLog({ date: elegido, weight: numero, nutritionFoto: foto }));
    setEscrito(null);
  };

  const elegir = (fecha) => {
    setDia(fecha);
    /* Lo escrito era de otro día: llevárselo pondría la cifra del lunes en la
       casilla del martes sin que nadie la haya escrito ahí. */
    setEscrito(null);
  };

  return (
    <Panel className="col gap-3 peso-hoy card-decide">
      <div className="row between gap-2">
        <span className="section-label">
          {/* Con dos semanas en la tira hay dos viernes, así que el rótulo lleva
              fecha: sin ella nombra una casilla y se escribe en la otra. */}
          {elegido === hoy
            ? 'Tu peso de hoy'
            : `Tu peso del ${weekdayName(elegido, { conFecha: dias.length > 7 })}`}
        </span>
        {/* Cuándo fue el último, en voz baja. Es lo que explica de dónde sale la
            cifra que viene puesta: sin esto, un número en una casilla vacía
            parece escrito por alguien. */}
        {ultimo?.date && ultimo.date !== hoy && (
          <span className="t-xs t-tertiary tnum">
            El {weekdayName(ultimo.date)} {kg(ultimo.weight)}
          </span>
        )}
      </div>

      {/*
        ══ EL VERBO VA DENTRO DE LA CASILLA (13 sep 2026) ═════════════════════

        Aquí abajo había un botón a todo el ancho que decía «Apuntar 64,7 kg»
        con el 64,7 escrito en grande justo encima. El dueño: *«es un poco
        redundante este texto de apuntar 74,6 y 74,6 arriba»*, y tenía razón —
        la cifra se dice dos veces en dos dedos de pantalla, y la segunda en una
        barra azul de 44 px que era lo más pesado de la pantalla.

        El argumento de escribir la cifra en el verbo era que, con el campo ya
        relleno, «Apuntar» a secas no deja claro qué se guarda. Pegado a la
        casilla dentro de la MISMA pieza, eso deja de ser un problema: se lee
        como una báscula con su botón, que es exactamente lo que es. Y el gesto
        pasa de dos planos a uno.

        Apuntado y sin tocar nada, el verbo se retira y queda la cifra: la ley
        del reposo — un hecho se queda, una oferta se apaga.
      */}
      <div className="peso-hoy-campo">
        <input
          type="text"
          inputMode="decimal"
          className="input peso-hoy-input"
          value={valor}
          onChange={(e) => setEscrito(e.target.value)}
          aria-label={`Tu peso del ${weekdayName(elegido)}, en kilos`}
        />
        <span className="peso-hoy-u" aria-hidden="true">
          kg
        </span>
        {!yaEsta && (
          <button
            type="button"
            className="btn btn-primary peso-hoy-verbo"
            onClick={apuntar}
            disabled={!valido}
          >
            Apuntar
          </button>
        )}
      </div>

      {/* Con dos semanas en la tira, qué es cada fila: catorce casillas iguales
          no dicen que la de arriba es la de la revisión que se debe. */}
      {revision && dias.length > 7 && (
        <span className="t-xs t-tertiary">Los días de {revision} y los de esta semana.</span>
      )}

      <div className="peso-hoy-semana" role="group" aria-label="Elige el día">
        {dias.map((fecha) => (
          <button
            key={fecha}
            type="button"
            className={`peso-hoy-dia${porFecha.has(fecha) ? ' es-puesto' : ''}${
              fecha === elegido ? ' es-hoy' : ''
            }`}
            disabled={fecha > hoy}
            aria-pressed={fecha === elegido}
            aria-label={`${weekdayName(fecha)}${
              porFecha.has(fecha) ? `, ${kg(porFecha.get(fecha).weight)} kilos` : ', sin apuntar'
            }`}
            onClick={() => elegir(fecha)}
          >
            <b>{inicialDelDia(fecha)}</b>
            <i aria-hidden="true" />
          </button>
        ))}
      </div>

      {/* La media, que es la cifra con la que su entrenador trabaja de verdad, y
          la de la semana anterior al lado para poder leerla. Sin veredicto: ni
          «vas bien» ni flecha de colores. */}
      {conMedia && resumen.average !== null && (
        <p className="t-xs t-tertiary">
          Media de esta semana <strong className="t-strong tnum">{kg(resumen.average)} kg</strong>
          {resumen.previousAverage !== null && (
            <> · la anterior <span className="tnum">{kg(resumen.previousAverage)}</span></>
          )}
        </p>
      )}
    </Panel>
  );
};
