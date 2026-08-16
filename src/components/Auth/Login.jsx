import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { supabase } from '@/lib/supabaseClient';
import { MIN_PASSWORD, traduceAuthError } from '@/lib/authErrors';
import { RESET_PATH } from '@/routes';
import { Field, Notice, Panel, SegmentedControl } from '@/components/ui/primitives';
import { Acceso } from '@/components/Auth/Acceso';

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
 * @param notice  Aviso de contexto sobre la pantalla. Lo usa la página de
 *   invitación: quien llega desde un enlace de su entrenador tiene que saber a qué
 *   está entrando ANTES de crearse una cuenta, o el formulario parece el de una
 *   aplicación cualquiera que alguien le ha mandado.
 */
export const Login = ({ notice = null }) => {
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
  const [mode, setMode] = useState(params.get('alta') ? 'signup' : 'login');
  const [form, setForm] = useState({ email: '', password: '', name: '' });
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  const go = (next) => {
    setMode(next);
    setError(null);
    setInfo(null);
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
        else
          setInfo(
            'Si hay una cuenta con ese email, te llega un enlace para elegir contraseña nueva. Revisa también la carpeta de spam.'
          );
      } else {
        // Alta de un ENTRENADOR. El rol 'coach' lo asigna el trigger
        // handle_new_user en la base de datos, no el cliente.
        const { error: err } = await supabase.auth.signUp({
          email: form.email.trim(),
          password: form.password,
          options: { data: { name: form.name.trim() } },
        });
        if (err) setError(traduceAuthError(err.message));
        else setInfo('Cuenta creada. Revisa tu correo para confirmar el registro.');
      }
    } catch (e) {
      setError(e?.message || 'No se pudo conectar. Comprueba tu conexión.');
    } finally {
      setBusy(false);
    }
  };

  const voz = VOZ[mode];

  /*
    ══ La columna de al lado no le habla a la misma persona ═══════════════════

    Por esta pantalla entran dos: el entrenador que viene de la portada y el
    cliente que ha pulsado el enlace de invitación de su entrenador. A ese
    segundo, «tres clientes gratis» no le dice nada —él no lleva a nadie y no
    paga nada— y encima le hace dudar de si esto le va a costar dinero.

    El aviso de contexto es lo que distingue un caso del otro: solo lo manda la
    página de invitación.
  */
  const aparte = notice
    ? {
        lema: 'Tu rutina y tu dieta,',
        remate: 'donde entrenas',
        puntos: [
          'La sesión del día en el móvil, con lo que levantaste la vez anterior.',
          'Lo que registras lo ve tu entrenador al momento.',
          'Tú no pagas nada: la cuenta la lleva quien te entrena.',
        ],
      }
    : {
        lema: 'Tus clientes entrenan.',
        remate: 'Tú lo ves todo.',
        puntos: [
          'Tres clientes gratis, para siempre y sin tarjeta.',
          'En el navegador: no hay nada que instalar, ni tú ni ellos.',
          'Tus datos se exportan o se borran cuando lo pidas.',
        ],
      };

  return (
    <Acceso {...aparte}>
      <Panel as="form" onSubmit={handleSubmit} className="acceso-card col gap-4">
        <div className="acceso-card-head">
          <strong className="acceso-title">{voz.titulo}</strong>
          <span className="t-sm t-tertiary">{voz.pie}</span>
        </div>

        {/*
          Entrar y crear cuenta, arriba y como dos pestañas.

          Antes eran dos enlaces de texto DEBAJO del botón de envío —«¿No tienes
          cuenta? Crear una»— y eso tiene dos problemas: hay que leer el
          formulario entero para descubrir que existe el otro camino, y a quien
          llega con la intención de registrarse le da la bienvenida un formulario
          que dice «Entrar». Arriba, la elección se ve antes de escribir nada.

          En «recuperar» no aparece: ahí no se está eligiendo entre dos caminos,
          se está en un desvío del primero, y su salida es el enlace de abajo.
        */}
        {mode !== 'reset' && (
          <SegmentedControl
            label="Entrar o crear una cuenta"
            value={mode}
            onChange={go}
            options={[
              { id: 'login', label: 'Entrar' },
              { id: 'signup', label: 'Crear cuenta' },
            ]}
          />
        )}

        {notice && <Notice tone="info">{notice}</Notice>}
        {error && <Notice tone="error">{error}</Notice>}
        {info && <Notice tone="success">{info}</Notice>}

        {mode === 'reset' && (
          <p className="t-sm t-secondary">
            Escribe el email de tu cuenta y te mandamos un enlace para elegir una contraseña nueva.
          </p>
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
        {mode === 'signup' && (
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
