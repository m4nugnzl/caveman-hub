import { MICROS, microPer100 } from '@/domain/micros';
import { toNum } from '@/lib/num';

/**
 * LA ETIQUETA: lo que lleva este alimento por 100 g, como se lee en un envase.
 * Y, si el alimento es tuyo, **donde se escribe**.
 *
 * ══ Por qué el panel necesitaba una FIGURA ═════════════════════════════════
 *
 * La ficha del alimento era una pila de bloques de texto sueltos —un rótulo en
 * versales, un párrafo, una caja hundida, otro rótulo, otro párrafo, un botón,
 * una etiqueta, un campo, una ayuda— sin un solo sitio donde posar el ojo. El
 * dueño lo dijo corto: «me parece fea». No le faltaba estilo: le faltaba una
 * pieza que fuera lo principal, y todo lo demás alrededor.
 *
 * ══ Y por qué además es el EDITOR ══════════════════════════════════════════
 *
 * Porque la primera versión resolvió lo de mirar y empeoró lo de trabajar: la
 * etiqueta enseñaba siete cifras y el formulario de debajo volvía a pedir las
 * siete —tres casillas de macros, cuatro del envase, dos de unidad, cada una
 * con su rótulo y su ayuda—. La ficha medía 1.257 px de alto en un carril de
 * 827, y las cuatro del envase, apretadas en 88 px, partían sus rótulos en dos
 * líneas. El dueño: «los alimentos en la barra de la derecha no caben, salen en
 * distintas líneas, es muy feo todo». La mitad de esa altura era el eco de la
 * otra mitad.
 *
 * Un envase se lee y se corrige en el mismo renglón, así que la cifra **es** la
 * casilla: misma posición, misma tipografía tabular, mismo canto derecho, y sin
 * caja hasta que la tocas. Se van siete rótulos, siete ayudas y ~450 px.
 *
 * ══ La forma es la del envase, y no es decoración ══════════════════════════
 *
 * Sangrar «de los cuales azúcares» bajo los hidratos y «de las cuales
 * saturadas» bajo las grasas es como está impreso en cualquier producto del
 * supermercado, que es de donde se copian estas cifras. Un orden distinto
 * obligaría a buscar dos veces: una en el envase y otra aquí.
 *
 * ══ «No dice» NO es cero ═══════════════════════════════════════════════════
 *
 * La regla de `micros.js`, y aquí es donde se ve: un guion donde el alimento no
 * declara, y nunca un 0. Escribir «0 g de fibra» sobre un pan integral porque
 * nadie ha copiado el envase es una mentira que parece una medida. En el modo
 * editable la casilla vacía dice lo mismo con el mismo guion de marcador de
 * posición: en blanco se guarda como «no dice».
 *
 * ══ Y sin CDR, ni porcentaje, ni semáforo ══════════════════════════════════
 *
 * Lo prohíbe `micros.js` por escrito y con tres motivos; el que zanja es que la
 * app no receta. Aquí sólo está la composición.
 *
 * @param alimento  El alimento tal como lo enseña la lista.
 * @param general   Su fila del catálogo, si la tiene: la copia de tu biblioteca
 *   puede no traer las cifras del envase y el catálogo sí saberlas.
 * @param edicion   Cuando el alimento es tuyo: `{ macros, micros, unitLabel,
 *   unitGrams, errores, onMacro, onMicro, onUnitLabel, onUnitGrams }`. Sin esto
 *   la etiqueta es de lectura, que es lo que es un alimento del catálogo.
 */
const kcal100 = (f) =>
  Math.round(
    (toNum(f?.proteinPer100) || 0) * 4 +
      (toNum(f?.carbsPer100) || 0) * 4 +
      (toNum(f?.fatsPer100) || 0) * 9
  );

/** Lo que declare el alimento y, si él no, lo que sepa el catálogo. */
const declara = (alimento, general, key) => {
  const suyo = microPer100(alimento, key);
  return suyo === null ? microPer100(general, key) : suyo;
};

const Cifra = ({ valor, unidad = 'g' }) =>
  valor === null || valor === undefined ? (
    <span className="etq-nodice" title="El envase no lo dice">
      —
    </span>
  ) : (
    <>
      {valor} <span className="etq-u">{unidad}</span>
    </>
  );

const Casilla = ({ etiqueta, valor, onChange, error, unidad = 'g', hueco }) => (
  <>
    <input
      type="text"
      inputMode="decimal"
      className="etq-campo"
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      placeholder={hueco}
      aria-label={`${etiqueta} por 100 g`}
      aria-invalid={error ? 'true' : undefined}
    />{' '}
    <span className="etq-u">{unidad}</span>
  </>
);

const Linea = ({ etiqueta, sangrada = false, fuerte = false, children }) => (
  <div className={`etq-linea${sangrada ? ' es-sangrada' : ''}${fuerte ? ' es-fuerte' : ''}`}>
    <span className="etq-que">{etiqueta}</span>
    <span className="etq-cuanto">{children}</span>
  </div>
);

export const EtiquetaNutricional = ({ alimento, general = null, edicion = null }) => {
  if (!alimento && !edicion) return null;

  const fuente = alimento || {};
  const escribe = Boolean(edicion);

  /* Las kcal SIEMPRE salen del borrador cuando se está editando: es la cuenta
     de lo que se va a guardar, y verla moverse al teclear un macro es la única
     confirmación de que la casilla que acabas de tocar es la que crees. */
  const kcal = escribe
    ? Math.round(
        (toNum(edicion.macros.proteinPer100) || 0) * 4 +
          (toNum(edicion.macros.carbsPer100) || 0) * 4 +
          (toNum(edicion.macros.fatsPer100) || 0) * 9
      )
    : kcal100(fuente);

  const micro = (key) => declara(fuente, general, key);
  const macro = (campo) => toNum(fuente?.[campo]) ?? 0;

  const casillaMicro = (key) => {
    const meta = MICROS.find((m) => m.key === key);
    return (
      <Casilla
        etiqueta={meta.label}
        valor={edicion.micros[meta.field]}
        onChange={(v) => edicion.onMicro(meta.field, v)}
        error={edicion.errores?.[meta.field]}
        unidad={meta.unit}
        hueco="—"
      />
    );
  };

  const casillaMacro = (campo, etiqueta) => (
    <Casilla
      etiqueta={etiqueta}
      valor={edicion.macros[campo]}
      onChange={(v) => edicion.onMacro(campo, v)}
      error={edicion.errores?.[campo]}
      hueco="0"
    />
  );

  /* La unidad natural del pie: leída es una frase, escrita son dos huecos
     DENTRO de la frase. Ver `.etq-pie-campo`. */
  const unidadLeida = fuente.unitLabel
    ? `1 ${fuente.unitLabel} = ${fuente.unitGrams} g`
    : general?.unitLabel
      ? `1 ${general.unitLabel} = ${general.unitGrams} g`
      : null;

  /* Todo lo que no cuadra, junto y debajo: siete mensajes en línea harían saltar
     la etiqueta entera al teclear. */
  const fallos = escribe
    ? [...Object.values(edicion.errores || {}), edicion.errorUnidad].filter(Boolean)
    : [];

  return (
    <section className="etq">
      {/* La cifra que se busca primero, en la voz de las cifras y con su unidad
          al lado: es la portada de la etiqueta, no una línea más de la tabla. */}
      <header className="etq-cab">
        <p className="etq-kcal">
          <span className="etq-kcal-v">{kcal}</span>
          <span className="etq-kcal-u">kcal</span>
        </p>
        <p className="etq-por">por 100 g</p>
      </header>

      <div className="etq-tabla">
        <Linea etiqueta="Proteína" fuerte>
          {escribe ? casillaMacro('proteinPer100', 'Proteína') : <Cifra valor={macro('proteinPer100')} />}
        </Linea>
        <Linea etiqueta="Hidratos" fuerte>
          {escribe ? casillaMacro('carbsPer100', 'Hidratos') : <Cifra valor={macro('carbsPer100')} />}
        </Linea>
        <Linea etiqueta="de los cuales azúcares" sangrada>
          {escribe ? casillaMicro('sugars') : <Cifra valor={micro('sugars')} />}
        </Linea>
        <Linea etiqueta="Grasas" fuerte>
          {escribe ? casillaMacro('fatsPer100', 'Grasas') : <Cifra valor={macro('fatsPer100')} />}
        </Linea>
        <Linea etiqueta="de las cuales saturadas" sangrada>
          {escribe ? casillaMicro('saturates') : <Cifra valor={micro('saturates')} />}
        </Linea>
        <Linea etiqueta="Fibra">
          {escribe ? casillaMicro('fiber') : <Cifra valor={micro('fiber')} />}
        </Linea>
        <Linea etiqueta="Sal">
          {escribe ? casillaMicro('salt') : <Cifra valor={micro('salt')} />}
        </Linea>
      </div>

      {escribe ? (
        /* «Cómo lo pides» era un campo con su rótulo, su ayuda de dos líneas y
           dos cajas. Aquí es la frase que ya se leía en el pie, con los dos
           huecos dentro: «1 [cacito] = [30] g». */
        <p className="etq-pie">
          1
          <input
            type="text"
            className="etq-pie-campo etq-pie-nom"
            value={edicion.unitLabel}
            onChange={(e) => edicion.onUnitLabel(e.target.value)}
            placeholder="unidad"
            aria-label="Cómo lo pides: la medida con la que lo cuentas"
          />
          =
          <input
            type="text"
            inputMode="decimal"
            className="etq-pie-campo etq-pie-g"
            value={edicion.unitGrams}
            onChange={(e) => edicion.onUnitGrams(e.target.value)}
            placeholder="—"
            aria-label="Cuántos gramos pesa una"
            aria-invalid={edicion.errorUnidad ? 'true' : undefined}
          />
          g
        </p>
      ) : (
        unidadLeida && <p className="etq-pie">{unidadLeida}</p>
      )}

      {fallos.length > 0 && <p className="etq-mal">{fallos[0]}</p>}

      {/* Sólo cuando falta algo, y en voz baja. Una nota fija explicando los
          guiones sería una instrucción permanente para un caso que la mayoría
          de las veces no se da. */}
      {!escribe && MICROS.some(({ key }) => micro(key) === null) && (
        <p className="etq-pie t-xs">Los guiones son «el envase no lo dice», no cero.</p>
      )}
      {escribe && (
        <p className="etq-pie t-xs">Cópialas del envase. En blanco no es cero: es que no lo dice.</p>
      )}
    </section>
  );
};
