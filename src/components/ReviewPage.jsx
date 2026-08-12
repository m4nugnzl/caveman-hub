import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { supabase } from '@/lib/supabaseClient';
import { shortDate } from '@/lib/dates';
import { Logo } from '@/components/ui/Logo';

/**
 * Página pública de una revisión: `/r/<token>`.
 *
 * ── Por qué existe y no se comparte el archivo ──────────────────────────────
 * Antes se mandaba una URL firmada de Storage. Caducaba a los siete días, así que
 * el cliente que quería volver en marzo a la revisión de enero se encontraba un
 * enlace muerto — y volver a verla es justo lo que hace valioso el vídeo.
 *
 * Aquí el enlace apunta a un token permanente. La URL del archivo se firma al
 * abrir, dura media hora y no se comparte con nadie. El enlace no caduca, el
 * archivo sigue privado, y el entrenador puede revocarlo si lo reenvían a quien no
 * debía —algo que con un enlace firmado es imposible.
 *
 * ── Se ve SIN sesión ────────────────────────────────────────────────────────
 * Va fuera del árbol de rutas autenticadas: el cliente la abre desde WhatsApp y no
 * tiene por qué entrar en la aplicación. Por eso resuelve el token contra la
 * función `review-link` y no contra la base de datos.
 */
export const ReviewPage = () => {
  const { token } = useParams();
  const [state, setState] = useState({ status: 'loading' });

  useEffect(() => {
    let alive = true;

    supabase.functions
      .invoke('review-link', { body: { token } })
      .then(async ({ data, error }) => {
        if (!alive) return;
        if (error) {
          const detail = await error.context?.json?.().catch(() => null);
          setState({ status: 'error', error: detail?.error || 'No se pudo abrir la revisión.' });
          return;
        }
        if (data?.error) {
          setState({ status: 'error', error: data.error });
          return;
        }
        setState({ status: 'ready', data });
      });

    return () => {
      alive = false;
    };
  }, [token]);

  return (
    <div className="review-page">
      <div className="review-card">
        <header className="review-head">
          <Logo subtitle={null} />
        </header>

        {state.status === 'loading' && <p className="t-sm t-secondary">Abriendo la revisión…</p>}

        {state.status === 'error' && (
          <div className="col gap-2">
            <h1 className="section-title">{state.error}</h1>
            <p className="t-sm t-secondary">
              Si crees que debería funcionar, pídele a tu entrenador que te lo vuelva a enviar.
            </p>
          </div>
        )}

        {state.status === 'ready' && (
          <div className="col gap-4">
            <div className="col gap-1">
              <h1 className="review-title">
                {state.data.title || 'Tu revisión'}
              </h1>
              <p className="t-sm t-secondary">
                {[
                  state.data.clientName,
                  state.data.weekStart ? `semana del ${shortDate(state.data.weekStart)}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>

            {/* `controls` y nada más: sin autoplay, que en móvil consume datos sin
                permiso y a veces arranca con el sonido a tope. */}
            <video src={state.data.videoUrl} controls playsInline className="review-video" />

            {state.data.notes && (
              <div className="card-inset">
                <p className="t-sm">{state.data.notes}</p>
              </div>
            )}

            <p className="t-xs t-tertiary">
              Este enlace es tuyo y no caduca: guárdalo y vuelve cuando quieras.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
