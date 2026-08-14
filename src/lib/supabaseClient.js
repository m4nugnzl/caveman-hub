// src/lib/supabaseClient.js
import { createClient } from '@supabase/supabase-js';

import { recordIssue } from './diagnostics';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Falla rápido y claro en vez de dejar que cada query falle en silencio.
  console.error(
    'Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en tu .env — copia .env.example a .env y rellénalo.'
  );
}

/**
 * ══ Todo fallo del servidor queda apuntado ═════════════════════════════════
 *
 * El registro de fallos (`lib/diagnostics`) existía desde hace tiempo, pero solo
 * lo alimentaban TRES sitios: la cola de guardado, la creación del equipo y la
 * carga inicial. Todo lo demás —y es casi todo— devuelve `{ ok: false, error }`
 * a quien llama, que enseña un aviso en pantalla y ahí se acaba.
 *
 * El resultado se veía en los tickets: llegaban con la lista de fallos vacía
 * aunque a la persona le hubiera fallado media aplicación, porque ninguno de sus
 * fallos pasaba por uno de esos tres sitios.
 *
 * Engancharlo aquí, en el `fetch` del cliente, lo arregla de una vez y para
 * siempre: no hay forma de hablar con Supabase que no pase por aquí, así que
 * ninguna llamada nueva se puede olvidar de registrarse.
 *
 * ── Qué se apunta y qué NO ──────────────────────────────────────────────────
 * Se apunta el método, la ruta, el código y el mensaje que devuelve Postgres.
 *
 * No se apunta ni una cabecera ni un cuerpo. Las cabeceras llevan el token de
 * sesión y la clave anónima, y el cuerpo lleva los datos del cliente —su peso,
 * sus medidas—. Esto acaba pegado en un ticket de soporte que lee otra persona,
 * así que la regla es: lo que identifica el FALLO, sí; lo que identifica a la
 * PERSONA o abre su sesión, jamás.
 *
 * La query se corta antes del `?` por lo mismo: un filtro `?email=eq.…` lleva el
 * correo de alguien dentro.
 */
const rutaLimpia = (url) => {
  try {
    const { pathname } = new URL(url, supabaseUrl || 'http://local');
    return pathname.replace('/rest/v1/', '').replace('/auth/v1/', 'auth/');
  } catch {
    return '';
  }
};

const fetchConRegistro = async (input, init) => {
  const url = typeof input === 'string' ? input : input?.url || '';
  const metodo = init?.method || 'GET';

  let response;
  try {
    response = await fetch(input, init);
  } catch (e) {
    /*
      Sin respuesta: no hay red, el túnel se cayó o el servidor no contesta. Es
      el caso que más tickets genera —«no me guarda nada»— y el que peor se
      diagnostica sin dejarlo escrito, porque no deja rastro en el servidor.
    */
    recordIssue('red', `${metodo} ${rutaLimpia(url)} — sin respuesta: ${e?.message || e}`);
    throw e;
  }

  if (!response.ok) {
    /*
      Se clona antes de leer: el cuerpo de una respuesta solo se puede consumir
      UNA vez, y el que tiene que leerlo es supabase-js. Leerlo aquí sin clonar
      dejaría a la aplicación con un error vacío — un fallo peor que el original
      y muchísimo más difícil de encontrar.
    */
    let detalle = '';
    try {
      const cuerpo = await response.clone().json();
      detalle = cuerpo?.message || cuerpo?.error_description || cuerpo?.error || '';
    } catch {
      detalle = '';
    }
    recordIssue(
      'servidor',
      `${metodo} ${rutaLimpia(url)} — ${response.status}${detalle ? ` ${detalle}` : ''}`
    );
  }

  return response;
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: fetchConRegistro },
});
