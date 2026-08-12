import { useState } from 'react';
import { LogoMark } from '@/components/ui/Logo';
import { supabase } from '@/lib/supabaseClient';
import { Field, Notice, Panel } from '@/components/ui/primitives';

const MIN_PASSWORD = 8;

/**
 * @param notice  Aviso de contexto sobre la pantalla. Lo usa la página de
 *   invitación: quien llega desde un enlace de su entrenador tiene que saber a qué
 *   está entrando ANTES de crearse una cuenta, o el formulario parece el de una
 *   aplicación cualquiera que alguien le ha mandado.
 */
export const Login = ({ notice = null }) => {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ email: '', password: '', name: '' });
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

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
        if (err) setError(traduce(err.message));
      } else {
        // Alta de un ENTRENADOR. El rol 'coach' lo asigna el trigger
        // handle_new_user en la base de datos, no el cliente.
        const { error: err } = await supabase.auth.signUp({
          email: form.email.trim(),
          password: form.password,
          options: { data: { name: form.name.trim() } },
        });
        if (err) setError(traduce(err.message));
        else setInfo('Cuenta creada. Revisa tu correo para confirmar el registro.');
      }
    } catch (e) {
      setError(e?.message || 'No se pudo conectar. Comprueba tu conexión.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <Panel as="form" onSubmit={handleSubmit} className="login-card col gap-4">
        <div className="login-head">
          <LogoMark size={54} />
          <strong className="login-title">Caveman Hub</strong>
          <span className="t-sm t-tertiary">Entrenamiento y progreso</span>
        </div>

        {notice && <Notice tone="info">{notice}</Notice>}
        {error && <Notice tone="error">{error}</Notice>}
        {info && <Notice tone="success">{info}</Notice>}

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

        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear cuenta de entrenador'}
        </button>

        <button
          type="button"
          className="btn btn-sm login-alt"
          onClick={() => {
            setMode(mode === 'login' ? 'signup' : 'login');
            setError(null);
            setInfo(null);
          }}
        >
          {mode === 'login' ? '¿No tienes cuenta? Crear una' : '¿Ya tienes cuenta? Entrar'}
        </button>
      </Panel>
    </div>
  );
};

/** Los mensajes de Supabase Auth llegan en inglés. */
function traduce(message = '') {
  const map = {
    'Invalid login credentials': 'Email o contraseña incorrectos.',
    'Email not confirmed': 'Tienes que confirmar tu email antes de entrar.',
    'User already registered': 'Ya existe una cuenta con ese email.',
  };
  return map[message] || message;
}
