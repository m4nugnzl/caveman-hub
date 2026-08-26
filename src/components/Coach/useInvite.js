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

      if (!created.ok) {
        setResult({ ok: false, error: created.error });
        return;
      }

      try {
        await navigator.clipboard.writeText(created.url);
        setResult({ ok: true, copied: true, name: client.name, url: created.url, reemitir });
      } catch {
        setResult({ ok: true, copied: false, name: client.name, url: created.url, reemitir });
      }
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
