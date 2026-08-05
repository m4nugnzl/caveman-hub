import React, { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Dumbbell } from 'lucide-react';

export const Login = () => {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else {
      // Alta de un nuevo ENTRENADOR (role='coach' por defecto vía trigger
      // handle_new_user en schema.sql). Los clientes se dan de alta desde el
      // flujo de "canjear invitación", no desde este formulario.
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });
      if (error) setError(error.message);
      else setInfo('Cuenta creada. Revisa tu email para confirmar el registro.');
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <form onSubmit={handleSubmit} className="glass-panel" style={{ width: '100%', maxWidth: 380, padding: '2rem', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', marginBottom: 8 }}>
          <div className="logo-icon">
            <Dumbbell size={22} />
          </div>
          <div style={{ fontWeight: 900, fontSize: '1.2rem' }}>FitCoach Hub</div>
        </div>

        {error && (
          <div style={{ background: 'rgba(244,63,94,0.12)', border: '1px solid rgba(244,63,94,0.3)', color: '#fda4af', fontSize: '0.82rem', padding: '8px 12px', borderRadius: 8 }}>
            {error}
          </div>
        )}
        {info && (
          <div style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', color: 'var(--accent-emerald)', fontSize: '0.82rem', padding: '8px 12px', borderRadius: 8 }}>
            {info}
          </div>
        )}

        {mode === 'signup' && (
          <div>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Nombre</label>
            <input
              value={name} onChange={(e) => setName(e.target.value)} required
              style={{ width: '100%', background: '#0f172a', border: '1px solid var(--border-color)', color: '#fff', padding: 10, borderRadius: 8 }}
            />
          </div>
        )}

        <div>
          <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Email</label>
          <input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
            style={{ width: '100%', background: '#0f172a', border: '1px solid var(--border-color)', color: '#fff', padding: 10, borderRadius: 8 }}
          />
        </div>

        <div>
          <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Contraseña</label>
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}
            style={{ width: '100%', background: '#0f172a', border: '1px solid var(--border-color)', color: '#fff', padding: 10, borderRadius: 8 }}
          />
        </div>

        <button type="submit" disabled={loading} className="btn-primary" style={{ justifyContent: 'center', padding: '10px' }}>
          {loading ? 'Un momento...' : mode === 'login' ? 'Entrar' : 'Crear cuenta de entrenador'}
        </button>

        <button
          type="button"
          onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null); setInfo(null); }}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.8rem', cursor: 'pointer' }}
        >
          {mode === 'login' ? '¿No tienes cuenta? Crear una' : '¿Ya tienes cuenta? Entrar'}
        </button>
      </form>
    </div>
  );
};
