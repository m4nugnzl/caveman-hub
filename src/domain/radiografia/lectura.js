/**
 * Leer una tabla entera, sin creerse el primer millar.
 *
 * ══ La trampa que esto existe para esquivar ═════════════════════════════════
 *
 * PostgREST devuelve como mucho 1000 filas por petición **y no avisa de que hay
 * más**. Un informe truncado tiene exactamente el mismo aspecto que un informe
 * completo: las cifras salen, los porcentajes cuadran entre sí y nada falla. Es
 * el mismo cuidado que se puso en la copia de seguridad, y por el mismo motivo.
 *
 * ══ Por qué está aquí y no en cada programa ════════════════════════════════
 *
 * Porque lo hacen dos —el script de la terminal y la función edge— y es el sitio
 * donde una diferencia entre los dos no daría la cara. Si uno paginara y el otro
 * no, los dos enseñarían un informe con buena pinta y solo uno estaría bien.
 *
 * Es el único archivo de esta carpeta que HABLA con algo. Aun así no importa
 * nada: recibe el cliente ya hecho, así que le da igual en qué entorno corre y
 * se puede probar con un cliente de mentira.
 */

/* El tope de PostgREST. No es configurable desde el cliente: es del servidor. */
export const PAGINA = 1000;

/**
 * Una tabla entera, por páginas.
 *
 * Que una tabla NO EXISTA no es un error: significa que su migración no está
 * aplicada, y eso es una respuesta legítima que el informe tiene que poder
 * contar. Lo que sí sería un error es dar por vacío lo que no se ha podido leer,
 * así que se distinguen tres respuestas y nunca se confunden:
 *
 *   `{ rows }`   se leyó, y esto es lo que hay
 *   `{ falta }`  la tabla no existe en este proyecto
 *   `{ error }`  existe y no se ha podido leer
 */
export const leerTabla = async (supabase, tabla, { columnas = '*', desde = null } = {}) => {
  const filas = [];

  for (let from = 0; ; from += PAGINA) {
    let q = supabase.from(tabla).select(columnas).range(from, from + PAGINA - 1);
    if (desde) q = q.gte('at', desde);

    const { data, error } = await q;
    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) return { falta: true };
      return { error: error.message };
    }

    filas.push(...data);

    /* Menos de una página llena es el final. Con una página EXACTA hay que
       volver a pedir: puede que sobre nada o puede que falten mil, y desde aquí
       no se distingue. Pedir de más una vez es barato; quedarse corto no. */
    if (data.length < PAGINA) break;
  }

  return { rows: filas };
};

/**
 * Todo el plan de lectura, ejecutado.
 *
 * Devuelve `{ datos, avisos }`: los avisos son lo que no se ha podido leer, y
 * van al informe para que un cero se pueda distinguir de un hueco. `alLeer` es
 * para que la terminal pueda ir contando; desde la función edge no lo usa nadie.
 */
export const leerTodo = async (supabase, tablas, { alLeer = null } = {}) => {
  const datos = {};
  const avisos = [];

  for (const [nombre, opciones] of Object.entries(tablas)) {
    const res = await leerTabla(supabase, opciones.tabla, opciones);

    if (res.falta) {
      avisos.push(
        `La tabla «${opciones.tabla}» no existe en este proyecto: su migración no está aplicada.`
      );
      datos[nombre] = [];
      alLeer?.({ tabla: opciones.tabla, falta: true });
      continue;
    }
    if (res.error) {
      avisos.push(`No se ha podido leer «${opciones.tabla}»: ${res.error}`);
      datos[nombre] = [];
      alLeer?.({ tabla: opciones.tabla, error: res.error });
      continue;
    }

    datos[nombre] = res.rows;
    alLeer?.({ tabla: opciones.tabla, filas: res.rows.length });
  }

  return { datos, avisos };
};
