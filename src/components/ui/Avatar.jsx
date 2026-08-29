import { initials } from '@/lib/initials';

/**
 * La cara de una persona, en un solo sitio.
 *
 * ── Por qué existe ──────────────────────────────────────────────────────────
 * Había siete formas de pintar unas iniciales —`.mark`, `.folio-mark`,
 * `.account-avatar`, un `style` en línea en el selector de clientes…— y todas
 * grises. Veinte personas en gris son veinte manchas iguales: la aplicación
 * hablaba de personas y no se veía a ninguna.
 *
 * Ahora una persona tiene UN color, estable, que sale de su nombre: Nerea es
 * siempre del mismo tono en Inicio, en la lista, en su ficha y en el hilo. No
 * es decoración: es lo que permite reconocer a alguien de un vistazo en una
 * fila de veinte, que es lo que hace un color de verdad en una cara.
 *
 * Si hay foto (`src`), la foto manda y el color queda detrás como fondo
 * mientras carga.
 *
 * @param name   El nombre, para las iniciales y el tono.
 * @param src    Una URL de foto, opcional.
 * @param size   `xs` 24 · `sm` 30 · `md` 38 · `lg` 56 · `xl` 72.
 */
const TONOS = 8;

const tono = (name) => {
  let h = 0;
  for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % TONOS;
};

export const Avatar = ({ name, src = null, size = 'sm', className = '', ...rest }) => (
  <span
    className={['avatar', `is-${size}`, className].filter(Boolean).join(' ')}
    data-tono={tono(name)}
    aria-hidden="true"
    {...rest}
  >
    {src ? <img src={src} alt="" loading="lazy" /> : initials(name)}
  </span>
);
