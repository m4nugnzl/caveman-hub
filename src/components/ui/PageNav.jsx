import { useEffect, useState } from 'react';

/**
 * El índice de una pantalla larga: anclas pegajosas bajo la cabecera.
 *
 * ══ De dónde sale ══════════════════════════════════════════════════════════
 *
 * Era `Protocol/ProtoNav.jsx` y solo servía al protocolo. Sube a primitiva
 * porque la ficha del cliente tiene exactamente el mismo problema —siete bloques
 * apilados, dos rótulos de grupo y ningún mapa— y la alternativa era la copia:
 * dos observadores de desplazamiento con la misma constante mal sincronizada, que
 * es como este proyecto se ha ganado ya tres duplicaciones.
 *
 * ── Por qué anclas y no pestañas ────────────────────────────────────────────
 * Trocear en pestañas esconde lo que no está delante, y estas dos pantallas se
 * leen ENTERAS la primera vez —una decide tu forma de trabajar, la otra es todo
 * lo que sabes de una persona—. Las anclas dan el mapa sin quitar el papiro: todo
 * sigue en una pasada, y `#checkin` es enlazable (`/ajustes/protocolo#checkin`)
 * para señalar un bloque desde donde haga falta.
 *
 * ── Y por qué además CUENTA ─────────────────────────────────────────────────
 * Un índice que solo nombra apartados es un adorno: dice a dónde ir, no qué hay
 * allí. Con el número al lado —«El check-in · 4»— la barra contesta de un vistazo
 * la pregunta que traía uno al entrar sin recorrer la pantalla entera. No es un
 * dato nuevo: es el mismo que está más abajo, subido a donde se mira primero.
 *
 * `href` planos a propósito: el desplazamiento suave lo da el CSS (`html {
 * scroll-behavior: smooth }`) y la regla global de menos movimiento ya lo
 * neutraliza; no hace falta JavaScript para el salto.
 */

/**
 * La línea de corte, en píxeles desde arriba: por debajo de la barra pegajosa,
 * que es justo donde deja de verse una sección. Sale del mismo cálculo que el
 * `scroll-margin-top` de `.page-section` en el CSS; si uno cambia, el otro
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
const useApartadoVisible = (ids) => {
  /* La lista, en una cadena estable: `ids` es un array nuevo en cada render de
     quien llama, y sin esto el efecto se volvería a montar sesenta veces por
     segundo mientras se desplaza. */
  const clave = ids.join('|');
  const [aqui, setAqui] = useState(ids[0]);

  useEffect(() => {
    const lista = clave.split('|');
    let pedido = 0;

    const mirar = () => {
      pedido = 0;

      /* El final del documento no lo resuelve el umbral: si la última sección es
         más corta que la ventana, su borde superior no baja nunca hasta la
         línea y el índice se quedaría marcando la penúltima con el pie de
         página delante. Sin nada que desplazar, la activa es la última. */
      const restante = document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
      if (restante <= 2) {
        setAqui(lista[lista.length - 1]);
        return;
      }

      let visible = lista[0];
      for (const id of lista) {
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
  }, [clave]);

  return aqui;
};

/**
 * @param sections  `[{ id, label }]`. El `id` tiene que existir como `id` de una
 *   `<section className="page-section">` de la pantalla.
 * @param cuentas   Cuántas piezas hay en cada apartado, por `id`. No es la misma
 *   unidad en todos —servicios, pasos, módulos, preguntas— y no falta que lo
 *   sea: lo que se lee es «cuánto hay puesto aquí». Opcional.
 * @param label     Qué índice es, para quien navega a oídas.
 */
export const PageNav = ({ sections, cuentas = {}, label = 'Apartados de esta pantalla' }) => {
  const ids = sections.map((s) => s.id);
  const aqui = useApartadoVisible(ids);

  return (
    <nav className="page-nav" aria-label={label}>
      {sections.map(({ id, label: nombre }) => (
        <a
          key={id}
          className={`page-nav-link${aqui === id ? ' is-here' : ''}`}
          href={`#${id}`}
          aria-current={aqui === id ? 'true' : undefined}
        >
          {nombre}
          {cuentas[id] !== undefined && <span className="n">{cuentas[id]}</span>}
        </a>
      ))}
    </nav>
  );
};
