
import { useApp } from '@/context/AppContext';
import { clientProtocol, weighInsTarget } from '@/domain/protocol';
import { PageHead } from '@/components/ui/primitives';
import { SemanasAnteriores } from './SemanasAnteriores';

/**
 * «TU PESO Y TUS MEDIDAS» — nivel «Check-in» de `/mi/evolucion`, y SOLO en el
 * teléfono.
 *
 * ══ Qué era, y qué es desde el 12 de septiembre ════════════════════════════
 *
 * Era «Mi revisión», una PESTAÑA del portal, y montaba la pantalla entera del
 * ritual de la semana: la tarjeta de entregar, los tres ángulos de las fotos, la
 * báscula, las revisiones en vídeo y el historial.
 *
 * Una pestaña permanente para algo que importa un día de cada siete es una
 * pestaña apagada seis días, así que el ritual se convoca desde su destino y
 * desde «Hoy». Lo que queda aquí es **la báscula**: donde se anota el pesaje del
 * día, se corrigen las medidas y se lee lo que su entrenador fue contestando
 * semana a semana.
 *
 * Es una pantalla EMPUJADA, no un destino: se llega por la fila «Tu peso y tus
 * medidas» y se vuelve por la miga (`ReviewLayout`).
 *
 * ══ En el monitor rebotó doce horas, y volvió (14 sep 2026) ════════════════
 *
 * Por la tarde esta dirección redirigía a `/mi/evolucion` en pantalla ancha,
 * porque `SemanasAnteriores` se había montado al pie de la propia Revisión: la
 * idea era «apuntas lo de hoy, entregas y miras atrás sin cambiar de sitio».
 *
 * El resultado fue peor que lo que arreglaba, y el dueño lo vio esa misma
 * noche: *«la pantalla revisión es confusa y a mi parecer mal diseñada»*. Lo
 * que se había montado al pie era `AnthropometryPanel`, o sea el instrumento
 * del entrenador —siete casillas escribibles, gráfica de ejes, cuatro teselas
 * y una tabla de registros con papelera—, debajo del botón de entregar. Entre
 * la báscula de arriba y ese panel había **tres sitios donde apuntar el mismo
 * peso** en la misma pantalla.
 *
 * Así que la pantalla vuelve a existir en los dos aparatos, y la Revisión la
 * enlaza desde su costado en vez de tragársela. Es el mismo reparto que ya
 * funcionaba en el teléfono: arriba lo que hay que HACER, y el rastro a un
 * clic. Ver `RevisionEnMonitor`.
 *
 * ── Lo que se ha ido de aquí, y adónde ────────────────────────────────────
 *   · `ClientWeek` y el asistente → al destino de la revisión. El gesto de
 *     entregar vive donde está la semana que se entrega, y si estuviera en los
 *     dos sitios volvería a haber dos formas de entregar la misma semana.
 *   · `TresAngulos` → a «Tú», en grande y deslizables. Aquí eran el pie de un
 *     formulario; allí son lo segundo que se ve.
 */
export const ClientCheckInsRoute = () => {
  const { activeClient } = useApp();

  /*
    ── El subtítulo dice de qué va la pantalla, no en qué punto estás ────────
    El estado de la semana —«te toca hoy», «entregada»— es del destino de la
    revisión, que es donde está el verbo que lo cambia. Aquí se anota el pesaje
    del día, y lo que hace falta saber es contra qué norma: cuántos le pide su
    entrenador.

    En el teléfono esta línea ES la cabecera entera (`tipografia.css`, A-02).
  */
  const pedidos = weighInsTarget(clientProtocol(activeClient.preferences));

  return (
    <div className="stack cascada">
      <PageHead
        title="Tu peso y tus medidas"
        sub={pedidos ? `Tu entrenador te pide ${pedidos} ${pedidos === 1 ? 'pesaje' : 'pesajes'} por semana` : null}
      />
      <SemanasAnteriores />
    </div>
  );
};
