import { useApp } from '@/context/AppContext';
import { clientIntake, clientSteps, stepDone } from '@/domain/intake';
import { onboardingState } from '@/domain/onboardingState';
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
  const { activeClient, equipment, checkIns } = useApp();
  if (!activeClient) return null;

  /*
    ══ Mientras no haya empezado, su alta manda sobre TODO ════════════════════

    Esta pantalla abría con «te faltan 3 pesajes esta semana» —tarjeta grande,
    franja de color— y dejaba «lo que te falta para empezar» debajo, en gris y
    pareciendo secundario. A alguien que aún no ha contestado el cuestionario se
    le estaba pidiendo la tercera cosa antes que la primera.

    Con el alta pendiente: su lista sube arriba del todo y la reclamación de la
    semana calla (ver `ClientUpdates`). Terminada, la pantalla vuelve a ser lo
    que era y el aviso del alta desaparece solo.
  */
  const intake = clientIntake(activeClient.preferences);
  const estado = onboardingState({
    client: activeClient,
    equipment,
    checkIn: checkIns?.[activeClient.id],
  });
  const altaPendiente = clientSteps(intake).some(
    (paso) => !stepDone(paso, activeClient, intake, estado)
  );

  return (
    <div className="stack">
      {/* El nombre en cursiva es el REMATE, como en los titulares de la
          portada: la parte humana del título. Ver `PageHead`. */}
      <PageHead title="Hola," remate={activeClient.name} sub="Tu progreso, semana a semana." />

      {/* Lo que su entrenador espera DE ÉL. Va lo primero mientras falte: es lo
          que desbloquea el resto de la aplicación, y debajo de un aviso de
          pesajes parecía opcional. */}
      <IntakePrompt client={activeClient} />

      <ClientUpdates client={activeClient} altaPendiente={altaPendiente} />
      <Dashboard audience="client" />
      <IntakeDeliverables client={activeClient} />
    </div>
  );
};
