/**
 * Genera los iconos de instalación a partir de la marca.
 *
 * ── Por qué un script y no dos PNG en el repositorio ────────────────────────
 * Porque la marca ya está definida en tres sitios —`components/ui/Logo.jsx`, el
 * favicon en línea de `index.html` y aquí—, y un binario suelto es el que se
 * queda viejo sin que nadie se entere. Con esto, cambiar la geometría o las
 * tintas es cambiar las constantes de abajo y volver a ejecutar.
 *
 * ── Por qué se rasteriza a mano ─────────────────────────────────────────────
 * La marca son cuatro rectángulos redondeados sobre un fondo redondeado: no hace
 * falta una librería de imagen para eso, y meter una dependencia de build para
 * dibujar cuatro rectángulos sería pagar mucho por muy poco. `zlib` viene con
 * Node, y un PNG sin filtros es una cabecera, los píxeles comprimidos y un CRC.
 *
 * ── Qué genera y para qué ───────────────────────────────────────────────────
 *   · `icon-180.png` — `apple-touch-icon`. Safari en iOS NO admite SVG aquí, y
 *     sin él, un cliente que añade la aplicación a su pantalla de inicio —que es
 *     el caso de uso declarado del portal— se encuentra con una captura de la
 *     página en lugar de la marca.
 *   · `icon-512.png` — el icono grande del manifest (Android, escritorio).
 *   · `icon.svg` — el vectorial, que es lo que usan los navegadores modernos
 *     cuando pueden.
 *
 * ── Lo que ya NO genera: `og.png` ───────────────────────────────────────────
 * La imagen de compartir se escribía aquí, y por eso no llevaba texto: con
 * `zlib` y cuatro bucles no se rasteriza tipografía. Ahora es un cartel con
 * titular y capturas, y vive en `scripts/generar-og.mjs`, que lo compone con un
 * navegador. Aquí se queda lo que de verdad son cuatro rectángulos.
 *
 * Uso:  node scripts/generar-iconos.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');

/* ── La marca ──────────────────────────────────────────────────────────────
   Tres barras ascendentes —la progresión— y la última cargada con el disco de
   25. Las tintas son las mismas que las de `LogoMark` y el favicon: si una
   cambia, hay que cambiar las tres.

   Las coordenadas están en el lienzo de 34×34 del original, y se escalan. */
const LIENZO = 34;
const HIERRO = [0x14, 0x18, 0x1c];
const TIZA = [0xe8, 0xec, 0xf1];
const DISCO_25 = [0xe2, 0x56, 0x4a];

const BARRAS = [
  { x: 7, y: 18, w: 5, h: 11, r: 1.5, color: TIZA },
  { x: 14.5, y: 12, w: 5, h: 17, r: 1.5, color: TIZA },
  { x: 22, y: 5, w: 5, h: 24, r: 1.5, color: TIZA },
  // El disco cargado en la barra más alta.
  { x: 22, y: 5, w: 5, h: 3.5, r: 1.5, color: DISCO_25 },
];

const FONDO_RADIO = 8;

/**
 * ¿Está el punto dentro de un rectángulo de esquinas redondeadas?
 *
 * Se muestrea el centro del píxel (de ahí el +0.5): tomando la esquina, las
 * curvas salen desplazadas medio píxel y a 180 px eso se nota.
 */
const dentro = (px, py, { x, y, w, h, r }) => {
  if (px < x || px > x + w || py < y || py > y + h) return false;
  if (r <= 0) return true;

  // Cuánto se mete el punto en la zona de esquina, por cada eje.
  const dx = Math.max(x + r - px, px - (x + w - r), 0);
  const dy = Math.max(y + r - py, py - (y + h - r), 0);
  return dx * dx + dy * dy <= r * r;
};

/** Los píxeles RGBA del icono, a un tamaño dado. */
const pintar = (size) => {
  const escala = size / LIENZO;
  const px = Buffer.alloc(size * size * 4);

  const fondo = { x: 0, y: 0, w: LIENZO, h: LIENZO, r: FONDO_RADIO };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / escala;
      const v = (y + 0.5) / escala;
      const i = (y * size + x) * 4;

      if (!dentro(u, v, fondo)) continue; // fuera: transparente

      let color = HIERRO;
      /* Al revés, para que el disco —que se solapa con la barra— gane. */
      for (let b = BARRAS.length - 1; b >= 0; b--) {
        if (dentro(u, v, BARRAS[b])) {
          color = BARRAS[b].color;
          break;
        }
      }

      px[i] = color[0];
      px[i + 1] = color[1];
      px[i + 2] = color[2];
      px[i + 3] = 255;
    }
  }

  return px;
};

// ── Escritura del PNG ──────────────────────────────────────────────────────

const CRC = (() => {
  const tabla = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabla[n] = c;
  }
  return (buf) => {
    let c = -1;
    for (const byte of buf) c = tabla[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();

const trozo = (tipo, datos) => {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(CRC(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
};

const png = (size, px) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 8 bits por canal
  ihdr[9] = 6; // RGBA
  // 10, 11, 12 = compresión, filtro e entrelazado por defecto (0).

  /* Cada fila lleva delante su byte de filtro. Se usa 0 —sin filtro— porque el
     dibujo son bloques planos: `deflate` ya los comprime bien y un filtro solo
     añadiría trabajo y una fuente más de errores. */
  const crudo = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    crudo[y * (size * 4 + 1)] = 0;
    px.copy(crudo, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozo('IHDR', ihdr),
    trozo('IDAT', deflateSync(crudo, { level: 9 })),
    trozo('IEND', Buffer.alloc(0)),
  ]);
};

const svg = () =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LIENZO} ${LIENZO}">\n` +
  `  <rect width="${LIENZO}" height="${LIENZO}" rx="${FONDO_RADIO}" fill="#14181c"/>\n` +
  BARRAS.map(
    (b) =>
      `  <rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${b.r}" ` +
      `fill="#${b.color.map((c) => c.toString(16).padStart(2, '0')).join('')}"/>`
  ).join('\n') +
  `\n</svg>\n`;

mkdirSync(PUBLIC, { recursive: true });

for (const size of [180, 512]) {
  const archivo = join(PUBLIC, `icon-${size}.png`);
  writeFileSync(archivo, png(size, pintar(size)));
  console.log(`OK   icon-${size}.png`);
}

writeFileSync(join(PUBLIC, 'icon.svg'), svg());
console.log('OK   icon.svg');
