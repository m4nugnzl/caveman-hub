import { useMemo, useRef, useState } from 'react';
import { Check, Plus } from 'lucide-react';

import { useCapaFlotante } from '@/lib/useCapaFlotante';
import { useClickOutside } from '@/lib/useClickOutside';
import { useDismissable } from '@/lib/useDismissable';
import { TAGS_SUGERIDAS, TAG_LIMITS } from '@/domain/portfolio';
import { tonoDe } from '@/components/ui/Avatar';

/**
 * El desplegable de etiquetas: el vocabulario del entrenador, a un clic.
 *
 * ══ Por qué existe ══════════════════════════════════════════════════════════
 *
 * Las etiquetas estaban en la cartera pero no se OFRECÍAN. El único gesto para
 * ponerlas era un «+» a `opacity: 0` que solo aparecía al pasar el ratón por la
 * fila, y lo que abría era un campo de texto en blanco: para volver a poner
 * «Presencial» —una etiqueta que ya existía en otras seis fichas— había que
 * acordarse de cómo se escribió y teclearla otra vez, con la caja exacta o
 * salía una etiqueta nueva casi igual. Una clasificación que se re-teclea cada
 * vez deja de ser un vocabulario y se convierte en un cajón de erratas.
 *
 * La referencia es el selector de «Tags» de Coachway: un control siempre
 * visible en la celda, y dentro un buscador con las etiquetas que ya usas
 * marcadas. Crear una nueva sigue siendo posible —el vocabulario es del
 * entrenador, no un catálogo nuestro— pero es lo último, no lo único.
 *
 * ══ La misma pieza para poner y para filtrar ════════════════════════════════
 *
 * En la fila marca las de UNA persona; en la barra de filtros elige por cuál se
 * mira la cartera. Es la misma lista con el mismo orden y los mismos discos de
 * color, así que la etiqueta que se acaba de crear se reconoce al instante
 * arriba. Sin `onCrear` no se crea nada: el filtro no inventa vocabulario.
 *
 * @param vocabulario  `[[etiqueta, cuántos]]`, ya ordenado por quien lo recoge.
 * @param activas      Las marcadas (las de la persona, o la del filtro puesto).
 * @param onAlternar   Poner o quitar. Recibe la etiqueta.
 * @param onCrear      Dar de alta una nueva, o `null` para no ofrecerlo.
 * @param tope         Cuántas admite el destino (`TAG_LIMITS.max` en la fila).
 */
export const SelectorEtiquetas = ({
  vocabulario = [],
  activas = [],
  onAlternar,
  onCrear = null,
  tope = null,
  clase = 'chip',
  contenido,
  ariaLabel,
  titulo = null,
  alineado = 'izquierda',
  cierraAlElegir = true,
}) => {
  const [abierto, setAbierto] = useState(false);
  const [busca, setBusca] = useState('');
  const ref = useRef(null);
  const cerrar = () => {
    setAbierto(false);
    setBusca('');
  };
  useClickOutside(ref, cerrar, abierto);
  const panel = useDismissable(abierto);
  const capa = useCapaFlotante(panel.mounted, ref, panel.ref, { alineado });

  const termino = busca.trim();
  const lista = useMemo(() => {
    const t = termino.toLowerCase();
    return t ? vocabulario.filter(([tag]) => tag.toLowerCase().includes(t)) : vocabulario;
  }, [vocabulario, termino]);

  /* Las sugeridas: solo donde se PUEDE crear (la fila, no el filtro), solo las
     que aún no están en su vocabulario, y filtradas por lo que escriba. Se
     ofrecen siempre y no solo con la cartera recién estrenada: quien ya usa
     tres sigue sin tener que teclear la cuarta. */
  const sugeridas = useMemo(() => {
    if (!onCrear) return [];
    const t = termino.toLowerCase();
    const suyas = new Set(vocabulario.map(([tag]) => tag.toLowerCase()));
    return TAGS_SUGERIDAS.filter(
      (tag) => !suyas.has(tag.toLowerCase()) && (!t || tag.toLowerCase().includes(t))
    );
  }, [onCrear, vocabulario, termino]);

  /* Crear solo lo que no existe ya: con el nombre exacto de una que está en la
     lista —suya o sugerida—, el gesto correcto es marcarla, no duplicarla con
     otra caja. */
  const existe =
    vocabulario.some(([tag]) => tag.toLowerCase() === termino.toLowerCase()) ||
    sugeridas.some((tag) => tag.toLowerCase() === termino.toLowerCase());
  const puedeCrear = Boolean(onCrear) && termino.length > 0 && !existe;
  /* El tope es del destino, no del vocabulario: con las cinco puestas se pueden
     seguir QUITANDO, así que el desplegable sigue abriéndose. */
  const lleno = tope !== null && activas.length >= tope;

  /* Poner o quitar una. En la FILA se cierra al elegir —clasificar a alguien es
     un gesto y con el panel abierto tapaba la fila que se acaba de tocar—; en
     el FILTRO no, porque acotar por dos etiquetas seguidas es una sola
     pregunta y volver a abrir el desplegable entre una y otra la parte en dos.
     La búsqueda sí se limpia: lo escrito era para encontrar la anterior. */
  const alternar = (tag) => {
    onAlternar(tag);
    if (cierraAlElegir) cerrar();
    else setBusca('');
  };

  return (
    <span ref={ref} className="selector-etiquetas">
      <button
        type="button"
        className={clase}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-label={ariaLabel}
        title={titulo || ariaLabel}
        onClick={() => setAbierto((v) => !v)}
      >
        {contenido}
      </button>

      {panel.mounted && (
        <div
          ref={panel.ref}
          className={`popover${alineado === 'derecha' ? ' popover-right' : ''} selector-etiquetas-panel`}
          style={capa.estilo}
          {...capa.atributos}
          data-state={panel.closing ? 'closing' : 'open'}
        >
          <form
            className="selector-etiquetas-busca"
            onSubmit={(e) => {
              e.preventDefault();
              /* Intro hace lo evidente y en el orden en que se lee: la primera
                 de las suyas, si no la primera sugerida, y si no hay ninguna
                 la crea. Escribir el nombre entero y tener que ir a buscar el
                 ratón sería el paso de más. */
              if (lista.length > 0) alternar(lista[0][0]);
              else if (sugeridas.length > 0 && !lleno) {
                onCrear(sugeridas[0]);
                cerrar();
              } else if (puedeCrear && !lleno) {
                onCrear(termino);
                cerrar();
              }
            }}
          >
            <input
              className="input input-sm"
              value={busca}
              maxLength={TAG_LIMITS.len}
              autoFocus
              placeholder={onCrear ? 'Buscar o crear…' : 'Buscar…'}
              aria-label="Buscar una etiqueta"
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') cerrar();
              }}
            />
          </form>

          <div className="selector-etiquetas-lista" role="listbox" aria-label="Etiquetas">
            {lista.map(([tag, n]) => {
              const puesta = activas.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  role="option"
                  aria-selected={puesta}
                  className={`menu-item${puesta ? ' is-on' : ''}`}
                  /* Con el tope alcanzado solo se puede QUITAR: poner una sexta
                     no haría nada y un ítem que no hace nada es una trampa. */
                  disabled={lleno && !puesta}
                  onClick={() => alternar(tag)}
                >
                  <span className="selector-etiquetas-marca">
                    {puesta && <Check size={13} aria-hidden="true" />}
                  </span>
                  <span className="tag-disco" data-tono={tonoDe(tag)} aria-hidden="true" />
                  <span className="selector-etiquetas-nombre">{tag}</span>
                  <span className="t-xs t-tertiary">{n}</span>
                </button>
              );
            })}

            {/* Las sugeridas, debajo y rotuladas: se distinguen de las suyas
                sin dejar de estar a un clic. Poner una es CREARLA —pasa a su
                vocabulario como cualquier otra— así que van con el mismo
                disco de color que tendrán después. */}
            {sugeridas.length > 0 && (
              <>
                <span className="selector-etiquetas-rotulo">
                  {vocabulario.length === 0 ? 'Para empezar' : 'Sugeridas'}
                </span>
                {sugeridas.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    role="option"
                    aria-selected={false}
                    className="menu-item"
                    disabled={lleno}
                    onClick={() => {
                      onCrear(tag);
                      cerrar();
                    }}
                  >
                    <span className="selector-etiquetas-marca" />
                    <span className="tag-disco" data-tono={tonoDe(tag)} aria-hidden="true" />
                    <span className="selector-etiquetas-nombre">{tag}</span>
                  </button>
                ))}
              </>
            )}

            {lista.length === 0 && sugeridas.length === 0 && !puedeCrear && (
              <span className="selector-etiquetas-vacio t-xs t-tertiary">
                {vocabulario.length === 0
                  ? 'Todavía no usas ninguna etiqueta.'
                  : 'Ninguna coincide.'}
              </span>
            )}
          </div>

          {puedeCrear && (
            <button
              type="button"
              className="menu-item selector-etiquetas-crear"
              disabled={lleno}
              onClick={() => {
                onCrear(termino);
                cerrar();
              }}
            >
              {/* «Nueva etiqueta», no «Crear»: dar de alta una pieza se dice
                  igual en toda la casa. Ver `docs/producto.md` §5.8. */}
              <Plus size={15} aria-hidden="true" /> Nueva etiqueta «{termino}»
            </button>
          )}

          {lleno && (
            <span className="selector-etiquetas-vacio t-xs t-tertiary">
              Son {TAG_LIMITS.max} como mucho: quita una para poner otra.
            </span>
          )}
        </div>
      )}
    </span>
  );
};
