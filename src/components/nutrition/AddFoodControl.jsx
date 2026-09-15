import { useMemo, useState } from 'react';
import { useData } from '@/context/AppContext';
import { FOOD_TAG_LABELS, findByName, foodConflicts } from '@/domain/catalog';
import { macroError } from '@/domain/nutrition';
import { platoSummary } from '@/domain/platos';
import { toNum } from '@/lib/num';
import { Autocomplete } from '@/components/ui/Autocomplete';
import { Field, Notice } from '@/components/ui/primitives';

const EMPTY = {
  name: '',
  proteinPer100: '',
  carbsPer100: '',
  fatsPer100: '',
  // Opcionales y en blanco por defecto: la mayoría de los alimentos se pesan, y
  // pedir la unidad de todos convertiría un alta de cuatro campos en una de seis
  // con dos que casi siempre se dejan vacías.
  unitLabel: '',
  unitGrams: '',
};

/**
 * Buscador y alta rápida de alimento. Autocompleta desde la biblioteca del
 * coach (con los macros por 100 g ya guardados) o permite dar de alta uno nuevo
 * al vuelo, que queda guardado para la próxima vez.
 *
 * ══ Y desde aquí también se ponen tus PLATOS ═══════════════════════════════
 *
 * Un plato es una ración guardada con nombre —«80 g de avena + 200 ml de leche
 * + 1 plátano»—, que es la unidad con la que se pauta de verdad. Salen en la
 * misma lista que los alimentos, marcados, **y en el mismo buscador a
 * propósito**: la lección de `catalog.js` —«el momento en que necesitas
 * “lentejas” es mientras montas la dieta, no media hora antes administrando una
 * lista»— vale igual para el desayuno que ya tienes montado.
 *
 * Elegir uno **despliega sus alimentos** como entradas normales, no como un
 * enlace: editar el plato después no cambia las dietas que ya lo usaron, que es
 * el modelo desde `buildFoodEntry` —una dieta es una foto—.
 *
 * @param platos      Los tuyos (`platosOf`). Sin ellos, esto es el buscador de
 *   siempre y ni se nota.
 * @param onAddPlato  Qué hacer al elegir uno. Es otra acción que `onAdd` porque
 *   pone varios alimentos de golpe y quien la recibe necesita saber cuáles.
 */
export const AddFoodControl = ({ foodLibrary, onAdd, platos = [], onAddPlato = null, inputProps = {} }) => {
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState(null);
  /*
    ── El aviso pasivo (C12) ─────────────────────────────────────────────────
    Las etiquetas del alimento (0094) cruzadas con los condicionantes VIVOS de
    nutrición de este cliente (`foodConflicts`). Información, nunca filtro: el
    alimento se añade igual y la nota queda debajo — puede haber mil motivos
    legítimos, y el criterio es del entrenador. La misma gramática que el aviso
    del multipower en el banco: la app resalta, no receta.
  */
  const { conditions, activeClient } = useData();
  const [choque, setChoque] = useState(null); // { name, labels }

  /*
    Los platos DELANTE de los alimentos: son pocos, son tuyos y son lo que
    estabas buscando cuando escribes «desayuno». Con la lista al revés, los seis
    primeros resultados serían siempre alimentos y no se verían nunca.
  */
  const platosBuscables = useMemo(
    () => (onAddPlato ? platos : []).map((p) => ({ ...p, esPlato: true })),
    [platos, onAddPlato]
  );
  const buscables = useMemo(
    () => [...platosBuscables, ...(foodLibrary || [])],
    [platosBuscables, foodLibrary]
  );

  /* El choque de un plato es el de cualquiera de sus alimentos: el aviso tiene
     que salir aunque lo que lleve el gluten sea el tercer ingrediente. */
  const choquesDe = (item) =>
    item.esPlato
      ? [...new Set((item.foods || []).flatMap((f) => foodConflicts(f, conditions)))]
      : foodConflicts(item, conditions);

  const startCreating = () => {
    setDraft({ ...EMPTY, name: query.trim() });
  };

  /*
    ── Lo que se comprueba antes de dar de alta ─────────────────────────────
    Aquí no se comprobaba NADA: lo que se tecleara entraba en la biblioteca del
    equipo tal cual, y de ahí a todas las dietas que usaran el alimento. Es la
    misma regla que aplica `FoodDialog` al corregirlo — la comprobación vive en
    `domain/nutrition.js` para que las dos pantallas no puedan discrepar.

    Y la unidad va entera o no va: con etiqueta escrita, los gramos dejan de ser
    opcionales (CHECK de la 0030).

    ── Y un nombre que ya existe no da de alta nada ─────────────────────────
    El buscador ya no ofrece «crear» cuando hay coincidencia exacta, pero el
    nombre se puede seguir cambiando aquí dentro. Y por esta puerta se colaba
    lo que la regla de edición cierra: `upsertByName` identifica por NOMBRE, así
    que dar de alta «Pechuga de pollo» con otros macros no crea un segundo
    alimento — reescribe el que ya hay, que puede ser uno del catálogo o de un
    compañero.

    Dos alimentos distintos llevan nombres distintos: «Pan integral Bimbo» y no
    otro «Pan integral». Es lo único que la biblioteca sabe distinguir.
  */
  const repetido = draft && findByName(foodLibrary, draft.name);

  const errores = draft && {
    name: repetido ? `Ya existe «${repetido.name}». Elígelo de la lista o ponle otro nombre.` : null,
    proteinPer100: macroError(draft.proteinPer100),
    carbsPer100: macroError(draft.carbsPer100),
    fatsPer100: macroError(draft.fatsPer100),
    unitGrams:
      draft.unitLabel.trim() && !(toNum(draft.unitGrams) > 0)
        ? 'Hace falta el peso de una.'
        : null,
  };
  const sePuedeAnadir = Boolean(draft?.name.trim()) && !Object.values(errores || {}).some(Boolean);

  const commitNew = () => {
    if (!sePuedeAnadir) return;
    onAdd(draft);
    setDraft(null);
    setQuery('');
  };

  if (draft) {
    return (
      <div className="card-inset col gap-3">
        <div className="row-end wrap gap-2">
          <Field label="Alimento" error={errores.name} className="grow">
            {(props) => (
              <input
                {...props}
                autoFocus
                className="input"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Nombre del alimento"
              />
            )}
          </Field>

          {[
            { key: 'proteinPer100', label: 'P /100g' },
            { key: 'carbsPer100', label: 'C /100g' },
            { key: 'fatsPer100', label: 'G /100g' },
          ].map(({ key, label }) => (
            <Field key={key} label={label} error={errores[key]} className="shrink-0">
              {(props) => (
                <input
                  {...props}
                  type="text"
                  inputMode="decimal"
                  className="input input-center"
                  style={{ width: 72 }}
                  value={draft[key]}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                />
              )}
            </Field>
          ))}
        </div>

        {/*
          ── La unidad, para lo que no se pesa ────────────────────────────────
          Nadie pesa un huevo ni una manzana. Con estos dos campos rellenos, el
          alimento se escribe y se lee en piezas —«2 huevos»— y los gramos se
          calculan solos; sin rellenar, se comporta como siempre.

          Van en una segunda fila y no mezclados con los macros porque son otra
          cosa: los de arriba describen el alimento, estos describen cómo se
          cuenta. Y son los únicos dos opcionales del formulario.
        */}
        <div className="row-end wrap gap-2">
          <Field
            label="Se cuenta en (opcional)"
            // Mismos ejemplos que en el diálogo de la dieta (`MealCard`): es la
            // misma pregunta hecha en dos sitios, y dos listas distintas harían
            // pensar que no lo es.
            hint="En singular: unidad, cucharada, rebanada, lata, vaso…"
            className="grow"
          >
            {(props) => (
              <input
                {...props}
                className="input"
                value={draft.unitLabel}
                onChange={(e) => setDraft({ ...draft, unitLabel: e.target.value })}
                placeholder="Se pesa en gramos"
              />
            )}
          </Field>

          <Field label="g por unidad" error={errores.unitGrams} className="shrink-0">
            {(props) => (
              <input
                {...props}
                type="text"
                inputMode="decimal"
                className="input input-center"
                style={{ width: 72 }}
                value={draft.unitGrams}
                onChange={(e) => setDraft({ ...draft, unitGrams: e.target.value })}
                // Sin etiqueta, este número no significa nada y la base lo
                // rechazaría: las dos columnas van juntas o no va ninguna.
                disabled={!draft.unitLabel.trim()}
              />
            )}
          </Field>
        </div>

        <div className="row gap-2">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={commitNew}
            disabled={!sePuedeAnadir}
          >
            Añadir
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDraft(null)}>
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="col gap-2" style={{ minWidth: 0 }}>
      <Autocomplete
        value={query}
        onChange={(v) => {
          setQuery(v);
          /* El aviso es de la última elección: al volver a buscar, se retira. */
          if (choque) setChoque(null);
        }}
        items={buscables}
        /* Sin escribir nada se ojean TUS PLATOS, que son pocos y son tuyos.
           Sin esto, un plato solo aparecía escribiendo su nombre —o sea, solo
           si ya te acordabas de cómo lo llamaste—, y una vitrina que hay que
           recordar de memoria se comporta igual que una vacía. Los alimentos
           siguen sin volcarse: son trescientos y esos sí se buscan. */
        vacio={platosBuscables.length > 0 ? platosBuscables : null}
        /*
          Tres datos además de los macros:

          · La unidad, que es lo que distingue «Huevo entero» —que se cuenta— de
            «Clara de huevo» cuando los dos salen en la lista.
          · De dónde viene. Marcar los del catálogo explica por qué, al elegir uno,
            aparece de repente en tu biblioteca: no es un efecto secundario raro,
            es lo que significa usarlo por primera vez.
          · Y el choque con SUS restricciones, ya en la lista: «lleva gluten» al
            lado de un celíaco se lee antes de elegir, no después.
        */
        getMeta={(food) => {
          const en = choquesDe(food);
          const choques =
            en.length > 0
              ? `lleva ${en.map((t) => FOOD_TAG_LABELS[t].toLowerCase()).join(' y ')}`
              : null;

          /* Un plato no tiene macros por 100 g: lo que se lee de él es qué lleva
             y cuánto suma. Enseñar «P0 C0 G0» sería un número falso. */
          if (food.esPlato) return [`tu plato · ${platoSummary(food)}`, choques].filter(Boolean).join(' · ');

          return [
            `P${food.proteinPer100} C${food.carbsPer100} G${food.fatsPer100} /100g`,
            food.unitLabel ? `1 ${food.unitLabel} = ${food.unitGrams} g` : null,
            choques,
            food.fromCatalog ? 'del catálogo' : null,
          ]
            .filter(Boolean)
            .join(' · ');
        }}
        onPick={(food) => {
          const en = choquesDe(food);
          setChoque(
            en.length > 0
              ? { name: food.name, labels: en.map((t) => FOOD_TAG_LABELS[t].toLowerCase()) }
              : null
          );
          if (food.esPlato) onAddPlato(food);
          else onAdd(food);
          setQuery('');
        }}
        onCreate={startCreating}
        queEs="alimento"
        placeholder={onAddPlato ? 'Buscar alimento o plato…' : 'Buscar o añadir alimento…'}
        /* Quien abre el buscador desde el verbo de la comida quiere teclear ya,
           y quien se va sin escribir nada lo cierra al salir. Ver `.comida-alta`
           en `MealCard`. */
        inputProps={inputProps}
      />
      {choque && (
        <Notice tone="warn">
          {activeClient?.name || 'Este cliente'} evita {choque.labels.join(' y ')} y «{choque.name}
          » {choque.labels.length === 1 ? 'lo' : 'los'} lleva. Está añadido — quitarlo o dejarlo es
          cosa tuya.
        </Notice>
      )}
    </div>
  );
};
