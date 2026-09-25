import { ChevronLeft, ChevronRight, X } from 'lucide-react';

import { kindMeta, WEEKDAYS } from '@/domain/calendar';
import { directionById } from '@/domain/goals';
import { VALORACIONES } from '@/domain/intervenciones';
import { esIntervencion, gPorKg, pautaDeIntervencion } from '@/domain/pautaDelDia';
import { replanteoVigente, valorDelTramo } from '@/domain/roadmap';
import { sensacionesDeLaSemana, sensacionesDeLaSesion, textosDeLaSemana } from '@/domain/sensaciones';
import { variacionTexto } from '@/domain/rendimiento';
import { cardioCorto, llegadaTexto, ritmoTexto, tramoDeFechas } from '@/domain/semanasDelPlan';
import { PESAJES_FIRMES, pesajesTexto, tendenciaDelPeso } from '@/domain/tendenciaDelPeso';
import { addDays, daysBetween, localeNumber, shortDate } from '@/lib/dates';
import { Modal } from '@/components/ui/Modal';
import { HojaAMedias } from './HojaAMedias';
import {
  conSigno,
  diaTexto,
  entero,
  kg,
  nombreDeFase,
  nombreDeHecho,
  nombreDeIntervencion,
  pctSemana,
  ritmoDeFase,
  ritmoRealDeFase,
  semanasDeFase,
} from './lectura';
import {
  Barras,
  cambioEntero,
  cambioKg,
  Cifras,
  Columna,
  delAl,
  esNumero,
  hechoConFechas,
  macrosCortas,
  nombreCorto,
  Notas,
  notasDeHechos,
  Pildoras,
  Tarjetas,
  tramoCorto,
} from './PiezasDelInspector';
import { tintaDe, tintaDeIntervencion } from './series';
import { TarjetaDeImpacto } from './TarjetaDeImpacto';

const ESTADO = {
  revisada: 'Revisada',
  pendiente: 'Te toca revisarla',
  curso: 'En curso',
  sin: 'Sin check-in',
  futura: 'Prevista',
};

/* El de una intervención (`estadoDe`): en curso mientras la ventana de después no ha terminado. */
const ESTADO_DE_INTERVENCION = { prevista: 'Prevista', en_curso: 'En curso', hecha: 'Hecha' };

/** «3 sesiones de 35 min», «40 min» o el texto tal cual: el cardio, en palabras. */
const cardioEnPalabras = (texto) => {
  const c = cardioCorto(texto);
  if (!c) return null;
  const dosis = c.match(/^(\d+)×(\d+)′$/);
  if (dosis) return `${dosis[1]} ${dosis[1] === '1' ? 'sesión' : 'sesiones'} de ${dosis[2]} min`;
  const minutos = c.match(/^(\d+)′$/);
  return minutos ? `${minutos[1]} min` : c;
};

/** «sube 3 %», «baja 2 %»; `null` si no se movió. */
const variacionEnPalabras = (pct) => {
  const t = variacionTexto(pct);
  if (t.startsWith('±')) return null;
  return `${t.startsWith('−') ? 'baja' : 'sube'} ${t.slice(1)}`;
};

const g1 = (v) => localeNumber(v, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** «Lun 17». */
const diaCorto = (fecha) => `${WEEKDAYS[(new Date(`${fecha}T00:00:00Z`).getUTCDay() + 6) % 7]} ${Number(fecha.slice(8, 10))}`;

/** Las macros con sus g/kg, para el `title` de una tarjeta: el detalle que no cabe en su línea. */
const macrosConGkg = (x, peso) => {
  const m = macrosCortas(x);
  if (!m) return null;
  const gkg = [x.protein, x.carbs, x.fats].map((v) => gPorKg(v, peso));
  return gkg.every(esNumero) ? `${m} g · ${gkg.map(g1).join(' / ')} g/kg` : `${m} g`;
};

/** El tipo de día que más días pide: la «base» de la semana. */
const tipoBase = (tipos) => (tipos.length ? [...tipos].sort((a, b) => (b.dias ?? 0) - (a.dias ?? 0))[0] : null);

/**
 * La píldora de la sesión de un día: hecha (rellena), pendiente o prevista
 * (a trazos) o descanso (atenuada). `null` si no se sabe.
 */
const pildoraDeSesion = (dia, hoy) => {
  if (!dia) return null;
  if (dia.hechas?.length) return { texto: dia.hechas.map((x) => x.dayName || 'Entreno').join(' + '), forma: 'hecha', estado: 'hecha' };
  if (dia.pedida) return { texto: dia.pedida, forma: 'pendiente', estado: dia.fecha > hoy ? 'prevista' : 'pendiente' };
  if (dia.descanso) return { texto: 'Descanso', forma: 'descanso', estado: 'descanso' };
  return null;
};

/** La intervención (refeed, diet break) que cubre un día, si la hay. */
const intervencionDe = (hechos, fecha) => hechos.find((h) => esIntervencion(h) && h.date <= fecha && (h.hasta || h.date) >= fecha) || null;

/* ── Piezas de las fichas que no son semana ni día ─────────────────────── */

const Seccion = ({ titulo, ancho = false, children }) => (
  <section className={`tl-ins-seccion${ancho ? ' is-ancho' : ''}`}>
    <h4 className="tl-ins-rotulo">{titulo}</h4>
    {children}
  </section>
);

/** Un renglón: lo que es, y pegada a ello su cifra. */
const Fila = ({ nombre, valor = null, pie = null }) => (
  <li className="tl-ins-fila">
    <span className="tl-ins-fila-linea">
      <span className="tl-ins-nombre">{nombre}</span>
      {valor && <span className="tl-ins-valor tnum">{valor}</span>}
    </span>
    {pie && <span className="tl-ins-pie tnum">{pie}</span>}
  </li>
);

const Lista = ({ children }) => <ul className="tl-ins-lista">{children}</ul>;

/* ── La ficha de una semana ─────────────────────────────────────────────── */

/**
 * Franja 1 de una semana: peso, tendencia, kcal, pasos y entrenos. Cada
 * cambio es contra la semana anterior, que la cabecera nombra una vez
 * («contra S33»): aquí solo «baja 0,4 kg».
 */
const cifrasDeSemana = ({ s, anterior, ctx, entreno }) => {
  const futura = s.estado === 'futura';
  const p = s.pauta;
  const pa = anterior?.pauta || null;
  const cifras = [];

  if (futura) {
    cifras.push({
      id: 'peso',
      etiqueta: 'Peso esperado',
      valor: esNumero(s.esperado) ? kg(s.esperado) : null,
      unidad: 'kg',
      compara: s.fase ? nombreDeFase(s.fase) : 'Sin fase',
    });
  } else {
    cifras.push({
      id: 'peso',
      etiqueta: 'Peso medio',
      valor: esNumero(s.media) ? kg(s.media) : null,
      unidad: 'kg',
      compara: esNumero(s.media) && esNumero(anterior?.media) ? cambioKg(s.media - anterior.media) : s.pesajes.length ? null : 'Sin pesajes',
    });
  }

  /* La tendencia, sobre los pesajes de esta semana y la de antes: así el
     que se pesa una vez por semana también la tiene, sostenida por dos. */
  const t = futura
    ? null
    : tendenciaDelPeso([...(anterior?.pesajes || []), ...s.pesajes], { desde: addDays(s.lunes, -7), hasta: addDays(s.lunes, 6), hoy: ctx.hoy });
  const conTendencia = esNumero(t?.ritmo);
  cifras.push({
    id: 'tendencia',
    etiqueta: 'Tendencia',
    valor: conTendencia ? pctSemana(t.ritmo).replace(' %/sem', '') : null,
    unidad: '%/sem',
    debil: conTendencia && t.pesajes < PESAJES_FIRMES,
    compara: conTendencia ? pesajesTexto(t.pesajes) : null,
    nota: s.fase ? `objetivo ${ritmoDeFase(s.fase, s.lunes)}` : null,
  });

  /* Las kcal de la base: el tipo de día que más días pide. Las macros, al
     pasar por encima: en la tarjeta serían siglas. */
  const tipos = ctx.tiposDe(s.lunes);
  const tiposAntes = anterior ? ctx.tiposDe(anterior.lunes) : [];
  const base = tipoBase(tipos);
  const baseAntes = base ? tiposAntes.find((t) => t.n === base.n) || tipoBase(tiposAntes) : null;
  const kcal = p ? (base ? base.kcals : p.kcals) : null;
  const kcalAntes = pa ? (baseAntes ? baseAntes.kcals : pa.kcals) : null;
  const cambio = esNumero(kcal) && esNumero(kcalAntes) ? cambioEntero(kcal - kcalAntes, ' kcal') : null;
  const peso = s.media ?? anterior?.media ?? null;
  const otros = tipos.filter((t) => t !== base);
  cifras.push({
    id: 'kcal',
    etiqueta: tipos.length > 1 ? `Kcal del día ${base.n}` : 'Kcal',
    valor: esNumero(kcal) ? entero(kcal) : null,
    compara: p?.soloMedia ? 'media de la semana' : cambio,
    nota: otros.length ? `día ${otros.map((t) => `${t.n} ${entero(t.kcals)}`).join(', ')}` : null,
    title: (tipos.length ? tipos : p ? [p] : [])
      .map((t) => [t.n, macrosConGkg(t, peso)].filter(Boolean).join(': '))
      .filter(Boolean)
      .join('\n'),
  });

  /* Los pasos y, debajo, el cardio. */
  const pasos = tipos.length ? [...new Set(tipos.map((t) => t.steps).filter(esNumero))] : esNumero(p?.steps) ? [p.steps] : [];
  const uno = pasos.length === 1 ? pasos[0] : null;
  const cardio = cardioEnPalabras(p?.cardio);
  cifras.push({
    id: 'pasos',
    etiqueta: 'Pasos',
    valor: pasos.length ? (uno !== null ? entero(uno) : `${entero(Math.min(...pasos))} a ${entero(Math.max(...pasos))}`) : null,
    compara: uno !== null && esNumero(pa?.steps) ? cambioEntero(uno - pa.steps) : null,
    nota: cardio ? `cardio, ${cardio}` : pa?.cardio ? 'sin cardio' : null,
  });

  if (entreno) {
    const pedidos = entreno.pedidos;
    let valor = null;
    if (futura) valor = esNumero(pedidos) ? String(pedidos) : null;
    else if (esNumero(pedidos)) valor = `${entreno.hechas} de ${pedidos}`;
    else if (entreno.hechas > 0) valor = String(entreno.hechas);
    cifras.push({
      id: 'entrenos',
      etiqueta: futura ? 'Entrenos previstos' : 'Entrenos',
      valor,
      compara: (ctx.splitDe(s) || s.bloque?.nombre || '').replace(/ · /g, ', ') || null,
      title: ctx.splitDe(s),
    });
  }
  return cifras;
};

/** Franja 2 de una semana: sus siete días. */
const diasDeSemana = ({ s, ctx, entreno }) => {
  const pautas = ctx.diasDe(s.lunes);
  let previa = null;
  return Array.from({ length: 7 }, (_, i) => {
    const fecha = addDays(s.lunes, i);
    const p = pautas.find((d) => d.fecha === fecha) || null;
    const inter = p?.intervencion || intervencionDe(s.hechos || [], fecha);
    const pesaje = (s.pesajes || []).find((x) => x.date === fecha);
    /* La cifra, el primer día y cuando cambia; si no cambia, nada. También en
       un refeed o un diet break: su nombre va una vez, en la cabecera de la
       franja, y el color de la tarjeta dice qué días cubre. */
    let texto = null;
    if (inter) {
      const k = esNumero(p?.kcals) ? p.kcals : pautaDeIntervencion(inter, fecha).kcals;
      texto = k ? `${entero(k)} kcal` : kindMeta(inter.kind).label;
    } else if (esNumero(p?.kcals)) {
      texto = `${entero(p.kcals)} kcal${p.tipo ? `, día ${p.tipo}` : ''}`;
    }
    const linea = texto && texto === previa ? null : texto;
    previa = texto;
    const pildora = pildoraDeSesion(entreno?.dias?.find((d) => d.fecha === fecha), ctx.hoy);
    return {
      id: fecha,
      etiqueta: diaCorto(fecha),
      valor: pesaje ? kg(pesaje.weight) : null,
      lineas: linea ? [linea] : [],
      pildora,
      tinta: inter ? tintaDeIntervencion(inter) : null,
      actual: fecha === ctx.hoy,
      titulo: [diaTexto(fecha), pesaje ? `${kg(pesaje.weight)} kg` : 'Sin pesaje', texto, pildora ? `${pildora.texto}, ${pildora.estado}` : null]
        .filter(Boolean)
        .join('\n'),
      onElegir: () => ctx.elegir({ tipo: 'dia', fecha }),
    };
  });
};

const FichaDeSemana = ({ s, ctx }) => {
  const anterior = ctx.semanaDe(addDays(s.lunes, -7));
  const futura = s.estado === 'futura';
  const entreno = ctx.entrenoDe(s.lunes);

  /* Las sensaciones: su check-in contra el de antes y contra la media de su fase. */
  const entrega = ctx.entregaDe(s);
  const entregaAntes = anterior ? ctx.entregaDe(anterior) : null;
  const sensaciones = sensacionesDeLaSemana({
    preguntas: ctx.preguntasCheckin,
    answers: entrega?.answers || null,
    anteriores: entregaAntes && entregaAntes !== entrega ? entregaAntes.answers : null,
    deLaFase: ctx.entregasDeLaFase(s).map((e) => e.answers),
  });
  const nota = String(entrega?.coachNotes || '').trim();
  const notas = [
    ...(nota ? [{ id: 'nota', etiqueta: 'Tu nota', texto: nota }] : []),
    ...textosDeLaSemana({ preguntas: ctx.preguntasCheckin, answers: entrega?.answers || null }).map((t) => ({
      id: `t-${t.id}`,
      etiqueta: t.etiqueta,
      texto: t.texto,
    })),
    ...notasDeHechos(s.hechos || [], ctx.elegir),
    /* Los cambios de dieta y los bloques nuevos que empiezan esta semana: los
       refeeds y diet breaks ya van arriba, con los hechos. */
    ...ctx
      .intervencionesEntre(s.lunes, s.domingo)
      .filter((x) => !x.evento && x.desde >= s.lunes)
      .map((x) => ({
        id: x.id,
        etiqueta: `${nombreDeIntervencion(x)} ${delAl(x.desde)}`,
        punto: tintaDe(x),
        onAbrir: () => ctx.elegir({ tipo: 'intervencion', id: x.id }),
      })),
  ];
  const bloque = !futura ? ctx.bloqueDe(s) : null;
  /* Las referencias que se movieron desde que empezó el bloque: las que siguen igual no se escriben. */
  const movidas = (bloque?.referencias || []).filter((r) => variacionEnPalabras(r.pct));
  const conMedia = sensaciones.some((f) => esNumero(f.mediaFase));

  return (
    <div className="tl-ins-cuerpo">
      <Cifras cifras={cifrasDeSemana({ s, anterior, ctx, entreno })} />
      <Tarjetas
        tarjetas={diasDeSemana({ s, ctx, entreno })}
        rotulo="La semana día a día"
        cabecera={(s.hechos || []).filter(esIntervencion).map((h) => ({
          id: h.id || `${h.kind}-${h.date}`,
          texto: hechoConFechas(h),
          tinta: tintaDeIntervencion(h),
        }))}
      />
      <div className="tl-ins-contexto">
        {!futura && (
          <Columna titulo="Sensaciones del check-in" leyenda={conMedia ? 'media de la fase' : null} marca={conMedia}>
            {sensaciones.length > 0 ? (
              <Barras filas={sensaciones} />
            ) : (
              <p className="tl-ins-nada">{entrega ? 'Sin respuestas medibles en su check-in.' : 'Sin check-in esta semana.'}</p>
            )}
          </Columna>
        )}
        {bloque && (
          <Columna titulo={`Entreno, ${bloque.nombre}`}>
            <ul className="tl-ins-refs">
              <li>
                <span className="tl-ins-nombre">Series efectivas esta semana</span>
                <b className="tnum">{entero(bloque.efectivas)}</b>
              </li>
              {movidas.map((r) => (
                <li key={r.nombre} title={`De la semana del ${shortDate(r.desde)} a la del ${shortDate(r.hasta)}`}>
                  <span className="tl-ins-nombre">{r.nombre}</span>
                  <b className="tnum">{variacionEnPalabras(r.pct)}</b>
                </li>
              ))}
            </ul>
            {movidas.length > 0 && <p className="tl-ins-nada">Cada referencia, desde que empezó el bloque.</p>}
          </Columna>
        )}
        <Columna titulo="Notas">
          <Notas notas={notas} vacio="Sin notas esta semana." />
        </Columna>
      </div>
    </div>
  );
};

/* ── La ficha de un día ─────────────────────────────────────────────────── */

const FichaDelDia = ({ fecha, s, ctx }) => {
  const { hoy } = ctx;
  const anterior = ctx.semanaDe(addDays(s.lunes, -7));
  const pauta = ctx.diasDe(s.lunes).find((d) => d.fecha === fecha) || null;
  const pesaje = s.pesajes.find((p) => p.date === fecha);
  const peso = pesaje?.weight ?? s.media ?? anterior?.media ?? null;
  const entreno = ctx.entrenoDe(s.lunes);
  const sesion = pildoraDeSesion(entreno?.dias?.find((d) => d.fecha === fecha), hoy);
  const partes = ctx
    .sesionesDelDia(fecha)
    .map((x) => ({ x, ...sensacionesDeLaSesion({ preguntas: ctx.preguntasSesion, feedback: x.feedback }) }))
    .filter((p) => p.filas.length || p.nota);
  const hechos = (s.hechos || []).filter((h) => h.date <= fecha && (h.hasta || h.date) >= fecha);
  const inter = pauta?.intervencion || intervencionDe(hechos, fecha);
  /* El pesaje, contra la media de su semana, en palabras. */
  let pesoCompara = null;
  if (pesaje && esNumero(s.media)) {
    const d = Math.round((pesaje.weight - s.media) * 10) / 10;
    pesoCompara = d === 0 ? 'como la media de la semana' : `${kg(Math.abs(d))} kg ${d > 0 ? 'sobre' : 'bajo'} la media`;
  } else if (esNumero(s.media)) pesoCompara = `media de la semana, ${kg(s.media)} kg`;

  const cardio = cardioEnPalabras(s.pauta?.cardio);
  const cifras = [
    { id: 'peso', etiqueta: 'Peso', valor: pesaje ? kg(pesaje.weight) : null, unidad: 'kg', compara: pesoCompara },
    {
      id: 'kcal',
      etiqueta: 'Kcal',
      valor: esNumero(pauta?.kcals) ? entero(pauta.kcals) : null,
      compara: inter ? kindMeta(inter.kind).label : pauta?.tipo ? `día ${pauta.tipo}` : pauta && !pauta.exacto ? 'media de la semana' : null,
      title: pauta?.exacto ? macrosConGkg(pauta, peso) : null,
    },
    {
      id: 'pasos',
      etiqueta: 'Pasos',
      valor: esNumero(pauta?.steps) ? entero(pauta.steps) : null,
      compara: cardio ? `cardio en la semana, ${cardio}` : null,
    },
  ];
  if (entreno)
    cifras.push({
      id: 'entreno',
      etiqueta: 'Entreno',
      valor: sesion ? sesion.texto : null,
      compara: sesion && sesion.forma !== 'descanso' ? sesion.estado : null,
    });

  const notas = [
    ...partes
      .filter((p) => p.nota)
      .map((p) => ({ id: `n-${p.x.id || p.x.date}`, etiqueta: `Nota de ${p.x.dayName || 'la sesión'}`, texto: p.nota })),
    ...notasDeHechos(hechos, ctx.elegir),
  ];
  const conParte = partes.filter((p) => p.filas.length);

  return (
    <div className="tl-ins-cuerpo">
      <Cifras cifras={cifras} />
      <div className="tl-ins-contexto">
        {(conParte.length > 0 || fecha <= hoy) && (
          <Columna titulo="Parte de la sesión">
            {conParte.length > 0 ? (
              conParte.map(({ x, filas }) => (
                <div key={x.id || x.date} className="tl-ins-parte">
                  {conParte.length > 1 && <p className="tl-ins-etq">{x.dayName || 'Sesión'}</p>}
                  <Barras filas={filas} conDif={false} />
                </div>
              ))
            ) : (
              <p className="tl-ins-nada">Sin parte ese día.</p>
            )}
          </Columna>
        )}
        <Columna titulo="Notas">
          <Notas notas={notas} vacio="Sin notas ese día." />
        </Columna>
      </div>
    </div>
  );
};

/* ── Las piezas de la ruta ──────────────────────────────────────────────── */

const DeFase = ({ fase, semanas, expectativas, hoy }) => {
  const exp = expectativas.get(fase.id);
  const inicio = exp ? valorDelTramo(exp.tramos[0], fase.startsOn) : null;
  const fin = exp && fase.endsOn ? valorDelTramo(exp.tramos[exp.tramos.length - 1], addDays(fase.endsOn, 1)) : null;
  const vigente = replanteoVigente(fase, hoy);
  const suyas = semanas.filter((s) => s.fase?.id === fase.id && s.estado !== 'futura' && esNumero(s.media));
  const real = ritmoRealDeFase(semanas, fase);
  return (
    <div className="tl-ins-rejilla">
      <Seccion titulo="La fase">
        <Lista>
          <Fila
            nombre="Ritmo previsto"
            valor={ritmoTexto(fase.direction, vigente ? vigente.ratePct : fase.ratePct)}
            pie={vigente ? `Igualado el ${shortDate(vigente.semana)}; al empezar, ${ritmoTexto(fase.direction, fase.ratePct)}` : null}
          />
          {esNumero(inicio) && <Fila nombre="Parte de" valor={`${kg(inicio)} kg`} />}
          {esNumero(fin) && <Fila nombre="Esperado al acabar" valor={`${kg(fin)} kg`} />}
          {suyas.length > 1 && (
            <Fila
              nombre="Real hasta ahora"
              valor={`${conSigno(suyas[suyas.length - 1].media - suyas[0].media)} kg`}
              pie={real !== null ? pctSemana(real) : null}
            />
          )}
        </Lista>
      </Seccion>
    </div>
  );
};

const DeDestino = ({ destino, objetivoKg, hoy }) => {
  const dias = daysBetween(hoy, destino.date);
  return (
    <div className="tl-ins-rejilla">
      <Seccion titulo="Destino">
        <Lista>
          <Fila nombre="Fecha" valor={shortDate(destino.date)} />
          {esNumero(objetivoKg) && <Fila nombre="Peso objetivo" valor={`${kg(objetivoKg)} kg`} />}
          {dias !== null && dias >= 0 && <Fila nombre="Faltan" valor={`${Math.ceil(dias / 7)} semanas`} />}
        </Lista>
      </Seccion>
    </div>
  );
};

const DeDecision = ({ cruce }) => (
  <div className="tl-ins-rejilla">
    <Seccion titulo="Caminos" ancho>
      {cruce.pregunta && <p className="tl-ins-texto">{cruce.pregunta}</p>}
      <Lista>
        {cruce.caminos.map((c) => (
          <Fila
            key={c.indice}
            nombre={c.titulo}
            valor={[ritmoTexto(c.direccion, c.ratePct), c.semanas ? `${c.semanas} semanas` : null].filter(Boolean).join(', ')}
            pie={[c.cuando || null, c.llegada ? llegadaTexto(c.llegada) : null].filter(Boolean).join(', ') || null}
          />
        ))}
      </Lista>
    </Seccion>
  </div>
);

/* ── Lo que dice cada selección: título, píldoras, cuerpo y acciones ───── */

/** Las píldoras de una semana: fase, bloque y estado de su revisión. */
const pildorasDeSemana = (s) => {
  const estado = s.revision5 || (s.estado === 'futura' ? 'futura' : 'sin');
  return [
    s.fase
      ? {
          id: 'fase',
          punto: directionById(s.fase.direction)?.color,
          texto: `${nombreDeFase(s.fase)}${s.semanaFase ? `, semana ${s.semanaFase}${s.totalFase ? ` de ${s.totalFase}` : ''}` : ''}`,
        }
      : { id: 'fase', texto: 'Sin fase' },
    ...(s.bloque ? [{ id: 'bloque', texto: `${s.bloque.nombre}${s.bloque.total ? `, semana ${s.bloque.semana} de ${s.bloque.total}` : ''}` }] : []),
    { id: 'estado', estado, texto: ESTADO[estado] },
  ];
};

/**
 * @returns `{ titulo, pildoras: [], cuerpo, revision, mover }`, o `null` si
 *   la pieza ya no existe (una semana fuera del plan).
 */
const contar = (pieza, ctx) => {
  const { hoy } = ctx;
  if (pieza.tipo === 'semana' || pieza.tipo === 'dia') {
    const fecha = pieza.tipo === 'dia' ? pieza.fecha : pieza.lunes;
    const s = ctx.semanaDe(fecha);
    if (!s) return null;
    const revision = s.estado !== 'futura' ? s.lunes : null;
    const anterior = ctx.semanaDe(addDays(s.lunes, -7));
    if (pieza.tipo === 'semana') {
      return {
        titulo: `${s.numero ? `S${s.numero} · ` : ''}${tramoCorto(s.lunes, s.domingo)}`,
        sub: anterior ? `contra ${nombreCorto(anterior)}` : null,
        pildoras: pildorasDeSemana(s),
        cuerpo: <FichaDeSemana s={s} ctx={ctx} />,
        revision,
        mover: 'semana',
      };
    }
    return {
      titulo: diaTexto(fecha),
      pildoras: [...(s.numero ? [{ id: 'semana', texto: `S${s.numero}` }] : []), ...pildorasDeSemana(s).filter((p) => p.id !== 'estado')],
      cuerpo: <FichaDelDia fecha={fecha} s={s} ctx={ctx} />,
      revision,
      mover: 'dia',
    };
  }
  if (pieza.tipo === 'fase') {
    const f = pieza.fase;
    const n = semanasDeFase(f);
    return {
      titulo: nombreDeFase(f),
      pildoras: [
        { id: 'fechas', texto: `${shortDate(f.startsOn)}${f.endsOn ? ` – ${shortDate(f.endsOn)}` : ''}` },
        ...(n ? [{ id: 'n', texto: `${n} semanas` }] : []),
      ],
      cuerpo: <DeFase fase={f} semanas={ctx.semanas} expectativas={ctx.expectativas} hoy={hoy} />,
    };
  }
  if (pieza.tipo === 'hechos') {
    const e = pieza.eventos;
    return {
      titulo: e.length === 1 ? nombreDeHecho(e[0]) : `${e.length} apuntados`,
      pildoras: [{ id: 'fechas', texto: tramoDeFechas(e[0].date, e[e.length - 1].hasta || e[e.length - 1].date) }],
      cuerpo: (
        <div className="tl-ins-cuerpo">
          <Notas notas={notasDeHechos(e, null)} vacio="" />
        </div>
      ),
    };
  }
  if (pieza.tipo === 'intervencion') {
    const datos = ctx.intervencion;
    if (!datos || datos.x.id !== pieza.id) return null;
    const { x, estado } = datos;
    const valorada = VALORACIONES.find((v) => v.id === x.capa?.valoracion);
    return {
      titulo: nombreDeIntervencion(x),
      pildoras: [
        { id: 'tipo', punto: tintaDe(x), texto: x.evento ? delAl(x.desde, x.hasta) : `desde el ${shortDate(x.desde)}` },
        { id: 'estado', texto: ESTADO_DE_INTERVENCION[estado] },
        ...(valorada ? [{ id: 'valoracion', texto: valorada.label }] : []),
      ],
      cuerpo: (
        <TarjetaDeImpacto
          datos={datos}
          onGuardar={(campos) => ctx.guardarIntervencion(x, campos)}
          onVentanasPorDefecto={() => ctx.guardarIntervencion(x, { antesDesde: null, despuesHasta: null })}
        />
      ),
    };
  }
  if (pieza.tipo === 'destino' && ctx.destino) {
    return {
      titulo: ctx.destino.title || 'Destino',
      pildoras: [{ id: 'tipo', texto: kindMeta(ctx.destino.kind).label }],
      cuerpo: <DeDestino destino={ctx.destino} objetivoKg={ctx.objetivoKg} hoy={hoy} />,
    };
  }
  if (pieza.tipo === 'decision' && ctx.cruce) {
    return {
      titulo: 'Punto de decisión',
      pildoras: [
        { id: 'fase', texto: `Al acabar ${nombreDeFase(ctx.cruce.fase)}` },
        { id: 'fecha', texto: shortDate(ctx.cruce.decide) },
      ],
      cuerpo: <DeDecision cruce={ctx.cruce} />,
    };
  }
  return null;
};

/** La cabecera: a la izquierda, flechas y título; a la derecha, contexto y acciones. */
const Cabeza = ({ titulo, sub = null, pildoras = [], flechas = null, children }) => (
  <header className="tl-ins-cabeza">
    <div className="tl-ins-izquierda">
      {flechas}
      <h3 className="tl-ins-titulo tnum">{titulo}</h3>
      {sub && <span className="tl-ins-sub">{sub}</span>}
    </div>
    <div className="tl-ins-derecha">
      <Pildoras pildoras={pildoras} />
      {children}
    </div>
  </header>
);

const Flechas = ({ mover, onMover }) => (
  <div className="tl-ins-flechas">
    <button
      type="button"
      className="btn btn-icon btn-icon-compact"
      aria-label={mover === 'dia' ? 'Día anterior' : 'Semana anterior'}
      onClick={() => onMover(-1)}
    >
      <ChevronLeft size={16} />
    </button>
    <button
      type="button"
      className="btn btn-icon btn-icon-compact"
      aria-label={mover === 'dia' ? 'Día siguiente' : 'Semana siguiente'}
      onClick={() => onMover(1)}
    >
      <ChevronRight size={16} />
    </button>
  </div>
);

/**
 * EL INSPECTOR: bajo la gráfica, el resumen del periodo y lo elegido
 * (24 sep 2026; simplificado el 25).
 *
 * Arriba, siempre y sin pulsar nada, el RESUMEN DEL PERIODO: el tramo que se
 * ve (o las semanas elegidas en el calendario) contra el de antes de la misma
 * duración, en cuatro tarjetas (`periodo.js`) y nada más. Si en el tramo hay
 * revisiones pendientes, una frase con su enlace. Las semanas ya están en la
 * gráfica: pulsar una abre su ficha.
 *
 * Debajo, lo elegido:
 *   · una semana → cifras clave, sus siete días y, debajo, sensaciones, el
 *     entreno de su bloque y las notas;
 *   · un día → cifras del día, el parte de su sesión y sus notas;
 *   · una intervención → su tarjeta de impacto (`TarjetaDeImpacto`): qué
 *     fue, antes / durante / después y lo que piensa el entrenador;
 *   · una fase, un hecho, el destino o el punto de decisión → lo suyo.
 *
 * Todo con la misma gramática (`PiezasDelInspector`). En el teléfono lo
 * elegido sube como hoja (`Modal size="side"`); una intervención, como hoja
 * a media altura y sin velo (`HojaAMedias`), porque se lee contra sus
 * ventanas en la gráfica.
 *
 * Solo enseña: ningún texto sugiere qué hacer.
 *
 * @param pieza   lo elegido, o `null`.
 * @param periodo `{ titulo, contra, cifras, pendientes, vividas }` del tramo que se ve
 *                o de las semanas elegidas en el calendario; `pendientes`, los
 *                lunes por revisar; `vividas`, los que ya han pasado.
 * @param rango   las semanas elegidas en el calendario `{ desde, hasta }`, o `null`.
 */
export const Inspector = ({ pieza, ctx, periodo, rango, telefono, onCerrar, onMover, onAbrirRevision, onAbrirRevisiones, onQuitarRango }) => {
  const contado = pieza ? contar(pieza, ctx) : null;
  const n = periodo.pendientes.length;

  const resumenDe = (
    <section className="tl-ins" aria-label={rango ? 'Resumen de las semanas elegidas' : 'Resumen de lo que se ve'}>
      <Cabeza titulo={periodo.titulo} sub={periodo.contra}>
        {periodo.vividas.length > 0 && (
          <p className="tl-ins-pendiente">
            {n > 0 && (
              <>
                {n === 1 ? '1 revisión pendiente' : `${n} revisiones pendientes`}
                <span aria-hidden="true"> · </span>
              </>
            )}
            <button type="button" className="tl-ins-enlace" onClick={onAbrirRevisiones}>
              Abrir revisiones de estas semanas
            </button>
          </p>
        )}
        {rango && (
          <button type="button" className="btn btn-icon btn-icon-compact" aria-label="Soltar las semanas elegidas" onClick={onQuitarRango}>
            <X size={16} />
          </button>
        )}
      </Cabeza>
      <Cifras cifras={periodo.cifras} />
    </section>
  );

  if (telefono && contado && pieza.tipo === 'intervencion') {
    return (
      <>
        {resumenDe}
        <HojaAMedias titulo={contado.titulo} onCerrar={onCerrar}>
          <div className="tl-ins is-hoja">
            <Pildoras pildoras={contado.pildoras} />
            {contado.sub && <p className="tl-ins-sub">{contado.sub}</p>}
            {contado.cuerpo}
          </div>
        </HojaAMedias>
      </>
    );
  }

  if (telefono) {
    return (
      <>
        {resumenDe}
        {contado && (
          <Modal
            open
            size="side"
            title={contado.titulo}
            onClose={onCerrar}
            footer={
              contado.mover || contado.revision ? (
                <div className="tl-ins-pie-hoja">
                  {contado.mover && <Flechas mover={contado.mover} onMover={onMover} />}
                  {contado.revision && (
                    <button type="button" className="btn btn-primary" onClick={() => onAbrirRevision(contado.revision)}>
                      {contado.mover === 'dia' ? 'Abrir la revisión de la semana' : 'Abrir revisión'}
                    </button>
                  )}
                </div>
              ) : null
            }
          >
            <div className="tl-ins is-hoja">
              <Pildoras pildoras={contado.pildoras} />
              {contado.sub && <p className="tl-ins-sub">{contado.sub}</p>}
              {contado.cuerpo}
            </div>
          </Modal>
        )}
      </>
    );
  }

  return (
    <>
      {resumenDe}
      {contado && (
        <section className="tl-ins" aria-label={contado.titulo}>
          <Cabeza
            titulo={contado.titulo}
            sub={contado.sub}
            pildoras={contado.pildoras}
            flechas={contado.mover ? <Flechas mover={contado.mover} onMover={onMover} /> : null}
          >
            {contado.revision && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => onAbrirRevision(contado.revision)}>
                {contado.mover === 'dia' ? 'Abrir la revisión de la semana' : 'Abrir revisión'}
              </button>
            )}
            <button type="button" className="btn btn-icon btn-icon-compact" aria-label="Cerrar" onClick={onCerrar}>
              <X size={16} />
            </button>
          </Cabeza>
          {contado.cuerpo}
        </section>
      )}
    </>
  );
};
