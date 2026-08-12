import { useState } from 'react';

/**
 * Logotipo de un servicio externo.
 *
 * ── Por qué se carga de un archivo y no se dibuja ───────────────────────────
 * Se intentó dibujar la marca de Notion a mano en SVG, dos veces, y las dos veces
 * el resultado «no era el logo de Notion». Y no lo iba a ser: un logotipo es una
 * pieza de arte concreta con proporciones y grosores medidos, no una forma que se
 * aproxima de memoria. Aproximarlo es peor que no ponerlo, porque parece el de
 * verdad y no lo es.
 *
 * Así que se carga el archivo OFICIAL desde `public/brands/<id>.svg`, que es donde
 * hay que dejar el que publica cada servicio en su página de marca. Si el archivo
 * no está, se dibuja un monograma neutro —la inicial— que se ve claramente como un
 * marcador de posición y no pretende ser el logotipo de nadie.
 *
 * ── Por qué sobre un azulejo claro fijo ─────────────────────────────────────
 * Estas marcas tienen colores propios que no negocian con el tema: el negro de
 * Notion sobre fondo oscuro se pierde, y teñirlo para que «encaje» deja de ser su
 * logotipo. Van sobre su propio fondo claro, como una pegatina, y así se reconocen
 * igual en tema claro y en oscuro.
 */
const FALLBACK_TINT = {
  notion: 'var(--text)',
  stripe: 'var(--data-violet)',
};

export const BrandMark = ({ brand, name, size = 28, tile = true }) => {
  const [missing, setMissing] = useState(false);

  const art = missing ? (
    <span
      className="brand-monogram"
      style={{ width: size, height: size, color: FALLBACK_TINT[brand] || 'var(--text-secondary)' }}
      aria-hidden="true"
    >
      {String(name || brand || '?')[0]?.toUpperCase()}
    </span>
  ) : (
    <img
      src={`/brands/${brand}.svg`}
      alt=""
      width={size}
      height={size}
      onError={() => setMissing(true)}
      style={{ display: 'block', width: size, height: size, objectFit: 'contain' }}
    />
  );

  if (!tile) return art;

  return (
    <span className="brand-tile" style={{ width: size + 16, height: size + 16 }}>
      {art}
    </span>
  );
};
