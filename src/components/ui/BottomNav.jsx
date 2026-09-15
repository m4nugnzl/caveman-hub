import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';

import { Hoja } from '@/components/ui/Hoja';

/**
 * Barra de navegación inferior. Solo en móvil.
 *
 * ══ Por qué ════════════════════════════════════════════════════════════════
 * El portal del cliente se usa en el móvil, no en el escritorio: se abre en el
 * gimnasio, entre serie y serie, con una mano. Y navegaba con un carril de siete
 * pestañas que se desplazaba en horizontal, arriba del todo. Eso tiene dos
 * problemas y los dos son de ergonomía, no de estética:
 *
 *   · Lo que no cabe DESAPARECE. Con siete pestañas en una pantalla de 390 px se
 *     ven tres y media; «Mis check-ins» y «Mi calendario» no existen para quien no
 *     descubra que aquello se arrastra.
 *   · Está en la zona que no alcanza el pulgar. La parte alta de una pantalla de
 *     seis pulgadas exige recolocar la mano; la baja, no.
 *
 * La barra inferior resuelve las dos: destinos fijos y visibles, y en el sitio
 * donde está el dedo.
 *
 * ── Cuatro y «Más», no siete ────────────────────────────────────────────────
 * Por debajo de unos 70 px por destino la etiqueta deja de leerse y el objetivo
 * táctil baja del mínimo de 44 px. Con siete entradas en 390 px salen 55 px cada
 * una: cabrían los iconos y no las palabras, y una barra de iconos sin texto es
 * un examen de memoria.
 *
 * Así que caben cuatro, y el resto va en una hoja que sube desde abajo. La regla
 * de qué cuatro no la decide este componente: es el orden en que llegan, que se
 * declara en `src/routes.jsx`.
 *
 * ── El área segura del iPhone ───────────────────────────────────────────────
 * `--safe-b` es `env(safe-area-inset-bottom)`. Sin eso, en cualquier iPhone sin
 * botón de inicio la última fila de la barra queda debajo de la raya del gesto de
 * volver, y el dedo abre el multitarea en vez de pulsar «Mi dieta».
 */
export const BottomNav = ({ items, label = 'Navegación principal' }) => {
  const [more, setMore] = useState(false);
  const location = useLocation();

  /*
    El cierre NO usa `useClickOutside`, aunque sea el gancho que hay para esto.
    Con él, pulsar «Más» estando abierta contaba como clic fuera de la hoja Y como
    pulsación del botón: se cerraba y se volvía a abrir en el mismo gesto, así que
    el botón no cerraba nunca. En `Hoja`, el fondo cierra al pulsarlo y el botón
    alterna, que son dos caminos que no se pisan.

    Escape, el foco atrapado, el fondo quieto, la salida animada y el arrastre
    para cerrar los lleva ya la propia `Hoja`: aquí vivió una versión a medias
    de los dos primeros —un `keydown` suelto y ningún foco—, que es lo que pasa
    cuando la única superficie para el pulgar es propiedad de una barra.
  */

  /* Cambiar de sección cierra la hoja. Sin esto, volver atrás con el gesto del
     navegador deja la hoja abierta sobre una pantalla que ya no es la suya.
     Con el cierre animado, además, la hoja se despide en vez de esfumarse. */
  useEffect(() => setMore(false), [location.pathname]);

  const overflows = items.length > 5;
  const primary = overflows ? items.slice(0, 4) : items;
  const rest = overflows ? items.slice(4) : [];

  /* «Más» se marca cuando la sección activa es una de las que esconde. Sin esto,
     estando en «Mi calendario» la barra no señala nada y parece que estás fuera
     de la aplicación. */
  const activo = (item) =>
    typeof item.isActive === 'function' ? item.isActive(location.pathname) : location.pathname === item.to;
  const restIsActive = rest.some(activo);

  return (
    <>
      {/*
        Los destinos van como ENLACES y no con `role="menuitem"`, que es lo que
        llevaban. Un `menu` de ARIA es un menú de aplicación —comandos que se
        recorren con las flechas—, y esto es una lista de sitios a los que ir:
        anunciados como enlaces, el lector de pantalla dice cuántos hay y cuál
        es el activo, que es exactamente lo que se quiere saber.
      */}
      <Hoja abierta={more} onCerrar={() => setMore(false)} etiqueta="Más secciones">
        {rest.map(({ to, label: text, icon: Icon }) => (
          <NavLink key={to} to={to} className="sheet-item" onClick={() => setMore(false)}>
            <Icon size={20} />
            {text}
          </NavLink>
        ))}
      </Hoja>

      {/*
        La marca de activo puede venir dada (`isActive`) en vez de deducirse de la
        URL. Hace falta desde que una sección tiene dos niveles: «Mi evolución»
        vive en `/mi/evolucion` y también en `/mi/evolucion/fotos`, y con el
        emparejamiento por prefijo de `NavLink` bajar a las fotos apagaba el
        destino y la barra dejaba de señalar dónde estás.
      */}
      <nav className="bottombar" aria-label={label}>
        {primary.map((item) => {
          const { to, label: text, icon: Icon } = item;
          const esActivo = activo(item);
          return (
            <NavLink
              key={to}
              to={to}
              className={`bottombar-item${esActivo ? ' active' : ''}`}
              end={to.split('/').length <= 2}
              aria-current={esActivo ? 'page' : undefined}
            >
              {/*
                ── El punto: «ahí dentro hay algo esperándote» ────────────────
                Vive en el ICONO y no en la etiqueta porque el icono es lo que
                se mira de reojo, y porque en la etiqueta empujaría la palabra
                fuera de sus 78 px.

                Existe desde que la cabecera no baja al teléfono (`piezas.css`,
                A-01): la campana vivía ahí, así que sin esto el aviso no tenía
                dónde verse antes de entrar. No dice CUÁNTOS —eso es la lista,
                y está a un toque—: dice que hay.
              */}
              <span className={`bottombar-ic${item.avisa ? ' avisa' : ''}`}>
                <Icon size={20} />
              </span>
              <span>{text}</span>
            </NavLink>
          );
        })}

        {rest.length > 0 && (
          <button
            type="button"
            className={`bottombar-item${restIsActive ? ' active' : ''}`}
            aria-expanded={more}
            onClick={() => setMore((v) => !v)}
          >
            <MoreHorizontal size={20} />
            <span>Más</span>
          </button>
        )}
      </nav>
    </>
  );
};
