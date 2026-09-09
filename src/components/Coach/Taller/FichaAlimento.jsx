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
    if (renombra) onIr?.(nombre);
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

  return (
    <div className="col ficha-ej">
      {/*
        ══ QUIÉN ES, ARRIBA Y EN UNA PIEZA ═══════════════════════════════════

        El nombre en grande —la única voz que se levanta en esta ficha— y debajo
        su categoría. Cuando el alimento es tuyo, ese mismo titular se escribe
        encima: sin caja hasta que lo tocas, que es la ley de los gestos de la
        casa. Antes el nombre se decía dos veces (titular del carril + campo
        «Cómo se llama») y la categoría era un `select` de 40 px con su rótulo:
        tres objetos y 145 px para dos palabras.
      */}
      <header className="ficha-id">
        {editable && !deOtro ? (
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
          /* En la CAPA no: el título del diálogo ya es el nombre, y repetirlo
             dos renglones más abajo es el eco que esta ficha ha venido a
             quitarse. En el carril sí, porque ahí el nombre es esto. */
          !enCapa && <h2 className="ficha-id-nom">{original}</h2>
        )}

        <div className="ficha-id-clase">
          <SelectorDeClase
            valor={editable ? category || null : alimento?.category || null}
            opciones={FOOD_CATEGORIES}
            editable={editable && !deOtro}
            conVacio
            onElegir={(v) => setCategory(v || '')}
            ariaLabel="Dónde lo pones"
          />
          {/* Que es del catálogo se dice aquí y no con una chapa más: la lista
              ya marca lo tuyo, y en la ficha lo que importa es si se corrige. */}
          {!nuevo && !editable && <span className="t-xs t-tertiary">Del catálogo</span>}
          {/* Y que es tuyo, con la misma chapa de la lista: la ficha de un
              alimento tuyo —donde se corrige hasta el nombre— se veía igual que
              la de uno del catálogo, donde sólo se escribe la nota. */}
          {!nuevo && editable && !deOtro && <span className="badge badge-info">Tuyo</span>}
        </div>

        {errorNombre && <p className="ficha-id-error">{errorNombre}</p>}

        {acciones.length > 0 && (
          <MenuAcciones items={acciones} ariaLabel={`Más cosas que hacer con ${original}`} />
        )}
      </header>

      {/*
        ══ LA HOJA: LO QUE SE MIRA A LA IZQUIERDA, LO QUE SE ESCRIBE A LA DERECHA
        ─────────────────────────────────────────────────────────────────────
        Y la etiqueta es las dos cosas a la vez cuando el alimento es tuyo — el
        porqué largo, en `EtiquetaNutricional`. Con eso desaparecen los tres
        campos de macros, los cuatro del envase y el de la unidad: nueve
        rótulos, nueve ayudas y unos 450 px de alto que sólo repetían lo que la
        etiqueta ya decía dos dedos más arriba.
      */}
      <div className="ficha-hoja">
        <div className="ficha-col">
          <EtiquetaNutricional
            alimento={alimento}
            general={general}
            edicion={
              editable && !deOtro
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
            ── Los tres en blanco no se bloquean, se dicen ──────────────────
            En blanco significa cero por decisión escrita (`macroError`), y está
            bien: casi ningún alimento tiene los tres, y obligar a teclear «0»
            dos de cada tres veces es peor formulario.

            Pero LOS TRES en blanco es otra cosa: es un alimento que va a sumar
            0 kcal en todas las dietas donde entre y no se va a notar hasta que
            las cuentas no cuadren. No es un error —el agua, el café solo y la
            sal son 0·0·0 de verdad—, así que se avisa y se deja guardar. La app
            resalta; el criterio es del entrenador.
          */}
          {editable && !deOtro && sinMacros && (
            <Notice tone="warn">
              Sin ningún macro, «{nombre || 'este alimento'}» suma 0 kcal en cualquier dieta donde
              entre. Correcto para el agua o el café solo; si no es el caso, cópialos del envase.
            </Notice>
          )}

          {/*
            Los macros del catálogo no se tocan, y aquí se dice POR QUÉ y qué
            hacer en su lugar. Sin esto, una fila del catálogo es idéntica a una
            tuya y no ofrece salida — que es el fallo que esta pantalla venía a
            arreglar.
          */}
          {!nuevo && !editable && !deOtro && (
            <div className="col gap-2">
              <p className="ficha-capa-texto">
                Sus macros son los de referencia. Si la marca que compras trae otros, es otro
                alimento: se da de alta con su nombre, y así los dos siguen siendo ciertos.
              </p>
              <div className="row">
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => onCrearElMio?.(alimento)}
                >
                  Crear el mío a partir de este
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="ficha-col">
          {deOtro && (
            <Notice tone="info">
              Este alimento lo dio de alta un compañero de equipo. La biblioteca es compartida, así
              que sus macros los corrige quien los puso.
            </Notice>
          )}

          {/*
            ── Lo que lleva ───────────────────────────────────────────────
            Hechos del alimento, nunca permisos: «contiene gluten» es verdad
            para todo el mundo, y a quién se lo puedes dar lo decide el cruce
            con sus condicionantes, que vive en la dieta. Sin esto, ese aviso es
            ciego con tus marcas y tus suplementos.

            `rail-wrap` y no `rail`: ocho chapas en esta columna desbordan, y
            `.rail` esconde su barra, así que con ratón las últimas no se podían
            alcanzar — marcar «soja» en tu batido era imposible.
          */}
          {editable && !deOtro ? (
            <Field
              label="Lo que lleva"
              hint="Para que el aviso salte con los clientes que lo evitan."
            >
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
            (alimento?.tags || []).length > 0 && (
              <Field label="Lo que lleva">
                <div className="rail rail-wrap" role="list">
                  {alimento.tags.map((t) => (
                    <span key={t} className="chip" role="listitem">
                      {FOOD_TAG_LABELS[t] || t}
                    </span>
                  ))}
                </div>
              </Field>
            )
          )}

          {!deOtro && (
            <Field label="Tu nota" hint="Lo que te dices al comprarlo. Tu cliente todavía no la ve.">
              <TextInput
                value={note}
                onChange={setNote}
                placeholder="El de lata al natural, no en aceite"
              />
            </Field>
          )}

          {!nuevo && (
            <DondeEstaPuesto
              titulo="A quién se lo das"
              gente={enDietas}
              vacio="Todavía no está en ninguna dieta. Se puede quitar sin tocarle la comida a nadie."
            />
          )}
        </div>

        {/*
          ── Y si hay otro que se llama casi igual, se dice aquí ──────────────
          La pantalla promete curar «los dos "Pan integral" que se colaron» y no
          tenía forma de enseñarlos. Con la banda de arriba al lado, la pareja se
          resuelve mirando: el que no usa nadie es el que sobra. A lo ancho de la
          hoja porque es una frase que se lee de un lado a otro, no una columna.
        */}
        {!nuevo && parecidos.length > 0 && (
          <div className="es-ancho">
            <Notice tone="info">
              Tienes {parecidos.length === 1 ? 'otro que se llama' : 'otros que se llaman'} casi
              igual:{' '}
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
          </div>
        )}
      </div>

      {/*
        ══ EL PIE DEJA DE SER EL PIE DE UN DIÁLOGO ═══════════════════════════

        Aquí había «Cancelar / Guardar» siempre, y era el pie de un modal
        trasplantado a una columna. El propio código ya lo decía por escrito en
        `EjerciciosPanel`: «en un carril no hay nada que cerrar». Con él puesto,
        dos de cada tres fichas —las del catálogo, que sólo dejan escribir la
        nota— se leían como un formulario apagado esperando a que lo rellenaras.

        · **«Cancelar» sólo donde cierra algo**: en la capa (`enCapa`) y en el
          alta, que son los dos sitios donde salir es un gesto de verdad. En el
          carril, cambiar de fila ya descarta el borrador — la `key` remonta la
          ficha, que es la mecánica que ya existía.
        · **«Guardar» sólo cuando hay algo que guardar.** Un botón primario
          encendido sobre una ficha que no has tocado promete trabajo que no
          hay. `tocado` compara el borrador con lo que se cargó al montar, y el
          remontaje por `key` es lo que hace que esa comparación sea cierta.
      */}
      {(enCapa || nuevo || tocado) && (
        <div className="row-end ficha-ej-pie">
          {(enCapa || nuevo) && (
            <button type="button" className="btn btn-sm" onClick={onCerrar}>
              Cancelar
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={guardar}
            disabled={guardando || !valido || deOtro || (!nuevo && !tocado)}
          >
            Guardar
          </button>
        </div>
      )}
    </div>
  );
};
