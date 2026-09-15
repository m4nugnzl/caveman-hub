import { Fragment, useId, useMemo } from 'react';
import { RotateCcw } from 'lucide-react';

import { claveDelCambio, cuadra, dayMacros, rescaleMeals } from '@/domain/nutrition';
import { Notice, Switch } from '@/components/ui/primitives';
import { toNum0 } from '@/lib/num';

/**
 * EL MENÚ: qué gramos se mueven, cuáles no y cuáles los pones tú.
 *
 * ══ El último paso del ajuste ══════════════════════════════════════════════
 *
 * Esto fue `ReescalarMenu`, una segunda ventana que aparecía DESPUÉS de guardar:
 * tecleabas el objetivo, pulsabas «Guardar» —y el objetivo ya quedaba escrito—,
 * y entonces se abría de la nada una lista de veinte gramajes que nadie había
 * anunciado. Luego vivió al pie de la ventana del objetivo, creciendo hacia
 * abajo mientras se tecleaba arriba. Ahora es el tercer paso del asistente: la
 * consecuencia tiene su propia pantalla, que es donde se puede mirar.
 *
 * ══ Y una fila se corrige de tres maneras ══════════════════════════════════
 *
 * Era todo o nada: o aceptabas los veinte cambios o cuadrabas el menú a mano.
 *
 *   · **Dejarla igual** — la casilla. No la tacha: la fija y el reescalado SE
 *     REHACE, así que lo que ese alimento deja de poner lo pone el resto de su
 *     opción. Es el «déjame el chocolate y baja la patata».
 *   · **Poner los gramos** — se escribe encima de la cifra propuesta. Misma
 *     regla: esa fila se clava ahí y las demás de su comida recalculan.
 *   · **Volver a lo propuesto** — deshace lo anterior, fila a fila.
 *
 * Ninguna de las tres escribe nada en la dieta hasta que se guarda, y ninguna es
 * la marca permanente: para que un alimento no se mueva NUNCA está «No lo muevas
 * al ajustar», en su ficha dentro de la comida. Esto es solo para este ajuste.
 */

const MACROS = ['protein', 'carbs', 'fats'];

/**
 * El cálculo del reajuste: qué se movería con el objetivo que se está tecleando.
 *
 * Va en un gancho y no dentro del componente porque el resultado lo necesitan
 * los dos: esta lista para pintarlo y la ventana para guardarlo.
 *
 * @param antes/despues  Los macros que había al abrir y los que se están
 *   tecleando. `antes` es una de las tres razones por las que hay algo que
 *   reajustar —haber movido el objetivo; las otras dos son el reparto y un menú
 *   que no cuadra, más abajo— y `despues` decide
 *   ADÓNDE va el menú: a lo pautado, no a un tanto por ciento del salto. Ver la
 *   cabecera de `rescaleMeals`: escalar «un 4 % menos, como la proteína
 *   pautada» arrastraba intacta la distancia que el menú ya tuviera, y el
 *   reajuste acababa moviendo gramos sin cuadrar nada.
 *
 *   Por eso los tres macros entran en el cálculo aunque solo se haya tecleado
 *   uno: bajar cinco gramos de proteína es pedir que el menú quede en lo
 *   pautado, y las grasas trece gramos por debajo son parte de eso. Sin macros
 *   pautados (una dieta con objetivo de kcal y nada más) se cae al camino corto
 *   de siempre, que ahora también apunta a la cifra y no al salto.
 * @param repartoMovido  Si el paso anterior ha movido lo que se le pide a cada
 *   comida. Es un motivo por sí solo, igual que un gramaje escrito, y sin él la
 *   ley del reposo se pasaba de frenada: una dieta con el día ya en 2.250 y el
 *   reparto escrito en 2.400 se corregía el piso de en medio y dejaba la comida
 *   en la cifra vieja —«los objetivos en 2.250 y las comidas en 2.400»—, que es
 *   justo el descuadre que el reparto venía a cerrar. Nadie ha tecleado nada,
 *   pero la portería se ha movido: eso es trabajo caducado, no reposo.
 * @param apartados  `Set` de `claveDelCambio` con las filas que se dejan igual.
 * @param fijados  `Map` de `claveDelCambio` a los gramos escritos a mano. El
 *   valor viaja como se ha tecleado —texto— porque esta es también la casilla
 *   que se está escribiendo: el dominio lo redondea y una a medias no cuenta.
 */
export const useReajuste = ({
  meals = [],
  catalog = [],
  antes,
  despues,
  kcals,
  repartoMovido = false,
  apartados = null,
  fijados = null,
}) =>
  useMemo(() => {
    if (!meals || meals.length === 0) return null;

    const aMano = fijados && fijados.size > 0 ? fijados : null;

    const hayMacros =
      antes && despues && MACROS.some((k) => toNum0(antes[k]) > 0 && toNum0(despues[k]) > 0);
    const cambianMacros =
      hayMacros && MACROS.some((k) => toNum0(antes[k]) !== toNum0(despues[k]));
    const cambianKcal =
      toNum0(kcals?.antes) > 0 &&
      toNum0(kcals?.ahora) > 0 &&
      toNum0(kcals.antes) !== toNum0(kcals.ahora);

    /* Adónde va el menú: a los macros pautados si los hay y, si no, a las kcal
       pautadas. Nunca a una proporción del salto. */
    const objetivo = despues && MACROS.some((k) => toNum0(despues[k]) > 0) ? despues : null;

    /*
      ══ Y SI EL MENÚ NO CUADRA, HAY ALGO QUE CONTESTAR ═════════════════════

      La ley del reposo dice que sin tocar nada no se propone nada, y se estaba
      pasando de frenada: una dieta que LLEGA descuadrada —el día ya bajado a
      2.250 y la comida sumando 2.400, porque el objetivo se guardó sin
      reajustar el menú— no tenía ninguna puerta por la que arreglarse. La
      ventana se abría, no decía nada y guardaba lo mismo que había.

      Reposo es no tocar lo que cuadra, no callarse lo que no. Y el veredicto es
      el que la aplicación YA pinta en el costado (`cuadra`, con su margen del
      5 % y su suelo): donde ahí dice «no cuadra», aquí hay un paso que enseñar.
      Sigue sin recetar —se enseña antes de guardar y tiene interruptor— y sigue
      sin molestar a quien cuadra: el escalón de cocina no mueve lo que no llega
      a un escalón, así que una dieta dentro del margen no propone nada.
    */
    const suma = dayMacros(meals);
    const desajustado = objetivo
      ? MACROS.some((k) => toNum0(objetivo[k]) > 0 && !cuadra(suma[k], objetivo[k], k))
      : toNum0(kcals?.ahora) > 0 && !cuadra(suma.kcal, toNum0(kcals.ahora), 'kcals');

    /* Un gramaje escrito es motivo suficiente por sí solo: una fila se puede
       corregir sin haber movido el objetivo. Y el reparto también: si lo que se
       le pide a cada comida acaba de cambiar, el menú apunta a una portería que
       ya no existe aunque el día entero siga cuadrando. */
    if (!cambianMacros && !cambianKcal && !aMano && !repartoMovido && !desajustado) return null;

    const res = rescaleMeals(meals, {
      catalog,
      quietos: apartados,
      fijados: aMano,
      ...(objetivo
        ? { objetivo: Object.fromEntries(MACROS.map((k) => [k, toNum0(objetivo[k])])) }
        : { objetivoKcals: toNum0(kcals?.ahora) }),
    });

    /*
      El índice de TODOS los gramajes del menú, para poder pintar también las
      filas apartadas: en cuanto una se aparta deja de salir en `cambios` —ya no
      cambia—, y sin esto desaparecería de la lista justo al quitarle la casilla,
      que es el momento en el que hay que poder devolverla.
    */
    const indice = new Map();
    meals.forEach((meal, mi) =>
      (meal.options || []).forEach((op, oi) =>
        (op.foods || []).forEach((f, fi) => {
          const clave = claveDelCambio(meal.name, oi + 1, f.name);
          if (indice.has(clave)) return;
          indice.set(clave, {
            clave,
            comida: meal.name,
            opcion: oi + 1,
            food: f.name,
            from: toNum0(f.grams),
            orden: mi * 1e6 + oi * 1e3 + fi,
          });
        })
      )
    );

    const cambios = new Map(
      (res?.cambios || []).map((c) => [claveDelCambio(c.meal, c.option, c.food), c])
    );
    const filas = [
      ...new Set([...cambios.keys(), ...(apartados || []), ...(aMano ? aMano.keys() : [])]),
    ]
      .map((clave) => {
        const base = indice.get(clave);
        if (!base) return null;
        const cambio = cambios.get(clave);
        const escrita = aMano?.has(clave) === true;
        return {
          ...base,
          to: cambio ? cambio.to : base.from,
          /* Escrita y apartada se excluyen —lo garantiza quien las guarda—, así
             que una fila con gramaje puesto nunca se pinta apagada. */
          apartada: !cambio && !escrita,
          aMano: escrita,
          /* Y la tercera clase de renglón: la fila que se propone quitar. No
             puede coincidir con las otras dos —apartarla o escribirle un gramaje
             la vuelve inmóvil, y el dominio no propone quitar lo que no se
             mueve—, así que las tres se pintan sin pelearse. */
          quitar: cambio?.quitar === true,
          texto: escrita ? String(aMano.get(clave)) : '',
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.orden - b.orden);

    if (filas.length === 0) {
      return { res: null, comidas: [], filas, sinTocar: [], fuera: res?.fuera || [], sinNada: res?.sinNada };
    }

    /*
      Agrupadas por COMIDA y, dentro de cada una, por opción.

      Antes cada opción era su propio grupo con el nombre de la comida delante:
      «COMIDA 1 · OPCIÓN 1», «COMIDA 1 · OPCIÓN 2»… cinco veces seguidas en
      mayúsculas dentro de la misma caja. Eso no es una jerarquía, es la misma
      palabra gritada cinco veces, y es lo que convertía la lista en un muro.
      La comida se dice UNA vez y sus opciones cuelgan de ella, que es como se
      mira la hoja contra la que se comprueba.
    */
    const comidas = [];
    for (const fila of filas) {
      let comida = comidas[comidas.length - 1];
      if (comida?.comida !== fila.comida) {
        comida = { comida: fila.comida, opciones: [] };
        comidas.push(comida);
      }
      const ultima = comida.opciones[comida.opciones.length - 1];
      if (ultima?.n === fila.opcion) ultima.filas.push(fila);
      else comida.opciones.push({ n: fila.opcion, filas: [fila] });
    }

    return {
      res,
      comidas,
      filas,
      sinTocar: res?.sinTocar || [],
      fuera: res?.fuera || [],
      sinNada: res?.sinNada,
    };
  }, [meals, catalog, antes, despues, kcals, repartoMovido, apartados, fijados]);

const enumerar = (partes) =>
  partes.length <= 1
    ? partes[0] || ''
    : `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;

/**
 * LAS QUE HAN DEJADO DE SER ALTERNATIVAS, dichas en una línea.
 *
 * Con nombre y apellidos mientras quepan —hasta tres, que es lo que se lee sin
 * contar—, porque «2 opciones» obliga a buscarlas por la lista de arriba. Y con
 * la distancia, que es lo que decide si el entrenador va a mirarlas: 485 kcal se
 * miran y 30 no.
 */
const vozDeLasQueQuedan = (fuera) => {
  const una = fuera.length === 1;
  const quienes = una
    ? `«${fuera[0].meal}» (opción ${fuera[0].option}) se queda ${Math.abs(fuera[0].diff)} kcal ${fuera[0].diff > 0 ? 'por encima' : 'por debajo'} de su opción 1`
    : fuera.length <= 3
      ? `${enumerar(fuera.map((o) => `«${o.meal}» (opción ${o.option})`))} se quedan lejos de su opción 1`
      : `${fuera.length} alternativas se quedan lejos de su opción 1`;

  return una
    ? `${quienes}: ajustarla del todo sería escribirle otra comida. Revísala a mano.`
    : `${quienes}: ajustarlas del todo sería escribirles otras comidas. Revísalas a mano.`;
};

/** «9 gramajes en 4 comidas», y lo que has tocado tú. */
const resumenDe = (filas, comidas) => {
  /* Las que se quitan salen aparte y no como «gramajes»: quitar un alimento no
     es moverlo, y contarlo en el mismo saco esconde lo único de esta lista que
     cambia la comida en vez de su tamaño. */
  const quitadas = filas.filter((f) => f.quitar).length;
  const mueven = filas.filter((f) => !f.apartada && !f.quitar).length;
  const apartadas = filas.filter((f) => f.apartada).length;
  const aMano = filas.filter((f) => f.aMano).length;
  const cuantas = comidas.length;
  const partes = [
    mueven === 0
      ? 'Ninguna fila se mueve'
      : `${mueven} ${mueven === 1 ? 'gramaje' : 'gramajes'} en ${cuantas} ${cuantas === 1 ? 'comida' : 'comidas'}`,
  ];
  if (quitadas > 0)
    partes.push(`${quitadas} ${quitadas === 1 ? 'alimento fuera' : 'alimentos fuera'}`);
  if (apartadas > 0) partes.push(`${apartadas} igual que ${apartadas === 1 ? 'estaba' : 'estaban'}`);
  if (aMano > 0) partes.push(`${aMano} ${aMano === 1 ? 'puesto' : 'puestos'} por ti`);
  return partes.join(' · ');
};

export const ReajusteDelMenu = ({ datos, onApartar, onGramos, onTodas }) => {
  const base = useId();
  if (!datos) return null;
  const { comidas, filas, sinTocar, fuera, sinNada } = datos;

  if (filas.length === 0) {
    return (
      <Notice tone="info">
        Este cambio no mueve ningún gramo del menú:{' '}
        {sinNada || 'no hay de dónde recortar lo que has pedido'}. Cuádralo a mano si hace falta.
      </Notice>
    );
  }

  const algunaMueve = filas.some((f) => !f.apartada);

  return (
    <div className="reajuste">
      <div className="reajuste-cabeza">
        <span className="t-xs t-tertiary">{resumenDe(filas, comidas)}</span>
        {/* Un interruptor y no una casilla: «reajustar el menú» no es una fila
            más de la lista que hay debajo —lo sería si compartiera su dibujo—,
            es el mando que la enciende entera. */}
        <Switch label="Reajustar el menú" checked={algunaMueve} onChange={onTodas} />
      </div>

      {comidas.map((comida) => (
        <section className="reajuste-comida" key={comida.comida}>
          <h4 className="reajuste-titulo">{comida.comida}</h4>
          <div className="card-inset reajuste-lista">
            {comida.opciones.map((opcion) => (
              <Fragment key={opcion.n}>
                {/* Con una sola opción el rótulo no distingue nada: la comida ya
                    está escrita justo encima. */}
                {comida.opciones.length > 1 && (
                  <span className="reajuste-opcion">Opción {opcion.n}</span>
                )}
                {opcion.filas.map((fila) => {
                  const id = `${base}-${fila.clave}`;
                  return (
                    <div
                      className={`reajuste-fila${fila.apartada ? ' is-quieta' : ''}${fila.aMano ? ' es-mano' : ''}${fila.quitar ? ' es-quitar' : ''}`}
                      key={fila.clave}
                    >
                      <input
                        type="checkbox"
                        id={id}
                        checked={!fila.apartada}
                        onChange={() => onApartar(fila.clave)}
                      />
                      {/* La casilla y el nombre, atados; el campo de gramos va
                          aparte justamente para que escribir en él no apague la
                          fila. */}
                      <label className="nm" htmlFor={id}>
                        {fila.food}
                      </label>
                      {/* De dónde viene, solo si va a otro sitio: en una fila que
                          se deja igual, «80 → 80» es ruido con forma de cambio. */}
                      <span className="cifra es-antes">
                        {fila.apartada ? '' : `${fila.from} →`}
                      </span>
                      {/* La fila que se propone quitar tiene el mismo campo que
                          las demás, vacío y diciendo «quitar»: escribirle un
                          gramaje encima cancela la propuesta y la clava ahí, que
                          es el gesto que ya corrige cualquier otra fila. Un
                          rótulo en vez del campo habría dejado esa fila con dos
                          salidas —quitar o dejarla— donde el resto tiene tres. */}
                      <span className="input-suffix">
                        <input
                          type="text"
                          inputMode="decimal"
                          className="input input-sm input-center"
                          value={fila.aMano ? fila.texto : fila.quitar ? '' : String(fila.to)}
                          placeholder={fila.quitar ? 'quitar' : undefined}
                          disabled={fila.apartada}
                          aria-label={
                            fila.quitar ? `Gramos de ${fila.food}, o quitarlo` : `Gramos de ${fila.food}`
                          }
                          onChange={(e) => onGramos(fila.clave, e.target.value)}
                        />
                        <span aria-hidden="true">{fila.quitar ? '' : 'g'}</span>
                      </span>
                      {/* El deshacer solo donde hay algo que deshacer. */}
                      {fila.aMano ? (
                        <button
                          type="button"
                          className="btn btn-icon btn-icon-compact"
                          onClick={() => onGramos(fila.clave, null)}
                          title="Volver a lo propuesto"
                          aria-label={`Volver a lo propuesto en ${fila.food}`}
                        >
                          <RotateCcw size={13} />
                        </button>
                      ) : (
                        <span aria-hidden="true" />
                      )}
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </section>
      ))}

      {/* De qué alimentos sale cada macro y en qué escalones se mueven. Lo
          segundo hace falta desde que el gramaje va de cinco en cinco o de
          veinticinco en veinticinco: sin decirlo, que una fila no se mueva
          parece un olvido. Ver `CESTAS` y `escalonDeCocina`. Y se dicen los
          tres macros porque el ajuste mueve los tres: desde que el reajuste
          apunta a lo pautado en vez de al salto, una misma lista puede bajar la
          proteína y subir el aceite. */}
      <span className="t-xs t-tertiary">
        Los hidratos se mueven en cereales, tubérculos, legumbres y dulces —la fruta y la verdura
        solo si no queda otra—; las grasas, en aceites y frutos secos; y la proteína, en carnes,
        pescados, huevos y lácteos. Lo que se cuenta por unidades no se toca. Los gramos van en
        escalones de cocina: de 5 en 5, de 10 en 10 o de 25 en 25 según lo que haya en la fila.
      </span>

      {/* Solo cuando hay alguna: explicar una regla que hoy no se ha aplicado es
          ruido en las veinte veces que la lista son gramajes y nada más. */}
      {filas.some((f) => f.quitar) && (
        <span className="t-xs t-tertiary">
          Un alimento sale de la opción solo cuando ningún gramaje la cuadra, y sale el que lleva
          el macro atascado: nunca el plato principal, nunca más de uno por opción y nunca lo que
          se cuenta por unidades. Desmárcalo para dejarlo, o escríbele los gramos que quieras.
        </span>
      )}

      {sinTocar.length > 0 && (
        <span className="t-xs t-tertiary">
          {sinTocar.length === 1
            ? `«${sinTocar[0].meal}» (opción ${sinTocar[0].option}) se queda como está: ${sinNada}.`
            : `${sinTocar.length} opciones se quedan como están: ${sinNada.replace('tiene', 'tienen')}.`}
        </span>
      )}

      {/* Lo que el ajuste NO ha podido cuadrar, dicho al final y sin proponer
          nada: una alternativa que necesita la mitad de todo no es esa comida
          más pequeña, es otra comida, y el dominio se planta a propósito. La
          comparación es contra la opción 1 porque es lo que el entrenador mira
          en la hoja. Ver `fuera` en `rescaleMeals`. */}
      {fuera.length > 0 && (
        <Notice tone="warn">{vozDeLasQueQuedan(fuera)}</Notice>
      )}
    </div>
  );
};
