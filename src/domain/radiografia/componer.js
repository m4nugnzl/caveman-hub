/**
 * El informe entero, a partir de lo leído. Una función, sin nada alrededor.
 *
 * ══ Por qué esto no se queda en el script ══════════════════════════════════
 *
 * Porque es donde está el ORDEN, y el orden es la mitad del informe. Qué se
 * calcula antes que qué no es un detalle de implementación: la hoja de cuentas
 * va primero porque los veredictos nombran a esas personas, y el veredicto va el
 * último porque necesita el informe ya anotado con lo aceptado. Reescribir eso
 * en la función edge sería reescribir el criterio, y el día que los dos dejaran
 * de coincidir ninguno de los dos avisaría.
 *
 * Lo que entra ya está leído; aquí no se toca la red ni el disco. Lo que sale es
 * un objeto plano y **serializable**, que es lo que permite que el mismo
 * resultado se pinte en HTML, se mande por JSON y se resuma en un mensaje.
 */

import {
  actividadSemanal,
  censo,
  comparar,
  embudo,
  fallosAgrupados,
  fallosPorDia,
  instantanea,
  negocio,
  porEvento,
  porPantalla,
  retencionSemanaSiguiente,
} from './analisis.js';
import { cuentasDe, enRiesgo } from './cuentas.js';
import { diagnosticar, resumenDe } from './diagnosticos.js';
import { cobros, invitaciones, movimientoClientes, porPlan, pruebas } from './dinero.js';
import { anotar, serieDe } from './estado.js';
import { CON_TENDENCIA } from './recogida.js';

/**
 * @param {object} entrada
 * @param {object} entrada.datos       Las tablas ya leídas, por su nombre corto.
 * @param {Array}  entrada.sesiones    `{ id, last_sign_in_at }` de `auth.users`.
 * @param {Array}  entrada.seguridad   Lo que devolvió `radiografia_seguridad()`.
 * @param {string|null} [entrada.avisoSeguridad] Por qué NO se pudo leer, si no se pudo.
 * @param {Array}  entrada.volumen     Lo que devolvió `radiografia_volumen()`.
 * @param {object} entrada.catalogo    Lo que ofrece la aplicación, leído del código.
 * @param {object} entrada.estado      Lo aceptado y lo de la vez anterior.
 * @param {string} entrada.proyecto    El host, para poder distinguir dos proyectos.
 * @param {string} entrada.generado    ISO. La hora del informe, que se usa como «hoy».
 * @param {number} entrada.dias        La ventana de las tablas de telemetría.
 * @param {string[]} [entrada.avisos]  Lo que no se ha podido leer, para que un
 *                                     cero se pueda distinguir de un hueco.
 */
export const componer = ({
  datos = {},
  sesiones = [],
  seguridad = [],
  avisoSeguridad = null,
  volumen = [],
  catalogo = { pantallas: [], pliegues: [], perimetros: [] },
  estado = {},
  proyecto = '',
  generado,
  dias = 30,
  avisos = [],
}) => {
  const eventos = datos.eventos || [];
  const hoy = generado.slice(0, 10);

  /*
    La hoja de cuentas. Va antes que nada porque casi todo lo demás cuelga de
    ella: los veredictos nombran a estas personas, el dinero se agrupa por su
    plan y el riesgo sale de sus fechas.
  */
  const cuentas = cuentasDe({
    equipos: datos.equipos,
    miembros: datos.miembros,
    perfiles: datos.perfiles,
    sesiones,
    suscripciones: datos.suscripciones,
    clientes: datos.clientes,
    programas: datos.programas || [],
    eventos,
    tickets: datos.tickets,
    integraciones: datos.integraciones,
    admins: datos.admins,
    planes: datos.planes,
    hoy: generado,
  });

  const porPerfil = new Map((datos.perfiles || []).map((p) => [p.id, p.full_name || p.email]));

  /*
    De qué ENTRENADOR es cada cliente final. Se monta aquí y no en `dinero.js`
    porque hace falta cruzar tres cosas que solo esta función tiene delante a la
    vez: el pago sabe su cliente, el cliente sabe su equipo y la hoja de cuentas
    sabe quién lleva ese equipo.

    Sirve para que un cobro vencido diga de quién es. Del cliente final no sale
    ni un nombre —ver la regla en `cobros`—: lo que se guarda es el nombre del
    entrenador, que es con quien se habla de un impago.
  */
  const cuentaDeEquipo = new Map(cuentas.map((c) => [c.id, c.nombre]));
  const deQuien = new Map(
    (datos.clientes || [])
      .map((c) => [c.id, cuentaDeEquipo.get(c.team_id)])
      .filter(([, nombre]) => Boolean(nombre))
  );

  const informe = {
    proyecto,
    generado,
    ventanaDias: dias,

    seguridad,
    avisoSeguridad,
    volumen,

    cuentas,
    riesgo: enRiesgo(cuentas),
    planes: porPlan(cuentas),
    pruebas: pruebas(cuentas),
    cobros: cobros(datos.pagos, { hoy: generado, deQuien }),
    movimiento: movimientoClientes(datos.clientes, { hoy: generado }),
    invitaciones: invitaciones(datos.invites, { hoy: generado }),
    /* Con quién hablar, no solo qué se dijo: un ticket sin nombre no se puede
       contestar. */
    tickets: (datos.tickets || [])
      .map((t) => ({ ...t, quien: porPerfil.get(t.profile_id) || null }))
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),

    embudo: embudo({
      equipos: datos.equipos,
      clientes: datos.clientes,
      programas: datos.programas || [],
      checkins: datos.checkins,
    }),

    actividad: actividadSemanal(eventos, { semanas: Math.min(16, Math.ceil(dias / 7)), hoy }),
    retencion: retencionSemanaSiguiente(eventos, { semanas: 16 }),

    eventos: porEvento(eventos),
    pantallas: porPantalla(eventos, catalogo.pantallas),

    fallos: fallosAgrupados(datos.fallos || []),
    fallosDia: fallosPorDia(datos.fallos || []),

    censo: censo({
      clientes: datos.clientes,
      antropometria: datos.antropometria,
      nutricion: datos.nutricion,
      programas: datos.programas || [],
      checkins: datos.checkins,
      fotos: datos.fotos,
      etiquetas: { pliegues: catalogo.pliegues, perimetros: catalogo.perimetros },
      hoy,
    }),

    negocio: negocio({
      equipos: datos.equipos,
      suscripciones: datos.suscripciones,
      eventos,
      hoy,
    }),

    avisos,
  };

  /*
    ── Lo aceptado, lo nuevo y lo que ha cambiado ────────────────────────────

    Va después del análisis porque necesita el informe entero: la instantánea se
    saca de él, y `anotar` compara los hallazgos de hoy con las claves de la vez
    anterior. Es lo que convierte una foto en una serie.
  */
  informe.seguridad = anotar(informe.seguridad, estado);
  informe.estado = estado;

  const foto = instantanea(informe);
  informe.metricas = foto;
  informe.cambios = comparar(estado.ultimo?.metricas || {}, foto);
  informe.comparadoCon = estado.ultimo?.generado || null;

  /*
    ── Las tendencias, que antes se calculaban y no las leía nadie ───────────

    Esto era `informe.serie`, UNA FUNCIÓN colgada del informe. Y una función no
    sobrevive a un `JSON.stringify`: en cuanto el informe tiene que viajar por la
    red hasta un panel, ese campo desaparece sin decir nada.

    Ahora son datos. Ya calculados, con la ejecución de hoy incluida —que todavía
    no está en el histórico guardado, y sin ella la línea acabaría en la semana
    pasada— y solo de las métricas de `CON_TENDENCIA`.

    `serieDe` devuelve `[]` con menos de dos puntos: una «tendencia» de un punto
    es una raya horizontal que sugiere estabilidad donde no hay información.
  */
  const historico = [...(estado.historico || []), { generado, metricas: foto }];
  informe.series = Object.fromEntries(
    CON_TENDENCIA.map((clave) => [
      clave,
      serieDe(historico, clave).map((p) => ({ etiqueta: p.fecha, valor: p.valor })),
    ])
  );

  /*
    El veredicto va al final porque necesita el informe COMPLETO —y ya anotado
    con lo aceptado y lo nuevo—: la mitad de los diagnósticos miran justamente
    eso. Es lo único del panel que se moja, y por eso vive en su propio archivo
    con sus propias pruebas.
  */
  informe.diagnosticos = diagnosticar(informe);
  informe.resumen = resumenDe(informe.diagnosticos);

  return informe;
};
