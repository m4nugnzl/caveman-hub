import { useState } from 'react';

import { RenombrarEnSitio } from '@/components/ui/primitives';
import { optionKcals } from '@/domain/nutrition';

/**
 * LOS DÍAS DEL PLAN, COMO TARJETAS.
 *
 * ══ Por qué dejan de ser pestañas ══════════════════════════════════════════
 *
 * En el frame de la dieta cerrada (`64:88`) los días están dibujados como dos
 * tarjetas del ancho de la mesa, y los nodos se llaman `tab-high` y `tab-low`:
 * son las pestañas de siempre, con sitio para decir lo que distingue a un día
 * de otro. Y eso es exactamente lo que faltaba. Una pastilla con la palabra
 * «High» obliga a abrir el día para saber en qué se diferencia del otro; la
 * tarjeta lo dice sin tocar nada:
 *
 *     ┌──────────────────────────────────┐ ┌──────────────────────────────┐
 *     │ High  ×6 días                    │ │ Low  ×3 días                 │
 *     │ P 120g · C 531g · G 55g          │ │ P 120g · C 410g · G 50g      │
 *     │ 3 comidas · 14 alternativas      │ │ 3 comidas · 12 alternativas  │
 *     │                       3100 kcal  │ │                   2600 kcal  │
 *     └──────────────────────────────────┘ └──────────────────────────────┘
 *
 * Con UN solo día no existe: comparar un día consigo mismo no es una pregunta,
 * y el nombre y la cifra ya los lleva la cinta. Lo decide quien la monta.
 *
 * ── El nombre se cambia donde se lee ──────────────────────────────────────
 * Pulsar la tarjeta ABIERTA la pone en renombrado, el mismo gesto que tenían
 * las pastillas y que tiene el bloque abierto de Entreno. No hay lápiz: la ley
 * de los gestos de la casa dice que la caja se enciende y el verbo va en azul.
 *
 * ── Y CADA TARJETA ES DONDE CAE LO QUE LLEVAS ─────────────────────────────
 * Igual que las pastillas: `soltar` = `{ sobre, zona, pegar }`, o `null` en
 * reposo. La tarjeta abierta nunca recibe — pegar en el menú que ya se está
 * mirando es el verbo de la mano.
 *
 * @param {Array}  dias    Los días de `planDays`, con sus `targets` y su menú.
 * @param {string} activo  Id del día que se está mirando.
 * @param {object} [veces] `{ [dayId]: nº de casillas del ciclo }` — el «×6 días».
 */
export const TarjetasDeDia = ({ dias, activo, onDia, onRenombrar = null, veces = null, soltar = null }) => {
  const [renombrando, setRenombrando] = useState(false);

  if (!dias || dias.length < 2) return null;

  return (
    <div className="dieta-dias" role="tablist" aria-label="Días de la dieta">
      {dias.map((dia) => {
        const esEste = dia.id === activo;

        if (esEste && renombrando && onRenombrar) {
          return (
            <div className="dieta-dia is-on is-renombrando" key={dia.id}>
              <RenombrarEnSitio
                value={dia.name}
                label="Nuevo nombre del día"
                onRename={(nombre) => onRenombrar(dia.id, nombre)}
                onDone={() => setRenombrando(false)}
              />
            </div>
          );
        }

        const recibe = Boolean(soltar) && !esEste;
        const cae = recibe ? soltar.zona(dia.id, (pieza) => soltar.pegar(pieza, dia.id)) : {};

        const t = dia.targets || {};
        /* Los macros del día, los que estén puestos. Un plan que solo pauta
           kcal no tiene por qué enseñar «P — · C — · G —». */
        const macros = [
          t.proteinGrams ? `P ${Math.round(t.proteinGrams)}g` : null,
          t.carbsGrams ? `C ${Math.round(t.carbsGrams)}g` : null,
          t.fatsGrams ? `G ${Math.round(t.fatsGrams)}g` : null,
        ].filter(Boolean);

        const comidas = dia.meals?.length || 0;
        /* Las alternativas son las opciones que hay ADEMÁS de la primera: es lo
           que de verdad se ha montado de más en este día. Una comida con una
           sola opción no ofrece ninguna. */
        const alternativas = (dia.meals || []).reduce((n, m) => n + Math.max(0, (m.options?.length || 1) - 1), 0);
        const cuantas = veces?.[dia.id] || 0;

        return (
          <button
            key={dia.id}
            type="button"
            role="tab"
            aria-selected={esEste}
            className={`dieta-dia${esEste ? ' is-on' : ''}${
              recibe && soltar.sobre === dia.id ? ' is-drop-target' : ''
            }`}
            onClick={() => (esEste ? setRenombrando(Boolean(onRenombrar)) : onDia(dia.id))}
            title={
              esEste
                ? `${dia.name}${onRenombrar ? ' · púlsalo para renombrarlo' : ''}`
                : `Ver ${dia.name.toLowerCase()}`
            }
            {...cae}
          >
            <span className="dieta-dia-say">
              <span className="dieta-dia-nombre-fila">
                <span className="dieta-dia-nombre">{dia.name}</span>
                {cuantas > 0 && <span className="dieta-dia-veces">×{cuantas} días</span>}
              </span>
              {macros.length > 0 && <span className="dieta-dia-macros">{macros.join(' · ')}</span>}
              <span className="dieta-dia-menu">
                {comidas === 0
                  ? 'Sin comidas todavía'
                  : `${comidas} ${comidas === 1 ? 'comida' : 'comidas'}${
                      alternativas > 0 ? ` · ${alternativas} ${alternativas === 1 ? 'alternativa' : 'alternativas'}` : ''
                    }`}
              </span>
            </span>
            <span className="dieta-dia-kcal">
              {t.targetKcals ? (
                <>
                  {Math.round(t.targetKcals)} <small>kcal</small>
                </>
              ) : (
                /* Sin objetivo puesto, lo que suma su menú: la tarjeta no puede
                   quedarse muda, y esa cifra es la única que existe. */
                <>
                  {Math.round(
                    (dia.meals || []).reduce((n, m) => n + optionKcals(m.options?.[0] || { foods: [] }), 0)
                  )}{' '}
                  <small>kcal</small>
                </>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
};
