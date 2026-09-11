/**
 * Quién entró la última vez, para poder abrir sin red.
 *
 * ══ El agujero que tapa ═════════════════════════════════════════════════════
 *
 * Con todo lo demás del camino sin conexión en pie —la aplicación se pinta, los
 * datos están en la copia local, lo que se escribe espera en la cola— seguía
 * habiendo una pantalla de login entre la persona y su trabajo.
 *
 * La razón está en `@supabase/auth-js`: el testigo de acceso caduca a la hora, y
 * `getSession()` intenta renovarlo. Sin red la renovación falla, y como el
 * testigo ya está caducado, devuelve `session: null`. La sesión NO se borra —el
 * fallo es de red y auth-js sabe distinguirlo—, pero mientras tanto la aplicación
 * ve «no hay nadie dentro» y enseña el formulario.
 *
 * Y es el caso NORMAL, no un caso raro: la renovación automática solo corre con
 * la pestaña abierta. Quien usó la aplicación en casa y abre el icono en el
 * gimnasio dos horas después cae aquí siempre.
 *
 * ══ Qué se guarda, y qué NO ═════════════════════════════════════════════════
 *
 * Solo el id y el correo: lo justo para saber de quién es la copia local que hay
 * que abrir. **Ni un testigo ni una contraseña** — de eso ya se ocupa auth-js en
 * su propio almacén, y duplicar credenciales en un sitio nuestro sería empeorar
 * la seguridad para arreglar un problema de interfaz.
 *
 * ══ Por qué esto no abre ninguna puerta ═════════════════════════════════════
 *
 * Porque no autoriza nada. Quien manda sobre los datos es RLS, en el servidor, y
 * al servidor se llega con el testigo de auth-js: mientras esté caducado, TODA
 * petición se rechaza, con esto o sin esto. Lo único que se consigue es enseñar
 * la copia que ya está en este aparato —a quien ya tiene el aparato desbloqueado
 * y la sesión guardada— y admitir escritura en la cola, que no sale de aquí
 * hasta que el testigo se renueve de verdad.
 *
 * Dicho al revés: esto decide QUÉ SE PINTA sin conexión, nunca a qué se tiene
 * derecho. Y se borra al cerrar sesión, igual que la copia.
 */

const CLAVE = 'caveman-ultima-sesion';

/** Se apunta en cuanto hay sesión de verdad. */
export const recordarSesion = (user) => {
  if (!user?.id) return;
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ id: user.id, email: user.email || '' }));
  } catch {
    /* Modo privado: sin apunte no hay arranque sin red, y la aplicación se
       comporta como antes de que esto existiera. */
  }
};

/**
 * La sesión de respaldo para arrancar sin red, o `null`.
 *
 * Va marcada con `sinConexion` para que nada la confunda con una de verdad, y
 * lleva la forma que el resto de la aplicación espera —`session.user.id`— porque
 * el objetivo es justamente que ningún otro sitio tenga que enterarse.
 */
export const sesionDeRespaldo = () => {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE) || 'null');
    if (!guardado?.id) return null;
    return { sinConexion: true, user: { id: guardado.id, email: guardado.email || '' } };
  } catch {
    return null;
  }
};

/** Al cerrar sesión. La copia local se borra en el mismo gesto. */
export const olvidarSesion = () => {
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    /* No poder limpiar no rompe nada: sin la copia local no hay nada que abrir. */
  }
};
