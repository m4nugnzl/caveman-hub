/**
 * La maquinaria del gimnasio de un cliente.
 *
 * ══ De dónde sale ══════════════════════════════════════════════════════════
 *
 * De cómo se trabaja de verdad: el entrenador le pide fotos de las máquinas, las
 * sube a una carpeta de Drive y **monta la rutina mirando esas fotos en otra
 * pestaña**. La aplicación no sabía nada de eso, y el dato que decide si un
 * ejercicio se puede prescribir vivía fuera.
 *
 * Un cliente lo dejó escrito en su cuestionario: «me cambio de gimnasio, tendré
 * que ajustar desde cero el peso de la maquinaria, por eso no he incluido los
 * pesos en la rutina». Un cambio de sitio invalida todas sus cargas.
 *
 * ══ Las «carpetas» son los grupos musculares ═══════════════════════════════
 *
 * `MUSCLE_GROUPS` ya es el vocabulario con el que está escrito el entrenamiento
 * entero: la biblioteca de ejercicios, el volumen semanal, los colores de la
 * analítica. Un árbol propio sería un segundo vocabulario para lo mismo, y la
 * primera vez que alguien escribiera «Espalda» en vez de «Dorsal» se acabaría la
 * correspondencia — que es justo lo que hace útil el álbum: enseñar lo que tiene
 * PARA PECHO el día que se programa pecho.
 */

import { MUSCLE_GROUPS } from './training';
/* El mismo `slug` que nombra las fotos de progreso: dos formas de limpiar un
   nombre de archivo en el mismo bucket es cómo se acaba con dos convenciones. */
import { slug } from './photos';

/** Donde cae lo que no reconoce el catálogo. Existe en `MUSCLE_GROUPS`. */
export const OTHER_GROUP = 'Otros';

/**
 * La bandeja de lo que todavía no se ha ordenado.
 *
 * ══ Por qué hace falta un estado más ═══════════════════════════════════════
 *
 * Porque subir y clasificar son dos gestos y pasan en momentos distintos. Quien
 * está en el gimnasio hace cuarenta fotos seguidas con el móvil; decidir de qué
 * músculo es cada máquina mientras las hace convierte una tanda de dos minutos
 * en un formulario de veinte.
 *
 * Sin esta bandeja, lo sin clasificar caería en «Otros» — que es un grupo de
 * verdad, con máquinas que de verdad son de otros— y entonces «Otros» pasaría a
 * significar dos cosas a la vez: lo que no encaja en ningún músculo y lo que
 * nadie ha mirado todavía. La primera es una decisión y la segunda una tarea
 * pendiente, y una pantalla no puede pedirte que las distingas de memoria.
 *
 * ── Por qué un valor de texto y no un NULL ─────────────────────────────────
 * Porque la columna es `NOT NULL DEFAULT 'Otros'` (0079) y cambiar eso pide otra
 * migración para no ganar nada: lo que la base guarda da igual mientras solo lo
 * lea este módulo, que es la misma decisión que tomó `intake.js` con los dos
 * pasos que conservan su columna booleana.
 */
export const UNSORTED = 'Sin clasificar';

/** El orden de la pantalla: primero lo pendiente, después el cuerpo. */
const GROUP_ORDER = [UNSORTED, ...MUSCLE_GROUPS];

export const isUnsorted = (item) => item?.muscleGroup === UNSORTED;

/** Las opciones de un selector de grupo, con la bandeja delante. */
export const groupOptions = () => GROUP_ORDER;

/**
 * La ruta de una foto de maquinaria en el bucket.
 *
 * `<clientId>/gym/<marca de tiempo>-<grupo>.webp`
 *
 * El primer segmento es el id del cliente porque de él dependen DOS cosas que no
 * hay que volver a escribir: las políticas de la 0007 autorizan por ahí —así que
 * esta carpeta no necesita política propia— y la cuota de la 0067 suma por ahí.
 *
 * El grupo va en el nombre solo para poder mirar el bucket y entender qué hay:
 * la verdad está en la columna, y renombrar un grupo NO mueve el archivo.
 */
export const buildEquipmentPath = ({ clientId, muscleGroup, timestamp }) =>
  `${clientId}/gym/${timestamp ?? Date.now()}-${slug(muscleGroup) || 'maquina'}.webp`;

/**
 * Una fila de la base, completada y acotada.
 *
 * Un grupo desconocido cae en «Otros» y NO se descarta: una foto sin carpeta
 * sigue siendo una foto de su gimnasio, y perderla en silencio por un valor que
 * la base admite y el navegador no reconoce sería el peor de los dos mundos.
 */
export const cleanEquipment = (row) => {
  if (!row?.photoPath) return null;

  const grupo = String(row.muscleGroup || '').trim();
  const nombre = String(row.name || '').trim();

  return {
    id: row.id ?? null,
    clientId: row.clientId ?? null,
    muscleGroup: GROUP_ORDER.includes(grupo) ? grupo : OTHER_GROUP,
    name: nombre || null,
    photoPath: row.photoPath,
    /* La URL firmada se resuelve al cargar y caduca; por eso viaja aparte de la
       ruta y puede llegar vacía sin que la pieza deje de existir. */
    url: row.url || null,
  };
};

/**
 * Agrupada por músculo, en el ORDEN DEL CATÁLOGO y no en el de subida.
 *
 * El orden de `MUSCLE_GROUPS` es el del cuerpo —pecho, dorsal, espalda alta,
 * tríceps…— y es el mismo con el que se leen el volumen semanal y la analítica.
 * Ordenar por fecha de subida daría una lista distinta en cada cliente y en cada
 * pantalla, y entonces habría que leerla entera cada vez.
 *
 * Los grupos sin nada NO salen: son quince y un gimnasio normal llena seis.
 */
export const byMuscle = (items = []) => {
  const limpias = (items || []).filter(Boolean);

  return GROUP_ORDER.map((grupo) => ({
    group: grupo,
    items: limpias.filter((it) => it.muscleGroup === grupo),
  })).filter((tanda) => tanda.items.length > 0);
};

/** Cuántas quedan por ordenar. Es lo que convierte la bandeja en una tarea. */
export const unsortedCount = (items = []) =>
  (items || []).filter((it) => it && isUnsorted(it)).length;

/** Las de un grupo concreto, para cuando se programa ese día. */
export const forMuscle = (items = [], grupo) =>
  (items || []).filter((it) => it && it.muscleGroup === grupo);

/**
 * «12 máquinas en 5 grupos». Vive aquí porque lo dicen DOS pantallas —la ficha y
 * la rutina— y dos redacciones del mismo recuento es cómo se acaba dudando de si
 * cuentan lo mismo.
 */
export const equipmentHeadline = (items = []) => {
  const total = (items || []).filter(Boolean).length;
  if (total === 0) return null;

  const maquinas = total === 1 ? '1 foto' : `${total} fotos`;
  const pendientes = unsortedCount(items);

  /* Lo pendiente manda sobre el recuento: es lo único de esta frase sobre lo que
     se puede hacer algo. «12 fotos en 5 grupos» con cuatro sin ordenar deja la
     tarea escondida detrás de un dato. */
  if (pendientes > 0) {
    return pendientes === total
      ? `${maquinas} sin ordenar`
      : `${maquinas} · ${pendientes} sin ordenar`;
  }

  /* Los grupos se cuentan SIN la bandeja, que aquí ya está vacía. */
  const grupos = byMuscle(items).length;
  return grupos === 1 ? maquinas : `${maquinas} en ${grupos} grupos`;
};
