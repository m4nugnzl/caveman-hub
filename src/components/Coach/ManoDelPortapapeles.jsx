import { useEffect, useRef, useState } from 'react';
import {
  CalendarRange,
  Clipboard,
  Dumbbell,
  FolderOpen,
  Layers,
  Utensils,
  UtensilsCrossed,
  X,
} from 'lucide-react';

import { useClickOutside } from '@/lib/useClickOutside';
import { useMediaQuery } from '@/lib/useMediaQuery';
import {
  NOMBRE_DE_TIPO,
  TIPO,
  arrastrarPieza,
  quitar,
  soltarPieza,
  useDestinoVigente,
  usePortapapeles,
  vaciar,
} from '@/lib/portapapeles';
import { loQueLleva, seReparte, sustituye } from '@/domain/reparto';
import {
  EL_CAJON,
  sePuedeGuardar,
  useGuardarEnPlantillas,
} from '@/components/Coach/guardarEnPlantillas';
import { MandarLaPieza } from '@/components/Coach/MandarLaPieza';

/**
 * LA MANO: lo que llevas copiado, sin ponerse en medio.
 *
 * ══ No es un cajón, es una mano ═════════════════════════════════════════════
 *
 * La primera versión de esto era una bandeja: nacía abierta con la primera
 * pieza y se quedaba —320 × 250 px de superficie, cabecera y canto— sobre el
 * trabajo hasta que se vaciara, en todas las pantallas y hubiera o no dónde
 * pegar. El fallo era de categoría: estaba dibujada como un SITIO cuando lo que
 * representa es lo que llevas EN LA MANO —dos o tres cosas, un rato, de camino
 * a otro lado—. Un sitio pide superficie; una mano pide peso, y el peso se dice
 * con un número.
 *
 * ══ EL PESO SE QUEDA; LA OFERTA SE APAGA ════════════════════════════════════
 *
 * La segunda versión ya era una píldora, pero dejaba el verbo encendido en azul
 * todo el rato: *«demasiado intrusivo, siempre está ahí; donde se puede pegar
 * nunca para»*. Y era verdad. La avería estaba en haber mezclado dos cosas que
 * no pesan igual:
 *
 *   · **Lo que llevas es un HECHO.** Se queda —por eso existe la mano— y por
 *     eso se dice pequeño: un icono y una cifra, sin color y sin frase.
 *   · **Que aquí quepa es una OFERTA.** Y una oferta que no se apaga deja de
 *     ser oferta: pasa a ser mobiliario, y encima en azul y en la esquina.
 *
 * La ley ya estaba escrita en la casa y solo faltaba aplicarla aquí: **en
 * reposo no está**. Es la de las casillas del lote en la cartera —trece cuadros
 * vacíos por el canto izquierdo eran lo primero que veía el ojo, así que
 * aparecen al acercarse y se quedan puestas las marcadas, apagadas con
 * `opacity` y no con `visibility` para que el ratón y el tabulador sigan
 * llegando—. Aquí, igual: en reposo no hay verbo, ni color, ni «vaciar»; salen
 * al acercarse y se van al irte.
 *
 * Para que la oferta no haya que descubrirla a ciegas, se dice UNA vez: al
 * llegar a un sitio donde cabe algo de lo que llevas, la mano lo enseña dos
 * segundos y medio y se calla. Solo en el CANTO —de «aquí no cabe» a «aquí
 * cabe»—, así que recorrer las cuatro hojas de un bloque no la repite cuatro
 * veces, que es exactamente lo que se sentía como «nunca para».
 *
 * ══ Las siete leyes ═════════════════════════════════════════════════════════
 *
 *  I   La mano se ve; el cajón se abre. En reposo, el peso: un icono y una
 *      cifra. La lista está a un clic, hacia arriba, y se cierra al usarla.
 *  II  El aviso es de lo que CAMBIA; la mano, de lo que LLEVAS. Copiar no saca
 *      aviso: la mano nombra dos segundos lo que ha entrado y se calla. Pegar
 *      sí lo saca, porque escribe en el programa de alguien.
 *  III Un mostrador a la vez. El centro del pie es del lote (`.p-lote`); la
 *      esquina derecha, de la mano. Con el mostrador levantado, la mano se
 *      apoya encima de él (`--lote-apoyo`), no a su lado.
 *  IV  Callarse es la mitad del trabajo. En reposo no hay verbo ni color; sin
 *      destino, en el teléfono ni aparece.
 *  V   Cuando se dice, se dice entero: «Pegar «Sentadilla» en Lower A», nunca
 *      un «Pegar» a secas. Caja encendida y verbo en azul, que es la ley de los
 *      gestos de la casa — sin inventar una forma nueva.
 *  VI  Una pieza no se elige. Se nombra la pieza cuando aquí cabe UNA —«Pegar
 *      «Push B» en Bloque 2»—, porque entonces el nombre es lo que va a pasar
 *      al pulsar. Cuando caben dos o más no se nombra ninguna: elegir la
 *      primera es elegir por el entrenador. Se dice el sitio y se abre la lista
 *      («Pegar en Bloque 2…»), que es donde cada fila lleva su propio verbo.
 *  VII **Una pieza se abre.** Y es lo que corrige la ley VI de la vuelta
 *      anterior, que decía que con UNA pieza no hay lista siquiera. Aquel
 *      argumento era bueno mientras el cajón fuera una lista de nombres: *«¿qué
 *      sentido tiene que además te muestre el ver más?»* — ninguno, porque la
 *      fila repetía el nombre que la píldora ya estaba diciendo.
 *
 *      Ya no lo repite. Una pieza abierta enseña **lo que lleva dentro** —los
 *      ejercicios de la hoja, las series del ejercicio, las comidas del día— y
 *      **lo que se puede hacer con ella**: pegarla aquí, ponerla en varios
 *      clientes o guardarla en tus plantillas. Nada de eso cabe en una píldora
 *      de una línea, así que con una sola pieza el cajón deja de ser una lista
 *      de uno y pasa a ser su ficha. Lo que no cambia es la píldora: sigue
 *      pegando de un clic, así que nada de lo de antes se ha hecho más lento.
 *
 * ══ Sigue sin adivinar el destino ═══════════════════════════════════════════
 *
 * Que aquí haya un verbo no significa que la mano sepa pegar: lo que puede
 * hacerse con una hoja copiada depende de dónde estés, y eso lo dice la
 * pantalla registrándose (`useDestino` en `lib/portapapeles`). La mano solo
 * PRESENTA lo que el destino vigente acepta. Los verbos siguen viviendo también
 * donde caen las cosas, al lado de sus hermanos («+ hoja», «+ comida»).
 *
 * ══ Y por qué vive en `Coach/` y no en `ui/` ════════════════════════════════
 *
 * Porque desde que ofrece «Poner en varios» y «Guardar en plantillas» escribe
 * en el trabajo de la gente y lee del contexto. Ya se montaba solo para el
 * entrenador (`{isCoach && …}` en `App.jsx`); lo que faltaba era que el fichero
 * lo dijera. `ui/` no importa de `Coach/` en ninguna parte y no va a empezar
 * por aquí. El `Destino` —que no sabe nada de nadie— se queda donde estaba.
 */

const ICONO = {
  [TIPO.EJERCICIO]: Dumbbell,
  [TIPO.HOJA]: Layers,
  [TIPO.BLOQUE]: FolderOpen,
  [TIPO.COMIDA]: Utensils,
  /* El mismo que su tramo de `/plantillas` (`DIBUJO`): la plantilla y la pieza
     en la mano son la misma cosa con y sin caducidad. */
  [TIPO.PLATO]: UtensilsCrossed,
  [TIPO.DIA_DIETA]: CalendarRange,
};

/* Cuánto dura la voz de la copia. Dos segundos largos: lo justo para leer un
   nombre de reojo mientras ya se está navegando a otro sitio, que es lo que se
   hace justo después de copiar. */
const LO_QUE_DURA_LA_VOZ = 2200;

/* Y cuánto dura la oferta al llegar. Un pelo más, porque es una frase más larga
   y encima no la esperabas: la copia la has pedido tú, esto te lo cuentan. */
const LO_QUE_DURA_LA_OFERTA = 2600;

export const ManoDelPortapapeles = () => {
  const guardarEnPlantillas = useGuardarEnPlantillas();
  const piezas = usePortapapeles();
  const destino = useDestinoVigente();
  const [abierto, setAbierto] = useState(false);
  /* Qué pieza está desplegada dentro del cajón (ley VII). Una a la vez: dos
     abiertas en un cajón de 320 px al pie de la pantalla obligan a hacer
     scroll para comparar lo que precisamente se abrió para comparar. */
  const [desplegada, setDesplegada] = useState(null);
  /* La que se está poniendo en varios clientes, o `null`. */
  const [repartiendo, setRepartiendo] = useState(null);
  /* El nombre de lo que acaba de entrar, o `null`. Es la ley II: el aviso de
     copiar se ha retirado y esto es lo que queda en su lugar, dicho por la
     pieza que además enseña dónde ha ido a parar. */
  const [recien, setRecien] = useState(null);
  /* Si la mano está enseñando la oferta ahora mismo. Se dice al llegar y se
     apaga sola; ver el bloque de cabecera. */
  const [ofreciendo, setOfreciendo] = useState(false);
  /* Con ratón se puede arrastrar lo que llevas; con el dedo no existe el gesto
     (ver la fila de la lista). */
  const conRaton = useMediaQuery('(pointer: fine)');

  /* El ref va en el PIE entero y no solo en el cajón: la píldora que lo abre
     está fuera del cajón, así que con el ref ahí su `mousedown` contaría como
     «has pulsado fuera» —se cerraría— y el `click` de después lo volvería a
     abrir. El número dejaría de poder cerrar la lista. */
  const pie = useRef(null);
  useClickOutside(pie, () => setAbierto(false), abierto && !repartiendo);

  /* Lo último visto por este montaje. Arranca con lo que ya hubiera guardado
     para no anunciar al abrir la aplicación una copia de anteayer. */
  const visto = useRef(piezas[0]?.id ?? null);
  useEffect(() => {
    const arriba = piezas[0] ?? null;
    if ((arriba?.id ?? null) === visto.current) return undefined;
    visto.current = arriba?.id ?? null;
    /* Quitar la primera pieza también cambia quién está arriba, y eso no es una
       copia: sin mirar la hora, tirar algo haría hablar a la mano de la que
       quedaba debajo. */
    if (!arriba || Date.now() - arriba.fecha > 1500) {
      setRecien(null);
      return undefined;
    }
    setRecien(arriba.titulo);
    const reloj = setTimeout(() => setRecien(null), LO_QUE_DURA_LA_VOZ);
    return () => clearTimeout(reloj);
  }, [piezas]);

  const aceptadas = destino ? piezas.filter((p) => destino.tipos.includes(p.tipo)) : [];
  const cabeAlgo = aceptadas.length > 0;
  /*
    ── DOS PREGUNTAS DISTINTAS, Y ANTES SE CONTESTABAN CON EL MISMO NÚMERO ────

    · ¿SE NOMBRA LA PIEZA EN LA PÍLDORA? Depende de cuántas CABEN AQUÍ. Con una
      sola candidata sí —y da igual que lleves tres—, porque nombrarla es decir
      lo que va a pasar al pulsar. Con dos o más, nombrar la primera es elegir
      por el entrenador cuál de ellas se pega.
    · ¿QUÉ ENSEÑA EL CAJÓN? Lo que llevas, con lo de dentro de la que abras y
      sus verbos (ley VII). Con una pieza es su ficha; con varias, la lista.
  */
  const unica = piezas.length === 1;
  const verboEntero = aceptadas.length === 1;
  const hayQueElegir = aceptadas.length > 1;

  /*
    ── LA OFERTA SE DICE EN EL CANTO, NO MIENTRAS DURE ────────────────────────
    Solo al pasar de «aquí no cabe» a «aquí cabe». Dicha mientras dure, recorrer
    las hojas de un bloque con un ejercicio copiado sacaría la misma frase en
    cada una — que es la queja que esto arregla.
  */
  const cabia = useRef(false);
  useEffect(() => {
    if (!cabeAlgo) {
      cabia.current = false;
      setOfreciendo(false);
      return undefined;
    }
    if (cabia.current) return undefined;
    cabia.current = true;
    setOfreciendo(true);
    const reloj = setTimeout(() => setOfreciendo(false), LO_QUE_DURA_LA_OFERTA);
    return () => clearTimeout(reloj);
  }, [cabeAlgo]);

  if (piezas.length === 0 && !repartiendo) return null;

  /* El momento de la copia MANDA sobre la oferta: primero «lo tengo» y después
     «y aquí cabe». Al revés, copiar un ejercicio desde la hoja en la que estás
     contesta «Pegar «Sentadilla» en Lower A», que es cierto pero no es lo que
     se acaba de hacer. */
  const ofrece = cabeAlgo && ofreciendo && !recien;

  const pegar = (pieza) => {
    setAbierto(false);
    destino?.pegar?.(pieza);
  };

  /*
    ══ GUARDAR NO ES PEGAR ════════════════════════════════════════════════════

    Tres verbos y tres significados, con la misma pieza en la mano: **pegar**
    escribe en el trabajo de UNA persona y se deshace; **poner en varios** es lo
    mismo a N, con las consecuencias delante; **guardar** va a tu cajón, con
    nombre y para siempre, y no le toca nada a nadie.

    El gesto está en `guardarEnPlantillas` y no aquí: desde que `/plantillas` se
    registra como destino, guardar tiene DOS puertas —la ficha de la mano y la
    propia pantalla al llegar con algo en la mano— y las dos tienen que
    desempatar el nombre igual, respetar el mismo tope y decirlo con la misma
    frase. Ahí está también por qué solo se ofrece de lo que tiene cajón.
  */
  const guardar = (pieza) => {
    setAbierto(false);
    guardarEnPlantillas(pieza);
  };

  /*
    ── Y NO SE OFRECE DOS VECES ──────────────────────────────────────────────
    Estando en `/plantillas`, el destino vigente ES el cajón: la ficha ya está
    enseñando «Guardar «Comida 1» en tus plantillas» en azul, y debajo salía un
    segundo «Guardar en plantillas» que hacía exactamente lo mismo. Dos botones
    para un gesto se leen como dos gestos.
  */
  const elDestinoEsElCajon = destino?.donde === EL_CAJON;

  /* Lo que va dentro del peso, sea mando o rótulo (ver más abajo). El icono es
     SIEMPRE el del portapapeles, y no un chevron cuando aquí cabe algo: en
     reposo la píldora se queda en dos trazos, y si uno de los dos cambia de
     significado según la pantalla, lo que queda es un mando que no se sabe de
     qué es. Que se abre lo dicen el `aria-expanded` y el propio cajón al salir. */
  const elPeso = (
    <>
      <Clipboard size={13} aria-hidden="true" />
      {/* Los rótulos se turnan encogiendo y creciendo, no se sustituyen: así la
          píldora cambia de ancho sin dar un salto. */}
      <span className="pp-mano-quieta">Llevas</span>
      <span className="pp-mano-recien">{recien ? `«${recien}» copiada` : ''}</span>
      {/* LA OFERTA CUANDO LLEVAS VARIAS. No puede nombrar la pieza —son tres—
          pero sí el sitio, y los puntos suspensivos dicen lo que este mando hace
          de verdad: preguntar cuál. Es la forma que ya usan «Su protocolo…» y
          «Pausar…» en la cartera. */}
      <span className="pp-mano-elegir">
        {hayQueElegir ? `${destino.verbo} en ${destino.donde}…` : ''}
      </span>
      <span className="pp-mano-n">{piezas.length}</span>
    </>
  );

  /* La ficha de una pieza abierta: lo que lleva dentro y lo que se puede hacer
     con ella. Los verbos son botones a la vista y no un menú «···» porque el
     cajón recorta (`overflow`) y porque son dos o tres: un menú para dos
     entradas es un clic de peaje. */
  const laFicha = (p) => {
    const dentro = loQueLleva(p);
    const cabe = destino?.tipos.includes(p.tipo);
    return (
      <div className="pp-ficha">
        {dentro.lineas.length > 0 && (
          <ul className="pp-dentro">
            {dentro.lineas.map((linea) => (
              <li key={linea}>{linea}</li>
            ))}
            {dentro.mas > 0 && <li className="mas">y {dentro.mas} más</li>}
          </ul>
        )}
        <div className="pp-verbos">
          {cabe && (
            <button type="button" className="pp-verbo es-azul" onClick={() => pegar(p)}>
              {destino.verbo} en {destino.donde}
            </button>
          )}
          {seReparte(p.tipo) && (
            <button
              type="button"
              className="pp-verbo"
              onClick={() => {
                setAbierto(false);
                setRepartiendo(p);
              }}
            >
              {/* «Ponerlo» describe añadir, que es lo que hacen cuatro de las
                  cinco piezas. La dieta entera sustituye, y quien va a borrarle
                  el plan a seis personas tiene que leerlo desde el primer clic
                  —no al final—. Ver `sustituye` en `domain/reparto`. */}
              {sustituye(p.tipo) ? 'Sustituir la dieta de varios…' : 'Ponerlo en varios…'}
            </button>
          )}
          {sePuedeGuardar(p.tipo) && !(cabe && elDestinoEsElCajon) && (
            <button type="button" className="pp-verbo" onClick={() => guardar(p)}>
              Guardar en plantillas
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <aside
        ref={pie}
        className={`pp-pie${cabeAlgo ? ' is-viva' : ''}`}
        /* `complementary` y no `dialog`: no atrapa el foco ni tapa nada, es una
           zona más de la página que se recorre con el tabulador al llegar. */
        aria-label={`Portapapeles · ${piezas.length} ${piezas.length === 1 ? 'pieza copiada' : 'piezas copiadas'}`}
      >
        {abierto && piezas.length > 0 && (
          <div className="pp-cajon">
            <div className="pp-cajon-cab">
              <b>Lo que llevas</b>
              <button type="button" className="pp-cajon-vaciar" onClick={vaciar}>
                Vaciar
              </button>
            </div>
            <ul className="pp-lista">
              {piezas.map((p) => {
                const Icono = ICONO[p.tipo] || Layers;
                const deDonde = [p.origen?.cliente, p.origen?.donde].filter(Boolean).join(' · ');
                const cabe = destino?.tipos.includes(p.tipo);
                /* Con una sola pieza nace abierta: es su ficha, no una lista de
                   uno. Ver la ley VII. */
                const abierta = unica || desplegada === p.id;
                return (
                  <li key={p.id} className={`pp-item${abierta ? ' es-abierta' : ''}`}>
                    {/*
                      ── Y LA FILA SE PUEDE ARRASTRAR ─────────────────────────
                      El verbo de arriba pega de un clic, y con eso basta cuando
                      el sitio es uno. Arrastrar es para lo otro: decir CUÁL de
                      los seis —qué columna del bloque, qué comida del menú—,
                      que es lo único que un clic no puede contestar. Ver
                      `useZonasDeSoltar`.

                      Solo con ratón: `draggable` no existe en táctil (ver
                      `useArrastreOrden`), y ofrecer un gesto que no ocurre es
                      peor que no ofrecerlo. Lo que se hace arrastrando se puede
                      hacer también desde el sitio que recibe, que tiene su
                      propio verbo.
                    */}
                    <div
                      className="pp-pieza"
                      {...(conRaton
                        ? {
                            draggable: true,
                            onDragStart: (evento) => {
                              arrastrarPieza(p);
                              evento.dataTransfer.effectAllowed = 'copy';
                              /* Firefox no arranca el arrastre sin datos. */
                              evento.dataTransfer.setData('text/plain', p.titulo);
                            },
                            onDragEnd: soltarPieza,
                          }
                        : {})}
                    >
                      <span className="pp-pieza-icono" aria-hidden="true">
                        <Icono size={13} />
                      </span>
                      {/* El texto es el mando que abre la pieza cuando hay más
                          de una. Con una sola no hay nada que plegar, así que es
                          un rótulo: un botón que no hace nada es peor que un
                          texto. */}
                      {unica ? (
                        <span className="pp-pieza-texto">
                          <span className="pp-pieza-titulo">{p.titulo}</span>
                          <span className="pp-pieza-pie">
                            {[NOMBRE_DE_TIPO[p.tipo] || p.tipo, p.detalle, deDonde].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="pp-pieza-texto"
                          aria-expanded={abierta}
                          onClick={() => setDesplegada(abierta ? null : p.id)}
                        >
                          {/* El nombre y, debajo, de dónde salió. Sin el origen
                              la lista es inservible en cuanto hay dos «Lower A»:
                              el nombre de una hoja no distingue a dos personas. */}
                          <span className="pp-pieza-titulo">{p.titulo}</span>
                          <span className="pp-pieza-pie">
                            {[NOMBRE_DE_TIPO[p.tipo] || p.tipo, p.detalle, deDonde].filter(Boolean).join(' · ')}
                          </span>
                        </button>
                      )}
                      {/* El verbo de pegar se queda en la fila plegada: es el
                          gesto de siempre y no puede costar un despliegue. */}
                      {cabe && !abierta && (
                        <button type="button" className="pp-pieza-verbo" onClick={() => pegar(p)}>
                          {destino.verbo} aquí
                        </button>
                      )}
                      <button
                        type="button"
                        className="pp-pieza-quitar"
                        aria-label={`Quitar «${p.titulo}» del portapapeles`}
                        onClick={() => quitar(p.id)}
                      >
                        <X size={13} />
                      </button>
                    </div>
                    {abierta && laFicha(p)}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/*
          Las tres partes están SIEMPRE en el árbol y es el CSS quien encoge las
          que no tocan. No es un ahorro de renders: es lo que hace que el verbo y
          el «vaciar» sigan alcanzándose con el tabulador aunque en reposo no se
          vean — la misma razón por la que las casillas del lote se apagan con
          `opacity` y no con `visibility`.
        */}
        {piezas.length > 0 && (
          <div
            className={`pp-mano${unica ? ' es-una' : ''}${cabeAlgo ? ' is-viva' : ''}${recien ? ' is-dice' : ''}${ofrece ? ' is-ofrece' : ''}`}
          >
            {verboEntero && (
              <button type="button" className="pp-mano-verbo" onClick={() => pegar(aceptadas[0])}>
                <span>
                  {destino.verbo} «{aceptadas[0].titulo}» en {destino.donde}
                </span>
              </button>
            )}

            {/* EL PESO: lo único que se queda. Un icono y una cifra, y el mando
                que abre el cajón — que con una pieza es su ficha y con varias la
                lista (ley VII). Dejó de ser un `<span>` cuando la ficha empezó a
                llevar cosas que la píldora no puede decir: ponerlo en varios
                clientes y guardarlo en tus plantillas.

                `aria-label` y no `title`: el globo del navegador salía un segundo
                después de acercarse, en negro y por debajo de la píldora, tapando
                el trabajo para decir «Ver lo que llevas» mientras la mano ya
                estaba diciendo «Pegar «Push B» en Bloque 2» un centímetro más
                arriba. Dos voces para el mismo gesto, y la del navegador no es
                nuestra ni sabe apagarse. */}
            <button
              type="button"
              className="pp-mano-peso"
              aria-expanded={abierto}
              aria-label={abierto ? 'Cerrar lo que llevas' : 'Ver lo que llevas'}
              onClick={() => setAbierto((v) => !v)}
            >
              {elPeso}
            </button>

            {/*
              VACIAR, EN LA MANO Y NO SOLO DENTRO DEL CAJÓN. Soltar lo que llevas
              costaba dos gestos, y el primero era abrir una lista para no mirarla
              —justo lo que se hace al terminar de copiar y pegar—. Aquí no borra
              nada del programa de nadie: solo deja de llevarlo. Por eso no
              pregunta, como `quitar`.
            */}
            <button
              type="button"
              className="pp-mano-soltar"
              aria-label="Vaciar el portapapeles"
              onClick={() => {
                setAbierto(false);
                vaciar();
              }}
            >
              <X size={13} />
            </button>
          </div>
        )}
      </aside>

      {repartiendo && <MandarLaPieza pieza={repartiendo} onClose={() => setRepartiendo(null)} />}
    </>
  );
};
