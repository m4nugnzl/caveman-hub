import { FOLDS_LABELS, PERIMETER_LABELS } from '@/domain/anthropometry';

/**
 * LA GUÍA DE MEDICIÓN: dónde va la cinta, dónde va el pellizco, y qué se
 * falsea sin querer.
 *
 * ══ El hueco que tapa ══════════════════════════════════════════════════════
 *
 * La aplicación pide **nueve perímetros y seis pliegues sin explicar ni uno**.
 * Ni al entrenador que los enciende ni al cliente que los toma. Y una medida mal
 * tomada no es un dato peor: es ruido dentro de la serie contra la que se compara
 * todo lo demás. Una cintura medida hoy sobre el ombligo y la semana que viene
 * dos dedos más arriba produce «−2 cm» que nadie ha ganado.
 *
 * ══ La figura es TRAZO, y eso es una decisión tomada dos veces ═════════════
 *
 * Hubo una lámina anatómica: contorno relleno, detalle interior —clavícula,
 * ombligo, escápulas, rodillas—, marcas en elipse rodeando el cuerpo, hilos de
 * guiones hasta un disco de acento. Dibujaba mejor un cuerpo y **pesaba como
 * una ilustración**: media pantalla para decir seis sitios.
 *
 * Ésta es la otra: la figura de la lámina 9 del estudio de Efort
 * (`docs/efort-diseno-antes-y-despues.html`). Una silueta de línea de 130 × 276
 * en una columna de 172 px, las cintas como **rectas sobre el cuerpo** y los
 * números en disco de papel, callados. Es la misma pieza y ocupa un tercio.
 *
 * ── Lo que se pierde, dicho aquí para que nadie lo redescubra ──────────────
 * Sin detalle interior, el punto no se sitúa por el dibujo: se sitúa por el
 * NÚMERO y por su renglón. Por eso el texto de cada sitio es obligatorio y no
 * decorativo — «en el punto medio entre el acromion y el olécranon» es ahora la
 * mitad de la guía, no el pie de foto de la otra mitad. Si algún día se recorta
 * ese texto, la lámina deja de enseñar nada.
 *
 * ══ Y de espalda, porque dos de los seis pliegues están detrás ═════════════
 *
 * El tricipital y el subescapular no se pueden marcar en una vista de frente
 * sin mentir. Así que la lámina de pliegues son DOS figuras del mismo cuerpo.
 * En trazo, las dos siluetas son idénticas, así que la de espalda lleva **una
 * sola línea interior**: la columna. Es lo mínimo para que no se lea como la de
 * frente con las marcas cambiadas de lado, que es justo el error que provoca.
 *
 * ══ Todo se mide en el lado DERECHO ════════════════════════════════════════
 *
 * Es el estándar (ISAK) y es lo que dice el lema. En la lámina, el lado derecho
 * del sujeto cae a la IZQUIERDA en la vista de frente y a la DERECHA en la de
 * espalda — que es la razón por la que las marcas cambian de lado entre las dos
 * figuras y no un descuido.
 *
 * ── Nuestros sitios no son los de nadie más ────────────────────────────────
 * Nueve medidas en SEIS sitios de cinta, las de `PERIMETER_LABELS`. Los brazos,
 * los muslos y los gemelos se piden por separado izquierdo y derecho, así que el
 * sitio es uno y las medidas son dos. Y medimos **ombligo** donde otras
 * aplicaciones miden cintura: copiar su lista sería pedir cosas que esta
 * aplicación no guarda en ninguna parte. Los pliegues son seis y uno por sitio.
 */

/**
 * Los sitios de la CINTA, con qué se hace mal en cada uno.
 *
 * `campos` son las claves de `PERIMETER_LABELS` que caen en ese sitio: es lo que
 * permite que la guía y el formulario no puedan discrepar — si mañana se añade
 * un perímetro, la lista se queda corta y se ve.
 */
const SITIOS_CINTA = [
  {
    sitio: 'Pecho',
    campos: ['pecho'],
    como: 'A la altura de la cuarta articulación condroesternal, al final de una espiración normal.',
    ojo: 'Sin hinchar el pecho, y la cinta horizontal vista desde un lado.',
  },
  {
    sitio: 'Brazo',
    campos: ['brazoD', 'brazoI'],
    como: 'En el punto medio entre el acromion y el olécranon, con el brazo colgando relajado.',
    ojo: 'Relajado, no en tensión: el mismo brazo contraído da hasta tres centímetros más.',
  },
  {
    sitio: 'Ombligo',
    campos: ['ombligo'],
    como: 'A la altura del ombligo, al final de una espiración normal.',
    ojo: 'Sin meter tripa. Es el sitio donde más se falsea sin querer.',
  },
  {
    sitio: 'Glúteo',
    campos: ['gluteo'],
    como: 'Por la parte más prominente de los glúteos, de pie y con los pies juntos.',
    ojo: 'La cinta paralela al suelo. De perfil se ve enseguida si está torcida.',
  },
  {
    sitio: 'Muslo',
    campos: ['musloD', 'musloI'],
    como: 'Un centímetro por debajo del pliegue glúteo, con el peso repartido en las dos piernas.',
    ojo: 'De pie, nunca sentado: sentado el muslo se aplasta y mide más.',
  },
  {
    sitio: 'Gemelo',
    campos: ['gemeloD', 'gemeloI'],
    como: 'En el perímetro máximo de la pantorrilla, de pie y con el peso repartido.',
    ojo: 'Busca el punto más ancho subiendo y bajando la cinta antes de leer.',
  },
];

/**
 * Los seis PLIEGUES.
 *
 * Cada uno lleva la dirección del pellizco porque es la mitad del sitio: el
 * tricipital va vertical y el subescapular oblicuo, y cogerlos al revés cambia
 * el número. Es el dato que ninguna aplicación escribe y que todo el que ha dado
 * un curso de cineantropometría se sabe de memoria.
 */
const SITIOS_PLIEGUE = [
  {
    sitio: 'Tricipital',
    campos: ['tricipital'],
    como: 'Vertical, en la cara posterior del brazo, en el punto medio entre el acromion y el olécranon.',
    ojo: 'El brazo cuelga relajado. Si está en tensión, el pliegue se escapa entre los dedos.',
  },
  {
    sitio: 'Subescapular',
    campos: ['subescapular'],
    como: 'Oblicuo, a 45°, justo debajo del ángulo inferior de la escápula.',
    ojo: 'Sigue la línea natural de la piel hacia abajo y afuera; en horizontal mide otra cosa.',
  },
  {
    sitio: 'Abdominal',
    campos: ['abdominal'],
    como: 'Vertical, a unos dos centímetros al lado del ombligo.',
    ojo: 'De pie y con el abdomen relajado. Contraerlo endurece el pliegue y da menos.',
  },
  {
    sitio: 'Suprailíaco',
    campos: ['suprailiaco'],
    como: 'Oblicuo, sobre la cresta ilíaca, siguiendo la línea natural del costado.',
    ojo: 'Es el que más varía entre dos personas distintas: mídelo siempre tú, no lo delegues.',
  },
  {
    sitio: 'Muslo',
    campos: ['muslo'],
    como: 'Vertical, en la cara anterior del muslo, en el punto medio entre el pliegue inguinal y la rodilla.',
    ojo: 'Sentado con la rodilla a 90° se coge mejor: de pie el cuádriceps tira de la piel.',
  },
  {
    sitio: 'Pantorrilla',
    campos: ['pantorrilla'],
    como: 'Vertical, en la cara interna de la pierna, a la altura del perímetro máximo.',
    ojo: 'Con el pie apoyado y la rodilla flexionada, sin peso en esa pierna.',
  },
];

/* ══ LA FIGURA ═══════════════════════════════════════════════════════════════

   Un cuerpo de línea en un lienzo de 130 × 276, con el eje en x = 65. Seis
   trazos y ninguno relleno: cabeza, cuello, tronco, un brazo por lado y una
   pierna por lado.

   ── Los brazos van SEPARADOS del tronco, y a propósito ────────────────────
   Con 10 px de aire a la altura del codo, que es un brazo colgando relajado: la
   postura en la que se toman todas estas medidas. Pegados al costado no se
   podría marcar el punto medio del brazo, que es el sitio 2 de la cinta y el
   pliegue 1.

   ── Cada limbo son DOS líneas, no una ─────────────────────────────────────
   Un brazo de una sola línea es un palo, y sobre un palo no se puede poner una
   cinta: no hay grosor que rodear. Con dos, la marca cruza algo. Es la
   diferencia entre un esquema y una figura sobre la que se puede señalar. */

const CABEZA = { cx: 65, cy: 26, r: 14 };
const CUELLO = 'M58 39 v8 M72 39 v8';
const TRONCO =
  'M58 47 C46 49 39 55 38 64 L36 96 C35 106 40 112 41 120 L38 150 ' +
  'L92 150 L89 120 C90 112 95 106 94 96 L92 64 C91 55 84 49 72 47 Z';
const BRAZO_I = 'M38 66 L28 118 C27 124 29 130 31 134 M39 70 L34 120';
const BRAZO_D = 'M92 66 L102 118 C103 124 101 130 99 134 M91 70 L96 120';
const PIERNA_I = 'M42 150 L40 200 L41 252 L55 252 L56 200 L58 150';
const PIERNA_D = 'M72 150 L74 200 L75 252 L89 252 L90 200 L88 150';

/* La única línea interior de toda la lámina, y solo en la vista de espalda.
   Ver el encabezado: sin ella las dos figuras son el mismo dibujo. */
const COLUMNA = 'M65 48 L65 149';

/**
 * El CUERPO: el trazo, la columna de la vista de espalda y el rótulo.
 *
 * Exportado porque lo usa el mapa del dolor (`ui/ZonaDelCuerpo`), que es otra
 * cosa que se señala sobre el mismo cuerpo. Un segundo monigote dibujado aparte
 * para la misma aplicación se separaría del primero a la tercera semana, y
 * entonces habría dos siluetas distintas del mismo cliente en dos pantallas
 * suyas. En un lienzo de 130 × 276 con el eje en x = 65; quien lo monta lo
 * desplaza a su sitio.
 */
export const FiguraDeCuerpo = ({ vista, rotulo }) => (
  <>
    <g className="guia-cuerpo">
      <circle cx={CABEZA.cx} cy={CABEZA.cy} r={CABEZA.r} />
      {[CUELLO, TRONCO, BRAZO_I, BRAZO_D, PIERNA_I, PIERNA_D].map((d) => (
        <path d={d} key={d} />
      ))}
    </g>
    {vista === 'espalda' && <path className="guia-eje" d={COLUMNA} />}
    {rotulo && (
      <text className="guia-vista" x="65" y="270" textAnchor="middle">
        {rotulo}
      </text>
    )}
  </>
);

/** Una figura entera, desplazada a su sitio del lienzo. */
const Figura = ({ vista, dx = 0, rotulo }) => (
  <g transform={dx ? `translate(${dx} 0)` : undefined}>
    <FiguraDeCuerpo vista={vista} rotulo={rotulo} />
  </g>
);

/*
  ── LAS MARCAS ────────────────────────────────────────────────────────────

  `marca` es dónde se toca el cuerpo y `punto` es el disco numerado. No hay hilo
  entre los dos: el disco va a la MISMA ALTURA que su marca y siempre a la misma
  x —14 a la izquierda, 116 a la derecha—, así que la columna de números se lee
  como una columna y la altura basta para emparejarlos. Un guion cruzando el
  papel para recorrer doce píxeles era mueble.

  Van en el mismo orden que su lista de sitios y la numeración sale del índice:
  si mañana se añade un sitio, no hay dos sitios donde acordarse de subir un
  número.
*/

const MARCAS_CINTA = [
  { cinta: [37, 86, 93, 86], punto: [116, 86] },
  { cinta: [29, 96, 39, 96], punto: [14, 96] },
  { cinta: [38, 116, 92, 116], punto: [116, 116] },
  { cinta: [36, 140, 94, 140], punto: [116, 140] },
  { cinta: [39, 166, 60, 166], punto: [14, 166] },
  { cinta: [38, 218, 58, 218], punto: [14, 218] },
];

/*
  Los pliegues llevan además `giro`: la DIRECCIÓN del pellizco, que es la mitad
  del sitio. Y reparten las seis marcas entre las DOS figuras — los dos
  posteriores en la de espalda (dx 160), los cuatro anteriores en la de frente.

  Ojo al lado: se mide el derecho del sujeto, que de frente cae a la izquierda
  del dibujo y de espalda a la derecha. Por eso 1 y 2 están al otro lado, y por
  eso los dos oblicuos giran en sentidos opuestos: los dos bajan hacia AFUERA,
  y afuera cae a la izquierda de frente y a la derecha de espalda. Con el giro
  cambiado el pellizco baja hacia el ombligo, que es la otra medida.
*/
const MARCAS_PLIEGUE = [
  { pellizco: { x: 254, y: 86, w: 2.2, h: 5.5 }, punto: [276, 86] },
  { pellizco: { x: 238, y: 106, giro: -45 }, punto: [276, 106] },
  { pellizco: { x: 57, y: 116 }, punto: [14, 116] },
  { pellizco: { x: 44, y: 134, giro: 40 }, punto: [14, 134] },
  { pellizco: { x: 49, y: 180 }, punto: [14, 180] },
  { pellizco: { x: 54, y: 220, w: 2.2, h: 5.5 }, punto: [14, 220] },
];

/**
 * El pellizco: una LENTE, o sea una cresta de piel levantada entre dos dedos.
 *
 * Una figura cerrada y con eje: se ve a cualquier tamaño y puede girar para
 * decir con la forma si el pliegue va vertical o a 45°. La cinta no puede — una
 * recta es igual mires por donde mires—, y por eso las dos técnicas se
 * distinguen sin una palabra.
 */
const lente = ({ x, y, giro = 0, w = 2.8, h = 6.5 }) => ({
  d: `M${x} ${y - h} Q${x + w} ${y} ${x} ${y + h} Q${x - w} ${y} ${x} ${y - h} Z`,
  transform: giro ? `rotate(${giro} ${x} ${y})` : undefined,
});

/**
 * Las dos guías, con su título, su lema y su lienzo.
 *
 * El lema es la mitad del valor de la guía y no es el mismo para las dos: la
 * cinta se falsea por el sitio, el plicómetro además por la mano y por el
 * momento de leer.
 */
export const GUIAS = {
  cinta: {
    titulo: 'Dónde va la cinta',
    lema: 'El mismo sitio y las mismas condiciones cada vez. Una medida tomada de otra manera no es un dato nuevo: es ruido.',
    rotulo: 'Los seis sitios donde va la cinta',
    caja: '0 0 130 276',
    figuras: [{ vista: 'frente', dx: 0, rotulo: 'De frente' }],
    sitios: SITIOS_CINTA,
    marcas: MARCAS_CINTA,
    etiquetas: PERIMETER_LABELS,
  },
  pliegue: {
    titulo: 'Dónde va el pellizco',
    lema: 'Siempre el lado derecho, siempre la misma mano y siempre leyendo a los dos segundos. Un pliegue no se compara con el de otro: se compara con el tuyo de la semana pasada.',
    rotulo: 'Los seis pliegues y su dirección, de frente y de espalda',
    caja: '0 0 290 276',
    figuras: [
      { vista: 'frente', dx: 0, rotulo: 'De frente' },
      { vista: 'espalda', dx: 160, rotulo: 'De espalda' },
    ],
    sitios: SITIOS_PLIEGUE,
    marcas: MARCAS_PLIEGUE,
    etiquetas: FOLDS_LABELS,
  },
};

/** La guía por su id, para quien solo necesita nombrarla o listar sus sitios. */
export const guiaById = (que) => GUIAS[que] || GUIAS.cinta;

/**
 * La lámina: las figuras, las marcas y los números.
 *
 * @param activo El índice del sitio que se está midiendo AHORA MISMO, si hay
 *   alguno. La lámina completa enseña seis sitios a la vez y eso está bien para
 *   leerla de corrido; cuando se usa para rellenar (`MedirConGuia`) hay uno que
 *   importa y cinco que no, y señalarlo es la mitad del valor del dibujo.
 *   Se marca con `data-on` y lo viste el CSS: apagar los otros aquí, en el JSX,
 *   obligaría a repetir la decisión en cada nodo.
 */
const Lamina = ({ guia, pliegue, activo = null }) => (
  <svg className="guia-svg" viewBox={guia.caja} role="img" aria-label={guia.rotulo}>
    {guia.figuras.map((f) => (
      <Figura key={f.vista} {...f} />
    ))}

    <g className={pliegue ? 'guia-pellizco' : 'guia-cinta'} data-hay-activo={activo === null ? undefined : '1'}>
      {guia.marcas.map(({ cinta, pellizco }, i) =>
        pliegue ? (
          <path key={i} {...lente(pellizco)} data-on={i === activo ? '1' : undefined} />
        ) : (
          <line
            key={i}
            x1={cinta[0]}
            y1={cinta[1]}
            x2={cinta[2]}
            y2={cinta[3]}
            data-on={i === activo ? '1' : undefined}
          />
        )
      )}
    </g>

    <g className="guia-punto" data-hay-activo={activo === null ? undefined : '1'}>
      {guia.marcas.map(({ punto }, i) => (
        <g key={i} data-on={i === activo ? '1' : undefined}>
          <circle cx={punto[0]} cy={punto[1]} r="8" />
          <text x={punto[0]} y={punto[1] + 3.2} textAnchor="middle">
            {i + 1}
          </text>
        </g>
      ))}
    </g>
  </svg>
);

/**
 * La lámina SOLA, para quien pone al lado sus propias casillas.
 *
 * La usa el asistente de la revisión (`anthropometry/MedirConGuia`): allí la
 * guía no es un desplegable que se abre antes de medir, es la mitad izquierda
 * del paso, y los seis renglones de la derecha son los campos. Por eso hace
 * falta el dibujo sin su lista —la lista la pone quien mide— y con un sitio
 * encendido.
 */
export const LaminaDeMedidas = ({ que = 'cinta', activo = null }) => {
  const guia = guiaById(que);
  return (
    <div className={`guia-lamina${guia.figuras.length > 1 ? ' es-doble' : ''}`}>
      <Lamina guia={guia} pliegue={que === 'pliegue'} activo={activo} />
    </div>
  );
};

/**
 * El cuerpo de la guía, sin diálogo: quien la abre decide si va en una capa
 * (el constructor) o dentro de la pantalla (el portal del cliente).
 *
 * @param que `'cinta'` para los perímetros, `'pliegue'` para los pliegues.
 */
export const GuiaDeMedidas = ({ que = 'cinta' }) => {
  const guia = guiaById(que);
  const doble = guia.figuras.length > 1;

  return (
    <div className={`guia${doble ? ' es-doble' : ''}`}>
      <div className="guia-lamina">
        <Lamina guia={guia} pliegue={que === 'pliegue'} />
      </div>

      <div className="guia-sitios">
        {guia.sitios.map((s, i) => (
          <div className="guia-sitio" key={s.sitio}>
            <span className="guia-n">{i + 1}</span>
            <span className="guia-texto">
              <b>{s.sitio}</b>
              <span className="guia-como">{s.como}</span>
              <em className="guia-ojo">{s.ojo}</em>
              {/* Qué campos concretos salen de este sitio: es lo que explica por
                  qué seis puntos de cinta producen nueve casillas. Con los
                  pliegues es uno a uno, y entonces el renglón repetiría el
                  nombre que ya está en negrita, así que no se pinta. */}
              {s.campos.length > 1 && (
                <span className="guia-campos">
                  {s.campos.map((c) => guia.etiquetas[c]).join(' · ')}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
