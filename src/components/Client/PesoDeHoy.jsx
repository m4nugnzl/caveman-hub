import { useState } from 'react';

import { buildWeightLog, weekDates } from '@/domain/anthropometry';
import { inicialDelDia } from '@/domain/blocks';
import { localeNumber, todayISO, weekdayName } from '@/lib/dates';
import { Panel } from '@/components/ui/primitives';

/**
 * APUNTAR EL PESO DE HOY, ahí mismo.
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
 * ── Y la semana no es una barra de progreso ───────────────────────────────
 * Siete letras con su punto: los días en los que hay pesaje, el de hoy marcado.
 * No lleva porcentaje ni semáforo. Dice cuántos hay y cuáles; de los que faltan
 * no se echa la culpa a nadie (`la-app-no-receta`, `ley-del-color`).
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
 * @param ultimo   El último pesaje de su historial, venga de donde venga.
 * @param foto     `cycleFoto(...)` — las kcal vigentes, que viajan con el
 *   pesaje para poder cruzar dieta y peso después. Lo mismo que guarda el
 *   asistente: si aquí no viajara, la mitad de los puntos de esa serie saldrían
 *   sin plan y la escalera se leería como un cambio que nadie hizo.
 * @param onApuntar `(log)` — escribe. Es `addAnthropometryLog` de la ruta.
 * @param conMedia  El renglón de la media al pie. En el MONITOR va a `false`:
 *   allí la media es la cifra grande del costado (`RevisionEnMonitor · TuMedia`)
 *   y decirla dos veces en la misma pantalla, una en 12 px y otra en 34, es la
 *   avería que este archivo ya corrigió una vez con el verbo del botón. En el
 *   teléfono no hay costado, así que se queda donde estaba.
 */
const kg = (v) => localeNumber(v, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const PesoDeHoy = ({ resumen, semana, ultimo = null, foto = null, onApuntar, conMedia = true }) => {
  /* `null` mientras no se ha tocado: entonces manda la propuesta. En cuanto se
     escribe, manda lo escrito — incluido el vacío, que es alguien borrando para
     poner otra cifra y no «vuelve a proponerme la tuya». */
  const [escrito, setEscrito] = useState(null);

  const hoy = todayISO();
  const deHoy = (resumen.entries || []).find((e) => e.date === hoy) || null;

  /* Qué dice la casilla: lo de hoy si ya se apuntó, y si no, el último pesaje.
     Proponer el de la semana pasada es lo que hace que esto sean dos gestos. */
  const propuesta = deHoy?.weight ?? ultimo?.weight ?? null;
  const valor = escrito ?? (propuesta === null ? '' : String(propuesta));

  const numero = Number(String(valor).replace(',', '.'));
  const valido = Number.isFinite(numero) && numero > 0;
  /* Ya apuntado y sin tocar la cifra: no hay nada que hacer. Tocarla vuelve a
     ofrecer el verbo, que es cómo se corrige sin un modo «editar». */
  const yaEsta = deHoy !== null && numero === Number(deHoy.weight);

  const apuntar = () => {
    if (!valido) return;
    onApuntar(buildWeightLog({ date: hoy, weight: numero, nutritionFoto: foto }));
    setEscrito(null);
  };

  /* Las siete casillas del periodo que se entrega. Con cadencia quincenal el
     periodo mide catorce días; se enseña la semana del lunes de la entrega,
     que es la que la casilla de «hoy» puede marcar. */
  const dias = weekDates(semana);
  const conPeso = new Set((resumen.entries || []).map((e) => e.date));

  return (
    <Panel className="col gap-3 peso-hoy card-decide">
      <div className="row between gap-2">
        <span className="section-label">Tu peso de hoy</span>
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
          aria-label="Tu peso de hoy, en kilos"
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

      <div className="peso-hoy-semana" aria-hidden="true">
        {dias.map((fecha) => (
          <span
            key={fecha}
            className={`peso-hoy-dia${conPeso.has(fecha) ? ' es-puesto' : ''}${
              fecha === hoy ? ' es-hoy' : ''
            }`}
          >
            <b>{inicialDelDia(fecha)}</b>
            <i />
          </span>
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
