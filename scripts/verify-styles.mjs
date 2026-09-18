/**
 * Verificación del sistema visual.
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 * El proyecto no usa CSS-in-JS ni módulos: las clases son cadenas de texto en el
 * JSX y los colores son tokens `var(--x)`. Eso mantiene el CSS pequeño y legible,
 * pero significa que **una clase mal escrita no falla en ningún sitio**: el
 * elemento simplemente sale sin estilo. Una vez se renombró un bloque de clases
 * sin actualizar a sus 38 consumidores y la aplicación entera se descolocó sin
 * que ni el linter ni el build dijeran nada.
 *
 * Este script cierra ese hueco. Comprueba cinco cosas:
 *   1. Toda clase usada en `className` existe en el CSS.
 *   2. Todo `var(--x)` usado existe como token — en el JSX **y en el CSS**.
 *   3. La paleta de datos no se usa como cromo.
 *   4. No hay literales de color en el JSX (salvo las excepciones declaradas:
 *      el logo de marca y las paletas de dibujo sobre canvas, que no pueden usar
 *      variables CSS).
 *   5. Los verbos prohibidos no aparecen fuera de los comentarios: «Eliminar» y
 *      «Tirar» (§5.7), «Agregar», «Agendar» y el «Crear «…»» de un buscador
 *      (§5.8). Ver la 5.
 *
 * ── Por qué la 5 ────────────────────────────────────────────────────────────
 * Por lo mismo que la 3: es una regla de producto que solo vivía en la cabeza de
 * quien la escribió y se degradaba sola. La papelera se decía con tres verbos
 * —«Quitar serie», «Eliminar sesión», «Borrar este vídeo»— y los tres se leían
 * como sinónimos, así que el gesto no decía si lo que iba a pasar tenía vuelta.
 *
 * Sí la tiene o no la tiene, y son dos palabras distintas (`docs/producto.md`
 * §5.7): **quitar** es sacar del plan algo que pusiste tú y **borrar** es
 * destruir lo que él anotó o subió. «Eliminar» era el comodín que dejaba las dos
 * mezcladas, y por eso lo que se comprueba es su ausencia: quien escriba una
 * papelera nueva tiene que elegir, que es justo lo que hay que pensar.
 *
 * ── Por qué la 2 mira también el CSS ────────────────────────────────────────
 * Porque solo miraba el JSX, y por ahí se coló un `border: 1px solid var(--border)`
 * —token que no existe; se llama `--edge`— en dos reglas nuevas. Un `var()` sin
 * fallback que apunta a nada no es un color por defecto: invalida la declaración
 * ENTERA, así que los dos bordes simplemente no se pintaban. Y nada lo dijo.
 *
 * ── Por qué la 3 ────────────────────────────────────────────────────────────
 * Es la regla que ordena el producto: EL CROMO NO TIENE COLOR, el color es del
 * dato (ver `styles/tokens.css`). Estaba escrita en un comentario y por tanto se
 * degradaba sola: había diecisiete sitios pintando iconos de sección y enlaces
 * con tintas de la paleta de series. Ninguno era un error de token —`--data-blue`
 * existe— y por eso este script no los veía: lo que estaba mal era DÓNDE.
 *
 * Una regla que solo vive en un comentario dura lo que dure quien la escribió.
 *
 * Uso:  npm run verify
 * Salida: código 1 si hay clases, tokens o usos de la paleta de datos indebidos.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

/**
 * Ficheros que dibujan sobre `<canvas>` o definen la marca. Ahí un color
 * literal es correcto: `ctx.fillStyle` no entiende `var(--x)`, y el logo tiene
 * que ser igual en tema claro y oscuro.
 */
const COLOR_EXCEPTIONS = [
  'components/ui/Logo.jsx',
  // Logotipos de terceros: el negro de Notion y el violeta de Stripe son SU marca.
  // Pasarlos por los tokens del tema dejaría de ser su logotipo.
  'components/ui/BrandMark.jsx',
  'components/ui/charts.jsx',
  'components/Coach/PhotoStudio/renderComposition.js',
  'components/Coach/PhotoStudio/StudioToolbar.jsx',
  'components/Coach/PhotoStudio/usePhotoStudio.js',
  // Compone la grabación sobre un canvas: `ctx.fillStyle` no entiende `var(--x)`,
  // y además el vídeo tiene que verse igual en tema claro y oscuro.
  'lib/useReviewRecorder.js',
  'domain/training.js',
  'domain/nutrition.js',
  /*
    La anamnesis que se descarga es un archivo SUELTO: se abre dentro de tres
    años, en un ordenador que no conoce esta aplicación y sin su hoja de estilos.
    Un `var(--texto)` ahí no apunta a nada y la declaración entera se invalida —
    el documento saldría sin color de tinta y sin filetes.

    Es el mismo motivo por el que están las excepciones de canvas, dicho de otra
    manera: aquí tampoco hay tokens que resolver. Y por eso su paleta es sobria y
    fija: el destino de esta hoja es el papel o el PDF de una consulta.
  */
  'lib/anamnesisDoc.js',
];

/**
 * Dónde SÍ puede aparecer la paleta de datos (`--data-*`).
 *
 * El criterio para entrar en esta lista es uno solo: **que el color signifique
 * algo**. Una serie de un gráfico, un grupo muscular, un macro, el delta de una
 * cifra. Si el color solo está para que la pieza se vea más bonita, es cromo, y
 * el cromo va en tinta —`--accent`, `--text`, `--text-tertiary`— o en la
 * semántica de estado, que para eso existe.
 *
 * `domain/` entra entero: ahí es donde se declaran los mapas de color de las
 * series (grupos musculares, macros, tipos de actividad), que es la definición
 * misma de «el color es del dato».
 *
 * ── Por qué esta lista tenía trece entradas y ahora tiene tres ──────────────
 * Porque la regla estaba a medio cumplir: el color era del dato, sí, pero **lo
 * elegía cada pantalla**, y por eso la misma métrica salía de colores distintos
 * según dónde se mirara — la adherencia era verde en el resumen, teal en la
 * lista de al lado y lima en la analítica—. Cada pantalla que pintaba una cifra
 * necesitaba entrar aquí, y la lista crecía con el producto.
 *
 * Ahora el color de una métrica sale de `domain/metrics.js` y el de un músculo
 * de `muscleColor`, así que una pantalla ya no tiene por qué nombrar un color:
 * lo pide por el identificador de lo que está enseñando. Lo que queda son los
 * tres sitios donde el color NO es de una métrica —las primitivas de gráfico,
 * los logotipos ajenos y la marca del cliente activo—.
 *
 * Si esta lista vuelve a crecer, la pregunta correcta no es «¿le añado este
 * archivo?» sino «¿por qué esta pantalla está eligiendo un color?».
 */
const DATA_COLOR_ALLOWED = [
  // Las primitivas de gráfico: rejilla, ejes y respaldos de serie.
  'components/ui/charts.jsx',
  // Logotipos de terceros: su color es su marca, no nuestra paleta.
  'components/ui/BrandMark.jsx',
  // La marca del cliente activo. Es identidad, no decoración de una sección.
  'components/Coach/ClientSwitcher.jsx',
];

/**
 * ══ LA ESCALA DE ICONOS ═════════════════════════════════════════════════════
 *
 * Había VEINTE tamaños distintos en 485 usos: 14, 15, 13, 12, 11, 16, 17, 26,
 * 22, 18, 34, 30, 20, 19, 24, 10, 40, 54, 76 y 86. Los cuatro primeros
 * juntaban el 76 %, o sea que los otros dieciséis eran ruido: un 12 y un 13 a
 * quince píxeles de distancia no son dos decisiones, son dos días distintos.
 *
 * El cromo del producto usa TRES, y cada uno tiene un trabajo:
 *
 *   13 — el signo menudo: dentro de una chapa, de un rótulo, de una fila densa.
 *   15 — el de siempre: botones, filas, pestañas, barra.
 *   20 — el grande: cabeceras de pieza y puertas de tamaño completo.
 *
 * Lo que no es cromo son FIGURAS —el icono de un vacío, la marca de una
 * integración, el sello de una página legal— y esas viven en `FIGURAS`: no
 * están en una escala porque no comparten línea con nada.
 */
const ICONOS_CROMO = [13, 15, 20];
const FIGURAS = [18, 22, 24, 26, 30, 34, 40, 54, 76, 86];

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

const files = walk(SRC);
const code = files.filter((f) => f.endsWith('.jsx') || f.endsWith('.js'));
const styles = files.filter((f) => f.endsWith('.css'));
const cssText = styles.map((f) => readFileSync(f, 'utf8')).join('\n');

const definedClasses = new Set([...cssText.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]));
const definedTokens = new Set([...cssText.matchAll(/--([\w-]+)\s*:/g)].map((m) => m[1]));

const badClasses = [];
const badTokens = [];
const colorLiterals = [];
const dataAsChrome = [];
const iconSizes = [];
const verbosProhibidos = [];

/*
  Los tokens que usa el propio CSS. Un `var(--noExiste)` sin fallback invalida la
  declaración entera, así que el borde, el color o el fondo no se pintan — y
  mirando el archivo no se ve nada raro.
*/
for (const file of styles) {
  const rel = relative(SRC, file).replace(/\\/g, '/');
  for (const match of readFileSync(file, 'utf8').matchAll(/var\(--([\w-]+)\)/g)) {
    if (!definedTokens.has(match[1])) badTokens.push(`${rel} → --${match[1]}`);
  }
}

for (const file of code) {
  const rel = relative(SRC, file).replace(/\\/g, '/');
  const text = readFileSync(file, 'utf8');

  // `className="a b"` y className={`a ${x}`} — las interpolaciones se sustituyen
  // por un espacio, porque su valor no se puede conocer sin ejecutar el código.
  for (const match of text.matchAll(/className\s*=\s*(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    const raw = (match[1] || match[2] || '').replace(/\$\{[^}]*\}/g, ' ');
    for (const cls of raw.split(/\s+/).filter(Boolean)) {
      // Los fragmentos que quedan de una interpolación (`is-`, `delta-`) no son
      // clases reales: acaban en guion porque el sufijo era dinámico.
      if (cls.endsWith('-')) continue;
      if (!definedClasses.has(cls)) badClasses.push(`${rel} → .${cls}`);
    }
  }

  for (const match of text.matchAll(/var\(--([\w-]+)\)/g)) {
    if (!definedTokens.has(match[1])) badTokens.push(`${rel} → --${match[1]}`);
  }

  /* La paleta de series, usada como cromo. Ver `DATA_COLOR_ALLOWED`. */
  if (!rel.startsWith('domain/') && !DATA_COLOR_ALLOWED.includes(rel)) {
    for (const match of text.matchAll(/var\(--data-[\w-]+\)/g)) {
      dataAsChrome.push(`${rel} → ${match[0]}`);
    }
  }

  /* La escala de iconos. Ver `ICONOS_CROMO`. */
  for (const match of text.matchAll(/\bsize=\{(\d+)\}/g)) {
    const n = Number(match[1]);
    if (!ICONOS_CROMO.includes(n) && !FIGURAS.includes(n)) iconSizes.push(`${rel} → size={${n}}`);
  }

  if (!COLOR_EXCEPTIONS.includes(rel)) {
    for (const match of text.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g)) {
      colorLiterals.push(`${rel} → ${match[0]}`);
    }
  }

  /*
    Los verbos prohibidos. Ver `docs/producto.md` §5.7 y §5.8.

    Se miran sobre el código SIN COMENTARIOS, y eso es parte de la regla: lo que
    se prohíbe es la palabra que lee un entrenador, no la que explica por qué no
    se usa. Con el texto entero, el comentario que dice «aquí no se dice
    “Eliminar” porque…» rompía el build, así que la única forma de documentar la
    regla era no documentarla.

    Y con «Eliminar» van ahora «Tirar» —tercer sinónimo de borrar, vivo en una
    sola pantalla— y las palabras con las que se llegó a ofrecer añadir:
    «Agregar», «Agendar» y el «Crear «…»» del alta desde un buscador, que es
    donde chocaba de verdad con «Nuevo alimento».

    «Crear» a secas NO se persigue, y la excepción tiene criterio: lo que nace
    FUERA de la aplicación —una carpeta de Drive, un token de Notion, la cuenta
    de la web— se crea, porque ahí el verbo es el de la otra casa y cambiarlo por
    «Nuevo» lo haría más difícil de encontrar. Dentro, una pieza se da de alta
    con «Nuevo/Nueva» (§5.8), y eso no lo puede comprobar un `grep`: lo comprueba
    quien revisa el diff.
  */
  const codigoVisible = text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^[^\n'"`]*\/\/[^\n]*/gm, ' ');
  for (const match of codigoVisible.matchAll(
    /\bElimina(r|da|do|mos)?\b|\bTirarl[oa]\b|¿Tirar\b|\bAgregar\b|\bAgendar\b|\bCrear\s*[«&]laquo;?/g,
  )) {
    verbosProhibidos.push(`${rel} → ${match[0].trim()}`);
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   LAS TRES REGLAS DEL MÓVIL
   --------------------------------------------------------------------------
   Las tres son del mismo tipo que la 3 y la 5: decisiones de producto que
   estaban escritas en un comentario y se degradaban solas. Las tres se
   degradaron de verdad, y las tres se vieron tarde porque el síntoma solo
   aparece en un teléfono de verdad — en el escritorio del que las escribe
   todo se ve bien.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ── 6. LOS CUATRO ANCHOS ────────────────────────────────────────────────────
 * La tabla y el porqué, en `styles/tokens.css` («LOS CUATRO ANCHOS»). Había
 * treinta y un valores distintos en `max-width` y quince en `min-width`, y al
 * recogerlos salió a la luz una regla que llevaba meses sin pintar nada,
 * tapada por otra de un ancho vecino.
 *
 * Solo consultas de MEDIOS. `@container` mide una pieza contra su hueco, no la
 * ventana contra el mundo: sus números son suyos.
 */
const ANCHOS = { max: ['639.98', '1023.98', '1199.98', '1439.98'], min: ['640', '1024', '1200', '1440'] };
const anchosFuera = [];
const miraAnchos = (rel, texto) => {
  for (const media of texto.matchAll(/@media[^{;]*/g)) {
    for (const m of media[0].matchAll(/\((max|min)-width:\s*([\d.]+)px\)/g)) {
      if (!ANCHOS[m[1]].includes(m[2])) anchosFuera.push(`${rel} → ${m[0]}`);
    }
  }
};

/**
 * ── 7. EL ALTO DE VERDAD ────────────────────────────────────────────────────
 * Ningún alto se declara solo en `vh`: detrás va su gemela en `svh`. El porqué,
 * en `styles/base.css`. En una pestaña de móvil `100vh` mide unos noventa
 * píxeles más que lo que se ve, así que lo anclado abajo cae detrás de la barra
 * del navegador. Se supo, se arregló en `.login` y se quedaron veintitrés
 * declaraciones sueltas repartidas por nueve archivos.
 */
const altosSueltos = [];
const miraAltos = (rel, texto) => {
  const lineas = texto.split('\n');
  for (let i = 0; i < lineas.length; i += 1) {
    for (const m of lineas[i].matchAll(/((?:min-|max-)?height)\s*:\s*([^;}]*[\d.]+vh\b[^;}]*)/g)) {
      /* La propia gemela: su valor ya lleva el alto pequeño. Lo que quede en
         `vh` dentro (un `clamp()` de aire, por ejemplo) es aire y no alto. */
      if (/[\d.]+(?:s|d)vh\b/.test(m[2])) continue;
      const gemela = new RegExp(`${m[1]}\\s*:[^;}]*(?:s|d)vh`);
      const detras = lineas[i].slice(m.index + m[0].length);
      if (gemela.test(detras) || gemela.test(lineas[i + 1] || '')) continue;
      altosSueltos.push(`${rel}:${i + 1} → ${m[0].trim()}`);
    }
  }
};

/**
 * ── 8. NINGÚN CAMPO POR DEBAJO DE 16 PX ────────────────────────────────────
 * Safari en iOS amplía la página entera al enfocar un campo con letra menor de
 * 16 px, y no lo deshace al salir. El producto se defiende con un bloque
 * `@media (hover: none)` al final de `piezas.css`, pero ese bloque va por
 * SELECTOR: `.input` a secas (0-1-0) no le gana a `.checkin-week .input`
 * (0-2-0), así que cada campo que nace bajo un contenedor con nombre y baja de
 * tamaño se escapa sin avisar. Se escaparon tres, y uno era la casilla del
 * peso del pesaje semanal — la pantalla que más se toca desde el teléfono.
 *
 * Lo que se comprueba: todo selector que le ponga a un campo menos de 16 px
 * tiene que aparecer también en el bloque táctil. La declaración pequeña NO es
 * un error —en una ventana estrecha sin dedo es la medida correcta—: lo que es
 * un error es que no tenga su pareja.
 */
const REGLAS = /([^{}]+)\{([^{}]*)\}/g;
const ES_CAMPO = /\.(input|select|textarea)\b/;
/*
  Lo que se LLAMA como un campo y no lo es. La lista empieza y ojalá acabe con
  una: `.input-suffix` es la caja que envuelve al campo y a su unidad, y lo que
  lleva letra pequeña ahí dentro es la «g», que no se enfoca y por tanto no
  amplía nada.

  El criterio para entrar: que el elemento NO sea un `<input>`, `<select>` o
  `<textarea>`. Las variantes de talla —`.input-sm`, `.select-xs`— sí lo son y
  no entran por mucho que el nombre lleve sufijo: son justo las que se escapan.
*/
const NO_SON_CAMPOS = ['.input-suffix'];
/* Los comentarios fuera antes de partir en reglas: llevan dentro nombres de
   clase y puntos, y sin quitarlos medio comentario entra como selector. */
const sinComentarios = (texto) => texto.replace(/\/\*[\s\S]*?\*\//g, ' ');
const PEQUENA = /font-size:\s*var\(--fs-(3xs|2xs|xs|control|sm)\)/;
const camposPequenos = [];
const bloqueTactil = [];
const miraCampos = (rel, crudo) => {
  const texto = sinComentarios(crudo);
  // Los bloques `@media (hover: none) { … }`, por conteo de llaves.
  const abre = /@media\s*\(hover:\s*none\)[^{]*\{/g;
  while (abre.exec(texto)) {
    let i = abre.lastIndex;
    let prof = 1;
    while (i < texto.length && prof > 0) {
      if (texto[i] === '{') prof += 1;
      else if (texto[i] === '}') prof -= 1;
      i += 1;
    }
    const dentro = texto.slice(abre.lastIndex, i - 1);
    for (const r of dentro.matchAll(REGLAS)) {
      if (/font-size/.test(r[2])) bloqueTactil.push(...r[1].split(',').map((s) => s.trim()));
    }
  }
  for (const r of texto.matchAll(REGLAS)) {
    if (!PEQUENA.test(r[2])) continue;
    for (const sel of r[1].split(',').map((s) => s.trim())) {
      if (!ES_CAMPO.test(sel)) continue;
      if (NO_SON_CAMPOS.some((c) => sel.includes(c))) continue;
      camposPequenos.push(`${rel} → ${sel}`);
    }
  }
};

/**
 * ── 9. TRES TRABAJOS Y UN DISPLAY: LA ESCALA DE PESO ───────────────────────
 * Archivo es variable, así que escribir 730 cuesta lo mismo que escribir 700 y
 * se ve «un pelín más». Por ahí entraron dieciséis pesos distintos —550, 560,
 * 620, 640, 650, 660, 680, 720, 730, 740, 750— puestos cada uno una tarde, sin
 * que ninguno quisiera decir nada que no dijera su vecino. La consecuencia
 * medible no es estética: es que dos rótulos del mismo rango no se veían
 * iguales y no había forma de saber cuál de los dos estaba mal.
 *
 * La escala vive en `tokens.css` (`--peso-*`) y son cinco: 400 cuerpo, 500
 * rótulo, 600 fuerte, 700 cifra, 800 display —este último solo con la fuente
 * de display, o sea portada y portadillas—.
 *
 * Un comentario no sostiene una escala; esto sí. Se comprueba el valor
 * numérico y no el token porque lo que se quiere prohibir es el número
 * inventado: `font-weight: var(--peso-fuerte)` no lleva dígitos y pasa solo.
 * El rango de `@font-face` (`font-weight: 400 800`) lleva dos números y se
 * deja fuera por el mismo motivo por el que existe: ahí no se elige un peso,
 * se declara cuáles trae el archivo.
 */
const PESOS = ['400', '500', '600', '700', '800'];
const pesosFuera = [];
const miraPesos = (rel, texto) => {
  /* Los comentarios se vacían CONSERVANDO sus saltos de línea. Con el
     `sinComentarios` de arriba —que colapsa el comentario entero a un espacio—
     el número que se imprime deja de ser el del archivo, y un aviso que apunta
     a la línea equivocada cuesta más de leer que no tenerlo. */
  const lineas = texto.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')).split('\n');
  for (let i = 0; i < lineas.length; i += 1) {
    for (const m of lineas[i].matchAll(/font-weight:\s*([^;}]+)/g)) {
      const valor = m[1].trim();
      /* El rango del `@font-face`: dos números separados por un espacio. */
      if (/^\d{3}\s+\d{3}$/.test(valor)) continue;
      if (!/\d/.test(valor)) continue;
      if (!PESOS.includes(valor)) pesosFuera.push(`${rel}:${i + 1} → font-weight: ${valor}`);
    }
  }
};


/**
 * ── 10. SI HAY TOKEN, SE ESCRIBE EL TOKEN ──────────────────────────────────
 * La escala de espacio se cumplía 1.599 veces y se saltaba unas 700, y lo que
 * la medición enseñó es que la mitad de esas fugas NO eran valores raros: eran
 * `padding: 8px` y `gap: 16px`, o sea el token escrito a mano. Un valor de la
 * escala escrito con su número no se ve distinto, pero se queda fuera el día
 * que la escala se mueve — y entonces media pantalla respira distinto que la
 * otra media sin que nadie haya tocado esa media.
 *
 * Lo que se prohíbe es exactamente eso: un literal de píxeles, en una
 * propiedad de espacio, cuyo valor YA tiene token.
 *
 * Lo que NO se prohíbe, y por qué:
 *  · 1, 2 y 3 px son canto, sombra y desplazamiento óptico. No son espacio:
 *    son el grosor de una raya o el medio píxel que centra un glifo en su caja.
 *  · 6, 9, 10, 11, 14… tampoco tienen token. Son fugas de verdad y salen como
 *    AVISO, no como fallo: hay unas cuatrocientas y arreglarlas es mirarlas una
 *    a una, no un `replace` —6 px cae justo en medio de dos escalones y moverlo
 *    son 2 px en 148 sitios—. El aviso es para que la cuenta esté a la vista y
 *    no vuelva a crecer sin que nadie lo note.
 *  · Los valores negativos. Un margen de tirar hacia fuera casi siempre
 *    responde a un `padding` del padre y se lee mejor con su número al lado.
 */
const ESCALA = { 4: 's1', 8: 's2', 12: 's3', 16: 's4', 22: 's5', 32: 's6', 44: 's7' };
const PROPS_ESPACIO =
  /(?:^|[;{\s])(?:padding|margin|gap|row-gap|column-gap|inset|top|right|bottom|left)(?:-(?:inline|block|top|right|bottom|left|start|end|x|y))?\s*:\s*([^;}]+)/g;
const espacioEnCrudo = [];
const espacioFueraDeEscala = [];
const miraEspacio = (rel, texto) => {
  const lineas = texto.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')).split('\n');
  for (let i = 0; i < lineas.length; i += 1) {
    for (const m of lineas[i].matchAll(PROPS_ESPACIO)) {
      for (const v of m[1].matchAll(/(?<![\w.$-])(\d+)px/g)) {
        const n = Number(v[1]);
        if (n === 0 || n < 4) continue;
        if (ESCALA[n]) espacioEnCrudo.push(`${rel}:${i + 1} → ${n}px (es var(--${ESCALA[n]}))`);
        else espacioFueraDeEscala.push(`${rel}:${i + 1} → ${n}px`);
      }
    }
  }
};

/**
 * ── 11. UNA REGLA QUE NO PINTA NADA SE VA ───────────────────────────────────
 * El reverso de la regla 1. Aquella caza el `className` sin CSS —lo que sale
 * sin estilo—; esta caza el CSS sin `className`, que no se ve nunca y por eso
 * duraba años: había 253 clases así, un CSS de 1.500 líneas que ninguna
 * pantalla usaba. El coste no es el peso del paquete: es que quien lee el
 * fichero para entender una pieza se encuentra tres versiones de ella y
 * ninguna señal de cuál está viva. Las tres barras de la hoja, la mesa de
 * `.definir-*`, el árbol del costado, el «cara a cara» — todas seguían escritas
 * meses después de que su JSX se borrara.
 *
 * ── Lo que se mide, y por qué NO vale el `definedClasses` de arriba ─────────
 * Aquel Set sale del fichero entero, comentarios incluidos, y aquí eso sería
 * al revés de lo que hace falta: un `.definir-mesa` nombrado en un comentario
 * se daría por definido y por usado a la vez. Se leen solo los SELECTORES.
 *
 * ── La excepción: lo que se compone al vuelo ───────────────────────────────
 * `is-${tono}` escribe `.is-good` sin que «is-good» aparezca en ningún sitio.
 * Igual que con los literales de color, la excepción se declara — pero no a
 * mano: se deduce de las interpolaciones que están DENTRO de un `className`,
 * `clase` o `classList`, y solo cuando el trozo literal acaba en guion. Las dos
 * condiciones son el filtro:
 *
 *   · fuera del `className` no hay clase — `semana-${n}` es el nombre de una
 *     carpeta de fotos y `revision-${id}` el id de un evento del calendario, y
 *     tomándolos por buenos sobrevivía media familia muerta;
 *   · sin el guion tampoco — en `` `hoja${x ? ' is-x' : ''}` `` lo que va detrás
 *     NO es un sufijo de «hoja»: es otra clase después de un espacio, y «hoja»
 *     amparaba a `.hoja-barra`, `.hoja-menu` y a los diecisiete que empezaran
 *     por ahí.
 */
/**
 * ── 12. UN COMENTARIO QUE SE CIERRA DOS VECES SE LLEVA LA REGLA DE DEBAJO ───
 * Un cierre de comentario de más parte el comentario en dos: lo que va detrás deja de ser
 * prosa y pasa a leerse como SELECTOR, hasta la primera llave. Como esa prosa
 * lleva comas, el grupo de selectores es inválido y el navegador tira la regla
 * ENTERA sin decir nada — ni un aviso en consola, ni un fallo de compilación:
 * Vite no valida CSS, así que el fichero pasa por el `build` intacto.
 *
 * Pasó de verdad: en `piezas.css`, el comentario de A-03 («profundidad máxima
 * 1», las tarjetas del portal sin caja en el teléfono) cerraba a mitad y se
 * llevaba por delante `.layout-portal .card`. Se vio al buscar otra cosa, y la
 * prueba de que no se ve sola es que la regla no estaba en el CSS construido:
 * el portal seguía pintando sus nueve cajas en un móvil de 390 px con la
 * explicación de por qué no debía hacerlo escrita justo encima.
 *
 * La comprobación es de una línea: vaciados los comentarios, en lo que queda
 * no puede quedar ninguna marca de abrir ni de cerrar comentario.
 */
const comentariosRotos = [];
const miraComentarios = (rel, texto) => {
  const plano = texto.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
  for (const m of plano.matchAll(/\*\/|\/\*/g)) {
    comentariosRotos.push(`${rel}:${plano.slice(0, m.index).split('\n').length} → ${m[0]} suelto`);
  }
};

const selectoresDe = (texto) =>
  [...texto.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')).matchAll(/([^{}]+)\{[^{}]*\}/g)]
    .filter((m) => !/^\s*@/.test(m[1]));
const clasesDefinidas = new Map();     // clase → dónde se declara
const clasesEscritas = new Set();      // lo que el código escribe, tal cual
const prefijosAlVuelo = new Set();     // `is-`, `notice-`…
for (const file of code) {
  const texto = readFileSync(file, 'utf8');
  for (const m of texto.matchAll(/`([^`]*)`|'([^'\\]*)'|"([^"\\]*)"/g)) {
    const crudo = (m[1] ?? m[2] ?? m[3] ?? '').replace(/\$\{[^}]*\}/g, ' ');
    for (const w of crudo.split(/[^\w-]+/)) if (w) clasesEscritas.add(w);
  }
  /* Segunda pasada sin mirar las plantillas: una cadena dentro de una
     interpolación —`angulo${hecha ? ' es-hecha' : ''}`— se la comía la de
     arriba, y `es-hecha` se habría dado por muerta estando viva. */
  for (const m of texto.matchAll(/'([^'\\\n]*)'|"([^"\\\n]*)"/g)) {
    for (const w of (m[1] ?? m[2] ?? '').split(/[^\w-]+/)) if (w) clasesEscritas.add(w);
  }
  for (const attr of texto.matchAll(/(?:className|clase|class)\s*=\s*\{([\s\S]{0,400}?)\}\s*\n?\s*[>/\w-]|classList\.\w+\(([^)]*)\)/g)) {
    const expr = attr[1] ?? attr[2] ?? '';
    for (const p of expr.matchAll(/([\w-]*-)\$\{/g)) prefijosAlVuelo.add(p[1]);
    for (const p of expr.matchAll(/'([\w-]*-)'\s*\+/g)) prefijosAlVuelo.add(p[1]);
  }
}

for (const file of styles) {
  const rel = relative(SRC, file).replace(/\\/g, '/');
  const texto = readFileSync(file, 'utf8');
  for (const m of selectoresDe(texto)) {
    for (const c of m[1].matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
      if (!clasesDefinidas.has(c[1])) clasesDefinidas.set(c[1], rel);
    }
  }
  miraComentarios(rel, texto);
  miraAnchos(rel, texto);
  miraAltos(rel, texto);
  miraCampos(rel, texto);
  miraPesos(rel, texto);
  miraEspacio(rel, texto);
}
/* Y en el código: `useMediaQuery('(min-width: …)')` decide con los mismos
   anchos y se desincroniza igual de callado — pasó con los 1.100 px de las dos
   columnas de la rutina, declarados en dos sitios. */
for (const file of code) {
  miraAnchos(relative(SRC, file).replace(/\\/g, '/'), readFileSync(file, 'utf8'));
}
const camposSinPareja = camposPequenos.filter((linea) => !bloqueTactil.includes(linea.split(' → ')[1]));

const clasesMuertas = [...clasesDefinidas]
  .filter(([c]) => !clasesEscritas.has(c) && ![...prefijosAlVuelo].some((p) => c.startsWith(p)))
  .map(([c, rel]) => `${rel} → .${c}`);

const report = (label, list, fatal) => {
  const unique = [...new Set(list)];
  console.log(`${unique.length === 0 ? 'OK  ' : fatal ? 'FALLO' : 'AVISO'} ${label}: ${unique.length}`);
  unique.slice(0, 30).forEach((line) => console.log(`        ${line}`));
  if (unique.length > 30) console.log(`        … y ${unique.length - 30} más`);
  return unique.length;
};

const classErrors = report('clases sin definir', badClasses, true);
const muertaErrors = report('clases definidas que no escribe nadie', clasesMuertas, true);
const comentarioErrors = report('comentarios de CSS que se cierran dos veces', comentariosRotos, true);
const tokenErrors = report('tokens sin definir', badTokens, true);
const chromeErrors = report('paleta de datos usada como cromo', dataAsChrome, true);
const iconErrors = report('iconos fuera de la escala 13/15/20', iconSizes, true);
const verbErrors = report('«Eliminar»: es quitar o es borrar (producto.md §5.7)', verbosProhibidos, true);
const anchoErrors = report('anchos fuera de la escala 639.98/1023.98/1199.98/1439.98', anchosFuera, true);
const altoErrors = report('altos en `vh` sin su gemela en `svh`', altosSueltos, true);
const campoErrors = report('campos por debajo de 16 px sin pareja táctil', camposSinPareja, true);
const pesoErrors = report('pesos fuera de la escala 400/500/600/700/800', pesosFuera, true);
const espacioErrors = report('espacio de la escala escrito en px (hay token)', espacioEnCrudo, true);
report('literales de color fuera de las excepciones', colorLiterals, false);
report('espacio en px sin token (6, 9, 10, 11, 14…)', espacioFueraDeEscala, false);

process.exit(
  classErrors + muertaErrors + comentarioErrors + tokenErrors + chromeErrors + iconErrors + verbErrors + anchoErrors + altoErrors + campoErrors + pesoErrors + espacioErrors >
  0
    ? 1
    : 0,
);
