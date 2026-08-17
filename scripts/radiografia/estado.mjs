/**
 * Lo que ya se ha mirado y se dio por bueno.
 *
 * ══ El problema que resuelve ════════════════════════════════════════════════
 *
 * La lista de seguridad **nunca va a estar vacía**, y no porque el proyecto esté
 * mal: hay decisiones deliberadas que salen siempre —dos pantallas se abren sin
 * sesión, los planes son públicos a propósito (0049)— y por la trampa de la 0047
 * cada función nueva nace alcanzable por `anon` hasta que alguien la revoque.
 *
 * Una lista que nunca queda limpia se deja de mirar. Y entonces el hallazgo que
 * sí importa aparece entre los de siempre y no lo ve nadie. Es exactamente lo
 * que pasó con la 0053 al estrenarla: 239 críticos, de los que dos lo eran.
 *
 * La respuesta no es bajar el listón de lo que se considera grave —eso es dejar
 * de mirar, disfrazado— sino **poder decir «esto ya lo he visto y es
 * deliberado»** y que a partir de ahí solo destaque lo nuevo.
 *
 * ══ Por qué un archivo y no una casilla en el navegador ═════════════════════
 *
 * Porque tiene que sobrevivir. Un informe se regenera cada semana y el
 * almacenamiento del navegador sobre `file://` no es fiable entre archivos: lo
 * aceptado se perdería justo cuando lleva meses acumulado y ya nadie recuerda
 * por qué se aceptó.
 *
 * `informes/estado.json` se guarda una vez, se puede leer, se puede editar a
 * mano y —lo que más importa— **cada aceptación lleva escrito su motivo y su
 * fecha**. Aceptar un hallazgo de seguridad sin dejar dicho por qué es cómo
 * empiezan los agujeros que luego nadie sabe explicar.
 *
 * ══ Cuándo se deshace una aceptación sola ══════════════════════════════════
 *
 * La clave incluye el TEXTO del hallazgo, no solo el objeto. Así que si mañana
 * `videos · Acceso a videos` pasa de `SELECT` a `ALL`, o una tabla suma un
 * permiso nuevo para `anon`, el texto cambia, la clave cambia y **vuelve a
 * aparecer como nuevo** aunque su hermano estuviera aceptado.
 *
 * Es deliberado: se acepta un hallazgo concreto, no un objeto para siempre.
 */

import { readFile, writeFile } from 'node:fs/promises';

/**
 * Qué identifica a un hallazgo PARA ACEPTARLO. Incluye el texto a propósito.
 *
 * Ver la cabecera: se acepta un hallazgo concreto, no un objeto para siempre. Si
 * `videos` pasa de una política `SELECT` a una `ALL`, el texto cambia, la clave
 * cambia y la aceptación deja de aplicar.
 */
export const claveDe = (h) => `${h.area}|${h.objeto}|${h.detalle}`;

/**
 * Y qué lo identifica PARA SABER SI ES NUEVO. Ésta no mira el texto.
 *
 * ══ Por qué son dos claves y no una ═════════════════════════════════════════
 *
 * Porque responden a dos preguntas distintas, y usar la estricta para las dos
 * produjo un fallo de los que hacen que se deje de mirar una herramienta.
 *
 * Al aplicar la migración 0055 —que solo cambia CÓMO SE REDACTA el hallazgo:
 * «comprueba permisos por dentro» pasó a ser «alcanza auth.uid() y se defiende
 * sola»— el panel avisó de **36 hallazgos que ayer no estaban**. No había
 * cambiado nada en la base: había cambiado el texto del informe.
 *
 * Un aviso de novedad que se dispara porque el propio informe se reescribió es
 * ruido puro, y encima del más caro: enseña a ignorar la única señal que
 * significa «algo se movió en la base».
 *
 * Así que la novedad se mide por **objeto y gravedad**, que es lo que de verdad
 * cambia cuando cambia la base:
 *
 *   · una política nueva, una tabla nueva, una función nueva → objeto nuevo.
 *   · una política que pasa de `SELECT` a `ALL` → sube de aviso a crítico.
 *
 * Y la redacción del informe puede evolucionar sin inundar a nadie.
 */
export const claveNovedad = (h) => `${h.area}|${h.objeto}|${h.nivel}`;

/*
  ══ La versión del archivo, y para qué sirve de verdad ═════════════════════

  Para una sola cosa, y es importante: en la versión 1, `ultimo.claves` guardaba
  las claves ESTRICTAS —las que incluyen el texto del hallazgo—. Desde la 2
  guarda las de NOVEDAD (ver `claveNovedad`).

  Sin distinguirlo, la primera ejecución después del cambio no reconocería
  ninguna clave y marcaría todos los hallazgos como nuevos: la misma inundación
  que la separación de claves venía a arreglar, provocada por el propio arreglo.

  Se comprueba con un número y no adivinando la forma de las claves —las dos son
  tres campos separados por barras y no se distinguen mirándolas— porque una
  heurística falla justo en el caso raro, que es cuando más falta hace.
*/
const VERSION = 2;

const VACIO = { version: VERSION, aceptados: {}, ultimo: null, historico: [] };

/*
  ══ Cuántas ejecuciones se recuerdan ═══════════════════════════════════════

  Veintiséis. Con la cadencia para la que está pensado esto —una vez por
  semana— son seis meses, que es lo que tarda una tendencia lenta en verse: que
  el porcentaje de clientes con portal lleve medio año bajando es una conclusión
  que ninguna ejecución suelta puede dar.

  Es un tope y no un histórico completo a propósito: lo que se guarda son las
  cifras de la portada, no el informe, y una lista que crece para siempre acaba
  siendo un archivo de datos disfrazado de configuración.
*/
const RECUERDA = 26;

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
    const datos = JSON.parse(crudo);
    return {
      estado: {
        ...VACIO,
        ...datos,
        aceptados: datos.aceptados || {},
        historico: Array.isArray(datos.historico) ? datos.historico : [],
      },
      aviso: null,
    };
  } catch (e) {
    if (e.code === 'ENOENT') return { estado: { ...VACIO }, aviso: null };
    return {
      estado: { ...VACIO },
      aviso:
        `No se ha podido leer ${ruta} (${e.message}). Los hallazgos ya aceptados ` +
        'vuelven a salir como nuevos; el archivo no se ha tocado.',
    };
  }
};

export const guardarEstado = (ruta, estado) =>
  writeFile(ruta, `${JSON.stringify(estado, null, 2)}\n`, 'utf8');

/**
 * Marca cada hallazgo con lo que la interfaz necesita saber de él.
 *
 * `nuevo` significa «no estaba en el informe anterior», y es distinto de «no
 * está aceptado»: un hallazgo puede llevar semanas apareciendo sin que nadie lo
 * haya aceptado —porque nadie lo ha mirado— y eso no lo convierte en noticia.
 * La noticia es lo que ayer no estaba.
 *
 * ── Las líneas de contexto NUNCA son nuevas ─────────────────────────────────
 * Y esto no es un detalle: es un fallo que apareció al ejecutar el informe dos
 * veces seguidas sin cambiar nada, y que avisaba de «4 hallazgos nuevos».
 *
 * Eran las cuatro líneas de nivel `info` —«31 de 31 tablas con RLS», «68
 * políticas»…—. Se anotaban aquí pero NO se guardan en `claves` (lo que se
 * guarda son los accionables), así que en cada ejecución parecían recién
 * aparecidas. Un aviso de novedad que salta solo es peor que no tenerlo: enseña
 * a ignorar el único indicador que existe para lo que sí importa.
 */
export const anotar = (hallazgos, estado) => {
  const previos = new Set(estado.ultimo?.claves || []);
  /* Un estado de la versión 1 guarda claves estrictas: no son comparables con
     las de novedad, así que se trata como si no hubiera anterior. */
  const primeraVez = !estado.ultimo || (estado.version ?? 1) < VERSION;

  return hallazgos.map((h) => {
    const aceptado = estado.aceptados[claveDe(h)] || null;
    return {
      ...h,
      clave: claveDe(h),
      aceptado,
      /* En la primera ejecución nada es «nuevo»: no hay con qué comparar, y
         marcar los 239 como novedad sería la misma inundación por otro lado. */
      nuevo: h.nivel !== 'info' && !primeraVez && !previos.has(claveNovedad(h)),
    };
  });
};

/**
 * El estado que se guarda para la próxima vez.
 *
 * `aceptar` añade a lo aceptado TODO lo que haya ahora mismo. Es la operación de
 * «esto es la línea base, avísame de lo que venga a partir de aquí», y por eso
 * pide un motivo: dentro de seis meses, una lista de aceptaciones sin motivo no
 * se puede revisar, solo se puede volver a aceptar a ciegas.
 */
export const siguienteEstado = ({ estado, hallazgos, instantanea, generado, aceptar = null }) => {
  const aceptados = { ...estado.aceptados };

  if (aceptar) {
    for (const h of hallazgos) {
      const clave = claveDe(h);
      if (aceptados[clave]) continue;
      aceptados[clave] = {
        desde: generado.slice(0, 10),
        motivo: aceptar,
        nivel: h.nivel,
        objeto: h.objeto,
      };
    }
  }

  /*
    El histórico es lo que convierte cada indicador de la portada en una línea
    en vez de en un número suelto. Se guarda SIEMPRE, aunque no se acepte nada.

    Dos ejecuciones del mismo día no producen dos puntos: al mirar esto una vez
    por semana, probar el script tres veces seguidas dibujaría un dientecito que
    no significa nada. Manda la última de cada día.
  */
  const dia = generado.slice(0, 10);
  const historico = [
    ...(estado.historico || []).filter((h) => h.generado.slice(0, 10) !== dia),
    { generado, metricas: instantanea },
  ].slice(-RECUERDA);

  return {
    version: VERSION,
    aceptados,
    ultimo: {
      generado,
      /* Las de NOVEDAD, no las estrictas: ver `claveNovedad`. */
      claves: hallazgos.map(claveNovedad),
      metricas: instantanea,
    },
    historico,
  };
};

/**
 * La serie de una métrica a lo largo del histórico, para dibujarla.
 *
 * Devuelve `[]` si no hay al menos dos puntos: una «tendencia» de un solo punto
 * es una raya horizontal que sugiere estabilidad donde no hay información.
 */
export const serieDe = (historico = [], clave) => {
  const puntos = historico
    .map((h) => ({ fecha: h.generado.slice(0, 10), valor: h.metricas?.[clave] }))
    .filter((p) => Number.isFinite(p.valor));

  return puntos.length >= 2 ? puntos : [];
};
