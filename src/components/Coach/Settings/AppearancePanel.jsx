import { Moon, Palette, Sun } from 'lucide-react';

import { useTheme } from '@/lib/useTheme.jsx';
import { Panel, SectionTitle } from '@/components/ui/primitives';

const OPTIONS = [
  { id: 'light', label: 'Claro', icon: Sun, hint: 'Para trabajar de día y para imprimir' },
  { id: 'dark', label: 'Oscuro', icon: Moon, hint: 'Menos fatiga con poca luz' },
];

/**
 * Apariencia.
 *
 * ── Por qué el tema también vive aquí ───────────────────────────────────────
 * El interruptor de la cabecera se queda: cambiar de tema es algo que se hace al
 * vuelo, según la luz de la habitación, y enterrarlo tres clics dentro sería
 * peor. Pero un ajuste que SOLO existe como un icono sin etiqueta en una esquina
 * es un ajuste que la mitad de la gente no encuentra nunca.
 *
 * Aquí se ve con su nombre, su explicación y una vista previa de lo que hace,
 * que es lo que convierte «ese icono de luna» en «el tema de la aplicación».
 */
export const AppearancePanel = () => {
  const { theme, setTheme } = useTheme();

  return (
    <Panel className="col gap-4">
      <SectionTitle icon={Palette} color="var(--data-violet)">
        Apariencia
      </SectionTitle>

      <div className="col gap-2">
        <span className="section-label">Tema</span>
        <div className="theme-choice">
          {OPTIONS.map(({ id, label, icon: Icon, hint }) => (
            <button
              key={id}
              type="button"
              className="theme-option"
              aria-pressed={theme === id}
              onClick={() => setTheme(id)}
            >
              {/* Vista previa: el mismo dibujo en los dos temas, para que se elija
                  viendo el resultado y no leyendo la palabra. */}
              <span className={`theme-preview is-${id}`} aria-hidden="true">
                <span className="bar" />
                <span className="bar is-short" />
                <span className="dot" />
              </span>
              <span className="row gap-2">
                <Icon size={15} />
                <strong>{label}</strong>
              </span>
              <span className="t-xs t-tertiary">{hint}</span>
            </button>
          ))}
        </div>
        <p className="t-xs t-tertiary">
          El tema se guarda en este dispositivo. Sigue estando también en el icono de la cabecera,
          para cambiarlo al vuelo sin entrar aquí.
        </p>
      </div>
    </Panel>
  );
};
