import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';

import { localeNumber, todayISO } from '@/lib/dates';
import { Aire, Boton, Cabecera, Tramo } from './Piezas';

/**
 * EL REGISTRO DE PESO EN EL TELÉFONO — el frame `328:206`.
 *
 *   1. **La cifra**, en grande, con lo que cambió desde el pesaje anterior.
 *   2. **La tendencia** de las dos últimas semanas, con sus medias debajo. La
 *      línea va en gris y su último tramo en la señal —el verde del dibujo es
 *      el azul de la casa—: dice dónde estás, no hacia dónde debe ir el peso.
 *   3. **Apuntar el de hoy**: la cifra viene puesta —la de hoy si ya te
 *      pesaste, la última si no— y se mueve de 100 en 100 g con − y +, o se
 *      escribe. Si no has tocado nada y ya está apuntada, el verbo se calla.
 *   4. **Los últimos pesajes**, cada uno con su cambio.
 */
export const PantallaPeso = ({ datos }) => {
  const { ahora, delta, tendencia, medias, propuesta, yaHoy, onApuntar, ultimos, onVolver } = datos;
  const [escrito, setEscrito] = useState(null);

  const valor = escrito ?? (propuesta === null ? '' : dec(propuesta));
  const numero = Number(String(valor).replace(',', '.'));
  const valido = Number.isFinite(numero) && numero > 20 && numero < 400;
  const yaEsta = yaHoy !== null && valido && Math.abs(numero - yaHoy) < 0.05;

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

      <Tramo rotulo="Registrar peso de hoy">
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
              aria-label="Tu peso de hoy, en kilos"
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
        <p className="tel-pie tel-centrado">En ayunas, por la mañana y después del baño.</p>
        <Boton
          callado={yaEsta}
          disabled={!valido || yaEsta}
          onClick={() => {
            if (!valido || yaEsta) return;
            onApuntar(numero);
            setEscrito(null);
          }}
        >
          {yaEsta ? 'Guardado hoy' : yaHoy !== null ? 'Corregir el de hoy' : 'Guardar peso'}
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
