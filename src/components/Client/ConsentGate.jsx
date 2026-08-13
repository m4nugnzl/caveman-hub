import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabaseClient';
import { CONSENT_VERSION, ConsentNotice } from '@/components/Auth/ConsentNotice';
import { LogoMark } from '@/components/ui/Logo';
import { Notice, Panel } from '@/components/ui/primitives';

/**
 * Le pide su consentimiento al cliente que entró antes de que existiera.
 *
 * ══ Por qué hace falta una pantalla y no un backfill ═══════════════════════
 *
 * La `0018` hizo imposible enlazar una cuenta sin registrar el consentimiento,
 * pero solo mira hacia delante. Los clientes que ya estaban dentro no tienen
 * fila, y **no se les puede inventar una**: el consentimiento se da, no se deduce
 * de que alguien lleve seis meses usando el portal.
 *
 * Lo mismo pasa al cambiar el texto: si cambia lo que se guarda o quién lo ve, el
 * consentimiento anterior no cubre lo nuevo, así que subir `CONSENT_VERSION`
 * vuelve a enseñar esto a todo el mundo. Es la consecuencia buscada.
 *
 * ══ Por qué corta el paso ══════════════════════════════════════════════════
 *
 * Porque lo que hay detrás es el tratamiento: en cuanto entra puede subir una
 * foto de su cuerpo. Dejarle pasar «solo a mirar» y preguntarle luego es hacer lo
 * mismo que la 0018 vino a impedir.
 *
 * Lo que NO hace es encerrarle: si no está de acuerdo, la salida es su entrenador
 * —que puede exportar y borrar sus datos desde su ficha—, y la pantalla se lo dice
 * en lugar de dejarle en un callejón.
 */
export const ConsentGate = ({ children }) => {
  const [state, setState] = useState('comprobando');
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    supabase.rpc('needs_consent', { p_version: CONSENT_VERSION }).then(({ data, error: err }) => {
      if (!alive) return;
      /*
        Si la función no existe —migración 0023 sin aplicar— se deja pasar. Cortarle
        el portal a todos los clientes por una migración pendiente sería un
        remedio peor que la enfermedad, y el aviso ya está en el README.
      */
      if (err) console.error('needs_consent:', err.message);
      setState(!err && data === true ? 'pendiente' : 'ok');
    });
    return () => {
      alive = false;
    };
  }, []);

  const aceptar = async () => {
    setError(null);
    const { error: err } = await supabase.rpc('record_my_consent', {
      p_version: CONSENT_VERSION,
    });
    if (err) {
      setError(err.message);
      return;
    }
    setState('ok');
  };

  // Sin parpadeo: mientras se comprueba no se pinta el portal, o se vería medio
  // segundo antes de taparlo.
  if (state === 'comprobando') return null;
  if (state === 'ok') return children;

  return (
    <div className="login">
      <Panel className="login-card col gap-4">
        <div className="login-head">
          <LogoMark size={54} />
          <strong className="login-title">Antes de seguir</strong>
          <span className="t-sm t-tertiary">
            Necesitamos tu permiso para lo que se guarda de ti
          </span>
        </div>

        {error && <Notice tone="error">{error}</Notice>}

        <ConsentNotice checked={accepted} onChange={setAccepted} />

        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={!accepted}
          onClick={aceptar}
        >
          Acepto y continúo
        </button>

        <p className="t-xs t-tertiary" style={{ textAlign: 'center' }}>
          Si no estás de acuerdo, díselo a tu entrenador: puede darte una copia de todos tus datos o
          borrarlos por completo.
        </p>
      </Panel>
    </div>
  );
};
