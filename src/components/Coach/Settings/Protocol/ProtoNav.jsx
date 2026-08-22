import { useEffect, useState } from 'react';

/**
 * El índice del protocolo: cinco anclas pegajosas bajo la cabecera.
 *
 * ── Por qué anclas y no pestañas ────────────────────────────────────────────
 * El panel eran ocho bloques apilados sin mapa: para tocar el check-in había
 * que reconocer la pantalla entera bajando a ciegas. Trocearlo en pestañas
 * escondería lo que no está delante —y este panel se lee entero la primera
 * vez, que es cuando se decide la forma de trabajar—. Las anclas dan el mapa
 * sin quitar el papiro: todo sigue en una pasada, y `#checkin` es enlazable
 * (/ajustes/protocolo#checkin) para señalar un bloque desde donde haga falta.
 *
 * ── Y por qué además CUENTA ─────────────────────────────────────────────────
 * Un índice que solo nombra apartados es un adorno: dice a dónde ir, no qué hay
 * allí. Con el número al lado —«El check-in · 4»— la barra contesta de un
 * vistazo la pregunta que traía uno al entrar («¿qué le estoy pidiendo a esta
 * gente?») sin recorrer la pantalla entera. No es un dato nuevo: es el mismo
 * que está más abajo, subido a donde se mira primero.
 *
 * `href` planos a propósito: el desplazamiento suave lo da el CSS (`html {
 * scroll-behavior: smooth }`) y la regla global de menos movimiento ya lo
 * neutraliza; no hace falta JavaScript para el salto.
 */
const SECCIONES = [
  { id: 'servicios', label: 'Qué llevas' },
  { id: 'alta', label: 'El alta' },
  { id: 'app', label: 'La aplicación' },
  { id: 'sesion', label: 'La sesión' },
  { id: 'checkin', label: 'El check-in' },
];

const IDS = SECCIONES.map((s) => s.id);

/**
 * La línea de corte, en píxeles desde arriba: por debajo de la barra pegajosa,
 * que es justo donde deja de verse una sección. Sale del mismo cálculo que el
 * `scroll-margin-top` de `.proto-section` en el CSS; si uno cambia, el otro
 * también.
 */
const LINEA = 140;

/**
 * En qué apartado está uno.
 *
 * ── Por qué a mano y no con IntersectionObserver ────────────────────────────
 * Porque la pregunta no es «¿se ve esta sección?» —a media pantalla se ven dos o
 * tres— sino «¿cuál es la última que ha cruzado la barra?», y eso es una
 * comparación de posiciones, no una intersección. Con el observador habría que
 * emular esa regla con un `rootMargin` negativo elegido a ojo y aun así fallaría
 * al final del documento, donde la última sección puede ser más corta que lo que
 * queda de ventana y su borde nunca llega a la línea.
 *
 * Se lee en `requestAnimationFrame` para no medir el diseño en cada evento de
 * desplazamiento: `getBoundingClientRect` fuerza un recálculo, y sesenta por
 * segundo es lo que separa esto de un `scroll` que se nota.
 */
const useApartadoVisible = () => {
  const [aqui, setAqui] = useState(IDS[0]);

  useEffect(() => {
    let pedido = 0;

    const mirar = () => {
      pedido = 0;

      /* El final del documento no lo resuelve el umbral: si la última sección es
         más corta que la ventana, su borde superior no baja nunca hasta la
         línea y el índice se quedaría marcando la penúltima con el pie de
         página delante. Sin nada que desplazar, la activa es la última. */
      const restante = document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
      if (restante <= 2) {
        setAqui(IDS[IDS.length - 1]);
        return;
      }

      let visible = IDS[0];
      for (const id of IDS) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= LINEA) visible = id;
      }
      setAqui(visible);
    };

    const alMover = () => {
      if (!pedido) pedido = requestAnimationFrame(mirar);
    };

    mirar();
    window.addEventListener('scroll', alMover, { passive: true });
    window.addEventListener('resize', alMover);
    return () => {
      if (pedido) cancelAnimationFrame(pedido);
      window.removeEventListener('scroll', alMover);
      window.removeEventListener('resize', alMover);
    };
  }, []);

  return aqui;
};

/**
 * @param cuentas  Cuántas piezas activas hay en cada apartado, por `id`. No es
 *   la misma unidad en todos —servicios, pasos, módulos, preguntas— y no falta
 *   que lo sea: lo que se lee es «cuánto hay puesto aquí».
 */
export const ProtoNav = ({ cuentas = {} }) => {
  const aqui = useApartadoVisible();

  return (
    <nav className="proto-nav" aria-label="Apartados del protocolo">
      {SECCIONES.map(({ id, label }) => (
        <a
          key={id}
          className={`proto-nav-link${aqui === id ? ' is-here' : ''}`}
          href={`#${id}`}
          aria-current={aqui === id ? 'true' : undefined}
        >
          {label}
          {cuentas[id] !== undefined && <span className="n">{cuentas[id]}</span>}
        </a>
      ))}
    </nav>
  );
};
