import { dayMonthMaybeYear } from '@/lib/dates';

/**
 * El acceso de un cliente a su portal, visto desde su ficha.
 *
 * ══ Por qué cuatro estados y no dos ═══════════════════════════════════════
 *
 * La ficha decía «Con cuenta» o «Sin invitar», y el segundo mentía la mitad de
 * las veces: el entrenador que ya había mandado el enlace el lunes leía el
 * miércoles que su cliente estaba «sin invitar», no sabía si el enlace seguía
 * valiendo y pulsaba «Invitar» otra vez para salir de dudas. La base ya sabía
 * la respuesta (`client_invites`); la pantalla no la preguntaba.
 *
 *   · `dentro`      — la ficha tiene cuenta enlazada.
 *   · `enviada`     — hay un enlace vivo sin usar; `caduca` dice hasta cuándo.
 *   · `caducada`    — el último enlace caducó sin que nadie entrara.
 *   · `sin_invitar` — nunca se mandó, o el último se anuló o se gastó con una
 *                     cuenta que ya no está (una reemisión a medias).
 *
 * @param {{ clientProfileId?: string|null }} client
 * @param {{ expiresAt: string, claimedAt?: string|null, revokedAt?: string|null }|null} invitacion
 *   La ÚLTIMA invitación de la ficha, o `null` si no hay ninguna.
 */
export const estadoDelAcceso = (client, invitacion, ahora = Date.now()) => {
  if (client?.clientProfileId) return { estado: 'dentro' };
  if (!invitacion || invitacion.revokedAt || invitacion.claimedAt) return { estado: 'sin_invitar' };
  const caduca = invitacion.expiresAt;
  if (!(new Date(caduca).getTime() > ahora)) return { estado: 'caducada', caduca };
  return { estado: 'enviada', caduca };
};

/** «10 oct», o «10 oct 2027» si no es de este año. */
export const fechaDelEnlace = (valor) => (valor ? dayMonthMaybeYear(valor) : '');

const nombreDePila = (nombre) => String(nombre || '').trim().split(/\s+/)[0] || '';

/**
 * El mensaje que el entrenador pega en el WhatsApp de su cliente.
 *
 * Antes se copiaba el enlace pelado, y el entrenador tenía que explicar con sus
 * palabras qué era y qué había que hacer — cada uno a su manera, y el cliente
 * llegaba a una pantalla de «Entrar» sin saber que lo suyo era crear la cuenta.
 * Ahora se copia el mensaje entero: el enlace y los pasos, en dos líneas, con
 * los mismos verbos que va a ver al abrirlo («Crear mi cuenta», «Acepto»).
 */
export const mensajeDeInvitacion = ({ nombre, url, caduca = null, reemitir = false }) => {
  const pila = nombreDePila(nombre);
  const saludo = pila ? `${pila}, aquí` : 'Aquí';
  const hasta = caduca ? ` Vale hasta el ${fechaDelEnlace(caduca)}.` : '';

  return reemitir
    ? `${saludo} tienes tu acceso nuevo a Caveman Hub: ${url}\nAbre el enlace, crea tu cuenta otra vez y acepta: todo lo tuyo sigue ahí.${hasta}`
    : `${saludo} tienes tu acceso a Caveman Hub: ${url}\nAbre el enlace, crea tu cuenta y acepta.${hasta}`;
};
