import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, XCircle } from 'lucide-react';

import { supabase } from '@/lib/supabaseClient';
import { Logo } from '@/components/ui/Logo';
import { Login } from '@/components/Auth/Login';

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
    const { data, error } = await supabase.rpc('claim_client_invite', { p_token: token });
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

  // En cuanto hay sesión se canjea, sin un botón intermedio: quien abre un enlace de
  // invitación e inicia sesión ya ha dicho que sí dos veces.
  useEffect(() => {
    if (session && state.status === 'idle') claim();
  }, [session, state.status, claim]);

  if (checking) {
    return (
      <div className="review-page">
        <div className="review-card">
          <p className="t-sm t-secondary">Cargando…</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <Login
        notice="Estás aceptando la invitación de tu entrenador. Crea tu cuenta o entra con la que ya tengas: al terminar, tu ficha quedará enlazada."
      />
    );
  }

  return (
    <div className="review-page">
      <div className="review-card col gap-4">
        <Logo size={34} />

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
