import { useState } from 'react';

import { buildWeightLog, weekDates } from '@/domain/anthropometry';
import { inicialDelDia } from '@/domain/blocks';
import { localeNumber, todayISO } from '@/lib/dates';
import { Aire, Boton, CabeceraDia, FilaMenu, Tarjeta, Titulillo } from './Piezas';

/**
 * «ENTREGA TU SEMANA» EN EL TELÉFONO.
 *
 * ══ Por qué esta pantalla no está en la barra del pulgar ═══════════════════
 *
 * Porque el prototipo del teléfono tiene CUATRO destinos —Hoy · Entreno · Comer
 * · Tú— y este no es uno. Se llega desde la fila *Cerrar la semana* de «Tú», que
 * lleva su estado en azul, y desde el pedido de la portada el día que toca. Ver
 * `CLIENT_SECTIONS`.
 *
 * No estar en la barra no la esconde: la convoca lo que de verdad la convoca,
 * que es tener algo pendiente. Es la ley del reposo.
 *
 * ══ Un solo trabajo ═══════════════════════════════════════════════════════
 *
 * La báscula arriba —dos gestos, la cifra ya puesta— y debajo el estado de la
 * entrega con su verbo. Nada más: la curva del peso está en «Tú» y las semanas
 * anteriores detrás de su propia fila.
 */
export const PantallaRevision = ({ datos }) => {
  const { periodo, pasos, entrega, peso, atrasadas, respuesta } = datos;
  const siguiente = pasos.find((p) => !p.hecho)?.id || null;

  return (
    <>
      <CabeceraDia fecha={entrega.titular} donde={periodo} />
      <div className="tel-tramo">
        {peso ? <Bascula {...peso} /> : null}

        <Titulillo>{entrega.rotulo}</Titulillo>
        <Tarjeta lista>
          {pasos.map((p) => (
            <FilaMenu
              key={p.id}
              rotulo={p.titulo}
              valor={p.hecho ? 'hecho' : 'te toca'}
              /* En azul SOLO el siguiente, no los tres que faltan: tres avisos
                 encendidos a la vez dejan de decir «mira aquí» y pasan a ser el
                 aspecto normal de la lista. Ver `la ley del color`. */
              espera={p.id === siguiente}
              onClick={p.hecho ? undefined : () => entrega.onPaso(p.id)}
            />
          ))}
        </Tarjeta>
        <Boton onClick={entrega.onEntregar}>{entrega.verbo}</Boton>
        <p className="tel-pie-nota">
          No hace falta que sea el domingo exacto, y llegar tarde no te salta la revisión.
        </p>

        {respuesta ? (
          <>
            <Titulillo>Lo que te dijo la vez pasada</Titulillo>
            <Tarjeta plana>
              <div className="tel-meta">{respuesta.cuando}</div>
              <p className="tel-pauta-frase">{respuesta.texto}</p>
            </Tarjeta>
          </>
        ) : null}

        {atrasadas > 0 ? (
          <div className="tel-menu">
            <FilaMenu
              rotulo={`${atrasadas} semanas sin entregar`}
              to="/mi/evolucion/medidas"
            />
          </div>
        ) : null}

        <Aire />
      </div>
    </>
  );
};

/** La báscula: la cifra viene puesta y solo hay que pulsar. */
const Bascula = ({ resumen, semana, ultimo, foto, onApuntar }) => {
  const [escrito, setEscrito] = useState(null);
  const hoy = todayISO();
  const deHoy = (resumen.entries || []).find((e) => e.date === hoy) || null;
  const propuesta = deHoy?.weight ?? ultimo?.weight ?? null;
  const valor = escrito ?? (propuesta === null ? '' : String(propuesta));
  const numero = Number(String(valor).replace(',', '.'));
  const valido = Number.isFinite(numero) && numero > 0;
  const yaEsta = deHoy !== null && numero === Number(deHoy.weight);

  const dias = weekDates(semana);
  const conPeso = new Set((resumen.entries || []).map((e) => e.date));

  return (
    <Tarjeta>
      <div className="tel-eyebrow">Tu peso de hoy</div>
      <div className="tel-bascula">
        <span className="tel-lectura">
          <input
            type="text"
            inputMode="decimal"
            value={valor}
            onChange={(e) => setEscrito(e.target.value)}
            aria-label="Tu peso de hoy, en kilos"
          />
          <span className="tel-u">kg</span>
        </span>
        {!yaEsta ? (
          <button
            type="button"
            className="tel-apuntar"
            disabled={!valido}
            onClick={() => {
              if (!valido) return;
              onApuntar(buildWeightLog({ date: hoy, weight: numero, nutritionFoto: foto }));
              setEscrito(null);
            }}
          >
            Apuntar
          </button>
        ) : null}
      </div>

      <div className="tel-semana-puntos" aria-hidden="true">
        {dias.map((fecha) => (
          <span
            key={fecha}
            className={[conPeso.has(fecha) ? 'tel-pesado' : '', fecha === hoy ? 'tel-hoy' : '']
              .filter(Boolean)
              .join(' ')}
          >
            {inicialDelDia(fecha)}
            <i />
          </span>
        ))}
      </div>

      {resumen.average !== null ? (
        <p className="tel-pie-nota">
          Media de esta semana {kg(resumen.average)} kg
          {resumen.previousAverage !== null ? ` · la anterior ${kg(resumen.previousAverage)}` : ''}
        </p>
      ) : null}
    </Tarjeta>
  );
};

const kg = (v) => localeNumber(v, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
