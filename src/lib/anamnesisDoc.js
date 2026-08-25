/**
 * La anamnesis, escrita como un documento que se puede abrir e imprimir.
 *
 * ══ Por qué un HTML y no un PDF ════════════════════════════════════════════
 *
 * Porque generar un PDF de verdad son doscientos o trescientos kilobytes de
 * dependencia nueva —una librería con su motor de tipografías— en un paquete que
 * hoy tiene cinco dependencias contadas, y para una función que se usa dos veces
 * al año por cliente.
 *
 * Un HTML autocontenido lo abre cualquier navegador, cualquier ordenador y
 * cualquier móvil, se puede adjuntar a un correo, y **Ctrl+P → Guardar como PDF**
 * lo convierte en el PDF que hacía falta. Es la misma decisión que ya tomó
 * `domain/pdf.js` por el otro lado: leer PDF sin librería en vez de meter dos
 * megas para sacar unas líneas de texto.
 *
 * Los estilos van INCRUSTADOS y no enlazados: el archivo tiene que verse igual
 * dentro de tres años en un ordenador que no conoce esta aplicación. Y llevan su
 * `@media print`, porque el destino más probable de esta hoja es el papel o el
 * PDF de una consulta.
 *
 * ══ Todo lo que entra aquí es texto de una PERSONA ═════════════════════════
 *
 * Lo escriben el entrenador y el cliente, así que interpolarlo tal cual en HTML
 * es abrir la puerta a que un `<script>` escrito en un campo se ejecute al abrir
 * el archivo — en un fichero local, además, que es donde el navegador es más
 * confiado. `esc` no es una precaución de estilo: es lo que hace que este
 * archivo sea un documento y no un programa.
 */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

const esc = (valor) =>
  valor === null || valor === undefined
    ? ''
    : String(valor).replace(/[&<>"']/g, (c) => ESCAPES[c]);

/* Sobrio a propósito: esto se imprime. Un documento de salud con la paleta de la
   aplicación encima se lee peor en papel y envejece antes que el propio dato. */
const ESTILOS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 32px;
    font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #14181c; background: #fff;
    max-width: 760px; margin-inline: auto;
  }
  h1 { font-size: 24px; margin: 0 0 2px; letter-spacing: -0.02em; }
  h2 {
    font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em;
    color: #5c6772; margin: 28px 0 8px; font-weight: 700;
  }
  .meta { color: #5c6772; font-size: 13px; margin: 0 0 4px; }
  .aviso { color: #5c6772; font-size: 12px; border-top: 1px solid #e4e7ec; margin-top: 32px; padding-top: 12px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 6px 0; border-bottom: 1px solid #eef0f3; vertical-align: top; }
  td:first-child { color: #5c6772; width: 40%; }
  td:last-child { font-weight: 600; }
  ul { margin: 0; padding: 0; list-style: none; }
  li { padding: 8px 0; border-bottom: 1px solid #eef0f3; }
  .veto { font-weight: 700; }
  .tag {
    display: inline-block; font-size: 11px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.06em; color: #8a5a00; background: #fdf3dc;
    border-radius: 4px; padding: 1px 6px; margin-right: 6px;
  }
  .nota { color: #5c6772; font-size: 13px; }
  .vacio { color: #5c6772; font-style: italic; }
  @media print {
    body { padding: 0; max-width: none; }
    h2 { break-after: avoid; }
    li, tr { break-inside: avoid; }
  }
`;

const filas = (pares) =>
  `<table>${pares
    .map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`)
    .join('')}</table>`;

/** El documento entero, listo para guardar. Recibe lo que devuelve `buildAnamnesis`. */
export const anamnesisHtml = (doc) => {
  const secciones = [];

  secciones.push(`<h2>Quién es</h2>${filas(doc.identidad)}`);
  if (doc.sinConstar.length > 0) {
    /* «No consta» dicho a propósito, y no omitido: en un historial, la
       diferencia entre «no tiene» y «no se preguntó» es la mitad del valor. */
    secciones.push(
      `<p class="nota">No consta: ${esc(doc.sinConstar.join(', ').toLowerCase())}.</p>`
    );
  }

  secciones.push(`<h2>Condicionantes</h2>`);
  if (doc.conditions.length === 0) {
    secciones.push('<p class="vacio">No consta ninguno.</p>');
  } else {
    secciones.push(
      `<ul>${doc.conditions
        .map(
          (c) => `<li>
            ${c.blocking ? '<span class="tag">No puede</span>' : ''}
            <span class="${c.blocking ? 'veto' : ''}">${esc(c.label)}</span>
            <div class="nota">${esc(c.area)}${c.since ? ` · desde ${esc(c.since)}` : ''}${
              c.detail ? ` · ${esc(c.detail)}` : ''
            }</div>
          </li>`
        )
        .join('')}</ul>`
    );
  }

  if (doc.resolved.length > 0) {
    secciones.push(
      `<h2>Ya resueltos</h2><ul>${doc.resolved
        .map(
          (c) =>
            `<li>${esc(c.label)}${c.resolvedAt ? `<div class="nota">Resuelto el ${esc(c.resolvedAt)}</div>` : ''}</li>`
        )
        .join('')}</ul>`
    );
  }

  for (const bloque of doc.blocks) {
    secciones.push(`<h2>${esc(bloque.label)}</h2>${filas(bloque.rows)}`);
  }

  if (doc.custom.length > 0) {
    secciones.push(`<h2>Otras preguntas</h2>${filas(doc.custom)}`);
  }

  if (doc.gym.total > 0 || doc.gym.folder) {
    const resumen = doc.gym.groups.map((g) => `${g.group} (${g.count})`).join(', ');
    secciones.push(
      `<h2>Su gimnasio</h2><p class="nota">${
        doc.gym.total > 0
          ? `${doc.gym.total} ${doc.gym.total === 1 ? 'foto' : 'fotos'} de maquinaria${resumen ? `: ${esc(resumen)}` : ''}. Las fotos no van en este documento.`
          : 'Sin fotos en la aplicación.'
      }${doc.gym.folder ? ` Carpeta: ${esc(doc.gym.folder)}` : ''}</p>`
    );
  }

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Anamnesis · ${esc(doc.name)}</title>
<style>${ESTILOS}</style>
</head>
<body>
<h1>${esc(doc.name)}</h1>
<p class="meta">Anamnesis generada el ${esc(doc.generatedAt)}</p>
${secciones.join('\n')}
<p class="aviso">
  Documento generado por Caveman Hub a partir de lo que esta persona ha declarado y de lo que ha
  apuntado su entrenador. Refleja los datos del día en que se generó y no sustituye a un informe
  médico. Contiene datos de salud: trátalo como tal.
</p>
</body>
</html>`;
};
