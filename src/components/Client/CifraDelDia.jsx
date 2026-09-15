import { localeNumber, miles } from '@/lib/dates';

/**
 * LA CIFRA DEL DÍA: qué día es, a cuánto come, y cómo se reparte.
 *
 * ══ Qué sustituye ══════════════════════════════════════════════════════════
 *
 * A `ObjetivoDelDia`, que es la pieza del ENTRENADOR y estaba montada tal cual
 * en el costado de la dieta del cliente. Aquello lleva, además del objetivo: lo
 * que suman las opciones abiertas contra lo pautado macro a macro, los g/kg
 * contra la media móvil de tres pesajes, la cobertura de micros y la puerta a la
 * ventana del día. Es el instrumento correcto para quien PLANIFICA doce dietas.
 *
 * Medido sobre la captura del dueño: con eso puesto —y con el título, el
 * subtítulo, un párrafo de tres líneas y las pautas en caja doble por delante—
 * las 2300 kcal, que es literalmente a lo que se entra, caían a 598 px de una
 * pantalla de 664.
 *
 * Aquí van la cifra, su reparto y de qué día son. Ley 3 del replanteamiento del
 * móvil.
 *
 * ══ Y ahora en una tarjeta, que es lo que pide el prototipo ════════════════
 *
 * Estuvo suelta sobre el papel, y era coherente con «la hoja es plana». Pero en
 * `docs/portal-dos-aparatos.html` esto es **una tarjeta**, y por un motivo que
 * se ve al bajar el pulgar: debajo vienen las comidas, que SÍ son tarjetas. Con
 * la cifra suelta, lo primero que se lee en la pantalla es lo único que no tiene
 * cuerpo, y el día entero parece empezar en el desayuno.
 *
 * Los tres macros entran dentro, en tres casillas, por lo mismo: son el reparto
 * DE ESA cifra, no tres datos más de la página.
 *
 * ══ Sin anillos, y es una decisión de producto ═════════════════════════════
 *
 * Los anillos de Coachway y de Efort convierten el día en un aprobado o un
 * suspenso. **La dieta pauta, no contabiliza**: esto es lo que le han puesto, no
 * una cuenta atrás de lo que le queda. Ver `la app no receta` y `la ley del
 * color` — el semáforo juzga, y aquí no hay nada que juzgar.
 *
 * @param nombre  De qué día es esta cifra: «Día alto». Con una sola dieta no
 *   hay nada que nombrar y la línea no se escribe.
 * @param targets Los objetivos del día (`targetsFor`).
 * @param kcal    Las kcal pautadas, ya resueltas por quien lo monta: puede ser la
 *   cifra escrita o la suma de los macros, y no es lo mismo un objetivo escrito
 *   que uno deducido.
 * @param pie     La línea de debajo de la cifra. Una frase corta o nada.
 * @param marca   Qué pasa ese día —«Hoy entrenas · Legs B»—, arriba a la
 *   derecha. Es lo que contesta por qué hoy come más, que es la pregunta que un
 *   alto/bajo plantea sin decirla.
 * @param abierto Lo que suman las opciones que tiene abiertas ahora mismo:
 *   `{ kcal, protein, carbs, fats }`, o `null`. Solo lo manda el MONITOR — ver
 *   abajo.
 */
const g = (v) => localeNumber(Math.round(Number(v) || 0));

export const CifraDelDia = ({
  nombre = null,
  targets,
  kcal,
  pie = null,
  marca = null,
  abierto = null,
}) => {
  const macros = [
    { k: 'protein', label: 'Proteína', v: targets?.proteinGrams },
    { k: 'carbs', label: 'Carbos', v: targets?.carbsGrams },
    { k: 'fats', label: 'Grasas', v: targets?.fatsGrams },
  ].filter((m) => Number(m.v) > 0);

  /* Sin cifra y sin macros no hay objetivo puesto. Un «0 kcal» grande sería
     decir que come cero; el hueco, que su entrenador todavía no lo ha escrito, y
     eso lo dice la pantalla que monta esto. */
  if (!kcal && macros.length === 0 && !marca) return null;

  return (
    /* `cifra-dia` es lo que la mantiene en tarjeta también en el teléfono: allí
       los bloques se aplanan (A-03) y debajo de esta vienen las comidas, que
       son tarjetas. Ver `piezas.css`. */
    <div className="card card-tight cifra-hoja cifra-dia">
      <div className="cifra-hoja-dato">
        {nombre && <p className="cifra-hoja-rot">{nombre}</p>}
        {kcal > 0 && (
          <p className="peso-cifra">
            {miles(kcal)}
            <small>kcal</small>
          </p>
        )}
        {pie && <p className="t-sm t-secondary cifra-hoja-pie">{pie}</p>}
      </div>

      {/* Qué toca ese día. En el teléfono, al final del primer renglón; en un
          monitor, al final del único renglón que hay. No es un juicio —no hay
          aprobado ni suspenso— sino el porqué de la cifra que tiene al lado. */}
      {marca && <span className="cifra-hoja-marca">{marca}</span>}

      {macros.length > 0 && (
        /* Los tres en tres casillas, dentro de la tarjeta. Eran una tabla de
           tres filas «etiqueta … valor» dentro de otra tarjeta dentro de la
           columna del objetivo: tres renglones para tres cifras que se leen a la
           vez o no se leen. */
        <dl className="macros-linea">
          {macros.map((m) => (
            <div key={m.k}>
              <dd>
                {g(m.v)}
                <small>g</small>
              </dd>
              <dt>{m.label}</dt>
              {/*
                ══ LO QUE SUMAN LAS OPCIONES QUE TIENE ABIERTAS ═══════════════

                El dueño, el 13 de septiembre: *«a esta pantalla en el ordenador
                le añadiría más información que sí tiene el entrenador»*. Ésta
                es la que tenía y él no: la suma de lo elegido contra lo pautado
                estaba detrás de una fila y una ventana (`DiaPopup`), o sea
                escondida tras un clic en la única pantalla donde sobra sitio
                para enseñarla.

                Aquí es un renglón bajo cada cifra y **cambia en vivo** al
                cambiar de opción en cualquier comida, que es la forma de
                contestar «si hoy elijo esta y aquella, ¿me cuadra?» sin salir
                del menú. En el teléfono no se manda: allí sigue la fila, porque
                cuatro cifras más por bloque son cuatro renglones.

                Y sin semáforo. Un desvío no se aprueba ni se suspende: el
                criterio es de su entrenador (`la app no receta`).
              */}
              {abierto && <span className="cifra-hoja-abierto">{g(abierto[m.k])} abiertos</span>}
            </div>
          ))}
        </dl>
      )}

      {abierto && kcal > 0 && (
        <p className="cifra-hoja-suma">
          Con las opciones que tienes abiertas suman{' '}
          <strong className="t-strong tnum">{miles(Math.round(abierto.kcal))} kcal</strong>
        </p>
      )}
    </div>
  );
};
