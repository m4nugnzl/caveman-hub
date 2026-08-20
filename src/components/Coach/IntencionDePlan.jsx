import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { leerIntencion, olvidarIntencion } from '@/lib/intencionDePlan';

/**
 * Lleva a la pantalla del plan a quien venía de la portada a contratar algo.
 *
 * No pinta nada: es un efecto con forma de componente, para que pueda usar
 * `useNavigate` y para que solo exista cuando existe el panel del entrenador.
 *
 * ══ Por qué esto no está en `PlanPanel` ════════════════════════════════════
 *
 * Porque el caso que hay que resolver es justamente **que no se llega a
 * `PlanPanel`**: la ruta se pierde durante el montaje y la aplicación acaba en
 * «Hoy». Un efecto dentro de esa pantalla no puede arreglar no haber llegado a
 * esa pantalla.
 *
 * ══ La intención se borra SIEMPRE ══════════════════════════════════════════
 *
 * También cuando no hay que navegar porque ya estamos en el sitio. Si solo se
 * borrara al navegar, el caso en que la ruta SÍ sobrevive dejaría la intención
 * guardada para siempre, y a la semana siguiente cualquier visita a «Hoy»
 * secuestraría al usuario hacia la pasarela. Se cumple una vez y se olvida.
 *
 * El plan viaja a la pantalla del plan por la URL —no leyéndolo otra vez de
 * `localStorage`—, así que quien decide sigue siendo la dirección y esto es solo
 * lo que la repone cuando se perdió.
 */
export const IntencionDePlan = ({ children }) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  /* Una sola vez por sesión de la aplicación. Sin esto, el `navigate` cambia la
     ruta, el efecto se vuelve a ejecutar y la comprobación de abajo depende de
     que el borrado haya llegado antes. Con la marca, no depende de nada. */
  const hecho = useRef(false);

  /*
    ══ Por qué esto tapa la pantalla ══════════════════════════════════════════

    Porque el efecto de abajo corre DESPUÉS del primer pintado, y en ese hueco se
    ve la pantalla por defecto del entrenador —la cartera vacía de alguien que
    acaba de registrarse— durante un instante, antes de saltar al pago. Se lee
    como un tropiezo de la aplicación justo en el gesto donde menos conviene.

    Se decide en el INICIALIZADOR, no en un efecto: así el primer render ya sabe
    que hay algo pendiente y esa pantalla no llega a pintarse nunca.
  */
  const [tapando, setTapando] = useState(
    () => Boolean(leerIntencion()) && !window.location.pathname.startsWith('/ajustes/plan')
  );

  useEffect(() => {
    if (hecho.current) return;

    const intencion = leerIntencion();
    if (!intencion) return;

    hecho.current = true;
    olvidarIntencion();

    if (pathname.startsWith('/ajustes/plan')) return;

    navigate(
      `/ajustes/plan?contratar=${encodeURIComponent(intencion.plan)}` +
        (intencion.periodo === 'year' ? '&periodo=year' : ''),
      { replace: true }
    );
    /* Se destapa en el mismo lote que la navegación, así que lo siguiente que se
       pinta ya es la pantalla del plan con su propio «abriendo el pago». No hay
       un fotograma intermedio entre las dos esperas. */
    setTapando(false);
  }, [pathname, navigate]);

  /* Envuelve al árbol de rutas en vez de convivir con él: si solo se pusiera al
     lado, la pantalla de debajo se pintaría igual y el destello seguiría ahí,
     con el aviso encima. */
  if (!tapando) return children;

  /* Mismo vocabulario que el respaldo de `Suspense` en `App`: una línea sobria.
     Aquí no se anima nada porque esto dura lo que tarda un efecto en correr. */
  return (
    <div className="layout">
      <p className="t-sm t-tertiary">Preparando tu plan…</p>
    </div>
  );
};
