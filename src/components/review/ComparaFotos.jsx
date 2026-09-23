import { useMemo, useRef, useState } from 'react';

import { useApp } from '@/context/AppContext';
import { useToast } from '@/components/ui/ToastProvider';
import { useCapaFlotante } from '@/lib/useCapaFlotante';
import { useClickOutside } from '@/lib/useClickOutside';
import { useDismissable } from '@/lib/useDismissable';
import { addDays, localeNumber } from '@/lib/dates';
import { phaseAt } from '@/domain/roadmap';
import {
  angleLabel,
  lateralesAntiguas,
  mediaDeLaSemana,
  rejillaDeFotos,
  semanasParaComparar,
  weekFromStart,
  weekStartOfProgramWeek,
} from '@/domain/photos';
import { Thumb } from '@/components/photos/Thumb';
import { Gallery } from '@/components/photos/Gallery';

/**
 * CÓMO SE VE: los cuatro ángulos de dos semanas a la vez (22 sep 2026).
 *
 * ══ Qué sustituye ══════════════════════════════════════════════════════════
 * Un ángulo cada vez, con fotos de 180 px en una tarjeta de 1.200, y alrededor
 * más interfaz que foto: pestañas de ángulo, rótulos debajo, chips de semana y
 * una frase de ayuda. Ahora hay una cabecera —las dos semanas, sus medias y lo
 * que se ha movido— y debajo las cuatro parejas Antes | Ahora, siempre en ese
 * orden. La semana y el peso van dentro de cada foto.
 *
 * ── Qué dos semanas ─────────────────────────────────────────────────────────
 * Por defecto, el inicio de la fase contra ahora (`semanasParaComparar`): una
 * semana contra la anterior casi nunca enseña nada en una foto. Pulsar una de
 * las dos semanas de la cabecera abre sus casillas, como en la portada, con dos
 * atajos arriba —inicio de la fase e inicio—. Cambia las cuatro parejas a la vez.
 *
 * ── Los huecos ──────────────────────────────────────────────────────────────
 * Una semana sin un ángulo deja su hueco con «Sin foto»: la cabecera promete dos
 * semanas y una pareja que tirase de una tercera la desmentiría. La lateral
 * antigua sin lado no se empareja con un lado que no se sabe (`rejillaDeFotos`);
 * se ofrece declarar su lado, una vez por cliente, en una línea bajo la rejilla.
 *
 * @param groups    `groupByWeek`, de la más reciente a la más antigua.
 * @param semana    la semana de programa que se revisa.
 * @param history   pesajes, para la media de cada semana.
 * @param startDate el alta del cliente: de ella salen los números de semana.
 * @param phases    sus fases, para el atajo «Inicio de la fase».
 * @param clientId  a quién se le declara el lado de las laterales antiguas.
 */

const kg = (v) => localeNumber(v, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const semanasDe = (n) => `${n} ${n === 1 ? 'semana' : 'semanas'}`;
const LADO = { izquierdo: 'izquierdo', derecho: 'derecho' };

/* ── El selector de semana: sus casillas, agrupadas por fase ─────────────── */
const ElegirSemana = ({ lado, semana, otra, grupos, atajos, media, onElegir }) => {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setAbierto(false), abierto);
  const capa = useDismissable(abierto);
  const flotante = useCapaFlotante(capa.mounted, ref, capa.ref, { alineado: 'izquierda' });
  const valor = media(semana);

  const elegir = (w) => {
    setAbierto(false);
    onElegir(w);
  };

  return (
    <div ref={ref} className="fotos-elegir">
      <button
        type="button"
        className="fotos-semana"
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-label={`${lado === 'antes' ? 'Antes' : 'Ahora'}: semana ${semana}. Cambiar de semana`}
        onClick={() => setAbierto((v) => !v)}
      >
        <b>S{semana}</b>
        <span>{valor === null ? 'sin peso' : `${kg(valor)} kg`}</span>
      </button>

      {capa.mounted && (
        <div
          ref={capa.ref}
          className="popover fotos-capa"
          style={flotante.estilo}
          {...flotante.atributos}
          data-state={capa.closing ? 'closing' : 'open'}
          role="dialog"
          aria-label={lado === 'antes' ? 'Elegir la semana de antes' : 'Elegir la semana de ahora'}
        >
          {atajos && (
            <div className="fotos-atajos">
              {[
                ['Inicio de la fase', atajos.inicioDeFase],
                ['Inicio', atajos.inicio],
              ].map(([nombre, w]) => (
                <button
                  key={nombre}
                  type="button"
                  className="chip"
                  aria-pressed={w !== null && w === semana}
                  disabled={w === null}
                  title={w === null ? 'No hay fotos de antes de ahora' : undefined}
                  onClick={() => elegir(w)}
                >
                  {nombre}
                  {w !== null && <span className="t-tertiary"> · S{w}</span>}
                </button>
              ))}
            </div>
          )}

          {grupos.map((g) => (
            <div className="fotos-capa-fase" key={g.clave}>
              {g.titulo && <span className="fotos-capa-titulo">{g.titulo}</span>}
              <div className="tira-casillas fotos-casillas">
                {g.semanas.map((w) => {
                  const m = media(w);
                  return (
                    <button
                      key={w}
                      type="button"
                      className={`casilla is-compacta${w === semana ? ' is-elegida' : ''}`}
                      aria-pressed={w === semana}
                      disabled={w === otra}
                      aria-label={`Semana ${w}${m === null ? '' : `, media ${kg(m)} kg`}`}
                      onClick={() => elegir(w)}
                    >
                      <span className="casilla-cab">
                        <b className="casilla-n">S{w}</b>
                      </span>
                      <span className="casilla-kg">{m === null ? '—' : kg(m)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ── Una foto de la pareja, o su hueco ────────────────────────────────────── */
const Lado = ({ foto, semana, peso, sinLado, angulo, cual }) => {
  const pie = (
    <span className="fotos-pie">
      <b>S{semana}</b>
      {peso !== null && ` · ${kg(peso)}`}
    </span>
  );
  /* El hueco lleva su semana y no su peso: el peso es de la semana, pero al
     lado de «Sin foto» se lee como el de una foto que no está. */
  if (!foto?.url) {
    return (
      <span className={`fotos-foto is-hueco${sinLado ? ' is-sin-lado' : ''}`}>
        <span className="fotos-hueco">{sinLado ? 'Lateral sin lado' : foto ? '' : 'Sin foto'}</span>
        <span className="fotos-pie">
          <b>S{semana}</b>
        </span>
      </span>
    );
  }
  return (
    <span className="fotos-foto">
      <Thumb url={foto.url} alt={`${angleLabel(angulo)}, ${cual} (semana ${semana})`} width={480} />
      {pie}
    </span>
  );
};

export const ComparaFotos = ({ groups = [], semana, history = [], startDate = null, phases = [], clientId }) => {
  const { declararLadoAntiguo } = useApp();
  const toast = useToast();
  const [eleccion, setEleccion] = useState({ semana: null, antes: null, ahora: null });
  const [visor, setVisor] = useState(null);
  const [guardando, setGuardando] = useState(false);
  /* La elección caduca al cambiar de semana, sin efecto que la limpie. */
  const suya = eleccion.semana === semana ? eleccion : { semana, antes: null, ahora: null };

  const conFoto = useMemo(() => groups.filter((g) => g.week !== null && g.photos?.length), [groups]);
  const semanas = useMemo(() => conFoto.map((g) => g.week).sort((a, b) => a - b), [conFoto]);
  const todas = useMemo(() => conFoto.flatMap((g) => g.photos), [conFoto]);
  const laterales = useMemo(() => lateralesAntiguas(todas), [todas]);
  const medias = useMemo(
    () => new Map(semanas.map((w) => [w, mediaDeLaSemana(history, startDate, w)])),
    [semanas, history, startDate]
  );
  const media = (w) => medias.get(w) ?? null;

  /* La fase de una semana es la que cubre su JUEVES, como en la portada. */
  const faseDe = (w) => {
    const lunes = weekStartOfProgramWeek(startDate, w);
    return lunes ? phaseAt(phases, addDays(lunes, 3)) : null;
  };
  const inicioDeSuFase = (w) => {
    const fase = faseDe(w);
    return fase?.startsOn ? weekFromStart(startDate, fase.startsOn) : null;
  };

  const ahora = semanas.includes(suya.ahora) ? suya.ahora : semanasParaComparar({ semanas, semana }).ahora;
  const atajos = semanasParaComparar({ semanas, semana: ahora, inicioFase: ahora === null ? null : inicioDeSuFase(ahora) });
  let antes = semanas.includes(suya.antes) && suya.antes !== ahora ? suya.antes : atajos.antes;
  let despues = ahora;
  /* Elegidas al revés, la más antigua pasa sola a la izquierda. */
  if (antes !== null && antes > despues) [antes, despues] = [despues, antes];

  const fotosDe = (w) => conFoto.find((g) => g.week === w)?.photos || [];
  const celdas = rejillaDeFotos({ antes: antes === null ? [] : fotosDe(antes), ahora: fotosDe(despues) });

  /* Las casillas del selector, por fase y en orden. */
  const grupos = [];
  for (const w of semanas) {
    const fase = faseDe(w);
    const clave = fase?.id ?? 'sin-fase';
    const ultimo = grupos[grupos.length - 1];
    if (ultimo?.clave === clave) ultimo.semanas.push(w);
    else grupos.push({ clave, titulo: fase?.title || (phases.length ? 'Sin fase' : null), semanas: [w] });
  }

  if (despues === null) return null;

  const pA = antes === null ? null : media(antes);
  const pB = media(despues);
  const delta = pA !== null && pB !== null ? Math.round((pB - pA) * 10) / 10 : null;
  const sinFotosEsta = semana !== null && !semanas.includes(semana);

  const elegir = (lado) => (w) =>
    setEleccion({ semana, antes: lado === 'antes' ? w : antes, ahora: lado === 'ahora' ? w : despues });

  /* ── Lo que va al visor: las parejas con alguna foto, en el orden de la rejilla */
  const pie = (cual, w) => `${cual} · S${w}${media(w) === null ? '' : ` · ${kg(media(w))} kg`}`;
  const abribles = celdas.filter((c) => c.antes?.url || c.ahora?.url);
  const items = abribles.map((c) => {
    const nombre = c.id === 'lateral' ? 'Lateral sin lado' : angleLabel(c.id);
    if (c.antes?.url && c.ahora?.url) {
      return {
        id: c.id,
        caption: `${nombre} · S${antes} contra S${despues}`,
        cortinilla: {
          antes: { url: c.antes.url, pie: pie('Antes', antes) },
          ahora: { url: c.ahora.url, pie: pie('Ahora', despues) },
        },
      };
    }
    const sola = c.ahora?.url ? c.ahora : c.antes;
    const w = c.ahora?.url ? despues : antes;
    const falta = c.ahora?.url ? antes : despues;
    return {
      id: c.id,
      url: sola.url,
      caption: `${nombre} · S${w}${falta === null ? '' : ` · sin foto de S${falta}`}`,
    };
  });

  /* ── Las laterales antiguas: ¿hace falta decir algo? ─────────────────────── */
  const haySinLado = celdas.some((c) => c.id === 'lateral' || c.antesSinLado || c.ahoraSinLado);
  const usaDeclarada = celdas.some((c) =>
    [c.antes, c.ahora].some((f) => f?.angle === 'lateral' && f.lado)
  );
  const declarar = async (lado) => {
    setGuardando(true);
    const previo = laterales.lado;
    const r = await declararLadoAntiguo(clientId, lado);
    setGuardando(false);
    if (!r.ok) {
      toast({ text: `No se guardó el lado: ${r.error}. Vuelve a intentarlo.` });
      return;
    }
    toast({
      text: lado ? `Laterales antiguas: lado ${LADO[lado]}.` : 'Laterales antiguas, otra vez sin lado.',
      action: { label: 'Deshacer', onClick: () => declararLadoAntiguo(clientId, previo) },
    });
  };

  return (
    <div className="fotos">
      <div className="fotos-cabecera">
        <span className="section-label">Cómo se ve</span>
        <div className="fotos-semanas">
          {antes !== null && (
            <>
              <ElegirSemana
                lado="antes"
                semana={antes}
                otra={despues}
                grupos={grupos}
                atajos={atajos}
                media={media}
                onElegir={elegir('antes')}
              />
              <span className="fotos-flecha" aria-hidden="true">→</span>
            </>
          )}
          <ElegirSemana
            lado="ahora"
            semana={despues}
            otra={antes}
            grupos={grupos}
            atajos={null}
            media={media}
            onElegir={elegir('ahora')}
          />
          {antes !== null && (
            <span className="fotos-delta">
              {delta === null ? (
                `en ${semanasDe(despues - antes)}`
              ) : (
                <>
                  <b>{`${delta > 0 ? '+' : delta < 0 ? '−' : '±'}${kg(Math.abs(delta))} kg`}</b>
                  {` en ${semanasDe(despues - antes)}`}
                </>
              )}
            </span>
          )}
          {antes === null && <span className="fotos-delta">su primera semana con fotos</span>}
        </div>
        {sinFotosEsta && <span className="t-xs t-tertiary">S{semana} sin fotos</span>}
      </div>

      <div className="fotos-rejilla">
        {celdas.map((c, i) => {
          const nombre = c.id === 'lateral' ? 'Lateral sin lado' : angleLabel(c.id);
          const indice = abribles.indexOf(c);
          const par = (
            <>
              {antes !== null && (
                <Lado foto={c.antes} semana={antes} peso={pA} sinLado={c.antesSinLado} angulo={c.id} cual="antes" />
              )}
              <Lado foto={c.ahora} semana={despues} peso={pB} sinLado={c.ahoraSinLado} angulo={c.id} cual="ahora" />
            </>
          );
          return (
            <figure className="fotos-celda" key={c.id}>
              <figcaption className="fotos-angulo">
                {nombre}
                <span className="fotos-n">
                  {i + 1} de {celdas.length}
                </span>
              </figcaption>
              {indice >= 0 ? (
                <button
                  type="button"
                  className={`fotos-par${antes === null ? ' is-sola' : ''}`}
                  aria-label={`${nombre}: ver a pantalla completa`}
                  onClick={() => setVisor(indice)}
                >
                  {par}
                </button>
              ) : (
                <div className={`fotos-par${antes === null ? ' is-sola' : ''}`}>{par}</div>
              )}
            </figure>
          );
        })}
      </div>

      {/* El lado de las laterales antiguas: una decisión por cliente, en una
          línea y donde se ve la falta. Con lados mezclados no se ofrece: se dice. */}
      {laterales.mezcladas && (haySinLado || usaDeclarada) ? (
        <p className="fotos-lado">
          Sus laterales antiguas están marcadas de los dos lados. Revísalas una a una en sus fotos antes
          de compararlas.
        </p>
      ) : haySinLado && laterales.sinLado > 0 ? (
        <p className="fotos-lado">
          <span>
            {laterales.sinLado === 1
              ? 'Su lateral antigua no tiene lado. Es del lado'
              : `Sus ${laterales.sinLado} laterales antiguas no tienen lado. Son del lado`}
          </span>
          <button type="button" className="chip" disabled={guardando} onClick={() => declarar('izquierdo')}>
            Izquierdo
          </button>
          <button type="button" className="chip" disabled={guardando} onClick={() => declarar('derecho')}>
            Derecho
          </button>
        </p>
      ) : usaDeclarada && laterales.lado ? (
        <p className="fotos-lado">
          <span>Laterales antiguas, declaradas del lado {LADO[laterales.lado]}.</span>
          <button
            type="button"
            className="cab-accion"
            disabled={guardando}
            onClick={() => declarar(laterales.lado === 'izquierdo' ? 'derecho' : 'izquierdo')}
          >
            Son del {laterales.lado === 'izquierdo' ? 'derecho' : 'izquierdo'}
          </button>
          <button type="button" className="cab-accion" disabled={guardando} onClick={() => declarar(null)}>
            Quitar el lado
          </button>
        </p>
      ) : null}

      {visor !== null && items[visor] && (
        <Gallery items={items} index={visor} onIndex={setVisor} onClose={() => setVisor(null)} />
      )}
    </div>
  );
};
