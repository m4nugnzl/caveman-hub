import { Modal } from '@/components/ui/Modal';
import { RoadmapPanel } from '@/components/roadmap/RoadmapPanel';

/**
 * SUS FASES — el plan por tramos, entero y editable.
 *
 * ══ Por qué el roadmap se abre y no vive en la página ══════════════════════
 *
 * Porque es una HERRAMIENTA y el panel es una LECTURA. Planificar los próximos
 * tres meses —añadir un tramo, moverle el final, plantear un cruce— se hace un
 * día y se consulta muchos; tenerlo desplegado en la portada del cliente ponía
 * un formulario con sus botones al final de cada visita, y empujaba el resto del
 * panel medio metro hacia abajo.
 *
 * Lo que sí se consulta —en qué fase está, cuánto le queda y qué viene después—
 * se queda fuera, en el bloque de Objetivos, que es donde importa.
 *
 * El panel de dentro es el mismo de siempre y con sus mismos permisos: el
 * cliente lo ve y no lo toca, y eso lo garantiza RLS y no esta ventana.
 */
export const FasesPopup = ({ open, onClose, audience = 'coach' }) => (
  <Modal
    open={open}
    size="lg"
    title={audience === 'client' ? 'Tus fases' : 'Sus fases'}
    onClose={onClose}
  >
    <RoadmapPanel audience={audience} desnudo />
  </Modal>
);
