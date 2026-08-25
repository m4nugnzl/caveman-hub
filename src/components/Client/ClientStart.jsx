import { useApp } from '@/context/AppContext';
import { PageHead } from '@/components/ui/primitives';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { ClientUpdates } from './ClientUpdates';
import { IntakeDeliverables } from './IntakeDeliverables';
import { IntakePrompt } from './IntakePrompt';

/**
 * El inicio del cliente: SU PROGRESO, con lo que ha cambiado arriba.
 *
 * ══ Por qué el progreso es la portada y no la quinta pestaña ════════════════
 *
 * Porque es la razón por la que paga. Un cliente no contrata a un entrenador para
 * apuntar kilos: lo contrata para cambiar, y la prueba de que está cambiando —su
 * peso bajando, sus fotos de hace ocho semanas al lado de las de hoy, el tonelaje
 * subiendo— es el producto entero. Estaba en quinto lugar, detrás de la rutina y
 * de la dieta, que son herramientas para conseguirlo.
 *
 * ══ Y por qué «Hoy» ya no es una sección ═══════════════════════════════════
 *
 * Porque la mayoría de los días no tenía nada que decir, y una pantalla que casi
 * siempre está vacía se deja de abrir. El problema es que el día que SÍ tenía
 * algo —la respuesta de su entrenador— tampoco entraba nadie.
 *
 * Lo que hacía se ha repartido por donde de verdad se mira:
 *
 *   · **Los avisos**, aquí arriba y en la campana de la cabecera. Es el patrón
 *     de cualquier móvil: no se va a una pantalla a mirar si hay notificaciones,
 *     te las encuentras. Y desaparecen solos cuando no hay nada.
 *   · **Entregar la semana y leer la respuesta**, con el check-in
 *     (`ClientWeek`), que es cuando de verdad se hace ese gesto.
 *   · **Lo que le dejó preparado el entrenador al darle de alta**, aquí abajo:
 *     se consulta las primeras semanas y después deja de hacer falta.
 *
 * ── Por qué no es solo el panel con un aviso encima ─────────────────────────
 * Porque el orden importa: primero lo que ha cambiado —que es lo urgente y lo
 * corto—, y debajo cómo va —que es lo que se mira con calma—. Al revés, la
 * pantalla se abre con un gráfico y el aviso queda por debajo del pliegue.
 *
 * ── Y el saludo vive AQUÍ, como título ──────────────────────────────────────
 * Era una tarjeta del marco (`ClientLayout`) con el avatar, la semana activa y
 * el peso actual dentro. Como tarjeta ocupaba un plano entero para no decir nada
 * que no estuviera veinte píxeles más abajo —la semana, en el carril; el peso,
 * en la primera cifra del resumen— y empujaba el contenido por debajo del
 * pliegue en un móvil.
 *
 * Como `PageHead` sigue siendo el saludo, sigue siendo el `h1`, y ahora además
 * es lo que ninguna pantalla del portal tenía: un título que dice en cuál estás.
 */
export const ClientStart = () => {
  const { activeClient } = useApp();
  if (!activeClient) return null;

  return (
    <div className="stack">
      {/* El nombre en cursiva es el REMATE, como en los titulares de la
          portada: la parte humana del título. Ver `PageHead`. */}
      <PageHead title="Hola," remate={activeClient.name} sub="Tu progreso, semana a semana." />

      <ClientUpdates client={activeClient} />
      {/* Lo que su entrenador espera DE ÉL, encima de todo y solo mientras
          falte. Va con los avisos y no con las entregas de abajo porque es una
          tarea suya, no material que le hayan dejado. */}
      <IntakePrompt client={activeClient} />
      <Dashboard audience="client" />
      <IntakeDeliverables client={activeClient} />
    </div>
  );
};
