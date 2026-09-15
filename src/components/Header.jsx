import { Search } from 'lucide-react';
import { paletteShortcut } from '@/lib/platform';
import { useApp } from '@/context/AppContext';
import { Logo } from '@/components/ui/Logo';
import { AccountMenu } from '@/components/AccountMenu';
import { useCommandPalette } from '@/components/ui/CommandPalette';

/**
 * La cabecera y sus dos piezas de trabajo.
 *
 * ── Una cabecera, dos monturas ──────────────────────────────────────────────
 * La franja clásica (`<Header/>`) navega el móvil, el portal del cliente y el
 * modo preview. En el escritorio del entrenador NO hay franja: sus dos piezas
 * útiles van DENTRO de la barra lateral —la búsqueda bajo la marca y la cuenta
 * al pie (ver `CoachLayout`)—. Una franja entera para un buscador y un avatar
 * era cromo vacío, y una barra de herramientas aparte para lo mismo repetía la
 * cabecera y le quitaba a la barra dos cosas que son suyas.
 *
 * Por eso este archivo exporta las piezas por separado: `Omnibox` y
 * `HeaderActions` se pintan en las dos monturas y no pueden divergir. Lo que
 * cambia entre ellas es el TRAJE de la cuenta, no la pieza: `variante="fila"`
 * la pinta como una fila con tu nombre —que es lo que pide el pie de una
 * columna— y por defecto es el círculo de la esquina.
 *
 * ── Qué se ha ido de la cabecera ────────────────────────────────────────────
 * · **El recuento de clientes.** «12 clientes» es un dato de la cartera, y en
 *   la cartera está, con su desglose.
 * · **El conmutador Entrenador/Cliente.** Pasó por el centro de la cabecera y
 *   por el menú de cuenta —donde no lo imaginaba nadie— y hoy vive con el
 *   cliente al que pertenece (`CoachLayout`, «Ver su portal»), además de en la
 *   paleta; la vuelta la lleva la barra del modo (`PreviewBar`).
 *
 * El botón de búsqueda existe además del atajo `⌘K` porque un atajo que no se
 * anuncia no lo descubre nadie; el propio botón lleva la tecla escrita.
 */
/*
  ── Un botón, no un falso campo ─────────────────────────────────────────────
  La búsqueda fue una caja ancha con pinta de input, y esa promesa era mentira:
  al pulsarla no se escribía AHÍ, se abría la paleta en el centro. Un campo que
  abre otro campo se siente como un salto; un BOTÓN que abre un diálogo es lo
  normal desde hace treinta años. Compacto, vive con las demás acciones de la
  esquina —buscar, avisos, cuenta— y le devuelve a la miga el sitio que el
  campo estirado ocupaba sobre vacío.
*/
export const Omnibox = () => {
  const palette = useCommandPalette();

  return (
    <button
      type="button"
      className="omnibox"
      aria-expanded={palette.open}
      title="Busca un cliente, una sección o una acción"
      onClick={() => palette.setOpen(true)}
    >
      <Search size={15} aria-hidden="true" />
      <span className="omnibox-label">Buscar</span>
      {/* `⌘` en Apple y `Ctrl` en el resto: ver `lib/platform.js`. */}
      <kbd className="kbd">{paletteShortcut()}</kbd>
    </button>
  );
};

export const HeaderActions = ({ variante = 'avatar' }) => (
  <div className={`row gap-2 shrink-0${variante === 'fila' ? ' is-fila' : ''}`}>
    {/*
      ── Y aquí vivió LA CAMPANA DEL CLIENTE ─────────────────────────────
      La lista de avisos del portal, colgada de esta esquina. Se ha ido con su
      montura: desde el 14 de septiembre esta franja no se pinta en el portal en
      ningún ancho (ver abajo), así que la campana no se montaba en ninguna
      pantalla y su lista no se leía en ninguna parte — que es justo la avería
      que dejó el rediseño.

      Esa lista tiene ahora pantalla, y es la que le corresponde: «Hoy», en la
      caja «De tu entrenador», en los dos aparatos. Ver `Client/ClientStart` y
      `Client/useAvisos`.
    */}
    {/*
      ── Aquí vivió LA NUBE ──────────────────────────────────────────────
      El estado de la red, montado aquí para salir a la vez en la cabecera del
      móvil y en el pie de la barra lateral. Se ha ido a una franja de página
      (`ui/EstadoDeRed`, montada por `App`), que llega igual a las tres
      monturas y no ocupa nada los días en que no hay nada que contar.
    */}
    {/*
      ── Y aquí vivió «CAMBIOS SIN CONFIRMAR» ────────────────────────────
      Una chapa ámbar, y tres cosas mal. Miraba `hasUnsavedChanges`, que
      incluye `saving`, y la cola emite `saving` desde la primera pulsación:
      se encendía al TECLEAR, no al fallar. Era ámbar en el chasis, que por la
      ley del color de la casa es un suspenso —y un guardado rechazado es una
      avería del sistema, no una nota que ponerle a nadie—. Y en el escritorio
      del entrenador salía en EL PIE DE LA BARRA, donde no la puso nadie: esta
      pieza se monta ahí entera por la campana y la cuenta, y la chapa iba de
      polizón.

      Lo que de verdad tenía que contar —hay red y el servidor ha rechazado
      algo— lo dice ahora la franja (`ui/EstadoDeRed`), que llega a las tres
      monturas, aparece solo cuando pasa y trae el «Reintentar» al lado.
    */}
    <AccountMenu variante={variante} />
  </div>
);

/**
 * LA FRANJA, y hoy es de UN solo sitio: el teléfono del entrenador.
 *
 * ── Los tres sitios donde vivió, y por qué quedan cero portales ────────────
 * Navegó el móvil, el portal del cliente y el modo preview. En el portal llegó
 * a llevar dentro el raíl de sus secciones, que fue la respuesta correcta
 * mientras el portal usaba el chasis de la casa; desde el
 * rediseño del 14 de septiembre de 2026 el portal tiene el suyo en cada aparato
 * y esta franja no se monta allí en ningún ancho (ver abajo).
 *
 * En el escritorio del entrenador tampoco hay franja: sus dos piezas útiles van
 * dentro de la barra lateral (`CoachLayout`).
 */
export const Header = () => {
  const { view } = useApp();

  /*
    ══ EN EL PORTAL DEL CLIENTE NO HAY FRANJA (14 sep 2026) ══════════════════

    Ni una oculta. El portal rediseñado trae su propio chasis en los dos
    aparatos —el carril lateral en el monitor (`pc/CarrilDelPortal`, que desde el
    15 sep sustituye a la cinta oscura de arriba) y ninguna cabecera en el
    teléfono, donde navega la barra del pulgar— así que esta franja no tiene nada
    que hacer ahí: lo que de sus piezas significa algo en el portal (tu nombre y
    tu cuenta) vive ya dentro del carril.

    Hasta ahora se montaba igual y se tapaba con CSS. Tapada seguía costando lo
    mismo: un segundo `<nav>` con el mismo rótulo —«Secciones de mi portal»— en
    el árbol, y el carril midiéndose a sí mismo en cada render para colocar una
    marca que nadie ve. Ver `Client/ClientLayout`.

    La salida del modo preview no depende de esto: la lleva `PreviewBar`, que se
    monta aparte en `App.jsx` justo por eso.
  */
  if (view === 'client') return null;

  return (
    <header className="app-header">
      <Logo subtitle={null} />
      <Omnibox />
      <HeaderActions />
    </header>
  );
};
