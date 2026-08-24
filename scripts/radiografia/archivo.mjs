/**
 * `informes/estado.json`: el disco, y nada más que el disco.
 *
 * ══ Por qué está separado del razonamiento ══════════════════════════════════
 *
 * Lo que decide qué hallazgo es nuevo y cuál está aceptado vive en
 * `src/domain/radiografia/estado.js` y no importa nada. Tiene que ser así porque
 * ese mismo razonamiento corre en dos sitios: aquí, con un archivo delante, y en
 * la función edge, donde no hay disco al que asomarse.
 *
 * Aquí queda lo único que no se puede compartir: abrir el archivo, entender que
 * no exista y escribirlo de vuelta.
 */

import { readFile, writeFile } from 'node:fs/promises';

import { estadoVacio, normalizaEstado } from '../../src/domain/radiografia/estado.js';

/**
 * Lee `estado.json`. Que no exista es lo normal la primera vez, no un error.
 *
 * Un archivo corrupto SÍ se cuenta: perder las aceptaciones en silencio haría
 * que todo volviera a salir como nuevo, y quien lo viera pensaría que ha pasado
 * algo en la base de datos.
 */
export const leerEstado = async (ruta) => {
  try {
    const crudo = await readFile(ruta, 'utf8');
    return { estado: normalizaEstado(JSON.parse(crudo)), aviso: null };
  } catch (e) {
    if (e.code === 'ENOENT') return { estado: estadoVacio(), aviso: null };
    return {
      estado: estadoVacio(),
      aviso:
        `No se ha podido leer ${ruta} (${e.message}). Los hallazgos ya aceptados ` +
        'vuelven a salir como nuevos; el archivo no se ha tocado.',
    };
  }
};

export const guardarEstado = (ruta, estado) =>
  writeFile(ruta, `${JSON.stringify(estado, null, 2)}\n`, 'utf8');
