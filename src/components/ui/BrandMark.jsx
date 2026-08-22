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
 *
 * ══ Dos clases de logotipo, y no se colocan igual ═══════════════════════════
 *
 * Al traer los archivos oficiales se vio que no son la misma pieza:
 *
 *   · Notion y Google publican un GLIFO sobre transparente. Necesitan el fondo
 *     claro debajo —el negro de Notion sobre hierro no se ve— y aire alrededor,
 *     que es el azulejo de siempre.
 *   · Stripe publica un ICONO DE APLICACIÓN: la ese blanca sobre su cuadrado
 *     morado, con sus propias esquinas redondeadas. Metido en el azulejo con su
 *     margen quedaba un cuadrado redondeado dentro de otro cuadrado redondeado
 *     —dos radios distintos a 42 px, que es el aspecto de un logotipo pegado en
 *     vez de puesto—.
 *
 * Los que traen su fondo llenan el azulejo hasta el canto y el azulejo se limita
 * a recortarlos con SU radio. Va por lista y no por detección: no se puede
 * adivinar desde un `<img>` si el archivo tiene fondo propio.
 */
const CON_FONDO_PROPIO = new Set(['stripe']);

const FALLBACK_TINT = {
  notion: 'var(--text)',
  stripe: 'var(--data-violet)',
  google: 'var(--text)',
};

export const BrandMark = ({ brand, name, size = 28, tile = true }) => {
  const [missing, setMissing] = useState(false);
  /* Si el archivo falta, el monograma es un glifo y quiere su azulejo con aire,
     tenga o no fondo propio el logotipo que debería estar ahí. */
  const bleed = !missing && CON_FONDO_PROPIO.has(brand);

  const art = missing ? (
    <span
      className="brand-monogram"
      style={{ width: size, height: size, color: FALLBACK_TINT[brand] || 'var(--text-secondary)' }}
      aria-hidden="true"
    >
      {String(name || brand || '?')[0]?.toUpperCase()}
    </span>
  ) : (
    /* Con fondo propio el logotipo mide el azulejo ENTERO (el lado más sus dos
       márgenes) en vez de medir el hueco de dentro; sin azulejo, mide lo que le
       pidan y no hay nada que llenar. */
    <img
      src={`/brands/${brand}.svg`}
      alt=""
      width={bleed && tile ? size + 16 : size}
      height={bleed && tile ? size + 16 : size}
      onError={() => setMissing(true)}
      style={{
        display: 'block',
        width: bleed && tile ? '100%' : size,
        height: bleed && tile ? '100%' : size,
        objectFit: bleed ? 'cover' : 'contain',
      }}
    />
  );

  if (!tile) return art;

  return (
    <span
      className={`brand-tile${bleed ? ' is-bleed' : ''}`}
      style={{ width: size + 16, height: size + 16 }}
    >
      {art}
    </span>
  );
};
