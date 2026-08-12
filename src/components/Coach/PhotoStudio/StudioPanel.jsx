import { Grid2x2, Pencil, SlidersHorizontal } from 'lucide-react';

import { isDerivedLayout } from '@/domain/photoLayout';
import { Panel } from '@/components/ui/primitives';

/**
 * Panel contextual del estudio: un trabajo a la vez.
 *
 * ══ Por qué existe ═════════════════════════════════════════════════════════
 *
 * La columna derecha eran TRES paneles apilados en 272 px:
 *
 *   · «Anotar» — herramientas, colores, el campo de texto;
 *   · «Semanas × ángulos» — qué entra en la matriz;
 *   · «Hueco seleccionado» — pestañas de hueco, siete deslizadores y cinco botones.
 *
 * Tres modelos mentales distintos, uno detrás de otro, en una columna estrecha. El
 * resultado medía más de mil píxeles de alto: lo de abajo quedaba fuera de la
 * pantalla y solo aparecía si descubrías que la columna se desliza. Es el mismo
 * fallo que ya había escondido tres de las seis herramientas y la opción «Espalda»
 * al subir fotos — apilar en vertical dentro de un carril con scroll oculto.
 *
 * Y era el sitio equivocado incluso con espacio: los tres no se usan a la vez.
 * Encuadrar, anotar y decidir qué fotos entran son tres momentos del trabajo, y
 * mostrar los tres siempre obliga a saltarse dos cada vez.
 *
 * ══ Cómo se reparte ════════════════════════════════════════════════════════
 *
 *   Ajustar → encuadre y luz del hueco activo. Es lo que se toca sin parar, así
 *             que es la pestaña por defecto.
 *   Anotar  → herramientas de dibujo. Un modo aparte de verdad: cambia lo que hace
 *             el ratón sobre el lienzo.
 *   Montar  → qué fotos entran y en qué hueco. Se decide al empezar y casi no se
 *             vuelve. En las composiciones derivadas —la matriz— es marcar semanas
 *             y ángulos; en las demás, asignar huecos.
 */

const TABS = [
  { id: 'adjust', label: 'Ajustar', icon: SlidersHorizontal, hint: 'Encuadre y luz del hueco activo' },
  { id: 'annotate', label: 'Anotar', icon: Pencil, hint: 'Reglas, líneas, flechas y texto' },
  { id: 'compose', label: 'Montar', icon: Grid2x2, hint: 'Qué fotos entran en el montaje' },
];

export const StudioPanel = ({ tab, onTab, layout, annotationCount, children }) => (
  <Panel tight className="col gap-4">
    <div className="studio-tabs" role="tablist" aria-label="Panel del estudio">
      {TABS.map(({ id, label, icon: Icon, hint }) => (
        <button
          key={id}
          type="button"
          role="tab"
          className="studio-tab"
          aria-selected={tab === id}
          onClick={() => onTab(id)}
          title={hint}
        >
          <Icon size={15} />
          <span>{label}</span>
          {/*
            Contador de anotaciones en su pestaña. Sin él, al volver a «Ajustar» no
            queda ninguna señal de que hay marcas puestas sobre el montaje, y se
            exporta con anotaciones que ya no se recordaban.
          */}
          {id === 'annotate' && annotationCount > 0 && (
            <span className="studio-tab-count">{annotationCount}</span>
          )}
          {/* En la matriz, «Montar» es donde se elige TODO lo que se ve: si no se
              toca, el lienzo está vacío y no hay ninguna pista de por qué. */}
          {id === 'compose' && isDerivedLayout(layout) && <span className="ev-dot is-warn" />}
        </button>
      ))}
    </div>

    {children}
  </Panel>
);
