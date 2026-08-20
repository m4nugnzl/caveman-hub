/**
 * El plan que alguien venía a contratar, guardado fuera de la URL.
 *
 * ══ Por qué existe ══════════════════════════════════════════════════════════
 *
 * El primer intento llevaba la intención en la dirección:
 * `/ajustes/plan?contratar=pro`. Sin sesión, `App` enseña el formulario de
 * acceso y deja la ruta en la barra, así que la idea era que al aparecer la
 * sesión la aplicación se montara sobre esa misma ruta y la pantalla del plan
 * recogiera el parámetro.
 *
 * **No aguanta.** Entre que la sesión aparece y que la aplicación sabe quién
 * eres hay varios repintados, y en alguno de ellos la ruta no casa con ninguna
 * del árbol y el comodín de `App` la traduce a «Hoy». La intención se pierde sin
 * dejar rastro, porque no vivía en ningún sitio más.
 *
 * Y hay un segundo caso donde la URL no puede sobrevivir por mucho que se
 * arregle el primero: **con la confirmación por correo activada**, quien se
 * registra abre el enlace del correo, que es otra pestaña y otra dirección. Ahí
 * no hay nada que preservar.
 *
 * Así que la intención se guarda aparte y la ruta pasa a ser solo una pista.
 *
 * ── Por qué `localStorage` y no `sessionStorage` ────────────────────────────
 * Precisamente por el correo: `sessionStorage` es de la pestaña, y el enlace de
 * confirmación abre otra. `localStorage` es del navegador y llega.
 *
 * ── Y por qué caduca ────────────────────────────────────────────────────────
 * Porque `localStorage` no se vacía solo. Sin fecha, quien se registró en marzo
 * y no llegó a pagar se encontraría la pasarela abriéndose sola en junio. Una
 * hora es lo mismo que dura el enlace del correo (`Email OTP expiration`), que
 * es exactamente el trayecto que esto tiene que cubrir.
 */

const CLAVE = 'cavemanhub:contratar';
const VIGENCIA_MS = 60 * 60 * 1000;

/*
  Todo va envuelto en `try`. El almacenamiento del navegador lanza excepción en
  navegación privada de algunos navegadores y con las cookies de terceros
  bloqueadas, y esto es un atajo de conveniencia: si falla, lo que tiene que
  pasar es que el usuario acabe en la pantalla del plan y elija a mano, no que se
  caiga la portada entera.
*/
export const guardarIntencion = (plan, periodo = 'month') => {
  if (!plan) return;
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ plan, periodo, ts: Date.now() }));
  } catch {
    // Sin almacenamiento no hay atajo, y no pasa nada más.
  }
};

export const olvidarIntencion = () => {
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    // Igual que arriba: no hay nada que hacer ni nada que romper.
  }
};

/** El plan pendiente, o `null` si no hay, caducó o está corrupto. */
export const leerIntencion = () => {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return null;

    const { plan, periodo, ts } = JSON.parse(crudo);
    if (!plan || !ts || Date.now() - ts > VIGENCIA_MS) {
      olvidarIntencion();
      return null;
    }
    return { plan, periodo: periodo === 'year' ? 'year' : 'month' };
  } catch {
    /* JSON de otra versión o basura: se tira. Una intención que no se entiende
       no se puede cumplir, y dejarla ahí la haría fallar en cada arranque. */
    olvidarIntencion();
    return null;
  }
};
