import { ExternalLink, PlayCircle } from 'lucide-react';

import { clientIntake, intakeDeliverables } from '@/domain/intake';
import { Panel, SectionTitle } from '@/components/ui/primitives';

/**
 * Lo que el entrenador le ha dejado al cliente al darle de alta.
 *
 * ══ Por qué esto existe ═════════════════════════════════════════════════════
 *
 * Los pasos del alta eran casillas privadas del entrenador: «onboarding: hecho».
 * Pero el onboarding de verdad es un vídeo explicando cómo va todo, y ese vídeo
 * viajaba por WhatsApp — donde a las dos semanas está enterrado bajo cien
 * mensajes y no se vuelve a encontrar.
 *
 * Aquí queda puesto. El entrenador pega el enlace una vez en la ficha y al
 * cliente le aparece siempre en el mismo sitio, que es la diferencia entre
 * mandar algo y entregarlo.
 *
 * ── Por qué un enlace y no el vídeo dentro ──────────────────────────────────
 * Porque incrustar reproductores de terceros significa cargar su código en la
 * página, y con él sus cookies y su rastreo, en una aplicación que guarda el peso
 * y las fotos del cuerpo de esta persona. Un enlace que se abre en otra pestaña
 * entrega lo mismo sin meter a nadie más dentro.
 */
export const IntakeDeliverables = ({ client }) => {
  const items = intakeDeliverables(clientIntake(client?.preferences));
  if (items.length === 0) return null;

  return (
    <Panel className="col gap-3">
      <SectionTitle icon={PlayCircle}>De tu entrenador</SectionTitle>
      <p className="t-sm t-secondary">
        Lo que te dejó preparado al empezar. Está aquí siempre, no hace falta que lo busques.
      </p>

      <div className="col gap-2">
        {items.map((step) => (
          <a
            key={step.id}
            className="card-inset row between wrap gap-2"
            href={step.url}
            target="_blank"
            rel="noreferrer noopener"
          >
            <span className="col gap-1" style={{ minWidth: 0 }}>
              <span className="t-sm" style={{ fontWeight: 600 }}>
                {step.label}
              </span>
              {step.hint && <span className="t-2xs t-tertiary">{step.hint}</span>}
            </span>
            <span className="row gap-1 shrink-0 t-xs" style={{ color: 'var(--data-blue)', fontWeight: 600 }}>
              Abrir <ExternalLink size={12} />
            </span>
          </a>
        ))}
      </div>
    </Panel>
  );
};
