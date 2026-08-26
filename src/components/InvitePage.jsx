import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

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
  /* `null` mientras no se sabe: es lo que evita enseñar el botón de aceptar un
     instante antes de descubrir que quien mira es el entrenador. */
  const [esEntrenador, setEsEntrenador] = useState(null);

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

  /*
    ══ ¿Está mirando esto un entrenador? ═════════════════════════════════════

    Porque si lo está y pulsa «Acepto», su cuenta DEJA DE SER la suya: el canje
    termina con `UPDATE profiles SET role = 'client'` sobre quien llama, y a
    partir de la siguiente recarga entra en el portal del cliente con sus fichas
    fuera de la vista. Probar el enlace que acabas de generar es lo que hace todo
    el mundo al montar la asesoría, así que este no es un camino raro.

    ── Por qué no se mira `profiles.role` ────────────────────────────────────
    Porque no distingue nada: `handle_new_user` da `'coach'` a TODO el que se
    registra —el rol de cliente lo pone el canje—, así que en esa columna un
    cliente recién registrado y un entrenador con veinte fichas son iguales.

    Se pregunta por hechos, y las dos consultas son las dos formas de tenerlos:

      · fichas a su nombre — un cliente recién registrado tiene cero;
      · poder LEER esta invitación — la política `invites_coach_read` solo se la
        enseña al entrenador del cliente invitado, así que una fila aquí
        significa «este enlace es de un cliente tuyo». Cubre al entrenador que
        todavía no tiene ninguna otra ficha, que es justo quien está probando.

    Esto es el aviso, no la cerradura: la de verdad es la guarda de
    `claim_client_invite` (migración 0084), porque esta se salta abriendo las
    herramientas de desarrollo y lo que hay al otro lado es una cuenta rota.
  */
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) {
      setEsEntrenador(null);
      return undefined;
    }

    let alive = true;
    Promise.all([
      supabase.from('clients').select('id').eq('coach_id', uid).limit(1),
      supabase.from('client_invites').select('id').eq('token', token).limit(1),
    ]).then(([fichas, propia]) => {
      if (!alive) return;
      /* Si alguna consulta falla se sigue adelante: quedarse bloqueado dejaría
         fuera al cliente legítimo por un fallo de red, y la base sigue siendo
         quien decide. */
      setEsEntrenador((fichas.data?.length || 0) > 0 || (propia.data?.length || 0) > 0);
    });

    return () => {
      alive = false;
    };
  }, [session, token]);

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

  /*
    Con sesión iniciada pero sin saber todavía de quién es, se espera. Enseñar el
    botón y retirarlo medio segundo después sería peor que tardar medio segundo.
  */
  if (esEntrenador === null) {
    return (
      <div className="review-page">
        <div className="review-card">
          <Loading />
        </div>
      </div>
    );
  }

  /*
    Un callejón sin salida a propósito: aquí NO hay botón de aceptar. El gesto que
    se ofrece es el que resuelve de verdad —salir— y el enlace queda intacto para
    que lo abra quien tiene que abrirlo.
  */
  if (esEntrenador) {
    return (
      <div className="review-page">
        <div className="review-card col gap-4">
          <Logo size={34} />
          <div className="row gap-3">
            <AlertTriangle size={22} color="var(--negative)" />
            <div className="col gap-1">
              <h2>Este enlace no es para ti</h2>
              <p className="t-sm t-secondary">
                Estás dentro con tu cuenta de entrenador
                {session?.user?.email ? ` (${session.user.email})` : ''}. Si aceptaras esta
                invitación, esa cuenta pasaría a ser la del cliente y perderías de vista tu
                cartera.
              </p>
            </div>
          </div>
          <p className="t-sm t-secondary">
            El enlace sigue sirviendo. Mándaselo a tu cliente, o ábrelo en una ventana privada
            si lo que quieres es ver por dónde entra él.
          </p>
          <button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={() => window.location.replace('/')}
          >
            Volver a mis clientes
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-lg"
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.reload();
            }}
          >
            Cerrar sesión y entrar como cliente
          </button>
        </div>
      </div>
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
