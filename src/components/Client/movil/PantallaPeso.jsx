import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';

import { localeNumber, todayISO, weekdayName } from '@/lib/dates';
import { Aire, Boton, Cabecera, Tramo } from './Piezas';

/**
 * EL REGISTRO DE PESO EN EL TELÉFONO — el frame `328:206`.
 *
 *   1. **La cifra**, en grande, con lo que cambió desde el pesaje anterior.
 *   2. **La tendencia** de las dos últimas semanas, con sus medias debajo. La
 *      línea va en gris y su último tramo en la señal —el verde del dibujo es
 *      el azul de la casa—: dice dónde estás, no hacia dónde debe ir el peso.
 *   3. **Apuntar**: los siete días de la semana, y en el elegido la cifra —la
 *      suya si ya está, la última si no— que se mueve de 100 en 100 g con − y
 *      +, o se escribe. Si no has tocado nada y ya está apuntada, el verbo se
 *      calla.
 *   4. **Los últimos pesajes**, cada uno con su cambio.
 *
 * ══ LA TIRA DE DÍAS ES EL MANDO ════════════════════════════════════════════
 *
 * Esta pantalla solo sabía escribir el peso de HOY, y un cliente lo dijo: se
 * pesa a diario, la báscula se lo guarda en su propia aplicación y él lo
 * transcribe todo el domingo. Con un único día escribible, de siete pesajes
 * entraba uno — y la media del periodo, que es con lo que su entrenador decide,
 * salía de ese uno.
 *
 * Los días no son una barra de progreso ni un semáforo: son siete casillas y
 * cada una se toca. El elegido se enciende, que es la gramática de la casa —no
 * hay flechas, la caja se enciende—. Los que no han llegado se pintan apagados
 * y no responden: un peso con fecha futura no lo tiene nadie.
 */
export const PantallaPeso = ({ datos }) => {
  const { ahora, delta, tendencia, medias, dias, hoy, ultimo, onApuntar, ultimos, onVolver } = datos;
  /* `null` mientras no se elige: manda hoy. Una sola variable y no «día + si se
     ha tocado», que deja escribir el imposible de no tener ninguno elegido. */
  const [dia, setDia] = useState(null);
  const [escrito, setEscrito] = useState(null);

  const elegido = dia ?? hoy;
  const delDia = dias.find((d) => d.date === elegido) || null;
  /* La cifra que viene puesta: la de ese día si ya está, y si no la última
     apuntada. Proponer la última es lo que hace que esto sean dos gestos. */
  const propuesta = delDia?.peso ?? ultimo;
  const valor = escrito ?? (propuesta === null || propuesta === undefined ? '' : dec(propuesta));
  const numero = Number(String(valor).replace(',', '.'));
  const valido = Number.isFinite(numero) && numero > 20 && numero < 400;
  const yaEsta = delDia?.peso != null && valido && Math.abs(numero - delDia.peso) < 0.05;

  const elegir = (fecha) => {
    setDia(fecha);
    /* Lo escrito era de otro día: mantenerlo pondría la cifra del lunes en la
       casilla del martes sin que nadie la haya escrito ahí. */
    setEscrito(null);
  };

  const mover = (paso) => {
    const base = valido ? numero : propuesta ?? 70;
    setEscrito(dec(Math.round((base + paso) * 10) / 10));
  };

  return (
    <>
      <Cabecera titulo="Registro de peso" atras={{ onClick: onVolver }} />

      <div className="tel-peso-grande">
        <span className="tel-peso-cifra">{ahora ? `${ahora} kg` : '—'}</span>
        {delta ? (
          <span className="tel-peso-cambio">
            <i aria-hidden="true" />
            {delta}
          </span>
        ) : null}
      </div>

      {tendencia.length >= 3 ? (
        <Tramo rotulo="Tendencia de 14 días">
          <Tendencia puntos={tendencia} />
          {medias.length > 0 ? (
            <p className="tel-medias">
              {medias.map((m, i) => (
                <span key={m.k}>
                  {i > 0 ? ' · ' : ''}
                  {m.k}: <b>{m.v} kg</b>
                </span>
              ))}
            </p>
          ) : null}
        </Tramo>
      ) : null}

      <Tramo rotulo="Registrar peso">
        {/* Los siete días. El elegido encendido, los que ya tienen pesaje con su
            punto, los que no han llegado apagados y sin respuesta. */}
        <div className="tel-peso-dias" role="group" aria-label="Elige el día">
          {dias.map((d) => (
            <button
              key={d.date}
              type="button"
              className={`tel-peso-dia${d.date === elegido ? ' es-elegido' : ''}${
                d.peso != null ? ' es-puesto' : ''
              }`}
              disabled={d.futuro}
              aria-pressed={d.date === elegido}
              aria-label={`${weekdayName(d.date)}${d.peso != null ? `, ${dec(d.peso)} kilos` : ', sin apuntar'}`}
              onClick={() => elegir(d.date)}
            >
              <b>{d.inicial}</b>
              <i aria-hidden="true" />
            </button>
          ))}
        </div>

        <div className="tel-paso-grande">
          <button type="button" onClick={() => mover(-0.1)} aria-label="Bajar 100 gramos">
            <Minus size={15} aria-hidden="true" />
          </button>
          <label className="tel-paso-cifra">
            <input
              type="text"
              inputMode="decimal"
              value={valor}
              onChange={(e) => setEscrito(e.target.value)}
              aria-label={`Peso del ${weekdayName(elegido)}, en kilos`}
              /* A la medida de la cifra, para que «kg» vaya pegado a ella
                 como en el dibujo y no al otro lado de una casilla fija. */
              style={{ width: `${Math.max(2.6, String(valor).length - 0.4)}ch` }}
            />
            <span>kg</span>
          </label>
          <button type="button" onClick={() => mover(0.1)} aria-label="Subir 100 gramos">
            <Plus size={15} aria-hidden="true" />
          </button>
        </div>
        <p className="tel-pie tel-centrado">
          {elegido === hoy
            ? 'En ayunas, por la mañana y después del baño.'
            : /* Qué día se está escribiendo, dicho donde se está escribiendo. El
                 día encendido arriba lo dice sin palabras; esto lo dice con
                 ellas, que es lo que evita guardar el domingo en el jueves. */
              `Estás apuntando el del ${weekdayName(elegido).toLowerCase()}.`}
        </p>
        <Boton
          callado={yaEsta}
          disabled={!valido || yaEsta}
          onClick={() => {
            if (!valido || yaEsta) return;
            onApuntar(numero, elegido);
            setEscrito(null);
          }}
        >
          {yaEsta
            ? 'Guardado'
            : delDia?.peso != null
              ? `Corregir el del ${weekdayName(elegido).toLowerCase()}`
              : elegido === hoy
                ? 'Guardar peso'
                : `Guardar el del ${weekdayName(elegido).toLowerCase()}`}
        </Boton>
      </Tramo>

      {ultimos.length > 0 ? (
        <Tramo rotulo="Últimos registros">
          <ul className="tel-pesajes">
            {ultimos.map((p) => (
              <li key={p.date}>
                <span className="tel-pesaje-dia">{diaDe(p.date)}</span>
                <b>{p.valor} kg</b>
                <span className="tel-pesaje-cambio">{p.cambio ? `${p.cambio} kg` : ''}</span>
              </li>
            ))}
          </ul>
        </Tramo>
      ) : null}

      <Aire />
    </>
  );
};

const dec = (v) => localeNumber(v, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** «Hoy, 18 sept», «Ayer, 17 sept», «Martes, 16 sept». */
const diaDe = (iso) => {
  const hoy = todayISO();
  const d = new Date(`${iso}T12:00:00`);
  const fecha = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '');
  const ayer = new Date(`${hoy}T12:00:00`);
  ayer.setDate(ayer.getDate() - 1);
  if (iso === hoy) return `Hoy, ${fecha}`;
  if (iso === ayer.toISOString().slice(0, 10)) return `Ayer, ${fecha}`;
  const dia = d.toLocaleDateString('es-ES', { weekday: 'long' });
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)}, ${fecha}`;
};

/**
 * LA TENDENCIA: los pesajes de dos semanas sobre tres líneas de guía. El último
 * tramo y el último punto van en la señal. Sin ejes ni cifras: las cifras están
 * debajo, en las medias.
 */
const Tendencia = ({ puntos }) => {
  const ancho = 300;
  const alto = 80;
  const valores = puntos.map((p) => p.value);
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const rango = max - min || 1;
  const x = (i) => 8 + (i * (ancho - 16)) / (puntos.length - 1);
  const y = (v) => alto - 10 - ((v - min) / rango) * (alto - 20);
  const d = valores.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const u = valores.length - 1;
  const ultimoTramo = `M${x(u - 1).toFixed(1)},${y(valores[u - 1]).toFixed(1)} L${x(u).toFixed(1)},${y(valores[u]).toFixed(1)}`;
  return (
    <svg className="tel-tendencia" viewBox={`0 0 ${ancho} ${alto}`} aria-hidden="true">
      {[10, 40, 70].map((g) => (
        <line key={g} x1="0" x2={ancho} y1={g} y2={g} />
      ))}
      <path d={d} />
      <path className="tel-tramo-ultimo" d={ultimoTramo} />
      {valores.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={i === u ? 4 : 2} className={i === u ? 'tel-ultimo-punto' : undefined} />
      ))}
    </svg>
  );
};
