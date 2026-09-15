import { Angry, Frown, Laugh, Meh, Smile, Star } from 'lucide-react';

/**
 * LA ESCALA: cuatro instrumentos, y no un icono distinto en el mismo control.
 *
 * ══ La historia, porque explica cada decisión ══════════════════════════════
 *
 * 1. Diez cajas iguales con un número dentro. Se contesta de un toque, pero
 *    cuenta mal lo que es: **una escala no es una lista de diez opciones, es una
 *    cantidad**, y con diez losas idénticas el 2 y el 9 pesan lo mismo hasta que
 *    se leen los dígitos.
 * 2. La RAMPA: discos que crecen de izquierda a derecha, teñidos hasta el
 *    elegido. Arregla la cantidad y deja viva la otra avería, que solo se ve
 *    mirando el cuestionario entero: nueve rampas idénticas seguidas.
 * 3. El GLIFO: la misma rampa con el icono de cada pregunta dentro de sus
 *    discos. Cubiertos la adherencia, un cerebro el estrés, una hoja las
 *    digestiones. No coló, y con razón: **unos cubiertos no son la adherencia,
 *    son la comida**, y un cerebro no es el estrés. Además, el mismo icono
 *    repetido once veces en fila deja de ser un icono y pasa a ser textura. Era
 *    el mismo control nueve veces con un dibujo encima.
 * 4. Esto: lo que cambia de una pregunta a otra no es el DIBUJO, es CÓMO SE
 *    CONTESTA. Cuatro instrumentos, cada uno donde dice algo cierto.
 *
 * ══ Los cuatro ════════════════════════════════════════════════════════════
 *
 *   · `estrellas` — lo que se VALORA, de 1 a 5. Adherencia, sueño, digestiones.
 *     Cinco estrellas que se llenan: la calificación de toda la vida. Nadie
 *     necesita que se la expliquen y todo el mundo sabe que cuatro es buena
 *     nota — que es exactamente lo que una escala con anclas intentaba decir con
 *     dos palabras debajo.
 *   · `caras` — lo que se SIENTE, de 1 a 5. Sensaciones, ganas de seguir. Se
 *     elige la cara que se parece a cómo fue la semana, sin traducirla a un
 *     número primero. Es el único instrumento en el que el paso anterior no se
 *     tiñe: **las caras no se acumulan**. Una respuesta de ánimo no es «hasta
 *     aquí», es «ésta».
 *   · `deposito` — lo que se GASTA, de 1 a 5. La energía, en tramos de batería.
 *     Un depósito a un tramo no necesita rótulo para decir que se acabó.
 *   · la RAMPA (sin instrumento) — la cantidad, de 0 a 10. El RPE, el dolor, el
 *     hambre, las agujetas, la fatiga, el estrés, los entrenos completados. Es
 *     donde el 0-10 significa algo de verdad y donde hace falta la resolución:
 *     entre un dolor de 3 y uno de 5 hay una decisión de entrenamiento.
 *
 * ══ Y ninguno lleva su cifra al lado ══════════════════════════════════════
 *
 * Se escribió un «4/5» a la derecha de las estrellas y del depósito, y sobra:
 * **un instrumento que necesita el número escrito al lado es un instrumento que
 * no ha sabido decirlo**. Cuatro estrellas encendidas ya son cuatro. La rampa sí
 * lleva cifras, pero debajo de cada paso y no como resultado aparte, porque de 0
 * a 10 el sitio exacto sí hay que contarlo. Quien necesita el número —el
 * entrenador leyendo la revisión— lo tiene en `ui/Subjetivo`, que es la pieza
 * que lee, no la que pregunta.
 *
 * ══ POR QUÉ CINCO Y NO DIEZ ═══════════════════════════════════════════════
 *
 * Cinco estrellas son cinco. Diez estrellas no son una escala más fina: son un
 * control de precisión falsa, porque nadie distingue su adherencia de 6 de su
 * adherencia de 7 — y menos aún con medias estrellas. El instrumento manda sobre
 * el rango y por eso las preguntas que lo estrenan bajaron a 1-5 en el catálogo,
 * con su migración para lo ya contestado (0120). Ver `domain/protocol.js`.
 *
 * ══ Una pieza, una raíz ═══════════════════════════════════════════════════
 *
 * Los cuatro instrumentos salen dentro del MISMO `.rampa-marco`. No es pereza de
 * nombre: hay dos hojas ajenas que separan el control de su enunciado por esa
 * raíz —`.feedback-q.es-numerada > .rampa-marco` en `ajustes.css` y
 * `.campo-q .field > .rampa-marco` en `formularios.css`—, y ya costó una vuelta
 * que la pieza cambiara de raíz según la pregunta.
 *
 * ══ La tinta es la de la pregunta ═════════════════════════════════════════
 *
 * Cada pregunta del catálogo trae su color de serie (`domain/protocol.js`), que
 * es con el que su gráfico se pinta después en la pantalla del entrenador. Usarlo
 * aquí hace que la respuesta y su serie compartan tinta: lo que el cliente pinta
 * de lima el domingo es la línea lima que su entrenador mira el lunes. Sin color
 * declarado —las preguntas de un formulario suelto no tienen serie— manda el
 * acento, que es lo que invita.
 *
 * ══ LAS PUNTAS DICEN QUÉ SIGNIFICAN ═══════════════════════════════════════
 *
 * La escala de cada pregunta trae sus dos extremos (`anclas`) y se escriben
 * debajo del primer y del último paso: «Nada» a la izquierda, «Clavada» a la
 * derecha. Sin `anclas` el renglón no se pinta: un hueco reservado por si acaso
 * es peor que no tenerlo.
 *
 * @param instrumento Con qué se contesta: `estrellas`, `caras`, `deposito` o
 *   nada, que es la rampa. Lo trae el catálogo; una pregunta inventada por el
 *   entrenador no lleva ninguno.
 * @param color       La tinta de la serie de esta pregunta, si la tiene.
 * @param anclas      Qué significan el mínimo y el máximo, en dos palabras.
 * @param readOnly    Ya se contestó: se pinta el resultado, no un control.
 * @param soloLectura Así se va a ver: el control ENTERO, apagado. Lo usan los
 *   constructores para enseñar la pregunta como le llegará a él.
 */

/*
  LAS CINCO CARAS, y por qué son de lucide y no dibujadas a mano.

  Se probaron dibujadas —un círculo y una curva de boca interpolada— y el
  problema no es dibujarlas, es que cinco curvas sacadas de una fórmula salen
  equiespaciadas y las caras no se leen así: entre «mal» y «regular» hay más
  distancia de la que hay entre «bien» y «muy bien». Las de lucide están
  dibujadas una a una y cada una tiene su gesto (la primera trae cejas, la última
  abre la boca), que es lo que hace que la fila se lea de un vistazo.

  El orden es el de la escala y no el del catálogo de iconos: `Angry` es el 1.
*/
const CARAS = [Angry, Frown, Meh, Smile, Laugh];

/*
  UN PASO, para los cuatro instrumentos.

  Lo que comparten no es el dibujo sino la mecánica: qué está lleno, qué está
  puesto, que en lectura es un `span` y no un botón, y que volver a pulsar lo
  elegido lo borra. Escrito una vez, porque la vez que estuvo escrito cuatro
  veces se arregló en tres.
*/
const Paso = ({ clase, paso, indice, elegido, acumula, readOnly, soloLectura, onChange, rotulo, children }) => {
  const puesto = elegido >= 0 && indice === elegido;
  /* «Lo andado» solo tiene sentido donde la respuesta es una cantidad. En las
     caras no: una cara no incluye a las anteriores. */
  const lleno = acumula && elegido >= 0 && indice <= elegido;
  const atributos = {
    className: clase,
    'data-lleno': lleno ? '1' : undefined,
    'data-puesto': puesto ? '1' : undefined,
  };

  if (readOnly) {
    return (
      <span {...atributos} aria-hidden="true">
        {children}
      </span>
    );
  }

  return (
    <button
      type="button"
      {...atributos}
      disabled={soloLectura}
      aria-pressed={puesto}
      aria-label={rotulo}
      /* Volver a pulsar el valor elegido lo borra. Sin esto no hay forma de
         deshacer una respuesta dada por error, y dejar un dato falso es peor que
         no tener dato. */
      onClick={() => onChange(puesto ? '' : String(paso))}
    >
      {children}
    </button>
  );
};

export const Escala = ({
  min = 1,
  max = 10,
  valor,
  onChange,
  color = null,
  instrumento = null,
  anclas = null,
  etiqueta,
  readOnly = false,
  soloLectura = false,
}) => {
  const pasos = [];
  for (let i = min; i <= max; i += 1) pasos.push(i);

  const actual = String(valor ?? '');
  const elegido = pasos.findIndex((p) => String(p) === actual);
  /* Los dos, o ninguno: un extremo rotulado y el otro en blanco se lee como un
     fallo del programa, no como una escala a medio explicar. */
  const puntas = Array.isArray(anclas) && anclas.length === 2 && anclas.every(Boolean);

  /* Las caras se sirven del catálogo por POSICIÓN, no por valor: una escala de
     caras es de cinco pasos y la primera cara es el primer paso, aunque el
     catálogo empezara a contar en cero. */
  const usaCaras = instrumento === 'caras' && pasos.length <= CARAS.length;
  const tipo = usaCaras ? 'caras' : instrumento === 'estrellas' || instrumento === 'deposito' ? instrumento : 'rampa';

  const comunes = {
    elegido,
    readOnly,
    soloLectura,
    onChange,
    acumula: tipo !== 'caras',
  };

  const dentroDelPaso = (paso, i) => {
    if (tipo === 'estrellas') {
      return <Star strokeWidth={1.6} aria-hidden="true" />;
    }
    if (tipo === 'caras') {
      const Cara = CARAS[i];
      return <Cara strokeWidth={1.6} aria-hidden="true" />;
    }
    if (tipo === 'deposito') return null;
    /* La rampa: el disco crece del primero al último, así que la fila en blanco
       ya se lee de poco a mucho antes de tocarla. Los TAMAÑOS los interpola el
       CSS a partir de `--nivel` (0 a 1) y no el JSX, porque en un teléfono los
       mismos once pasos entran en 340 px y un tamaño en píxeles metido en el
       atributo `style` le habría ganado a la media query. Ver `--disco-min`. */
    const nivel = pasos.length === 1 ? 1 : i / (pasos.length - 1);
    return (
      <>
        <span className="rampa-disco" style={{ '--nivel': nivel }} aria-hidden="true" />
        <span className="rampa-cifra" aria-hidden={readOnly || undefined}>
          {paso}
        </span>
      </>
    );
  };

  const clasePaso = { estrellas: 'estrella', caras: 'cara-paso', deposito: 'tramo', rampa: 'rampa-paso' }[tipo];

  const fila = (
    <div
      className={tipo === 'rampa' ? 'rampa' : `instrumento is-${tipo}`}
      /* En lectura no es un grupo de controles: es una cifra dibujada, y se
         anuncia como tal en vez de deletrear once pasos. */
      role={readOnly ? 'img' : 'group'}
      /* Con extremos, el grupo los dice: el renglón de debajo va oculto a los
         lectores —dos palabras sueltas detrás de once botones no se entienden—
         y lo que significan las puntas se oye aquí, al entrar. */
      aria-label={
        readOnly
          ? `${actual} de ${max}`
          : puntas
            ? `${etiqueta}, de ${anclas[0]} a ${anclas[1]}`
            : etiqueta
      }
      /* Los pasos, para que el ancho del control salga de cuántos son y no de la
         columna: ver `--rampa-pasos` en `controles.css`. */
      style={{ '--rampa-pasos': pasos.length, ...(color ? { '--rampa-tinta': color } : {}) }}
    >
      {pasos.map((paso, i) => (
        <Paso
          key={paso}
          {...comunes}
          clase={clasePaso}
          paso={paso}
          indice={i}
          rotulo={`${paso} de ${max}`}
        >
          {dentroDelPaso(paso, i)}
        </Paso>
      ))}
    </div>
  );

  /*
    EL MARCO VA SIEMPRE, con puntas o sin ellas.

    Vivió un tiempo saliendo solo cuando había `anclas`, y con eso el control
    cambiaba de raíz según la pregunta: las hojas que separan el control de su
    enunciado (`.feedback-q > .rampa-marco`, `.campo-q .field > .rampa-marco`)
    alcanzaban a unas escalas y a otras no, y las que traían puntas salían
    pegadas al enunciado. Una pieza tiene una sola raíz.
  */
  return (
    <div
      className="rampa-marco"
      data-instrumento={tipo === 'rampa' ? undefined : tipo}
      style={{ '--rampa-pasos': pasos.length }}
    >
      {fila}
      {/* Aparte del `group` de arriba y sin foco: son el rótulo del dibujo, no
          dos opciones más. Lo que anuncia un lector de pantalla al llegar al
          control sigue siendo la pregunta. */}
      {puntas && (
        <p className="rampa-puntas" aria-hidden="true">
          <span>{anclas[0]}</span>
          <span>{anclas[1]}</span>
        </p>
      )}
    </div>
  );
};
