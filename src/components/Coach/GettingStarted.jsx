import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Compass, X } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { onboardingCurrent, onboardingProgress, onboardingSteps } from '@/domain/onboarding';
import { clientPath } from '@/routes';
import { Panel, SectionTitle } from '@/components/ui/primitives';
import { useInvite } from './useInvite';

/**
 * Los primeros pasos, con el estado real de cada uno.
 *
 * ══ Por qué esto sustituye a TRES cosas ═════════════════════════════════════
 *
 * Un entrenador recién registrado recibía, seguidas: un diálogo de bienvenida de
 * cuatro pasos, este panel con otros cuatro, y un estado vacío con el botón de
 * dar de alta. Tres piezas diciendo la misma frase con distintas palabras.
 * Repetir un mensaje tres veces no lo refuerza — enseña que el producto se
 * repite, y que se puede cerrar sin leer.
 *
 * Ahora hay una sola, y lo que la hace útil es que **sabe por dónde vas**:
 *
 *   · Enseña UN paso, el que toca. Los otros tres están detrás, en una línea,
 *     porque cuatro tareas a la vez no son una guía sino una lista de deberes —
 *     y tres de ellas ni siquiera se pueden hacer todavía.
 *   · El botón te lleva CON QUIEN le falta: «Programar a Marta», no «Ir a
 *     Rutina». La primera vez, la mitad del trabajo es saber a dónde ir.
 *   · Cada paso se marca solo cuando de verdad está hecho. Nadie tiene que
 *     acordarse de tacharlo.
 *   · Y cuando no queda ninguno, desaparece sola. La que hay que cerrar a mano
 *     se cierra el primer día, antes de haber servido de nada.
 *
 * ── El paso que se olvida ───────────────────────────────────────────────────
 * Invitar. Hasta que al cliente no le llega el enlace no puede entrar, así que
 * los registros, el check-in y las fotos —media aplicación— se quedan sin usar
 * sin que nada lo diga. Por eso ese paso se completa DESDE AQUÍ, con su botón,
 * en vez de mandar a buscarlo dentro de la ficha.
 *
 * ── Por qué se puede ocultar igualmente ─────────────────────────────────────
 * Porque quien ya sabe hacer esto no tiene por qué demostrarlo, y porque un
 * panel que no se puede quitar acaba siendo parte del ruido. Se recuerda en este
 * navegador; si se pierde, vuelve a salir, que es mejor error que el contrario.
 */
const key = (userId) => `caveman-guia:${userId || 'anon'}`;

const leerCerrado = (userId) => {
  try {
    return localStorage.getItem(key(userId)) === '1';
  } catch {
    return false;
  }
};

export const GettingStarted = () => {
  const { clients, training, session, coachPrefs } = useApp();
  const navigate = useNavigate();
  const userId = session?.user?.id;

  const [cerrado, setCerrado] = useState(() => leerCerrado(userId));
  const [verTodo, setVerTodo] = useState(false);
  /* «Seguir» despliega la tarjeta completa desde la línea plegada; no se
     recuerda entre visitas a propósito: al volver, vuelve la línea. */
  const [desplegada, setDesplegada] = useState(false);
  const { busy: invitando, send: invitar, result: invite } = useInvite();

  /* Que haya tocado su protocolo alguna vez: se mira si existe la clave, no si
     su contenido difiere del de por defecto —eso marcaría el paso como hecho a
     quien no ha entrado nunca ahí—.

     Se leía de `preferences`, que no existe en el contexto: llegaba `undefined`
     y el paso no se marcaba nunca, por mucho que el entrenador guardara su
     protocolo. La plantilla del entrenador vive en `coachPrefs.protocolTemplate`
     (ver `lib/protocolTemplate.js`). */
  const protocolTocado = Boolean(coachPrefs?.protocolTemplate);

  const pasos = onboardingSteps({ clients, training, protocolTocado });
  const actual = onboardingCurrent(pasos);
  const { hechos, total } = onboardingProgress(pasos);

  /*
    ── La guía deja el trono ──────────────────────────────────────────────────
    Mientras el entrenador está empezando, la guía es la pantalla. Pero en
    cuanto alguien tiene programa —la señal de que el arranque ya rodó— seguía
    ocupando el primer lugar de Inicio para siempre, por encima del trabajo del
    día. Con el arranque rodado se pliega a una línea: sigue diciendo cuánto
    queda y se puede desplegar, pero el trono es de las colas.
  */
  const rodado = pasos.some((p) => p.id === 'programar' && p.sabido && p.hecho);
  const pendientes = total - hechos;

  /* Sin nada pendiente, la guía sobra. No hay que cerrarla: se va. */
  if (cerrado || !actual) return null;

  const ocultar = () => {
    setCerrado(true);
    try {
      localStorage.setItem(key(userId), '1');
    } catch {
      /* Sin almacenamiento la guía volverá a salir. Es lo de menos y romper la
         pantalla por ello sería mucho peor. */
    }
  };

  if (rodado && !desplegada) {
    return (
      <div className="guia-linea">
        <Compass size={15} aria-hidden="true" />
        <span>
          Puesta en marcha: {pendientes === 1 ? 'te queda 1 paso' : `te quedan ${pendientes} pasos`}
        </span>
        <button type="button" className="cab-accion is-puerta" onClick={() => setDesplegada(true)}>
          Seguir
        </button>
        <button
          type="button"
          className="btn btn-icon"
          onClick={ocultar}
          aria-label="Ocultar la guía"
          title="Ocultar"
        >
          <X size={15} />
        </button>
      </div>
    );
  }

  /* A dónde lleva cada paso. El de invitar no navega: se resuelve aquí mismo. */
  const ir = () => {
    if (actual.id === 'alta') return navigate('/clientes');
    if (actual.id === 'protocolo') return navigate('/ajustes/protocolo');
    if (actual.id === 'programar' && actual.cliente) {
      return navigate(clientPath(actual.cliente.id, 'rutina'));
    }
    if (actual.id === 'invitar' && actual.cliente) return invitar(actual.cliente);
    return undefined;
  };

  return (
    <Panel className="col gap-4">
      <div className="row between wrap gap-2">
        <SectionTitle icon={Compass}>Por dónde empezar</SectionTitle>
        <div className="row gap-2">
          <span className="badge">
            {hechos} de {total}
          </span>
          <button
            type="button"
            className="btn btn-icon"
            onClick={ocultar}
            aria-label="Ocultar la guía"
            title="Ocultar"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* EL PASO: uno, con su porqué y su botón.

         Sin caja propia: la guía entera ya es una tarjeta y el paso ocupa casi
         toda su superficie, así que la caja hundida no separaba el paso de nada
         —solo repetía el marco un tono más oscuro—. Lo que lo separa del resto
         es el aire y que su botón sea el único primario de la tarjeta. */}
      <div className="col gap-2">
        <span className="t-sm" style={{ fontWeight: 650 }}>
          {actual.titulo}
        </span>
        <span className="t-xs t-secondary">{actual.texto}</span>

        <div className="row gap-2 wrap" style={{ marginTop: 'var(--s1)' }}>
          <button type="button" className="btn btn-primary btn-sm" disabled={invitando} onClick={ir}>
            {invitando ? 'Generando…' : actual.accion} <ArrowRight size={14} />
          </button>

          {/* El enlace se copia solo, y hay que decirlo: si no, el botón parece
              no haber hecho nada. */}
          {actual.id === 'invitar' && invite?.ok && (
            <span className="t-xs t-secondary">
              {invite.copied
                ? 'Enlace copiado. Mándaselo por WhatsApp.'
                : `Cópialo a mano: ${invite.url}`}
            </span>
          )}
          {invite?.ok === false && (
            <span className="t-xs" style={{ color: 'var(--negative)' }}>
              {invite.error}
            </span>
          )}
        </div>
      </div>

      {/* Y el resto, en una línea. Están para saber que existen, no para hacerse
          ahora: los de abajo dependen de éste. */}
      <button
        type="button"
        className="btn btn-sm login-alt"
        aria-expanded={verTodo}
        onClick={() => setVerTodo((v) => !v)}
      >
        {verTodo ? 'Ocultar los demás pasos' : 'Ver los cuatro pasos'}
      </button>

      {verTodo && (
        <ol className="col gap-2">
          {pasos.map((paso, i) => (
            <li key={paso.id} className="row gap-3" style={{ alignItems: 'flex-start' }}>
              <span className="list-icon" aria-hidden="true">
                {paso.sabido && paso.hecho ? <Check size={14} /> : i + 1}
              </span>
              <span className="col gap-1 grow" style={{ minWidth: 0 }}>
                <span className="t-sm" style={{ fontWeight: paso.id === actual.id ? 650 : 500 }}>
                  {paso.titulo}
                </span>
                {/* Lo que todavía no se puede saber se dice, en vez de marcarse
                    a la ligera: un paso mal marcado enseña a no fiarse. */}
                {!paso.sabido && <span className="t-2xs t-tertiary">Cuando tengas un cliente</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
};
