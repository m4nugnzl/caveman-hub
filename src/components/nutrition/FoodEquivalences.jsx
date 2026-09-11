import { useState } from 'react';
import { ArrowRightLeft, Bookmark } from 'lucide-react';

import { MACROS, displayAsUnits, unitsLabel } from '@/domain/nutrition';
import { racionDe } from '@/domain/foodEquiv';
import { gruposQueYaLosTienen, nombreRepetido } from '@/domain/gruposEquiv';
import { Modal } from '@/components/ui/Modal';
import { Field, Switch, TextInput } from '@/components/ui/primitives';
import { useOculto } from '@/components/Client/Oculto';

/* La ración se escribe en `racionDe` (`domain/foodEquiv`): desde que la lista
   también se lee debajo del alimento, en la propia comida, la escribían dos
   piezas, y dos formas de decir «250 g» son dos formas de leer la misma dieta. */
const racion = (item) => racionDe(item);

/** El nombre del alimento de un item, tal cual se guarda en un grupo. */
const nombreDe = (item) => item.food?.name || '';

/**
 * Las equivalencias de un alimento de la dieta, como diálogo.
 *
 * ══ La misma lista para los dos, con un verbo de diferencia ═════════════════
 *
 * Es la tabla de intercambios de toda la vida —«150 g de plátano ≈ 250 g de
 * manzana»— calculada desde la propia dieta, así que nunca se desactualiza ni
 * vive en un PDF aparte.
 *
 * · El ENTRENADOR la usa montando: «Usar» sustituye el alimento con los gramos
 *   ya cuadrados, en su sitio.
 * · El CLIENTE la consulta: está en la frutería sin plátanos y necesita saber
 *   cuántas fresas son. Solo lee — su plan sigue siendo lo estipulado, y por
 *   eso aquí no hay ningún botón que lo cambie.
 *
 * Las kcal de cada ración se enseñan a propósito: igualar el macro del grupo
 * deja libres los otros dos, y esa diferencia es información que el que elige
 * debe ver, no un desajuste que esconder.
 *
 * ══ Y es donde se monta un grupo tuyo ══════════════════════════════════════
 *
 * Porque es donde se está mirando la lista que sobra. Las equivalencias de
 * «Huevo entero» son cinco huevos del catálogo, correctas y sin usar: aquí se
 * marcan las que de verdad valen y se guardan con nombre
 * (`domain/gruposEquiv`). A partir de ahí, ese alimento ofrece las tuyas.
 *
 * El marcado es un MODO del mismo diálogo y no otra pantalla: la lista que se
 * poda es la que ya estás leyendo, y mandarte a otro sitio a repetirla sería
 * pedirte que la recuerdes.
 */
export const FoodEquivalences = ({
  food,
  equivalences,
  onSwap,
  /* La excepción por alimento: si ESTA lista se le enseña al cliente. Solo
     existe programando (`onSetVisible`), y aquí y no en la fila porque es aquí
     donde se está mirando lo que el cliente vería. */
  onSetVisible,
  clientSwapsOn = false,
  /* Los grupos tuyos y la lista larga con la que se marcan. Sin `onSaveGrupo`
     el diálogo es el de siempre: el del cliente, y el de un catálogo que
     todavía no ha cargado. */
  grupos = [],
  candidatos = null,
  onSaveGrupo = null,
  onRemoveGrupo = null,
  onClose,
}) => {
  /* Al cliente con las kcal ocultas le vale la lista —«no tengo plátanos» se
     sigue resolviendo aquí— sin las dos cifras que la acompañan: la ración es
     el dato que viene a buscar. Ver `Client/Oculto.jsx`. */
  const oculto = useOculto();

  const grupo = equivalences.grupo;
  const macro = MACROS.find((m) => m.key === equivalences.macro);
  const nombre = (macro?.label || '').toLowerCase();
  const cantidad = displayAsUnits(food) ? `${unitsLabel(food)} (${food.grams} g)` : `${food.grams} g`;

  /*
    ── El modo de marcar ────────────────────────────────────────────────────
    Nace con lo que HOY se ofrece marcado, que es lo que hace de esto una poda y
    no un formulario en blanco: el trabajo es quitar los cuatro huevos que
    sobran, no acordarse de los tres que valen. Lo que el filtro de cordura
    había descartado sale también, sin marcar — decidir por ti lo que estás
    decidiendo sería decidirlo.
  */
  const [montando, setMontando] = useState(false);
  const [marcados, setMarcados] = useState([]);
  const [comoSeLlama, setComoSeLlama] = useState('');

  const empezar = () => {
    /* Con grupo, lo que hay dentro; sin él, lo que hoy se ofrece. Son la misma
       expresión porque `equivalences.items` YA es una cosa o la otra: con un
       grupo puesto, la lista de consulta son sus miembros (ver `foodEquiv`). */
    setMarcados(equivalences.items.map(nombreDe));
    setComoSeLlama(grupo?.name || '');
    setMontando(true);
  };

  const alternar = (nombreAlimento) =>
    setMarcados((antes) =>
      antes.includes(nombreAlimento)
        ? antes.filter((n) => n !== nombreAlimento)
        : [...antes, nombreAlimento]
    );

  const lista = montando ? candidatos?.items || [] : equivalences.items;

  /* Un grupo de uno no ofrece ningún cambio, así que no es un grupo. */
  const sePuedeGuardar =
    comoSeLlama.trim().length > 0 &&
    marcados.length > 0 &&
    !nombreRepetido(comoSeLlama, grupos, grupo?.id || null);

  /* Lo que se le dice a quien guarda, y no se le arregla: un alimento en dos
     grupos manda el primero (ver `grupoDe`). */
  const yaEnOtro = montando
    ? gruposQueYaLosTienen(marcados, grupos, grupo?.id || null)
    : [];

  const guardar = () => {
    onSaveGrupo({
      id: grupo?.id || null,
      name: comoSeLlama.trim(),
      macro: equivalences.macro,
      /* El alimento de partida, el primero y siempre: el grupo existe porque él
         está dentro, y sin él la lista no valdría por nada. */
      foods: [food.name, ...marcados],
    });
    onClose();
  };

  return (
    <Modal
      /*
        ── Panel lateral, no ventana con velo ──────────────────────────────────
        Está escrito en `ui/Modal.jsx` y esta pantalla era el caso de manual:
        «para MIRAR un detalle es lo contrario de lo que hace falta: se abre
        justamente para compararlo con lo que hay debajo, y el velo tapa aquello
        con lo que se compara». Aquí lo que hay debajo es la comida — el
        entrenador cambia un alimento mirando lo que suma el día, y podar un
        grupo es mirar la lista que sobra en la comida de la que salió.

        Y en el teléfono el panel es una hoja que sube desde abajo, que es donde
        el cliente resuelve «no tengo plátanos».
      */
      size="side"
      title={
        montando
          ? grupo
            ? `Tu grupo «${grupo.name}»`
            : `Un grupo con ${food.name.toLowerCase()}`
          : `Equivalencias de ${food.name}`
      }
      onClose={onClose}
      footer={
        montando ? (
          <>
            {/* Quitar el grupo va al canto contrario y en voz baja: es la
                salida, no la acción de la pantalla. */}
            {grupo && onRemoveGrupo && (
              <button
                type="button"
                className="btn btn-danger equiv-quitar"
                onClick={() => {
                  onRemoveGrupo(grupo.id);
                  onClose();
                }}
              >
                Quitar el grupo
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={() => setMontando(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!sePuedeGuardar}
              onClick={guardar}
            >
              {grupo ? 'Guardar el grupo' : `Guardar ${marcados.length + 1} alimentos`}
            </button>
          </>
        ) : onSaveGrupo ? (
          <button type="button" className="btn btn-secondary" onClick={empezar}>
            <Bookmark size={13} /> {grupo ? 'Editar tu grupo' : 'Guardar estos como grupo'}
          </button>
        ) : null
      }
    >
      <div className="col gap-4">
        {montando ? (
          <>
            <p className="t-sm t-secondary">
              Marca lo que de verdad vale por <strong>{cantidad}</strong> de{' '}
              {food.name.toLowerCase()}. El grupo es tuyo y vale para todos tus clientes: donde
              salga este alimento se ofrecerán estos y ninguno más.
            </p>

            <Field label="Cómo se llama">
              <TextInput
                value={comoSeLlama}
                onChange={setComoSeLlama}
                placeholder="Mi proteína magra"
                maxLength={40}
              />
            </Field>
          </>
        ) : (
          <p className="t-sm t-secondary">
            {/* La cuenta a la vista: de dónde sale la lista. Sin esto, los gramos
                de abajo parecen sacados de una tabla mágica. Con un grupo tuyo,
                de dónde sale es OTRA COSA —lo escribiste tú— y decirlo es lo que
                explica por qué esta lista es corta. */}
            {oculto.nutrition ? (
              <>
                Estas raciones valen por tus <strong>{cantidad}</strong> de{' '}
                {food.name.toLowerCase()}:
              </>
            ) : grupo ? (
              <>
                Tu grupo <strong>«{grupo.name}»</strong>, con las raciones que aportan los{' '}
                <strong>
                  {equivalences.macroGrams} g de {nombre}
                </strong>{' '}
                de tus {cantidad}:
              </>
            ) : (
              <>
                <strong>{cantidad}</strong> de {food.name.toLowerCase()} aportan{' '}
                <strong>
                  {equivalences.macroGrams} g de {nombre}
                </strong>
                . Estas raciones aportan lo mismo:
              </>
            )}
          </p>
        )}

        <ul className={`equiv-list${montando ? ' is-marcando' : ''}`}>
          {/* Montando, el alimento de partida encabeza la lista y no se marca:
              es el ancla del grupo, no un candidato. */}
          {montando && (
            <li className="equiv-row es-ancla">
              {/* El hueco de la casilla que esta fila no tiene: sin él, el
                  nombre del ancla no cae bajo los de la lista. */}
              <span className="equiv-casilla" aria-hidden="true" />
              <span className="who">
                <span className="name">{food.name}</span>
                <span className="sub">el alimento del que sale</span>
              </span>
              <span className="amount">{cantidad}</span>
            </li>
          )}

          {lista.map((item) => {
            const suNombre = nombreDe(item);
            const puesto = marcados.includes(suNombre);
            const fila = (
              <>
                <span className="who">
                  <span className="name">{suNombre}</span>
                  {/* Las DOS cifras que definen el cambio: los gramos del macro
                      del grupo y las kcal, cada una con lo que se separa de la
                      tuya. La ración se elige cuadrando ambas, así que enseñar
                      solo una escondería en qué se pagó la otra. En tinta de dato;
                      el color, solo en las diferencias. */}
                  {!oculto.nutrition && (
                    <span className="sub">
                      {item.macroGrams} g de {nombre}
                      {item.macroDiff ? (
                        <b className={`dif${item.macroDiff > 0 ? ' is-mas' : ' is-menos'}`}>
                          {item.macroDiff > 0 ? '+' : ''}
                          {item.macroDiff}
                        </b>
                      ) : null}
                      <span className="sep">·</span>
                      {item.kcal} kcal
                      {item.kcalDiff ? (
                        <b className={`dif${item.kcalDiff > 0 ? ' is-mas' : ' is-menos'}`}>
                          {item.kcalDiff > 0 ? '+' : ''}
                          {item.kcalDiff}
                        </b>
                      ) : null}
                    </span>
                  )}
                  {item.gramsKcal && !oculto.nutrition && !montando && (
                    <span className="sub equiv-kcal">
                      {onSwap ? (
                        <button
                          type="button"
                          className="equiv-kcal-usar"
                          onClick={() => onSwap({ ...item, grams: item.gramsKcal })}
                          aria-label={`Cambiar ${food.name} por ${item.gramsKcal} g de ${suNombre}, con las mismas kcal`}
                        >
                          o {item.gramsKcal} g para las mismas kcal
                        </button>
                      ) : (
                        `o ${item.gramsKcal} g para las mismas kcal`
                      )}
                    </span>
                  )}
                </span>
                <span className="amount">{racion(item)}</span>
              </>
            );

            /* La casilla delante y la fila apagada cuando queda fuera: la misma
               mecánica que el reparto a varios clientes (`MandarLaPieza`), que
               es la otra pantalla de la casa donde marcar ES el trabajo. */
            if (montando) {
              return (
                <li className={`equiv-row${puesto ? '' : ' es-fuera'}`} key={item.food.id || suNombre}>
                  <input
                    type="checkbox"
                    className="equiv-casilla"
                    checked={puesto}
                    aria-label={`Meter ${suNombre} en el grupo`}
                    onChange={() => alternar(suNombre)}
                  />
                  {fila}
                </li>
              );
            }

            return (
              <li className="equiv-row" key={item.food.id || suNombre}>
                {fila}
                {onSwap && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => onSwap(item)}
                    aria-label={`Cambiar ${food.name} por ${racion(item)} de ${suNombre}`}
                  >
                    <ArrowRightLeft size={13} /> Usar
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        {montando ? (
          <>
            {yaEnOtro.length > 0 && (
              <p className="t-xs t-tertiary">
                {yaEnOtro.length === 1
                  ? `Alguno ya está en «${yaEnOtro[0].name}».`
                  : `Alguno ya está en ${yaEnOtro.map((g) => `«${g.name}»`).join(' y ')}.`}{' '}
                Un alimento que esté en dos grupos ofrece el primero de los dos.
              </p>
            )}
            <p className="t-xs t-tertiary">
              Las cantidades no se guardan: se calculan cada vez contra el alimento que tengas
              delante. Lo que guardas es qué vale por qué.
            </p>
          </>
        ) : (
          <p className="t-xs t-tertiary">
            {grupo
              ? `Las raciones se calculan igual: manda ${nombre}, con un margen del 10 % para no descuadrar el día. Quién sale en la lista lo decides tú.`
              : onSwap
                ? `Cada ración se ajusta para cuadrar a la vez ${nombre} y kcal: manda el macro del grupo, con un margen del 10 % para no descuadrar el día.`
                : oculto.nutrition
                  ? 'Cualquiera de estas raciones vale por la tuya: las calculó tu entrenador para que el cambio no te descuadre el día.'
                  : `Cualquiera de estas raciones vale por la tuya: llevan ${nombre} y kcal muy parecidas. La pequeña diferencia va escrita debajo de cada una.`}
          </p>
        )}

        {/*
          ── Si el cliente ve ESTA lista ──────────────────────────────────────
          La regla general la pone el módulo «Equivalencias en la dieta» del
          protocolo; esto es la excepción de este alimento en esta comida: las
          nueces con margen, los cornflakes son esos y no otros. Con el módulo
          apagado el interruptor se enseña igualmente pero inerte, diciendo
          dónde se enciende lo general — un control que desaparece sin explicar
          por qué enseña a desconfiar de la pantalla.
        */}
        {onSetVisible && !montando && (
          <Switch
            label="Tu cliente ve esta lista"
            hint={
              clientSwapsOn
                ? 'Apágalo si este alimento en concreto no admite cambio.'
                : /* El rótulo y el sitio, tal cual son. Aquí ponía «enciende
                     “Equivalencias en la dieta”, encima del menú», y ni el
                     interruptor se llama así ni está ahí: es «El cliente ve las
                     equivalencias» y vive en los ajustes del plan. Mandar a
                     alguien a un sitio que no existe es peor que no decir nada. */
                  'Ahora mismo no ve ninguna: enciende «El cliente ve las equivalencias» en los ajustes del plan, arriba a la derecha.'
            }
            checked={!food.equivHidden}
            disabled={!clientSwapsOn}
            onChange={(visible) => onSetVisible(visible)}
          />
        )}
      </div>
    </Modal>
  );
};
