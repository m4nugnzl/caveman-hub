import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

import { useBarraPlegada } from '@/lib/barraPlegada';
import { modifierKey } from '@/lib/platform';

/**
 * ENSANCHAR LA HOJA: el mando del ancho, en la esquina de la cinta.
 *
 * ══ De la costura al lienzo ════════════════════════════════════════════════
 *
 * Estuvo en el canto entre la barra y la página, una pastilla fija montada
 * sobre el filete. Dos quejas del dueño y las dos ciertas:
 *
 *   · «Ha de estar en el lienzo, no en el borde entre el lienzo y la barra
 *     lateral, queda impostado ahí.» Un objeto flotando en la costura no es de
 *     nadie: ni de la barra, que no tiene mandos, ni de la página, que empieza
 *     22 px más allá. Y para llegar a él había que salir del trabajo y apuntar
 *     a un canto de 22 px de ancho.
 *   · «Carece de sentido: le das y no aumenta el tamaño, solo se desplaza.»
 *     Literal. La hoja tiene tope fijo, así que los 192 px que soltaba la barra
 *     se quedaban en la mesa y el trabajo se corría a la izquierda sin crecer.
 *
 * Ahora vive EN CABEZA DE LA CINTA —la línea con la que arrancan las once
 * pantallas—, delante del título. Sigue siendo del chasis y no de la pantalla
 * —el mismo botón, en el mismo punto, en todas—, pero se pulsa dentro del papel
 * en el que se trabaja. Y lo que promete lo cumple: plegada la barra, la hoja
 * se lleva los 192 px que ella suelta (`chasis.css`).
 *
 * ── Y a la izquierda, que es por donde crece ───────────────────────────────
 * Estuvo un rato a la derecha, en el canto de la hoja, con el argumento de que
 * es donde una ventana pone su «maximizar». El dueño midió lo que yo no: «la
 * hoja se expande desde la parte izquierda del lienzo, en la derecha no le veo
 * sentido». Y es exacto — el canto derecho no se mueve un píxel (1884 px
 * plegada y sin plegar); lo que se abre es el izquierdo, que se corre de 280 a
 * 88. Un mando de ancho en el lado quieto hace mirar a un sitio y ver el cambio
 * en el contrario. En cabeza cae encima del canto que se mueve.
 *
 * ── Y en su propia CALLE, no en el canalillo ni en la fila ─────────────────
 * Las dos maneras de meterlo en la línea del titular dejan algo fuera de plomo,
 * y se midieron con el marcado real: en el canalillo el mando se queda en 30 px
 * pegado al canto del papel mientras las filas de debajo van en 48 —una mota,
 * no un botón—; dentro de la fila (que es lo que hace Coachway) el título se va
 * a 97 px y su propia tabla se queda en 48, o sea el «muy intrusivo» de la otra
 * vez.
 *
 * Coachway puede porque su icono no está en la hoja sino en una franja de
 * marco. Nosotros retiramos esa franja a propósito, así que la traducción es
 * una CALLE: `--carril-chasis`, una lane vacía por dentro del canto izquierdo
 * que comparten la cinta y el cuerpo de la página. El trabajo vuelve a empezar
 * todo en la misma vertical y no lo paga el contenido: la hoja crece hacia
 * fuera lo mismo que sangra hacia dentro, así que la columna mide lo que medía
 * (ver `--carril-chasis` en `tokens.css`).
 *
 * El mando ocupa la calle Y el sangrado —del canto del papel al borde de la
 * columna—, no solo la calle. Con la caja midiendo la calle a secas quedaba a
 * plomo la CAJA pero no el icono: se iba a 32 px del canto y a 9 del avatar, y
 * de tan pegado a la persona se leía como el primer elemento de la fila. Con
 * el hueco entero el aire es parejo (21 y 20) y la diana llega al borde.
 *
 * ── El icono es el del panel, y no dos flechas ─────────────────────────────
 * Salió con `ChevronsLeftRight`/`ChevronsRightLeft` —«ensanchar» y «estrechar»,
 * que es lo que hace desde aquí—, y a 15 px esas dos flechas se dibujan `<>`:
 * el signo universal de «código». En la esquina de una cinta de entrenamiento,
 * eso no se lee, se traduce mal. El icono del panel es el que lleva este mando
 * en todas partes y además DIBUJA el reparto de la pantalla, que es lo que la
 * flecha no puede hacer desde 1.500 px de distancia de la barra. El rótulo dice
 * las dos mitades del trato, que es lo que el icono no cuenta: qué gana la hoja
 * y qué pierde la barra.
 *
 * Solo en escritorio: sin barra lateral no hay nada que plegar, y el CSS lo
 * esconde por debajo de 1024 px (`.pliegue`, en `chasis.css`).
 */
export const Pliegue = () => {
  const [plegada, alternar] = useBarraPlegada();
  const dice = plegada
    ? 'Estrechar la hoja y devolver la barra con sus nombres'
    : 'Ensanchar la hoja y plegar la barra a iconos';

  /* El atajo, escrito en el propio mando: es como se descubre que existe, igual
     que el `⌘K` va escrito en el botón de buscar. En el rótulo largo y no en el
     accesible, que un lector de pantalla no navega con el ratón. */
  return (
    <button
      type="button"
      className="pliegue"
      onClick={alternar}
      aria-pressed={plegada}
      title={`${dice}  (${modifierKey()} + \\)`}
    >
      {/* 15, la medida de los signos de la casa. En el canalillo de 22 px iba a
          13 para no rozar el filete; con la calle hay sitio y un icono de 13 en
          una esquina de 34 se leía como un desperdicio de pantalla. */}
      {plegada ? <PanelLeftOpen size={15} aria-hidden="true" /> : <PanelLeftClose size={15} aria-hidden="true" />}
      <span className="sr-only">{dice}</span>
    </button>
  );
};
