import { useSyncExternalStore } from 'react';

import { useReveal } from '@/lib/useReveal';

/**
 * EL MEDIDOR — un valor sobre su tope, dibujado igual en toda la aplicación.
 *
 * ══ Por qué uno solo (21 sep, problema 9) ══════════════════════════════════
 *
 * Había cuatro barras para la misma idea: `Subjetivo` (las escalas),
 * `BarrasDeVolumen` (el costado de Entreno), las `.grupos-barra` del Resumen y
 * la `.plan-bar.is-fase` de las fases. Cada una con su altura —4, 6, 8, 10 px—,
 * su cifra y su forma de avisar, y seis hojas de estilo reescribiéndolas por
 * pantalla. El dueño las veía «planas y techy»: pista fina, relleno liso y la
 * cifra pequeña al lado.
 *
 * Tres variantes, que son tres preguntas distintas y no tres estilos:
 *
 *   · ESCALA — «Hambre 7/10». Continua, como en producción; en casillas —una
 *     por punto de la escala— a prueba con el interruptor de abajo. Ver
 *     `useFormaDeEscala`.
 *   · VOLUMEN — «Pecho 18 series de 20». Continua y llena en el MRV. El juicio
 *     —pasarse— va en la cifra, en rojo.
 *   · PROGRESO — «Semana 3 de 12». Continua y en tinta: el tiempo no es un dato
 *     con color propio ni algo que juzgar.
 *
 * ══ El movimiento: crece UNA vez, al llegar a la vista ═════════════════════
 *
 * La lista (`Medidores`) lleva un solo observador —no uno por barra— y la
 * marca `is-dentro` la primera vez que entra en pantalla; el CSS hace crecer
 * los rellenos con `--muelle`, en cascada de 40 ms por fila. Después no vuelve
 * a animarse nada: un valor que cambia se pinta en su sitio. Quien pide menos
 * movimiento los ve puestos desde el primer fotograma (`useReveal`).
 */

/* ══ EL INTERRUPTOR DE PROTOTIPO ═══════════════════════════════════════════
   TEMPORAL, como el del mando del pliegue: existe para comparar en vivo las dos
   formas de la escala sin recompilar, y se va en cuanto el dueño elija.

     ?medidor=continuo     la barra de siempre (por defecto: la de producción)
     ?medidor=segmentado   casillas, una por punto de la escala

   Se pone una vez y queda guardado en el aparato. Se lee al arrancar: cambiar
   es recargar, que es lo que se quiere para comparar. */
const CLAVE = 'caveman-medidor-escala';
const FORMAS = ['segmentado', 'continuo'];
const POR_DEFECTO = 'continuo';

let formaElegida;
const leerForma = () => {
  if (formaElegida !== undefined) return formaElegida;
  formaElegida = POR_DEFECTO;
  if (typeof window === 'undefined') return formaElegida;
  try {
    const dela = new URLSearchParams(window.location.search).get('medidor');
    if (dela !== null) {
      formaElegida = FORMAS.includes(dela) ? dela : POR_DEFECTO;
      localStorage.setItem(CLAVE, formaElegida);
    } else {
      const puesta = localStorage.getItem(CLAVE);
      if (FORMAS.includes(puesta)) formaElegida = puesta;
    }
  } catch {
    /* Sin almacenamiento (ventana privada, sitio bloqueado) se queda la forma
       por defecto: es un ajuste de comparación, no un dato que perder. */
  }
  return formaElegida;
};
const sinCambios = () => () => {};

export const useFormaDeEscala = () =>
  useSyncExternalStore(sinCambios, leerForma, () => POR_DEFECTO);

/* Una escala de más de doce puntos en casillas deja de leerse como casillas:
   son rayas. Por encima de eso se dibuja continua aunque se pida segmentada. */
const MAX_CASILLAS = 12;

const acotar = (n) => Math.max(0, Math.min(100, n));

/**
 * La lista. Lleva el observador de la entrada y el aire entre filas.
 */
export const Medidores = ({ className = '', children, ...resto }) => {
  const [ref, dentro] = useReveal();
  return (
    <div ref={ref} className={`niveles${dentro ? ' is-dentro' : ''}${className ? ` ${className}` : ''}`} {...resto}>
      {children}
    </div>
  );
};

/**
 * Una fila: la etiqueta y la cifra en un renglón, la pista debajo.
 *
 * @param etiqueta  Lo que se mide («Hambre», «Pecho», «Semana»).
 * @param valor     La cifra, en su unidad.
 * @param techo     El valor que llena la pista entera.
 * @param cifra     Cómo se escribe el valor, si no es tal cual («11,1»).
 * @param de        El pie de la cifra, en pequeño («/10», « de 12»).
 * @param segmentos Con número, la pista son casillas: una por punto, y se
 *                  encienden las que alcanza el valor. Solo para escalas.
 * @param parte     Un tramo del valor, macizo, sobre el total en claro.
 * @param tinta     El color del DATO: el relleno y, si no hay juicio, nada más.
 * @param tono      'bien' | 'medio' | 'mal': un juicio sobre el valor. Pinta el
 *                  relleno con el semáforo y la cifra con su tinta de texto.
 * @param tintaCifra El color de la serie en la cifra, que ata la fila con su
 *                  línea en una gráfica (ver `Subjetivo`).
 * @param alerta    La cifra en `--negative` sin tocar la barra (pasado del MRV).
 * @param indice    El puesto en la lista, para la cascada de entrada.
 * @param onClick   Con él la fila es un botón (una puerta a su tendencia).
 */
export const Medidor = ({
  etiqueta,
  valor,
  techo,
  cifra = null,
  de = null,
  segmentos = null,
  parte = null,
  tinta = null,
  tono = null,
  tintaCifra = null,
  alerta = false,
  indice = 0,
  onClick = null,
  title,
  ...resto
}) => {
  const Fila = onClick ? 'button' : 'div';
  const casillas = segmentos && segmentos <= MAX_CASILLAS ? segmentos : null;
  const pct = techo > 0 ? acotar((valor / techo) * 100) : 0;
  const hayParte = Number.isFinite(parte);
  const pctParte = hayParte && techo > 0 ? acotar((parte / techo) * 100) : 0;

  const estilo = { '--i': indice };
  if (tinta) estilo['--nivel-tinta'] = tinta;

  return (
    <Fila
      className={[
        'nivel',
        onClick && 'is-puerta',
        tono && `is-${tono}`,
        alerta && 'is-alerta',
      ]
        .filter(Boolean)
        .join(' ')}
      style={estilo}
      title={title}
      {...(onClick ? { type: 'button', onClick } : {})}
      {...resto}
    >
      <span className="nivel-k">{etiqueta}</span>
      <span className="nivel-v" style={tintaCifra && !tono && !alerta ? { color: tintaCifra } : undefined}>
        {cifra ?? valor}
        {de && <small>{de}</small>}
      </span>
      {casillas ? (
        <span className="nivel-pista is-casillas" aria-hidden="true">
          {Array.from({ length: casillas }, (_, k) => (
            <i key={k} className={k < Math.round(valor) ? 'is-lleno' : undefined} style={{ '--k': k }} />
          ))}
        </span>
      ) : (
        <span className="nivel-pista" aria-hidden="true">
          <span className="nivel-carril">
            {/* El relleno mide lo que el valor y ENTRA desde la izquierda: se
                anima un `transform`, no el ancho, y así el extremo redondeado
                llega redondo en vez de estirado. */}
            <span className={`nivel-relleno${hayParte ? ' is-fondo' : ''}`} style={{ width: `${pct}%` }} />
            {hayParte && <span className="nivel-relleno" style={{ width: `${pctParte}%` }} />}
          </span>
        </span>
      )}
    </Fila>
  );
};
