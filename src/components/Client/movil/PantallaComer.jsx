import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';

import { MACROS } from '@/domain/nutrition';
import { equivalencesFor, racionDe } from '@/domain/foodEquiv';
import { grupoDe } from '@/domain/gruposEquiv';
import { DiaEspecial } from '../DiaEspecial';
import { Aire, Cabecera, Tramo } from './Piezas';

/**
 * «COMER» EN EL TELÉFONO — el frame `327:234` del 18 de septiembre de 2026.
 *
 * ══ Qué dice cada pieza ════════════════════════════════════════════════════
 *
 *   · **La cabecera**: el día y la dieta que toca, con sus kcal.
 *   · **La semana**: siete discos. Tocar uno enseña la dieta de ese día; debajo
 *     de cada disco, la sigla de la dieta que le toca.
 *   · **Los tres macros**: los gramos pautados, y el arco dice qué parte de las
 *     kcal del día pone cada uno. No es un anillo de progreso —la app no
 *     trackea, nadie apunta lo que se come—: el dueño ya tumbó en septiembre
 *     tres barras que salían siempre llenas. Un reparto sí se mueve: cambia de
 *     un día alto a uno bajo, y es lo que el dibujo pide sin mentir.
 *   · **Las comidas**: la abierta en su caja, con sus opciones como puntos
 *     arriba a la derecha y cada alimento con su ración. Las demás, plegadas
 *     debajo, se abren al tocarlas. Delante de la nevera se mira UNA comida. Si
 *     su entrenador le escribió una pauta a esa comida, va ENCIMA de los
 *     alimentos: es el marco en el que se leen, igual que en el monitor.
 *   · **Lo que te pidió**: las pautas del plan, al final. No son cifras ni
 *     menú —son lo que no cabe en un número—, así que no compiten con la comida
 *     de ahora: se leen una vez y explican todo lo de arriba.
 *   · **El símbolo de cambio** junto a un alimento dice que tiene
 *     equivalencias; tocar la fila las despliega debajo. Sin equivalencias, la
 *     fila no se toca.
 *
 * Los colores del arco son los de los macros de la casa (`MACROS`): el color
 * es del dato, y en toda la aplicación la proteína es la misma.
 */
export const PantallaComer = ({ datos }) => {
  const {
    cabecera,
    dias,
    dia,
    especial = null,
    comidas,
    notas = [],
    historia,
    catalogo = [],
    grupos = [],
    sinCifras,
  } = datos;
  const [abierta, setAbierta] = useState(comidas[0]?.id ?? null);
  const hoyKey = dias.find((d) => d.esHoy)?.key ?? null;
  const [elegido, setElegido] = useState(hoyKey);

  const reparto = useMemo(() => repartoDeKcal(dia), [dia]);
  const abiertaId = comidas.some((c) => c.id === abierta) ? abierta : comidas[0]?.id;

  return (
    <>
      <Cabecera
        titulo={cabecera.fecha}
        sub={[cabecera.donde, dia && !sinCifras ? `${dia.kcal} kcal` : null].filter(Boolean).join(' · ')}
      />

      {/* La semana solo si dice algo: con una sola dieta para todos los días
          —un plan por macros sin reparto— siete discos iguales que no se
          pueden tocar son un mando roto. */}
      {dias.length > 1 && dias.some((d) => d.onElegir) ? (
        <div className="tel-dias tel-dias-dieta" role="group" aria-label="Tu dieta de cada día">
          {dias.map((d) => (
            <button
              key={d.key}
              type="button"
              className={`tel-dia${(elegido ?? hoyKey) === d.key ? ' tel-hoy' : ''}`}
              aria-pressed={(elegido ?? hoyKey) === d.key}
              aria-label={`${d.letra}${d.esHoy ? ', hoy' : ''}: dieta ${d.sigla}`}
              disabled={!d.onElegir}
              onClick={() => {
                setElegido(d.key);
                d.onElegir?.();
              }}
            >
              <span className="tel-dia-disco">{d.letra}</span>
              <span className="tel-dia-sigla">{d.sigla}</span>
            </button>
          ))}
        </div>
      ) : null}

      {/* Un refeed o un diet break hoy: qué día es y lo que le dejó su entrenador. */}
      {especial ? (
        <Tramo>
          <DiaEspecial especial={especial} />
        </Tramo>
      ) : null}

      {dia && !sinCifras && dia.macros.length > 0 ? (
        <Tramo>
          <div className="tel-macros">
            {dia.macros.map((m) => {
              const parte = reparto[m.key] ?? 0;
              return (
                <div className="tel-macro" key={m.k}>
                  <Arco parte={parte} color={m.color} etiqueta={`${Math.round(parte * 100)} % de las kcal`} />
                  <span className="tel-macro-v">{m.v}g</span>
                  <span className="tel-macro-k">{m.k}</span>
                </div>
              );
            })}
          </div>
        </Tramo>
      ) : null}

      {comidas.length > 0 ? (
        <Tramo className="tel-comidas">
          {comidas.map((c) =>
            c.id === abiertaId ? (
              <div className="tel-caja tel-comida" key={c.id}>
                <div className="tel-comida-cab">
                  <span className="tel-comida-tx">
                    <span className="tel-comida-nom">{c.nombre}</span>
                    {c.kcal && !sinCifras ? <span className="tel-comida-kc">{c.kcal} kcal</span> : null}
                  </span>
                  {/* Las opciones: un punto cada una, y la puesta en azul. Se
                      tocan con la yema entera, no con el punto: el botón mide
                      28 px aunque el punto mida 6. */}
                  {c.opciones > 1 ? (
                    <span className="tel-opciones" role="group" aria-label={`Opciones de ${c.nombre}`}>
                      {c.lista.map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          className="tel-opcion"
                          aria-pressed={o.puesta}
                          aria-label={o.nombre}
                          onClick={o.onElegir}
                        >
                          <i aria-hidden="true" />
                        </button>
                      ))}
                    </span>
                  ) : null}
                </div>
                {c.nota ? <p className="tel-comida-nota">{c.nota}</p> : null}
                <div className="tel-comida-lista">
                  {c.alimentos.map((a) => (
                    <Alimento key={a.id} alimento={a} catalogo={catalogo} grupos={grupos} sinCifras={sinCifras} />
                  ))}
                </div>
              </div>
            ) : (
              <button type="button" className="tel-comida-plegada" key={c.id} onClick={() => setAbierta(c.id)}>
                <span className="tel-comida-tx">
                  <span className="tel-comida-nom">{c.nombre}</span>
                  <span className="tel-comida-que">{c.alimentos.map((a) => a.nombre).join(', ')}</span>
                </span>
                {c.kcal && !sinCifras ? <span className="tel-comida-kc">{c.kcal} kcal</span> : null}
              </button>
            )
          )}
        </Tramo>
      ) : null}

      {comidas.length === 0 && dia && !sinCifras ? (
        <Tramo>
          <p className="tel-pie tel-pie-arriba">
            Tu dieta va por cifras: estas son las de hoy, y cómo llegar a ellas lo eliges tú.
          </p>
        </Tramo>
      ) : null}

      {/* Lo que le pidió por escrito: texto suyo, tal cual lo escribió. Con
          los saltos de línea que puso, que es lo que separa una pauta de tres
          instrucciones metidas en un párrafo. */}
      {notas.length > 0 ? (
        <Tramo rotulo="Lo que te pidió">
          <div className="tel-pautas">
            {notas.map((n) => (
              <div className="tel-caja tel-pauta" key={n.id}>
                {n.titulo ? <b>{n.titulo}</b> : null}
                <p>{n.cuerpo}</p>
              </div>
            ))}
          </div>
        </Tramo>
      ) : null}

      {historia ? (
        <Tramo rotulo="Tus calorías">
          <p className="tel-pie tel-pie-arriba">{historia.frase}</p>
          {historia.puntos.length > 1 ? <Escalera puntos={historia.puntos} /> : null}
        </Tramo>
      ) : null}

      <Aire />
    </>
  );
};

/** Qué parte de las kcal pone cada macro: 4 kcal el gramo de proteína y de
    carbos, 9 el de grasa. */
const repartoDeKcal = (dia) => {
  if (!dia) return {};
  const kcal = { protein: 4, carbs: 4, fats: 9 };
  const suyas = Object.fromEntries(dia.macros.map((m) => [m.key, (Number(m.v) || 0) * (kcal[m.key] || 0)]));
  const total = Object.values(suyas).reduce((a, b) => a + b, 0);
  if (total <= 0) return {};
  return Object.fromEntries(Object.entries(suyas).map(([k, v]) => [k, v / total]));
};

/** El arco de un macro: media circunferencia, llena en la parte que le toca. */
const Arco = ({ parte, color, etiqueta }) => {
  const r = 20;
  const largo = Math.PI * r;
  return (
    <svg className="tel-arco" viewBox="0 0 48 26" role="img" aria-label={etiqueta}>
      <path className="tel-arco-fondo" d="M4,4 A20,20 0 0 0 44,4" />
      <path
        className="tel-arco-lleno"
        d="M4,4 A20,20 0 0 0 44,4"
        style={{ stroke: color }}
        strokeDasharray={largo}
        strokeDashoffset={largo * (1 - Math.max(0, Math.min(1, parte)))}
      />
    </svg>
  );
};

/**
 * UN ALIMENTO DEL MENÚ, Y LO QUE PUEDE IR EN SU LUGAR.
 *
 * Se lee, no se cambia: tu plan sigue siendo lo que te pautaron, y esto dice
 * cuánto pesar de otra cosa para que cuadre. Las equivalencias se calculan
 * antes de abrir nada porque son lo que decide si la fila se puede pulsar: una
 * fila que al tocarla dijera «no hay alternativas» enseña a desconfiar.
 */
const Alimento = ({ alimento, catalogo, grupos, sinCifras }) => {
  const [abierto, setAbierto] = useState(false);
  const entrada = alimento.entrada;

  const equivalencias = useMemo(() => {
    if (!entrada || catalogo.length === 0) return null;
    /* Tu grupo manda sobre el catálogo: si este alimento está en uno, la lista
       son los que escribió tu entrenador y ninguno más (`domain/gruposEquiv`). */
    const grupo = grupoDe(entrada.name, grupos, catalogo);
    return equivalencesFor(entrada, catalogo, [], { grupo });
  }, [entrada, catalogo, grupos]);

  if (!equivalencias) {
    return (
      <div className="tel-al">
        <span className="tel-al-nom">{alimento.nombre}</span>
        <span className="tel-al-g">{alimento.racion}</span>
      </div>
    );
  }

  const macro = MACROS.find((m) => m.key === equivalencias.macro);

  return (
    <>
      <button
        type="button"
        className={`tel-al tel-cambiable${abierto ? ' tel-abierto' : ''}`}
        aria-expanded={abierto}
        aria-label={`Qué puedes comer en lugar de ${alimento.nombre}`}
        onClick={() => setAbierto((v) => !v)}
      >
        <span className="tel-al-nom">{alimento.nombre}</span>
        <span className="tel-al-g">
          {alimento.racion}
          <RefreshCw size={13} aria-hidden="true" />
        </span>
      </button>

      {abierto ? (
        <div className="tel-cambios">
          {equivalencias.items.map((item) => (
            <div className="tel-cambio" key={item.food.id || item.food.name}>
              <span>{item.food.name}</span>
              <span className="tel-al-g">{racionDe(item, { corta: true })}</span>
            </div>
          ))}
          <p className="tel-cambios-pie">
            {sinCifras
              ? `Cualquiera de estas va en lugar de ${alimento.nombre.toLowerCase()}.`
              : `Cada una te da unos ${equivalencias.macroGrams} g de ${(macro?.label || '').toLowerCase()}.`}
          </p>
        </div>
      ) : null}
    </>
  );
};

/**
 * LA ESCALERA de lo que te han pautado: una línea que salta cuando te cambian
 * las calorías y plana mientras no. Los escalones son cuadrados: una pauta no
 * sube en rampa. Una serie sin cambios se pinta centrada: dice «lo mismo», no
 * «cero».
 */
const Escalera = ({ puntos }) => {
  const min = Math.min(...puntos);
  const max = Math.max(...puntos);
  const rango = max - min;
  const y = (v) => (rango === 0 ? 30 : 50 - ((v - min) / rango) * 40);
  const x = (i) => (i * 300) / (puntos.length - 1);

  const d = puntos
    .map((v, i) =>
      i === 0
        ? `M0,${y(v).toFixed(1)}`
        : `L${x(i).toFixed(1)},${y(puntos[i - 1]).toFixed(1)} L${x(i).toFixed(1)},${y(v).toFixed(1)}`
    )
    .join(' ');

  return (
    <svg viewBox="0 0 300 60" preserveAspectRatio="none" className="tel-escalera" aria-hidden="true">
      <path d={d} />
    </svg>
  );
};
