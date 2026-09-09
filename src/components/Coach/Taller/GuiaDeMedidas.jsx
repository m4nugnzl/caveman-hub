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
 * ══ Por qué la figura está DIBUJADA y no esquematizada ═════════════════════
 *
 * La primera vuelta puso un monigote: un círculo por cabeza y una silueta de
 * palo. Y el dueño tenía razón en tirarlo. Una guía de medición no es un icono:
 * es una lámina anatómica, y su único trabajo es que alguien que no es del
 * oficio sepa DÓNDE poner la mano. «En el punto medio entre el acromion y el
 * olécranon» no sitúa nada; un brazo con su deltoides, su codo y su muñeca sí,
 * porque el punto medio se ve.
 *
 * Un monigote además miente por omisión: sin hombro, sin cintura y sin rodilla
 * no hay referencias, así que el punto numerado flota sobre un palo y el que
 * mide lo pone donde le parece — que es exactamente el ruido que esta pantalla
 * viene a evitar.
 *
 * Sigue siendo TRAZO y no ilustración con sombras: los tokens dan la línea y el
 * papel, así que funciona en los dos temas sin una segunda versión, y el detalle
 * interior —clavícula, línea media, rodillas de frente; columna, escápulas y
 * glúteos de espalda— está para situar, no para adornar.
 *
 * ══ Y de espalda, porque dos de los seis pliegues están detrás ═════════════
 *
 * El tricipital y el subescapular no se pueden marcar en una vista de frente
 * sin mentir. Así que la lámina de pliegues son DOS figuras del mismo cuerpo:
 * los cuatro anteriores en la de frente y los dos posteriores en la de espalda.
 * Misma silueta y mismo trazo; lo único que cambia es el detalle interior.
 *
 * ══ Todo se mide en el lado DERECHO ════════════════════════════════════════
 *
 * Es el estándar (ISAK) y es lo que dice el lema. En la lámina, el lado derecho
 * del sujeto cae a la IZQUIERDA en la vista de frente y a la DERECHA en la de
 * espalda — que es la razón por la que las marcas cambian de lado entre las dos
 * figuras y no un descuido.
 *
 * ══ Y la regla, que aquí por fin significa algo ════════════════════════════
 *
 * `tokens.css` reserva las marcas de graduación —la firma de la casa— para
 * «donde de verdad hay una escala», y avisa de que repetirla como adorno la
 * convertiría en textura. Una guía de medición es el sitio más literal que
 * existe en el producto para decir «aquí se mide». Es el único adorno de esta
 * pantalla y se lo ha ganado.
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

   Un cuerpo de ocho cabezas dibujado en un lienzo de 260 × 496, con el eje en
   x = 130. TRES piezas: el cuerpo entero —de la coronilla a los pies en un solo
   contorno— y un brazo por lado.

   Todo es simétrico respecto a x = 130: el lado derecho sale de restar a 260 el
   izquierdo, y por eso las dos mitades no se pueden descuadrar. */

/*
  ── LA CABEZA VA DENTRO DEL CONTORNO, NO ENCIMA ───────────────────────────

  Dibujada como pieza aparte era una figura CERRADA, así que se pintaba su arco
  inferior: una línea de barbilla cruzando el cuello que la convertía en un
  casco apoyado sobre un palo. En las láminas anatómicas la cabeza no se cierra
  por abajo — el cráneo baja por la mandíbula y sigue en el cuello sin
  interrupción, que es lo que hace que se lea como una persona.
*/

/*
  ── EL TRONCO Y LAS PIERNAS SON UN SOLO CONTORNO ──────────────────────────

  La primera versión los dibujó por separado y la cadera salía cortada por una
  recta horizontal: se veía la juntura, y una juntura recta en mitad de una
  cadera es lo primero que delata un dibujo hecho a trozos. Aquí el contorno
  baja por un costado, rodea una pierna entera, sube por la entrepierna, baja
  por la otra y vuelve — así la cadera y la entrepierna son curvas de verdad y
  no hay ninguna costura que esconder.

  Los brazos SÍ van sueltos, y a propósito: separados del tronco (12 px de aire
  a la altura del codo, como un brazo que cuelga relajado), que es la postura en
  la que se toman todas estas medidas. Pegados al costado no se podría marcar el
  punto medio del brazo, que es el sitio 2 de la cinta y el pliegue 1.
*/
const CUERPO =
  'M130 10 C118 10 108 20 108 34 C108 42 110 49 113 55 C112 61 116 66 118 71 ' +
  'C118 76 117 78 115 82 C104 86 89 93 82 106 C86 118 90 128 92 138 ' +
  'C95 152 97 166 99 180 C100 192 99 200 100 210 C97 220 92 230 91 242 ' +
  'C90 254 90 262 92 272 C90 292 89 316 90 336 C91 352 94 366 97 382 ' +
  'C99 400 101 420 103 438 C104 450 106 460 110 464 C116 466 122 462 123 454 ' +
  'C124 434 125 414 125 396 C124 376 123 358 122 340 C121 318 123 292 130 254 ' +
  'C137 292 139 318 138 340 C137 358 136 376 135 396 C135 414 136 434 137 454 ' +
  'C138 462 144 466 150 464 C154 460 156 450 157 438 C159 420 161 400 163 382 ' +
  'C166 366 169 352 170 336 C171 316 170 292 168 272 C170 262 170 254 169 242 ' +
  'C168 230 163 220 160 210 C161 200 160 192 161 180 C163 166 165 152 168 138 ' +
  'C170 128 174 118 178 106 C171 93 156 86 145 82 C143 78 142 76 142 71 ' +
  'C144 66 148 61 147 55 C150 49 152 42 152 34 C152 20 142 10 130 10 Z';

const BRAZO_I =
  'M104 90 C91 95 80 105 76 124 C73 145 74 160 74 176 C75 192 76 204 77 214 ' +
  'C75 226 74 234 76 246 C78 264 81 280 84 294 C84 305 85 316 90 320 ' +
  'C96 324 101 320 101 312 C101 302 99 298 98 294 C96 280 94 264 93 246 ' +
  'C92 234 92 226 91 214 C92 204 93 192 93 176 C93 160 93 145 95 129 ' +
  'C97 114 100 100 104 90 Z';

const BRAZO_D =
  'M156 90 C169 95 180 105 184 124 C187 145 186 160 186 176 C185 192 184 204 183 214 ' +
  'C185 226 186 234 184 246 C182 264 179 280 176 294 C176 305 175 316 170 320 ' +
  'C164 324 159 320 159 312 C159 302 161 298 162 294 C164 280 166 264 167 246 ' +
  'C168 234 168 226 169 214 C168 204 167 192 167 176 C167 160 167 145 165 129 ' +
  'C163 114 160 100 156 90 Z';

/* El detalle interior: lo que convierte una silueta en un cuerpo con
   referencias. De frente sitúa la clavícula, el pecho, el ombligo y el pliegue
   inguinal —que es el extremo superior del pliegue del muslo—; de espalda, la
   columna, las escápulas —el punto de partida del subescapular— y el pliegue
   glúteo. Las rodillas van en las dos: son el otro extremo del muslo. */
const RODILLAS = ['M102 344 C109 350 119 350 124 344', 'M158 344 C151 350 141 350 136 344'];

/*
  ── Y AQUÍ MENOS ES MÁS, QUE COSTÓ TRES VUELTAS APRENDERLO ────────────────

  Cada línea interior que se añadía «para dar cuerpo» acababa leyéndose como
  ROPA: el borde de los pectorales salía un escote, el esternón la costura de
  una camiseta y los pliegues inguinales unos calzoncillos. A 200 px de alto no
  hay sitio para musculatura — lo único que hace el detalle de más es vestir al
  dibujo.

  Así que aquí solo queda lo que un punto numerado necesita para no flotar, y
  cada línea tiene que justificar su sitio contra un sitio de medición
  concreto: la clavícula sostiene el perímetro de pecho, el ombligo sostiene el
  suyo y el pliegue abdominal, las rodillas cierran el muslo, y de espalda la
  escápula es literalmente el punto del que sale el subescapular. Nada más.
*/
const DETALLE = {
  frente: [
    'M110 96 C118 102 125 104 130 104 C135 104 142 102 150 96',
    'M126 190 a4 4.5 0 1 0 8 0 a4 4.5 0 1 0 -8 0',
    ...RODILLAS,
  ],
  espalda: [
    'M130 100 L130 246',
    /* La espina de la escápula bajando hasta su ÁNGULO INFERIOR: es el punto
       exacto del que sale el pliegue subescapular, así que tiene que verse. */
    'M101 116 C105 132 109 146 114 156',
    'M159 116 C155 132 151 146 146 156',
    'M96 230 C108 246 120 250 130 250 C140 250 152 246 164 230',
    ...RODILLAS,
  ],
};

/** Una figura entera, desplazada a su sitio del lienzo. */
const Figura = ({ vista, dx = 0, rotulo }) => (
  <g transform={dx ? `translate(${dx} 0)` : undefined}>
    <path className="guia-cuerpo" d={CUERPO} />
    <path className="guia-cuerpo" d={BRAZO_I} />
    <path className="guia-cuerpo" d={BRAZO_D} />
    {DETALLE[vista].map((d) => (
      <path className="guia-detalle" d={d} key={d} />
    ))}
    <text className="guia-vista" x="130" y="487" textAnchor="middle">
      {rotulo}
    </text>
  </g>
);

/*
  ── LAS MARCAS ────────────────────────────────────────────────────────────

  `marca` es dónde se toca el cuerpo; `hilo` es el segmento de guion que sale de
  ahí; `punto` es el disco numerado, siempre fuera de la silueta y siempre a la
  misma x —30 a la izquierda, 230 (o 430) a la derecha— para que la columna de
  números se lea como una columna.

  Van en el mismo orden que su lista de sitios y la numeración sale del índice:
  si mañana se añade un sitio, no hay dos sitios donde acordarse de subir un
  número.
*/

const MARCAS_CINTA = [
  { marca: { cx: 130, cy: 140, rx: 39, ry: 7 }, hilo: [172, 140, 214, 140], punto: [230, 140] },
  { marca: { cx: 85, cy: 160, rx: 11, ry: 4.5 }, hilo: [72, 160, 44, 160], punto: [30, 160] },
  { marca: { cx: 130, cy: 190, rx: 32, ry: 6.5 }, hilo: [164, 190, 214, 190], punto: [230, 190] },
  { marca: { cx: 130, cy: 236, rx: 40, ry: 7.5 }, hilo: [172, 236, 214, 236], punto: [230, 236] },
  { marca: { cx: 109, cy: 272, rx: 18, ry: 5.5 }, hilo: [89, 272, 44, 272], punto: [30, 272] },
  { marca: { cx: 112, cy: 390, rx: 11.5, ry: 4.5 }, hilo: [99, 390, 44, 390], punto: [30, 390] },
];

/*
  Los pliegues llevan además `giro`: la DIRECCIÓN del pellizco, que es la mitad
  del sitio. Y reparten las seis marcas entre las DOS figuras — los dos
  posteriores en la de espalda (dx 200), los cuatro anteriores en la de frente.

  Ojo al lado: se mide el derecho del sujeto, que de frente cae a la izquierda
  del dibujo y de espalda a la derecha. Por eso 1 y 2 están al otro lado.
*/
const MARCAS_PLIEGUE = [
  { marca: { x: 375, y: 160, giro: 0, w: 3.2, h: 8 }, hilo: [383, 162, 416, 174], punto: [430, 178] },
  { marca: { x: 348, y: 162, giro: 45 }, hilo: [356, 156, 416, 132], punto: [430, 128] },
  { marca: { x: 118, y: 190, giro: 0 }, hilo: [113, 190, 44, 190], punto: [30, 190] },
  { marca: { x: 102, y: 222, giro: -55 }, hilo: [96, 226, 44, 236], punto: [30, 240] },
  { marca: { x: 107, y: 300, giro: 0 }, hilo: [102, 300, 44, 300], punto: [30, 300] },
  { marca: { x: 118, y: 390, giro: 0, w: 3, h: 7 }, hilo: [113, 390, 44, 390], punto: [30, 390] },
];

/**
 * El pellizco: una LENTE, o sea una cresta de piel levantada entre dos dedos.
 *
 * Una figura cerrada y con eje: se ve a cualquier tamaño y puede girar para
 * decir con la forma si el pliegue va vertical o a 45°. La cinta no puede — un
 * anillo es igual mires por donde mires—, y por eso las dos técnicas se
 * distinguen sin una palabra.
 */
const lente = ({ x, y, giro = 0, w = 3.8, h = 9 }) => ({
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
    caja: '0 0 260 496',
    figuras: [{ vista: 'frente', dx: 0, rotulo: 'De frente' }],
    sitios: SITIOS_CINTA,
    marcas: MARCAS_CINTA,
    etiquetas: PERIMETER_LABELS,
  },
  pliegue: {
    titulo: 'Dónde va el pellizco',
    lema: 'Siempre el lado derecho, siempre la misma mano y siempre leyendo a los dos segundos. Un pliegue no se compara con el de otro: se compara con el tuyo de la semana pasada.',
    rotulo: 'Los seis pliegues y su dirección, de frente y de espalda',
    caja: '0 0 460 496',
    figuras: [
      { vista: 'frente', dx: 0, rotulo: 'De frente' },
      { vista: 'espalda', dx: 200, rotulo: 'De espalda' },
    ],
    sitios: SITIOS_PLIEGUE,
    marcas: MARCAS_PLIEGUE,
    etiquetas: FOLDS_LABELS,
  },
};

/** La guía por su id, para quien solo necesita nombrarla o listar sus sitios. */
export const guiaById = (que) => GUIAS[que] || GUIAS.cinta;

/** La lámina: las figuras, las marcas, los hilos y los números. */
const Lamina = ({ guia, pliegue }) => (
  <svg className="guia-svg" viewBox={guia.caja} role="img" aria-label={guia.rotulo}>
    {guia.figuras.map((f) => (
      <Figura key={f.vista} {...f} />
    ))}

    <g className={pliegue ? 'guia-pellizco' : 'guia-cinta'}>
      {guia.marcas.map(({ marca }, i) =>
        pliegue ? (
          <path key={i} {...lente(marca)} />
        ) : (
          <ellipse key={i} cx={marca.cx} cy={marca.cy} rx={marca.rx} ry={marca.ry} />
        )
      )}
    </g>

    <g className="guia-hilo">
      {guia.marcas.map(({ hilo }, i) => (
        <line key={i} x1={hilo[0]} y1={hilo[1]} x2={hilo[2]} y2={hilo[3]} />
      ))}
    </g>

    <g className="guia-punto">
      {guia.marcas.map(({ punto }, i) => (
        <g key={i}>
          <circle cx={punto[0]} cy={punto[1]} r="11" />
          <text x={punto[0]} y={punto[1] + 4} textAnchor="middle">
            {i + 1}
          </text>
        </g>
      ))}
    </g>
  </svg>
);

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
