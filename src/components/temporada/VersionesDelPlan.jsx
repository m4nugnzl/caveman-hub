import { useState } from 'react';

import { cuandoDeLaVersion, versionesALaVista } from '@/domain/versionesDelPlan';
import { BotonAccion, Notice, useAccionDeBoton } from '@/components/ui/primitives';

/**
 * «VERSIONES» (letra f, 26 sep 2026): las fotos del plan (0140), de la más
 * nueva a la más antigua. Cada fila dice cuándo quedó así, quién lo dejó y su
 * nota; la de arriba es el plan de ahora y la de abajo, el original.
 *
 * Elegir una abre su ficha (`DeVersion`) y la dibuja como sombra sobre la
 * ruta y la banda esperada. Las mismas piezas que la lista de intervenciones.
 *
 * Sin pedirlo, se esconden las que no cambian nada visible respecto a la
 * anterior y no tienen nota (`versionesALaVista`); «Mostrar todas» las trae.
 *
 * @param versiones `versionDeFila(...)`, de la más nueva a la más antigua, o
 *                  `null` mientras se leen.
 * @param quienDe   `(v) => 'Tú' | nombre | 'Sin autor'`.
 */
export const ListaDeVersiones = ({ versiones, error, quienDe, onAbrir }) => {
  const [todas, setTodas] = useState(false);
  if (error) {
    return (
      <div className="tl-ins-cuerpo">
        <Notice tone="error">{error}</Notice>
      </div>
    );
  }
  if (!versiones) {
    return (
      <div className="tl-ins-cuerpo">
        <p className="tl-ins-nada">Leyendo las versiones…</p>
      </div>
    );
  }
  if (versiones.length === 0) {
    return (
      <div className="tl-ins-cuerpo">
        <p className="tl-ins-nada">Todavía no hay ninguna. Cada cambio del plan —una fase, el destino, el peso objetivo— deja una aquí.</p>
      </div>
    );
  }
  const { visibles, ocultas } = versionesALaVista(versiones);
  const lista = todas ? versiones : visibles;
  const ahora = versiones[0].id;
  const original = versiones[versiones.length - 1].id;
  return (
    <div className="tl-ins-cuerpo tl-hist">
      <ol className="tl-hist-lista">
        {lista.map((v) => (
          <li key={v.id}>
            <button type="button" className="tl-hist-item" onClick={() => onAbrir(v.id)}>
              <span className="tl-hist-l1">
                <span className="tl-hist-que tnum">
                  <b>{cuandoDeLaVersion(v)}</b>
                </span>
                <span className="tl-hist-estado">{v.id === ahora ? 'La de ahora' : v.id === original ? 'Original' : ''}</span>
              </span>
              <span className="tl-hist-l2 is-sin-punto">
                <span>{quienDe(v)}</span>
                <span className={v.nota ? 'tl-version-nota' : undefined}>{v.nota || 'Sin nota'}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
      {ocultas > 0 && (
        <button type="button" className="btn btn-plain btn-sm tl-version-todas" aria-expanded={todas} onClick={() => setTodas((t) => !t)}>
          {todas ? 'Esconder las que no cambian nada' : `Mostrar todas (${ocultas} ${ocultas === 1 ? 'oculta' : 'ocultas'})`}
        </button>
      )}
    </div>
  );
};

/**
 * La ficha de una versión: su nota, en qué se diferencia del plan de ahora
 * (`cambiosDeLaVersion`) y «Restaurar esta versión», que pregunta antes. La de
 * ahora no se restaura: ya lo es.
 */
export const DeVersion = ({ version, cambios, esLaDeAhora, onRestaurar }) => {
  const envio = useAccionDeBoton();
  return (
    <div className="tl-ins-cuerpo">
      {version.nota && <p className="tl-ins-texto">{version.nota}</p>}
      {esLaDeAhora ? (
        <p className="tl-ins-nada">Es el plan de ahora.</p>
      ) : cambios.length === 0 ? (
        <p className="tl-ins-nada">El mismo plan que el de ahora.</p>
      ) : (
        <>
          <p className="tl-ins-nada">A trazos en la gráfica: esta versión. Lo de ahora, entre paréntesis.</p>
          <ul className="tl-version-cambios">
            {cambios.map((c) => (
              <li key={c.id}>{c.texto}</li>
            ))}
          </ul>
        </>
      )}
      {onRestaurar && !esLaDeAhora && cambios.length > 0 && (
        <div className="tl-version-pie">
          <BotonAccion type="button" className="btn btn-secondary btn-sm" estado={envio.estado} onClick={() => envio.lanzar(onRestaurar)}>
            Restaurar esta versión
          </BotonAccion>
        </div>
      )}
    </div>
  );
};
