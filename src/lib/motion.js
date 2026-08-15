/**
 * Movimiento, respetando a quien ha pedido que haya poco.
 *
 * ══ Por qué esto no lo puede resolver el CSS ════════════════════════════════
 *
 * `@media (prefers-reduced-motion: reduce)` alcanza a todo lo que se declara en
 * la hoja de estilos: transiciones, animaciones, y el `scroll-behavior` escrito
 * en CSS.
 *
 * Lo que NO alcanza es un desplazamiento pedido desde JavaScript:
 *
 *     elemento.scrollIntoView({ behavior: 'smooth' })
 *
 * Ahí el `behavior` va en la llamada y le da igual lo que diga el CSS. Es el
 * único movimiento de esta interfaz que se le escapaba a la regla, y es de los
 * peores para quien se marea: un salto largo de página, animado, que además no
 * ha pedido —ocurre solo, al abrir la analítica o al crear una invitación—.
 *
 * ══ Por qué se pregunta en cada llamada ════════════════════════════════════
 *
 * Y no una vez al arrancar: la preferencia se puede cambiar con la aplicación
 * abierta —en Windows y en macOS es un interruptor del sistema— y guardarla en
 * una constante dejaría a quien la active a mitad de sesión con el
 * comportamiento anterior hasta que recargue.
 *
 * `matchMedia` no existe en el render de servidor ni en las pruebas, así que se
 * comprueba antes: sin él, se asume que NO hay preferencia, que es lo que hace
 * el navegador por defecto.
 */

export const prefiereMenosMovimiento = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Lleva un elemento a la vista.
 *
 * Misma firma que `scrollIntoView`, y hace lo mismo salvo por una cosa: si la
 * persona ha pedido menos movimiento, salta en vez de deslizarse. Llega al mismo
 * sitio; lo que se quita es el trayecto.
 */
export const traeALaVista = (elemento, opciones = {}) => {
  if (!elemento) return;
  elemento.scrollIntoView({
    ...opciones,
    behavior: prefiereMenosMovimiento() ? 'auto' : opciones.behavior || 'auto',
  });
};
