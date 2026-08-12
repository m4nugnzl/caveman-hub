import { Download, Tag } from 'lucide-react';

import { ASPECT_RATIOS, LAYOUTS } from '@/domain/photoLayout';

/**
 * Miniatura de la composición: la forma que va a tener el montaje.
 *
 * ── Por qué un dibujo y no la etiqueta sola ─────────────────────────────────
 * «Antes / Después», «Semanas × ángulos», «Rejilla libre» y «Deslizador» son cuatro
 * FORMAS, y elegir una leyendo cuatro nombres obliga a traducir cada palabra a la
 * figura que produce — traducción que hay que rehacer cada vez, porque los nombres
 * no se parecen a lo que hacen. Con la forma delante, la elección es inmediata y no
 * hace falta acordarse de nada.
 *
 * Se dibuja con divs y no con un icono de librería porque ninguna trae estas cuatro
 * figuras concretas, y porque así el dibujo es EL layout: si mañana se añade una
 * composición, su miniatura se describe aquí en una línea.
 *
 * La etiqueta se queda debajo: el dibujo distingue, el nombre confirma.
 */
const LayoutGlyph = ({ id }) => {
  if (id === 'slider') {
    // Una sola foto partida por el divisor, que es lo que el deslizador hace:
    // no son dos fotos al lado, es una encima de la otra con un corte móvil.
    return (
      <span className="lay-glyph is-slider" aria-hidden="true">
        <i />
      </span>
    );
  }

  // Las demás son cuadrículas: dos huecos, seis (3 semanas × 2 ángulos) o cuatro.
  const cells = id === 'pair' ? 2 : id === 'matrix' ? 6 : 4;
  return (
    <span className={`lay-glyph is-${id}`} aria-hidden="true">
      {Array.from({ length: cells }, (_, i) => (
        <i key={i} />
      ))}
    </span>
  );
};

/**
 * Barra superior del estudio: qué se está montando y cómo sale.
 *
 * ── Por qué esto va arriba y no en la columna lateral ───────────────────────
 * Antes todo estaba en un mismo panel de la derecha: la composición, la
 * proporción, el interruptor de los pies de foto, las herramientas de anotación,
 * los colores y el botón de descargar. Seis decisiones de tres naturalezas
 * distintas apiladas en una columna de 290 px.
 *
 * Las de esta barra son las que definen **el documento**: qué composición, qué
 * proporción de salida y descargarlo. Se toman una vez al empezar y otra al
 * acabar, así que van arriba y en horizontal, donde se leen de un barrido. Las de
 * la derecha son las que se tocan CONTINUAMENTE mientras trabajas —encuadrar,
 * anotar— y por eso se quedan al lado del lienzo.
 */
export const StudioBar = ({ state, onLayout, onRatio, onCaptions, onExport, exportDisabled, exportHint }) => (
  <div className="studio-bar">
    <div className="studio-bar-group">
      <span className="k">Composición</span>
      <div className="lay-picker" role="group" aria-label="Composición del montaje">
        {LAYOUTS.map((layout) => (
          <button
            key={layout.id}
            type="button"
            className="lay"
            aria-pressed={state.layout === layout.id}
            onClick={() => onLayout(layout.id)}
          >
            <LayoutGlyph id={layout.id} />
            <span className="lay-label">{layout.label}</span>
          </button>
        ))}
      </div>
    </div>

    <div className="studio-bar-group">
      <span className="k">Salida</span>
      <div className="row gap-2 wrap">
        <select
          className="select select-sm"
          value={state.ratio}
          onChange={(e) => onRatio(e.target.value)}
          aria-label="Proporción de salida"
        >
          {ASPECT_RATIOS.map((ratio) => (
            <option key={ratio.id} value={ratio.id}>
              {ratio.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="chip"
          aria-pressed={state.showCaptions}
          onClick={() => onCaptions(!state.showCaptions)}
          title="Escribir semana, fecha y peso sobre cada foto"
        >
          <Tag size={13} /> Pies de foto
        </button>
      </div>
    </div>

    <div className="studio-bar-end">
      <button type="button" className="btn btn-primary btn-sm" onClick={onExport} disabled={exportDisabled}>
        <Download size={15} /> Descargar PNG
      </button>
      {exportHint && <span className="t-xs t-tertiary">{exportHint}</span>}
    </div>
  </div>
);
