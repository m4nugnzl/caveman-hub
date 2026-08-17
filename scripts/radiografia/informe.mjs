/**
 * El panel.
 *
 * ══ La decisión de diseño que lo ordena todo ════════════════════════════════
 *
 * **Esto es una hoja de registro, no un cuadro de mando.**
 *
 * Las versiones anteriores agregaban: porcentajes, embudos, tasas. Eso es lo
 * correcto cuando hay demasiadas cuentas para mirarlas una a una, y aquí hay
 * cuatro. A esta escala un porcentaje no informa: divide y borra los nombres.
 * «El 13 % tiene portal» son 2 de 15, y quien lo lee ya lo sabía.
 *
 * El instrumento de un entrenador no es un panel de métricas: es la hoja donde
 * cada fila es una persona y las columnas son lo que hizo esta semana. Este
 * informe es esa hoja, para el negocio: **una fila por cuenta, con su nombre,
 * cuándo entró por última vez, qué paga y qué le pasa**. Lo agregado —el censo,
 * el uso por pantalla— queda detrás, que es donde sirve.
 *
 * ══ Cómo está ordenado ═════════════════════════════════════════════════════
 *
 *   1. ESTA SEMANA. Lo que hay que hacer, con nombres y fechas.
 *   2. LAS CUENTAS. La hoja. Es el corazón del informe.
 *   3. EL DINERO. Tu facturación y lo que cobran ellos, separados.
 *   4. QUÉ DICEN. Los tickets, con su asunto literal.
 *   5. Y después lo técnico: seguridad, fallos, uso, censo.
 *
 * ══ Los gráficos, en una sola serie ═════════════════════════════════════════
 *
 * Y no es una limitación: es lo correcto para lo que miden —magnitud y
 * tendencia, nunca identidad— y además esquiva un problema real del sistema de
 * diseño. La paleta de datos del proyecto no pasa la validación de daltonismo:
 * `--data-orange` ↔ `--data-lime` tienen ΔE 2,5 en deuteranopia. Con una serie
 * por gráfico esos pares no coinciden nunca en pantalla.
 *
 * De ahí: sin leyendas, etiqueta directa solo en el extremo, rejilla de un pelo
 * y sólida, eje desde cero, barras con el extremo del dato redondeado y la base
 * cuadrada, líneas de 2 px con anillo del color del fondo. Los colores de estado
 * nunca son color de serie y **siempre van con su palabra al lado**.
 *
 * Cada gráfico lleva su tabla debajo: un valor que solo se lee pasando el ratón
 * no existe para el teclado ni para la impresora.
 *
 * ══ Lo que este archivo SÍ enseña, y por qué ═══════════════════════════════
 *
 * Nombres y correos de los ENTRENADORES. La regla de «sin datos personales» de
 * las migraciones 0045 y 0052 protege a los CLIENTES FINALES —de quienes esta
 * aplicación guarda su peso, sus pliegues y fotos de su cuerpo— y sigue intacta:
 * de ellos aquí solo salen recuentos.
 *
 * Los entrenadores son los clientes de pago del negocio. Un informe local que
 * nunca sale de esta máquina no puede pretender ayudar a llevarlo sin decir
 * quién es quién.
 *
 * Sin una sola petición al exterior: ni CDN, ni fuentes, ni librerías.
 */

const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const json = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

const num = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString('es-ES') : '—');
const pct = (n) => (Number.isFinite(Number(n)) ? `${Number(n).toLocaleString('es-ES')} %` : '—');
const dinero = (n, moneda) =>
  Number.isFinite(Number(n)) ? `${Number(n).toLocaleString('es-ES')} ${moneda || ''}`.trim() : '—';

const horas = (h) => {
  const x = Number(h);
  if (!Number.isFinite(x)) return '—';
  if (x < 1 / 60) return '&lt;1 min';
  if (x < 1) return `${Math.round(x * 60)} min`;
  if (x < 48) return `${Math.round(x)} h`;
  return `${Math.round(x / 24)} d`;
};

const bytes = (n) => {
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  if (x < 1024) return `${x} B`;
  if (x < 1024 ** 2) return `${(x / 1024).toFixed(0)} KB`;
  if (x < 1024 ** 3) return `${(x / 1024 ** 2).toFixed(1)} MB`;
  return `${(x / 1024 ** 3).toFixed(2)} GB`;
};

const fecha = (iso) =>
  iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '—';
const diaCorto = (iso) => String(iso).slice(5).replace('-', '/');

/* ==========================================================================
   Piezas de gráfico
   ========================================================================== */

const tablaGemela = (id, cabeceras, filas) => `
  <details class="gemela">
    <summary>Ver como tabla</summary>
    <table id="tabla-${esc(id)}">
      <thead><tr>${cabeceras.map((c, i) => `<th${i > 0 ? ' class="der"' : ''}>${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${filas
        .map((f) => `<tr>${f.map((c, i) => `<td${i > 0 ? ' class="der"' : ''}>${c}</td>`).join('')}</tr>`)
        .join('')}</tbody>
    </table>
  </details>`;

const barras = (id, filas, { titulo = 'Valor' } = {}) => {
  if (filas.length === 0) return '<p class="vacio">Nada todavía.</p>';
  const tope = Math.max(...filas.map((f) => f.valor), 1);

  return `
    <div class="grafico">${filas
      .map(
        (f) => `
      <div class="barra" tabindex="0" data-tip="${esc(f.etiqueta)}: ${esc(f.tip ?? num(f.valor))}">
        <span class="barra-nombre" title="${esc(f.etiqueta)}">${esc(f.etiqueta)}</span>
        <span class="barra-pista"><span class="barra-relleno" style="width:${((f.valor / tope) * 100).toFixed(2)}%"></span></span>
        <span class="barra-cifra">${f.texto ?? num(f.valor)}</span>
      </div>`
      )
      .join('')}</div>
    ${tablaGemela(id, ['Qué', titulo], filas.map((f) => [esc(f.etiqueta), num(f.valor)]))}`;
};

/**
 * Una línea de tiempo de una serie, con cruz y globo.
 *
 * El eje empieza en CERO siempre: uno que arranca en el mínimo convierte una
 * variación de dos cuentas en un desplome, y esto existe para decidir.
 */
const linea = (id, puntos, { alerta = false, unidad = '' } = {}) => {
  if (puntos.length < 2) return '<p class="vacio">Hacen falta al menos dos puntos.</p>';

  const W = 720, H = 132, PI = 32, PD = 44, PS = 12, PB = 20;
  const tope = Math.max(...puntos.map((p) => p.valor), 1);
  const paso = Math.max(1, Math.ceil(tope / 2));
  const alto = paso * 2;

  const x = (i) => PI + (i / (puntos.length - 1)) * (W - PI - PD);
  const y = (v) => PS + (1 - v / alto) * (H - PS - PB);
  const trazo = puntos.map((p, i) => `${x(i).toFixed(1)},${y(p.valor).toFixed(1)}`).join(' ');
  const ult = puntos[puntos.length - 1];

  return `
    <div class="lienzo${alerta ? ' alerta' : ''}">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img"
           aria-label="${esc(puntos.map((p) => `${p.etiqueta}: ${p.valor}`).join('. '))}">
        ${[0, paso, alto]
          .map(
            (t) => `<line class="rejilla" x1="${PI}" x2="${W - PD}" y1="${y(t)}" y2="${y(t)}"/>
                    <text class="tick" x="${PI - 6}" y="${y(t) + 3}" text-anchor="end">${num(t)}</text>`
          )
          .join('')}
        <polygon class="area" points="${PI},${y(0)} ${trazo} ${x(puntos.length - 1).toFixed(1)},${y(0)}"/>
        <polyline class="trazo" points="${trazo}"/>
        <circle class="punta" cx="${x(puntos.length - 1).toFixed(1)}" cy="${y(ult.valor).toFixed(1)}" r="4"/>
        <text class="directa" x="${(x(puntos.length - 1) + 9).toFixed(1)}" y="${(y(ult.valor) + 4).toFixed(1)}">${num(ult.valor)}</text>
        ${puntos
          .map(
            (p, i) =>
              `<rect class="zona" x="${(x(i) - (W - PI - PD) / puntos.length / 2).toFixed(1)}" y="0"
                     width="${((W - PI - PD) / puntos.length).toFixed(1)}" height="${H}"
                     data-x="${x(i).toFixed(1)}"
                     data-tip="${esc(p.etiqueta)}: ${num(p.valor)}${esc(unidad)}"/>`
          )
          .join('')}
        <line class="cruz" y1="0" y2="${H - PB}" x1="0" x2="0"/>
      </svg>
      <div class="eje">${puntos.map((p) => `<span>${esc(p.corta ?? p.etiqueta)}</span>`).join('')}</div>
    </div>
    ${tablaGemela(id, ['Cuándo', 'Valor'], puntos.map((p) => [esc(p.etiqueta), num(p.valor)]))}`;
};

/* ==========================================================================
   Secciones
   ========================================================================== */

const bloque = (id, titulo, cuerpo, { nota = '', cuenta = null, sordo = false } = {}) => `
  <section class="bloque${sordo ? ' sordo' : ''}" id="${id}">
    <header class="bloque-cabeza">
      <h2>${esc(titulo)}</h2>
      ${cuenta !== null ? `<span class="bloque-n">${esc(cuenta)}</span>` : ''}
    </header>
    ${nota ? `<p class="nota">${nota}</p>` : ''}
    ${cuerpo}
  </section>`;

const MARCA = { atender: '▲', vigilar: '◆', sin_datos: '○', bien: '●' };
const ETIQUETA = { atender: 'Atender', vigilar: 'Vigilar', sin_datos: 'Sin datos', bien: 'Bien' };

/** Lo de esta semana. Corto a propósito: una lista de veinte cosas no es una lista de tareas. */
const seccionAhora = (diagnosticos, resumen) => {
  const urgentes = diagnosticos.filter((v) => v.gravedad === 'atender' || v.gravedad === 'vigilar');
  const resto = diagnosticos.filter((v) => v.gravedad !== 'atender' && v.gravedad !== 'vigilar');

  const item = (v) => `
    <li class="tarea ${esc(v.gravedad)}">
      <span class="tarea-marca" aria-hidden="true">${MARCA[v.gravedad]}</span>
      <div>
        <div class="tarea-cabeza">
          <span class="sr">${ETIQUETA[v.gravedad]}:</span>
          <strong>${esc(v.titulo)}</strong>
          ${v.cifra ? `<span class="tarea-cifra">${esc(v.cifra)}</span>` : ''}
        </div>
        ${v.porque ? `<p class="tarea-porque">${esc(v.porque)}</p>` : ''}
        ${v.hacer ? `<p class="tarea-hacer">${esc(v.hacer)}</p>` : ''}
      </div>
      ${v.ancla ? `<a class="tarea-ir" href="#${esc(v.ancla)}" aria-label="Ir a ${esc(v.titulo)}">→</a>` : ''}
    </li>`;

  return `
    <section class="bloque" id="ahora">
      <header class="bloque-cabeza">
        <h2>Esta semana</h2>
        <span class="bloque-n">${resumen.atender} que atender</span>
      </header>
      ${
        urgentes.length === 0
          ? '<p class="despejado">Nada urgente. Lo de abajo es seguimiento.</p>'
          : `<ul class="tareas">${urgentes.map(item).join('')}</ul>`
      }
      ${
        resto.length > 0
          ? `<details class="gemela"><summary>Lo que se ha comprobado y está bien (${resto.length})</summary>
             <ul class="tareas apagadas">${resto.map(item).join('')}</ul></details>`
          : ''
      }
    </section>`;
};

/**
 * La hoja de cuentas. El corazón del informe.
 *
 * Una fila por cuenta con todo lo que hace falta para decidir sobre ella, y el
 * motivo del riesgo escrito al lado en vez de un icono: «en riesgo» sin decir de
 * qué no se puede accionar.
 */
/**
 * El pulso: catorce días, una barra por día.
 *
 * Es el gráfico más pequeño del informe y el que más dice. Una cifra —«45
 * acciones esta semana»— no distingue a quien trabaja todos los días de quien
 * entró un martes, hizo cuarenta y cinco cosas de golpe y no ha vuelto; y esas
 * dos cuentas necesitan conversaciones opuestas.
 *
 * Los días vacíos se dibujan como hueco y no se saltan: **el hueco es el dato**.
 */
const pulso = (dias) => {
  const tope = Math.max(...dias.map((d) => d.valor), 1);
  return `
    <div class="pulso" role="img"
         aria-label="Actividad diaria de los últimos 14 días: ${esc(dias.map((d) => d.valor).join(', '))}">
      ${dias
        .map(
          (d) =>
            `<span class="pulso-dia" data-tip="${esc(d.dia.slice(5))}: ${d.valor} ${
              d.valor === 1 ? 'acción' : 'acciones'
            }"><span style="height:${d.valor === 0 ? 2 : Math.max(3, (d.valor / tope) * 100)}%"></span></span>`
        )
        .join('')}
    </div>`;
};

const seccionCuentas = (cuentas, riesgo) => {
  const porRiesgo = new Map(riesgo.map((c) => [c.id, c.motivos]));

  const filas = cuentas
    .map((c) => {
      const motivos = porRiesgo.get(c.id) || [];
      const dormida = (c.entrada.dias ?? 99) >= 7;

      /*
        Una frase, no siete rótulos. La versión anterior ponía siete celdas con
        su versalita diminuta encima —veintiocho rótulos de nueve píxeles en la
        pantalla a la vez— y eso se lee como ruido, no como una ficha. Lo que no
        es una cifra que se compara entre cuentas cabe en prosa.
      */
      const contexto = [
        c.correo && c.correo !== c.nombre ? c.correo : null,
        `alta el ${fecha(c.alta)}`,
        c.personas > 1 ? `${c.personas} personas` : null,
        c.integraciones.length ? c.integraciones.join(' + ') : null,
        c.tickets ? `${c.tickets} ticket${c.tickets === 1 ? '' : 's'}` : null,
        c.archivados ? `${c.archivados} archivado${c.archivados === 1 ? '' : 's'}` : null,
      ].filter(Boolean);

      const marca = c.esTuya
        ? '<span class="sello">tu cuenta</span>'
        : c.gratisIndefinido
          ? '<span class="sello alto">sin límite · no factura</span>'
          : c.diasDePrueba !== null && c.diasDePrueba >= 0
            ? `<span class="sello${c.diasDePrueba <= 7 ? ' alto' : ''}">${c.diasDePrueba} d de prueba</span>`
            : '';

      return `
      <article class="cuenta${motivos.length ? ' en-riesgo' : ''}${dormida ? ' dormida' : ''}">
        <div class="cuenta-alto">
          <h3>${esc(c.nombre)}</h3>
          <span class="pastilla ${esc(c.estado)}">${esc(c.planEtiqueta)}</span>
          ${marca}
        </div>
        <p class="cuenta-sub">${contexto.map(esc).join(' · ')}</p>

        <div class="cuenta-cifras">
          <span class="cifra"><b>${num(c.clientes)}</b> cliente${c.clientes === 1 ? '' : 's'}</span>
          <span class="cifra${c.clientes > 0 && c.conPortal === 0 ? ' flojo' : ''}">
            <b>${num(c.conPortal)}</b> con portal</span>
          <span class="cifra"><b>${num(c.conPrograma)}</b> con programa</span>
          <span class="cifra${dormida ? ' flojo' : ''}">entró <b>${esc(c.entrada.texto)}</b></span>
        </div>

        <div class="cuenta-pulso">
          ${pulso(c.pulso)}
          <span class="pulso-pie">${num(c.accionesSemana)} acciones en 7 d ·
            <b>${num(c.diasActivos)}</b> de 14 días con actividad</span>
        </div>

        ${motivos.length > 0 ? `<p class="cuenta-riesgo">${motivos.map(esc).join(' · ')}</p>` : ''}
      </article>`;
    })
    .join('');

  return bloque('cuentas', 'Las cuentas', filas || '<p class="vacio">Ninguna cuenta todavía.</p>', {
    cuenta: cuentas.length,
    nota:
      'Ordenadas por urgencia: primero lo que caduca, después lo que lleva más tiempo callado. ' +
      '«Entró» sale de <span class="mono">auth</span> y no de los eventos: existe desde el primer ' +
      'día y para todo el mundo. El pulso son catorce días, una barra por día.',
  });
};

const seccionDinero = (planes, cobros, mov, inv) => {
  const m = cobros.moneda;

  const pagos = cobros.proximos
    .slice(0, 20)
    .map((p) => [
      esc(p.external_label || '—'),
      dinero(p.amount, m),
      esc(fecha(p.period_end)),
      p.faltan < 0
        ? `<span class="malo-texto">venció hace ${-p.faltan} d</span>`
        : `en ${p.faltan} d`,
    ]);

  return bloque(
    'dinero',
    'El dinero',
    `
    <h4>Tu facturación</h4>
    <div class="rejilla-datos">
      ${planes
        .map(
          (p) => `<div class="dato"><span class="dato-et">${esc(p.plan)} · ${esc(p.estado)}</span>
            <span class="dato-v">${num(p.cuentas)}</span>
            <span class="sotto">${esc(p.nombres.join(', '))}</span></div>`
        )
        .join('')}
    </div>
    <p class="nota pie">No hay precios en el esquema —<span class="mono">plan_limits</span> guarda
      límites, no importes— así que aquí no se calcula ningún ingreso recurrente: sería una cifra
      con aspecto de dato y origen de adivinanza.</p>

    <h4>Lo que cobran ellos a sus clientes</h4>
    ${
      cobros.total === 0
        ? '<p class="vacio">Ninguna integración de cobros ha sincronizado nada.</p>'
        : `<div class="rejilla-datos">
            <div class="dato"><span class="dato-et">Pendiente</span><span class="dato-v malo-texto">${dinero(cobros.importePendiente, m)}</span><span class="sotto">${num(cobros.pendientes)} cobros</span></div>
            <div class="dato"><span class="dato-et">Cobrado</span><span class="dato-v">${dinero(cobros.importePagado, m)}</span><span class="sotto">${num(cobros.pagados)} cobros</span></div>
            <div class="dato"><span class="dato-et">Importe medio</span><span class="dato-v">${dinero(cobros.importeMedio, m)}</span><span class="sotto">por cliente</span></div>
            <div class="dato"><span class="dato-et">Fallidos</span><span class="dato-v">${num(cobros.fallidos)}</span></div>
          </div>
          ${!m ? `<p class="nota pie">Hay varias monedas (${esc(cobros.monedas.join(', '))}), así que los importes NO se suman.</p>` : ''}
          ${
            pagos.length > 0
              ? `<div class="tabla-marco"><table id="tabla-cobros">
                  <thead><tr><th>Cliente</th><th class="der">Importe</th><th class="der">Vence</th><th class="der">Cuándo</th></tr></thead>
                  <tbody>${pagos.map((f) => `<tr>${f.map((c, i) => `<td${i ? ' class="der"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody>
                </table></div>`
              : ''
          }`
    }

    <h4>Movimiento de clientes</h4>
    <div class="rejilla-datos">
      <div class="dato"><span class="dato-et">Clientes en total</span><span class="dato-v">${num(mov.total)}</span></div>
      <div class="dato"><span class="dato-et">Archivados</span><span class="dato-v">${num(mov.archivados)}</span><span class="sotto">sin fecha en el esquema</span></div>
      <div class="dato"><span class="dato-et">Invitaciones canjeadas</span><span class="dato-v">${num(inv.canjeadas)}<span class="sotto">/${num(inv.creadas)}</span></span></div>
      <div class="dato"><span class="dato-et">Caducadas sin canjear</span><span class="dato-v ${inv.caducadas ? 'malo-texto' : ''}">${num(inv.caducadas)}</span></div>
    </div>
    ${
      mov.altas.some((a) => a.altas > 0)
        ? linea('altas', mov.altas.map((a) => ({ etiqueta: `Semana del ${diaCorto(a.semana)}`, corta: diaCorto(a.semana), valor: a.altas })), { unidad: ' altas' })
        : ''
    }
    `,
    {
      nota:
        'Dos cosas distintas que se llaman igual: <strong>lo que te pagan a ti</strong> (los planes) ' +
        'y <strong>lo que le pagan a ellos</strong> (los cobros que cada entrenador pasa a sus ' +
        'clientes por aquí). La segunda no es tu caja, pero un entrenador que cobra a través de ' +
        'esto no se va.',
    }
  );
};

const seccionVoz = (tickets) =>
  bloque(
    'voz',
    'Qué dicen',
    tickets.length === 0
      ? '<p class="vacio">Ningún ticket todavía.</p>'
      : `<ul class="voces">${tickets
          .map(
            (t) => `<li class="voz${t.status !== 'closed' ? ' abierta' : ''}">
              <span class="voz-estado">${t.status === 'closed' ? 'cerrado' : esc(t.status)}</span>
              <span class="voz-asunto">${esc(t.subject)}</span>
              <span class="voz-meta">${esc(t.quien || '—')} · ${esc(fecha(t.created_at))}</span>
            </li>`
          )
          .join('')}</ul>`,
    {
      cuenta: tickets.length,
      nota:
        'Los asuntos, literales. Es la información más cara que se recibe —alguien se paró a ' +
        'escribirla— y no aparecía en ninguna versión anterior de este informe.',
    }
  );

const ORDEN_NIVEL = { critico: 0, aviso: 1, info: 2 };

const seccionSeguridad = (hallazgos, avisoFuncion) => {
  if (avisoFuncion) {
    return bloque('seguridad', 'Seguridad', `<p class="caja">${esc(avisoFuncion)}</p>`, {
      nota: 'Sin esta comprobación el informe NO afirma que todo esté bien: afirma que no se ha mirado.',
      sordo: true,
    });
  }

  const accionables = hallazgos.filter((h) => h.nivel !== 'info');
  const contexto = hallazgos.filter((h) => h.nivel === 'info');
  const criticos = accionables.filter((h) => h.nivel === 'critico' && !h.aceptado);
  const avisos = accionables.filter((h) => h.nivel === 'aviso' && !h.aceptado);
  const aceptados = accionables.filter((h) => h.aceptado);
  const nuevos = accionables.filter((h) => h.nuevo);

  const filas = [...accionables]
    .sort(
      (a, b) =>
        Number(Boolean(a.aceptado)) - Number(Boolean(b.aceptado)) ||
        Number(b.nuevo) - Number(a.nuevo) ||
        ORDEN_NIVEL[a.nivel] - ORDEN_NIVEL[b.nivel]
    )
    .map(
      (h) => `
      <tr class="hallazgo" data-nivel="${esc(h.nivel)}" data-nuevo="${h.nuevo ? '1' : ''}"
          data-aceptado="${h.aceptado ? '1' : ''}" data-clave="${esc(h.clave)}">
        <td class="marca"><input type="checkbox" class="aceptar" data-clave="${esc(h.clave)}"
             ${h.aceptado ? 'checked disabled' : ''} aria-label="Aceptar ${esc(h.objeto)}"></td>
        <td><span class="pastilla ${esc(h.nivel)}">${esc(h.nivel)}</span>${h.nuevo ? '<span class="pastilla nuevo">nuevo</span>' : ''}</td>
        <td><span class="mono">${esc(h.objeto)}</span></td>
        <td>${esc(h.detalle)}${h.aceptado ? `<div class="sotto">Aceptado el ${esc(h.aceptado.desde)}: ${esc(h.aceptado.motivo)}</div>` : ''}</td>
      </tr>`
    )
    .join('');

  return bloque(
    'seguridad',
    'Seguridad',
    `
    <p class="resumen-linea">
      <strong>${criticos.length}</strong> crítico${criticos.length === 1 ? '' : 's'} ·
      ${avisos.length} aviso${avisos.length === 1 ? '' : 's'} ·
      ${aceptados.length} aceptado${aceptados.length === 1 ? '' : 's'}
      ${nuevos.length ? ` · <strong>${nuevos.length} nuevo${nuevos.length === 1 ? '' : 's'}</strong>` : ''}
    </p>

    ${
      /*
        Los críticos, sueltos y visibles. Los avisos —cuarenta y tres, casi todos
        la misma trampa de permisos por defecto de la 0047— detrás de un
        desplegable: ocupaban treinta y seis de los sesenta y cuatro kilobytes
        del informe, más que las cuentas, el dinero y las voces juntos. Una
        sección que es más de la mitad de la página para dos hallazgos que
        importan no es una sección, es un vertedero.
      */
      criticos.length > 0
        ? `<ul class="criticos">${criticos
            .map(
              (h) => `<li><span class="mono">${esc(h.objeto)}</span> ${esc(h.detalle)}</li>`
            )
            .join('')}</ul>`
        : '<p class="ok-linea">Ningún hallazgo crítico sin revisar.</p>'
    }

    <details class="gemela">
      <summary>Revisar y aceptar los ${accionables.length} hallazgos</summary>
      <div class="filtros" role="group" aria-label="Filtrar hallazgos">
        <button class="chip activo" data-filtro="pendientes">Sin aceptar</button>
        <button class="chip" data-filtro="critico">Solo críticos</button>
        <button class="chip" data-filtro="nuevo">Solo nuevos</button>
        <button class="chip" data-filtro="todo">Todo</button>
      </div>
      <div class="tabla-marco"><table id="tabla-seguridad">
        <thead><tr><th class="marca"><span class="sr">Aceptar</span></th><th>Nivel</th><th>Objeto</th><th>Qué pasa</th></tr></thead>
        <tbody>${filas || '<tr><td colspan="4" class="vacio">Ningún hallazgo.</td></tr>'}</tbody>
      </table></div>
      <div class="aceptar-barra" id="aceptar-barra" hidden>
        <span id="aceptar-cuenta"></span>
        <input id="aceptar-motivo" type="text" maxlength="140" placeholder="Por qué es deliberado (obligatorio)">
        <button id="aceptar-boton" class="btn">Descargar estado.json</button>
      </div>
      ${contexto.length ? `<ul class="contexto">${contexto.map((c) => `<li>${esc(c.detalle)}</li>`).join('')}</ul>` : ''}
    </details>`,
    {
      cuenta: criticos.length || null,
      nota:
        'La lista no queda vacía sola: hay decisiones deliberadas que salen siempre. Acéptalas con ' +
        'su motivo —se guarda en <span class="mono">informes/estado.json</span>— y lo que quede es ' +
        'lo que hay que mirar.',
      sordo: true,
    }
  );
};

const seccionSalud = (fallos, porDia, volumen, ventanaDias) => {
  const filas = fallos
    .slice(0, 30)
    .map((f) => [
      `<span class="mono">${esc(f.code || '—')}</span>`,
      `<span class="mono">${esc(f.ruta)}</span>`,
      esc(f.message),
      num(f.cuentas),
      num(f.veces),
    ]);

  return bloque(
    'salud',
    'Qué se rompe',
    `
    ${porDia.length > 1 ? linea('fallos-dia', porDia.map((d) => ({ etiqueta: diaCorto(d.dia), corta: diaCorto(d.dia), valor: d.veces })), { alerta: true, unidad: ' veces' }) : ''}
    ${
      filas.length === 0
        ? `<p class="vacio">Ningún fallo registrado en ${ventanaDias} días.</p>`
        : `<div class="tabla-marco"><table id="tabla-fallos">
            <thead><tr><th>Código</th><th>Ruta</th><th>Mensaje</th><th class="der">Cuentas</th><th class="der">Veces</th></tr></thead>
            <tbody>${filas.map((f) => `<tr>${f.map((c, i) => `<td${i >= 3 ? ' class="der"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody>
          </table></div>`
    }
    <h4>Volumen por tabla</h4>
    <div class="tabla-marco"><table id="tabla-volumen">
      <thead><tr><th>Tabla</th><th class="der">Filas</th><th class="der">Total</th><th class="der">Por fila</th></tr></thead>
      <tbody>${volumen
        .slice(0, 10)
        .map(
          (v) =>
            `<tr><td><span class="mono">${esc(v.tabla)}</span></td><td class="der">${num(v.filas)}</td>
             <td class="der">${bytes(v.bytes)}</td><td class="der">${v.filas > 0 ? bytes(v.bytes / v.filas) : '—'}</td></tr>`
        )
        .join('')}</tbody>
    </table></div>`,
    {
      cuenta: fallos.length,
      nota: `Ordenado por <strong>cuentas afectadas</strong>: un fallo que le pasa doscientas veces a una persona es un caso raro suyo; uno que le pasa una vez a seis es del producto.`,
      sordo: true,
    }
  );
};

const seccionUso = (eventos, pantallas, censo) =>
  bloque(
    'uso',
    'Uso y contenido',
    `
    <h4>Gestos</h4>
    ${
      eventos.filter((e) => e.nombre !== 'pantalla_vista').length === 0
        ? '<p class="vacio">Ninguno todavía. Los eventos nuevos llegan cuando se despliegue el build actual.</p>'
        : barras('gestos', eventos.filter((e) => e.nombre !== 'pantalla_vista').map((e) => ({
            etiqueta: e.nombre, valor: e.veces,
            texto: `${num(e.veces)} <span class="sotto">${num(e.cuentas)} cuentas</span>`,
            tip: `${num(e.veces)} veces, ${num(e.cuentas)} cuentas`,
          })), { titulo: 'Veces' })
    }

    <h4>Pantallas más abiertas</h4>
    ${barras('pantallas', pantallas.usadas.slice(0, 10).map((p) => ({
      etiqueta: p.nombre, valor: p.veces,
      texto: `${num(p.veces)} <span class="sotto">${num(p.cuentas)} cuentas</span>`,
      tip: `${num(p.veces)} veces, ${num(p.cuentas)} cuentas`,
    })), { titulo: 'Veces' })}

    ${
      pantallas.sinUso.length
        ? `<h4>Que no ha abierto nadie</h4><p class="fichas">${pantallas.sinUso.map((p) => `<span class="mono ficha">${esc(p)}</span>`).join('')}</p>`
        : ''
    }

    ${
      censo
        ? `<h4>Qué campos se rellenan</h4>
           ${
             censo.antropometria.registros < 20
               ? `<p class="vacio">Solo ${num(censo.antropometria.registros)} pesajes: todavía no se puede concluir qué campos sobran.</p>`
               : barras('pliegues', censo.antropometria.pliegues.campos.map((f) => ({
                   etiqueta: f.campo, valor: f.veces,
                   texto: `${pct(f.pct)} <span class="sotto">${num(f.veces)}/${num(censo.antropometria.pliegues.total)}</span>`,
                   tip: `${pct(f.pct)} de los pesajes`,
                 })), { titulo: 'Veces' })
           }
           <div class="rejilla-datos">
             <div class="dato"><span class="dato-et">Mediana en contestar un check-in</span><span class="dato-v">${horas(censo.revision.horasMediana)}</span></div>
             <div class="dato"><span class="dato-et">Check-ins revisados</span><span class="dato-v">${num(censo.revision.revisados)}<span class="sotto">/${num(censo.revision.entregados)}</span></span></div>
             <div class="dato"><span class="dato-et">Clientes con sexo registrado</span><span class="dato-v">${pct(censo.clientes.conSexo)}</span></div>
             <div class="dato"><span class="dato-et">Sesiones registradas</span><span class="dato-v">${num(censo.programas.sesiones)}</span></div>
           </div>`
        : ''
    }`,
    { sordo: true }
  );

/* ==========================================================================
   Estilo
   ========================================================================== */

const ESTILOS = `
:root{
  --papel:#e8eaee; --hoja:#fff; --hundido:#f4f6f8;
  --pelo:#e2e5ea; --canto:#d8dce3;
  --tinta:#0f1317; --tinta-2:#4c5663; --tinta-3:#8a94a1;
  --serie:#2a66c4;
  --bien:#0f6d47; --bien-t:#e0f0e8;
  --ojo:#944b0a; --ojo-t:#faeadb;
  --mal:#ad2f24; --mal-t:#fae6e4;
  --azul-t:#e5edfa;
  --sans:-apple-system,BlinkMacSystemFont,'Segoe UI Variable Text','Segoe UI',Inter,Roboto,system-ui,sans-serif;
  --mono:ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace;
  --regla:repeating-linear-gradient(90deg,var(--canto) 0 1px,transparent 1px 8px);
  --regla-alta:repeating-linear-gradient(90deg,var(--tinta-3) 0 1px,transparent 1px 40px);
}
@media (prefers-color-scheme:dark){
  :root{
    --papel:#0d1014; --hoja:#171b21; --hundido:#12161b;
    --pelo:rgba(226,233,241,.08); --canto:rgba(226,233,241,.14);
    --tinta:#eef1f5; --tinta-2:#a8b1bd; --tinta-3:#727c89;
    --serie:#7cadf0;
    --bien:#4fd196; --bien-t:rgba(79,209,150,.14);
    --ojo:#f5ab6b; --ojo-t:rgba(245,171,107,.14);
    --mal:#f27a70; --mal-t:rgba(242,122,112,.14);
    --azul-t:rgba(124,173,240,.14);
  }
}
*{box-sizing:border-box}
body{margin:0;background:var(--papel);color:var(--tinta);font-family:var(--sans);
     font-size:15px;line-height:1.5;-webkit-font-smoothing:antialiased}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.hoja{max-width:980px;margin:0 auto;padding:0 20px 90px}

/* ── Cabecera: la regla como firma, donde de verdad hay una escala ─────── */
.masthead{padding:38px 0 0}
.masthead h1{font-size:1.5rem;font-weight:800;letter-spacing:-.03em;margin:0}
.masthead .meta{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:.75rem;color:var(--tinta-3);margin:4px 0 12px}
.masthead .regla{height:8px;background:var(--regla)}
.masthead .regla-alta{height:12px;background:var(--regla-alta);margin-top:-12px;opacity:.55}

/* ── Bloques ──────────────────────────────────────────────────────────── */
.bloque{margin:34px 0 0}
.bloque.sordo{opacity:.92}
.bloque-cabeza{display:flex;align-items:baseline;gap:10px;padding-bottom:8px;
               border-bottom:2px solid var(--tinta);margin-bottom:14px}
h2{font-size:.6875rem;text-transform:uppercase;letter-spacing:.14em;font-weight:800;margin:0}
.bloque-n{margin-left:auto;font-size:.6875rem;color:var(--tinta-3);font-variant-numeric:tabular-nums}
h4{font-size:.625rem;text-transform:uppercase;letter-spacing:.12em;font-weight:800;
   color:var(--tinta-3);margin:24px 0 8px}
.nota{font-size:.8125rem;color:var(--tinta-2);margin:0 0 14px;max-width:74ch}
.nota.pie{margin:8px 0 0;font-size:.75rem;color:var(--tinta-3)}
.nota strong{color:var(--tinta);font-weight:600}
.vacio{color:var(--tinta-3);font-size:.8125rem;font-style:italic;margin:6px 0}
.sotto{color:var(--tinta-3);font-size:.6875rem;font-weight:400}
.mono{font-family:var(--mono);font-size:.75rem}
.malo-texto{color:var(--mal)}
.contexto{margin:12px 0 0;padding-left:16px;font-size:.75rem;color:var(--tinta-3)}
.fichas{display:flex;flex-wrap:wrap;gap:5px;margin:4px 0}
.ficha{background:var(--hundido);border:1px solid var(--pelo);padding:3px 8px;border-radius:3px}

/* ── Esta semana ──────────────────────────────────────────────────────── */
.despejado{background:var(--bien-t);color:var(--bien);padding:14px 16px;border-radius:4px;
           margin:0;font-weight:600;font-size:.9375rem}
.tareas{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:1px}
.tarea{display:grid;grid-template-columns:20px 1fr 22px;gap:10px;align-items:start;
       padding:13px 14px;background:var(--hoja);border-left:3px solid var(--tinta-3)}
.tarea:first-child{border-radius:4px 4px 0 0}
.tarea:last-child{border-radius:0 0 4px 4px}
.tarea.atender{border-left-color:var(--mal)}
.tarea.atender .tarea-marca{color:var(--mal)}
.tarea.vigilar{border-left-color:var(--ojo)}
.tarea.vigilar .tarea-marca{color:var(--ojo)}
.tarea.bien{border-left-color:var(--bien)}
.tarea.bien .tarea-marca{color:var(--bien)}
.tarea-marca{font-size:.625rem;line-height:1.9;color:var(--tinta-3)}
.tarea-cabeza{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px}
.tarea-cabeza strong{font-size:.9375rem;font-weight:650;letter-spacing:-.01em}
.tarea-cifra{font-family:var(--mono);font-size:.6875rem;background:var(--hundido);
             border:1px solid var(--pelo);padding:1px 7px;border-radius:3px;color:var(--tinta-2)}
.tarea-porque{margin:3px 0 0;font-size:.8125rem;color:var(--tinta-2)}
.tarea-hacer{margin:5px 0 0;font-size:.8125rem;font-weight:550}
.tarea-hacer::before{content:'→ ';color:var(--tinta-3)}
.tarea-ir{text-decoration:none;color:var(--tinta-3);font-size:1rem;line-height:1.4}
.tarea-ir:hover{color:var(--tinta)}
.apagadas .tarea{opacity:.72}

/* ── La hoja de cuentas ───────────────────────────────────────────────── */
.cuenta{background:var(--hoja);border:1px solid var(--pelo);border-left:3px solid var(--pelo);
        border-radius:4px;padding:16px 18px;margin-bottom:8px}
.cuenta.en-riesgo{border-left-color:var(--ojo)}
.cuenta.dormida{border-left-color:var(--mal)}
.cuenta-alto{display:flex;flex-wrap:wrap;align-items:baseline;gap:10px}
.cuenta h3{font-size:1.125rem;font-weight:700;letter-spacing:-.025em;margin:0}
/* El sello va al lado del nombre y no en una esquina propia: lo que caduca se
   lee con la persona, no en otro sitio de la ficha. */
.sello{font-size:.6875rem;color:var(--tinta-2);font-variant-numeric:tabular-nums}
.sello.alto{color:var(--mal);font-weight:700}
.cuenta-sub{margin:3px 0 0;font-size:.75rem;color:var(--tinta-3)}

/* Cuatro cifras en prosa, no siete celdas con su versalita encima. Veintiocho
   rótulos de nueve píxeles a la vez se leen como ruido, no como una ficha. */
.cuenta-cifras{display:flex;flex-wrap:wrap;gap:6px 20px;margin-top:12px;font-size:.8125rem;
               color:var(--tinta-2)}
.cifra b{font-size:1.25rem;font-weight:700;letter-spacing:-.02em;color:var(--tinta);
         margin-right:3px;vertical-align:-1px}
.cifra.flojo b{color:var(--mal)}

.cuenta-pulso{display:flex;align-items:flex-end;gap:14px;margin-top:12px;flex-wrap:wrap}
/* Catorce días, una barra por día. Los vacíos se dibujan como una raya al ras
   del suelo: el hueco es el dato y saltárselo lo borraría. */
.pulso{display:flex;align-items:flex-end;gap:2px;height:26px;flex-shrink:0}
.pulso-dia{width:7px;height:100%;display:flex;align-items:flex-end;cursor:default}
.pulso-dia>span{width:100%;background:var(--serie);border-radius:1px;min-height:2px;display:block}
.pulso-pie{font-size:.6875rem;color:var(--tinta-3);line-height:1.4}
.pulso-pie b{color:var(--tinta-2)}
.cuenta-riesgo{margin:11px 0 0;font-size:.75rem;color:var(--ojo);font-weight:600}
.cuenta.dormida .cuenta-riesgo{color:var(--mal)}

.resumen-linea{margin:0 0 10px;font-size:.875rem;color:var(--tinta-2)}
.resumen-linea strong{color:var(--tinta)}
.ok-linea{margin:0;font-size:.8125rem;color:var(--bien);font-weight:600}
.criticos{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:1px}
.criticos li{background:var(--mal-t);color:var(--mal);padding:9px 12px;border-radius:3px;font-size:.8125rem}
.criticos .mono{color:inherit;font-weight:700;margin-right:6px}
.cuenta.dormida .cuenta-riesgo{color:var(--mal)}

.rejilla-datos{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1px;
               background:var(--pelo);border:1px solid var(--pelo);border-radius:3px;overflow:hidden}
.rejilla-datos .dato{padding:11px 13px}

/* ── Voces ────────────────────────────────────────────────────────────── */
.voces{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:1px}
.voz{display:grid;grid-template-columns:70px 1fr auto;gap:12px;align-items:baseline;
     background:var(--hoja);padding:11px 14px;font-size:.875rem}
.voz.abierta{border-left:3px solid var(--mal);padding-left:11px}
.voz-estado{font-size:.5625rem;text-transform:uppercase;letter-spacing:.1em;font-weight:700;color:var(--tinta-3)}
.voz.abierta .voz-estado{color:var(--mal)}
.voz-asunto{font-weight:550}
.voz-meta{font-size:.6875rem;color:var(--tinta-3);text-align:right;white-space:nowrap}

/* ── Gráficos ─────────────────────────────────────────────────────────── */
.grafico{display:flex;flex-direction:column;gap:5px}
.barra{display:grid;grid-template-columns:minmax(90px,160px) 1fr minmax(90px,auto);gap:12px;
       align-items:center;font-size:.8125rem;border-radius:3px}
.barra:focus-visible{outline:2px solid var(--serie);outline-offset:2px}
.barra-nombre{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--tinta-2)}
.barra-pista{background:var(--hundido);border:1px solid var(--pelo);border-radius:2px;height:16px;overflow:hidden}
.barra-relleno{display:block;height:100%;border-radius:0 3px 3px 0;min-width:2px;background:var(--serie)}
.barra-cifra{font-variant-numeric:tabular-nums;text-align:right;font-size:.75rem}

.lienzo{position:relative;--c:var(--serie)}
.lienzo.alerta{--c:var(--mal)}
.lienzo svg{width:100%;height:132px;display:block;overflow:visible}
.rejilla{stroke:var(--pelo);stroke-width:1;vector-effect:non-scaling-stroke}
.tick{fill:var(--tinta-3);font-size:9px;font-family:var(--sans);font-variant-numeric:tabular-nums}
.area{fill:var(--c);opacity:.1}
.trazo{fill:none;stroke:var(--c);stroke-width:2;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke}
.punta{fill:var(--c);stroke:var(--hoja);stroke-width:2;vector-effect:non-scaling-stroke}
.directa{fill:var(--tinta);font-size:11px;font-weight:700;font-family:var(--sans)}
.zona{fill:transparent;cursor:crosshair}
.cruz{stroke:var(--tinta-3);stroke-width:1;opacity:0;vector-effect:non-scaling-stroke}
.lienzo:hover .cruz{opacity:.35}
.eje{display:flex;justify-content:space-between;font-size:.625rem;color:var(--tinta-3);
     padding:2px 44px 0 32px;overflow:hidden}
.eje span{flex:1;text-align:center;white-space:nowrap;overflow:hidden}

.globo{position:fixed;z-index:20;background:var(--tinta);color:var(--hoja);font-size:.75rem;
       padding:5px 9px;border-radius:4px;pointer-events:none;opacity:0;transition:opacity .1s;
       white-space:nowrap;box-shadow:0 6px 18px -6px rgba(0,0,0,.45)}
.globo.visible{opacity:1}
.gemela{margin-top:10px}
.gemela summary{font-size:.625rem;color:var(--tinta-3);cursor:pointer;text-transform:uppercase;
                letter-spacing:.1em;font-weight:800;padding:4px 0}
.gemela summary:hover{color:var(--tinta-2)}

/* ── Tablas ───────────────────────────────────────────────────────────── */
.tabla-marco{overflow-x:auto;margin-top:8px;background:var(--hoja);border:1px solid var(--pelo);border-radius:4px}
table{width:100%;border-collapse:collapse;font-size:.8125rem}
th{text-align:left;font-size:.5625rem;text-transform:uppercase;letter-spacing:.1em;color:var(--tinta-3);
   font-weight:800;padding:8px 12px;border-bottom:1px solid var(--canto);white-space:nowrap}
td{padding:8px 12px;border-bottom:1px solid var(--pelo);vertical-align:top}
tr:last-child td{border-bottom:none}
.der{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.marca{width:32px}

.pastilla{display:inline-block;padding:2px 9px;border-radius:3px;font-size:.625rem;font-weight:700;
          white-space:nowrap;text-transform:uppercase;letter-spacing:.06em;
          background:var(--hundido);color:var(--tinta-2);border:1px solid var(--pelo)}
.pastilla.active{background:var(--bien-t);color:var(--bien);border-color:transparent}
.pastilla.trialing{background:var(--azul-t);color:var(--serie);border-color:transparent}
.pastilla.past_due,.pastilla.canceled,.pastilla.critico{background:var(--mal-t);color:var(--mal);border-color:transparent}
.pastilla.aviso{background:var(--ojo-t);color:var(--ojo);border-color:transparent}
.pastilla.nuevo{background:var(--azul-t);color:var(--serie);border-color:transparent;margin-left:4px}
.caja{background:var(--ojo-t);color:var(--ojo);padding:12px 14px;border-radius:4px;font-size:.8125rem;margin:0}
tr[data-aceptado="1"]{opacity:.5}

.filtros{display:flex;flex-wrap:wrap;gap:5px;margin:0 0 8px}
.chip{border:1px solid var(--canto);background:var(--hoja);color:var(--tinta-2);padding:4px 12px;
      border-radius:3px;font-size:.75rem;font-family:inherit;cursor:pointer}
.chip:hover{color:var(--tinta)}
.chip.activo{background:var(--tinta);color:var(--hoja);border-color:var(--tinta)}
.aceptar-barra{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:12px;padding:12px 14px;
               border-radius:4px;background:var(--hoja);border:1px solid var(--canto)}
#aceptar-cuenta{font-size:.8125rem;color:var(--tinta-2)}
#aceptar-motivo{flex:1 1 240px;padding:6px 10px;border:1px solid var(--canto);border-radius:3px;
                background:var(--hundido);color:var(--tinta);font-family:inherit;font-size:.8125rem}
.btn{background:var(--tinta);color:var(--hoja);border:none;border-radius:3px;padding:7px 14px;
     font-family:inherit;font-size:.8125rem;font-weight:700;cursor:pointer}
.btn:disabled{opacity:.4;cursor:not-allowed}

footer{margin-top:44px;padding-top:14px;border-top:1px solid var(--canto);
       color:var(--tinta-3);font-size:.6875rem;line-height:1.8}

@media (max-width:760px){
  .hoja{padding:0 14px 60px}
  .cuenta-cifras{gap:4px 16px}
  .barra{grid-template-columns:1fr;gap:2px}
  .barra-cifra{text-align:left}
  .voz{grid-template-columns:1fr;gap:2px}
  .voz-meta{text-align:left}
  .tarea{grid-template-columns:20px 1fr}
  .tarea-ir{display:none}
}
@media print{
  body{background:#fff}
  .filtros,.aceptar-barra,.tarea-ir{display:none}
  .bloque{break-inside:avoid}
}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;

/* ==========================================================================
   Comportamiento
   ========================================================================== */

const GUION = `
(function () {
  var D = window.__RADIOGRAFIA__ || { estado: {}, generado: '' };

  // Globo compartido. Los valores están TAMBIÉN en la tabla de cada gráfico: un
  // dato al que solo se llega con el ratón no existe para el teclado ni para la
  // impresora.
  var globo = document.createElement('div');
  globo.className = 'globo';
  globo.setAttribute('role', 'status');
  document.body.appendChild(globo);

  function mostrar(t, x, y) {
    globo.textContent = t; globo.classList.add('visible');
    var w = globo.offsetWidth, h = globo.offsetHeight;
    globo.style.left = Math.max(6, Math.min(window.innerWidth - w - 6, x - w / 2)) + 'px';
    globo.style.top = Math.max(6, y - h - 10) + 'px';
  }
  function ocultar() { globo.classList.remove('visible'); }

  document.querySelectorAll('[data-tip]').forEach(function (el) {
    function sobre(e) {
      var r = el.getBoundingClientRect();
      mostrar(el.dataset.tip, e && e.clientX ? e.clientX : r.left + r.width / 2, r.top);
      var cruz = el.closest('.lienzo') && el.closest('.lienzo').querySelector('.cruz');
      if (cruz && el.dataset.x) { cruz.setAttribute('x1', el.dataset.x); cruz.setAttribute('x2', el.dataset.x); }
    }
    el.addEventListener('mouseenter', sobre);
    el.addEventListener('mousemove', sobre);
    el.addEventListener('mouseleave', ocultar);
    el.addEventListener('focus', sobre);
    el.addEventListener('blur', ocultar);
  });

  // ── Filtros de seguridad ────────────────────────────────────────────────
  var chips = document.querySelectorAll('.chip[data-filtro]');
  function aplicar(f) {
    document.querySelectorAll('tr.hallazgo').forEach(function (tr) {
      var ac = tr.dataset.aceptado === '1', nu = tr.dataset.nuevo === '1', cr = tr.dataset.nivel === 'critico';
      tr.hidden = !(f === 'todo' ? true : f === 'nuevo' ? nu : f === 'critico' ? (cr && !ac) : !ac);
    });
  }
  chips.forEach(function (c) {
    c.addEventListener('click', function () {
      chips.forEach(function (o) { o.classList.remove('activo'); });
      c.classList.add('activo'); aplicar(c.dataset.filtro);
    });
  });
  if (chips.length) aplicar('pendientes');

  // ── Aceptar hallazgos ───────────────────────────────────────────────────
  // No se guarda en el navegador: sobre file:// no es fiable entre archivos, y
  // lo aceptado tiene que sobrevivir a regenerar el informe cada semana.
  var barra = document.getElementById('aceptar-barra');
  var cuenta = document.getElementById('aceptar-cuenta');
  var motivo = document.getElementById('aceptar-motivo');
  var boton = document.getElementById('aceptar-boton');
  // Si la comprobación de seguridad no se pudo ejecutar, esa parte no se dibuja
  // y estos cuatro son nulos. Sin esta salida el guion reventaría aquí y se
  // llevaría por delante los globos de todo lo demás.
  if (!barra || !motivo || !boton || !cuenta) return;

  function marcados() {
    return Array.prototype.slice.call(document.querySelectorAll('.aceptar:checked:not(:disabled)'))
      .map(function (c) { return c.dataset.clave; });
  }
  function refrescar() {
    var n = marcados().length;
    barra.hidden = n === 0;
    cuenta.textContent = n === 1 ? '1 hallazgo seleccionado' : n + ' hallazgos seleccionados';
    boton.disabled = motivo.value.trim().length < 3;
  }
  document.querySelectorAll('.aceptar').forEach(function (c) { c.addEventListener('change', refrescar); });
  motivo.addEventListener('input', refrescar);

  boton.addEventListener('click', function () {
    var razon = motivo.value.trim();
    if (razon.length < 3) return;
    var estado = JSON.parse(JSON.stringify(D.estado || { version: 2, aceptados: {} }));
    estado.aceptados = estado.aceptados || {};
    marcados().forEach(function (clave) {
      var tr = document.querySelector('tr[data-clave="' + clave.replace(/"/g, '\\\\"') + '"]');
      estado.aceptados[clave] = {
        desde: (D.generado || '').slice(0, 10), motivo: razon,
        nivel: tr ? tr.dataset.nivel : null,
        objeto: tr ? (tr.cells[2] || {}).textContent.trim() : null
      };
    });
    var blob = new Blob([JSON.stringify(estado, null, 2) + '\\n'], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'estado.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });
  refrescar();
})();
`;

/* ==========================================================================
   El documento
   ========================================================================== */

export const render = (datos) => {
  const {
    proyecto, generado, ventanaDias,
    cuentas = [], riesgo = [], planes = [], cobros: losCobros = { total: 0, proximos: [], monedas: [] },
    movimiento = { altas: [], archivados: 0, total: 0 },
    invitaciones: inv = { creadas: 0, canjeadas: 0, caducadas: 0 },
    tickets = [],
    seguridad = [], avisoSeguridad = null, volumen = [],
    eventos = [], pantallas = { usadas: [], sinUso: [] },
    fallos = [], fallosDia = [], censo = null,
    avisos = [], diagnosticos = [], resumen = { atender: 0, vigilar: 0 },
    estado = { version: 2, aceptados: {} },
  } = datos;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Radiografía · ${esc(proyecto)}</title>
<style>${ESTILOS}</style>
</head>
<body>
<div class="hoja">

<header class="masthead">
  <h1>Radiografía</h1>
  <p class="meta">
    <span class="mono">${esc(proyecto)}</span>
    <span>${esc(new Date(generado).toLocaleString('es-ES'))}</span>
    <span>ventana de ${esc(ventanaDias)} días</span>
    <span>${esc(cuentas.length)} cuenta${cuentas.length === 1 ? '' : 's'}</span>
  </p>
  <div class="regla"></div><div class="regla-alta"></div>
</header>

${seccionAhora(diagnosticos, resumen)}
${seccionCuentas(cuentas, riesgo)}
${seccionDinero(planes, losCobros, movimiento, inv)}
${seccionVoz(tickets)}
${seccionSeguridad(seguridad, avisoSeguridad)}
${seccionSalud(fallos, fallosDia, volumen, ventanaDias)}
${seccionUso(eventos, pantallas, censo)}

${
  avisos.length > 0
    ? bloque('avisos', 'Lo que no se ha podido leer',
        `<ul class="contexto">${avisos.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>`,
        { nota: 'Lo que falta arriba por esto no es un cero: es un hueco.', sordo: true })
    : ''
}

<footer>
  Generado en local con <span class="mono">npm run radiografia</span>. No sale ni entra nada de
  internet al abrir este archivo.<br>
  <strong>Contiene nombres y correos de tus entrenadores, cifras de negocio y el estado de la
  seguridad de la base de datos. No lo publiques ni lo compartas.</strong><br>
  De los clientes finales solo hay recuentos: ni un nombre, ni una medida.
</footer>

</div>
<script>window.__RADIOGRAFIA__ = ${json({ estado, generado })};</script>
<script>${GUION}</script>
</body>
</html>`;
};
