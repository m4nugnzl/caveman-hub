/**
 * LOS DÍAS DE SU SEMANA: qué dieta le toca cada uno, con el de hoy encendido.
 *
 * ══ La semana, y no las casillas del ciclo (13 sep 2026) ═══════════════════
 *
 * Esto enseñaba las casillas tal cual: `Lun…Dom` a quien entrena por semanas y
 * **`D1…D9`** a quien lleva un ciclo rotativo. Lo segundo es correcto de modelo
 * —la dieta se reparte por casillas— y es ilegible de calendario: quien abre el
 * teléfono el martes no sabe si hoy es su D4.
 *
 * El dueño lo decidió con la app delante: *«aunque se utilicen microciclos y no
 * días, está bien que la app móvil sea semanal, estilo MyFitnessPal»*. Así que
 * la casilla sigue siendo el modelo y la SEMANA es cómo se enseña. La traducción
 * entre las dos vive en el dominio (`semanaDelCliente`), no aquí: la preguntan
 * las dos formas de esta cinta y ninguna puede contestar distinto.
 *
 * ══ Por qué NO es `TiraDeLaDieta` ══════════════════════════════════════════
 *
 * Porque aquella es la cinta del EDITOR: elige entre los días del plan —«Alto»,
 * «Bajo»— y además renombra, recibe lo que se arrastra, abre menús por casilla y
 * lleva su barra de mandos. Es la pieza correcta para montar una dieta.
 *
 * El cliente no elige entre «Alto» y «Bajo»: elige un DÍA DE SU SEMANA, y lo que
 * quiere saber es cuál le toca hoy y cómo viene el resto. Son dos preguntas
 * distintas sobre el mismo dato, y meterlas en un componente con dos modos lo
 * convertiría en el sitio donde se rompen las dos.
 *
 * Ver la Ley 3 de `docs/replanteamiento-movil-el-aparato.md`: el cliente deja de
 * heredar el instrumental del entrenador.
 *
 * ══ UNA FORMA, Y ES LA DEL TELÉFONO ═══════════════════════════════════════
 *
 * Una tesela por día: la inicial arriba en pequeño y la LETRA de su dieta
 * debajo, grande. Siete teselas es lo que cabe en 392 px y es lo único que hace
 * falta para «hoy, ¿qué como?».
 *
 * Hubo una segunda forma —las mismas siete a lo ancho, en tarjetas— y se retiró
 * el 13 de septiembre. El porqué, justo encima del componente.
 *
 * ── La tesela, y la muesca que se va ──────────────────────────────────────
 * El teléfono marcaba el día abierto con la muesca de la regla, que es la firma
 * de la casa en otras tres pantallas. Aquí se retira a propósito, con el
 * prototipo delante: siete muescas de 3 px sobre texto suelto no se leen como un
 * calendario, y un calendario es exactamente lo que esta fila es desde que se
 * mide en días de la semana. La tesela pintada en macizo dice «hoy» de un vistazo,
 * que es lo que se pregunta con el pulgar. La regla sigue midiendo el peso y la
 * sesión, que es donde SÍ hay una escala.
 *
 * ══ Y cada casilla dice QUÉ DIETA le toca ═════════════════════════════════
 *
 * Aquí hubo una muesca que marcaba «los días altos», y se retiró. Con dos dietas
 * decía la verdad; con tres, una marca de dos estados miente —el medio no es ni
 * alto ni bajo— y clasificar por color está prohibido en esta casa.
 *
 * Lo que dice qué dieta le toca es **la letra** (`siglasDeDietas`), que funciona
 * con cualquier número de dietas.
 *
 * @param dias     `[{ id, corto, largo, key, sesion, esHoy }]` — lo que se pinta.
 *                 `id` identifica la columna (la fecha, cuando es una semana) y
 *                 `key` la casilla del ciclo, que es lo que reparte la dieta. En
 *                 un ciclo de cinco días una semana pisa dos veces la misma
 *                 casilla, así que no pueden ser lo mismo.
 * @param mapa     `{ [casilla]: dayId }` de `cycleMap` — qué día de dieta le toca
 *                 a cada casilla. Sin repartir, el valor es `null`.
 * @param siglas   `{ [dayId]: 'A' }` de `siglasDeDietas`.
 * @param nombres  `{ [dayId]: 'Día alto' }`, para la frase del título.
 * @param activa   El `id` de la columna que se está mirando.
 * @param onDia    Al pulsar una.
 */
/*
  ══ AQUÍ VIVÍA `aLoAncho`, Y SE VA CON EL CALENDARIO DEL MONITOR ═══════════

  Era la otra forma de esta misma lista: siete TARJETAS de doscientos píxeles
  —el día entero, el nombre de la dieta, sus kcal y la sesión— en vez de siete
  teselas de cuarenta y siete. Se montó para que en un monitor no se leyeran
  abreviaturas que allí no hacían falta.

  El 13 de septiembre el dueño la tumbó mirando la pantalla: *«en el PC no me
  gusta tener esa periodicidad del calendario»*. Y la razón de fondo es que en
  el monitor esa lista contestaba dos veces lo mismo que el costado: «Tu plan»
  ya dice qué dietas hay, con sus kcal y cuántos días le toca a cada una. Lo que
  de verdad se elige allí es la DIETA, y eso es «Tus dietas» (`TarjetasDeDietas`).

  Con ella se van `.horario-dias` y las seis clases de su familia. La cinta se
  queda con una sola forma —la del teléfono—, que es donde el calendario semanal
  sí contesta la pregunta de cada mañana.
*/
export const CintaDeDias = ({ dias, mapa, siglas = {}, nombres = {}, activa, onDia }) => (
  <div className="semana-dias" role="tablist" aria-label="Los días de tu semana">
    {dias.map(({ id, corto, largo, key, sesion, esHoy }) => {
      const dia = mapa[key] || null;
      const esta = id === activa;
      /* El título dice la frase entera —«Jueves · Bajo · Pull A»— porque la
         inicial sola no se puede leer con lector de pantalla, y el nombre del
         día de dieta es del plan de esta persona, no de la interfaz. */
      const titulo = [largo, dia ? nombres[dia] : 'sin repartir', sesion]
        .filter(Boolean)
        .join(' · ');

      return (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={esta}
          className={`semana-dia${esta ? ' is-on' : ''}${esHoy ? ' es-hoy' : ''}`}
          onClick={() => onDia(id)}
          title={titulo}
        >
          <span className="semana-dia-k">{corto}</span>

          {/* La letra siempre ocupa su sitio, también sin repartir: si
              apareciera y desapareciera, la cinta cambiaría de alto al elegir
              otro día. */}
          <span className={`semana-dia-sigla${dia ? '' : ' es-vacia'}`}>
            {dia ? siglas[dia] || '·' : '·'}
          </span>
        </button>
      );
    })}
  </div>
);
