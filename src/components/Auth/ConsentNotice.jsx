import { Camera, Eye, Ruler, Trash2 } from 'lucide-react';

/**
 * Qué se guarda del cliente, quién lo ve y qué puede hacer al respecto.
 *
 * ══ Por qué existe ═════════════════════════════════════════════════════════
 *
 * La aplicación guarda peso, perímetros, pliegues y fotos del cuerpo: datos de
 * salud, la categoría especial del artículo 9 del RGPD. Tratarlos exige
 * consentimiento explícito e informado, y «informado» significa que la persona
 * sepa ANTES de aceptar qué se guarda, quién lo mira y para qué.
 *
 * ══ El texto y su versión viven en el mismo archivo, a propósito ═══════════
 *
 * `CONSENT_VERSION` es lo que se archiva en `client_consents` como prueba. Si la
 * versión estuviera en otro sitio, el día que alguien retoque una frase se
 * quedaría igual y la prueba pasaría a señalar un texto que ya no es el que se
 * enseñó. Al estar juntos, cambiar el texto sin subir la versión es un descuido
 * que se ve leyendo el propio archivo.
 *
 * **Al cambiar cualquier frase de aquí, sube la versión.**
 */
export const CONSENT_VERSION = '2026-08';

const POINTS = [
  {
    icon: Ruler,
    title: 'Qué se guarda',
    body: 'Tus entrenamientos, tu peso, tus medidas y pliegues, y tu plan de alimentación.',
  },
  {
    icon: Camera,
    title: 'Y tus fotos de progreso',
    body: 'Solo las que subas tú. Son fotos de tu cuerpo y se tratan como lo que son: un dato de salud.',
  },
  {
    icon: Eye,
    title: 'Quién lo ve',
    body: 'Tu entrenador, y quien lleve tu seguimiento si trabaja en equipo. Nadie más. No se comparte ni se vende a terceros.',
  },
  {
    icon: Trash2,
    title: 'Y lo que puedes pedir cuando quieras',
    body: 'Una copia de todo lo que hay sobre ti, o que se borre entero. Se lo pides a tu entrenador y lo hace desde aquí mismo.',
  },
];

/**
 * @param checked   Si la casilla está marcada.
 * @param onChange  Recibe el nuevo valor.
 *
 * La casilla llega SIN marcar y no hay forma de que llegue marcada: el
 * consentimiento tiene que ser un acto afirmativo de la persona, y una casilla
 * premarcada no lo es —es exactamente el ejemplo que el reglamento pone de lo que
 * no vale—.
 */
export const ConsentNotice = ({ checked, onChange }) => (
  <div className="col gap-4">
    <ul className="consent-list">
      {POINTS.map(({ icon: Icon, title, body }) => (
        <li key={title}>
          <span className="consent-icon" aria-hidden="true">
            <Icon size={15} />
          </span>
          <span className="col gap-1">
            <strong className="t-sm">{title}</strong>
            <span className="t-sm t-secondary">{body}</span>
          </span>
        </li>
      ))}
    </ul>

    <label className="checkbox-row">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="t-sm">
        Lo he leído y acepto que mi entrenador trate estos datos para programar y valorar mi
        progreso.
      </span>
    </label>

    {/*
      El enlace al texto completo no es un adorno: «informado» significa poder
      leerlo entero, no solo el resumen de arriba. Se abre en otra pestaña para no
      perder la invitación a medias.
    */}
    <a
      className="t-xs t-tertiary"
      href="/privacidad"
      target="_blank"
      rel="noreferrer"
      style={{ textAlign: 'center' }}
    >
      Leer la política de privacidad completa
    </a>
  </div>
);
