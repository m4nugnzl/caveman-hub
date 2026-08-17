/**
 * La clave que salta RLS, comprobada antes de usarla.
 *
 * ══ Por qué esto vive aparte ════════════════════════════════════════════════
 *
 * Estaba dentro de `scripts/backup.mjs` porque solo lo usaba él. Con
 * `scripts/radiografia.mjs` son dos, y la alternativa era copiar sesenta líneas
 * de comprobaciones — que es justo lo que hace que la segunda copia se quede
 * atrás cuando Supabase vuelve a cambiar el formato de sus claves.
 *
 * Y ya lo cambió una vez: conviven las JWT heredadas (`eyJ…`) con las nuevas
 * (`sb_secret_…`, `sb_publishable_…`), y distinguirlas es la mitad de este
 * archivo.
 *
 * ══ Qué se comprueba y por qué importa tanto ════════════════════════════════
 *
 * Que la clave sea la de SERVIDOR y no la del navegador. Con la del navegador
 * todas las lecturas salen VACÍAS y sin ningún error: RLS filtra todas las filas
 * cuando no hay usuario.
 *
 * En una copia de seguridad eso significa un archivo con listas de cero
 * elementos y aspecto de haber funcionado — el peor fallo posible, el que solo
 * se descubre el día que hace falta. En una radiografía significa un informe que
 * dice que nadie usa nada.
 *
 * Los dos fallos son el mismo: silencio con aspecto de dato.
 */

/**
 * ¿Es la clave que salta RLS?
 *
 * Las claves heredadas de Supabase son JWT: el cuerpo lleva `role`, y en la de
 * servicio vale `service_role`. Se mira sin verificar la firma, que aquí no hace
 * falta —no se está autenticando a nadie, se está evitando un error de copiar y
 * pegar—.
 */
export const isServiceRole = (key) => {
  try {
    const body = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
    return body.role === 'service_role';
  } catch {
    // Formato desconocido: puede ser una clave nueva de Supabase (`sb_secret_…`),
    // que no es un JWT. No se puede afirmar que sea la equivocada, así que pasa.
    return true;
  }
};

/**
 * La URL y la clave, o un mensaje explicando exactamente qué falta.
 *
 * Devuelve `{ url, key }` si todo está bien, o `{ error }` con el texto ya
 * redactado. No sale por su cuenta con `process.exit`: quien llama decide cómo
 * termina, y eso es lo que permite probar esto.
 *
 * @param {string} [para] cómo se llama lo que va a usar la clave, para el texto.
 */
export const resolverCredenciales = ({ para = 'esto' } = {}) => {
  /* La URL no es un secreto y ya está en `.env` como `VITE_SUPABASE_URL`: es el
     mismo proyecto. Repetirla en `.env.backup` solo añadiría un sitio donde se
     puede quedar desactualizada al cambiar de proyecto. Así lo único que hay que
     poner aparte es la clave, que es lo único que de verdad va aparte. */
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    return {
      error:
        'No hay ninguna URL de Supabase.\n' +
        '  Se busca SUPABASE_URL y, si no está, VITE_SUPABASE_URL de tu .env.',
    };
  }

  if (!key) {
    return {
      error:
        'Falta SUPABASE_SERVICE_ROLE_KEY.\n' +
        `  La URL sí está (${new URL(url).host}); solo falta la clave.\n\n` +
        '  1. Supabase Dashboard → Settings → API → service_role, «Reveal».\n' +
        '  2. Pégala en .env.backup, en la raíz del proyecto:\n\n' +
        '       SUPABASE_SERVICE_ROLE_KEY=eyJ...\n\n' +
        '  Ese archivo ya está en .gitignore. No es la anon key: esta salta todas\n' +
        '  las políticas de seguridad, así que no va al navegador ni al repositorio.',
    };
  }

  /*
    Supabase tiene dos generaciones de claves conviviendo, y las que valen aquí
    son las de servidor de cada una:

      eyJ…              JWT heredada. La `anon` y la `service_role` tienen esta
                        forma, y se distinguen por el `role` de dentro.
      sb_secret_…       La nueva de servidor. Sustituye a la `service_role`.
      sb_publishable_…  La nueva de navegador. NO vale: es la que sustituye a la
                        anon, y con ella no se leería nada.

    Comprobar la forma aquí evita recorrer las veinte tablas para terminar con
    veinte líneas de «Invalid API key», que no dicen cuál es el problema.
  */
  if (key.startsWith('sb_publishable_')) {
    return {
      error:
        'Esa es la clave publicable, no la secreta.\n' +
        '  `sb_publishable_…` es la que sustituye a la anon: va en el navegador y\n' +
        `  respeta las políticas de seguridad, así que ${para} saldría vacío.\n\n` +
        '  Necesitas la de al lado: Settings → API Keys → Secret keys → `sb_secret_…`.',
    };
  }

  if (!/^eyJ[\w-]*\.[\w-]+\.[\w-]+$/.test(key) && !key.startsWith('sb_secret_')) {
    return {
      error:
        'Eso no parece una clave de Supabase.\n' +
        '  ¿Has dejado el marcador de .env.backup sin sustituir, o has pegado la URL?\n\n' +
        '  Settings → API Keys. Vale cualquiera de las dos:\n' +
        '    · pestaña «API keys» → Secret keys → `sb_secret_…`  (recomendada)\n' +
        '    · pestaña «Legacy API keys» → `service_role` → «Reveal» → `eyJ…`',
    };
  }

  if (!isServiceRole(key)) {
    return {
      error:
        'Esa es la anon key, no la service_role.\n' +
        `  Con ella ${para} saldría VACÍO y sin ningún error: las políticas de\n` +
        '  seguridad filtran todas las filas cuando no hay usuario. Es justo el\n' +
        '  fallo que solo se descubre el día que hace falta.',
    };
  }

  return { url, key };
};
