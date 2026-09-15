import { useMemo, useState } from 'react';
import { IconoEquivalencia } from '@/components/ui/IconoEquivalencia';

import { MACROS } from '@/domain/nutrition';
import { equivalencesFor, racionDe } from '@/domain/foodEquiv';
import { grupoDe } from '@/domain/gruposEquiv';
import { Aire, CabeceraDia, Tarjeta, Titulillo } from './Piezas';

/**
 * «COMER» EN EL TELÉFONO — lo pautado del día, y cada comida en su caja.
 *
 * ══ Por qué se llama «Comer» y en el monitor «Dieta» ═══════════════════════
 *
 * Es la única palabra en la que los dos prototipos que eligió el dueño
 * discrepan, y se respetan los dos porque son dos aparatos. Aquí manda la ley 1
 * del estudio del teléfono —se nombra lo que HACES, no lo que te dan—; arriba,
 * en una línea de seis destinos junto a «Entreno» y «Revisión», manda que sea un
 * sustantivo. La ruta es la misma (`/mi/dieta`), así que ningún enlace guardado
 * se entera. Ver `CLIENT_SECTIONS`.
 *
 * ══ La comida es una caja, y las opciones un renglón de números ════════════
 *
 * Esto ha ido y ha vuelto, y conviene dejar escrito el porqué de cada vuelta.
 *
 * La comida empezó siendo una fila con su filete —tres tarjetas con sombra en
 * una pantalla de 390 px son tres planos apilados para una lista— y las
 * opciones, un pie: *Opción 1 de 4 · Cambiar*, que pasaba a la SIGUIENTE. Eso
 * obliga a elegir a ciegas: para ver la cuarta hay que pasar por la segunda y
 * la tercera.
 *
 * El arreglo fue poner las cuatro a la vista, en cajas con sus kcal. Y con
 * cinco opciones —que las hay— cinco cajas de 96 px no caben en un teléfono: la
 * tira se desbordaba a lo ancho y la quinta se leía fuera de la pantalla, cada
 * comida con su propio desplazamiento lateral.
 *
 * Lo que hay ahora lo pidió el dueño el 14 de septiembre, y cierra las dos
 * cosas: la comida VUELVE a la caja —una por comida, que es la unidad que se
 * mira delante de la nevera— y dentro, bajo su nombre, las opciones son un
 * renglón de pastillas numeradas, «1 2 3 4 5», que caben de sobra en el ancho.
 *
 * Las kcal de cada opción salen de las pastillas y se quedan una sola vez en la
 * cabecera de la comida, donde cambian al elegir. Decían lo mismo: en la demo,
 * las cuatro opciones del desayuno suman 908, 915, 917 y 903 kcal — cuatro
 * cifras casi iguales que piden compararse para desayunar. Las opciones de una
 * comida son intercambiables por construcción; esa es justo la razón de que
 * existan.
 *
 * Siguen yendo ENCIMA de los alimentos porque el orden de la decisión es ese:
 * primero cuál, luego qué lleva. Y el titular vuelve a ser un titular: el
 * nombre de la comida ya no cambia de opción al tocarlo.
 *
 * ══ Y los macros son tres cifras, no tres anillos ══════════════════════════
 *
 * Es lo que se decidió NO copiarle a Coachway ni a Efort: un anillo dice «vas
 * por la mitad» y tres cifras con su gramo dicen cuánto te queda. Ver `la app no
 * receta`.
 *
 * ══ Y sin barras, y sin dos varas de medir ═════════════════════════════════
 *
 * Cada cifra llevaba una barrita, y la gorda de las kcal encima. El dueño:
 * *«esas 3 rayas no tienen sentido, como la app no trackea solo quedan como 3
 * rayas siempre»*. Está medido en el código: la barra dibujaba lo que suman las
 * opciones abiertas contra lo pautado, y como el menú se escribe PARA cuadrar
 * con la pauta, las cuatro salían llenas todos los días de todo el mundo.
 *
 * Debajo de la estética había una avería, y sobrevivió a las barras metida en
 * el titular: la tarjeta decía «3.072 de 3.100 kcal» —lo que suman las comidas
 * escritas, contra el objetivo— y justo debajo tres macros que eran LO PAUTADO.
 * Dos varas de medir en una pieza de cuatro cifras. El dueño, el 14 sep:
 * *«muestra los macros reales, no los estipulados, es un error»*.
 *
 * Ahora las cuatro cifras vienen de la misma fuente y dicen lo mismo: lo que te
 * han pautado hoy. Nada de progreso — no hay nada que trackear, nadie apunta lo
 * que se come. Ver `ClientDietRoute`.
 *
 * ══ Y cada alimento dice por qué se puede cambiar ══════════════════════════
 *
 * Es lo que faltaba delante de la nevera: «no tengo plátanos» se resolvía
 * escribiéndole al entrenador. La lista existía —la ve él montando— y a esta
 * pantalla no llegaba el catálogo con el que se calcula. Ver `Alimento`, aquí
 * abajo.
 */
export const PantallaComer = ({ datos }) => {
  const { cabecera, dias, dia, comidas, historia, catalogo = [], grupos = [], sinCifras } = datos;

  return (
    <>
      <CabeceraDia {...cabecera} />
      <div className="tel-tramo">
        {/* La cinta de los siete días con la sigla de la dieta que toca en cada
            uno. Una letra y no un color: el color por categoría murió con el
            replanteo de la dieta. */}
        {dias.length > 1 ? (
          <div className="tel-cinta-dias">
            {dias.map((d) => (
              <button
                key={d.key}
                type="button"
                aria-current={d.esHoy ? 'date' : undefined}
                onClick={() => d.onElegir?.()}
              >
                <span className="tel-l">{d.sigla}</span>
                <span className="tel-d">{d.letra}</span>
              </button>
            ))}
          </div>
        ) : null}

        {dia ? (
          <Tarjeta>
            <div className="tel-kcal">
              <span className="tel-n">{dia.kcal}</span>
              <span className="tel-u">kcal</span>
            </div>
            <div className="tel-macros">
              {dia.macros.map((m) => (
                <div key={m.k}>
                  <div className="tel-k">{m.k}</div>
                  <div className="tel-v">
                    {m.v}
                    <small> g</small>
                  </div>
                </div>
              ))}
            </div>
          </Tarjeta>
        ) : null}

        {comidas.map((c) => (
          <Tarjeta className="tel-comida" key={c.id}>
            <div className="tel-cab">
              <span className="tel-nom">{c.nombre}</span>
              {c.kcal ? <span className="tel-kc">{c.kcal} kcal</span> : null}
            </div>

            {/* Las opciones: el rótulo una vez y los números al lado. Una comida
                con una sola no lleva mando — en reposo no está—, y por eso el
                rótulo va aquí dentro y no en la cabecera de la comida.

                La pastilla se ENCIENDE, no se marca: ni palomita ni flecha. Ley
                de los gestos. Y `aria-pressed` es lo que se lo cuenta a quien no
                ve el encendido. */}
            {c.opciones > 1 ? (
              <div className="tel-opciones" role="group" aria-label={`Opciones de ${c.nombre}`}>
                <span className="tel-o-rot">Opción</span>
                {c.lista.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    className="tel-opcion"
                    aria-pressed={o.puesta}
                    aria-label={o.nombre}
                    onClick={o.onElegir}
                  >
                    {o.etiqueta}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="tel-lista">
              {c.alimentos.map((a) => (
                <Alimento
                  key={a.id}
                  alimento={a}
                  catalogo={catalogo}
                  grupos={grupos}
                  sinCifras={sinCifras}
                />
              ))}
            </div>
          </Tarjeta>
        ))}

        {historia ? (
          <>
            <Titulillo>Cómo van tus calorías</Titulillo>
            <Tarjeta plana>
              <div className="tel-pie-nota">{historia.frase}</div>
              {historia.puntos.length > 1 ? (
                <Escalera puntos={historia.puntos} />
              ) : null}
            </Tarjeta>
          </>
        ) : null}

        <Aire />
      </div>
    </>
  );
};

/**
 * UN ALIMENTO DEL MENÚ, Y LO QUE PUEDE IR EN SU LUGAR.
 *
 * ══ Por qué el teléfono no las tenía ═══════════════════════════════════════
 *
 * Porque nadie se las pasaba: las equivalencias se calculan contra el catálogo
 * (`equivalencesFor`) y esta pantalla no lo recibía, así que un cliente en la
 * frutería sin plátanos tenía que escribirle a su entrenador para saber cuántas
 * fresas son. El dueño, el 14 de septiembre: *«no muestra las alternativas de
 * cada alimento, debería hacerlo»*.
 *
 * ══ Se calculan aquí, y a propósito ════════════════════════════════════════
 *
 * Memoizado sobre la entrada: solo se rehace al cambiar de alimento —elegir otra
 * opción de la comida, otro día del ciclo—, no en cada render. Y se calculan
 * ANTES de abrir nada porque son lo que decide si esta fila se puede pulsar: una
 * fila que al tocarla dijera «no hay alternativas» enseña a desconfiar de la
 * pantalla. Es la misma razón, escrita en `MealCard`, por la que el entrenador
 * tampoco ve un botón vacío.
 *
 * ══ Y aquí no se cambia nada ═══════════════════════════════════════════════
 *
 * Se lee. Tu plan sigue siendo lo que te pautaron: esto dice cuánto pesar de
 * otra cosa para que cuadre, no reescribe la dieta. Por eso no hay ningún verbo
 * —el «Usar» del taller es del que la monta— y el pie dice qué se conserva, que
 * es lo que convierte una lista de nombres en una decisión: igualar el macro de
 * la familia deja libres los otros dos, y esa diferencia se ve.
 */
const Alimento = ({ alimento, catalogo, grupos, sinCifras }) => {
  const [abierto, setAbierto] = useState(false);
  const entrada = alimento.entrada;

  const equivalencias = useMemo(() => {
    if (!entrada || catalogo.length === 0) return null;
    /* Tu grupo manda sobre el catálogo: si este alimento está en uno, la lista
       son los que escribió tu entrenador y ninguno más (`domain/gruposEquiv`). */
    const grupo = grupoDe(entrada.name, grupos, catalogo);
    return equivalencesFor(entrada, catalogo, [], { grupo });
  }, [entrada, catalogo, grupos]);

  if (!equivalencias) {
    return (
      <div className="tel-al">
        <span>{alimento.nombre}</span>
        <span className="tel-g">{alimento.racion}</span>
      </div>
    );
  }

  const macro = MACROS.find((m) => m.key === equivalencias.macro);

  return (
    <>
      <button
        type="button"
        className={`tel-al tel-cambiable${abierto ? ' tel-abierto' : ''}`}
        aria-expanded={abierto}
        aria-label={`Qué puedes comer en lugar de ${alimento.nombre}`}
        onClick={() => setAbierto((v) => !v)}
      >
        <span className="tel-al-nom">
          {alimento.nombre}
          <IconoEquivalencia size={13} />
        </span>
        <span className="tel-g">{alimento.racion}</span>
      </button>

      {abierto ? (
        <div className="tel-cambios">
          {equivalencias.items.map((item) => (
            <div className="tel-cambio" key={item.food.id || item.food.name}>
              <span>{item.food.name}</span>
              <span className="tel-g">{racionDe(item, { corta: true })}</span>
            </div>
          ))}
          <p className="tel-cambios-pie">
            {sinCifras
              ? `Cualquiera de estas va en lugar de ${alimento.nombre.toLowerCase()}.`
              : `Cada una te da unos ${equivalencias.macroGrams} g de ${(macro?.label || '').toLowerCase()}.`}
          </p>
        </div>
      ) : null}
    </>
  );
};

/**
 * LA ESCALERA de lo que te han pautado: una línea que salta cuando te cambian
 * las calorías, y plana mientras no te las cambian.
 *
 * Es la respuesta a «tu entrenador no ha cambiado tus calorías desde que
 * empezaste», que era una frase con el entrenador de sujeto. El hecho es la
 * línea recta, y se ve.
 *
 * ── Los escalones son cuadrados a propósito ───────────────────────────────
 * Una pauta no sube en rampa: estuvo en 2.150 hasta un día y al siguiente en
 * 1.970. Una diagonal entre los dos puntos dibujaría dos semanas de bajada
 * lenta que nadie escribió.
 *
 * Y una serie sin cambios se pinta CENTRADA, no pegada al suelo: el trazo no
 * está diciendo «cero», está diciendo «lo mismo».
 */
const Escalera = ({ puntos }) => {
  const min = Math.min(...puntos);
  const max = Math.max(...puntos);
  const rango = max - min;
  const y = (v) => (rango === 0 ? 30 : 50 - ((v - min) / rango) * 40);
  const x = (i) => (i * 300) / (puntos.length - 1);

  const d = puntos
    .map((v, i) =>
      i === 0
        ? `M0,${y(v).toFixed(1)}`
        : `L${x(i).toFixed(1)},${y(puntos[i - 1]).toFixed(1)} L${x(i).toFixed(1)},${y(v).toFixed(1)}`
    )
    .join(' ');

  return (
    <svg viewBox="0 0 300 60" preserveAspectRatio="none" className="tel-escalera" aria-hidden="true">
      <path
        d={d}
        stroke="var(--accent)"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
