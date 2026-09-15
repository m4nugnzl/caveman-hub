import { Link } from 'react-router-dom';

/**
 * LAS PIEZAS DEL PORTAL EN EL TELÉFONO — el vocabulario de «La app del cliente».
 *
 * El traje está en `styles/portal-telefono.css`, con el porqué de cada decisión.
 * Aquí solo está la forma, y son pocas: la tarjeta, el renglón con su marca, el
 * trío de cifras, el récord, el titulillo y el pedido.
 *
 * ── La pieza que define el producto: `Marca` ───────────────────────────────
 * Donde Hevy, Strong, Coachway y Efort ponen la miniatura del ejercicio, aquí
 * va la cifra de tu última serie y la línea de tus ocho últimas sesiones. No es
 * una preferencia estética: está medido. De los 246 ejercicios que tiene la
 * demo entre catálogo y propios, TRES podrían llevar miniatura —el 1,2 %—,
 * porque `catalog_exercises` no tiene columna de vídeo. Una columna de huecos
 * es peor que no tener fotos.
 *
 * Y la cifra, a diferencia de la foto, está siempre después del primer
 * entrenamiento, no depende de un tercero, no puede estar equivocada y es
 * distinta en la pantalla de cada persona.
 */

/* ── Los cuatro iconos de la barra del pulgar ──────────────────────────────
   Dibujados aquí y no traídos de `lucide` porque son los del prototipo, con su
   grosor de trazo y su caja: la casa, la barra, el plato con su tapa y la
   persona. Son los únicos iconos de todo el teléfono. */
const svgProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
};

export const IconoHoy = () => (
  <svg {...svgProps}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5.5 9.5V20h13V9.5" />
  </svg>
);
export const IconoEntreno = () => (
  <svg {...svgProps}>
    <path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10" />
  </svg>
);
export const IconoComer = () => (
  <svg {...svgProps}>
    <path d="M3 13h18a9 9 0 0 1-18 0Z" />
    <path d="M12 4v2M8.5 5.2l.8 1.6M15.5 5.2l-.8 1.6" />
    <path d="M2 20h20" />
  </svg>
);
export const IconoTu = () => (
  <svg {...svgProps}>
    <circle cx="12" cy="8" r="3.6" />
    <path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" />
  </svg>
);

/**
 * La cabecera: la fecha grande y un DATO debajo, nunca una definición.
 *
 * ── Aquí había un disco con tus iniciales, y se fue el 14 sep ─────────────
 * Iba arriba a la derecha en «Hoy» y en «Tú», en verde, y no se podía pulsar.
 * El dueño: *«darle a su icono de arriba a la derecha no hace nada, además no sé
 * por qué están en verde las letras»*. Las dos cosas eran ciertas y no tenían
 * arreglo bueno:
 *
 *   · Era un `span`. Lo único a lo que podría llevar —tu cuenta— es el cuarto
 *     destino de la barra del pulgar, que está a la vista en todas las
 *     pantallas; en «Tú» habría sido un enlace a la pantalla en la que ya
 *     estás, junto a tu propio nombre escrito en grande.
 *   · Y el verde es `--positive`, que en toda la aplicación significa «hecho» o
 *     «va bien». Un disco de identidad no juzga nada: era color por categoría,
 *     que es lo que prohíbe la ley del color.
 *
 * Un adorno que no se puede pulsar y que tiñe sin decir nada. Regla de Chanel.
 */
export const CabeceraDia = ({ fecha, donde }) => (
  <div className="tel-cabecera-dia">
    <div className="tel-fecha">{fecha}</div>
    {donde ? <div className="tel-donde">{donde}</div> : null}
  </div>
);

export const Tarjeta = ({ plana, lista, corta, className = '', children }) => (
  <div
    className={[
      'tel-tarjeta',
      plana ? 'tel-plana' : '',
      lista ? 'tel-lista' : '',
      corta ? 'tel-corta' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ')}
  >
    {children}
  </div>
);

export const Titulillo = ({ children, accion }) => (
  <div className="tel-titulillo">
    <span>{children}</span>
    {accion || null}
  </div>
);

/**
 * LA MARCA. La cifra de tu última serie, y nada más.
 *
 * ── Aquí hubo una chispa, y se cayó el 14 sep ─────────────────────────────
 * Llevaba al lado una polilínea de 46×17 px con los kilos de las ocho últimas
 * sesiones. La idea era ocupar el sitio donde Hevy y Strong ponen la miniatura
 * del ejercicio; el dueño la vio montada y la tumbó: *«no me gustan las mini
 * gráficas de cada ejercicio como miniatura»*.
 *
 * Y tenía razón por debajo de la estética: en 46 px con un rango normalizado
 * al propio tramo, subir de 60 a 62,5 kg dibuja la misma cuesta que subir de 60
 * a 100. Una línea que no se puede leer no informa, decora — y peor, sugiere
 * una tendencia que puede no existir. La tendencia de verdad se mira entera en
 * la ficha del ejercicio, a un toque de aquí.
 */
export const Marca = ({ cifra }) => (
  <span className="tel-marca">
    <span className={`tel-kg${cifra ? '' : ' tel-nada'}`}>{cifra || 'sin marca'}</span>
    <span className="tel-flecha">›</span>
  </span>
);

/** El renglón de un ejercicio: su nombre, su pauta y tu marca. */
export const Renglon = ({ nombre, pauta, cifra, onClick }) => (
  <button type="button" className="tel-renglon" onClick={onClick}>
    <span>
      <span className="tel-nom">{nombre}</span>
      {pauta ? <span className="tel-pauta">{pauta}</span> : null}
    </span>
    <Marca cifra={cifra} />
  </button>
);

/** Las tres cifras del día. Cada una es una puerta. */
export const Trio = ({ items }) => (
  <div className="tel-trio">
    {items.map((c) => {
      const dentro = (
        <>
          <div className="tel-k">{c.k}</div>
          <div className="tel-v">
            {c.v}
            {c.u ? <small> {c.u}</small> : null}
          </div>
          {c.parte != null ? (
            <div className="tel-barrita">
              <i style={{ width: `${Math.max(0, Math.min(100, c.parte))}%` }} />
            </div>
          ) : null}
        </>
      );
      return c.to ? (
        <Link key={c.k} to={c.to}>
          {dentro}
        </Link>
      ) : (
        <button type="button" key={c.k} onClick={c.onClick}>
          {dentro}
        </button>
      );
    })}
  </div>
);

/**
 * EL RÉCORD. Las tres cifras que hacen que la app valga sin entrenador.
 *
 * Es el registro —lo que no caduca cuando se acaba el bloque o se acaba el
 * entrenador— hablando. Iba sobre grafito para que se distinguiera de todo lo
 * demás; se quitó el 14 sep por orden del dueño y lo que lo distingue ahora es
 * la forma: tres cifras centradas con su filete entre medias son una tabla, y
 * no hay otra en la portada. Ver `portal-telefono.css`.
 */
export const Record = ({ items }) => (
  <div className="tel-record">
    {items.map((c) => (
      <div key={c.k}>
        <div className="tel-v">{c.v}</div>
        <div className="tel-k">{c.k}</div>
      </div>
    ))}
  </div>
);

/** Lo que te han pedido. Solo cuando lo hay: en reposo no está. */
export const Pedido = ({ que, cual, verbo = 'Abrir', to, onClick }) => {
  const dentro = (
    <>
      <span>
        <span className="tel-q">{que}</span>
        {cual ? <span className="tel-c">{cual}</span> : null}
      </span>
      <span className="tel-ir">{verbo}</span>
    </>
  );
  return to ? (
    <Link className="tel-pedido" to={to}>
      {dentro}
    </Link>
  ) : (
    <button type="button" className="tel-pedido" onClick={onClick}>
      {dentro}
    </button>
  );
};

/**
 * LO QUE VIENE DE SU ENTRENADOR: una novedad o algo que te ha mandado.
 *
 * ── Por qué no es `Pedido` con una bandera ─────────────────────────────────
 * Porque una novedad se puede DESCARTAR, y el aspa tiene que ser hermana del
 * enlace: un botón dentro de un enlace no es HTML válido y no se puede pulsar
 * sin abrir lo de detrás. Así que la fila deja de ser el enlace y pasa a ser el
 * marco que junta las dos cosas.
 *
 * Y las dos clases de recado se pintan con esta misma pieza —con aspa la
 * novedad, sin ella lo mandado— para que la lista sea una lista: con dos piezas
 * distintas, el filete de abajo (`:last-of-type`) caía a mitad del grupo.
 *
 * Lo mandado no lleva aspa por lo mismo que los pendientes de «Te han pedido»:
 * no es un aviso de algo que ha pasado, es algo que falta por hacer, y
 * desaparece solo al hacerlo.
 */
export const Aviso = ({ que, cual, to, verbo, onQuitar, etiqueta }) => {
  const dicho = (
    <>
      <span className="tel-q">{que}</span>
      {cual ? <span className="tel-c">{cual}</span> : null}
    </>
  );
  return (
    <div className="tel-pedido tel-aviso">
      {to ? (
        <Link className="tel-dicho" to={to}>
          {dicho}
        </Link>
      ) : (
        <span className="tel-dicho">{dicho}</span>
      )}
      <span className="tel-fin">
        {/* El verbo solo si hay a dónde ir: un aviso del entrenador es una
            frase, y «Abrir» delante de ella prometería una pantalla que no
            existe. */}
        {to ? <span className="tel-ir">{verbo || 'Abrir'}</span> : null}
        {onQuitar ? (
          <button type="button" className="tel-aspa" aria-label={etiqueta} onClick={onQuitar}>
            <svg {...svgProps} width="16" height="16">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        ) : null}
      </span>
    </div>
  );
};

/** La regla de la sesión: un tramo por ejercicio. */
export const Regla = ({ tramos, suelta }) => (
  <div className={`tel-regla${suelta ? ' tel-suelta' : ''}`}>
    {tramos.map((t, i) => (
      <i key={i} className={t === 1 ? 'tel-hecha' : t > 0 ? 'tel-parcial' : undefined} />
    ))}
  </div>
);

/** La fila del menú de «Tú». Nunca lleva galón si trae un valor: uno de los dos. */
export const FilaMenu = ({ rotulo, valor, espera, to, onClick }) => {
  const dentro = (
    <>
      <span>{rotulo}</span>
      {valor ? (
        <span className={`tel-val${espera ? ' tel-espera' : ''}`}>{valor}</span>
      ) : (
        <span className="tel-flecha">›</span>
      )}
    </>
  );
  return to ? (
    <Link className="tel-fila-menu" to={to}>
      {dentro}
    </Link>
  ) : (
    <button type="button" className="tel-fila-menu" onClick={onClick}>
      {dentro}
    </button>
  );
};

export const Boton = ({ callado, to, onClick, children, ...resto }) => {
  const clase = `tel-boton${callado ? ' tel-callado' : ''}`;
  return to ? (
    <Link className={clase} to={to} {...resto}>
      {children}
    </Link>
  ) : (
    <button type="button" className={clase} onClick={onClick} {...resto}>
      {children}
    </button>
  );
};

/** El aire del final, para que el último renglón no se pegue a la barra. */
export const Aire = () => <div className="tel-aire" />;
