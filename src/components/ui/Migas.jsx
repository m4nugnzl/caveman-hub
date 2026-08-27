import { Link, NavLink } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/**
 * La miga de una pantalla que cuelga de otra.
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 * Las cinco pestañas de un cliente son planas a propósito (ver `routes.jsx`):
 * debajo de ellas no hay un segundo carril de chips. Pero algunas secciones
 * tienen pantallas que cuelgan de ellas —el análisis del resumen, el archivo de
 * fotos de las revisiones, el calendario del perfil— y quien está en una de
 * ésas necesita dos cosas: saber de dónde viene y volver.
 *
 * Eso es esta pieza: «← Revisiones», y al lado, si las hay, las hermanas de la
 * pantalla en la que estás. Se pinta SOLO en las pantallas que cuelgan; en la
 * pestaña principal no hay nada que volver, así que no sale.
 *
 * @param volver   `{ to, label }` — la pestaña de la que se cuelga.
 * @param hermanos `[{ to, label, icon }]` — las otras pantallas del mismo nivel.
 */
export const Migas = ({ volver, hermanos = [] }) => (
  <nav className="migas" aria-label="Dónde estás">
    <Link to={volver.to} className="migas-volver">
      <ArrowLeft size={14} aria-hidden="true" />
      {volver.label}
    </Link>
    {hermanos.length > 0 && (
      <>
        <span className="migas-sep" aria-hidden="true" />
        <div className="migas-hermanos">
          {hermanos.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className="migas-link" end>
              {Icon && <Icon size={13} aria-hidden="true" />}
              {label}
            </NavLink>
          ))}
        </div>
      </>
    )}
  </nav>
);
