import { useCallback, useEffect, useState } from 'react';

import { useActions } from '@/context/AppContext';
import { reviewHistory } from '@/domain/reviews';

/**
 * El historial de revisiones de un cliente, cargado UNA vez por pantalla.
 *
 * ══ Por qué es un gancho y no la carga del panel que lo enseña ══════════════
 *
 * Porque lo pedía la misma pantalla dos veces. `ClientWeek` bajaba el historial
 * de check-ins para saber qué semanas se le quedaron sin entregar, y el
 * `ReviewHistory` que lleva dentro lo volvía a bajar por su cuenta para pintar
 * las revisiones anteriores: dos consultas idénticas seguidas, en el portal del
 * cliente, que es justo donde se abre con datos móviles.
 *
 * Y ahora hace falta una tercera lectura de lo mismo: «Su semana» necesita la
 * foto del plan de la ÚLTIMA revisión cerrada para poder decir qué le has
 * cambiado desde entonces. Con la carga dentro del panel eso era imposible sin
 * pedirlo otra vez.
 *
 * Así que carga quien es dueño de la pantalla, y el panel pasa a recibir las
 * filas ya hechas. `recargar` viaja con ellas porque enlazar un vídeo o corregir
 * una nota cambia lo que hay que volver a leer, y quien lo hace es el panel.
 *
 * ── Qué devuelve, y por qué las dos cosas ───────────────────────────────────
 * `rows` son las revisiones CERRADAS con sus cambios y su vídeo (`reviewHistory`).
 * `checkIns` es la lista cruda, que incluye las que están sin contestar: eso es
 * lo que necesita el cliente para saber qué semanas puede entregar todavía.
 */
export const useReviewRows = (clientId) => {
  const { loadCheckInHistory, listReviewLinks } = useActions();
  const [checkIns, setCheckIns] = useState([]);
  const [rows, setRows] = useState([]);
  const [cargando, setCargando] = useState(true);

  const recargar = useCallback(async () => {
    if (!clientId) {
      setCheckIns([]);
      setRows([]);
      setCargando(false);
      return;
    }

    const [historial, enlaces] = await Promise.all([
      loadCheckInHistory(clientId),
      listReviewLinks(clientId),
    ]);

    setCheckIns(historial.checkIns || []);
    setRows(reviewHistory({ checkIns: historial.checkIns || [], links: enlaces.links || [] }));
    setCargando(false);
  }, [clientId, loadCheckInHistory, listReviewLinks]);

  useEffect(() => {
    setCargando(true);
    recargar();
  }, [recargar]);

  return { rows, checkIns, cargando, recargar };
};
