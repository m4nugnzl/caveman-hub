import { useState } from 'react';

import { useApp } from '@/context/AppContext';
import { kindMeta } from '@/domain/calendar';
import { kcalsDeIntervencion } from '@/domain/pautaDelDia';
import { NOMBRE_DE_VARIACION, cambioDeLaBase, cuantosDias, finDeVariacion, variacionesDelCliente } from '@/domain/variaciones';
import { addDays, daysBetween, localeNumber, todayISO } from '@/lib/dates';
import { BotonMas } from '@/components/ui/BotonMas';
import { VentanaDeVariacion, avisoDeLaBase, tramoDeVariacion } from './VentanaDeVariacion';

/** «3.400 kcal» o «3.000 → 3.600 kcal». */
const kcalTexto = (e) => {
  const k = kcalsDeIntervencion(e);
  if (!k.length) return 'sin kcal';
  const [a, b] = [k[0], k[k.length - 1]];
  return a === b ? `${localeNumber(a)} kcal` : `${localeNumber(a)} → ${localeNumber(b)} kcal`;
};

/** «día 2 de 3», «mañana», «en 5 días», «hace 3 semanas». */
const cuandoTexto = (e, hoy) => {
  const fin = finDeVariacion(e);
  if (e.date <= hoy && fin >= hoy) {
    const n = cuantosDias(e.date, fin);
    return n > 1 ? `en curso · día ${(daysBetween(e.date, hoy) ?? 0) + 1} de ${n}` : 'hoy';
  }
  if (e.date > hoy) {
    const d = daysBetween(hoy, e.date);
    return d === 1 ? 'mañana' : `en ${d} días`;
  }
  const d = daysBetween(fin, hoy);
  return d < 14 ? `hace ${d} ${d === 1 ? 'día' : 'días'}` : `hace ${Math.round(d / 7)} semanas`;
};

const Variacion = ({ e, hoy, versiones, onAbrir }) => {
  const menu = Array.isArray(e.menus) && e.menus.some(Boolean);
  const aviso = avisoDeLaBase(cambioDeLaBase(e, versiones), e.parteDe);
  return (
    <li>
      <button type="button" className="var-fila" style={{ '--tinta': kindMeta(e.kind).color }} onClick={() => onAbrir(e)}>
        <span className="var-fila-punto" aria-hidden="true" />
        <span className="var-fila-que">
          <b>{NOMBRE_DE_VARIACION[e.kind]}</b>
          <span className="tnum"> · {tramoDeVariacion(e.date, finDeVariacion(e))}</span>
          <span className="var-fila-sub">
            {cuandoTexto(e, hoy)}
            {menu ? ' · con menú' : ''}
            {e.parteDe?.nombre ? ` · parte de ${e.parteDe.nombre.toLowerCase()}` : ''}
          </span>
          {aviso && <span className="var-fila-aviso">{aviso}</span>}
        </span>
        <span className="var-fila-kcal tnum">{kcalTexto(e)}</span>
      </button>
    </li>
  );
};

/**
 * LAS VARIACIONES, junto a la dieta (26 sep 2026): los refeeds y diet breaks
 * en curso y previstos, y un acceso a los pasados. La dieta de al lado no
 * cambia: esto son días concretos que vuelven solos a ella.
 *
 * Cada fila abre su ventana (`VentanaDeVariacion`); «+ refeed» y «+ diet
 * break» la abren nueva, desde mañana y partiendo del día que se está mirando.
 *
 * @param diaId el tipo de día de la dieta que se está mirando.
 */
export const VariacionesDeLaDieta = ({ diaId }) => {
  const { hechos, dietVersions } = useApp();
  const [abierta, setAbierta] = useState(null);
  const [verPasadas, setVerPasadas] = useState(false);
  const hoy = todayISO();
  const { enCurso, previstas, pasadas } = variacionesDelCliente(hechos, hoy);
  const vivas = [...enCurso, ...previstas];
  const nueva = (kind) => setAbierta({ kind, desde: addDays(hoy, 1), hasta: addDays(hoy, 1), diaId });
  const abrir = (e) => setAbierta({ evento: e });

  return (
    <section className="lado-tarjeta var-lado" aria-label="Variaciones">
      <div className="lado-cab">
        <div className="lado-cab-fila">
          <span className="section-label">Variaciones</span>
          <span className="var-lado-mas">
            <BotonMas palabra="refeed" onClick={() => nueva('refeed')} />
            <BotonMas palabra="diet break" onClick={() => nueva('diet_break')} />
          </span>
        </div>
      </div>

      {vivas.length > 0 ? (
        <ul className="var-lista">
          {vivas.map((e) => (
            <Variacion key={e.id} e={e} hoy={hoy} versiones={dietVersions} onAbrir={abrir} />
          ))}
        </ul>
      ) : (
        <p className="var-nada">Ninguna prevista. Unos días con otras cifras, sin tocar la dieta.</p>
      )}

      {pasadas.length > 0 && (
        <>
          <button type="button" className="tl-ins-enlace var-pasadas" aria-expanded={verPasadas} onClick={() => setVerPasadas((v) => !v)}>
            {verPasadas ? 'Ocultar las pasadas' : `Ver las pasadas · ${pasadas.length}`}
          </button>
          {verPasadas && (
            <ul className="var-lista is-pasadas">
              {pasadas.map((e) => (
                <Variacion key={e.id} e={e} hoy={hoy} versiones={dietVersions} onAbrir={abrir} />
              ))}
            </ul>
          )}
        </>
      )}

      {abierta && <VentanaDeVariacion inicial={abierta} onCerrar={() => setAbierta(null)} />}
    </section>
  );
};
