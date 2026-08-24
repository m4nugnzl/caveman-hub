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
 *
 * ══ Por qué aquí ya no se lee ni se escribe nada ════════════════════════════
 *
 * Este archivo llevaba dentro `readFile` y `writeFile`, y eso lo ataba a Node.
 * Desde que el mismo estado se calcula también en una función edge —donde no hay
 * disco— la parte que decide qué es nuevo y qué está aceptado tiene que poder
 * correr en los dos sitios, y con el mismo resultado: dos implementaciones de
 * «esto ya lo habías visto» divergen, y la que divergiera avisaría de novedades
 * que no lo son.
 *
 * Así que aquí queda **solo el razonamiento**, sin una sola dependencia.
 * `informes/estado.json` lo lee y lo escribe `scripts/radiografia/archivo.mjs`,
 * que es el único que sabe que hay un disco. `normalizaEstado` es la costura:
 * recibe lo que haya salido del `JSON.parse` —o nada— y devuelve un estado con la
 * forma que todo lo de abajo da por supuesta.
 */

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

/** Un estado sin nada dentro: el de la primera vez. */
export const estadoVacio = () => ({ ...VACIO, aceptados: {}, historico: [] });

/**
 * Le da forma a un estado venga de donde venga: de un archivo, de una fila o de
 * ningún sitio.
 *
 * Todo lo de abajo da por hecho que `aceptados` es un objeto y que `historico` es
 * una lista. Un `estado.json` editado a mano —que se puede, y está invitado a
 * hacerse en la cabecera— puede no cumplirlo, y entonces el fallo no sale aquí:
 * sale tres funciones más allá, en un `.filter` de algo que no es una lista.
 */
export const normalizaEstado = (datos) => {
  if (!datos || typeof datos !== 'object') return estadoVacio();
  return {
    ...VACIO,
    ...datos,
    aceptados: datos.aceptados && typeof datos.aceptados === 'object' ? datos.aceptados : {},
    historico: Array.isArray(datos.historico) ? datos.historico : [],
  };
};

/* ==========================================================================
   Las mismas dos cosas, cuando viven en la base (migración 0074)
   --------------------------------------------------------------------------
   Estas funciones son la traducción entre filas y el estado que todo lo de
   arriba espera. Son puras y están aquí, y no en quien consulta la base, por el
   motivo de siempre: la CLI, la función edge y el panel tienen que entender lo
   aceptado EXACTAMENTE igual. Un lector que interpretara una retirada de otra
   manera enseñaría una lista de hallazgos distinta sin fallar.
   ========================================================================== */

/**
 * Lo aceptado ahora mismo, a partir de todas las filas de aceptación.
 *
 * ── Por qué se pliega en vez de consultarse ─────────────────────────────────
 * Porque la tabla es de SOLO AÑADIR: no guarda «qué está aceptado», guarda
 * «qué se decidió y cuándo». Lo vigente es el resultado de leer esas decisiones
 * en orden, y ese orden importa: aceptar, retirar y volver a aceptar deja tres
 * filas y una sola conclusión.
 *
 * Se ordena aquí y no se confía en el orden en que lleguen las filas: un
 * `select` sin `order by` no promete ninguno, y el fallo que produciría —una
 * retirada aplicada antes que la aceptación que retira— dejaría un hallazgo
 * aceptado que ya no debería estarlo. Es decir, se vería MENOS de lo que hay.
 */
export const aceptadosDe = (filas = []) => {
  const orden = [...filas].sort((a, b) => {
    const porFecha = String(a.at || '').localeCompare(String(b.at || ''));
    return porFecha !== 0 ? porFecha : Number(a.id || 0) - Number(b.id || 0);
  });

  const aceptados = {};
  for (const fila of orden) {
    if (!fila?.clave) continue;
    if (fila.retira) {
      delete aceptados[fila.clave];
      continue;
    }
    aceptados[fila.clave] = {
      desde: String(fila.at || '').slice(0, 10),
      motivo: fila.motivo,
      nivel: fila.nivel ?? null,
      objeto: fila.objeto ?? null,
      quien: fila.quien ?? null,
    };
  }
  return aceptados;
};

/**
 * El estado completo, montado desde las dos tablas.
 *
 * `ultimo` sale de la instantánea más reciente y es contra lo que se compara
 * para saber qué es nuevo. Si no hay ninguna —primera ejecución tras aplicar la
 * 0074— queda en nulo, y `anotar` no marca nada como novedad: no hay con qué
 * comparar, y marcar los 239 hallazgos como nuevos sería la inundación que todo
 * este archivo existe para evitar.
 */
export const estadoDeFilas = (
  /** @type {{ snapshots?: any[], aceptaciones?: any[] }} */ { snapshots = [], aceptaciones = [] } = {}
) => {
  const historico = [...snapshots]
    .filter((s) => s?.generado)
    .sort((a, b) => String(a.dia || a.generado).localeCompare(String(b.dia || b.generado)))
    .map((s) => ({ generado: s.generado, metricas: s.metricas || {} }));

  const ultimaFila = [...snapshots].sort((a, b) =>
    String(a.dia || a.generado).localeCompare(String(b.dia || b.generado))
  ).at(-1);

  return {
    version: VERSION,
    aceptados: aceptadosDe(aceptaciones),
    ultimo: ultimaFila
      ? {
          generado: ultimaFila.generado,
          claves: ultimaFila.claves || [],
          metricas: ultimaFila.metricas || {},
        }
      : null,
    historico,
  };
};

/**
 * La fila de instantánea de esta ejecución.
 *
 * `dia` y no la hora: es la clave primaria de la tabla, y con eso queda dicho
 * que manda la última ejecución de cada día. Probar el script tres veces
 * seguidas no puede dibujar un dientecito que no significa nada.
 */
export const filaDeInstantanea = ({ generado, metricas, hallazgos = [] }) => ({
  dia: generado.slice(0, 10),
  generado,
  metricas,
  /* Las de NOVEDAD, no las estrictas: ver `claveNovedad`. */
  claves: hallazgos.map(claveNovedad),
});

/**
 * Las filas que hay que insertar para aceptar unos hallazgos.
 *
 * Se salta los que ya estaban aceptados: sin eso, cada ejecución con
 * `--aceptar-todo` añadiría una fila idéntica por hallazgo y la tabla pasaría de
 * ser un registro de decisiones a ser un registro de ejecuciones.
 */
export const filasDeAceptacion = ({ hallazgos = [], motivo, quien = null, yaAceptados = {} }) =>
  hallazgos
    .filter((h) => !yaAceptados[claveDe(h)])
    .map((h) => ({
      clave: claveDe(h),
      motivo,
      nivel: h.nivel,
      objeto: h.objeto,
      quien,
    }));

/* ==========================================================================
   Qué se acepta de una vez, y por qué no puede ser siempre «todo»
   --------------------------------------------------------------------------
   `--aceptar-todo` fija la línea base entera, y para eso se hizo: se usa UNA
   vez, después de revisar la lista a mano. El problema es que a partir de
   entonces es lo único que hay, y usarlo para dar por buenos dos avisos nuevos
   se lleva por delante también los críticos que estaban sin arreglar — que
   dejan de pedir atención sin que nadie haya decidido nada sobre ellos.

   De ahí estos dos ámbitos. Ninguno alcanza a un crítico: un hallazgo crítico
   solo se puede aceptar diciéndolo explícitamente, y eso es deliberado.
   ========================================================================== */

/** @type {Record<string, { descripcion: string, filtra: (h: any) => boolean }>} */
export const AMBITOS = {
  /*
    Lo que ayer no estaba. Es el ámbito que se usa cada semana: se mira lo que
    ha cambiado, y si es deliberado se dice con su motivo. Deja intacto todo lo
    que ya venía saliendo, aceptado o no.
  */
  nuevos: {
    descripcion: 'solo los hallazgos que no estaban en el informe anterior',
    filtra: (h) => h.nuevo && h.nivel !== 'critico',
  },
  /*
    Todo lo que no es crítico. Es la limpieza de la lista larga —los 48 avisos
    de funciones que `anon` puede ejecutar y se defienden solas— sin tocar lo
    que sí hay que arreglar.
  */
  avisos: {
    descripcion: 'todos los hallazgos que no son críticos',
    filtra: (h) => h.nivel !== 'critico' && h.nivel !== 'info',
  },
  /*
    La línea base entera, críticos incluidos. Se escribe entero a propósito: es
    la única forma de aceptar un crítico y tiene que costar teclearlo.
  */
  todo: {
    descripcion: 'TODOS los hallazgos, incluidos los críticos',
    filtra: (h) => h.nivel !== 'info',
  },
};

/**
 * Los hallazgos que alcanza un ámbito, sin los que ya estaban aceptados.
 *
 * Se descuentan los ya aceptados aquí y no al insertar para poder decir cuántos
 * se van a aceptar DE VERDAD. «12 hallazgos aceptados» cuando once ya lo estaban
 * es un mensaje que enseña a no leer los mensajes.
 */
export const aAceptar = (hallazgos = [], ambito = 'nuevos', yaAceptados = {}) => {
  const regla = AMBITOS[ambito];
  if (!regla) return [];
  return hallazgos.filter((h) => regla.filtra(h) && !yaAceptados[claveDe(h)]);
};

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
 * `aceptar` es el motivo, y `aceptables` QUÉ se acepta. Son dos parámetros y no
 * uno porque `hallazgos` se usa además para `ultimo.claves` —lo que se compara
 * la próxima vez para saber qué es nuevo— y ésa tiene que llevarlas TODAS.
 * Filtrar una sola lista para las dos cosas haría que los hallazgos no aceptados
 * desaparecieran de la comparación y volvieran a salir como novedad mañana.
 *
 * Pide motivo siempre: dentro de seis meses, una lista de aceptaciones sin
 * motivo no se puede revisar, solo se puede volver a aceptar a ciegas.
 */
export const siguienteEstado = ({
  estado,
  hallazgos,
  instantanea,
  generado,
  aceptar = null,
  aceptables = null,
}) => {
  const aceptados = { ...estado.aceptados };

  if (aceptar) {
    for (const h of aceptables ?? hallazgos) {
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
