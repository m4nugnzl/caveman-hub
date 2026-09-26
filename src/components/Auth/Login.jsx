import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { supabase } from '@/lib/supabaseClient';
import { MIN_PASSWORD, traduceAuthError } from '@/lib/authErrors';
import { navegadorDeFuera, navegadorIntegrado } from '@/lib/navegadorIntegrado';
import { RESET_PATH } from '@/routes';
import { Field, Notice, Panel, SegmentedControl } from '@/components/ui/primitives';
import { Acceso } from '@/components/Auth/Acceso';
import { BrandMark } from '@/components/ui/BrandMark';

/**
 * Lo que dice cada modo en la cabecera de la tarjeta.
 *
 * En una tabla y no en tres ternarios repartidos por el JSX: son tres cadenas
 * por modo —título, pie y botón— y con ternarios sueltos es donde se queda uno
 * sin cambiar el día que se añade un cuarto estado.
 */
const VOZ = {
  login: {
    titulo: 'Entrar',
    pie: 'Con la cuenta que ya tienes.',
    boton: 'Entrar',
  },
  signup: {
    titulo: 'Crear tu cuenta',
    pie: 'Tres clientes gratis, sin tarjeta y sin límite de tiempo.',
    boton: 'Crear cuenta de entrenador',
  },
  reset: {
    titulo: 'Recuperar el acceso',
    pie: 'Te mandamos un enlace para elegir otra contraseña.',
    boton: 'Enviar enlace',
  },
};

/**
 * Lo mismo, cuando quien llega es el CLIENTE con el enlace de su entrenador.
 *
 * Esta pantalla le hablaba como a un entrenador: el botón decía «Crear cuenta
 * de entrenador», el pie «tres clientes gratis» y la letra pequeña le pedía que
 * no se creara la cuenta «aquí», justo en el enlace que su entrenador le mandó.
 * Y arrancaba en «Entrar», cuando casi todos llegan sin cuenta.
 */
const vozDeLaInvitacion = (entrenador) => ({
  login: {
    pie: 'Con la cuenta que ya tengas en Caveman Hub.',
    boton: 'Entrar',
  },
  signup: {
    pie: `Gratis para ti: la paga ${entrenador || 'tu entrenador'}.`,
    boton: 'Crear mi cuenta',
  },
  reset: VOZ.reset,
});

/*
  ══ El enlace del correo que ya no vale ════════════════════════════════════

  Supabase devuelve a `redirectTo` con el error en la dirección
  (`#error_code=otp_expired…`) cuando el enlace de confirmación caducó o ya se
  usó — pasa mucho: hay gestores de correo que lo abren solos para revisarlo, y
  cuando la persona lo pulsa ya está gastado. Sin leerlo, llegaba a un
  formulario vacío sin saber si su cuenta existía. Casi siempre existe y está
  confirmada: lo que toca es entrar con la contraseña.
*/
const errorDelEnlace = () => {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(
    `${window.location.search.slice(1)}&${window.location.hash.replace(/^#/, '')}`
  );
  const codigo = params.get('error_code');
  if (!codigo && !params.get('error')) return null;
  /* Un acceso con Google cancelado o rechazado vuelve igual, con otro código:
     ese no es «el enlace del correo», y decírselo sería mandarle a buscarlo. */
  if (codigo === 'otp_expired' || /link/i.test(params.get('error_description') || '')) {
    return 'Ese enlace del correo ya no vale: caduca y solo sirve una vez. Si ya lo habías pulsado, tu cuenta está lista: entra con tu correo y tu contraseña.';
  }
  return null;
};

/**
 * @param invitacion  Quien llega por el enlace de su entrenador:
 *   `{ entrenador, cliente, accesoNuevo, modo }` (lo que devuelve
 *   `leer_invitacion`, 0148). Con ella la pantalla le habla al cliente, arranca
 *   en «Crear cuenta» —o en `modo`— y el correo de confirmación vuelve al enlace.
 * @param destino  A dónde vuelve el navegador después de pasar por Google.
 *
 *   Por defecto, la raíz. Y la página de invitación pasa la SUYA, que es lo
 *   único que hace falta saber aquí: el enlace de invitación lleva el token
 *   dentro de la dirección (`/invitacion/<token>`), así que volver a la raíz
 *   dejaría a esa persona dentro de la aplicación con una cuenta nueva y sin
 *   enlazar a su ficha — que es exactamente el fallo que esa pantalla existe
 *   para evitar. Con el formulario de siempre no pasaba porque nunca se sale de
 *   la página: la sesión cambia y la invitación sigue ahí.
 */
export const Login = ({ invitacion = null, destino = null }) => {
  /*
    Tres modos y no dos. «Recuperar» no es una pantalla aparte porque es el mismo
    formulario con un campo menos: quien está aquí ya ha escrito su email y ha
    fallado la contraseña, así que sacarle a otra página le haría teclearlo otra vez.

    Con `?alta=1` se entra directamente al registro. Lo usa el botón «Empezar
    gratis» de la portada: quien viene de ahí ya ha decidido crearse la cuenta y
    hacerle pulsar «¿No tienes cuenta?» sería un paso más entre la decisión y el
    formulario.
  */
  const [params] = useSearchParams();
  /* El enlace del correo caducado manda a «Entrar»: la cuenta ya existe. */
  const [enlaceCaducado] = useState(errorDelEnlace);
  const [mode, setMode] = useState(() => {
    if (enlaceCaducado) return 'login';
    if (invitacion) return invitacion.modo || 'signup';
    return params.get('alta') ? 'signup' : 'login';
  });
  /* El nombre de pila de la ficha, ya puesto: es el suyo, y lo puede cambiar. */
  const [form, setForm] = useState({ email: '', password: '', name: invitacion?.cliente || '' });
  const [error, setError] = useState(enlaceCaducado);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const { integrado, app } = navegadorIntegrado();

  /* Fuera de WhatsApp, lo que se abre es ESTA dirección (con el token dentro
     cuando se llega por invitación). */
  const copiarEnlace = async () => {
    try {
      await navigator.clipboard.writeText(destino || window.location.href);
      setCopiado(true);
    } catch {
      setCopiado(false);
      setError(`No se ha podido copiar. Abre el menú de ${app || 'esta app'} y elige «Abrir en ${navegadorDeFuera()}».`);
    }
  };

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  const go = (next) => {
    setMode(next);
    setError(null);
    setInfo(null);
  };

  /*
    ══ Entrar con Google ══════════════════════════════════════════════════════

    Un solo camino para las dos cosas, y por eso el botón dice «continuar» y no
    «entrar» ni «registrarse»: en OAuth no hay alta y acceso, hay una identidad
    que se presenta. Si es la primera vez, Supabase crea la cuenta y el
    disparador `handle_new_user` le pone el rol; si no, entra. El mismo botón
    vale en las dos pestañas y no hace falta explicar cuál pulsar.

    ── Lo que NO se apaga al terminar ─────────────────────────────────────────
    `busy`. Cuando la llamada va bien, el navegador se va a Google: apagarlo
    dejaría el formulario despertándose durante el medio segundo que tarda en
    irse, y eso se lee como que el clic no ha hecho nada. Solo se apaga en el
    fallo, que es cuando esta pantalla sigue viva.
  */
  const conGoogle = async () => {
    setError(null);
    setInfo(null);
    setBusy(true);

    try {
      const { error: err } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        /*
          `href` y no `origin`: la dirección ENTERA, con su ruta y sus
          parámetros.

          Con `origin` se volvía siempre a la raíz, así que quien salía de
          `/ajustes/plan?contratar=pro` para entrar con Google volvía a la
          portada y perdía por el camino lo que venía a hacer. Y no solo eso:
          también perdía la pantalla concreta que estaba mirando cuando le
          caducó la sesión, que es el caso que `App` se toma la molestia de
          preservar para el acceso con contraseña.

          `destino` sigue mandando cuando lo hay: la invitación de un cliente
          lleva su token dentro y esa sí es una dirección distinta de esta.

          Requiere que el origen esté en *Authentication → URL Configuration →
          Redirect URLs* de Supabase, con `/**` al final para que acepte rutas.
          Si no está, Supabase no falla: **devuelve al «Site URL» del proyecto**,
          que es el dominio desplegado. Desde local, eso se ve como que entrar
          con Google te saca de la aplicación que estabas probando.
        */
        options: { redirectTo: destino || window.location.href },
      });
      if (err) {
        setError(traduceAuthError(err.message));
        setBusy(false);
      }
    } catch (e) {
      setError(e?.message || 'No se pudo conectar. Comprueba tu conexión.');
      setBusy(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setInfo(null);

    if (mode === 'signup' && form.password.length < MIN_PASSWORD) {
      setError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
      return;
    }

    setBusy(true);
    try {
      if (mode === 'login') {
        const { error: err } = await supabase.auth.signInWithPassword({
          email: form.email.trim(),
          password: form.password,
        });
        if (err) setError(traduceAuthError(err.message));
      } else if (mode === 'reset') {
        const { error: err } = await supabase.auth.resetPasswordForEmail(form.email.trim(), {
          redirectTo: `${window.location.origin}${RESET_PATH}`,
        });
        if (err) setError(traduceAuthError(err.message));
        /*
          El mismo mensaje exista o no la cuenta, y a propósito.
          ------------------------------------------------------------------
          Decir «no hay ninguna cuenta con ese email» convierte esta pantalla en
          un comprobador de direcciones: cualquiera puede averiguar quién está
          dado de alta probando emails, uno por uno y sin límite. Es el mismo
          motivo por el que la API de Supabase tampoco lo distingue.
        */
        /*
          Y la segunda frase dice qué hacer cuando NO llegue, porque pasa: el
          correo sale por el SMTP compartido de Supabase, que va limitado por horas
          para todo el proyecto y ni siquiera avisa cuando se traga un envío
          (`docs/correo-transaccional.md`). Sin esta línea, quien se queda fuera
          vuelve a pulsar «enviar enlace» hasta cansarse. La salida que sí funciona
          es su entrenador: desde la ficha puede emitirle un acceso nuevo sin correo
          de por medio (migración 0083).
        */
        else
          setInfo(
            'Si hay una cuenta con ese email, te llega un enlace para elegir contraseña nueva. Revisa también la carpeta de spam. Y si eres cliente de un entrenador y no te llega, escríbele: puede darte un enlace de acceso nuevo al momento.'
          );
      } else {
        // El rol 'coach' lo asigna el trigger handle_new_user a TODO el que se
        // registra; el de cliente lo pone el canje de la invitación.
        const { data, error: err } = await supabase.auth.signUp({
          email: form.email.trim(),
          password: form.password,
          options: {
            /*
              `invitacion` no decide nada en la base: lo lee la plantilla del
              correo de confirmación (`supabase/templates/confirmar-registro.html`)
              para no decirle a un cliente «has creado una cuenta de entrenador».
            */
            data: invitacion
              ? { name: form.name.trim(), invitacion: true, entrenador: invitacion.entrenador || '' }
              : { name: form.name.trim() },
            /*
              Sin esto, el enlace de confirmación apunta a la «Site URL» del panel
              de Supabase, que en un despliegue nuevo apunta a `localhost`.

              Y con invitación, a la INVITACIÓN (`destino`), no a la raíz: el
              token solo vive en esa dirección. Confirmando hacia la raíz, el
              cliente aterrizaba con una cuenta de entrenador vacía, sin pasar por
              el consentimiento y con su ficha sin enlazar. Si Supabase no admite
              la dirección (Redirect URLs), vuelve a la raíz igualmente: para eso
              está la red de `lib/invitacionPendiente`.
            */
            emailRedirectTo: destino || window.location.origin,
          },
        });

        if (err) setError(traduceAuthError(err.message));
        /*
          ══ Qué pasó de verdad, en vez de dar por hecho que hay correo ═══════

          Esto decía siempre «revisa tu correo para confirmar el registro», y era
          mentira la mitad de las veces: **si la confirmación por email está
          desactivada en Supabase, `signUp` devuelve SESIÓN y no se envía ningún
          correo**. La cuenta queda lista y la persona se va a mirar una bandeja
          donde no va a llegar nada. Pasó de verdad, y el rato que se pierde
          esperando ese correo es justo el rato en el que se decide no volver.

          `data.session` distingue los dos casos sin preguntarle nada a nadie:

            · con sesión  → la cuenta ya está dentro, no hay correo que esperar.
            · sin sesión  → Supabase ha mandado el enlace y hay que confirmarlo.

          En el primer caso no hace falta ni enseñar un aviso: el cambio de sesión
          entra solo y la aplicación se monta encima de esta pantalla.
        */
        /*
          Con invitación se dice además a dónde lleva el correo: de vuelta aquí,
          a aceptar. Da igual en qué navegador se abra (el de Gmail, o Safari
          cuando esto estaba dentro de WhatsApp): el flujo de acceso es el
          implícito, sin nada guardado en este navegador que haga falta allí, así
          que la invitación se termina donde se pulse el enlace.
        */
        else if (!data?.session)
          setInfo(
            invitacion
              ? `Te hemos enviado un correo a ${form.email.trim()}. Pulsa «Confirmar mi correo» y volverás aquí para aceptar la invitación. Revisa también el spam.`
              : 'Cuenta creada. Te hemos enviado un enlace para confirmar el registro; revisa también la carpeta de spam.'
          );
      }
    } catch (e) {
      setError(e?.message || 'No se pudo conectar. Comprueba tu conexión.');
    } finally {
      setBusy(false);
    }
  };

  const voz = (invitacion ? vozDeLaInvitacion(invitacion.entrenador) : VOZ)[mode];

  /*
    ══ La columna de al lado no le habla a la misma persona ═══════════════════

    Por esta pantalla entran dos: el entrenador que viene de la portada y el
    cliente que ha pulsado el enlace de invitación de su entrenador. A ese
    segundo, «tres clientes gratis» no le dice nada —él no lleva a nadie y no
    paga nada— y encima le hace dudar de si esto le va a costar dinero.

    La invitación es lo que distingue un caso del otro: solo la manda la página
    de invitación.
  */
  /*
    Y sin invitación entran otros dos, no uno: el entrenador que viene de la
    portada y el CLIENTE que vuelve un martes cualquiera a anotar su sesión. El
    discurso del entrenador —«tus clientes entrenan», «tres clientes gratis»—
    solo es verdad para el primero, así que se reserva para la pestaña de crear
    cuenta, que sí es territorio suyo (las cuentas de cliente nacen por
    invitación, no por este formulario). En «Entrar» la columna les habla a los
    dos con lo único que comparten: aquí está tu trabajo, tal y como lo dejaste.
  */
  const aparte = invitacion
    ? {
        rotulo: invitacion.entrenador ? `Invitación de ${invitacion.entrenador}` : 'Invitación de tu entrenador',
        lema: 'Tu rutina y tu dieta,',
        remate: 'donde entrenas',
        puntos: [
          'La sesión del día en el móvil, con lo que levantaste la vez anterior.',
          'Lo que registras lo ve tu entrenador al momento.',
          'Tú no pagas nada: la cuenta la lleva quien te entrena.',
        ],
      }
    : mode === 'signup'
      ? {
          rotulo: 'Panel del entrenador',
          lema: 'Tus clientes entrenan.',
          remate: 'Tú lo ves todo.',
          puntos: [
            'Tres clientes gratis, para siempre y sin tarjeta.',
            'En el navegador: no hay nada que instalar, ni tú ni ellos.',
            'Tus datos se exportan o se borran cuando lo pidas.',
          ],
        }
      : {
          rotulo: 'Caveman Hub',
          lema: 'Sigue donde',
          remate: 'lo dejaste.',
          puntos: [
            'La sesión, la dieta y el progreso, tal y como se quedaron.',
            'En el navegador: no hay nada que instalar.',
            'Tus datos se exportan o se borran cuando lo pidas.',
          ],
        };

  return (
    <Acceso {...aparte}>
      <Panel as="form" onSubmit={handleSubmit} className="acceso-card col gap-4">
        {/*
          Entrar y crear cuenta, arriba del todo y como dos pestañas.

          Antes eran dos enlaces de texto DEBAJO del botón de envío —«¿No tienes
          cuenta? Crear una»— y eso tiene dos problemas: hay que leer el
          formulario entero para descubrir que existe el otro camino, y a quien
          llega con la intención de registrarse le da la bienvenida un formulario
          que dice «Entrar». Arriba, la elección se ve antes de escribir nada.

          ── Y las pestañas son el título ────────────────────────────────────
          Encima de ellas había un titular que decía exactamente lo mismo que la
          pestaña marcada: «Entrar» sobre [Entrar | Crear cuenta]. Dos veces la
          misma palabra, una debajo de la otra, en las dos primeras líneas de la
          tarjeta. Se ha ido el titular y se ha quedado la pestaña, que además de
          decir dónde estás dice a dónde más se puede ir.

          En «recuperar» no aparece: ahí no se está eligiendo entre dos caminos,
          se está en un desvío del primero, y su salida es el enlace de abajo.
          Por eso ese modo —y solo ese— sí lleva titular: sin pestañas, una
          tarjeta que empieza por una frase suelta no dice qué es.
        */}
        {/*
          Con invitación, un titular SÍ: trae un dato que las pestañas no dicen
          —quién te invita, o que esto es un acceso nuevo— y es lo que hace que el
          formulario no parezca el de una app cualquiera que alguien te ha pasado.
        */}
        {invitacion && mode !== 'reset' && (
          <div className="acceso-card-head">
            <strong className="acceso-title">
              {invitacion.accesoNuevo
                ? 'Tu acceso nuevo'
                : invitacion.entrenador
                  ? `${invitacion.entrenador} te ha invitado`
                  : 'Te han invitado'}
            </strong>
            {invitacion.accesoNuevo && (
              <span className="t-sm t-tertiary">
                Tu cuenta de antes ya no vale. Crea otra o entra con Google: todo lo tuyo sigue ahí.
              </span>
            )}
          </div>
        )}

        {/* Con invitación, «Crear cuenta» primero —es lo que viene a hacer casi
            todo el mundo— y el otro camino se nombra por quién es. */}
        {mode !== 'reset' && (
          <SegmentedControl
            ancho
            label="Entrar o crear una cuenta"
            value={mode}
            onChange={go}
            options={
              invitacion
                ? [
                    { id: 'signup', label: 'Crear cuenta' },
                    { id: 'login', label: 'Ya tengo cuenta' },
                  ]
                : [
                    { id: 'login', label: 'Entrar' },
                    { id: 'signup', label: 'Crear cuenta' },
                  ]
            }
          />
        )}

        <div className="acceso-card-head">
          {mode === 'reset' && <strong className="acceso-title">{voz.titulo}</strong>}
          <span className="t-sm t-tertiary">{voz.pie}</span>
        </div>

        {error && <Notice tone="error">{error}</Notice>}
        {info && <Notice tone="success">{info}</Notice>}

        {/*
          ══ Google va ARRIBA del todo, y separado ═════════════════════════════

          Arriba porque para quien lo usa es el camino entero: un clic y está
          dentro. Puesto debajo del formulario habría que leer tres campos para
          descubrir que no hacía falta rellenar ninguno.

          Y separado con una raya y una «o» porque son dos caminos ALTERNATIVOS,
          no dos pasos. Sin la raya, un botón encima de un campo de correo se lee
          como el primero de una secuencia.

          En «recuperar» no aparece: ahí no se está entrando, se está pidiendo un
          enlace para una contraseña que se ha olvidado — y quien entra con
          Google no tiene ninguna.

          Y dentro de WhatsApp o Instagram tampoco: Google bloquea su acceso en
          esas vistas (`disallowed_useragent`) y el botón acababa en una pantalla
          de error en inglés. Se dice por qué y se da la salida: copiar el enlace
          y abrirlo en el navegador de verdad. El correo sí funciona aquí.
        */}
        {mode !== 'reset' && integrado && (
          <Notice
            tone="info"
            action={
              <button type="button" className="btn btn-secondary btn-sm shrink-0" onClick={copiarEnlace}>
                {copiado ? 'Copiado' : 'Copiar enlace'}
              </button>
            }
          >
            Dentro de {app || 'esta app'}, Google no deja entrar. Para usarlo, copia el enlace y ábrelo en{' '}
            {navegadorDeFuera()}. Con tu correo puedes seguir aquí.
          </Notice>
        )}

        {mode !== 'reset' && !integrado && (
          <>
            <button
              type="button"
              className="acceso-google"
              onClick={conGoogle}
              disabled={busy}
            >
              <BrandMark brand="google" name="Google" size={18} tile={false} />
              Continuar con Google
            </button>

            <span className="acceso-o">o</span>
          </>
        )}

        {mode === 'signup' && (
          <Field label="Nombre">
            {(props) => (
              <input
                {...props}
                className="input"
                value={form.name}
                onChange={(e) => set('name')(e.target.value)}
                autoComplete="name"
                required
              />
            )}
          </Field>
        )}

        <Field label="Email">
          {(props) => (
            <input
              {...props}
              className="input"
              type="email"
              value={form.email}
              onChange={(e) => set('email')(e.target.value)}
              autoComplete="email"
              required
            />
          )}
        </Field>

        {mode !== 'reset' && (
          <Field
            label="Contraseña"
            hint={mode === 'signup' ? `Mínimo ${MIN_PASSWORD} caracteres.` : undefined}
          >
            {(props) => (
              <input
                {...props}
                className="input"
                type="password"
                value={form.password}
                onChange={(e) => set('password')(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
              />
            )}
          </Field>
        )}

        {/* El botón de la portada, no el de la aplicación: es el mismo gesto que
            se pulsó para llegar hasta aquí, y llevarlo igual es lo que hace que
            las dos pantallas se lean como una sola secuencia. */}
        <button type="submit" className="lp-btn is-fill acceso-go" disabled={busy}>
          {busy ? 'Un momento…' : voz.boton}
        </button>

        {/*
          El enlace de recuperación va DEBAJO del botón de entrar y no junto al
          campo: solo hace falta cuando la contraseña ya ha fallado, y arriba
          compite con lo que casi todo el mundo viene a hacer.
        */}
        {mode === 'login' && (
          <button type="button" className="btn btn-sm acceso-alt" onClick={() => go('reset')}>
            ¿Has olvidado tu contraseña?
          </button>
        )}

        {mode === 'reset' && (
          <button type="button" className="btn btn-sm acceso-alt" onClick={() => go('login')}>
            Volver a entrar
          </button>
        )}

        {/*
          ══ Que un cliente no se cree una cuenta de entrenador ═══════════════

          Este alta crea un ENTRENADOR: el rol lo asigna el disparador de la base
          de datos. Pero la pestaña dice «Crear cuenta» a secas, así que un
          cliente que guardó la dirección en marcadores en vez del enlace de
          invitación —o que cerró sesión y volvió mal— acabaría con una cuenta de
          entrenador vacía y sin acceso a sus datos. Y la queja llega al
          entrenador.

          Se dice para quién es el alta, y qué hacer si no eres tú.
        */}
        {mode === 'signup' && !invitacion && (
          <p className="t-xs t-tertiary acceso-fine">
            ¿Eres cliente de un entrenador? No te crees una cuenta aquí: entra con el enlace que él
            te mandó.
          </p>
        )}

        {/*
          Solo al registrarse. Quien ya tiene cuenta las aceptó en su día y
          enseñárselas cada vez que entra es ruido; quien la está creando las
          acepta en este clic y tiene que poder leerlas antes.
        */}
        {mode === 'signup' && (
          <p className="t-xs t-tertiary acceso-fine">
            Al crear la cuenta aceptas las{' '}
            <a href="/condiciones" target="_blank" rel="noreferrer">
              condiciones del servicio
            </a>{' '}
            y la{' '}
            <a href="/privacidad" target="_blank" rel="noreferrer">
              política de privacidad
            </a>
            .
          </p>
        )}
      </Panel>
    </Acceso>
  );
};
