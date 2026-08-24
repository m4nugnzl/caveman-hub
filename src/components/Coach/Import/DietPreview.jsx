import { Trash2, X } from 'lucide-react';

import { claveDeNombre } from '@/domain/foodMatch';
import { toMealDrafts } from '@/domain/dietSheet';
import { Field, SegmentedControl } from '@/components/ui/primitives';
import { Autocomplete } from '@/components/ui/Autocomplete';
import { nuevaId } from './RoutinePreview';

/**
 * La dieta leída, tal y como se va a guardar, y editable.
 *
 * ══ Lo que aquí se pregunta y no se decide ═════════════════════════════════
 *
 * Dos cosas, y las dos por el mismo motivo: la hoja no las dice y esto no las
 * puede saber.
 *
 *   · **Qué alimento es cada nombre.** «Garbanzos» son los crudos o los
 *     cocidos, y entre unos y otros hay ciento cincuenta kilocalorías por cada
 *     cien gramos. La propuesta viene puesta y cambiarla es un clic; lo que no
 *     se encuentra se puede escribir, y lo escrito se queda en la biblioteca
 *     para la próxima dieta que entre.
 *   · **Qué día es cada hoja.** «Low» y «High» son hidratos, no días. Se
 *     propone lo habitual —alto el día que entrenas— y se deja cambiar.
 *
 * Sin estado propio, como `RoutinePreview` y por lo mismo: se puede pintar en
 * una prueba sin simular a nadie escribiendo.
 */

/* ══ Lo leído, materializado para poder corregirlo ═════════════════════════ */

export const toEditableDiet = (plan) =>
  (plan?.variants || []).map((variante) => ({
    id: nuevaId(),
    label: variante.label,
    variant: variante.variant === 'default' ? 'default' : variante.variant || 'training',
    targets: variante.targets || null,
    meals: (variante.meals || []).map((comida) => ({
      id: nuevaId(),
      name: comida.name,
      note: comida.note || '',
      target: comida.target || null,
      options: (comida.options || []).map((opcion) => ({
        id: nuevaId(),
        foods: (opcion.foods || []).map((alimento) => ({ ...alimento, id: nuevaId() })),
      })),
    })),
  }));

/** Qué trae una variante, en números. */
export const contarDieta = (variante) => {
  const meals = variante?.meals || [];
  return {
    meals: meals.length,
    options: meals.reduce((n, m) => n + m.options.length, 0),
    foods: meals.reduce((n, m) => n + m.options.reduce((k, o) => k + o.foods.length, 0), 0),
  };
};

/** La cantidad, dicha como la decía la hoja. */
export const cantidadVisible = (alimento) => {
  if (alimento.grams != null) return `${alimento.grams} ${alimento.deMl ? 'ml' : 'g'}`;
  if (alimento.units != null) return `${alimento.units} ${alimento.unitLabel || 'ud'}`;
  return '—';
};

const macrosVisibles = (targets) =>
  [
    targets?.kcals != null ? `${targets.kcals} kcal` : null,
    targets?.protein != null ? `${targets.protein} P` : null,
    targets?.carbs != null ? `${targets.carbs} H` : null,
    targets?.fats != null ? `${targets.fats} G` : null,
  ]
    .filter(Boolean)
    .join(' · ');

const VARIANTES = [
  { id: 'training', label: 'Días de entreno' },
  { id: 'rest', label: 'Días de descanso' },
];

/*
  Con UNA dieta leída y un cliente que tiene las dos, hace falta una tercera
  respuesta: la misma para los dos días. Es el caso normal de quien sube una
  dieta sola a alguien a quien ya le separó los días —y sin ella, la mitad de lo
  que se importa se quedaría en un día que el cliente no tiene.
*/
const VARIANTES_Y_AMBAS = [...VARIANTES, { id: 'both', label: 'Las dos' }];

/**
 * Lo que trae una lectura además de las comidas, dicho una a una.
 *
 * ── Por qué no vale un rótulo genérico ──────────────────────────────────────
 * Decía «Objetivo de macros» en cuanto encontraba CUALQUIER cosa —los pasos, una
 * pauta— y se importaba sin objetivo, que es lo que hace pensar que la
 * importación no funciona. Si no hay cifras, no se nombran.
 */
export const resumenDeCabecera = (lectura) =>
  [
    lectura?.targets ? macrosVisibles(lectura.targets) : null,
    lectura?.steps ? 'pasos' : null,
    lectura?.cardio ? 'cardio' : null,
    lectura?.notes?.length
      ? `${lectura.notes.length} ${lectura.notes.length === 1 ? 'pauta' : 'pautas'}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

/* ══ Los alimentos que hay que mirar ═══════════════════════════════════════ */

/**
 * Un nombre de la hoja, atado a un alimento de verdad.
 *
 * ── Por qué se pregunta por NOMBRE y no por aparición ───────────────────────
 * «Papilla de bebé» sale cinco veces en la misma hoja y es la misma pregunta
 * las cinco. Preguntarla una vez y aplicarla a todas es la diferencia entre
 * revisar doce cosas y revisar cuarenta.
 */
export const FoodMatchRow = ({ pendiente, foods, valor, onChange }) => {
  const elegido = valor?.food || null;
  const macros = valor?.macros || {};

  const propuestos = pendiente.candidates.length
    ? `Tu hoja decía «${pendiente.name}». Encaja con ${pendiente.candidates.length} alimentos.`
    : elegido
      ? `Tu hoja decía «${pendiente.name}».`
      : 'No lo tengo. Búscalo, o escribe sus macros y se guardará en tu biblioteca.';

  return (
    <div className="card-inset col gap-2">
      <div className="row-end wrap gap-2">
        <Field className="grow" label={pendiente.name} hint={propuestos}>
          {(props) => (
            <Autocomplete
              value={valor?.texto ?? ''}
              onChange={(texto) => onChange({ ...valor, texto, food: null })}
              items={foods}
              abreVacio
              getMeta={(food) =>
                `P${food.proteinPer100} C${food.carbsPer100} G${food.fatsPer100} /100g`
              }
              onPick={(food) => onChange({ ...valor, food, texto: food.name })}
              placeholder="Buscar en tu biblioteca…"
              inputProps={props}
            />
          )}
        </Field>

        {elegido && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onChange({ ...valor, food: null, texto: '' })}
          >
            No es ese
          </button>
        )}
      </div>

      {/*
        Los macros a mano solo cuando no hay alimento elegido. Con uno elegido
        sobran —los suyos son los buenos— y enseñarlos igualmente invitaría a
        teclear encima de un dato que ya estaba bien.
      */}
      {!elegido && (
        <div className="row-end wrap gap-2">
          {[
            { key: 'proteinPer100', label: 'P /100g' },
            { key: 'carbsPer100', label: 'C /100g' },
            { key: 'fatsPer100', label: 'G /100g' },
          ].map(({ key, label }) => (
            <Field key={key} label={label} className="shrink-0">
              {(props) => (
                <input
                  {...props}
                  type="text"
                  inputMode="decimal"
                  className="input input-sm input-center"
                  style={{ width: 68 }}
                  value={macros[key] ?? ''}
                  onChange={(e) =>
                    onChange({ ...valor, macros: { ...macros, [key]: e.target.value } })
                  }
                />
              )}
            </Field>
          ))}

          {/* Solo si la hoja lo contaba en piezas: es el único caso en el que
              hace falta saber lo que pesa una, y preguntarlo siempre sería una
              casilla más que nadie rellena. */}
          {pendiente.units && (
            <Field label={`g por ${pendiente.unitLabel || 'unidad'}`} className="shrink-0">
              {(props) => (
                <input
                  {...props}
                  type="text"
                  inputMode="decimal"
                  className="input input-sm input-center"
                  style={{ width: 68 }}
                  value={macros.unitGrams ?? ''}
                  onChange={(e) =>
                    onChange({ ...valor, macros: { ...macros, unitGrams: e.target.value } })
                  }
                />
              )}
            </Field>
          )}
        </div>
      )}
    </div>
  );
};

export const FoodMatchList = ({ pendientes, foods, valores, onChange }) => (
  <div className="col gap-3">
    {pendientes.map((pendiente) => (
      <FoodMatchRow
        key={pendiente.clave}
        pendiente={pendiente}
        foods={foods}
        valor={valores[pendiente.clave]}
        onChange={(valor) => onChange(pendiente.clave, valor)}
      />
    ))}
  </div>
);

/* ══ La dieta ══════════════════════════════════════════════════════════════ */

export const DietPreview = ({
  variants,
  /* El cliente ya tiene dos dietas: aunque solo se traiga una, hay que decir a
     cuál de los dos días va. */
  preguntarVariante = false,
  onSetVariant,
  onRenameMeal,
  onRemoveMeal,
  onRemoveFood,
}) => (
  <>
    {variants.map((variante, vi) => {
      const cuenta = contarDieta(variante);
      return (
        <div className="col gap-4" key={variante.id}>
          <div className="row between wrap gap-3">
            <span className="t-sm t-secondary">
              <strong>{variante.label}</strong> · {cuenta.meals} comidas · {cuenta.foods} alimentos
              {variante.targets ? ` · ${macrosVisibles(variante.targets)}` : ''}
            </span>

            {/* Se pregunta cuando la hoja trae dos dietas —cuál es cuál— y
                cuando el cliente ya las tiene, aunque la hoja traiga una: si no,
                la dieta cae en un día a dedo y el otro se queda como estaba sin
                que nada lo diga. Con una dieta y un cliente sin variantes la
                pregunta no existe, porque la distinción tampoco. */}
            {(variants.length > 1 || preguntarVariante) && (
              <SegmentedControl
                label={`Qué día es «${variante.label}»`}
                value={variante.variant === 'default' ? 'training' : variante.variant}
                onChange={(v) => onSetVariant(vi, v)}
                options={variants.length > 1 ? VARIANTES : VARIANTES_Y_AMBAS}
              />
            )}
          </div>

          {variante.meals.map((comida, mi) => (
            <div className="col gap-2" key={comida.id}>
              <div className="row between wrap gap-3">
                <Field
                  className="grow"
                  label={`Comida ${mi + 1} de ${variante.meals.length}`}
                  hint={
                    `${comida.options.length} ${comida.options.length === 1 ? 'opción' : 'opciones'}` +
                    (comida.target ? ` · ${macrosVisibles(comida.target)}` : '')
                  }
                >
                  {(props) => (
                    <input
                      {...props}
                      className="input input-sm"
                      value={comida.name}
                      onChange={(e) => onRenameMeal(vi, mi, e.target.value)}
                    />
                  )}
                </Field>

                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => onRemoveMeal(vi, mi)}
                  title={`Quitar «${comida.name}» de lo que se va a crear`}
                >
                  <Trash2 size={14} /> Quitar comida
                </button>
              </div>

              {comida.note && <p className="t-xs t-tertiary">{comida.note}</p>}

              <div className="table-scroll">
                <table className="table table-compact">
                  <thead>
                    <tr>
                      <th className="num">Opción</th>
                      <th>Alimentos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comida.options.map((opcion, oi) => (
                      <tr key={opcion.id}>
                        <td className="num">{oi + 1}</td>
                        <td>
                          <div className="row wrap gap-2">
                            {opcion.foods.map((alimento, fi) => (
                              <span className="badge" key={alimento.id}>
                                {alimento.name} <strong>{cantidadVisible(alimento)}</strong>
                                <button
                                  type="button"
                                  className="btn btn-icon"
                                  aria-label={`Quitar ${alimento.name}`}
                                  onClick={() => onRemoveFood(vi, mi, oi, fi)}
                                >
                                  <X size={13} />
                                </button>
                              </span>
                            ))}
                            {opcion.foods.length === 0 && (
                              <span className="t-xs t-tertiary">sin alimentos</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      );
    })}
  </>
);

/* ══ De la revisión a lo que se guarda ═════════════════════════════════════ */

/** El alimento con el que se importa un nombre: el elegido, el escrito, o nada. */
export const resolverCon = (valores) => (nombre) => {
  const valor = valores[claveDeNombre(nombre)];
  if (!valor) return null;
  if (valor.food) return valor.food;

  const macros = valor.macros || {};
  const numero = (v) => {
    const n = Number.parseFloat(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  };
  const algo = ['proteinPer100', 'carbsPer100', 'fatsPer100'].some((k) => numero(macros[k]) > 0);
  if (!algo) return null;

  return {
    name: nombre,
    proteinPer100: numero(macros.proteinPer100),
    carbsPer100: numero(macros.carbsPer100),
    fatsPer100: numero(macros.fatsPer100),
    unitLabel: numero(macros.unitGrams) > 0 ? valor.unitLabel || 'unidad' : null,
    unitGrams: numero(macros.unitGrams) > 0 ? numero(macros.unitGrams) : null,
  };
};

/** Los alimentos que el entrenador ha escrito a mano y no estaban en ningún sitio. */
export const alimentosNuevos = (valores, resolver) =>
  Object.values(valores)
    .filter((v) => !v.food)
    .map((v) => resolver(v.name))
    .filter(Boolean);

/**
 * La dieta editada, en lo que guarda la aplicación.
 *
 * «Las dos» sale como DOS variantes con las comidas montadas dos veces, no como
 * una lista compartida: cada comida y cada alimento nacen con su propio
 * identificador (`toMealDrafts`), y compartirlos entre las dos dietas haría que
 * editar la cena del día de entreno cambiara también la del de descanso.
 */
export const aPlanDeDieta = (variants, resolver, cabecera) => ({
  targets: cabecera?.targets || null,
  steps: cabecera?.steps || '',
  cardio: cabecera?.cardio || '',
  notes: cabecera?.notes || [],
  variants: variants.flatMap((variante) =>
    (variante.variant === 'both' ? ['training', 'rest'] : [variante.variant]).map((destino) => ({
      variant: destino,
      targets: variante.targets,
      meals: toMealDrafts(variante.meals, resolver),
    }))
  ),
});
