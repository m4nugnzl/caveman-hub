import { useState } from 'react';
import { LayoutTemplate, Trash2, UtensilsCrossed } from 'lucide-react';

import { useActions, useApp } from '@/context/AppContext';
import { MAX_PIECES, pieceSummary, piecesOf } from '@/domain/pieces';
import { MAX_PLATOS, platoMacros, platoSummary, platosOf } from '@/domain/platos';
import { coverageSaid, microSaid, sumMicros } from '@/domain/micros';
import { dayMonthMaybeYear } from '@/lib/dates';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { EmptyState, RenombrarEnSitio } from '@/components/ui/primitives';
import { BandaTaller } from './BandaTaller';

/**
 * TUS PLANTILLAS: lo que has guardado con nombre, de entreno y de dieta.
 *
 * ══ Por qué hacía falta una pantalla ═══════════════════════════════════════
 *
 * `pieces.js` guarda hasta treinta días con nombre —«mi mejor día de pierna»—
 * en las preferencias del entrenador, y hasta hoy solo se podían ver desde el
 * cajón de un bloque abierto. Quien guarda su criterio y luego no encuentra
 * dónde está deja de guardarlo: una biblioteca invisible se comporta igual que
 * una que no existe.
 *
 * ══ Y por qué los PLATOS entran aquí y no por una sexta puerta ═════════════
 *
 * Un plato es una ración guardada con nombre —«desayuno de definición»— y es
 * exactamente la misma clase de cosa que una pieza: **tu criterio, guardado
 * para reutilizarlo**. Da igual de qué área sea.
 *
 * Tres motivos, y el tercero es el que decide:
 *
 *   · La barra del Taller mantiene sus **cinco puertas**, que es la cuenta con
 *     la que se diseñó.
 *   · Es honesto: si «plantilla» significa criterio guardado, un plato lo es.
 *   · Y esta pantalla ya **exhibe y no compone** —renombra, tira y deja leer lo
 *     que lleva dentro—, que es exactamente la regla que un plato necesita.
 *
 * ── Aquí se MIRA; se pone donde se monta ──────────────────────────────────
 * Ni las piezas ni los platos se colocan desde aquí. Una pieza entra desde el
 * cajón del bloque y un plato desde el buscador de la comida, que es donde está
 * el contexto —qué cliente, qué comida, qué objetivo—. Mezclarlo obligaría a
 * elegir cliente desde una pantalla que no habla de clientes.
 */
export const PlantillasPanel = () => {
  const { coachPrefs } = useApp();
  const { updateCoachPreferences } = useActions();
  const confirm = useConfirm();
  const [tramo, setTramo] = useState('dias');
  const [abierta, setAbierta] = useState(null);
  const [renombrando, setRenombrando] = useState(null);

  const piezas = piecesOf(coachPrefs);
  const platos = platosOf(coachPrefs);

  const guardarPiezas = (items) => updateCoachPreferences('piezas', { items });
  const guardarPlatos = (items) => updateCoachPreferences('platos', { items });

  const renombrar = (item, nombre) => {
    const cambiar = (lista) => lista.map((x) => (x.id === item.id ? { ...x, name: nombre } : x));
    if (tramo === 'dias') guardarPiezas(cambiar(piezas));
    else guardarPlatos(cambiar(platos));
  };

  const tirar = async (item) => {
    const esDia = tramo === 'dias';
    const ok = await confirm({
      title: `¿Tirar «${item.name}»?`,
      message: esDia
        ? 'La plantilla desaparece de tu cajón. Los clientes que ya la tienen puesta no se tocan.'
        : 'El plato desaparece de tu vitrina. Las dietas que ya lo llevan no se tocan: sus alimentos están copiados dentro.',
      confirmLabel: 'Tirarlo',
      tone: 'danger',
    });
    if (!ok) return;
    if (esDia) guardarPiezas(piezas.filter((p) => p.id !== item.id));
    else guardarPlatos(platos.filter((p) => p.id !== item.id));
    if (abierta === item.id) setAbierta(null);
  };

  const enDias = tramo === 'dias';
  const lista = enDias ? piezas : platos;

  /* Los dos tramos siempre, aunque uno esté vacío: la banda es también cómo se
     descubre que existen los platos. Con la cifra, que es lo que dice si hay
     algo detrás antes de pulsar. */
  const tramos = [
    { id: 'dias', label: 'Días', n: piezas.length },
    { id: 'platos', label: 'Platos', n: platos.length },
  ];

  const vacio = enDias ? (
    <EmptyState
      icon={LayoutTemplate}
      title="Todavía no has guardado ningún día"
      message="Cuando un día te quede como quieres, guárdalo desde el cajón del bloque: se queda aquí con su nombre y lo puedes poner en cualquier cliente."
    />
  ) : (
    <EmptyState
      icon={UtensilsCrossed}
      title="Todavía no has guardado ningún plato"
      message="Cuando una comida te quede como quieres, guárdala desde la hoja de la dieta: se queda aquí con su nombre y la puedes poner en cualquier cliente, cuadrada a su objetivo."
    />
  );

  return (
    <div className="stack cascada">
      <div className="taller">
        <BandaTaller titulo="Plantillas" tramos={tramos} tramo={tramo} onTramo={setTramo} />

        <div className="cartera-cuerpo">
          {lista.length === 0 ? (
            vacio
          ) : (
            <>
              <div className="plantilla">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{enDias ? 'Plantilla' : 'Plato'}</th>
                      <th scope="col">Qué lleva</th>
                      <th scope="col">{enDias ? 'Guardada' : 'Guardado'}</th>
                      <th scope="col" aria-label="Acciones" />
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((item) => (
                      <tr key={item.id}>
                        <td>
                          {/* Renombrar EN SITIO, como en el resto del producto:
                              el nombre se pulsa y se convierte en campo. Un
                              diálogo para cambiar una palabra es un viaje. */}
                          {renombrando === item.id ? (
                            <RenombrarEnSitio
                              value={item.name}
                              onRename={(nombre) => renombrar(item, nombre)}
                              onDone={() => setRenombrando(null)}
                              label={enDias ? 'el nombre de la plantilla' : 'el nombre del plato'}
                            />
                          ) : (
                            <span className="p-name">
                              <button
                                type="button"
                                className="p-abrir"
                                onClick={() => setRenombrando(item.id)}
                                title="Pulsa para renombrarlo"
                              >
                                {item.name}
                              </button>
                            </span>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="p-abrir"
                            onClick={() => setAbierta(abierta === item.id ? null : item.id)}
                            aria-expanded={abierta === item.id}
                          >
                            {enDias ? pieceSummary(item) : platoSummary(item)}
                          </button>
                          {abierta === item.id &&
                            (enDias ? (
                              <ul className="pieza-lista">
                                {(item.exercises || []).map((ex, i) => (
                                  <li key={ex.id || `${ex.name}-${i}`}>
                                    {ex.name}
                                    <span className="pieza-series">
                                      {(ex.sets || []).length} series
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <PlatoDentro plato={item} />
                            ))}
                        </td>
                        <td>{item.savedAt ? dayMonthMaybeYear(item.savedAt) : '—'}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-icon btn-icon-danger"
                            aria-label={`Tirar ${item.name}`}
                            onClick={() => tirar(item)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* El tope existe en el dominio («más de treinta ya no es una
                  biblioteca de piezas: es otro archivador») y hasta ahora solo
                  se veía al chocar con él. */}
              <p className="t-xs taller-pie">
                {lista.length} de {enDias ? MAX_PIECES : MAX_PLATOS}.{' '}
                {enDias
                  ? 'Se ponen desde el cajón del bloque, en cualquier cliente.'
                  : 'Se ponen desde el buscador de una comida, en cualquier cliente.'}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Lo que lleva un plato, y la tira que lo resume.
 *
 * ── Un número más, no doce ────────────────────────────────────────────────
 * Junto a las kcal y los tres macros va **la fibra**, y ninguna otra de las
 * cuatro del envase. Es la que un entrenador pauta de verdad, la que el cliente
 * nota, y —lo que la hace distinta— la única cuya contraparte ya existe: la
 * pregunta `digestion` del check-in. Componer es el momento en que decides qué
 * va con qué, y por eso está aquí y no en un panel de análisis.
 *
 * ── Y viaja con su cobertura ──────────────────────────────────────────────
 * Si dos de los tres alimentos declaran fibra, la cifra es un SUELO y no un
 * total. Decirlo cuesta una línea atenuada; callarlo convierte un suelo en una
 * medida, que es mentir con un número. Ver `micros.js`.
 */
const PlatoDentro = ({ plato }) => {
  const macros = platoMacros(plato);
  const fibra = sumMicros(plato.foods || []).fiber;
  const cobertura = coverageSaid(fibra);

  return (
    <>
      <ul className="pieza-lista">
        {(plato.foods || []).map((f, i) => (
          <li key={`${f.name}-${i}`}>
            {f.name}
            <span className="pieza-series">
              {f.showAs === 'units' && f.unitLabel
                ? `${Math.round((f.grams / f.unitGrams) * 10) / 10} ${f.unitLabel}`
                : `${f.grams} g`}
            </span>
          </li>
        ))}
      </ul>
      <p className="t-xs t-tertiary">
        {Math.round(macros.kcal)} kcal · {Math.round(macros.protein)} P ·{' '}
        {Math.round(macros.carbs)} HC · {Math.round(macros.fats)} G ·{' '}
        {microSaid('fiber', fibra)}
      </p>
      {cobertura && <p className="t-xs t-tertiary">Fibra: {cobertura}.</p>}
    </>
  );
};
