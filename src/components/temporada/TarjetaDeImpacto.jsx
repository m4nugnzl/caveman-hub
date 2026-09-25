import { useState } from 'react';

import { WEEKDAYS } from '@/domain/calendar';
import { VALORACIONES } from '@/domain/intervenciones';
import { pautaDeIntervencion } from '@/domain/pautaDelDia';
import { PESAJES_FIRMES, pesajesTexto } from '@/domain/tendenciaDelPeso';
import { variacionTexto } from '@/domain/rendimiento';
import { addDays, daysBetween, localeNumber } from '@/lib/dates';
import { BotonAccion, Notice, useAccionDeBoton } from '@/components/ui/primitives';
import { entero, kg, pctSemana } from './lectura';
import { Cifras, Columna, esNumero, macrosCortas, tramoCorto } from './PiezasDelInspector';

/** «Jue 11». */
const diaCorto = (fecha) => `${WEEKDAYS[(new Date(`${fecha}T00:00:00Z`).getUTCDay() + 6) % 7]} ${Number(fecha.slice(8, 10))}`;
const d1 = (v) => localeNumber(Math.round(v * 10) / 10, { maximumFractionDigits: 1 });
const sinUnidad = (v) => pctSemana(v).replace(' %/sem', '');

/* Cómo se llama cada cifra de la dieta cuando cambia. */
const NOMBRES_DE_DIETA = { kcals: 'Kcal', steps: 'Pasos', cardio: 'Cardio' };

/**
 * FRANJA 1, QUÉ FUE: la pauta de la intervención. Un refeed escalonado, una
 * tarjeta por día; uno de pauta única, una; un cambio de dieta, cada cifra
 * que cambió con la de antes; un bloque nuevo, su split y el de antes.
 */
const cifrasDeLaPauta = (x, kcal) => {
  if (x.evento) {
    const e = x.evento;
    const escalonado = Array.isArray(e.pautaDias) && e.pautaDias.length > 0;
    if (escalonado) {
      return e.pautaDias.map((_, i) => {
        const fecha = addDays(e.date, i);
        const p = pautaDeIntervencion(e, fecha);
        return {
          id: fecha,
          etiqueta: diaCorto(fecha),
          valor: esNumero(p.kcals) ? entero(p.kcals) : null,
          unidad: 'kcal',
          compara: macrosCortas(p),
        };
      });
    }
    const p = pautaDeIntervencion(e);
    const dias = (daysBetween(x.desde, x.hasta) ?? 0) + 1;
    return [
      {
        id: 'kcal',
        etiqueta: 'Kcal',
        valor: esNumero(p.kcals) ? entero(p.kcals) : null,
        compara: macrosCortas(p) || (esNumero(p.kcals) ? null : 'sin kcal apuntadas'),
        nota: dias > 1 ? `${dias} días` : null,
      },
    ];
  }
  if (x.tipo === 'dieta') {
    const cifras = [];
    const macros = x.cambios.some((c) => ['protein', 'carbs', 'fats'].includes(c.clave));
    for (const c of x.cambios) {
      if (['protein', 'carbs', 'fats'].includes(c.clave)) continue;
      /* Las kcal, día a día como en la tabla (`kcalDelCambio`), no la media del ciclo. */
      if (c.clave === 'kcals') {
        cifras.push({
          id: 'kcals',
          etiqueta: 'Kcal medias',
          valor: esNumero(kcal?.despues) ? entero(kcal.despues) : null,
          compara: esNumero(kcal?.antes) ? `antes ${entero(kcal.antes)}` : null,
        });
        continue;
      }
      const valor = (v) => (c.clave === 'cardio' ? v || 'sin cardio' : esNumero(v) ? entero(v) : null);
      cifras.push({ id: c.clave, etiqueta: NOMBRES_DE_DIETA[c.clave], valor: valor(c.despues), compara: `antes ${valor(c.antes) ?? 'nada'}` });
    }
    if (macros)
      cifras.push({
        id: 'macros',
        etiqueta: 'Macros',
        valor: macrosCortas(x.despues),
        compara: macrosCortas(x.antes) ? `antes ${macrosCortas(x.antes)}` : null,
      });
    return cifras;
  }
  return [
    { id: 'bloque', etiqueta: 'Bloque', valor: x.bloque.nombre || 'Sin nombre', compara: x.anterior ? `antes ${x.anterior.nombre}` : null },
    {
      id: 'split',
      etiqueta: 'Split',
      valor: x.bloque.split || null,
      compara: x.anterior?.split && x.anterior.split !== x.bloque.split ? `antes ${x.anterior.split}` : x.anterior ? 'el mismo' : null,
    },
  ];
};

/** El texto de una celda de la tabla. */
const celdaTexto = (fila, v, i) => {
  if (v === null || v === undefined) return null;
  switch (fila.grupo) {
    case 'peso':
      return fila.id === 'ritmo' ? sinUnidad(v.ritmo) : kg(v);
    case 'pauta':
      return entero(v);
    case 'sensacion':
      return d1(v);
    case 'entreno':
      return v.pedidos ? `${v.hechos} de ${v.pedidos}` : String(v.hechos);
    case 'rendimiento':
      return i === 0 ? 'base' : variacionTexto(v);
    default:
      return String(v);
  }
};

/** El nombre de una fila, con su unidad si la tiene. */
const nombreDeFila = (fila) => {
  if (fila.id === 'ritmo') return 'Tendencia, %/sem';
  if (fila.id === 'peso') return 'Peso medio, kg';
  if (fila.grupo === 'sensacion' && fila.max) return `${fila.nombre}, /${fila.max}`;
  return fila.nombre;
};

/**
 * FRANJA 2, QUÉ PASÓ: antes, durante y después, en columnas. Cada ventana
 * dice sus fechas; la de después, si no ha terminado, «en curso». Lo que no se
 * sabe (un día sin pesaje, una ventana aún por llegar) es una raya.
 */
const Tabla = ({ x, ventanas, estado, impacto, objetivo, hoy }) => {
  const cambio = x.tipo === 'dieta' || x.tipo === 'bloque';
  const columnas = [
    { id: 'antes', nombre: 'Antes', v: ventanas.antes },
    { id: 'durante', nombre: cambio ? '1.ª semana' : 'Durante', v: ventanas.durante },
    { id: 'despues', nombre: 'Después', v: ventanas.despues },
  ];
  const pie = (c) => {
    if (!c.v) return 'sin días';
    if (c.v.desde > hoy) return 'por llegar';
    if (c.v.hasta >= hoy && estado !== 'prevista') return 'en curso';
    return null;
  };
  let grupo = null;
  return (
    <div className="tl-imp">
      <table className="tl-imp-tabla tnum">
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Qué se mide</span>
            </th>
            {columnas.map((c) => (
              <th key={c.id} scope="col" className={`is-${c.id}`}>
                <span className="tl-imp-col">{c.nombre}</span>
                <span className="tl-imp-fechas">{c.v ? tramoCorto(c.v.desde, c.v.hasta) : '—'}</span>
                {pie(c) && <span className="tl-imp-pie">{pie(c)}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {impacto.filas.map((f) => {
            const nuevo = f.grupo !== grupo;
            grupo = f.grupo;
            return (
              <tr key={f.id} className={nuevo ? 'is-grupo' : undefined}>
                <th scope="row">
                  <span className="tl-ins-nombre">{nombreDeFila(f)}</span>
                  {f.id === 'ritmo' && objetivo && <span className="tl-imp-nota">objetivo {objetivo.replace(' %/sem', '')}</span>}
                </th>
                {f.celdas.map((v, i) => {
                  const t = celdaTexto(f, v, i);
                  /* La tendencia dice cuántos pesajes la sostienen; con pocos, atenuada. */
                  const pesajes = f.id === 'ritmo' && v ? v.pesajes : null;
                  const clase = t === null || t === 'base' ? 'is-nada' : pesajes !== null && pesajes < PESAJES_FIRMES ? 'is-debil' : undefined;
                  return (
                    <td key={columnas[i].id} className={clase}>
                      {t ?? '—'}
                      {pesajes !== null && <span className="tl-imp-nota">{pesajesTexto(pesajes)}</span>}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {impacto.filas.length === 0 && <p className="tl-ins-nada">Todavía no hay datos en ninguna de las tres ventanas.</p>}
    </div>
  );
};

/**
 * FRANJA 3, LO QUE PIENSAS: el motivo (solo lo ves tú) y la valoración, a
 * mano. Se guardan juntos con «Guardar». La indicación para el cliente, si la
 * hay, se lee aquí y se cambia en su calendario.
 */
const LoQuePiensas = ({ x, onGuardar }) => {
  const capa = x.capa || {};
  const [motivo, setMotivo] = useState(capa.motivo || '');
  const [valoracion, setValoracion] = useState(capa.valoracion || null);
  const [nota, setNota] = useState(capa.valoracionNota || '');
  const [error, setError] = useState('');
  const envio = useAccionDeBoton();
  const tocado =
    motivo.trim() !== (capa.motivo || '') || (valoracion || null) !== (capa.valoracion || null) || nota.trim() !== (capa.valoracionNota || '');

  const guardar = async () => {
    setError('');
    const campos = {};
    if (motivo.trim() !== (capa.motivo || '')) campos.motivo = motivo;
    if ((valoracion || null) !== (capa.valoracion || null)) campos.valoracion = valoracion;
    /* La nota va con la valoración: sin valoración no hay nota (0143). */
    campos.valoracionNota = valoracion ? nota : null;
    const r = await onGuardar(campos);
    if (!r.ok) setError(r.error);
    return r;
  };

  return (
    <form
      className="tl-imp-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (tocado) envio.lanzar(guardar);
      }}
    >
      <Columna titulo="Motivo">
        <textarea
          className="input textarea"
          rows={2}
          maxLength={280}
          placeholder="Por qué lo hiciste. Solo lo ves tú."
          aria-label="Motivo, solo lo ves tú"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />
      </Columna>
      <Columna titulo="¿Funcionó?">
        <div className="rail-wrap" role="group" aria-label="Tu valoración">
          {VALORACIONES.map((v) => (
            <button
              key={v.id}
              type="button"
              className="chip"
              aria-pressed={valoracion === v.id}
              onClick={() => setValoracion(valoracion === v.id ? null : v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>
        {valoracion && (
          <textarea
            className="input textarea"
            rows={2}
            maxLength={280}
            placeholder="Qué te hace pensarlo."
            aria-label="Nota de la valoración"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
          />
        )}
      </Columna>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="tl-imp-guardar">
        <BotonAccion type="submit" className="btn btn-primary btn-sm" estado={envio.estado} disabled={!tocado}>
          Guardar
        </BotonAccion>
      </div>
    </form>
  );
};

/**
 * LA TARJETA DE IMPACTO de una intervención (25 sep 2026): qué fue, qué pasó
 * antes, durante y después, y lo que piensa el entrenador.
 *
 * Ningún color de juicio, ninguna flecha verde o roja: cifras en columnas.
 * Si funcionó lo dice él, con su valoración.
 *
 * @param datos `{ x, ventanas, estado, impacto, objetivo, hoy, kcal }`: la
 *   intervención (`intervencionesDelCliente`), sus ventanas (`ventanasDe`),
 *   su estado, su tabla (`impactoDe`), el ritmo objetivo de su fase y, en un
 *   cambio de dieta, sus kcal de antes y de después (`kcalDelCambio`).
 * @param onGuardar `(campos) => Promise<{ ok, error }>`: escribe su capa.
 * @param onVentanasPorDefecto vuelve a las ventanas de 7 días.
 */
export const TarjetaDeImpacto = ({ datos, onGuardar, onVentanasPorDefecto }) => {
  const { x, ventanas } = datos;
  const movidas = ventanas.movidas.antes || ventanas.movidas.despues;
  return (
    <div className="tl-ins-cuerpo">
      <Cifras cifras={cifrasDeLaPauta(x, datos.kcal)} />
      <Tabla {...datos} />
      <p className="tl-ins-nada">
        {movidas ? 'Ventanas movidas a mano. ' : 'Ventanas de 7 días. '}
        Arrastra el principio de «antes» o el final de «después» en la gráfica para cambiarlas.
        {movidas && (
          <>
            {' '}
            <button type="button" className="tl-ins-enlace" onClick={onVentanasPorDefecto}>
              Volver a 7 días
            </button>
          </>
        )}
      </p>
      <div className="tl-ins-contexto">
        {/* `key`: al pasar a otra intervención, el formulario vuelve a leer la suya. */}
        <LoQuePiensas key={x.id} x={x} onGuardar={onGuardar} />
        {x.evento?.nota && (
          <Columna titulo="Indicación para el cliente">
            <p className="tl-ins-texto">{x.evento.nota}</p>
          </Columna>
        )}
      </div>
    </div>
  );
};
