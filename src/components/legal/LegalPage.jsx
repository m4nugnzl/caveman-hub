import { useParams, Link } from 'react-router-dom';

import { Logo } from '@/components/ui/Logo';
import { Notice } from '@/components/ui/primitives';
import { ACTUALIZADO, DOCUMENTOS, titularCompleto } from './legalContent';

/**
 * `/privacidad` y `/condiciones`.
 *
 * ── Por qué se ven sin sesión ───────────────────────────────────────────────
 * Porque quien tiene que leerlas todavía no tiene cuenta: el cliente que va a
 * aceptar, y el entrenador que se está registrando. Y porque Stripe pide una
 * dirección pública de las dos para activar una cuenta de cobro.
 *
 * Misma forma que la página de revisión y la de invitación: una tarjeta centrada,
 * sin barras ni menús. No hay nada más que hacer aquí que leer.
 */
export const LegalPage = () => {
  const { documento } = useParams();
  const doc = DOCUMENTOS[documento];

  if (!doc) {
    return (
      <div className="review-page">
        <div className="review-card col gap-4">
          <Logo size={34} />
          <p className="t-sm t-secondary">Esa página no existe.</p>
          <Link className="btn btn-secondary" to="/">
            Volver
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="review-page">
      <article className="review-card legal col gap-5">
        <header className="col gap-3">
          <Logo size={34} />
          <h1>{doc.titulo}</h1>
          <p className="t-sm t-secondary">{doc.entradilla}</p>
          <span className="t-xs t-tertiary">Última actualización: {ACTUALIZADO}</span>
        </header>

        {/*
          El aviso solo aparece mientras falten los datos del titular. No es
          decorativo: una política publicada sin el responsable identificado no
          cumple nada, y con este aviso delante es imposible publicarla creyendo
          que estaba lista.
        */}
        {!titularCompleto && (
          <Notice tone="warn">
            Documento sin terminar: faltan los datos del titular, marcados abajo. Rellénalos en{' '}
            <code>src/components/legal/legalContent.jsx</code> antes de publicar.
          </Notice>
        )}

        {doc.secciones.map((seccion) => (
          <section key={seccion.titulo} className="col gap-2">
            <h2>{seccion.titulo}</h2>
            {seccion.cuerpo}
          </section>
        ))}

        <footer className="col gap-2">
          <hr className="divider" />
          <div className="row gap-3 wrap t-sm">
            <Link to={documento === 'privacidad' ? '/condiciones' : '/privacidad'}>
              {documento === 'privacidad' ? 'Condiciones del servicio' : 'Política de privacidad'}
            </Link>
            <Link to="/">Ir a la aplicación</Link>
          </div>
        </footer>
      </article>
    </div>
  );
};
