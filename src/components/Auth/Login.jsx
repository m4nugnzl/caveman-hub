import { useState } from 'react';
import { Dumbbell } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { Field, Notice, Panel } from '@/components/ui/primitives';

const MIN_PASSWORD = 8;

export const Login = () => {
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
    <div className="row center" style={{ minHeight: '100vh', padding: 'var(--space-4)' }}>
      <Panel as="form" onSubmit={handleSubmit} className="col gap-4" style={{ width: '100%', maxWidth: 390 }}>
        <div className="row center gap-2">
          <span className="logo-icon">
            <Dumbbell size={21} />
          </span>
          <strong style={{ fontSize: '1.15rem' }}>Caveman Hub</strong>
        </div>

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
          className="btn btn-sm"
          style={{ color: 'var(--text-muted)' }}
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
