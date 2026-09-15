import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { usePantallaDespierta } from '@/lib/usePantallaDespierta';
import { useCromoTenido } from '@/lib/useCromoTenido';

/**
 * LA SESIÓN ES UN ESTADO DEL APARATO, no una pantalla. (`M-04`, `M-06`)
 *
 * ══ El fallo que corrige, y es de los que no se ven mirando el código ══════
 *
 * El descanso vivía en un `useState` dentro de `ClientDay`. En una pantalla de
 * escritorio eso funciona; en un teléfono, no, porque `ClientDay` se monta y se
 * desmonta constantemente: la rutina del cliente es una CINTA DE HOJAS y basta
 * deslizar a la sesión de al lado —o mirar el vídeo del ejercicio que viene, o
 * abrir la dieta— para que el componente muera y con él la cuenta atrás.
 *
 * Y en un gimnasio se sale de esa hoja cada serie.
 *
 * Así que lo que dura más que la pantalla vive por encima de la pantalla:
 *
 *   · **qué sesión se está entrenando** —la que se cierra con «Terminar»—,
 *   · **el descanso**, que sigue corriendo mires lo que mires,
 *   · y, con eso, las dos cosas que solo se pueden hacer sabiéndolo: que la
 *     pantalla no se apague (`W-03`) y que las barras del navegador se tiñan
 *     con la tinta del modo (`W-06`).
 *
 * ══ Qué NO guarda, y es deliberado ════════════════════════════════════════
 *
 * **No sobrevive a una recarga.** Podría —un `localStorage` y ya— y sería peor:
 * al volver, la aplicación daría por hecho que sigues entrenando lo de ayer y
 * seguiría anotando en una sesión con fecha vieja. Eso se resuelve por el otro
 * lado y mejor: una sesión con series y sin cerrar es «la dejaste a medias», y
 * la portada la ofrece con dos verbos (`M-05`, `domain/sessions.sesionAMedias`).
 *
 * **Y no se reanuda sola.** Se pregunta una vez, y la respuesta se respeta.
 *
 * ══ Por qué el proveedor está en el marco del portal ═══════════════════════
 *
 * Porque la barra de la sesión tiene que seguir ahí al cambiar de sección: es
 * el camino de vuelta. Montado más abajo —en la ruta de la rutina— cada
 * navegación lo desmontaría, que es exactamente el fallo del que se viene.
 *
 * Fuera del portal no hay proveedor y `useSesionEnCurso()` devuelve un objeto
 * apagado: la pantalla del entrenador usa los mismos componentes de registro y
 * no tiene por qué enterarse de nada de esto.
 */

/** El valor sin proveedor: no hay sesión y ninguna de las acciones hace nada. */
const APAGADO = {
  viva: null,
  descanso: null,
  remate: false,
  destino: null,
  objetivo: null,
  marcar: () => {},
  cerrar: () => {},
  descartar: () => {},
  seguir: () => {},
  tomarDestino: () => {},
  empezarDescanso: () => {},
  sumarDescanso: () => {},
  pararDescanso: () => {},
  pedirRemate: () => {},
  cerrarRemate: () => {},
  irAEjercicio: () => {},
  objetivoAtendido: () => {},
};

const SesionCtx = createContext(APAGADO);

export const useSesionEnCurso = () => useContext(SesionCtx);

export const SesionEnCursoProvider = ({ children }) => {
  /*
    La sesión que se está entrenando, con lo que la barra necesita pintar:
    `{ clientId, weekNumber, sessionId, dayName, hechas, series, tramos }`.
    Lo publica la hoja (`ClientDay`) con `marcar` en cada render que cambie
    alguna de esas cifras.
  */
  const [viva, setViva] = useState(null);

  /* Cuándo acaba el descanso, en milisegundos, y de cuánto era: el arco de la
     barra necesita las dos cosas para saber qué fracción queda. */
  const [descanso, setDescanso] = useState(null);

  /* Que alguien ha pulsado «Terminar»: el remate lo pinta la hoja, que es la
     que tiene el tonelaje, los récords y las preguntas del protocolo. */
  const [remate, setRemate] = useState(false);

  /* A dónde quiere ir quien pulsa «Seguir» en la portada: la rutina lo recoge
     una vez —`tomarDestino`— y se coloca en esa semana y ese día. */
  const [destino, setDestino] = useState(null);

  /* Y a qué ejercicio lleva un tramo de la regla. Lo atiende la hoja. */
  const [objetivo, setObjetivo] = useState(null);

  /* El segundero. Un solo intervalo para toda la aplicación, y solo mientras
     hay cuenta atrás: el `setInterval` que vivía en la hoja seguía redibujando
     dos veces por segundo en escritorio, donde el descanso no se pintaba. */
  const [, tick] = useState(0);
  useEffect(() => {
    if (!descanso) return undefined;
    const id = setInterval(() => tick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [descanso]);

  const restante = descanso ? Math.max(0, Math.ceil((descanso.fin - Date.now()) / 1000)) : 0;
  useEffect(() => {
    if (descanso && restante === 0) setDescanso(null);
  }, [descanso, restante]);

  /*
    ── La pantalla despierta y el cromo teñido, mientras dure ────────────────
    Los dos cuelgan de lo mismo y por eso están aquí: es el único sitio del
    producto que sabe si alguien está entrenando AHORA.
  */
  usePantallaDespierta(Boolean(viva));
  useCromoTenido(viva ? '--sesion-tinta' : null);

  /**
   * La hoja dice qué sesión es y por dónde va.
   *
   * ── Por qué compara antes de escribir ────────────────────────────────────
   * Porque quien llama a esto es un efecto de la hoja, que se repinta con cada
   * tecla que se escribe en un peso. Sin la comparación, cada pulsación
   * guardaría un objeto nuevo aquí y repintaría el marco entero del portal.
   */
  const marcar = useCallback((datos) => {
    if (!datos?.sessionId) return;
    setViva((antes) => {
      if (
        antes &&
        antes.sessionId === datos.sessionId &&
        antes.hechas === datos.hechas &&
        antes.series === datos.series &&
        antes.dayName === datos.dayName &&
        mismosTramos(antes.tramos, datos.tramos)
      ) {
        return antes;
      }
      return datos;
    });
  }, []);

  /** Terminada: se suelta todo. El fin en los datos lo estampa quien llama. */
  const cerrar = useCallback(() => {
    setViva(null);
    setDescanso(null);
    setRemate(false);
    setObjetivo(null);
  }, []);

  /** Y descartada es lo mismo para este estado: ya no se está entrenando. */
  const descartar = cerrar;

  /** «Seguir» desde la portada: se apunta a dónde hay que ir. */
  const seguir = useCallback((donde) => {
    if (!donde?.dayName || !Number.isFinite(donde.weekNumber)) return;
    setDestino(donde);
  }, []);

  const tomarDestino = useCallback(() => setDestino(null), []);

  /**
   * EL DESCANSO ARRANCA SOLO SI ALGUIEN LO PAUTÓ.
   *
   * La guarda de la primera línea es la regla de producto, no una defensa
   * contra un argumento raro, y por eso está escrita aquí y en ningún otro
   * sitio: quien llama pasa la pauta que tenga la hoja —`restSeconds`, que casi
   * siempre no hay— y no decide nada.
   *
   * El dueño la confirmó el 15 de septiembre de 2026, después de una propuesta
   * que la daba por vuelta: *«depende de si los entrenadores pautan o no
   * descanso, no de otra cosa»*, y sin pauta **no aparece**. Ni una cuenta
   * hacia arriba, que era la tentación —el tiempo que llevas parado es un hecho
   * y parece inocente—: un número corriendo en la pantalla del gimnasio se lee
   * como que hay que volver a la barra, y esa instrucción no la ha dado nadie.
   * Es la misma frase con la que se retiró el reloj de la sesión: «un reloj que
   * va a ninguna parte y una cuenta atrás que alguien te puso no son lo mismo».
   */
  const empezarDescanso = useCallback((segundos) => {
    if (!(segundos > 0)) return;
    setDescanso({ fin: Date.now() + segundos * 1000, total: segundos });
  }, []);

  /**
   * «+30 s»: alarga el descanso en curso sin arrancar otro.
   *
   * Mueve el final y también el total, porque la barra que se vacía dibuja la
   * fracción que queda: con el total quieto, sumar treinta segundos llenaría el
   * arco por encima de su principio. Sin descanso en curso no hace nada —no hay
   * pauta que alargar, y eso es la regla de `empezarDescanso`.
   */
  const sumarDescanso = useCallback((segundos) => {
    if (!(segundos > 0)) return;
    setDescanso((d) => (d ? { fin: d.fin + segundos * 1000, total: d.total + segundos } : d));
  }, []);

  const pararDescanso = useCallback(() => setDescanso(null), []);

  const pedirRemate = useCallback(() => setRemate(true), []);
  const cerrarRemate = useCallback(() => setRemate(false), []);

  const irAEjercicio = useCallback((id) => setObjetivo(id ? { id, en: Date.now() } : null), []);
  const objetivoAtendido = useCallback(() => setObjetivo(null), []);

  const valor = useMemo(
    () => ({
      viva,
      /* `fin` es la identidad del descanso: la pantalla que lo tapa para
         corregir algo necesita saber cuándo empieza OTRO para destaparse. */
      descanso: descanso ? { restante, total: descanso.total, fin: descanso.fin } : null,
      remate,
      destino,
      objetivo,
      marcar,
      cerrar,
      descartar,
      seguir,
      tomarDestino,
      empezarDescanso,
      sumarDescanso,
      pararDescanso,
      pedirRemate,
      cerrarRemate,
      irAEjercicio,
      objetivoAtendido,
    }),
    [
      viva,
      descanso,
      restante,
      remate,
      destino,
      objetivo,
      marcar,
      cerrar,
      descartar,
      seguir,
      tomarDestino,
      empezarDescanso,
      sumarDescanso,
      pararDescanso,
      pedirRemate,
      cerrarRemate,
      irAEjercicio,
      objetivoAtendido,
    ]
  );

  return <SesionCtx.Provider value={valor}>{children}</SesionCtx.Provider>;
};

/**
 * ¿Dicen lo mismo las dos reglas? Se compara el dibujo, no la referencia.
 *
 * ── Y un tramo es UN NÚMERO, no un objeto ─────────────────────────────────
 * Esto comparaba `t.id`, `t.hechas` y `t.series`, de una forma de tramo que
 * nunca llegó a existir: quien llama manda la fracción hecha de cada ejercicio
 * (`puestas / total`, en `ClientSesionRoute`). Sobre números, esas tres
 * lecturas daban `undefined === undefined` las tres veces, así que la función
 * decía «son iguales» con solo coincidir la longitud — y la regla de la barra
 * no se refrescaba por sí misma nunca.
 *
 * No se notaba porque `marcar` compara además `hechas`, que sí cambia al
 * apuntar, y eso arrastraba los tramos nuevos de rebote. Quedaba en falso el
 * caso en el que cambia el reparto y no la cuenta. Un comparador que no puede
 * decir «distintos» no es un comparador.
 */
const mismosTramos = (a, b) => {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((t, i) => t === b[i]);
};

/**
 * ¿Es ESTA la sesión que se está entrenando?
 *
 * Lo pregunta la hoja: la cinta del teléfono puede estar enseñando la sesión
 * del jueves pasado mientras la viva es la de hoy, y entonces esa hoja se pinta
 * como lo que es —un registro que se puede corregir— y no como un entreno en
 * curso.
 */
export const useEstaSesionViva = (sessionId) => {
  const { viva } = useSesionEnCurso();
  return Boolean(sessionId) && viva?.sessionId === sessionId;
};

/**
 * El intervalo del descanso, para quien solo quiera leerlo.
 *
 * Existe para no repetir en cada pantalla la cuenta de segundos a `mm:ss`, que
 * es la clase de función que acaba escrita tres veces con tres redondeos.
 */
export const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
