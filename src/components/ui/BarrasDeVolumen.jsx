import { metricColor } from '@/domain/metrics';
import { localeNumber } from '@/lib/dates';
import { Medidor, Medidores } from '@/components/ui/Medidor';

/**
 * Las series por grupo muscular, como barras.
 *
 * Una fila por grupo: el nombre, la cifra y una barra contra su MRV estimado.
 * Sin MRV la barra se escala contra el grupo más alto de la tanda, que es lo
 * único honesto cuando no hay tope con el que comparar.
 *
 * ── Vive en `ui/` porque el mismo volumen se mira en DOS sitios ─────────────
 * En el bloque abierto («Cómo va el bloque») y en la lista de bloques, donde
 * dos bloques se enfrentan grupo a grupo. Estaba dentro de `VistaBloque`, que
 * es lo que habría llevado a dibujar unas barras nuevas para la comparación.
 * El color es el de la serie «series» (`metricColor`), el mismo con el que el
 * volumen se pinta en las gráficas: la barra ata con su línea.
 *
 * ══ EL TOPE ES EL MRV, Y LA LISTA HABLA COMO UNA LISTA DE iOS (21 sep) ══════
 *
 * Se probó el MRV como una muesca en la pista, con holgura por detrás, y el
 * dueño lo rechazó con la pantalla delante: se queda la forma de producción
 * —la barra llena ES el MRV, «11,1 series de 20» al canto— con el acabado
 * plano del medidor de la casa. Pasarse del MRV lo dice la cifra en rojo; la
 * barra sigue en el color de las series (ley del color).
 *
 * ══ Y UNA PARTE DENTRO DEL TODO, para planificar con la hoja abierta ════════
 *
 * Con `m.parte`, la misma barra dice dos cosas en vez de una: el relleno claro
 * es el total del bloque y encima, a ras de origen, un tramo macizo con lo que
 * pone LA HOJA que se está escribiendo. Se lee de un vistazo cuánto de ese
 * grupo lo carga este día.
 */

/* Con coma: la media de un bloque sale con decimales («11,1») y el punto decía
   «11.1» al lado de «/20». */
const num = (n) => localeNumber(n, { maximumFractionDigits: 1 });

export const BarrasDeVolumen = ({ grupos }) => {
  const tope = Math.max(1, ...grupos.map((m) => m.mrv || Math.max(m.valor, m.parte || 0)));

  return (
    <Medidores>
      {grupos.map((m, i) => {
        const pasado = Boolean(m.mrv) && m.valor > m.mrv;
        const hayParte = Number.isFinite(m.parte);

        /*
          Dos tramos SOLO si de verdad hay dos cifras. Un grupo que esta hoja se
          lleva entero daba «8 de 8» —que se lee como una fracción cumplida, o
          sea como otra cosa— y dos rellenos superpuestos del mismo ancho. Si la
          hoja ES todo el trabajo de ese grupo, la fila lo dice callándose.
        */
        const dosTramos = hayParte && m.parte !== m.valor;
        const grande = hayParte ? m.parte : m.valor;
        const pie = dosTramos ? ` de ${num(m.valor)}` : m.mrv ? ` de ${m.mrv}` : null;

        return (
          <Medidor
            key={m.name}
            indice={i}
            etiqueta={m.name}
            valor={m.valor}
            techo={m.mrv || tope}
            /* «8 de 18» con la hoja abierta: ahí la palabra la dice la leyenda. */
            cifra={dosTramos ? num(grande) : `${num(grande)} ${grande === 1 ? 'serie' : 'series'}`}
            de={pie}
            parte={dosTramos ? m.parte : null}
            tinta={metricColor('sets')}
            alerta={pasado}
            title={[
              dosTramos
                ? `${m.name}: ${num(m.parte)} ${m.parte === 1 ? 'serie' : 'series'} en esta hoja, ${num(m.valor)} en el bloque`
                : `${m.name}: ${num(grande)} ${grande === 1 ? 'serie' : 'series'}`,
              m.mrv ? `de un MRV estimado de ${m.mrv}` : null,
            ]
              .filter(Boolean)
              .join(' ')}
          />
        );
      })}
    </Medidores>
  );
};
