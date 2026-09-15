import { useEffect, useState } from 'react';
import { Lock, LockOpen } from 'lucide-react';

import { claseDe, mealTarget, optionMacros, repartoDelDia } from '@/domain/nutrition';
import { toNum0 } from '@/lib/num';
import { opcionElegida } from './macros';

/**
 * EL REPARTO DE TODOS LOS DÍAS, COMIDA A COMIDA.
 *
 *                     KCAL   P    C    G
 *     1 Desayuno  igual en los dos días
 *       Todos     [550] [35] [70] [15]   ▬▬▬▬▬▬
 *     2 Comida
 *       Entreno   [800] [45] [100] [24]  ▬▬▬▬▬▬▬▬
 *       Descanso  [700]  45  [75]   24   ▬▬▬▬▬▬▬   −100 kcal
 *     El día
 *       Entreno   2600  160  320  75     de 2600 kcal   Cambiar
 *
 * La pregunta es «¿en qué se diferencia la comida del día de descanso de la del
 * de entreno?», y hasta ahora se contestaba cambiando de pestaña y recordando
 * cifras. Aquí se ven juntas y se escriben juntas, sin que se amontonen los
 * números («ha de ser algo que me permita comparar de manera sencilla»). Por
 * eso cuatro reglas le quitan tinta:
 *
 *   1. Una comida IGUAL en todos los días es un renglón («Todos»), y lo que se
 *      escribe ahí va a todos. «Separar» la abre.
 *   2. Lo que no cambia respecto al primer día va en gris y sin caja.
 *   3. Las kcal de cada día se comparan con una barra gris.
 *   4. La diferencia en reposo es corta («−150 kcal»); entera al pasar o al
 *      escribir en el renglón. Ver [[ley-del-reposo]].
 *
 * La diferencia NO lleva color: menos hidratos en descanso es criterio, no un
 * fallo. El semáforo sigue solo en «El día», contra el objetivo de cada uno.
 *
 * ── Las cifras son las RESUELTAS, no las de la casilla ──────────────────────
 * Los hidratos en blanco son «el resto» (ver `mealTarget`): se comparan con los
 * gramos que salen de las kcal, la proteína y la grasa, y la casilla vacía los
 * enseña como sugerencia —igual que en `PlanDia`—. Leer la casilla cruda daba
 * una columna de rayas en un reparto que estaba entero.
 *
 * ── Y una comida SIN REPARTO no es una comida a cero ────────────────────────
 * En una dieta cerrada un día puede tener menú y objetivo sin haber repartido
 * nada por comida. Tratarlo como ceros decía «−900 kcal» y pintaba el día en
 * naranja. Se dice «sin repartir», no se resta, y en la casilla vacía se enseña
 * lo que suma su menú con la opción abierta: es lo que sí está configurado, y
 * lo que hace falta ver para decidir cuánto pautarle.
 *
 * Las comidas se emparejan POR POSICIÓN: la 3 de entreno con la 3 de descanso.
 * Si el nombre no coincide se dicen los dos. Ver
 * `docs/dieta-entreno-y-descanso.html`.
 */
const CAMPOS = [
  { key: 'kcals', label: 'kcal', plan: 'targetKcals', menu: 'kcal', corto: 'kcal' },
  { key: 'protein', label: 'P', plan: 'proteinGrams', menu: 'protein', corto: 'P' },
  { key: 'carbs', label: 'C', plan: 'carbsGrams', menu: 'carbs', corto: 'C' },
  { key: 'fats', label: 'G', plan: 'fatsGrams', menu: 'fats', corto: 'G' },
];

const conSigno = (v) => `${v > 0 ? '+' : '−'}${Math.abs(v)}`;

/** ¿La comida `i` está repartida, y con las cuatro cifras iguales, en todos los días? */
export const comidaIgual = (dias, i) => {
  if (dias.length < 2) return false;
  const objetivos = dias.map((d) => mealTarget(d.meals[i]));
  if (objetivos.some((o) => !o)) return false;
  return CAMPOS.every(({ key }) => objetivos.every((o) => o[key] === objetivos[0][key]));
};

/** Lo que cambia una comida respecto a la del primer día, corto y entero. */
export const diferencia = (primera, comida) => {
  const a = mealTarget(primera);
  const b = mealTarget(comida);
  if (!a || !b) return { corta: 'sin repartir', entera: 'sin repartir', igual: true };
  const partes = CAMPOS.map(({ key, corto }) => {
    const v = b[key] - a[key];
    return v ? `${conSigno(v)} ${corto}` : null;
  }).filter(Boolean);
  if (!partes.length) return { corta: 'igual', entera: 'igual', igual: true };
  const kcal = b.kcals - a.kcals;
  return { corta: kcal ? `${conSigno(kcal)} kcal` : 'mismas kcal', entera: partes.join(' · '), igual: false };
};

export const RepartoComparado = ({ dias, elegidas = {}, onTarget, onFijar = null, onEditarObjetivo = null }) => {
  const nComidas = Math.max(0, ...dias.map((d) => d.meals.length));
  const clave = (i) => dias[0]?.meals[i]?.id ?? `pos-${i}`;
  const cuantos = dias.length === 2 ? 'los dos días' : `los ${dias.length} días`;

  /* Lo que suma el menú de una comida con la opción abierta, redondeado. */
  const delMenu = (meal) => {
    const m = optionMacros(opcionElegida(meal, elegidas));
    return Object.fromEntries(CAMPOS.map((c) => [c.key, Math.round(m[c.menu] || 0)]));
  };

  /*
    ── Qué comidas se enseñan abiertas ─────────────────────────────────────────
    Una comida que cambia va abierta, y SIGUE abierta aunque al escribir se quede
    igual: juntarla sola a mitad de una cifra («75» → «7» → «70») se llevaría el
    cursor. Por eso se recuerda qué comidas han estado distintas, y juntarlas es
    un gesto («Juntar»), no una consecuencia de teclear.
  */
  const [abiertas, setAbiertas] = useState(() => new Set());
  const distintas = Array.from({ length: nComidas }, (_, i) => (comidaIgual(dias, i) ? null : clave(i)))
    .filter(Boolean)
    .join('|');
  useEffect(() => {
    if (!distintas) return;
    setAbiertas((a) => {
      const nuevas = distintas.split('|').filter((k) => !a.has(k));
      return nuevas.length ? new Set([...a, ...nuevas]) : a;
    });
  }, [distintas]);

  /* La barra mide lo pautado; sin reparto, lo que suma el menú, más clara. */
  const kcalDeBarra = (meal) => mealTarget(meal)?.kcals ?? delMenu(meal).kcals;
  const maxKcal = Math.max(1, ...dias.flatMap((d) => d.meals.map(kcalDeBarra)));

  const barra = (meal) => (
    <span className={`reparto-cmp-barra${mealTarget(meal) ? '' : ' is-menu'}`} aria-hidden="true">
      <i style={{ width: `${Math.round((kcalDeBarra(meal) / maxKcal) * 100)}%` }} />
    </span>
  );

  const candado = (fijo, nombre, alPulsar) =>
    onFijar && (
      <button
        type="button"
        className={`btn btn-icon btn-icon-compact reparto-cmp-candado${fijo ? ' is-on' : ''}`}
        onClick={alPulsar}
        aria-pressed={fijo}
        aria-label={fijo ? `«${nombre}» no se mueve al cambiar el objetivo` : `Dejar «${nombre}» fija al cambiar el objetivo`}
        title={fijo ? 'No se mueve al cambiar el objetivo del día' : 'Dejarla fija al cambiar el objetivo del día'}
      >
        {fijo ? <Lock size={13} /> : <LockOpen size={13} />}
      </button>
    );

  const nombreDe = (i) => {
    const base = dias.find((d) => d.meals[i])?.meals[i]?.name || 'Comida';
    const otro = dias.find((d) => d.meals[i] && d.meals[i].name !== base);
    return (
      <span className="reparto-cmp-nombre">
        {base}
        {otro && <small>en {otro.name.toLowerCase()}: {otro.meals[i].name}</small>}
      </span>
    );
  };

  /*
    Las cuatro casillas de una comida en un día. Lo escrito se escribe; lo que no,
    se ofrece en voz baja: los hidratos que salen del resto o, sin reparto, lo que
    suma el menú.
  */
  const casillas = (meal, { primera = null, etiqueta, onChange }) => {
    const objetivo = mealTarget(meal);
    const deOtro = mealTarget(primera);
    const menu = objetivo ? null : delMenu(meal);
    return CAMPOS.map((c) => {
      const crudo = meal.target?.[c.key];
      const escrito = String(crudo ?? '').trim() !== '';
      const sugerido = objetivo ? (escrito ? null : objetivo[c.key]) : menu[c.key] || null;
      return (
        <Celda
          key={c.key}
          valor={escrito ? crudo : ''}
          sugerido={sugerido}
          delMenu={!objetivo}
          igual={Boolean(escrito && objetivo && deOtro && objetivo[c.key] === deOtro[c.key])}
          etiqueta={etiqueta(c)}
          onChange={(v) => onChange(c.key, v)}
        />
      );
    });
  };

  return (
    <section className="reparto-cmp" aria-label="El reparto de todos los días">
      <div className="reparto-cmp-fila is-cab" aria-hidden="true">
        <span />
        {CAMPOS.map((c) => (
          <span key={c.key} className="is-num">{c.label}</span>
        ))}
        <span className="reparto-cmp-lado">kcal de la comida</span>
      </div>

      {Array.from({ length: nComidas }, (_, i) => {
        const igual = comidaIgual(dias, i);
        const junta = igual && !abiertas.has(clave(i));
        const primera = dias[0].meals[i];

        return (
          <div key={clave(i)} className="reparto-cmp-comida">
            <div className="reparto-cmp-titulo">
              <span className="plan-dia-n">{i + 1}</span>
              {nombreDe(i)}
              {igual && <span className="reparto-cmp-estado">igual en {cuantos}</span>}
              {igual && (
                <button
                  type="button"
                  className="cab-accion reparto-cmp-accion"
                  onClick={() =>
                    setAbiertas((a) => {
                      const s = new Set(a);
                      if (junta) s.add(clave(i));
                      else s.delete(clave(i));
                      return s;
                    })
                  }
                >
                  {junta ? 'Separar' : 'Juntar'}
                </button>
              )}
            </div>

            {junta ? (
              <div className="reparto-cmp-fila">
                <span className="reparto-cmp-dia">
                  <span>Todos</span>
                  {candado(dias.every((d) => d.meals[i].fijo), primera.name, () => {
                    const poner = !dias.every((d) => d.meals[i].fijo);
                    dias.forEach((d) => {
                      if (Boolean(d.meals[i].fijo) !== poner) onFijar(d.id, i);
                    });
                  })}
                </span>
                {casillas(primera, {
                  etiqueta: (c) => `${c.label} de ${primera.name}, ${cuantos}`,
                  onChange: (campo, v) => dias.forEach((d) => onTarget(d.id, i, campo, v)),
                })}
                <span className="reparto-cmp-lado">{barra(primera)}</span>
              </div>
            ) : (
              dias.map((dia, j) => {
                const meal = dia.meals[i];
                if (!meal) {
                  return (
                    <div key={dia.id} className="reparto-cmp-fila">
                      <span className="reparto-cmp-dia">{dia.name}</span>
                      <span className="reparto-cmp-falta">Sin esta comida</span>
                    </div>
                  );
                }
                const sinRepartir = !mealTarget(meal);
                const dif = sinRepartir ? null : j > 0 && primera ? diferencia(primera, meal) : null;
                return (
                  <div key={dia.id} className="reparto-cmp-fila">
                    <span className="reparto-cmp-dia">
                      <span>{dia.name}</span>
                      {candado(meal.fijo === true, meal.name, () => onFijar(dia.id, i))}
                    </span>
                    {casillas(meal, {
                      primera: j > 0 ? primera : null,
                      etiqueta: (c) => `${c.label} de ${meal.name}, ${dia.name}`,
                      onChange: (campo, v) => onTarget(dia.id, i, campo, v),
                    })}
                    <span className="reparto-cmp-lado">
                      {barra(meal)}
                      {sinRepartir && (
                        <span className="reparto-cmp-dif is-igual" title="Sin reparto: en gris, lo que suma su menú">
                          <span className="is-corta">sin repartir</span>
                          <span className="is-entera">sin repartir · su menú</span>
                        </span>
                      )}
                      {dif && (
                        <span className={`reparto-cmp-dif${dif.igual ? ' is-igual' : ''}`} title={dif.entera}>
                          <span className="is-corta">{dif.corta}</span>
                          <span className="is-entera">{dif.entera}</span>
                        </span>
                      )}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        );
      })}

      {/* Lo repartido de cada día contra SU objetivo: lo único que se juzga. */}
      <div className="reparto-cmp-comida is-dia">
        <div className="reparto-cmp-titulo">
          <span className="reparto-cmp-rotulo">El día · lo repartido contra su objetivo</span>
        </div>
        {dias.map((dia) => {
          const reparto = repartoDelDia(dia.meals, dia.targets);
          const t = dia.targets || {};
          const repartido = reparto.meals > 0;
          /* Sin nada repartido no hay qué juzgar: se enseña lo que suma el menú,
             en gris y sin semáforo. */
          const menu = repartido
            ? null
            : dia.meals.reduce((acc, meal) => {
                const m = delMenu(meal);
                return Object.fromEntries(CAMPOS.map((c) => [c.key, acc[c.key] + m[c.key]]));
              }, { kcals: 0, protein: 0, carbs: 0, fats: 0 });
          return (
            <div key={dia.id} className="reparto-cmp-fila">
              <span className="reparto-cmp-dia">{dia.name}</span>
              {CAMPOS.map((c) => (
                <span
                  key={c.key}
                  className={`is-num reparto-cmp-suma${repartido ? claseDe(reparto[c.key], t[c.plan], c.key) : ' is-menu'}`}
                >
                  {repartido ? reparto[c.key] : menu[c.key] || '—'}
                </span>
              ))}
              <span className="reparto-cmp-lado">
                <span className="reparto-cmp-dif is-igual">
                  <span className="is-corta">
                    {!repartido ? 'sin repartir · su menú' : toNum0(t.targetKcals) ? `de ${toNum0(t.targetKcals)} kcal` : 'sin objetivo'}
                  </span>
                  <span className="is-entera">
                    {toNum0(t.targetKcals)
                      ? `${repartido ? '' : 'su menú, '}de ${toNum0(t.targetKcals)} · ${toNum0(t.proteinGrams)} · ${toNum0(t.carbsGrams)} · ${toNum0(t.fatsGrams)}`
                      : 'sin objetivo'}
                  </span>
                </span>
                {onEditarObjetivo && (
                  <button
                    type="button"
                    className="cab-accion reparto-cmp-accion"
                    onClick={() => onEditarObjetivo(dia.id)}
                    title={`Cambiar el objetivo de ${dia.name}`}
                  >
                    Cambiar
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
};

/*
  La celda de la hoja.
  · `igual`: la cifra escrita es la del primer día, y va callada.
  · `sugerido`: lo que vale sin escribir —los hidratos del resto, o lo que suma
    el menú si la comida no tiene reparto (`delMenu`, en cursiva)—.
*/
const Celda = ({ valor, sugerido = null, delMenu = false, igual = false, etiqueta, onChange }) => (
  <span className="is-num">
    <input
      type="text"
      inputMode="numeric"
      className={`hoja-celda${igual ? ' is-igual' : ''}${delMenu ? ' is-menu' : ''}`}
      placeholder={sugerido === null ? '—' : String(sugerido)}
      value={valor ?? ''}
      onChange={(e) => onChange(e.target.value)}
      aria-label={etiqueta}
      title={
        sugerido === null
          ? undefined
          : delMenu
            ? `Sin reparto: su menú suma ${sugerido}. Escribe para pautarlo.`
            : `${sugerido}, lo que queda con el resto de la comida`
      }
    />
  </span>
);
