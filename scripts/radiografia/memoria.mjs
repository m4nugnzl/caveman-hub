/**
 * La memoria del informe, que se está mudando de un archivo a la base.
 *
 * ══ Qué es «la memoria» ═════════════════════════════════════════════════════
 *
 * Las dos cosas que la radiografía recuerda entre ejecuciones: qué hallazgos de
 * seguridad se dieron por buenos y por qué, y las cifras de cada vez —que es lo
 * que convierte un número suelto en una tendencia—. Vivían en
 * `informes/estado.json`; desde la migración 0074 viven en dos tablas, porque un
 * archivo local es memoria a la que la función edge y el bot no llegan.
 *
 * ══ Por qué esto funciona ANTES y DESPUÉS de aplicar la migración ══════════
 *
 * Porque si no, aplicar una migración sería requisito para que siguiera
 * funcionando una herramienta que ya funcionaba, y el día que alguien clone el
 * repositorio y ejecute `npm run radiografia` sin haber tocado la base se
 * encontraría un error en vez de un informe.
 *
 * Así que hay dos modos y se eligen solos:
 *
 *   · **Sin las tablas** → el archivo, exactamente como siempre.
 *   · **Con las tablas** → la base, y el archivo se queda quieto donde está.
 *
 * ══ La siembra ═════════════════════════════════════════════════════════════
 *
 * La primera ejecución con las tablas ya creadas y todavía vacías se lleva lo
 * que hubiera en el archivo. Sin eso, aplicar la 0074 borraría de un plumazo
 * todas las aceptaciones acumuladas —cada una con su motivo escrito— y el
 * siguiente informe sacaría los 239 hallazgos como si nadie los hubiera mirado
 * nunca.
 *
 * El archivo NO se borra ni se toca después. Es la copia de la que se sembró, y
 * mientras esté ahí la siembra se puede repetir si algo sale mal.
 */

import {
  aceptadosDe,
  estadoDeFilas,
  filaDeInstantanea,
  filasDeAceptacion,
} from '../../src/domain/radiografia/estado.js';
import { leerEstado } from './archivo.mjs';

const TABLA_INSTANTANEAS = 'platform_snapshots';
const TABLA_ACEPTACIONES = 'platform_acceptances';

/** Que una tabla no exista es una respuesta, no un fallo. Ver `lectura.js`. */
const faltaLaTabla = (error) => !!error && /does not exist|schema cache/i.test(error.message);

const AVISO_SIN_MIGRACION =
  'La migración 0074 no está aplicada: la memoria del informe sigue en informes/estado.json. ' +
  'El panel y el bot no pueden leer ese archivo, así que desde ellos los hallazgos ya ' +
  'aceptados saldrán como pendientes.';

/**
 * Lo aceptado y lo de la vez anterior, de donde toque.
 *
 * Devuelve también `en` —`'base'` o `'archivo'`— porque quien guarde después
 * tiene que hacerlo en el mismo sitio del que se leyó. Escribir en la base lo
 * que se leyó del archivo dejaría las dos memorias divergiendo en silencio, que
 * es peor que tener una sola desactualizada.
 */
export const leerMemoria = async (supabase, { rutaEstado }) => {
  const avisos = [];

  const instantaneas = await supabase
    .from(TABLA_INSTANTANEAS)
    .select('dia, generado, metricas, claves');
  const aceptaciones = await supabase
    .from(TABLA_ACEPTACIONES)
    .select('id, clave, motivo, nivel, objeto, quien, at, retira');

  /* ── Sin migración: como siempre ─────────────────────────────────────── */

  if (faltaLaTabla(instantaneas.error) || faltaLaTabla(aceptaciones.error)) {
    const { estado, aviso } = await leerEstado(rutaEstado);
    if (aviso) avisos.push(aviso);
    avisos.push(AVISO_SIN_MIGRACION);
    return { estado, en: 'archivo', avisos };
  }

  /*
    Las tablas existen y aun así no se han podido leer. Esto NO cae al archivo:
    con `service_role` una lectura que falla no es un permiso, es que algo va
    mal, y seguir adelante en silencio significaría escribir después una
    instantánea calculada sobre una memoria vacía — machacando la buena.
  */
  if (instantaneas.error || aceptaciones.error) {
    throw new Error(
      `No se ha podido leer la memoria del informe: ${
        instantaneas.error?.message || aceptaciones.error?.message
      }`
    );
  }

  /* ── Con migración y vacías: la siembra ──────────────────────────────── */

  const sinNada = (instantaneas.data?.length ?? 0) === 0 && (aceptaciones.data?.length ?? 0) === 0;
  if (sinNada) {
    const { estado: delArchivo, aviso } = await leerEstado(rutaEstado);
    if (aviso) avisos.push(aviso);

    const aceptadas = Object.keys(delArchivo.aceptados || {}).length;
    const puntos = (delArchivo.historico || []).length;

    if (aceptadas > 0 || puntos > 0) {
      avisos.push(
        `Primera ejecución con la migración 0074: se han llevado a la base ${aceptadas} ` +
          `aceptación(es) y ${puntos} instantánea(s) desde informes/estado.json. El archivo se ` +
          'queda donde está, sin tocar.'
      );
      return { estado: delArchivo, en: 'base', sembrar: delArchivo, avisos };
    }
  }

  return {
    estado: estadoDeFilas({
      snapshots: instantaneas.data || [],
      aceptaciones: aceptaciones.data || [],
    }),
    en: 'base',
    avisos,
  };
};

/**
 * Escribe lo que hay que recordar de esta ejecución.
 *
 * Se guarda SIEMPRE, aunque no se acepte nada: dentro va la lista de claves de
 * hoy, que es contra lo que se comparará la próxima vez para saber qué es nuevo.
 * Sin eso, cada informe sería el primero.
 */
export const guardarMemoria = async (
  supabase,
  { informe, estado, aceptar = null, aceptables = null, quien = null, sembrar = null }
) => {
  const hallazgos = informe.seguridad.filter((h) => h.nivel !== 'info');

  /* ── La siembra, si toca. Va primero ──────────────────────────────────── */

  if (sembrar) {
    const viejas = Object.entries(sembrar.aceptados || {}).map(([clave, v]) => ({
      clave,
      motivo: v.motivo,
      nivel: v.nivel ?? null,
      objeto: v.objeto ?? null,
      /* `at` se fija con la fecha ORIGINAL y no con la de hoy: si se sembrara
         con la de ahora, todas las decisiones parecerían tomadas el mismo día y
         se perdería lo único que hace revisable una lista de aceptaciones —
         cuándo se decidió cada cosa. */
      at: v.desde ? `${v.desde}T00:00:00.000Z` : undefined,
    }));

    if (viejas.length > 0) {
      const { error } = await supabase.from(TABLA_ACEPTACIONES).insert(viejas);
      if (error) throw new Error(`No se han podido sembrar las aceptaciones: ${error.message}`);
    }

    const puntos = (sembrar.historico || []).map((h) => ({
      dia: h.generado.slice(0, 10),
      generado: h.generado,
      metricas: h.metricas || {},
      claves: [],
    }));

    if (puntos.length > 0) {
      const { error } = await supabase
        .from(TABLA_INSTANTANEAS)
        .upsert(puntos, { onConflict: 'dia' });
      if (error) throw new Error(`No se han podido sembrar las instantáneas: ${error.message}`);
    }
  }

  /* ── Lo aceptado ahora ────────────────────────────────────────────────── */

  let aceptadas = 0;
  if (aceptar) {
    /* `aceptables` y no `hallazgos`: el ámbito ya decidió a cuáles alcanza (ver
       `AMBITOS`). Aceptar la lista entera aquí se llevaría por delante los
       críticos aunque quien lo pidió solo quisiera dar por buenos los nuevos. */
    const filas = filasDeAceptacion({
      hallazgos: aceptables ?? hallazgos,
      motivo: aceptar,
      quien,
      yaAceptados: estado.aceptados || {},
    });

    if (filas.length > 0) {
      const { error } = await supabase.from(TABLA_ACEPTACIONES).insert(filas);
      if (error) throw new Error(`No se han podido guardar las aceptaciones: ${error.message}`);
    }
    aceptadas = filas.length;
  }

  /* ── La instantánea de hoy ────────────────────────────────────────────── */

  const { error } = await supabase.from(TABLA_INSTANTANEAS).upsert(
    filaDeInstantanea({ generado: informe.generado, metricas: informe.metricas, hallazgos }),
    { onConflict: 'dia' }
  );
  if (error) throw new Error(`No se ha podido guardar la instantánea: ${error.message}`);

  return { aceptadas };
};

/** Lo aceptado, releído de la base. Para poder decir cuántas quedan vigentes. */
export const aceptadosAhora = async (supabase) => {
  const { data, error } = await supabase
    .from(TABLA_ACEPTACIONES)
    .select('id, clave, motivo, nivel, objeto, quien, at, retira');
  return error ? {} : aceptadosDe(data || []);
};
