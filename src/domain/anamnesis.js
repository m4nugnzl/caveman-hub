/**
 * La ficha de una persona, en una hoja: su anamnesis.
 *
 * ══ Por qué hace falta poder descargarla ═══════════════════════════════════
 *
 * Por dos motivos que no se parecen y que la misma hoja resuelve:
 *
 *   · **Es un historial de salud.** Lo que se recoge aquí —lesiones, patologías,
 *     alergias, medicación— es lo que en cualquier consulta se llama anamnesis, y
 *     un historial que solo existe dentro de una aplicación es un historial que
 *     no se puede archivar, ni imprimir, ni enseñar a un fisioterapeuta.
 *   · **Es suyo.** La exportación que ya existía (`exportClientData`) entrega un
 *     JSON: cumple el derecho de acceso sobre el papel y no lo cumple de verdad,
 *     porque nadie lee un JSON. Esto es lo mismo escrito para una persona.
 *
 * ══ Lo que esto NO es, y conviene decirlo ══════════════════════════════════
 *
 * No es un documento clínico ni sustituye a uno. Es lo que el cliente ha
 * contado y lo que su entrenador ha apuntado, con la fecha en la que se generó.
 * Por eso lleva esa fecha arriba: un historial sin fecha invita a creer que está
 * al día, y este vale exactamente lo que valía el día que se sacó.
 *
 * ══ Por qué se arma aquí y no en la pantalla ═══════════════════════════════
 *
 * Porque lo van a pedir DOS: el entrenador desde la ficha y el cliente desde su
 * portal. La misma persona no puede tener dos anamnesis distintas según quién
 * pulse el botón — y con la lógica en cada pantalla, la segunda se queda atrás
 * en cuanto se añade un campo.
 *
 * Devuelve una estructura, no HTML ni texto: quien la pinta decide cómo se ve.
 */

import { age } from './ficha';
import { PROFILE_GROUPS, customAnswers, fieldText, profileRows } from './profile';
import { clientIntakeForm } from './intakeForm';
import { activeConditions, areaLabel, resolvedConditions, severityLabel } from './conditions';
import { byMuscle } from './equipment';
import { latestWeight } from './anthropometry';
import { shortDate, todayISO } from '@/lib/dates';

/**
 * @param client     La ficha, con `preferences` y `profile`.
 * @param conditions Sus condicionantes (`domain/conditions.js`).
 * @param equipment  Sus fotos de maquinaria — aquí solo se cuentan.
 * @param history    Su histórico de pesajes, para el peso de partida.
 */
export const buildAnamnesis = ({ client, conditions, equipment, history }, today = todayISO()) => {
  const años = age(client?.birthDate, today);
  const peso = latestWeight(history || []);

  /* Los cuatro de identidad, con su hueco incluido: en un documento de salud,
     que no conste la altura es información — significa que nadie la tomó. */
  const identidad = [
    ['Nombre', client?.name || null],
    ['Edad', años === null ? null : `${años} años`],
    ['Sexo', client?.gender || null],
    ['Altura', client?.heightCm ? `${client.heightCm} cm` : null],
    ['Peso', peso ? `${peso} kg` : null],
    ['Correo', client?.email || null],
    ['Teléfono', client?.phone || null],
    ['Cliente desde', client?.startDate ? shortDate(client.startDate) : null],
  ];

  /*
    Los condicionantes van los PRIMEROS del cuerpo, antes que nada de lo demás.

    Es la única parte de esta hoja que alguien puede necesitar con prisa —quien
    la lea buscando si esta persona puede hacer algo o no— y enterrarla detrás
    de a qué hora come sería ordenar el documento por cómo se recogió en vez de
    por para qué se lee.
  */
  const vigentes = activeConditions(conditions).map((c) => ({
    label: c.label,
    detail: c.detail,
    area: areaLabel(c.area),
    severity: severityLabel(c.severity),
    blocking: c.severity === 'block',
    since: c.since ? shortDate(c.since) : null,
  }));

  const resueltos = resolvedConditions(conditions).map((c) => ({
    label: c.label,
    resolvedAt: c.resolvedAt ? shortDate(c.resolvedAt) : null,
  }));

  /* Las tandas del perfil, con SOLO lo que tiene valor: un documento con quince
     líneas en blanco no dice que falte información, dice que está mal hecho. */
  const bloques = PROFILE_GROUPS.map((grupo) => ({
    label: grupo.label,
    rows: profileRows(client?.profile, grupo.id).map((r) => [r.label, r.text]),
  })).filter((b) => b.rows.length > 0);

  /* Y las preguntas propias del entrenador, con la etiqueta que se le hizo al
     cliente —la copia de SU formulario— y no con la plantilla de hoy. */
  const form = clientIntakeForm(client?.preferences);
  const propias = customAnswers(client?.profile);
  const suyas = form.custom
    .map((q) => [q.label, propias[q.id]])
    .filter(([, valor]) => valor !== undefined && valor !== null && valor !== '')
    .map(([label, valor]) => [label, typeof valor === 'boolean' ? (valor ? 'Sí' : 'No') : valor]);

  const tandas = byMuscle(equipment);

  return {
    generatedAt: today,
    name: client?.name || 'Cliente',
    identidad: identidad.filter(([, valor]) => valor !== null),
    /* Lo que NO consta se enumera aparte, en una línea. Es lo honesto en un
       historial: distinguir «no tiene» de «no se preguntó». */
    sinConstar: identidad.filter(([, valor]) => valor === null).map(([etiqueta]) => etiqueta),
    conditions: vigentes,
    resolved: resueltos,
    blocks: bloques,
    custom: suyas,
    gym: {
      total: (equipment || []).length,
      groups: tandas.map((t) => ({ group: t.group, count: t.items.length })),
      folder: fieldText(client?.profile, 'gymFolder'),
    },
  };
};

/** El nombre del archivo. Con la fecha: se archiva más de uno a lo largo del tiempo. */
export const anamnesisFileName = (client, today = todayISO()) =>
  `anamnesis-${String(client?.name || 'cliente')
    .toLowerCase()
    .normalize('NFD')
    /* Los acentos, fuera. Sin el `normalize` de arriba, la regla de abajo
       convertiría la «é» de «José» en un guion y el archivo se llamaría «jos-»;
       separando la letra de su tilde, lo que queda es una «e» que sí pasa. */
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}-${today}.html`;
