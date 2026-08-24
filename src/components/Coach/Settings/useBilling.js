import { useState } from 'react';

import { supabase } from '@/lib/supabaseClient';

/**
 * Contratar un plan, cambiarlo y abrir el portal de facturación.
 *
 * Contratar y el portal terminan igual: la función devuelve una URL de Stripe y
 * aquí se navega a ella. No se abre en una pestaña nueva a propósito —los
 * bloqueadores de ventanas emergentes la matan y el usuario no se entera de que
 * ha pasado nada— y Stripe devuelve a `/ajustes/plan` al terminar.
 *
 * Cambiar de plan teniendo ya una suscripción es el tercer caso y NO navega a
 * ningún sitio: la suscripción se modifica en Stripe —que es lo único que
 * prorratea— y aquí solo vuelve un `{ cambiado }`. `contratar` lo devuelve para
 * que la pantalla lo sepa; la respuesta sin `cambiado` ni `url` sigue siendo un
 * error, como antes.
 */
export const useBilling = () => {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const call = async (body, key) => {
    setBusy(key);
    setError(null);

    const { data, error: err } = await supabase.functions.invoke('billing-checkout', { body });

    if (err) {
      /*
        Cuando la función responde con un código de error, supabase-js NO parsea el
        cuerpo: deja un «Edge Function returned a non-2xx status code», que no dice
        nada. El mensaje útil —«ese plan no tiene precio configurado», «solo quien
        creó el equipo puede»— está en la respuesta, así que se lee de ahí.
      */
      let message = 'No se ha podido conectar con el pago.';
      try {
        const body = await err.context?.json?.();
        if (body?.error) message = body.error;
      } catch {
        // La respuesta no era JSON (la función no está desplegada, o cayó antes de
        // contestar). Se queda el mensaje genérico, que para ese caso es correcto.
      }
      setBusy(null);
      setError(message);
      return;
    }

    /*
      Cambio de plan sobre una suscripción que ya existía: la función lo ha hecho
      en Stripe y no hay ninguna pantalla a la que ir. Se devuelve para que quien
      llama avise y espere al webhook, que es quien escribe el plan.
    */
    if (data?.cambiado) {
      setBusy(null);
      return { cambiado: true, baja: Boolean(data.baja) };
    }

    if (!data?.url) {
      setBusy(null);
      setError('El pago no ha devuelto ninguna dirección.');
      return;
    }

    // Sin `setBusy(null)`: la página se va a Stripe y dejar el botón «trabajando»
    // evita un segundo clic durante la redirección.
    window.location.href = data.url;
  };

  return {
    busy,
    error,
    /*
      `periodo` es 'month' o 'year' y no viaja ningún precio: el servidor elige
      la columna. Se manda siempre, también en mensual, para que la petición diga
      lo que el usuario eligió en vez de depender de un valor por defecto que
      podría cambiar al otro lado.
    */
    contratar: (plan, periodo = 'month') => call({ action: 'checkout', plan, periodo }, plan),
    abrirPortal: () => call({ action: 'portal' }, 'portal'),
  };
};
