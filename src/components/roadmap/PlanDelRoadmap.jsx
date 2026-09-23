import { useState } from 'react';
import { Route } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useApp } from '@/context/AppContext';
import { semanaPath } from '@/routes';
import { Modal } from '@/components/ui/Modal';
import { MandoTab, MandoTabs } from '@/components/ui/Mando';
import { RoadmapPanel } from './RoadmapPanel';
import { VistaDeTemporada } from './VistaDeTemporada';

/**
 * EL PLAN, EN SU VENTANA, EN DOS PESTAÑAS.
 *
 *   · **Temporada** (con la que abre) — la temporada entera dibujada: las
 *     fases, el peso contra lo esperado, el cruce, los hechos y la escalera de
 *     kcal, con zoom Temporada / Fase. Se lee; pulsar una semana lleva a su
 *     revisión. Ver `VistaDeTemporada`.
 *   · **Plan** — la herramienta: fases con su hilo, el cruce con su pregunta,
 *     el destino y el peso objetivo. Ver `RoadmapPanel`.
 *
 * Abre por Temporada porque casi siempre se entra a MIRAR: «¿cómo va esto?» es
 * la pregunta de cada día y «cambiar la fase» es la de cada mes. El orden de
 * las pestañas es el orden de las dos preguntas.
 *
 * Se abre desde la tarjeta del roadmap del Resumen y desde el botón «El plan»
 * de la portada de Revisiones.
 *
 * ── El lado del cliente no tiene pestañas ──────────────────────────────────
 * Porque no tiene a dónde ir: las revisiones son del entrenador. El cliente ve
 * su plan y ya; su temporada la cuenta `Client/TuRoadmap`.
 */
export const PlanDelRoadmap = ({ onClose, audience = 'coach' }) => {
  const { activeClient } = useApp();
  const navigate = useNavigate();
  const [pestana, setPestana] = useState('temporada');
  const esCliente = audience === 'client';

  /* Pulsar una semana es irse de aquí: se cierra la ventana y se abre esa
     revisión. Dejarla abierta encima de la pantalla a la que acaba de llevar
     sería una capa tapando lo que fuiste a ver. */
  const irASemana = (lunes) => {
    onClose?.();
    if (activeClient) navigate(semanaPath(activeClient.id, lunes));
  };

  return (
    <Modal open size="lg" icono={Route} title={esCliente ? 'Tu plan' : 'El plan'} onClose={onClose}>
      {esCliente ? (
        <RoadmapPanel audience={audience} />
      ) : (
        <div className="stack">
          <MandoTabs label="Qué del plan">
            <MandoTab on={pestana === 'temporada'} onClick={() => setPestana('temporada')}>
              Temporada
            </MandoTab>
            <MandoTab on={pestana === 'plan'} onClick={() => setPestana('plan')}>
              Plan
            </MandoTab>
          </MandoTabs>
          {pestana === 'temporada' ? <VistaDeTemporada onIrASemana={irASemana} /> : <RoadmapPanel audience={audience} />}
        </div>
      )}
    </Modal>
  );
};
