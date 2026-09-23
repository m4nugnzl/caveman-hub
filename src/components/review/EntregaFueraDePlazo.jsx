import { useMemo, useState } from 'react';

import { useApp } from '@/context/AppContext';
import { semanaDelRegistro } from '@/domain/anthropometry';
import { periodoQueEmpieza } from '@/domain/calendar';
import { angleLabel, photoWeek, weekStartOfProgramWeek } from '@/domain/photos';
import { DIAS_DE_REAPERTURA, anadidoDespues, estadoDeRevision } from '@/domain/revisionesPasadas';
import { addDays, shortDate, todayISO, weekdayName } from '@/lib/dates';
import { traduceDbError } from '@/lib/dbErrors';
import { Tarjeta } from '@/components/dashboard/Tarjeta';

/**
 * LA ENTREGA, CUANDO NO LLEGÓ A SU HORA — en la semana del entrenador.
 *
 * ══ Qué dice (23 sep 2026) ══════════════════════════════════════════════════
 *
 * Tres cosas, y solo las que tocan en esa semana. Si no toca ninguna, la
 * tarjeta no existe: una entrega a tiempo no necesita que nadie lo diga.
 *
 *   1. **Cómo llegó.** «Entregó el martes · 2 días tarde» si fue en la ventana
 *      de gracia; «Recuperada el 22 sept · 9 días después de su revisión» si
 *      el cliente volvió a completarla cuando ya se había cerrado. Las dos se
 *      distinguen a propósito: la primera es la costumbre de mucha gente, la
 *      segunda es una semana que estaba perdida.
 *   2. **Lo que llegó después.** Los pesajes, medidas y fotos de esa semana
 *      apuntados fuera de plazo o después de entregarla, con el día en que se
 *      apuntaron. La hora es la del servidor (0134), no la del teléfono.
 *   3. **Reabrirla.** Una semana sin entregar que ya salió de las cuatro de
 *      margen, el cliente no la puede completar solo. Abrírsela es decisión
 *      tuya, a mano y con fecha: siete días por defecto, y se puede cerrar
 *      antes. Sin avisos al cliente: la verá en sus semanas.
 *
 * No juzga: ni rojo ni «tarde» en mayúsculas. Es un dato para leer la semana.
 */
export const EntregaFueraDePlazo = ({ lunes, entregas, history, photos, recargar }) => {
  const { activeClient, reabrirRevision } = useApp();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState(null);

  const hoy = todayISO();
  const revision = useMemo(
    () =>
      activeClient
        ? estadoDeRevision({
            lunes,
            entregas,
            preferences: activeClient.preferences,
            startDate: activeClient.startDate,
            hoy,
          })
        : null,
    [activeClient, lunes, entregas, hoy]
  );

  const despues = useMemo(() => {
    if (!revision || !activeClient) return [];
    const siguiente = periodoQueEmpieza(activeClient.preferences, addDays(revision.lunes, revision.semanas * 7), hoy);
    return anadidoDespues({
      revision,
      history,
      fotos: photos.map((f) => {
        const n = photoWeek(f, activeClient.startDate);
        return { ...f, lunes: n && activeClient.startDate ? weekStartOfProgramWeek(activeClient.startDate, n) : null };
      }),
      finDeVentana: siguiente?.dueOn || null,
      semanaDe: semanaDelRegistro,
    });
  }, [revision, activeClient, history, photos, hoy]);

  if (!revision || !activeClient) return null;

  const { tarde } = revision;
  const sinEntregarPasada = revision.pasada && revision.estado === 'sin entregar';
  const reabierta = sinEntregarPasada && revision.reabiertaHasta;
  const fueraDePlazo = sinEntregarPasada && !revision.editable;

  if (!tarde && despues.length === 0 && !reabierta && !fueraDePlazo) return null;

  const reabrir = async (hasta) => {
    setOcupado(true);
    setError(null);
    const res = await reabrirRevision(activeClient.id, revision.lunes, hasta);
    setOcupado(false);
    if (!res.ok) setError(traduceDbError(res.error));
    else recargar();
  };

  const cuandoLlego = tarde
    ? tarde.tipo === 'gracia'
      ? `Entregó el ${weekdayName(tarde.el)} ${Number(tarde.el.slice(8, 10))} · ${tarde.dias} ${tarde.dias === 1 ? 'día' : 'días'} tarde`
      : `Recuperada el ${shortDate(tarde.el)} · ${tarde.dias} días después de su revisión`
    : null;

  const nombre = activeClient.name.split(/\s+/)[0];

  return (
    <Tarjeta rotulo="La entrega" span={12}>
      <div className="entrega-tarde">
        {cuandoLlego ? <p className="semana-linea">{cuandoLlego}</p> : null}

        {despues.length > 0 ? (
          <div className="entrega-tarde-parte">
            <h3 className="entrega-tarde-rotulo">Añadido después de su semana</h3>
            <dl className="semana-filas">
              {despues.map((x) => (
                <div key={x.id}>
                  <dt>
                    {x.que}
                    {x.del ? ` del ${shortDate(x.del)}` : x.angulo ? ` ${angleLabel(x.angulo).toLowerCase()}` : ''}
                  </dt>
                  <dd className="is-suave">
                    {x.porque === 'tras entregar' ? 'cambiado tras entregar' : 'apuntado'} el {shortDate(x.cuando)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}

        {reabierta ? (
          <div className="entrega-tarde-accion">
            <p className="semana-linea">
              Abierta para {nombre} hasta el {shortDate(revision.reabiertaHasta)}. La verá en sus semanas.
            </p>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => reabrir(null)} disabled={ocupado}>
              Cerrarla ya
            </button>
          </div>
        ) : fueraDePlazo ? (
          <div className="entrega-tarde-accion">
            <p className="semana-linea">
              Sin entregar y fuera de plazo: {nombre} ya no puede completarla.
            </p>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => reabrir(addDays(hoy, DIAS_DE_REAPERTURA))}
              disabled={ocupado}
            >
              Abrírsela {DIAS_DE_REAPERTURA} días
            </button>
          </div>
        ) : null}

        {error ? (
          <p className="semana-linea is-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Tarjeta>
  );
};
