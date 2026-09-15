import { Link, useLocation } from 'react-router-dom';

import { clientProtocol, isServiceOn } from '@/domain/protocol';
import { CLIENT_SECTIONS, isSectionActive, sectionsFor } from '@/routes';
import { useAvisos } from '../useAvisos';
import { useDondeEstas } from '../useDondeEstas';

/**
 * EL CARRIL DEL PORTAL EN EL MONITOR — «el puesto» de `docs/la-sesion-manda.md`.
 *
 * ══ Qué sustituye, y por qué ═══════════════════════════════════════════════
 *
 * Aquí estuvo `CintaDelPortal`: una franja oscura de 52 px arriba con la marca,
 * los seis destinos y el avatar. Resolvía la navegación y dejaba sin resolver
 * lo que el prototipo del puesto le reprocha al monitor: que era la app del
 * teléfono estirada, una columna centrada con el sobrante en blanco, y que lo
 * que hace falta tener a la vista mientras se trabaja —dónde estás del bloque,
 * qué te queda de la semana— no estaba en ninguna parte.
 *
 * El dueño eligió el escritorio **tal cual el prototipo** (15 sep 2026), y el
 * prototipo pone la navegación en un carril a la izquierda que además sostiene
 * esas dos lecturas. Es el mismo recurso que ya usa el chasis del entrenador:
 * las filas son `.side-link` y el mueble va en `barra-tinta`, así que las dos
 * mitades del producto se navegan con la misma pieza.
 *
 * ══ Y se queda también entrenando ══════════════════════════════════════════
 *
 * La cinta se callaba en la sesión —«mientras entrenas, la app es esta
 * pantalla»—. El prototipo enseña el carril encendido al lado de la sesión, y
 * en un monitor tiene sentido: no hay pulgar que resbale, y lo que el carril
 * dice (el bloque, la semana) es justo el contexto de la sesión. En el teléfono
 * la regla de antes sigue igual: entrenando, la barra del pulgar se retira.
 *
 * ── Lo que se fue con la cinta ────────────────────────────────────────────
 *   · La marca del fabricante. En el portal del cliente no es suya.
 *   · La campana: lo que te espera se cuenta ahora en la fila de «Mi inicio»,
 *     que es donde está la lista — la misma cifra que lleva la barra lateral
 *     del entrenador en sus colas (`.side-count`).
 *   · El avatar suelto: tu nombre encabeza el carril y lleva a «Lo tuyo».
 */
export const CarrilDelPortal = () => {
  const { pathname } = useLocation();
  const { todo } = useAvisos();
  const donde = useDondeEstas();
  const cliente = donde.cliente;

  if (!cliente) return null;

  const protocolo = clientProtocol(cliente.preferences);
  const secciones = sectionsFor(CLIENT_SECTIONS, protocolo);
  const iniciales = (cliente.name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

  /* Lo que su entrenador le lleva, dicho como lo diría él: «Entreno y dieta». */
  const servicios = [
    isServiceOn(protocolo, 'training') ? 'Entreno' : null,
    isServiceOn(protocolo, 'nutrition') ? 'dieta' : null,
  ].filter(Boolean);
  const loQueLleva =
    servicios.length === 2 ? 'Entreno y dieta' : servicios[0] ? capital(servicios[0]) : null;

  const { bloque, unidad, vaPor, cuantos, resumen, pasos } = donde;
  const pasoDeFotos = pasos?.find((p) => p.id === 'fotos');
  const deLaSemana = [
    resumen?.asked ? `${resumen.count} de ${resumen.target} pesajes` : null,
    pasoDeFotos ? (pasoDeFotos.hecho ? 'fotos hechas' : 'fotos pendientes') : null,
  ].filter(Boolean);

  return (
    <Carril
      nombre={cliente.name}
      iniciales={iniciales}
      loQueLleva={loQueLleva}
      /* Por `isSectionActive` y no por prefijo: «Revisión» tiene dos niveles y
         bajar a las medidas dejaba el carril sin marcar. */
      secciones={secciones.map((s) => ({ ...s, aqui: isSectionActive(pathname, s, '/mi') }))}
      esperan={todo.length}
      donde={
        bloque
          ? {
              bloque: bloque.name,
              tramo: cuantos > 0 ? `${unidad.toLowerCase()} ${vaPor} de ${cuantos}` : null,
              parte: cuantos > 0 ? vaPor / cuantos : null,
            }
          : null
      }
      semana={deLaSemana.length > 0 ? deLaSemana.join(' · ') : null}
    />
  );
};

/**
 * EL CARRIL, pintado. Sin leer nada: lo que dice se lo dan hecho.
 *
 * Separado de la lectura para poder montarlo sin la aplicación entera detrás
 * —en una prueba o en una captura— y porque la lectura (`useDondeEstas`,
 * `useAvisos`) es la parte que cambia, y el mueble no.
 */
export const Carril = ({ nombre, iniciales, loQueLleva, secciones, esperan = 0, donde = null, semana = null }) => (
  <aside className="pc-carril barra-tinta" aria-label="Tu portal">
    <Link className="pc-carril-quien" to="/mi/tu">
      <span className="pc-carril-avatar" aria-hidden="true">
        {iniciales || '··'}
      </span>
      <span className="pc-carril-nombre">
        <b>{nombre}</b>
        {loQueLleva ? <span>{loQueLleva}</span> : null}
      </span>
    </Link>

    <nav className="pc-carril-nav" aria-label="Secciones de mi portal">
      {secciones.map(({ path, label, icon: Icono, aqui }) => {
        return (
          <Link
            key={path}
            to={`/mi/${path}`}
            className={`side-link${aqui ? ' active' : ''}`}
            aria-current={aqui ? 'page' : undefined}
          >
            {Icono ? <Icono size={15} /> : null}
            {label}
            {path === 'inicio' && esperan > 0 ? (
              <span className="side-count" aria-label={`te esperan ${esperan}`}>
                {esperan}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>

    {donde || semana ? (
      <div className="pc-carril-donde">
        {donde ? (
          <>
            <span className="pc-carril-k">Dónde estás</span>
            <span className="pc-carril-v">
              <b>{donde.bloque}</b>
              {donde.tramo ? ` · ${donde.tramo}` : ''}
            </span>
            {donde.parte !== null ? (
              <span className="pc-carril-riel" aria-hidden="true">
                <i style={{ width: `${donde.parte * 100}%` }} />
              </span>
            ) : null}
          </>
        ) : null}
        {semana ? (
          <>
            <span className="pc-carril-k">Esta semana</span>
            <span className="pc-carril-v">{semana}</span>
          </>
        ) : null}
      </div>
    ) : null}
  </aside>
);

const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
