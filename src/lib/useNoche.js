import { useLayoutEffect } from 'react';

/**
 * Pone la página de noche mientras el componente esté montado.
 *
 * ══ Por qué vive aquí y no dentro de la portada ═════════════════════════════
 *
 * Porque lo usan las DOS pantallas que ve alguien sin sesión: la portada y el
 * acceso. Y tienen que ir del mismo color por el mismo motivo por el que la
 * portada va de noche: quien pulsa «Empezar gratis» sobre un lienzo negro y
 * aterriza en un formulario blanco no lee «he cambiado de pantalla», lee «he
 * cambiado de sitio». Dentro de la aplicación sigue mandando el tema del usuario.
 *
 * ══ Los tres detalles que lo hacen funcionar ════════════════════════════════
 *
 *   · La clase va en el elemento RAÍZ, no en el contenedor de la página. Los
 *     tokens tienen que alcanzar también al `<body>`: si solo se pintara el
 *     contenedor, el lienzo claro asomaría al rebotar el desplazamiento y detrás
 *     de la barra del navegador.
 *
 *   · Se actualiza `theme-color`, que es lo que colorea esa barra en el móvil.
 *     Sin ello se queda del color del tema del usuario y la pantalla aparece
 *     partida en dos por arriba.
 *
 *   · Y va en `useLayoutEffect`, no en `useEffect`: con el segundo, el navegador
 *     pinta un fotograma con el tema del visitante antes de que la clase llegue,
 *     y quien tenga el claro puesto ve un destello blanco al abrir. Es la primera
 *     impresión del producto; no puede empezar con un parpadeo.
 *
 * Se deshace entero al salir: quien entra desde aquí al producto tiene que
 * encontrarse su tema, no el de la página de captación.
 */
export const useNoche = () => {
  useLayoutEffect(() => {
    const raiz = document.documentElement;
    const meta = document.querySelector('meta[name="theme-color"]');
    const antes = meta?.getAttribute('content');

    raiz.classList.add('lp-noche');
    const canvas = getComputedStyle(raiz).getPropertyValue('--canvas').trim();
    if (meta && canvas) meta.setAttribute('content', canvas);

    return () => {
      raiz.classList.remove('lp-noche');
      if (meta && antes) meta.setAttribute('content', antes);
    };
  }, []);
};
