import { useState } from 'react';

import { WEEKDAYS } from '@/domain/calendar';
import { VALORACIONES } from '@/domain/intervenciones';
import { estadoDeLaProgramada } from '@/domain/dietaProgramada';
import { pautaDeIntervencion } from '@/domain/pautaDelDia';
import { PESAJES_FIRMES, pesajesTexto } from '@/domain/tendenciaDelPeso';
import { variacionTexto } from '@/domain/rendimiento';
import { addDays, daysBetween, localeNumber, shortDate } from '@/lib/dates';
import { BotonAccion, Notice, useAccionDeBoton } from '@/components/ui/primitives';
import { entero, kg, pctSemana } from './lectura';
import { Cifras, Columna, cifrasDeLaClave, esNumero, fechasDeIntervencion, macrosCortas, nombreConTipo, tramoCorto } from './PiezasDelInspector';

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
          /* Pendiente, aún no hay días vividos: es la media del ciclo de la copia. */
          etiqueta: x.programada?.estado === 'pendiente' ? 'Kcal previstas' : 'Kcal medias',
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
      /* Sin split en el de antes no hay con qué comparar: ni «antes» ni «el mismo». */
      compara: !x.anterior?.split ? null : x.anterior.split !== x.bloque.split ? `antes ${x.anterior.split}` : 'el mismo',
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
 * hay, se lee aquí y se cambia con «Editar pauta».
 *
 * El motivo se escribe siempre. «¿Funcionó?» no sale en una prevista y, en
 * curso, solo dice cuándo se podrá valorar: hasta que acaba el después no hay
 * con qué juzgarla. Una ya valorada conserva sus botones, para cambiarla.
 */
const LoQuePiensas = ({ x, estado, fin, onGuardar }) => {
  const capa = x.capa || {};
  const [motivo, setMotivo] = useState(capa.motivo || '');
  const [valoracion, setValoracion] = useState(capa.valoracion || null);
  const [nota, setNota] = useState(capa.valoracionNota || '');
  const [error, setError] = useState('');
  const envio = useAccionDeBoton();
  const valorable = estado === 'hecha' || Boolean(capa.valoracion);
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
      {estado !== 'prevista' && (
        <Columna titulo="¿Funcionó?">
          {valorable ? (
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
          ) : (
            <p className="tl-ins-nada">Podrás valorarla cuando acabe el después ({shortDate(fin)}).</p>
          )}
          {valorable && valoracion && (
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
      )}
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
 * «Coincide con: Refeed 24 – 26 sep, Cambio de dieta 1 sep»: lo que cae dentro
 * de sus ventanas. No las recorta (`ventanasDe`); se dice, y cada una abre
 * su tarjeta.
 */
const Coinciden = ({ otras, hoy, onAbrir }) => (
  <p className="tl-ins-nada">
    Coincide con:{' '}
    {otras.map((o, i) => (
      <span key={o.id}>
        {i > 0 && ', '}
        <button type="button" className="tl-ins-enlace" onClick={() => onAbrir(o.id)}>
          {nombreConTipo(o)} {fechasDeIntervencion(o, hoy)}
        </button>
      </span>
    ))}
  </p>
);

/**
 * LA TARJETA DE IMPACTO de una intervención (25 sep 2026): su cifra clave
 * (26 sep: la tendencia del peso antes → después o, en un bloque, sus
 * referencias y la fatiga), qué fue, qué pasó antes, durante y después, y lo
 * que piensa el entrenador.
 *
 * Ningún color de juicio, ninguna flecha verde o roja: cifras en columnas.
 * Si funcionó lo dice él, con su valoración.
 *
 * @param datos `{ x, ventanas, estado, impacto, clave, objetivo, hoy, kcal }`: la
 *   intervención (`intervencionesDelCliente`), sus ventanas (`ventanasDe`),
 *   su estado, su tabla (`impactoDe`), el ritmo objetivo de su fase y, en un
 *   cambio de dieta, sus kcal de antes y de después (`kcalDelCambio`).
 * @param onGuardar `(campos) => Promise<{ ok, error }>`: escribe su capa.
 * @param onVentanasPorDefecto vuelve a las ventanas de 7 días.
 * @param onAbrir `(id)` abre otra intervención (las que coinciden).
 * @param onEditarPauta abre la ventana de la variación (un refeed o un diet
 *   break): sus fechas, sus cifras, su menú y su indicación. Solo con evento.
 * @param onAbrirProgramada abre en la Dieta la copia de un cambio programado
 *   (0146); `onEditarProgramada`, su día y su motivo. Solo si está pendiente.
 * @param onMontarBloque abre en Entreno un bloque previsto (letra c);
 *   `onEditarBloque`, su ventana (nombre, duración, split y motivo).
 */
export const TarjetaDeImpacto = ({
  datos,
  onGuardar,
  onVentanasPorDefecto,
  onAbrir,
  onEditarPauta = null,
  onAbrirProgramada = null,
  onEditarProgramada = null,
  onMontarBloque = null,
  onEditarBloque = null,
}) => {
  const { x, ventanas, estado, clave } = datos;
  const movidas = ventanas.movidas.antes || ventanas.movidas.despues;
  const programada = x.programada || null;
  /* Una pendiente no tiene aún versión de la que colgar lo que se piensa. */
  const pendiente = programada?.estado === 'pendiente';
  return (
    <div className="tl-ins-cuerpo">
      {/* Cómo entra (o entró) un cambio programado: «Cambio programado para
          el 1 oct · el cliente no lo ve», «Se aplicó el 3 oct; sustituyó un
          retoque de menú del 2 oct». */}
      {programada && (
        <p className="tl-ins-texto">
          {estadoDeLaProgramada(programada)}.
          {onAbrirProgramada && (
            <>
              {' '}
              <button type="button" className="tl-ins-enlace" onClick={onAbrirProgramada}>
                Abrir en Dieta
              </button>
            </>
          )}
          {onEditarProgramada && (
            <>
              {' · '}
              <button type="button" className="tl-ins-enlace" onClick={onEditarProgramada}>
                Día y motivo
              </button>
            </>
          )}
        </p>
      )}
      {/* Un bloque previsto: aún es un borrador, se monta en Entreno. */}
      {x.bloque?.borrador && (
        <p className="tl-ins-texto">
          Previsto del {shortDate(x.bloque.desde)} al {shortDate(x.bloque.hasta)} · el cliente no lo ve.
          {onMontarBloque && (
            <>
              {' '}
              <button type="button" className="tl-ins-enlace" onClick={onMontarBloque}>
                Montarlo en Entreno
              </button>
            </>
          )}
          {onEditarBloque && (
            <>
              {' · '}
              <button type="button" className="tl-ins-enlace" onClick={onEditarBloque}>
                Nombre y split
              </button>
            </>
          )}
        </p>
      )}
      {/* La cifra clave, lo primero que se lee (una prevista aún no tiene), y
          detrás la pauta, en la misma fila. */}
      <Cifras cifras={[...(estado !== 'prevista' ? cifrasDeLaClave(clave) : []), ...cifrasDeLaPauta(x, datos.kcal)]} />
      {onEditarPauta && (
        <button type="button" className="tl-ins-enlace tl-imp-editar" onClick={onEditarPauta}>
          Editar pauta
        </button>
      )}
      <Tabla {...datos} />
      {ventanas.coinciden?.length > 0 && <Coinciden otras={ventanas.coinciden} hoy={datos.hoy} onAbrir={onAbrir} />}
      {!pendiente && (
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
      )}
      <div className="tl-ins-contexto">
        {/* `key`: al pasar a otra intervención, el formulario vuelve a leer la suya. */}
        {pendiente ? (
          <Columna titulo="Por qué">
            <p className="tl-ins-texto">{programada.motivo || 'Sin motivo escrito.'}</p>
          </Columna>
        ) : (
          <LoQuePiensas key={x.id} x={x} estado={estado} fin={ventanas.despues?.hasta || x.hasta} onGuardar={onGuardar} />
        )}
        {x.evento?.nota && (
          <Columna titulo="Indicación para el cliente">
            <p className="tl-ins-texto">{x.evento.nota}</p>
          </Columna>
        )}
      </div>
    </div>
  );
};
