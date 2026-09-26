import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

import { supabase } from '@/lib/supabaseClient';
import { olvidarInvitacion, recordarInvitacion } from '@/lib/invitacionPendiente';
import { navegadorDeFuera, navegadorIntegrado } from '@/lib/navegadorIntegrado';
import { fechaDelEnlace } from '@/domain/acceso';
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
 * series, subir sus fotos. Esta pantalla es la única que lo rellena.
 *
 * ══ El orden importa ═══════════════════════════════════════════════════════
 *
 * Primero la cuenta, después el canje. El token no crea la sesión: identifica la
 * ficha. Hacen falta las dos cosas —recibir el enlace y tener cuenta— y eso es
 * deliberado: si bastara el email, cualquiera que conozca la dirección de un
 * cliente podría registrarse con ella y heredar su ficha, su historial y sus fotos.
 *
 * ══ Y antes de la cuenta, el enlace (0148) ═════════════════════════════════
 *
 * La pantalla no sabía nada del enlace hasta después de crear la cuenta: el
 * cliente se registraba, aceptaba y DESPUÉS leía «ha caducado», con una cuenta
 * vacía ya creada. Ahora lo primero es `leer_invitacion`, que se puede llamar
 * sin sesión, y cada estado tiene su pantalla:
 *
 *   · valida    → crear la cuenta (o entrar), el consentimiento y el canje.
 *   · tuya      → ya es su ficha: directo a su portal, sin error.
 *   · caducada, anulada, usada, enlazada, no_existe → qué pasó y qué hacer,
 *                 ANTES de pedir ninguna cuenta.
 *   · bloqueo   → quien mira es un entrenador: aquí no se acepta nada.
 *
 * Si la función no está (la 0148 sin aplicar) o la red falla, `desconocido`:
 * la pantalla hace lo de antes y la base sigue decidiendo al canjear.
 */

const PORTAL = '/mi/rutina';
/* Los estados en los que este enlace ya no va a enlazar nada. */
const NO_SIRVE = ['no_existe', 'caducada', 'anulada', 'usada', 'enlazada'];
/* Los del entrenador: la guarda de la base (`motivo_para_no_canjear`). */
const DE_ENTRENADOR = ['propia', 'entrenador', 'equipo'];

const mayuscula = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1);

const cerrarSesion = async () => {
  await supabase.auth.signOut();
  window.location.reload();
};

const Pagina = ({ children }) => (
  <div className="review-page">
    <div className="review-card col gap-4">
      <Logo />
      {children}
    </div>
  </div>
);

const Cargando = ({ label }) => (
  <div className="review-page">
    <div className="review-card">
      <Loading label={label} />
    </div>
  </div>
);

/** El icono, el titular y lo que pasa, en una fila: la cabecera de cada estado. */
const Veredicto = ({ icono: Icono, color, titulo, children }) => (
  <div className="row gap-3">
    <Icono size={22} color={color} style={{ flexShrink: 0 }} />
    <div className="col gap-1">
      <h2>{titulo}</h2>
      {children && <p className="t-sm t-secondary">{children}</p>}
    </div>
  </div>
);

/**
 * El enlace ya no sirve. Se dice ANTES de pedir una cuenta, con quién hablar y,
 * cuando es probable que sea suyo (usado, o la ficha ya tiene cuenta), con la
 * puerta para entrar con la que ya tiene.
 */
const EnlaceQueNoSirve = ({ lectura, email, onEntrar }) => {
  const quien = lectura.entrenador || 'tu entrenador';
  const { titulo, texto, entrar } = {
    no_existe: {
      titulo: 'Este enlace no funciona',
      texto: 'Puede que se cortara al copiarlo. Pídele a tu entrenador que te lo mande otra vez.',
    },
    caducada: {
      titulo: `Este enlace caducó el ${fechaDelEnlace(lectura.caduca)}`,
      texto: `Pídele a ${quien} uno nuevo: lo genera en un momento.`,
    },
    anulada: {
      titulo: 'Este enlace ya no vale',
      texto: `${mayuscula(quien)} generó uno nuevo. Búscalo en tu WhatsApp o pídeselo.`,
    },
    usada: {
      titulo: 'Este enlace ya se usó',
      texto: `Si fuiste tú, entra con la cuenta que creaste. Si no, pídele a ${quien} uno nuevo.`,
      entrar: true,
    },
    enlazada: {
      titulo: 'Tu ficha ya tiene cuenta',
      texto: `Si es tuya, entra con ella. Si la perdiste, pídele a ${quien} un acceso nuevo.`,
      entrar: true,
    },
  }[lectura.estado];

  return (
    <Pagina>
      <Veredicto icono={XCircle} color="var(--negative)" titulo={titulo}>
        {texto}
      </Veredicto>

      {/* Con sesión, es OTRA cuenta (si fuera la suya, el estado sería «tuya»). */}
      {entrar && email && (
        <p className="t-sm t-secondary">
          Ahora estás dentro con <strong>{email}</strong>.
        </p>
      )}
      {entrar && (
        <button type="button" className="btn btn-primary btn-lg" onClick={email ? cerrarSesion : onEntrar}>
          {email ? 'Cerrar sesión y entrar con otra' : 'Entrar con mi cuenta'}
        </button>
      )}
    </Pagina>
  );
};

/*
  ══ Quien mira es un entrenador ═══════════════════════════════════════════

  Si pulsara «Acepto», su cuenta DEJARÍA DE SER la suya: el canje termina con
  `profiles.role = 'client'` sobre quien llama. Probar el enlace que acabas de
  generar es lo que hace todo el mundo al montar la asesoría.

  Un callejón sin salida a propósito: aquí NO hay botón de aceptar. Lo decide
  la misma guarda que el canje (`motivo_para_no_canjear`, 0148), así que lo que
  se ve aquí es lo que la base haría.
*/
const NoEsParaTi = ({ motivo, email }) => (
  <Pagina>
    <Veredicto
      icono={AlertTriangle}
      color="var(--negative)"
      titulo={motivo === 'propia' ? 'Este enlace no es para ti' : 'Estás dentro con una cuenta de entrenador'}
    >
      {motivo === 'propia' ? (
        <>
          Es la invitación de tu cliente, y estás dentro con tu cuenta de entrenador
          {email ? ` (${email})` : ''}. Si la aceptaras, tu cuenta pasaría a ser la suya y perderías de
          vista tu cartera.
        </>
      ) : (
        <>
          Esta invitación es para un cliente, y {email ? <strong>{email}</strong> : 'esta cuenta'} ya
          trabaja como entrenador. Cierra sesión y crea la cuenta del cliente con otro correo.
        </>
      )}
    </Veredicto>
    {motivo === 'propia' && (
      <p className="t-sm t-secondary">
        El enlace sigue sirviendo. Mándaselo a tu cliente, o ábrelo en una ventana privada para ver por
        dónde entra.
      </p>
    )}
    <button type="button" className="btn btn-primary btn-lg" onClick={() => window.location.replace('/')}>
      Volver a mis clientes
    </button>
    <button type="button" className="btn btn-secondary btn-lg" onClick={cerrarSesion}>
      Cerrar sesión y entrar como cliente
    </button>
  </Pagina>
);

/**
 * «Todo listo», y lo que va a necesitar mañana.
 *
 * El cliente suele terminar dentro del navegador de WhatsApp: la sesión se queda
 * ahí, y mañana abrirá Safari y no estará dentro, ni sabrá dónde era ni con qué
 * correo entró. Dos líneas: dónde y con qué, y cómo tenerla a mano.
 */
const TodoListo = ({ nombre, session, accesoNuevo }) => {
  const [copiada, setCopiada] = useState(false);
  const { integrado, app } = navegadorIntegrado();
  const host = window.location.host;
  const email = session?.user?.email;
  const conGoogle = session?.user?.app_metadata?.provider === 'google';
  const pila = nombre ? String(nombre).trim().split(/\s+/)[0] : '';

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/entrar`);
      setCopiada(true);
    } catch {
      setCopiada(false);
    }
  };

  return (
    <Pagina>
      <Veredicto icono={CheckCircle2} color="var(--positive)" titulo={`Todo listo${pila ? `, ${pila}` : ''}`}>
        {accesoNuevo ? 'Tu ficha vuelve a ser tuya, con todo tu historial.' : 'Tu cuenta ya está enlazada.'}
      </Veredicto>

      <div className="col gap-2 t-sm t-secondary">
        {email && (
          <p>
            La próxima vez, entra en <strong>{host}</strong> {conGoogle ? 'con Google' : 'con'}{' '}
            <strong>{email}</strong>.
          </p>
        )}
        <p>
          {integrado
            ? `Estás dentro de ${app || 'otra app'}: abre ${host} en ${navegadorDeFuera()} y añádela a la pantalla de inicio para tenerla a mano.`
            : 'Añádela a la pantalla de inicio desde el menú del navegador para tenerla a mano.'}
        </p>
      </div>

      {integrado && (
        <button type="button" className="btn btn-secondary btn-lg" onClick={copiar}>
          {copiada ? 'Dirección copiada' : 'Copiar la dirección'}
        </button>
      )}
      {/*
        Recarga completa y no `navigate`: el rol del perfil ha cambiado a
        'client' en la base de datos, y es en el arranque cuando la aplicación
        lo lee para decidir qué cargar.
      */}
      <button type="button" className="btn btn-primary btn-lg" onClick={() => window.location.replace(PORTAL)}>
        Entrar
      </button>
    </Pagina>
  );
};

export const InvitePage = () => {
  const { token } = useParams();
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  /* Lo que dice la base del enlace; `null` mientras se pregunta. Es lo que
     evita enseñar un formulario un instante antes de saber que no sirve. */
  const [lectura, setLectura] = useState(null);
  const [state, setState] = useState({ status: 'idle' });
  const [accepted, setAccepted] = useState(false);
  /* «Entrar con mi cuenta» desde un enlace usado: el login, en «Entrar». */
  const [conMiCuenta, setConMiCuenta] = useState(false);

  /* La red de seguridad: si el correo de confirmación o una pestaña cerrada le
     devuelven a la raíz, `App` le trae aquí. Ver `lib/invitacionPendiente`. */
  useEffect(() => {
    recordarInvitacion(token);
  }, [token]);

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

  /* Se vuelve a leer al cambiar de cuenta: con sesión, la misma invitación
     puede ser «tuya» o traer un bloqueo de entrenador. */
  const uid = session?.user?.id || null;
  useEffect(() => {
    if (checking) return undefined;
    let alive = true;
    setLectura(null);
    supabase.rpc('leer_invitacion', { p_token: token }).then(({ data, error }) => {
      if (!alive) return;
      setLectura(error || !data ? { estado: 'desconocido' } : data);
    });
    return () => {
      alive = false;
    };
  }, [checking, uid, token]);

  /* Lo que ya no va a enlazar nada deja de estar pendiente, y lo suyo va a su portal. */
  useEffect(() => {
    if (!lectura) return;
    if (lectura.estado === 'tuya') {
      olvidarInvitacion(token);
      window.location.replace(PORTAL);
    } else if (NO_SIRVE.includes(lectura.estado) || lectura.bloqueo) {
      olvidarInvitacion(token);
    }
  }, [lectura, token]);

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
      /* La guarda de la base habló aunque la lectura no lo viera venir (o no
         estuviera): la misma pantalla de «no es para ti». */
      if (DE_ENTRENADOR.includes(error.hint)) {
        olvidarInvitacion(token);
        setLectura((l) => ({ ...l, bloqueo: error.hint }));
        setState({ status: 'idle' });
        return;
      }
      /* Los mensajes de la base están escritos para leerse y cada uno dice qué
         hacer (0148). Sin código suele ser la red: se dice así y se reintenta. */
      const sinRed = !error.hint && /fetch|network|load failed/i.test(error.message || '');
      setState({
        status: 'error',
        codigo: error.hint || null,
        message: sinRed ? 'No se ha podido conectar. Comprueba la conexión y vuelve a intentarlo.' : error.message,
      });
      return;
    }
    olvidarInvitacion(token);
    setState({ status: 'done', name: data });
  }, [token]);

  if (checking || !lectura || lectura.estado === 'tuya') {
    return <Cargando label={lectura?.estado === 'tuya' ? 'Entrando…' : undefined} />;
  }

  const email = session?.user?.email || null;

  if (NO_SIRVE.includes(lectura.estado) && !(conMiCuenta && !session)) {
    return <EnlaceQueNoSirve lectura={lectura} email={email} onEntrar={() => setConMiCuenta(true)} />;
  }

  if (!session) {
    return (
      <Login
        invitacion={{
          entrenador: lectura.entrenador || null,
          cliente: lectura.cliente || null,
          accesoNuevo: Boolean(lectura.acceso_nuevo),
          modo: conMiCuenta ? 'login' : null,
        }}
        /*
          Volver AQUÍ, con el token puesto: después de Google y después de
          confirmar el correo. Volviendo a la raíz, esta persona acabaría dentro
          con una cuenta nueva y sin enlazar a su ficha.
        */
        destino={window.location.href.split('#')[0]}
      />
    );
  }

  if (lectura.bloqueo) return <NoEsParaTi motivo={lectura.bloqueo} email={email} />;

  if (state.status === 'done') {
    return <TodoListo nombre={state.name} session={session} accesoNuevo={Boolean(lectura.acceso_nuevo)} />;
  }

  /*
    ── Antes esto se canjeaba solo, y ya no ──────────────────────────────────
    Esta aplicación trata peso, pliegues y fotos del cuerpo, y eso necesita un sí
    explícito e informado, no uno deducido de dos clics anteriores. Así que hay un
    paso más, y es el único sitio donde lo hay.
  */
  return (
    <Pagina>
      {state.status !== 'error' && (
        <>
          <div className="col gap-1">
            <h2>{lectura.cliente ? `${lectura.cliente}, antes de entrar` : 'Antes de entrar'}</h2>
            <p className="t-sm t-secondary">Esto es lo que se guarda de ti y quién puede verlo.</p>
          </div>

          <ConsentNotice checked={accepted} onChange={setAccepted} />

          {/*
            El botón está apagado hasta que se marca la casilla, en vez de dejarlo
            activo y avisar al pulsarlo: uno que no deja pulsar dice dónde está el
            paso que queda.
          */}
          <button
            type="button"
            className="btn btn-primary btn-lg"
            disabled={!accepted || state.status === 'claiming'}
            onClick={claim}
          >
            {state.status === 'claiming' ? 'Enlazando tu cuenta…' : 'Acepto y entro'}
          </button>
        </>
      )}

      {state.status === 'error' && (
        <>
          <Veredicto icono={XCircle} color="var(--negative)" titulo="No se ha podido aceptar">
            {state.message}
          </Veredicto>
          {['usada', 'ficha_enlazada', 'cuenta_enlazada'].includes(state.codigo) && (
            <>
              <p className="t-sm t-secondary">
                Ahora estás dentro con <strong>{email}</strong>.
              </p>
              <button type="button" className="btn btn-primary btn-lg" onClick={cerrarSesion}>
                Cerrar sesión
              </button>
            </>
          )}
          {!state.codigo && (
            <button type="button" className="btn btn-primary btn-lg" onClick={claim}>
              Volver a intentarlo
            </button>
          )}
        </>
      )}
    </Pagina>
  );
};
