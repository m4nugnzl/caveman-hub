import { useCallback, useState } from 'react';

import { useActions } from '@/context/AppContext';

/**
 * Generar el enlace de invitación de un cliente y dejarlo en el portapapeles.
 *
 * ── Por qué es un hook y no está escrito en cada pantalla ───────────────────
 * Porque invitar aparece en DOS sitios —la ficha de la cartera y la de
 * «Clientes»— y las tres cosas que hay que hacer bien son las mismas: pedir el
 * token al servidor, copiarlo, y tener un plan para cuando el portapapeles no
 * esté disponible. Escrito dos veces, una de las dos se queda sin el plan.
 *
 * ── El token no se enseña para copiarlo a mano ──────────────────────────────
 * Son 64 caracteres aleatorios. Transcribirlos es garantizar una errata que
 * después se manifiesta como «el enlace no funciona» sin ninguna pista. Se copia
 * automáticamente, y solo si el navegador no deja (sin HTTPS, o permiso
 * denegado) se muestra la URL entera para poder seleccionarla.
 *
 * Devuelve el resultado y no lo pinta: cada pantalla decide dónde va el aviso
 * —en la cartera es un `Notice` arriba del tablero; en «Clientes», dentro de la
 * propia ficha—.
 *
 * ── Y sirve también para REEMITIR (0083) ────────────────────────────────────
 * `send(client, { reemitir: true })` llama a la otra función —la que además
 * suelta la ficha de la cuenta que la tenía— y devuelve exactamente lo mismo.
 * Está aquí y no en un segundo hook porque lo único que cambia entre las dos es
 * qué RPC se llama: el token, el portapapeles, el plan B cuando no hay
 * portapapeles y la forma del resultado son idénticos, y duplicarlos sería
 * duplicar los tres sitios donde se puede fallar.
 */
export const useInvite = () => {
  const { createInvite, reissueAccess } = useActions();
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const send = useCallback(
    async (client, { reemitir = false } = {}) => {
      setBusy(true);
      setResult(null);

      const created = reemitir ? await reissueAccess(client.id) : await createInvite(client.id);
      setBusy(false);

      /* Y además de pintarlo arriba, se DEVUELVE: el botón que lo llamó tiene
         que saber si confirmar con un tic o volver a su sitio sin celebrar
         nada. Antes esto no devolvía nada y desde fuera un fallo del servidor
         era indistinguible de un acierto. Ver `BotonAccion`. */
      if (!created.ok) {
        const fallo = { ok: false, error: created.error };
        setResult(fallo);
        return fallo;
      }

      /*
        ── Y con tope de tiempo ──────────────────────────────────────────────
        `clipboard.writeText` no siempre falla cuando no puede: si el documento
        ha perdido el foco, la promesa se queda colgada y NO rechaza. Con eso,
        el enlace estaba creado en el servidor y la pantalla se quedaba esperando
        para siempre — con el botón sin poder pulsarse otra vez.

        Un segundo y medio es de sobra para escribir cincuenta caracteres en el
        portapapeles. Si no ha ido, se cae al camino que ya existía: enseñar la
        URL entera para poder seleccionarla a mano.
      */
      let salida;
      try {
        await Promise.race([
          navigator.clipboard.writeText(created.url),
          new Promise((_, fallar) => setTimeout(() => fallar(new Error('portapapeles sin respuesta')), 1500)),
        ]);
        salida = { ok: true, copied: true, name: client.name, url: created.url, reemitir };
      } catch {
        salida = { ok: true, copied: false, name: client.name, url: created.url, reemitir };
      }
      setResult(salida);
      return salida;
    },
    [createInvite, reissueAccess]
  );

  return { result, busy, send, clear: useCallback(() => setResult(null), []) };
};

/**
 * El texto del aviso, para que las dos pantallas digan lo mismo.
 *
 * Al reemitir se dice ADEMÁS que la cuenta anterior ha dejado de valer. No es un
 * detalle: es lo que el entrenador tiene que poder contarle a su cliente cuando
 * le mande el enlace, porque el cliente va a intentar entrar con la de siempre.
 */
export const inviteMessage = (result) => {
  const gesto = result.reemitir ? 'acceso nuevo' : 'invitación';

  if (!result.copied) {
    return `Enlace de ${gesto} de ${result.name} (cópialo a mano): ${result.url}`;
  }

  return result.reemitir
    ? `Acceso nuevo de ${result.name} copiado. Su cuenta anterior ya no vale: mándale este enlace por WhatsApp para que entre y recupere su ficha. Caduca en 14 días y sirve una sola vez.`
    : `Enlace de invitación de ${result.name} copiado. Mándaselo por WhatsApp: caduca en 14 días y sirve una sola vez.`;
};
