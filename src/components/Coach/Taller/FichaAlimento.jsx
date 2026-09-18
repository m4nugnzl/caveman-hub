import { useState } from 'react';
import { Trash2 } from 'lucide-react';

import { useActions, useApp } from '@/context/AppContext';
import {
  FOOD_CATEGORIES,
  FOOD_TAG_LABELS,
  canEditLibraryItem,
  findByName,
} from '@/domain/catalog';
import { MICROS, microError, microPer100 } from '@/domain/micros';
import { macroError } from '@/domain/nutrition';
import { toNum } from '@/lib/num';
import { Field, Notice, TextInput } from '@/components/ui/primitives';
import { MenuAcciones } from '@/components/ui/MenuAcciones';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useToast } from '@/components/ui/ToastProvider';
import { DondeEstaPuesto } from './DondeEstaPuesto';
import { SelectorDeClase } from './SelectorDeClase';
import { EtiquetaNutricional } from './EtiquetaNutricional';

/**
 * La ficha de un alimento, en DOS CAPAS. La hermana de `FichaEjercicio`, y a
 * propósito: es el mismo mueble montado dos veces, no un invento nuevo.
 *
 * ══ Por qué esta pantalla no existía y hacía falta ═════════════════════════
 *
 * Corregir un alimento SÍ se podía —el lápiz de la fila de una dieta, con su
 * `FoodDialog`—, y por tanto la pantalla de la biblioteca era el único sitio
 * del producto donde la biblioteca no se corregía. Estaba del revés.
 *
 * ══ Capa 1 · Del catálogo: de referencia, y no se toca ═════════════════════
 *
 * La regla de la 0033, intacta: la pechuga de pollo tiene los mismos macros en
 * todas las bibliotecas del mundo, y los del catálogo salen de tablas de
 * composición y no del criterio de nadie. `canEditLibraryItem` lo decide; esto
 * solo lo cuenta.
 *
 * ── Y la fila congelada deja de ser un callejón ────────────────────────────
 * Eso es lo que fallaba: una fila del catálogo se veía IGUAL que una tuya y no
 * ofrecía ninguna salida. Ahora lo dice y ofrece la que la doctrina ya
 * prescribía —«para unos macros distintos se da de alta un alimento distinto,
 * con su nombre»—: **«Crear el mío a partir de este»**, que prerrellena un alta
 * con los macros del catálogo y el nombre listo para distinguir. Un gesto donde
 * había un muro.
 *
 * ══ Capa 2 · Lo tuyo ═══════════════════════════════════════════════════════
 *
 * Los macros y la unidad, si el alimento es tuyo. Y **tu nota** siempre, sea del
 * catálogo o no: «el de lata al natural, no en aceite» no es un hecho del
 * alimento sino tuyo, y el catálogo no puede tenerlo. Es la misma excepción que
 * la 0098 hizo con el vídeo del ejercicio y por el mismo motivo — ver
 * `saveFoodSheet`.
 *
 * ── Y desde la 0102, lo que lleva y lo que pone el envase ─────────────────
 * Las **etiquetas** (gluten, lactosa…) y las **cuatro cifras de la etiqueta
 * europea** (fibra, azúcares, saturadas, sal) son HECHOS del alimento, así que
 * van con los macros y no con la nota: se corrigen donde se corrigen los macros
 * y se protegen igual que ellos.
 *
 * Las etiquetas cierran un agujero que ya estaba abierto: `foodConflicts` avisa
 * de un alérgeno cruzando `tags` con los condicionantes del cliente, y hasta
 * ahora solo tenía etiquetas del catálogo — o sea que el aviso funcionaba con la
 * pechuga de pollo y **se callaba justo con tus marcas y tus suplementos**, que
 * es donde el alérgeno importa.
 *
 * Las cuatro cifras se rellenan a mano, copiadas del envase, y en blanco
 * significan «no dice» — nunca cero. Ver `micros.js`, que es donde vive el
 * porqué de esa distinción.
 *
 * ══ El alta va aquí y no en otro sitio ═════════════════════════════════════
 *
 * Con un `nuevo` que añade el nombre y quita la capa de referencia, igual que
 * hace `FichaEjercicio`. Dar de alta y corregir son la misma pantalla porque son
 * la misma pregunta —qué lleva esto— hecha en dos momentos.
 */
const MACROS = [
  { key: 'proteinPer100', label: 'Proteína', corto: 'P' },
  { key: 'carbsPer100', label: 'Hidratos', corto: 'HC' },
  { key: 'fatsPer100', label: 'Grasas', corto: 'G' },
];

/* La cuenta de 4-4-9 vivía aquí para pintar «Salen 227 kcal por 100 g» debajo
   de los tres campos de macros. Ya no hace falta: la cifra grande de la
   etiqueta se recalcula con el borrador mientras tecleas, así que decirlo otra
   vez en gris sería el mismo eco que esta ficha ha venido a quitarse. */

export const FichaAlimento = ({
  alimento,
  nuevo = false,
  enCapa = false,
  enDietas = [],
  parecidos = [],
  onCrearElMio,
  onIr,
  onCerrar,
  onBorrado,
}) => {
  const { foodLibrary, catalogFoods, session } = useApp();
  const { upsertLibraryFood, saveFoodSheet, editLibraryFood, deleteLibraryFood } = useActions();
  const toast = useToast();
  const confirm = useConfirm();

  const [name, setName] = useState(alimento?.name || '');
  /* Cómo lo clasificas tú (0103). Sólo lo tuyo la tiene: la de un alimento del
     catálogo la sigue diciendo el catálogo, y la ficha la imprime en vez de
     ofrecerla. `''` es «sin clasificar», que es un estado legítimo. */
  const [category, setCategory] = useState(alimento?.category || '');
  const [macros, setMacros] = useState(() =>
    Object.fromEntries(MACROS.map(({ key }) => [key, String(alimento?.[key] ?? '')]))
  );
  const [unitLabel, setUnitLabel] = useState(alimento?.unitLabel || '');
  const [unitGrams, setUnitGrams] = useState(
    alimento?.unitGrams === null || alimento?.unitGrams === undefined
      ? ''
      : String(alimento.unitGrams)
  );
  const [note, setNote] = useState(alimento?.note || '');
  /* Lo que lleva y lo que pone el envase (0102). Las etiquetas como conjunto
     —el orden no significa nada y no puede haber repetidas— y las cifras como
     texto, porque en blanco es un valor válido que significa «no dice». */
  const [tags, setTags] = useState(() => new Set(alimento?.tags || []));
  const [micros, setMicros] = useState(() =>
    Object.fromEntries(
      MICROS.map(({ key, field }) => {
        const v = microPer100(alimento, key);
        return [field, v === null ? '' : String(v)];
      })
    )
  );
  const [guardando, setGuardando] = useState(false);
  /* Se abre en LECTURA y «Editar alimento» enciende las casillas (frame de
     Figma, 18 sep). La edición es la de siempre; guardar o cancelar la
     devuelven a lectura porque quien monta la ficha la remonta. El alta nace
     editando. */
  const [editando, setEditando] = useState(nuevo);

  /* ── Qué se ha tocado, para que el pie sepa si hay algo que guardar ───────
     El borrador entero contra la foto de cuando se montó. Quien monta esta
     ficha le da una `key` que cambia con el alimento, así que la foto inicial
     es siempre la del que se está mirando — sin ese remontaje la comparación
     mentiría en cuanto se pulsara otra fila, que es la misma razón por la que
     la `key` existía ya. */
  const foto = () =>
    JSON.stringify([macros, unitLabel, unitGrams, note, [...tags].sort(), micros, name.trim(), category]);
  const [fotoInicial] = useState(foto);
  const tocado = foto() !== fotoInicial;

  const nombre = name.trim();

  /*
    ══ QUIÉN ES ESTE ALIMENTO ════════════════════════════════════════════════

    Con el nombre ORIGINAL —el de la fila que se está mirando—, nunca con el que
    hay tecleado. Antes daba igual porque el nombre no se podía tocar; desde que
    sí, hacerlo con el tecleado significaría que a la primera letra de una
    corrección el alimento dejaría de encontrarse a sí mismo: los macros se
    apagarían solos, el «···» se vaciaría y la ficha se creería un alta.
  */
  const original = nuevo ? '' : String(alimento?.name || '').trim();

  /* La regla del dominio, la misma que aplica el lápiz de la dieta: se corrige
     lo que has dado de alta tú. Un alimento nuevo siempre: la fila la va a crear
     este mismo guardado. */
  const editable =
    nuevo ||
    canEditLibraryItem(original, {
      library: foodLibrary,
      catalog: catalogFoods,
      coachId: session?.user?.id || null,
    });

  const general = nuevo ? null : findByName(catalogFoods, original);
  const filaBiblioteca = nuevo ? null : findByName(foodLibrary, original);
  /* De quién es la fila, que es otra pregunta distinta de «se puede corregir»:
     la biblioteca es del equipo desde la 0006, y esto explica por qué un
     alimento que no está en el catálogo tampoco se deja tocar. */
  const deOtro =
    !nuevo &&
    Boolean(filaBiblioteca?.coachId) &&
    filaBiblioteca.coachId !== (session?.user?.id || null);

  /* Renombrar es lo que la ficha NO podía hacer y el dueño echó en falta. Sólo
     tiene sentido en lo tuyo: el nombre de un general es la referencia con la
     que se entienden todas las bibliotecas. */
  const renombra = !nuevo && editable && !deOtro && nombre.toLowerCase() !== original.toLowerCase();

  /*
    ── Que el nombre no pise a otro ──────────────────────────────────────────
    `upsertByName` identifica POR NOMBRE, así que un nombre repetido no crea un
    segundo alimento: reescribe el que hay, o —si es del catálogo— guarda los
    macros del catálogo y descarta silenciosamente los que se acaban de teclear.
    Los dos casos son peores que un error, porque no se ven. Y al renombrar el
    riesgo es el gemelo: dos filas llamadas igual, de las que el buscador enseña
    una sola.
  */
  const generalConEseNombre = nuevo || renombra ? findByName(catalogFoods, nombre) : null;
  const filaConEseNombre = nuevo || renombra ? findByName(foodLibrary, nombre) : null;
  const errorNombre = generalConEseNombre
    ? `«${generalConEseNombre.name}» es del catálogo y sus macros son los de referencia. Ponle un nombre que distinga el tuyo.`
    : filaConEseNombre
      ? `Ya existe «${filaConEseNombre.name}» en tu biblioteca. Ábrelo desde la lista o ponle otro nombre.`
      : null;

  const errores = Object.fromEntries(MACROS.map(({ key }) => [key, macroError(macros[key])]));
  /* Los tres a cero o en blanco. No invalida —ver el aviso de abajo—, pero se
     dice: es la única forma de que un alimento entre en una dieta sin sumar. */
  const sinMacros = MACROS.every(({ key }) => !(toNum(macros[key]) > 0));
  /* El mismo tope y por el mismo motivo —nada lleva más de 100 g de nada por
     cada 100 g—, pero en blanco significa otra cosa aquí: ver `microError`. */
  const erroresMicro = Object.fromEntries(
    MICROS.map(({ field }) => [field, microError(micros[field])])
  );
  /* Las dos columnas de unidad viajan juntas o no viaja ninguna (CHECK de la
     0030): con etiqueta escrita, los gramos dejan de ser opcionales. */
  const etiqueta = unitLabel.trim();
  const gramos = toNum(unitGrams);
  const errorUnidad = etiqueta && !(gramos > 0) ? 'Hace falta el peso de una.' : null;
  const valido =
    Boolean(nombre) &&
    !errorNombre &&
    !errorUnidad &&
    !Object.values(errores).some(Boolean) &&
    !Object.values(erroresMicro).some(Boolean);

  const guardar = async () => {
    if (!valido) return;

    /*
      ══ UNA escritura, y la puerta la decide de quién es el alimento ═════════

      Aquí había dos —los macros por `upsertLibraryFood` y la nota por
      `saveFoodSheet`— y la segunda pisaba a la primera: `saveFoodSheet` siembra
      macros cuando el alimento «todavía no está en tu biblioteca», y lo
      comprueba contra la `foodLibrary` del render, que en un ALTA es la de
      antes de crearlo. Resultado, comprobado contra la base: un alimento nuevo
      con sus macros escritos se guardaba en 0 · 0 · 0. Silencioso, y con el
      aviso de guardado en verde.

      Así que cada alimento pasa por una sola puerta, y ahora son tres:

        · el tuyo que YA TIENE FILA, por `editLibraryFood`, que escribe por id y
          es la única por la que el nombre y la categoría cambian;
        · el tuyo que todavía no la tiene —el alta, y el alimento de una dieta
          importada de un PDF—, por `upsertLibraryFood`, que la crea;
        · el del CATÁLOGO, por `saveFoodSheet`, que es la puerta de tu voz y a
          propósito no respeta la protección del catálogo: el arroz de
          referencia tiene que poder llevar tu nota, y solo eso.
    */
    const suyo = {
      name: nombre,
      category: category || null,
      proteinPer100: macros.proteinPer100,
      carbsPer100: macros.carbsPer100,
      fatsPer100: macros.fatsPer100,
      unitLabel: etiqueta || null,
      unitGrams: etiqueta ? gramos : null,
      /* Una casilla en blanco llega como `null` y BORRA lo que hubiera, que
         es como se corrige una cifra mal copiada de un envase. */
      tags: [...tags],
      note,
      ...Object.fromEntries(MICROS.map(({ field }) => [field, micros[field]])),
    };

    setGuardando(true);
    let fila = null;
    if (editable && filaBiblioteca && !deOtro) fila = await editLibraryFood(filaBiblioteca.id, suyo);
    else if (editable) fila = await upsertLibraryFood(suyo);
    else if (!deOtro) fila = await saveFoodSheet(nombre, { note });

    setGuardando(false);

    if (!fila) {
      toast({ text: 'No se ha podido guardar. Vuelve a intentarlo en un momento.' });
      return;
    }
    toast({ text: `«${nombre}» guardado.` });
    /* Renombrar mueve la fila que la lista tiene señalada: hay que llevar el
       carril al nombre nuevo o se quedaría apuntando a uno que ya no existe. */
    if (renombra || nuevo) onIr?.(nombre);
    onCerrar?.();
  };

  /*
    ══ QUITARLO DE TU BIBLIOTECA ══════════════════════════════════════════════

    La única puerta de esta pantalla que resta, y la que faltaba: la Librería se
    llamaba «tu material» y sus cuatro acciones daban de alta o corregían, así
    que sólo podía crecer — con una tabla cuyo camino de crecimiento ES la
    duplicación, porque los macros de tu marca obligan a un nombre nuevo.

    ── Sólo si no está puesto en ninguna dieta ──────────────────────────────
    Y no porque borrarlo rompiera algo: una entrada de dieta es una COPIA
    congelada (`buildFoodEntry`) y sigue siendo cierta sin su fila. Es que
    tirar de la biblioteca lo que estás dando de comer a alguien no es podar,
    es perder el sitio donde se corrige. Por eso el verbo ni se ofrece cuando la
    banda de arriba tiene nombres: la condición se LEE dos líneas más arriba, no
    se descubre en un error.
  */
  const puedeBorrarse = !nuevo && editable && !deOtro && enDietas.length === 0 && filaBiblioteca;

  const borrar = async () => {
    const vale = await confirm({
      title: `¿Quitar «${original}» de tu biblioteca?`,
      message:
        'Deja de estar en tu despensa y en los buscadores. Si es del catálogo, sigue ahí y vuelve a aparecer al usarlo.',
      confirmLabel: 'Quitarlo',
      tone: 'danger',
    });
    if (!vale) return;

    const fuera = await deleteLibraryFood(filaBiblioteca.id);
    if (!fuera) {
      toast({ text: 'No se ha podido quitar. Vuelve a intentarlo en un momento.' });
      return;
    }
    toast({ text: `«${original}» ya no está en tu biblioteca.` });
    onBorrado?.(original);
  };

  /* Sin nada que ofrecer no se pinta el «···»: un menú con cero verbos es un
     botón que al pulsarlo no hace nada. */
  const acciones = [
    puedeBorrarse && {
      label: 'Quitarlo de tu biblioteca',
      icon: Trash2,
      danger: true,
      run: borrar,
    },
  ].filter(Boolean);

  /* Qué se escribe aquí: lo tuyo entero, y en lo del catálogo sólo tu nota. Lo
     de un compañero, nada. */
  const puedeEditar = !deOtro;
  const escribe = editando && puedeEditar;
  const escribeHechos = escribe && editable;
  const lleva = alimento?.tags || [];

  return (
    <div className="col ficha-ej">
      {/*
        ══ QUIÉN ES, ARRIBA Y EN UNA PIEZA ═══════════════════════════════════

        El nombre en grande —la única voz que se levanta en esta ficha— y debajo
        su categoría y de dónde viene. Editando lo tuyo, ese mismo titular se
        escribe encima y la categoría es una chapa con menú.
      */}
      <header className="ficha-id">
        {escribeHechos ? (
          <input
            className="ficha-id-nom"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Pan integral Bimbo"
            aria-label="Cómo se llama"
            aria-invalid={errorNombre ? 'true' : undefined}
            autoFocus={nuevo}
          />
        ) : (
          /* En la CAPA no: el título del diálogo ya es el nombre. */
          !enCapa && <h2 className="ficha-id-nom">{original}</h2>
        )}

        <div className="ficha-id-clase">
          <SelectorDeClase
            valor={escribeHechos ? category || null : alimento?.category || null}
            opciones={FOOD_CATEGORIES}
            editable={escribeHechos}
            conVacio
            onElegir={(v) => setCategory(v || '')}
            ariaLabel="Dónde lo pones"
          />
          {!nuevo && !editable && <span className="ficha-id-origen">Del catálogo</span>}
          {!nuevo && editable && !deOtro && <span className="badge badge-info">Tuyo</span>}
        </div>

        {errorNombre && <p className="ficha-id-error">{errorNombre}</p>}

        {acciones.length > 0 && (
          <MenuAcciones items={acciones} ariaLabel={`Más cosas que hacer con ${original}`} />
        )}
      </header>

      {/* La etiqueta, que editando lo tuyo es además el editor. El porqué
          largo, en `EtiquetaNutricional`. */}
      <EtiquetaNutricional
        alimento={alimento}
        general={general}
        edicion={
          escribeHechos
            ? {
                macros,
                micros,
                unitLabel,
                unitGrams,
                errores: { ...errores, ...erroresMicro },
                errorUnidad,
                onMacro: (campo, v) => setMacros({ ...macros, [campo]: v }),
                onMicro: (campo, v) => setMicros({ ...micros, [campo]: v }),
                onUnitLabel: setUnitLabel,
                onUnitGrams: setUnitGrams,
              }
            : null
        }
      />

      {/*
        ── Los tres en blanco no se bloquean, se dicen ──────────────────────
        No es un error —el agua y el café solo son 0·0·0 de verdad—, así que se
        avisa y se deja guardar. La app resalta; el criterio es del entrenador.
      */}
      {escribeHechos && sinMacros && (
        <Notice tone="warn">
          Sin ningún macro, «{nombre || 'este alimento'}» suma 0 kcal en cualquier dieta donde
          entre. Correcto para el agua o el café solo; si no es el caso, cópialos del envase.
        </Notice>
      )}

      {/* Editando uno del catálogo, se dice por qué sus cifras no se abren y
          qué hacer en su lugar: «Duplicar», que está en el pie. */}
      {escribe && !nuevo && !editable && (
        <p className="ficha-capa-texto">
          Sus macros son los de referencia y aquí sólo escribes tu nota. Si la marca que compras
          trae otros, es otro alimento: «Duplicar» lo da de alta con su nombre.
        </p>
      )}

      {deOtro && (
        <Notice tone="info">
          Este alimento lo dio de alta un compañero de equipo. La biblioteca es compartida, así que
          sus macros los corrige quien los puso.
        </Notice>
      )}

      {/*
        ── Lo que lleva ───────────────────────────────────────────────────
        Hechos del alimento, nunca permisos: a quién se lo puedes dar lo decide
        el cruce con sus condicionantes, en la dieta. El frame no lo dibuja y
        se queda igual: sin esto el aviso de alérgenos es ciego con tus marcas.
        `rail-wrap` y no `rail`: con ratón las últimas chapas no se alcanzaban.
      */}
      {escribeHechos ? (
        <Field label="Lo que lleva" hint="Para que el aviso salte con los clientes que lo evitan.">
          <div className="rail rail-wrap" role="group" aria-label="Lo que lleva este alimento">
            {Object.entries(FOOD_TAG_LABELS).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className="chip"
                aria-pressed={tags.has(id)}
                onClick={() =>
                  setTags((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })
                }
              >
                {label}
              </button>
            ))}
          </div>
        </Field>
      ) : (
        lleva.length > 0 && (
          <section className="ficha-fila">
            <p className="ficha-capa-rot">Lo que lleva</p>
            <p className="ficha-fila-valor">
              {lleva.map((t) => FOOD_TAG_LABELS[t] || t).join(' · ')}
            </p>
          </section>
        )
      )}

      {/* Tu nota: la del catálogo también la lleva, porque es tuya y no del
          alimento. Leyendo, una caja hundida con su frase de ayuda debajo. */}
      {!deOtro &&
        (escribe ? (
          <Field label="Tu nota" hint="Lo que te dices al comprarlo. Tu cliente todavía no la ve.">
            <TextInput
              value={note}
              onChange={setNote}
              placeholder="El de lata al natural, no en aceite"
            />
          </Field>
        ) : (
          <section className="ficha-bloque">
            <p className="ficha-capa-rot">Tu nota</p>
            <div className="ficha-nota">
              {note.trim() ? (
                <p className="ficha-nota-texto">{note}</p>
              ) : (
                <p className="ficha-nota-texto es-vacia">Sin nota.</p>
              )}
              <p className="ficha-nota-ayuda">Lo que te dices al comprarlo. Tu cliente todavía no la ve.</p>
            </div>
          </section>
        ))}

      {!nuevo && (
        <DondeEstaPuesto
          titulo="A quién se lo das"
          gente={enDietas}
          vacio="Todavía no está en ninguna dieta."
        />
      )}

      {/* Si hay otro que se llama casi igual, se dice aquí: con «A quién se lo
          das» encima, la pareja se resuelve mirando. */}
      {!nuevo && parecidos.length > 0 && (
        <Notice tone="info">
          Tienes {parecidos.length === 1 ? 'otro que se llama' : 'otros que se llaman'} casi igual:{' '}
          {parecidos.map((otro, i) => (
            <span key={otro}>
              {i > 0 && ', '}
              <button type="button" className="cab-accion is-puerta" onClick={() => onIr?.(otro)}>
                {otro}
              </button>
            </span>
          ))}
          . Mira a quién se lo das y quédate con uno.
        </Notice>
      )}

      {/*
        ══ EL PIE ═════════════════════════════════════════════════════════════
        Leyendo: «Editar alimento» y «Duplicar». El frame dibuja además un
        «Nuevo alimento a partir de este» que hace exactamente lo mismo que
        «Duplicar»: se queda uno, porque dos botones para un verbo obligan a
        averiguar en qué se diferencian. Editando: cancelar y guardar, y
        «Guardar» sólo se enciende con algo tocado.
      */}
      {escribe ? (
        <div className="ficha-ej-pie">
          <button type="button" className="btn btn-sm" onClick={onCerrar}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={guardar}
            disabled={guardando || !valido || (!nuevo && !tocado)}
          >
            Guardar
          </button>
        </div>
      ) : (
        <div className="ficha-ej-pie es-lectura">
          {puedeEditar && (
            <button type="button" className="btn btn-secondary btn-sm grow" onClick={() => setEditando(true)}>
              Editar alimento
            </button>
          )}
          {onCrearElMio && (
            <button type="button" className="link" onClick={() => onCrearElMio(alimento)}>
              Duplicar
            </button>
          )}
        </div>
      )}
    </div>
  );
};
