import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EyeOff, Layers, LayoutGrid, RotateCcw, SlidersHorizontal } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { momentosDelCliente } from '@/domain/acciones';
import { clientIntake, intakeProgress } from '@/domain/intake';
import { onboardingState } from '@/domain/onboardingState';
import { coachProtocolos, protocoloDeCliente } from '@/domain/protocolos';
import {
  CHECKIN_QUESTIONS,
  HIDDEN_INFO,
  MODULES,
  SESSION_QUESTIONS,
  activeQuestions,
  activeServices,
  checkinQuestions,
  clientProtocol,
  hidesFromClient,
  isModuleOn,
  isServiceOn,
  queLeLlevas,
} from '@/domain/protocol';
import { necesitaSuPlan, parchePara, protegidoDeSuPlan } from '@/lib/protocolTemplate';
import { PROTOCOL_HOME, clientPath } from '@/routes';
import { Notice } from '@/components/ui/primitives';
import { AlertsSection } from '@/components/Coach/Settings/Protocol/AlertsSection';
import { CheckinBlocksSection } from '@/components/Coach/Settings/Protocol/CheckinBlocksSection';
import { ModulesSection } from '@/components/Coach/Settings/Protocol/ModulesSection';
import { QuestionEditor } from '@/components/Coach/Settings/Protocol/QuestionEditor';
import { ServicesSection } from '@/components/Coach/Settings/Protocol/ServicesSection';
import { VisibilitySection } from '@/components/Coach/Settings/Protocol/VisibilitySection';
import { Renglones, TarjetaProtocolo } from './Taller/TarjetaProtocolo';
import { ProximasSalidas } from './Taller/LoQueSale';
import { LoQueLeHasMandado } from './ClientSettings';

/**
 * LA PESTAÑA «PROTOCOLO» DE UN CLIENTE (Figma 98:86, 18 sep).
 *
 * ══ Qué sustituye ══════════════════════════════════════════════════════════
 *
 * La hoja «El protocolo de X»: una ventana que se abría desde cuatro sitios —el
 * «···» de la cartera, la celda de su perfil, el pie del interruptor de la dieta
 * y el de los ajustes del programa— con once secciones seguidas dentro. Era el
 * sitio de verdad de lo que lleva puesto una persona, y vivía en una capa que
 * se cerraba. El dueño la quiso como página: «una ventana protocolo para
 * revisar de forma sencilla su protocolo».
 *
 * ══ Cómo se lee ════════════════════════════════════════════════════════════
 *
 * Arriba, la tarjeta de SU protocolo: cuál es, y un renglón por momento con su
 * cuándo y su cuánto, leídos de su copia (`momentosDelCliente`) y no del
 * protocolo del que sale — puede estar afinado a mano. Cada renglón se despliega
 * en su sitio con el mismo editor que tenía la hoja, y con el mismo guardado de
 * excepción: no hay dos editores del mismo objeto.
 *
 * Debajo, «Su app» —lo que tiene delante, que es un ESTADO— y lo que le has
 * mandado suelto. A la derecha, lo que le va a llegar.
 *
 * La pausa se queda en su perfil, que es donde ya estaba: no es protocolo, es
 * cuándo se le deja de contar.
 */
export const ProtocoloDelCliente = () => {
  const {
    activeClient: client,
    coachPrefs,
    equipment,
    checkIns,
    saveClientException,
    applyProtocolToClient,
  } = useApp();
  const navigate = useNavigate();
  const [abierto, setAbierto] = useState(null);
  const [cambiando, setCambiando] = useState(false);

  if (!client) return null;

  const nombre = client.name?.split(' ')[0] || client.name;
  const protocol = clientProtocol(client.preferences);
  const guardar = (next) => saveClientException(client.id, { protocol: next });

  const protocolos = coachProtocolos(coachPrefs);
  const suyo = protocoloDeCliente(coachPrefs, client);
  const atrasado = necesitaSuPlan(coachPrefs, client);
  const excepcion = protegidoDeSuPlan(coachPrefs, client);

  const intake = clientIntake(client.preferences);
  const progreso = intakeProgress(
    client,
    intake,
    onboardingState({ client, equipment, checkIn: checkIns?.[client.id] })
  );

  /* Cambiarle el protocolo APLICA en el mismo gesto: un selector que solo
     apunta dejaría al cliente «sin decidir y desviado», que `isProtected`
     protege a propósito. Venía así de la hoja y así se queda. */
  const cambiarProtocolo = async (id) => {
    setCambiando(true);
    const conNuevo = {
      ...client,
      preferences: { ...client.preferences, protocolId: id },
    };
    await applyProtocolToClient(client.id, parchePara(coachPrefs, conNuevo));
    setCambiando(false);
  };

  const ponerAlDia = async () => {
    setCambiando(true);
    await applyProtocolToClient(client.id, parchePara(coachPrefs, client));
    setCambiando(false);
  };

  const estado = excepcion
    ? `Afinado a mano para ${nombre}: ningún protocolo le pisa lo que le has cambiado.`
    : atrasado
      ? `Se ha quedado atrás: «${suyo?.name}» cambió después de ponérselo.`
      : `Lleva «${suyo?.name}» tal cual está.`;

  /* Lo que enseña cada renglón al desplegarse: el editor que ya existía. */
  const cuerpo = (id) => {
    if (id === 'alta') {
      return (
        <div className="row between wrap gap-3">
          <span className="t-sm t-secondary">
            {progreso.total === 0
              ? 'No le pides nada al entrar.'
              : progreso.complete
                ? `Terminada: ha hecho los ${progreso.total} pasos.`
                : `Lleva ${progreso.done} de ${progreso.total} pasos.`}
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() =>
              navigate(clientPath(client.id, 'ficha'), {
                state: { desde: 'protocolo', hoja: 'alta' },
              })
            }
          >
            Abrir su alta
          </button>
        </div>
      );
    }
    if (id === 'parte') {
      return (
        <QuestionEditor
          title="Qué le preguntas al terminar de entrenar"
          notice={
            !isModuleOn(protocol, 'sessionFeedback') && (
              <Notice tone="info">
                El parte está apagado, así que estas preguntas no se le harán. Enciéndelo en «Su
                app».
              </Notice>
            )
          }
          protocol={protocol}
          list="questions"
          catalogo={SESSION_QUESTIONS}
          questions={activeQuestions(protocol)}
          onSave={guardar}
          emptyText="No hay ninguna pregunta activa."
          addPlaceholder="Molestia en el hombro"
        />
      );
    }
    if (id === 'checkin') {
      const preguntas = checkinQuestions(protocol);
      return (
        <div className="col gap-5">
          <CheckinBlocksSection protocol={protocol} onSave={guardar} />
          <QuestionEditor
            title="Qué le preguntas al cerrar la semana"
            intro="Lo que la báscula no mide: si ha podido seguir el plan, si ha pasado hambre, si le siguen quedando ganas."
            notice={
              preguntas.length === 0 ? (
                <Notice tone="info">
                  Sin ninguna pregunta no hay cuestionario: su revisión termina en las fotos.
                </Notice>
              ) : null
            }
            protocol={protocol}
            list="checkinQuestions"
            catalogo={CHECKIN_QUESTIONS}
            questions={preguntas}
            onSave={guardar}
            emptyText="Todavía no le preguntas nada al cerrar la semana."
            addPlaceholder="Cómo has llevado las comidas fuera"
          />
        </div>
      );
    }
    return <AlertsSection client={client} protocol={protocol} onSave={guardar} />;
  };

  /*
    «Su app», en los mismos renglones que su protocolo. Eran tres secciones
    abiertas —doce interruptores seguidos— que ocupaban la mitad de la página
    y empujaban lo mandado fuera de la vista; plegadas dicen lo mismo en tres
    líneas y se abren donde están. Un solo tono para las tres: son de la misma
    clase, un ESTADO de lo que tiene delante.
  */
  const piezas = MODULES.filter((m) => isServiceOn(protocol, m.area));
  const encendidas = piezas.filter((m) => isModuleOn(protocol, m.id)).length;
  const ocultas = HIDDEN_INFO.filter(
    (info) =>
      (info.area !== 'nutrition' || isServiceOn(protocol, 'nutrition')) &&
      hidesFromClient(protocol, info.id)
  );
  const suApp = [
    {
      id: 'llevas',
      rot: 'Qué le llevas',
      cuando: '',
      cuanto: queLeLlevas(protocol) || 'Nada',
      apagado: !queLeLlevas(protocol),
      icono: Layers,
      tono: 5,
    },
    {
      id: 'piezas',
      rot: 'Las piezas',
      cuando: '',
      cuanto: `${encendidas} de ${piezas.length} encendidas`,
      apagado: encendidas === 0,
      icono: LayoutGrid,
      tono: 5,
    },
    {
      id: 'oculto',
      rot: `Qué no ve ${nombre}`,
      cuando: '',
      cuanto:
        ocultas.length === 0
          ? 'Lo ve todo'
          : `${ocultas.length} ${ocultas.length === 1 ? 'cifra oculta' : 'cifras ocultas'}`,
      apagado: ocultas.length === 0,
      icono: EyeOff,
      tono: 5,
    },
  ];
  const cuerpoSuApp = (id) =>
    id === 'llevas' ? (
      <ServicesSection protocol={protocol} onSave={guardar} desnudo />
    ) : id === 'piezas' ? (
      <ModulesSection protocol={protocol} onSave={guardar} desnudo />
    ) : (
      <VisibilitySection client={client} protocol={protocol} onSave={guardar} />
    );

  return (
    <div className="proto-pagina">
      <div className="proto-pagina-cab">
        <h1 className="proto-pagina-tit">Protocolo</h1>
        {/* La vuelta a la plantilla: la pregunta que sigue a «esto lo hago
            distinto con él» es casi siempre «¿y qué tengo puesto para todos?». */}
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => navigate(PROTOCOL_HOME, { state: { abrir: suyo?.id } })}
        >
          <SlidersHorizontal size={15} /> Ver «{suyo?.name}»
        </button>
      </div>

      <div className="proto-pagina-cuerpo">
        <div className="proto-pagina-main">
          <section className="proto-bloque">
            <p className="proto-rotulo">Su protocolo</p>
            <TarjetaProtocolo
              activo
              nombre={suyo?.name || 'Sin protocolo'}
              servicios={activeServices(protocol).map((s) => s.label)}
              cifras={
                protocolos.length > 1 && (
                  <select
                    className="select select-sm"
                    value={suyo?.id || ''}
                    disabled={cambiando}
                    aria-label={`Cambiar el protocolo de ${nombre}`}
                    onChange={(e) => cambiarProtocolo(e.target.value)}
                  >
                    {protocolos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )
              }
              momentos={momentosDelCliente(client.preferences)}
              abierto={abierto}
              onMomento={(id) => setAbierto((a) => (a === id ? null : id))}
              cuerpo={cuerpo}
            />
            <div className="proto-pie">
              <span>
                {estado}
                {protocolos.length > 1 && ' Cambiar de protocolo se lo aplica al momento.'}
              </span>
              {atrasado && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={cambiando}
                  onClick={ponerAlDia}
                >
                  <RotateCcw size={15} /> Ponerle al día
                </button>
              )}
            </div>
          </section>

          {/* Lo que tiene delante al abrir su app: un estado, no algo que le
              pasa. Es una copia suya y cambiarla no le toca nada a nadie más. */}
          <section className="proto-bloque">
            <p className="proto-rotulo">Su app</p>
            <Renglones
              items={suApp}
              abierto={abierto}
              onPulsar={(id) => setAbierto((a) => (a === id ? null : id))}
              cuerpo={cuerpoSuApp}
            />
          </section>

          <section className="proto-bloque">
            <p className="proto-rotulo">Envíos puntuales</p>
            <LoQueLeHasMandado client={client} variante="tarjeta" />
          </section>
        </div>

        <ProximasSalidas clientId={client.id} />
      </div>
    </div>
  );
};
