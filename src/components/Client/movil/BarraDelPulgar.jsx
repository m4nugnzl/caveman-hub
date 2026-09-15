import { NavLink, useLocation } from 'react-router-dom';

import { isSectionActive } from '@/routes';
import { useAvisos } from '../useAvisos';
import { IconoComer, IconoEntreno, IconoHoy, IconoTu } from './Piezas';

/**
 * LA BARRA DEL PULGAR — CUATRO destinos, y ninguno es el entrenador.
 *
 * ══ Por qué cuatro y no cinco ══════════════════════════════════════════════
 *
 * Es la planta del prototipo del teléfono: **Hoy · Entreno · Comer · Tú**.
 * Coinciden en número con los de la app de hoy —la partición era correcta—;
 * cambia qué hay dentro y que ninguno depende de que haya un entrenador al otro
 * lado, que es la tesis entera del estudio.
 *
 * «Revisión» se cae de la barra y baja a una fila de «Tú» —*Cerrar la semana*,
 * con su estado escrito al lado—. El argumento por el que subió el 12 de
 * septiembre sigue siendo bueno (es lo único que el cliente le DEBE a su
 * entrenador), y el dueño lo ha decidido al revés mirando este prototipo: en un
 * aparato donde la navegación entera son cuatro botones, un destino apagado seis
 * días de cada siete es un botón de los cuatro. El recordatorio no se pierde —la
 * fila de «Tú» lleva su «pendiente» en azul y «Hoy» sigue trayendo el pedido
 * arriba— y además vuelve a haber sitio para que cada icono se lea.
 *
 * «Progreso» sigue siendo de escritorio (`soloAncho`): se mira, no se hace.
 *
 * ── El icono no viene de `lucide` ────────────────────────────────────────
 * Son los cuatro del prototipo, dibujados en `Piezas`. Son los únicos iconos de
 * todo el teléfono: ni las filas ni las tarjetas llevan.
 */
const ICONO = {
  inicio: IconoHoy,
  rutina: IconoEntreno,
  dieta: IconoComer,
  tu: IconoTu,
};

export const BarraDelPulgar = ({ secciones }) => {
  const { pathname } = useLocation();
  /* Un solo punto, y es el de «Hoy»: lo que ha cambiado y lo que le falta. El
     de «Revisión» se va con su destino — lo que espera sigue saliendo arriba,
     en el pedido de la portada, que es donde se lee sin buscarlo. */
  const { todo } = useAvisos();

  return (
    <nav className="tel-pulgar" aria-label="Secciones de mi portal">
      {secciones.map((seccion) => {
        const Icono = ICONO[seccion.path] || IconoTu;
        const aqui = isSectionActive(pathname, seccion, '/mi');
        return (
          <NavLink
            key={seccion.path}
            to={`/mi/${seccion.path}`}
            className={aqui ? 'tel-aqui' : undefined}
            aria-current={aqui ? 'page' : undefined}
          >
            <Icono />
            {seccion.path === 'inicio' && todo.length > 0 ? <i className="tel-punto" /> : null}
            {seccion.corto || seccion.short || seccion.label}
          </NavLink>
        );
      })}
    </nav>
  );
};
