import { useEffect, useState } from 'react';

import { useApp } from '@/context/AppContext';
import { shortDate } from '@/lib/dates';

/**
 * LAS SERIES DE UN CLIENTE QUE NO SE GUARDARON, para su Revisión.
 *
 * Las cuenta su teléfono cuando el servidor rechaza una serie y no hay dónde
 * recolocarla: su entrenador quitó la hoja, o el ejercicio, con la sesión
 * abierta. Ver `lib/seriesNoGuardadas` y la migración 0132. Siguen en el
 * teléfono, marcadas «No guardada»; esto es lo que le llega al entrenador.
 */
export const useSeriesNoGuardadas = (clientId) => {
  const { leerSeriesNoGuardadas } = useApp();
  const [filas, setFilas] = useState([]);

  useEffect(() => {
    if (!clientId || !leerSeriesNoGuardadas) return undefined;
    let vivo = true;
    Promise.resolve(leerSeriesNoGuardadas(clientId))
      .then((data) => {
        if (vivo) setFilas(data || []);
      })
      .catch(() => {
        /* Sin red: no hay nada que decir, y la próxima vez se vuelve a mirar. */
        if (vivo) setFilas([]);
      });
    return () => {
      vivo = false;
    };
  }, [clientId, leerSeriesNoGuardadas]);

  return filas;
};

/**
 * «3 series no se guardaron el 22 sep · Pull A», una línea por día y hoja de
 * esa semana. Se cuentan SERIES y no campos: los kilos y las repeticiones de la
 * misma serie son dos filas de la tabla y una sola serie para quien lo lee.
 *
 * `detalle` es lo que se lee al pasar por encima: qué ejercicio, qué serie y lo
 * que anotó, por si el entrenador quiere apuntarlo a mano.
 */
export const lineasNoGuardadas = (filas, semana) => {
  const grupos = new Map();
  for (const f of filas || []) {
    if (f.semana !== semana) continue;
    const clave = `${f.fecha || ''}|${f.hoja || ''}`;
    const g = grupos.get(clave) || { fecha: f.fecha, hoja: f.hoja, series: new Map() };
    const serie = `${f.ejercicio || ''}|${f.serie}`;
    const valores = g.series.get(serie) || { ejercicio: f.ejercicio, n: (f.serie ?? 0) + 1, campos: {} };
    valores.campos[f.campo] = f.valor;
    g.series.set(serie, valores);
    grupos.set(clave, g);
  }

  return [...grupos.values()].map((g) => {
    const n = g.series.size;
    const cuantas = n === 1 ? '1 serie no se guardó' : `${n} series no se guardaron`;
    const cuando = g.fecha ? ` el ${shortDate(g.fecha)}` : '';
    return {
      texto: `${cuantas}${cuando}${g.hoja ? ` · ${g.hoja}` : ''}`,
      detalle: [...g.series.values()]
        .map((s) => {
          const { kg, reps, rir } = s.campos;
          const lo = [kg ? `${kg} kg` : null, reps ? `${reps} reps` : null, rir ? `RIR ${rir}` : null]
            .filter(Boolean)
            .join(' · ');
          return `${s.ejercicio}, serie ${s.n}${lo ? `: ${lo}` : ''}`;
        })
        .join('\n'),
    };
  });
};
