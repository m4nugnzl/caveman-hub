import { useEffect, useState } from 'react';

import { useApp } from '@/context/AppContext';
import { useReviewRows } from '@/components/review/useReviewRows';
import { useSemanasDeRevision } from '@/components/review/useSemanasDeRevision';
import { LineaDeTiempo } from './LineaDeTiempo';

/**
 * LA PESTAÑA «TEMPORADA» (26 sep 2026): la línea de tiempo del cliente, con
 * su gráfica y su calendario, el inspector, las intervenciones y su
 * historial. Vivió en Revisiones detrás de un conmutador; ahora es una
 * pestaña, y Revisiones vuelve a ser sus tiras.
 *
 * Pide las entregas y las revisiones como la portada de Revisiones: sin ellas
 * no se sabe el estado de ninguna semana, y la línea espera a tenerlas.
 *
 * `?semana=<lunes>` abre con esa semana en foco (`temporadaPath`).
 */
export const PaginaDeTemporada = () => {
  const { activeClient } = useApp();
  const { rows: revisiones, checkIns: entregas, cargando } = useReviewRows(activeClient?.id, { conEnlaces: false });
  const { plan, estados } = useSemanasDeRevision({ revisiones, entregas });
  /* Cargada una vez, se queda montada: `recargar` (al guardar una revisión)
     vuelve a poner `cargando`, y desmontarla perdía el zoom y el inspector. */
  const [lista, setLista] = useState(null);
  useEffect(() => {
    if (!cargando && activeClient?.id) setLista(activeClient.id);
  }, [cargando, activeClient?.id]);

  if (!activeClient) return null;

  return (
    <div className="revision-pagina cascada temporada-pagina" aria-busy={cargando || undefined}>
      {lista === activeClient.id && <LineaDeTiempo plan={plan} estados={estados} />}
    </div>
  );
};
