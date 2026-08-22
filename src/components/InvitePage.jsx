import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, XCircle } from 'lucide-react';

import { supabase } from '@/lib/supabaseClient';
import { Logo } from '@/components/ui/Logo';
import { Loading } from '@/components/ui/primitives';
import { Login } from '@/components/Auth/Login';
import { CONSENT_VERSION, ConsentNotice } from '@/components/Auth/ConsentNotice';

/**
 * `/invitacion/<token>` — la puerta de entrada del cliente.
 *
 * ══ Por qué esta pantalla es la que faltaba ════════════════════════════════
 *
 * `clients.client_profile_id` es lo que enlaza una ficha con una cuenta, y de ahí
 * salen TODOS los permisos del portal del cliente: leer su rutina, registrar sus
 * series, subir sus fotos. Esa columna existía desde el principio y no había ninguna
 * pantalla para rellenarla, así que el portal completo estaba construido y era
 * inalcanzable salvo escribiendo un uuid a mano en el panel de Supabase.
 *
 * ══ El orden importa ═══════════════════════════════════════════════════════
 *
 * Primero la cuenta, después el canje. El token no crea la sesión: identifica la
 * ficha. Hacen falta las dos cosas —recibir el enlace y tener cuenta— y eso es
 * deliberado: si bastara el email, cualquiera que conozca la dirección de un cliente
 * podría registrarse con ella y heredar su ficha, su historial y sus fotos.
 *
 * Así que sin sesión se muestra el login de siempre, con una nota de a qué se está
 * entrando. Con sesión, se canjea y se recarga en el portal.
 */
export const InvitePage = () => {
  const { token } = useParams();
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [state, setState] = useState({ status: 'idle' });
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const claim = useCallback(async () => {
    setState({ status: 'claiming' });
    /*
      Los dos argumentos van juntos y no por casualidad: la función que acepta la
      versión del consentimiento es la única que `authenticated` puede ejecutar
      (`0018_client_consent.sql`). Enlazar la cuenta sin dejar constancia no es que
      esté desaconsejado: no se puede.
    */
    const { data, error } = await supabase.rpc('claim_client_invite', {
      p_token: token,
      p_consent_version: CONSENT_VERSION,
    });
    if (error) {
      // Los mensajes vienen de la función y están escritos para leerse: «ha
      // caducado», «ya se ha usado», «ya está enlazada a otra cuenta». Se muestran
      // tal cual en vez de un «error» genérico, porque cada uno se resuelve de una
      // forma distinta y el cliente tiene que saber cuál.
      setState({ status: 'error', message: error.message });
      return;
    }
    setState({ status: 'done', name: data });
  }, [token]);

  /*
    ── Antes esto se canjeaba solo, y ya no ──────────────────────────────────
    El razonamiento era que quien abre un enlace de invitación y se registra ya ha
    dicho que sí dos veces. Es verdad para el enlace, y no vale para lo que se
    guarda detrás: esta aplicación trata peso, pliegues y fotos del cuerpo, y eso
    necesita un sí explícito e informado, no uno deducido de dos clics anteriores.

    Así que hay un paso más, y es el único sitio donde lo hay.
  */

  if (checking) {
    return (
      <div className="review-page">
        <div className="review-card">
          <Loading />
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <Login
        notice="Estás aceptando la invitación de tu entrenador. Crea tu cuenta o entra con la que ya tengas: al terminar, tu ficha quedará enlazada."
        /*
          Volver AQUÍ, con el token puesto. Entrar con Google se va a otra página
          y vuelve a donde se le diga; si se le dijera la raíz, esta persona
          acabaría dentro de la aplicación con una cuenta nueva y sin enlazar a
          su ficha, y el enlace de invitación ya estaría gastado en la barra de
          direcciones de nadie. Con el formulario de correo no hace falta porque
          nunca se sale de la página.
        */
        destino={window.location.href}
      />
    );
  }

  return (
    <div className="review-page">
      <div className="review-card col gap-4">
        <Logo size={34} />

        {state.status === 'idle' && (
          <>
            <div className="col gap-1">
              <h2>Antes de entrar</h2>
              <p className="t-sm t-secondary">
                Esto es lo que se guarda de ti y quién puede verlo. Léelo con calma: sin tu permiso
                no se enlaza nada.
              </p>
            </div>

            <ConsentNotice checked={accepted} onChange={setAccepted} />

            {/*
              El botón está apagado hasta que se marca la casilla, en vez de dejarlo
              activo y avisar al pulsarlo. Un error que se explica después obliga a
              volver a leer para encontrar qué faltaba; uno que no deja pulsar dice
              dónde está el paso que queda.
            */}
            <button
              type="button"
              className="btn btn-primary btn-lg"
              disabled={!accepted}
              onClick={claim}
            >
              Acepto y entro
            </button>
          </>
        )}

        {state.status === 'claiming' && <p className="t-sm t-secondary">Enlazando tu cuenta…</p>}

        {state.status === 'done' && (
          <>
            <div className="row gap-3">
              <CheckCircle2 size={22} color="var(--positive)" />
              <div className="col gap-1">
                <h2>Todo listo{state.name ? `, ${String(state.name).split(' ')[0]}` : ''}</h2>
                <p className="t-sm t-secondary">
                  Tu cuenta ya está enlazada. Aquí tienes tu rutina, tu dieta y tus check-ins.
                </p>
              </div>
            </div>
            {/*
              Recarga completa y no `navigate`: el rol del perfil ha cambiado a
              'client' en la base de datos, y es en el arranque cuando la aplicación
              lo lee para decidir qué cargar. Navegar dejaría la sesión con el rol
              anterior en memoria y el portal vacío.
            */}
            <button type="button" className="btn btn-primary btn-lg" onClick={() => window.location.replace('/mi/rutina')}>
              Entrar
            </button>
          </>
        )}

        {state.status === 'error' && (
          <>
            <div className="row gap-3">
              <XCircle size={22} color="var(--negative)" />
              <div className="col gap-1">
                <h2>No se ha podido aceptar</h2>
                <p className="t-sm t-secondary">{state.message}</p>
              </div>
            </div>
            <p className="t-xs t-tertiary">
              Escríbele a tu entrenador para que te mande un enlace nuevo.
            </p>
          </>
        )}
      </div>
    </div>
  );
};
