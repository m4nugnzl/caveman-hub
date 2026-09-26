import { useRef, useState } from 'react';

import { useApp } from '@/context/AppContext';
import { useAtajoDeDeshacer } from '@/lib/useAtajoDeDeshacer';
import { useToast } from '@/components/ui/ToastProvider';
import { usePasosDelPlan } from './usePasosDelPlan';

/**
 * LOS GESTOS DEL PLAN: hacer, apuntar y decirlo, con Deshacer (26 sep 2026).
 *
 * Era el corazón del creador del plan (`CreadorDelPlan`) y ahora lo comparte
 * con la línea de tiempo de la Temporada, que edita las mismas fases, el mismo
 * destino y el mismo punto de decisión. Una sola forma de deshacer un cambio
 * del plan, se haga donde se haga.
 *
 *   · `gesto({ texto, hacer, deshacer, rehacer? })` lo hace; si sale bien, lo
 *     apunta en la pila con su inverso y lo anuncia con «Deshacer».
 *   · `gesto.apuntado(paso)`: para los formularios que ya guardan por su
 *     cuenta y solo necesitan apuntar lo hecho.
 *   · ⌘Z / ⌘⇧Z (y Ctrl+Y) mientras la pantalla está montada, fuera de los
 *     campos de texto (`useAtajoDeDeshacer`).
 *
 * ── El motivo (letra d, 26 sep 2026) ───────────────────────────────────────
 *   · `gesto({ ..., conMotivo: true })`: el aviso dice «Deshacer · Añadir
 *     motivo», y el segundo abre una línea en el propio aviso. Es para los
 *     gestos sin ventana (un arrastre); las ventanas llevan su «¿Por qué?».
 *   · `gesto.anotar(texto)`: el motivo escrito en una ventana, para el último
 *     paso. Las dos formas acaban en la nota de la versión del plan
 *     (`anotarCambioDelPlan`).
 *   · El motivo va con su paso: deshacerlo lo quita de la nota de la versión
 *     en la que se escribió, y rehacerlo lo vuelve a poner en la versión que
 *     deja el rehacer.
 *
 * @returns `{ gesto, pasos, ocupado, deshacerConAviso, rehacerConAviso, error, setError }`.
 */
export const useGestosDelPlan = () => {
  const toast = useToast();
  const { activeClient, anotarCambioDelPlan, quitarMotivoDelPlan } = useApp();
  const [error, setError] = useState('');
  const { pasos, apuntar, deshacer, rehacer, ocupado } = usePasosDelPlan();
  const atajos = useAtajoDeDeshacer();
  const ultimo = useRef(null);

  /* Anota el motivo y lo apunta en el paso (`paso.motivos`), con la versión
     en la que quedó. Solo si este paso lo añadió: un motivo repetido en la
     misma versión ya era de otro paso. */
  const anotarEn = async (paso, texto) => {
    const r = await anotarCambioDelPlan(activeClient?.id, texto);
    if (r.ok && r.anadido && paso) paso.motivos = [...(paso.motivos || []), { texto: texto.trim(), versionId: r.versionId }];
    return r;
  };
  const anotar = (texto) => anotarEn(ultimo.current, texto);

  const rehacerConAviso = async () => {
    const r = await rehacer();
    if (!r.ok) {
      if (!r.nada) setError(r.error || 'No se ha podido rehacer.');
      return;
    }
    toast({ text: 'Rehecho.' });
    const motivos = r.paso.motivos || [];
    r.paso.motivos = [];
    for (const m of motivos) {
      const a = await anotarEn(r.paso, m.texto);
      if (!a.ok) setError(`Rehecho, pero el motivo «${m.texto}» no ha vuelto a la nota: ${a.error}`);
    }
  };
  const deshacerConAviso = async () => {
    const r = await deshacer();
    if (!r.ok) {
      if (!r.nada) setError(r.error || 'No se ha podido deshacer.');
      return;
    }
    toast({ text: 'Deshecho el último cambio del plan.', action: { label: 'Rehacer', onClick: rehacerConAviso } });
    for (const m of r.paso.motivos || []) {
      const q = await quitarMotivoDelPlan(m.versionId, m.texto);
      if (!q.ok) setError(`Deshecho, pero el motivo «${m.texto}» sigue en la nota de la versión: ${q.error}`);
    }
  };
  atajos.current = {
    deshacer: pasos.atras > 0 && !ocupado ? deshacerConAviso : null,
    rehacer: pasos.adelante > 0 && !ocupado ? rehacerConAviso : null,
  };

  const avisar = (paso, conMotivo = false) =>
    toast({
      text: paso.texto,
      actions: [
        { label: 'Deshacer', onClick: deshacerConAviso },
        ...(conMotivo
          ? [
              {
                label: 'Añadir motivo',
                pide: { etiqueta: '¿Por qué?', placeholder: 'Solo lo ves tú', onGuardar: (texto) => anotarEn(paso, texto) },
              },
            ]
          : []),
      ],
    });

  const apuntarYAvisar = (paso, conMotivo) => {
    ultimo.current = paso;
    apuntar(paso);
    avisar(paso, conMotivo);
  };

  /** Hace un gesto que se puede deshacer: lo ejecuta, lo apunta y lo dice. */
  const gesto = async ({ texto, hacer, deshacer: inverso, rehacer: otraVez, conMotivo = false }) => {
    setError('');
    let res;
    try {
      res = (await hacer()) || { ok: true };
    } catch (e) {
      res = { ok: false, error: e?.message || 'No se ha podido.' };
    }
    if (!res.ok) {
      setError(res.error || 'No se ha podido.');
      return res;
    }
    apuntarYAvisar({ texto, deshacer: inverso, rehacer: otraVez || hacer }, conMotivo);
    return res;
  };
  gesto.anotar = anotar;
  gesto.apuntado = (paso) => apuntarYAvisar(paso, false);

  return { gesto, pasos, ocupado, deshacerConAviso, rehacerConAviso, error, setError };
};
