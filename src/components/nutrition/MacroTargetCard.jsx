import { useState } from 'react';
import { Pencil } from 'lucide-react';

import { macroSplit, targetsFor } from '@/domain/nutrition';
import { localeNumber, shortDate } from '@/lib/dates';
import { MACRO_META, MacroLista, macroBreakdown } from './macros';
import { EditarObjetivo } from './EditarObjetivo';

/**
 * El objetivo de UN día: la cifra calórica y sus tres macros.
 *
 * ══ Dos formas, un solo editor ═════════════════════════════════════════════
 *
 * · `forma="lado"` (la de siempre) — la tarjeta del costado: rótulo, nombre del
 *   día, la cifra grande y los tres macros en renglones. Va a plomo con «El
 *   día», que está justo debajo diciendo los mismos gramos en g/kg.
 * · `forma="mesa"` — una sección de la hoja, con las cuatro cifras en grande.
 *   Se usa cuando el plan es por macros y no hay reparto: entonces el objetivo
 *   es todo lo que se pauta, y lo que se pauta va en la mesa.
 *
 * En las dos, cambiarlo abre la MISMA ventana con las cuatro casillas, su vista
 * previa del reparto y el aviso de descuadre.
 *
 * ── Aquí hubo una barra de tres colores ────────────────────────────────────
 * Con un filete, una espiga y una gota, y los porcentajes en píldoras. Decía lo
 * mismo que los tres números escritos debajo, y hacía que el ámbar significara
 * «carbos» en una pantalla donde el ámbar significa «ojo con esto» pegado a una
 * cifra. La barra se quedó donde de verdad trabaja —el editor, donde el tramo
 * crece según tecleas— y la tarjeta pasó a `MacroLista`. Ver [[ley-del-color]].
 *
 * ── Los pasos diarios ya no están aquí ──────────────────────────────────────
 * Se fueron a `GoalCard`, con el cardio. Esta tarjeta es de UNA VARIANTE y la
 * actividad es de la persona: metida aquí, el campo solo existía en la tarjeta de
 * los días de entreno —en la de descanso había que esconderlo a mano— y daba a
 * entender que eran los pasos de esos días.
 */
export const MacroTargetCard = ({
  plan,
  variant = 'default',
  title,
  editable = false,
  onSave,
  onAbrir = null,
  /* `'lado'` es la tarjeta del costado de siempre; `'mesa'`, la sección que
     baja a la hoja cuando el plan es por macros y no hay reparto que poner.
     Misma pieza, mismo editor: lo único que cambia es la forma. */
  forma = 'lado',
  /* Las cuatro del envase en el editor, si el entrenador las tiene puestas. La
     LECTURA de esta tarjeta no cambia: los macros son el objetivo y los micros,
     composición; se leen sumados en el costado. Ver `AjustesPlan`. */
  avanzado = false,
  /* El peso contra el que se leen los g/kg, y de cuándo es. Solo la forma de
     MESA los pinta: es la única en la que el objetivo no tiene al lado «El día»
     del costado diciéndolos. Ver `bloque-cifras` más abajo. */
  peso = null,
  cuando = null,
  /* El menú del día y de dónde salieron las calorías la última vez, para que el
     editor pueda enseñar qué le hace el objetivo nuevo al menú. Va nulo desde la
     revisión, que no tiene menú delante. Ver `EditarObjetivo`. */
  reajuste = null,
}) => {
  const targets = targetsFor(plan, variant);
  const macros = macroSplit(targets);
  /* Los gramos ya redondeados y el reparto en %, para la forma de mesa. */
  const reparto = macroBreakdown({
    protein: targets.proteinGrams,
    carbs: targets.carbsGrams,
    fats: targets.fatsGrams,
  });

  const [editing, setEditing] = useState(false);
  const open = () => setEditing(true);

  const kcals = targets.targetKcals ?? (macros.total > 0 ? Math.round(macros.total) : null);
  const derived = !targets.targetKcals && macros.total > 0;
  /*
    ══ EL DESCUADRE DEL PLAN VIVE EN EL EDITOR, Y SOLO ALLÍ ═══════════════════

    Aquí había un aviso —«los macros suman 2.732 kcal, por debajo del objetivo
    de 3.050»— que decía exactamente lo mismo que el del formulario de abajo. Y
    esa duplicación era la mitad de un problema mayor: en la misma pantalla se
    llegaron a medir CUATRO cifras de kcal, todas ciertas y ninguna presentada.
    Una cifra por pregunta, y esta pregunta —«mi objetivo no casa consigo
    mismo»— se responde donde se arregla, que es tecleando los cuatro campos.

    El cliente nunca lo vio (`editable` lo escondía) por una razón que sigue
    valiendo entera: le señalaba un fallo del trabajo de su entrenador que él no
    puede tocar. Ahora tampoco lo ve el entrenador FUERA del sitio donde lo
    corrige, que es la otra mitad de la misma idea.
  */

  const nombre = (title || 'Objetivo diario').replace(/^Objetivo(?: ·)? /, '');

  /*
    EL EDITOR es su propia pieza (`EditarObjetivo`): el objetivo se lee ya en
    tres formas —esta tarjeta, la sección de la mesa y la sección del costado de
    la dieta— y atar el formulario a una de ellas obligaba a montar esa lectura
    aunque no se quisiera pintar. Aquí queda solo la lectura y su llave.
  */
  const ventana = (
    <EditarObjetivo
      open={editing}
      onClose={() => setEditing(false)}
      title={title || 'Objetivo diario'}
      targets={targets}
      onSave={onSave}
      avanzado={avanzado}
      reajuste={reajuste}
    />
  );

  /*
    ══ EN LA MESA, CUANDO LA MESA NO TIENE OTRA COSA QUE HACER ════════════════

    Un plan «por macros / solo el objetivo» es el chasis de fábrica, o sea lo
    primero que ve cualquier cliente nuevo. Y su hoja tenía OCHOCIENTOS CINCUENTA
    PÍXELES vacíos: la mesa —746 px de ancho, el sitio noble de la pantalla—
    llevaba la elección de cómo se pauta y el rótulo de las pautas, y nada más,
    mientras el objetivo del día vivía en una tarjeta de 300 px al costado.

    Y el objetivo, en ese plan, ES el trabajo: el entrenador ha dicho que no
    reparte nada por comidas, así que las cuatro cifras son todo lo que pauta.
    La ley de esta pantalla lleva escrita la respuesta desde la tanda 1: en la
    mesa lo que se pauta, en el costado con qué se juzga. Estaba al revés.

    Baja tal cual —el MISMO editor, el mismo descuadre, el mismo `onSave`—, con
    la anatomía de una sección de hoja: rótulo, dato en voz baja, verbo en azul
    al canto. Las cifras son `.bloque-cifra`, la pieza con la que Entreno pinta
    las suyas dentro de su hoja: una mesa y otra, la misma gramática.

    ── Y EL COSTADO SE QUEDA SIN «EL DÍA» TAMBIÉN ────────────────────────────
    Aquí ponía que conservaba «El día» —«los mismos gramos en g/kg»— y esa era
    la avería que quedaba viva en la pantalla por macros: la mesa decía «120 g ·
    Proteína · 15 %» y el costado, cuatrocientos píxeles a la derecha, «Proteína
    120 g · 1,59 g/kg». Los mismos tres gramajes por tercera vez.

    Con un menú que sumar, «El día» dice algo que la mesa no puede decir —lo que
    suma su menú contra lo pedido—. Sin menú no suma nada: lo único que añadía
    eran los g/kg, y los g/kg son un apunte de esta cifra, no otra lectura. Así
    que bajan aquí, al renglón de cada macro, y el costado se queda con lo que sí
    es suyo: el ciclo y la evolución. Ver `NutritionModule`.
  */
  if (forma === 'mesa') {
    return (
      <>
        {/*
          ══ LA PRESCRIPCIÓN DEL DÍA (17 sep · frame 62:482) ══════════════════

          Eran cuatro cifras en fila —las kcal y los tres macros, cada una con
          su rótulo debajo— y el frame la rehace como el panel de la pantalla:
          un antetítulo, la cifra del día en grande y los tres macros en
          RENGLONES con su barra, sus gramos, su porcentaje y sus g/kg.

          Lo que gana no es tamaño, es lectura: en cuatro columnas iguales, las
          kcal —que son la consecuencia de los otros tres— pesaban lo mismo que
          ellos, y el reparto (15/64/21) había que leerlo saltando de celda en
          celda. En renglones, el reparto se ve sin leer ni un número.

          ── Y LAS BARRAS LLEVAN EL COLOR DE SU MACRO ──────────────────────
          Que es lo único que la ley del color permite aquí: no es color por
          categoría —eso sería pintar de rosa la palabra «Proteína»—, es un
          gráfico de tres series, y la tinta es la de la casa (`macroColor`:
          `--data-pink`, `--data-amber`, `--data-violet`), la misma con la que
          se dibujan estas tres series en todo el producto. Da la casualidad de
          que es también la del frame del asistente (66:161).
        */}
        <section className="dieta-prescripcion" aria-label="Lo que le pides al día">
          <div className="presc-cab">
            <div className="presc-say">
              <span className="section-label">{title || 'Prescripción diaria'}</span>
              <p className="presc-cifra">
                {kcals > 0 ? kcals : '—'} <small>kcal</small> <em>al día</em>
              </p>
              <span className="presc-dice">
                {macros.total === 0
                  ? 'Ponle las kcal y los macros que tiene que cuadrar.'
                  : derived
                    ? 'Salen de los macros que le has puesto.'
                    : 'Sin reparto por comidas: lo que cuadra es el día entero.'}
              </span>
            </div>
            {editable && (
              <button type="button" className="cab-accion" onClick={open}>
                {macros.total === 0 ? 'Poner el objetivo' : 'Ajustar objetivo →'}
              </button>
            )}
          </div>

          {!reparto.empty && (
            <div className="presc-macros">
              {MACRO_META.map(({ key, label, color }) => {
                const porKilo = peso > 0 && reparto.grams[key] > 0
                  ? localeNumber(Math.round((reparto.grams[key] / peso) * 100) / 100)
                  : null;
                return (
                  <div className="presc-macro" key={key}>
                    <div className="presc-macro-fila">
                      <span className="n">{label}</span>
                      <span className="g">
                        {reparto.grams[key]} g <small>({reparto.pct[key]} %)</small>
                      </span>
                      {/* Los gramos por kilo, que es con lo que se juzga el
                          PLANTEAMIENTO del plan. Vivían en el costado, con
                          estos mismos gramajes al lado: la tercera lista de
                          macros de la misma pantalla. */}
                      <span className="gkg">{porKilo ? `${porKilo} g/kg` : ''}</span>
                    </div>
                    <span className="presc-barra" aria-hidden="true">
                      <i style={{ width: `${reparto.pct[key]}%`, background: color }} />
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {peso > 0 && (
            <p className="presc-pie">
              g/kg calculados sobre <b>{localeNumber(peso)} kg</b>
              {cuando ? (
                <>
                  {' · último pesaje registrado el '}
                  <b>{shortDate(cuando)}</b>
                </>
              ) : null}
            </p>
          )}
        </section>
        {ventana}
      </>
    );
  }

  return (
    <>
    <article className={`card col gap-4${onAbrir ? ' tarjeta-puerta' : ''}`}>
      {/*
        Con `onAbrir`, la TARJETA ENTERA abre la ventana del día —lo real contra
        lo esperado y el reparto por comida—, y el lápiz de dentro sigue siendo
        su propio blanco para el objetivo. Dos destinos, dos blancos, pero el
        grande es el grande: antes la puerta era el título, un objetivo del
        ancho de dos palabras dentro de una caja de 300 px.

        La capa va DEBAJO del contenido (`.task-hit`, ver «LA TARJETA-PUERTA»)
        porque envolver todo esto en un <button> anidaría el lápiz dentro de
        otro botón. Sin `onAbrir` (el portal del cliente) no hay puerta ninguna.
      */}
      {onAbrir ? (
        <>
          <button
            type="button"
            className="task-hit"
            onClick={onAbrir}
            aria-label={`${nombre}: ver el día, lo real contra lo esperado y el reparto por comida`}
            title="Ver el día: lo real contra lo esperado y el reparto por comida"
          />
          <div className="lado-cab">
            <span className="section-label">Objetivo</span>
            <div className="lado-cab-fila">
              <span className="lado-titulo">{nombre}</span>
              {editable && (
                <button type="button" className="btn btn-plain btn-icon btn-icon-compact" onClick={open} aria-label="Editar objetivo">
                  <Pencil size={15} />
                </button>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="row between wrap gap-2">
          <span className="section-label is-titulo">{title || 'Objetivo diario'}</span>
          {editable && (
            <button type="button" className="btn btn-plain btn-icon" onClick={open} aria-label="Editar objetivo">
              <Pencil size={15} />
            </button>
          )}
        </div>
      )}

      {/*
        ══ LA CIFRA, Y DEBAJO LOS TRES MACROS A PLOMO CON «EL DÍA» ═══════════

        Aquí había una barra de tres colores con un filete, una espiga y una
        gota, y los porcentajes en píldoras. Justo debajo, en la misma columna
        de 300 px, «El día» listaba ESOS MISMOS TRES MACROS en renglones
        sobrios. La misma información dibujada dos veces y en dos idiomas.

        Es la avería que ya se corrigió una vez —«El día» y «El reparto» eran
        dos tarjetas seguidas con la misma lista de tres— y que había vuelto por
        arriba.

        Ahora las dos usan la misma pieza, el renglón de `Medidor`, así que el
        gramaje cae bajo el gramaje y el apunte en voz baja bajo el apunte: aquí
        el reparto en %, abajo los g/kg. Ver `MacroLista`.
      */}
      <div className="objetivo-cifra">
        <span className="v">{kcals > 0 ? kcals : '—'}</span>
        <span className="u">kcal</span>
      </div>
      {derived && <p className="t-xs t-tertiary">calculadas a partir de los macros</p>}

      <MacroLista
        protein={targets.proteinGrams}
        carbs={targets.carbsGrams}
        fats={targets.fatsGrams}
      />

      {macros.total === 0 && (
        <p className="t-sm t-secondary">
          Sin macros configurados{editable ? ' — pulsa el lápiz para ponerlos.' : '.'}
        </p>
      )}

    </article>
    {ventana}
    </>
  );
};
