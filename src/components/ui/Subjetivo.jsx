import { tonoDeEscala } from '@/domain/protocol';
import { Medidor, Medidores, useFormaDeEscala } from '@/components/ui/Medidor';

/**
 * Una tanda de respuestas de escala, como barras.
 *
 * Una fila por pregunta: la palabra, una barra de 1 a 10 y la cifra. Se lee sin
 * comparar números: la fatiga alta es una barra larga; el dolor bajo, una corta.
 *
 * ── La barra no lleva el color de la pregunta, y la cifra sí ────────────────
 * Lo llevaba, y el color de una pregunta es su IDENTIDAD, no su valor: «Dolor
 * 3/10» —una respuesta excelente— salía pintado de rojo y «Fatiga 8/10» de
 * naranja, porque ese es el color con el que cada una se dibuja en su gráfica.
 * Sobre doscientos píxeles de relleno eso no se lee como una serie, se lee como
 * un juicio, y encima al revés en las preguntas que van al revés.
 *
 * El largo ya dice el valor. El color de serie se queda en la cifra, que es
 * donde sigue haciendo su trabajo —atar esta fila con su línea en la gráfica
 * del mismo popup— y ocupa catorce píxeles en vez de doscientos.
 *
 * ── Vive en `ui/` porque lo subjetivo se pregunta en DOS sitios ─────────────
 * Al acabar una sesión (`SESSION_QUESTIONS`) y al cerrar la semana en el
 * check-in (`CHECKIN_QUESTIONS`). Son dos catálogos distintos y la misma clase
 * de respuesta —una escala con su color y su tope—, así que se pintan igual: el
 * panel de la semana, la progresión de un ejercicio y el bloque de evolución
 * del resumen usan esta misma pieza. Estaba dentro de `Workout/`, que es lo que
 * habría llevado a dibujar unas barras nuevas para el check-in.
 *
 * ── Salvo donde se pide el semáforo (19 sep) ────────────────────────────────
 * En «Cómo lo lleva» del resumen el dueño quiere el juicio a la vista: la barra
 * y la cifra en verde, ámbar o rojo según lo bien que esté la respuesta. Es
 * `semaforo`, y el juicio es `tonoDeEscala` —el mismo de las barritas del
 * portal—, que ya sabe qué preguntas van al revés (`lowerIsBetter`). Las
 * `neutral` (el RPE: un 9 puede ser lo previsto) no se juzgan y siguen en tinta.
 * Fuera de esa tarjeta las filas se quedan como estaban.
 *
 * ── Y se dibuja con el medidor de la casa (21 sep) ──────────────────────────
 * La fila ya no es suya: es `ui/Medidor`, la misma pieza del volumen y de las
 * fases, con el tamaño de producción. Barra continua; `?medidor=segmentado`
 * la parte en casillas, una por punto de la escala, para compararlas.
 *
 * El largo se mide ahora contra el TOPE y no contra el recorrido: con `min: 1`,
 * un 4 de 5 salía al 75 % mientras la cifra decía «4/5». Es además la cuenta
 * de `tonoDeEscala`, así que barra, cifra y semáforo dicen lo mismo.
 */
/**
 * @param onFila  Con destino, cada fila es una PUERTA a la tendencia de esa
 *   pregunta: se vuelve botón, se enciende al pasar (ley de los gestos: la
 *   caja se enciende, nada de teñir la barra — el color es del dato) y al
 *   pulsar recibe la pregunta. Sin él, las filas son lectura, como siempre.
 */
export const Subjetivo = ({ preguntas = [], answers = {}, titulo = null, onFila = null, semaforo = false }) => {
  const forma = useFormaDeEscala();
  const filas = preguntas
    .map((q) => ({ q, valor: Number(answers?.[q.id]) }))
    .filter(({ valor }) => Number.isFinite(valor));
  if (filas.length === 0) return null;

  return (
    <Medidores>
      {titulo && <span className="section-label">{titulo}</span>}
      {filas.map(({ q, valor }, i) => {
        const max = q.max || 10;
        const tono = semaforo && !q.neutral ? tonoDeEscala(valor, max, q) : null;
        return (
          <Medidor
            key={q.id}
            indice={i}
            etiqueta={q.short || q.label}
            valor={valor}
            techo={max}
            de={`/${max}`}
            segmentos={forma === 'segmentado' ? max : null}
            tono={tono}
            tintaCifra={q.color}
            title={onFila ? `${q.label} · ver su tendencia` : q.label}
            {...(onFila ? { onClick: () => onFila(q), 'aria-haspopup': 'dialog' } : {})}
          />
        );
      })}
    </Medidores>
  );
};
