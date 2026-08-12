import { useCallback, useState } from 'react';

import { useApp } from '@/context/AppContext';

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
 */
export const useInvite = () => {
  const { createInvite } = useApp();
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const send = useCallback(
    async (client) => {
      setBusy(true);
      setResult(null);

      const created = await createInvite(client.id);
      setBusy(false);

      if (!created.ok) {
        setResult({ ok: false, error: created.error });
        return;
      }

      try {
        await navigator.clipboard.writeText(created.url);
        setResult({ ok: true, copied: true, name: client.name, url: created.url });
      } catch {
        setResult({ ok: true, copied: false, name: client.name, url: created.url });
      }
    },
    [createInvite]
  );

  return { result, busy, send, clear: useCallback(() => setResult(null), []) };
};

/** El texto del aviso, para que las dos pantallas digan lo mismo. */
export const inviteMessage = (result) =>
  result.copied
    ? `Enlace de invitación de ${result.name} copiado. Mándaselo por WhatsApp: caduca en 14 días y sirve una sola vez.`
    : `Enlace de invitación de ${result.name} (cópialo a mano): ${result.url}`;
