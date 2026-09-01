import { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';

import { supabase } from '@/lib/supabaseClient';
import { MIN_PASSWORD, traduceAuthError } from '@/lib/authErrors';
import { BotonAccion, Field, Notice, Panel, useAccionDeBoton } from '@/components/ui/primitives';
import { Acceso } from '@/components/Auth/Acceso';

/**
 * `/nueva-contrasena` — elegir contraseña nueva.
 *
 * ══ Cómo se llega aquí ═════════════════════════════════════════════════════
 *
 * Desde el enlace del correo que manda `resetPasswordForEmail`. Ese enlace trae un
 * testigo en el fragmento de la URL (`#access_token=…&type=recovery`), y el cliente
 * de Supabase lo canjea SOLO —`detectSessionInUrl` está activo por defecto— nada
 * más cargar la página. Por eso aquí no se lee ningún parámetro a mano: lo único
 * que hay que hacer es esperar a que aparezca la sesión.
 *
 * Esa espera es la razón de que haya un estado «comprobando». Sin él, la pantalla
 * diría «el enlace ha caducado» durante el instante que tarda el canje, que es
 * justo lo contrario de lo que está pasando.
 *
 * ══ La sesión de recuperación es una sesión de verdad ══════════════════════
 *
 * Quien abre el enlace queda con sesión iniciada ANTES de elegir contraseña. Es
 * cómo funciona este flujo en Supabase y tiene una consecuencia que conviene
 * conocer: **el enlace del correo vale como acceso a la cuenta hasta que caduca**.
 * Cuánto dura no se decide aquí sino en Supabase (Authentication → Email → tiempo
 * de expiración); una hora es un valor razonable y el que conviene comprobar antes
 * de tener clientes de pago.
 *
 * Por eso al terminar NO se cierra la sesión: obligar a entrar otra vez con la
 * contraseña recién escrita es fricción sin ninguna ganancia de seguridad —quien
 * está aquí ya ha demostrado que controla el correo y acaba de fijar la clave—.
 *
 * ══ Sirve también con sesión normal ════════════════════════════════════════
 *
 * Entrar a esta dirección estando dentro enseña el mismo formulario, y cambia la
 * contraseña igual. Es correcto: `updateUser` actúa siempre sobre la sesión activa.
 */
export const PasswordResetPage = () => {
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  /* El giro del botón de guardar. No lleva tic: al terminar, la pantalla
     entera cambia a «hecho», que confirma mucho mejor que un icono. */
  const guardado = useAccionDeBoton();
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setHasSession(Boolean(data.session));
      setReady(true);
    });

    /*
      El canje del fragmento puede terminar DESPUÉS de la comprobación de arriba.
      `PASSWORD_RECOVERY` es el evento que dispara el enlace del correo; se escucha
      cualquier cambio con sesión porque el orden de los dos no está garantizado.
    */
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!alive || !next) return;
      setHasSession(true);
      setReady(true);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD) {
      setError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
      return;
    }

    guardado.lanzar(async () => {
      try {
        const { error: err } = await supabase.auth.updateUser({ password });
        if (err) {
          setError(traduceAuthError(err.message));
          return false;
        }
        setDone(true);
        return true;
      } catch (e) {
        setError(e?.message || 'No se pudo conectar. Comprueba tu conexión.');
        return false;
      }
    });
  };

  /* Solo hay formulario mientras se puede escribir la contraseña. En los otros dos
     estados —enlace caducado y hecho— el contenido es un aviso y un botón, y un
     `<form>` alrededor solo añadiría un envío que no lleva a ninguna parte. */
  const isForm = ready && hasSession && !done;

  /* El mismo escaparate que el acceso, y con el mismo motivo: se llega aquí
     desde un enlace del correo, casi siempre en una pestaña nueva y sin haber
     pasado por ninguna pantalla de esta aplicación. Si esto no se parece a lo
     que hay en `/entrar`, lo que se abre no se reconoce como el mismo sitio —y
     una pantalla que pide una contraseña es la peor de todas para no ser
     reconocida—. */
  return (
    <Acceso
      lema="Elige una contraseña"
      remate="y sigue donde estabas"
      puntos={[
        'El enlace del correo vale una vez y caduca.',
        'Al guardarla entras directamente, sin volver a escribirla.',
      ]}
    >
      <Panel
        as={isForm ? 'form' : 'div'}
        onSubmit={isForm ? handleSubmit : undefined}
        className="acceso-card col gap-4"
      >
        <div className="acceso-card-head">
          <strong className="acceso-title">
            {done ? 'Contraseña cambiada' : 'Contraseña nueva'}
          </strong>
          <span className="t-sm t-tertiary">
            {done ? 'Ya puedes entrar con ella.' : 'La de antes deja de valer en cuanto guardes.'}
          </span>
        </div>

        {!ready && <p className="t-sm t-secondary">Comprobando el enlace…</p>}

        {ready && !hasSession && (
          <>
            <Notice tone="error">
              Este enlace ya no vale: o ha caducado, o ya se ha usado, o se abrió en otro navegador
              distinto del que lo pidió.
            </Notice>
            <p className="t-sm t-secondary">
              Pide uno nuevo desde la pantalla de acceso. Los enlaces anteriores dejan de funcionar
              en cuanto se genera otro.
            </p>
            {/*
              Recarga completa y no `navigate`: puede haber quedado un fragmento de
              testigo consumido en la URL, y volver por dentro lo arrastraría a la
              pantalla de acceso.
            */}
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={() => window.location.replace('/')}
            >
              Volver al acceso
            </button>
          </>
        )}

        {ready && hasSession && !done && (
          <>
            {error && <Notice tone="error">{error}</Notice>}

            <Field label="Contraseña nueva" hint={`Mínimo ${MIN_PASSWORD} caracteres.`}>
              {(props) => (
                <input
                  {...props}
                  className="input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  autoFocus
                  required
                />
              )}
            </Field>

            <BotonAccion
              type="submit"
              className="btn btn-primary btn-block"
              estado={guardado.estado}
            >
              Guardar y entrar
            </BotonAccion>
          </>
        )}

        {done && (
          <>
            <Notice tone="success">
              Listo. Ya puedes entrar con ella la próxima vez.
            </Notice>
            {/*
              Recarga completa por el mismo motivo que la invitación: el arranque es
              donde la aplicación lee el rol del perfil y decide qué cargar. La raíz
              lleva a cada uno a su inicio, sea entrenador o cliente.
            */}
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={() => window.location.replace('/')}
            >
              <KeyRound size={15} /> Entrar
            </button>
          </>
        )}
      </Panel>
    </Acceso>
  );
};
