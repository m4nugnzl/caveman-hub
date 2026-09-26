import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useApp } from '@/context/AppContext';
import { parcheDeAlimento } from '@/domain/menu';
import { emptyNutrition } from '@/domain/nutrition';
import { noAplicadaReciente, proximaProgramada } from '@/domain/dietaProgramada';
import { hoyLocal } from '@/domain/planDeSesiones';

/**
 * LA PUERTA DEL EDITOR DE DIETA (letra e, 26 sep 2026).
 *
 * El editor (`NutritionModule`) lee la dieta y la cambia SOLO por aquí. Antes
 * tomaba del contexto unas cuarenta funciones y a todas les pasaba
 * `activeClient.id`: el editor sabía que lo que tenía delante era la dieta de
 * ahora del cliente. Para prepararle una dieta que empieza otro día (la dieta
 * programada) hace falta el mismo editor sobre otra copia, y eso solo se puede
 * si el editor no lo sabe.
 *
 * ── Las dos copias ───────────────────────────────────────────────────────────
 *   · Sin nada en la dirección: la dieta de ahora del cliente abierto.
 *   · Con `?programada=<id>`: la dieta de ese cambio programado (0146), con su
 *     propio guardado (`programada:<id>` en la cola). Si ya no está pendiente
 *     —entró en vigor, o se quitó—, `programada` llega con su estado y el
 *     editor lo dice en vez de dejar escribir en el aire.
 *
 * Los verbos son los de `operacionesDeLaDieta`, ya atados a la copia, con la
 * misma firma que antes sin el `clientId` delante.
 *
 * @returns `{ clientId, plan, guardado, reintentar, cargar, editFood,
 *   programada, enCopia, proxima, noAplicada, …verbos }`: `programada` es el cambio que se
 *   edita (o `null`), y `proxima`, la pendiente más cercana —la que sustituirá
 *   la dieta de ahora—.
 */
export const useEditorDeDieta = () => {
  const {
    activeClient,
    nutrition,
    dietaDe,
    saveStatus,
    retrySave,
    ensureNutrition,
    upsertLibraryFood,
    programadas,
    dietaProgramadaDe,
    cargarProgramadas,
    conflict,
  } = useApp();
  const [params] = useSearchParams();
  const clientId = activeClient.id;
  const idCopia = params.get('programada');
  const programada = idCopia ? (programadas || []).find((p) => p.id === idCopia) || null : null;
  const enCopia = Boolean(idCopia);
  /* En la copia solo se escribe mientras está pendiente: lo aplicado ya es la
     dieta de ahora (o no entró), y la base no dejaría guardarlo. */
  const copiaViva = programada?.estado === 'pendiente' ? programada.id : null;

  const verbos = useMemo(
    () => (enCopia ? dietaProgramadaDe(copiaViva) : dietaDe(clientId)),
    [enCopia, copiaViva, dietaProgramadaDe, dietaDe, clientId]
  );

  const clave = enCopia ? ['programada', idCopia] : ['nutrition', clientId];

  return {
    ...verbos,
    clientId,
    plan: enCopia ? programada?.plan || emptyNutrition() : nutrition[clientId] || emptyNutrition(),
    programada,
    enCopia,
    proxima: proximaProgramada(programadas),
    noAplicada: noAplicadaReciente(programadas, hoyLocal()),
    /** `{ status, error }` del guardado de esta dieta. */
    guardado: saveStatus(...clave),
    /* Tras chocar con una programada que entró, reintentar volvería a chocar:
       las salidas son las del aviso (`App`). */
    reintentar:
      !enCopia && conflict?.motivo === 'programada' && conflict.clientId === clientId ? null : () => retrySave(...clave),
    /** La dieta leída de la base si aún no está en memoria; `null` si falla. */
    cargar: enCopia
      ? async () => (await cargarProgramadas(clientId))?.find((p) => p.id === idCopia)?.plan ?? null
      : () => ensureNutrition(clientId),
    /**
     * Corrige un alimento —sus macros por 100 g y su unidad— desde la dieta.
     * Vivía en el proveedor; es del editor, que es quien sabe qué dieta tiene
     * delante.
     *
     * ── Escribe en DOS sitios, y es deliberado ────────────────────────────────
     *   1. **La entrada abierta**, para que el cambio se vea al instante: una
     *      entrada de dieta es una FOTO del alimento (`buildFoodEntry`) y NO se
     *      recalcula sola cuando cambia la biblioteca.
     *   2. **La biblioteca**, para que la próxima vez que se añada ese alimento a
     *      cualquier dieta venga ya corregido.
     *
     * Antes era `defineFoodUnit` y solo sabía de unidades: un «135» donde iban
     * «13,5» multiplicaba por diez las kcal de esa comida para siempre.
     *
     * `showAs` solo se toca cuando cambia lo que representa: ver
     * `parcheDeAlimento.ficha`.
     */
    editFood: async (variant, mealIdx, optIdx, food, cambios) => {
      verbos.patchFood(variant, mealIdx, optIdx, food.id, parcheDeAlimento.ficha(cambios));
      // La biblioteca se actualiza por nombre (`upsertByName`), así que el nombre
      // lo pone la entrada y lo demás son los campos ya corregidos.
      return upsertLibraryFood({ name: food.name, ...cambios });
    },
  };
};
