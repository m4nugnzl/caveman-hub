import { Route } from 'lucide-react';
import { Link } from 'react-router-dom';

import { temporadaPath } from '@/routes';

/**
 * «Ver en la temporada», en la esquina de una casilla de las tiras (26 sep
 * 2026). Es una oferta y no un hecho: en reposo no está, sale al pasar o al
 * enfocar la casilla, y aparta su marca (✓, «hoy») mientras tanto. En táctil
 * no se pinta: allí vive dentro de la semana, que es lo que abre la casilla.
 *
 * Va AL LADO de la casilla y no dentro: la casilla ya es un enlace.
 */
export const EnLaTemporada = ({ clientId, lunes, nombre }) => (
  <Link
    className="casilla-temporada"
    to={temporadaPath(clientId, { semana: lunes })}
    aria-label={`Ver ${nombre} en la temporada`}
    title="Ver en la temporada"
  >
    <Route size={12} strokeWidth={2.25} aria-hidden="true" />
  </Link>
);
