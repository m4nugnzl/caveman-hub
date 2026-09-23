import { useMarcaDeslizante } from '@/components/ui/carril';
import { Nube } from '@/components/ui/EstadoDeRed';

/**
 * LA CINTA: la cabecera con la que arranca toda pantalla de lista del panel.
 *
 * ══ Por qué es la MISMA pieza que la de la cartera ═════════════════════════
 *
 * Porque el dueño ya pagó esa lección en `/clientes`: cuando cada pantalla
 * traía su propia cabecera —con su sangrado, su peso de titular y su altura—,
 * saltar de una lista a otra movía el nombre de sitio. «Están en distinta
 * posición que resumen» fue la frase, y la respuesta fue unificar la cinta del
 * expediente y la de la cartera en `chasis.css`.
 *
 * El Taller son tres puertas más. Si cada una se dibujara su banda, tendríamos
 * el mismo problema multiplicado por tres. Así que se monta el traje que ya
 * existe (`.cartera-cab`) y `.cinta-pagina` queda solo como asidero para lo que
 * sea propio de estas pantallas.
 *
 * ══ LOS TRAMOS VAN EN LA LÍNEA DEL TITULAR, y no debajo ════════════════════
 *
 * Vivieron en su propio raíl bajo el nombre, y eso costaba una banda entera de
 * altura para no decir nada más. Medido en `/alimentos` a 1920: el titular
 * ocupaba una línea de 64 px con «Librería» a la izquierda y «Nuevo alimento» a
 * 1.400 px de distancia, y **entre las dos no había nada**. Una cinta con un
 * agujero en medio y una segunda fila debajo para lo que cabía en el agujero.
 *
 * Ahora la cinta es UNA línea: dónde estás, qué mitad miras y el verbo. El raíl
 * conserva su anatomía —se posa sobre el filete, la marca azul lo muerde— y por
 * eso `align-self: stretch` y no un centrado: el subrayado tiene que caer en el
 * borde de la cabecera, que es lo que hace que se lea como navegación y no como
 * un grupo de botones sueltos al lado de un título.
 *
 * Y esto no es una excepción de esta pantalla: `ClientPortfolio` monta la misma
 * anatomía con su marcado, así que la cartera y el Taller siguen arrancando
 * igual. La cinta del CLIENTE no cambia, y a propósito — allí el raíl son cinco
 * DESTINOS a los que se va, no dos tramos de la lista que ya estás mirando.
 *
 * ── Los tramos, solo si hay más de uno ─────────────────────────────────────
 * Un carril de una pestaña no es una navegación: es un rótulo con caja. Con un
 * tramo, la banda es el nombre y su verbo.
 *
 * ── Y la cifra, solo en el tramo donde NO estás ────────────────────────────
 * En la Librería, «Alimentos 314» era exactamente la suma de las dos chapas que
 * hay treinta píxeles más abajo —«Tuyos 107» y «Del catálogo 207»—: el mismo
 * número, dicho entero arriba y desglosado debajo, y encima el de arriba no se
 * puede pulsar. La cifra de un tramo solo informa de lo que no estás viendo:
 * cuánto hay detrás de la otra pestaña. La del tramo activo lo dice mejor el
 * filtro, que además acota.
 *
 * @param titulo   El nombre de la pantalla, en el hueco donde en el expediente
 *   va el de la persona.
 * @param tramos   `[{ id, label, n }]`. `n` sale como cifra en cápsula, como
 *   en la cartera; sin cifra, no se pinta.
 * @param accion   Lo que se puede hacer con la lista entera (el alta), al lado
 *   del nombre: una pantalla tiene UNA acción primaria.
 */
export const Cinta = ({ titulo, tramos = [], tramo, onTramo, accion = null }) => {
  const carril = useMarcaDeslizante();

  return (
    <header className="cartera-cab cinta-pagina">
      <div className="cartera-cab-in">
        <div className="cartera-cab-linea">
          {/* Aquí estuvo el mando del ancho. Vive ahora en la fila de la marca
              de la barra lateral, montado una sola vez para toda la
              aplicación: es el mando de la barra, no de esta cinta, y aquí le
              cobraba a cada pantalla una calle de sangrado. Ver `ui/Pliegue`. */}
          <h1 className="cartera-cab-titulo">{titulo}</h1>
          {/* La nube va con el título, como en las otras dos cintas. Ver
              `ui/EstadoDeRed`. */}
          <Nube />

          {tramos.length > 1 && (
            <nav
              ref={carril}
              className="tabs tramos cartera-cab-tabs"
              role="tablist"
              aria-label={`Qué se ve de ${titulo.toLowerCase()}`}
            >
              {tramos.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  className="tab"
                  aria-selected={tramo === t.id}
                  onClick={() => onTramo(t.id)}
                >
                  {t.label}
                  {typeof t.n === 'number' && tramo !== t.id && (
                    <span className="chip-count">{t.n}</span>
                  )}
                </button>
              ))}
              <span className="tabs-marca" aria-hidden="true" />
            </nav>
          )}

          {/* La esquina, para el verbo de la pantalla si lo trae. Lo que no
              puede faltar nunca —el estado de la red y el mando del ancho— vive
              arriba a la izquierda, con el título. */}
          {accion && <div className="cartera-cab-acciones">{accion}</div>}
        </div>
      </div>
    </header>
  );
};
