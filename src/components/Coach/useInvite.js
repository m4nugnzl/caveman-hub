import { useCallback, useEffect, useState } from 'react';

import { useActions } from '@/context/AppContext';
import { estadoDelAcceso, fechaDelEnlace, mensajeDeInvitacion } from '@/domain/acceso';

/**
 * Generar el enlace de invitación de un cliente y dejar en el portapapeles el
 * mensaje listo para su WhatsApp.
 *
 * ── Por qué es un hook y no está escrito en cada pantalla ───────────────────
 * Porque invitar aparece en cuatro sitios —la ficha, la cartera, «Por dónde
 * empezar» y la tarjeta de arranque— y las tres cosas que hay que hacer bien
 * son las mismas: pedir el token al servidor, copiarlo, y tener un plan para
 * cuando el portapapeles no esté disponible. Escrito cuatro veces, alguna se
 * queda sin el plan.
 *
 * ── Se copia el MENSAJE, no el enlace ───────────────────────────────────────
 * El enlace pelado obligaba al entrenador a explicar qué era y qué había que
 * hacer, y un entrenador nos dijo que su cliente «no entendía qué había que
 * hacer». Ahora se copia el enlace con los pasos en dos líneas
 * (`domain/acceso.mensajeDeInvitacion`): pegar y enviar.
 *
 * Son 64 caracteres aleatorios: transcribirlos es garantizar una errata. Solo
 * si el navegador no deja copiar (sin HTTPS, o permiso denegado) se enseña el
 * mensaje entero para seleccionarlo a mano.
 *
 * ── Y sirve también para REEMITIR (0083) ────────────────────────────────────
 * `send(client, { reemitir: true })` llama a la función que además suelta la
 * ficha de la cuenta que la tenía. Lo demás es idéntico.
 *
 * ── Y para GENERAR OTRA ─────────────────────────────────────────────────────
 * `send(client, { nueva: true })` anula el enlace vivo antes de crear uno: sin
 * eso `create_client_invite` devolvería el mismo (lo reutiliza a propósito).
 */
export const useInvite = () => {
  const { createInvite, revokeInvite, reissueAccess } = useActions();
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const send = useCallback(
    async (client, { reemitir = false, nueva = false } = {}) => {
      setBusy(true);
      setResult(null);

      let created;
      if (reemitir) {
        created = await reissueAccess(client.id);
      } else {
        const anulada = nueva ? await revokeInvite(client.id) : { ok: true };
        created = anulada.ok ? await createInvite(client.id) : anulada;
      }
      setBusy(false);

      /* Y además de pintarlo arriba, se DEVUELVE: el botón que lo llamó tiene
         que saber si confirmar con un tic o volver a su sitio sin celebrar
         nada. Ver `BotonAccion`. */
      if (!created.ok) {
        const fallo = { ok: false, error: created.error };
        setResult(fallo);
        return fallo;
      }

      const mensaje = mensajeDeInvitacion({
        nombre: client.name,
        url: created.url,
        caduca: created.caduca,
        reemitir,
      });

      /*
        ── Y con tope de tiempo ──────────────────────────────────────────────
        `clipboard.writeText` no siempre falla cuando no puede: si el documento
        ha perdido el foco, la promesa se queda colgada y NO rechaza. Un segundo
        y medio es de sobra; si no ha ido, se enseña el mensaje para copiarlo a
        mano.
      */
      let copied;
      try {
        await Promise.race([
          navigator.clipboard.writeText(mensaje),
          new Promise((_, fallar) => setTimeout(() => fallar(new Error('portapapeles sin respuesta')), 1500)),
        ]);
        copied = true;
      } catch {
        copied = false;
      }
      const salida = {
        ok: true,
        copied,
        name: client.name,
        url: created.url,
        caduca: created.caduca,
        mensaje,
        reemitir,
      };
      setResult(salida);
      return salida;
    },
    [createInvite, revokeInvite, reissueAccess]
  );

  return { result, busy, send, clear: useCallback(() => setResult(null), []) };
};

/**
 * En qué punto está el acceso de una ficha (`domain/acceso.estadoDelAcceso`).
 *
 * Solo pregunta si la ficha no tiene cuenta: con cuenta, la respuesta es
 * «dentro» y no hace falta leer nada. `recargar` después de invitar.
 *
 * Mientras no se sabe —o si la lectura falla— devuelve `null`, y la pantalla
 * enseña lo que ya enseñaba (el botón de invitar). No se inventa un «sin
 * invitar» que podría ser mentira.
 */
export const useAccesoDeLaFicha = (client) => {
  const { loadInvite } = useActions();
  const [invitacion, setInvitacion] = useState(undefined);
  const id = client?.id;
  const conCuenta = Boolean(client?.clientProfileId);

  const recargar = useCallback(async () => {
    if (!id || conCuenta) return;
    const leida = await loadInvite(id);
    setInvitacion(leida.ok ? leida.invite : undefined);
  }, [id, conCuenta, loadInvite]);

  useEffect(() => {
    setInvitacion(undefined);
    recargar();
  }, [recargar]);

  if (conCuenta) return { acceso: { estado: 'dentro' }, recargar };
  if (invitacion === undefined) return { acceso: null, recargar };
  return { acceso: estadoDelAcceso(client, invitacion), recargar };
};

/**
 * El texto del aviso, para que todas las pantallas digan lo mismo.
 *
 * Al reemitir se dice ADEMÁS que la cuenta anterior ha dejado de valer: el
 * cliente va a intentar entrar con la de siempre, y el mensaje que se le manda
 * ya se lo cuenta.
 */
export const inviteMessage = (result) => {
  if (!result.copied) return `Copia este mensaje y pégalo en el WhatsApp de ${result.name}:`;

  const hasta = result.caduca ? ` Vale hasta el ${fechaDelEnlace(result.caduca)} y sirve una vez.` : '';
  return result.reemitir
    ? `Mensaje con su acceso nuevo copiado: pégalo en el WhatsApp de ${result.name}. Su cuenta anterior ya no vale.${hasta}`
    : `Mensaje con su enlace copiado: pégalo en el WhatsApp de ${result.name}.${hasta}`;
};
