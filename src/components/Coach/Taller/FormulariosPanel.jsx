import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Copy, Plus, Send, SlidersHorizontal, SquarePen, Text, Trash2 } from 'lucide-react';

import { useActions, useApp } from '@/context/AppContext';
import {
  MAX_FORMULARIOS,
  MOMENTOS,
  buildFormulario,
  coachFormularios,
  formulariosToPreferences,
  resumenFormulario,
} from '@/domain/formularios';
import { PLANTILLAS, cuentaElementos, duplicarElementos, elementosDePlantilla } from '@/domain/formulario';
import { coachProtocolos } from '@/domain/protocolos';
import { agrupar, cuantasPorSalir } from '@/domain/envios';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useToast } from '@/components/ui/ToastProvider';
import { EmptyState, RenombrarEnSitio } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { MandarAlgo } from '@/components/Coach/MandarAlgo';
import { Cinta } from '@/components/ui/Cinta';
import { EditorDeFormulario } from './EditorDeFormulario';

/**
 * TUS FORMULARIOS: todo lo que le preguntas a un cliente, en un solo sitio.
 *
 * ══ Qué cambia, y por qué era necesario ════════════════════════════════════
 *
 * Esta pantalla tenía UNA tabla de altas y, debajo, un pie con dos enlaces que
 * avisaban de que el check-in y el parte de la sesión se configuraban en otra
 * pantalla. Un cajón que avisa de que dos de sus tres cosas están en otro cajón
 * no es un cajón: es un índice. Los tres viven aquí desde entonces.
 *
 * ══ Y ahora hay un CUARTO, que no tiene momento ════════════════════════════
 *
 * Los tres primeros son del protocolo: se preguntan al entrar, al terminar de
 * entrenar o cada semana, y el protocolo los coloca en una casilla por momento.
 * Había exactamente tres casillas, así que un cuestionario que no fuera uno de
 * esos tres —«hábitos de sueño», «se va de viaje», «pásame tus marcas»— se podía
 * crear y no tenía dónde vivir.
 *
 * El suelto no sabe cuándo se pide ni a quién: eso lo dice el envío. Aquí solo
 * se fabrica. Por eso la columna de la derecha dice dos cosas distintas según la
 * fila: de los tres primeros, qué protocolo los pide; del suelto, si tiene algún
 * envío vivo.
 *
 * ── Y el vacío es la galería ──────────────────────────────────────────────
 * Un formulario suelto nuevo no nace en blanco a secas ni con diez preguntas
 * puestas: nace con la elección de por dónde empezar. «En blanco» es la primera
 * de la galería, no la única salida.
 */

const ICONO_MOMENTO = { alta: Text, sesion: SlidersHorizontal, semana: Camera, libre: Send };

/* El matiz de cada momento, por el mecanismo que ya usan el avatar y las
   etiquetas de la cartera (`data-tono` + un tono de la rueda). NO se usa la
   paleta de datos: ésa es del dato dentro de un gráfico, y el cromo no tiene
   color salvo el acento. */
const TONO_MOMENTO = { alta: 4, sesion: 2, semana: 5, libre: 1 };

export const FormulariosPanel = () => {
  const { coachPrefs, envioRows } = useApp();
  const { updateCoachPreferences } = useActions();
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();

  /*
    ── Y YA NO LLEGA ABIERTO DESDE EL PROTOCOLO ────────────────────────────

    Aquí había un `volver` que recordaba de qué protocolo se venía, escrito a
    propósito para que la flecha de atrás no te dejara tirado en la lista. Ese
    viaje ya no existe: el formulario de una acción se edita DENTRO del
    protocolo, sin cambiar de pantalla (ver `EditorDeFormulario`). Cuando hay
    que programar el camino de vuelta, el viaje sobraba.
  */
  const [abierto, setAbierto] = useState(null);
  const [renombrando, setRenombrando] = useState(null);
  /* `null` · `'momento'` · `'plantilla'`: crear un suelto son dos pasos, y el
     segundo es el que de verdad enseña el producto. */
  const [creando, setCreando] = useState(null);
  const [mandando, setMandando] = useState(null);

  const formularios = coachFormularios(coachPrefs);
  const form = formularios.find((f) => f.id === abierto) || null;

  /*
    Quién usa cada formulario. Se calcula sobre los protocolos y no se guarda en
    ninguna parte: es una consulta, no un dato — guardarla sería la segunda copia
    de una verdad que ya tiene dueño, y se desincronizaría a la primera vez que
    alguien cambie un protocolo desde otra pantalla.
  */
  const usos = useMemo(() => {
    const out = {};
    for (const p of coachProtocolos(coachPrefs)) {
      for (const id of [p.forms?.alta, p.forms?.sesion, p.forms?.semana]) {
        if (!id) continue;
        out[id] = [...(out[id] || []), { id: p.id, name: p.name }];
      }
    }
    return out;
  }, [coachPrefs]);

  /* Los envíos vivos de cada suelto: es su equivalente de «lo usan». */
  const envios = useMemo(() => {
    const out = {};
    for (const e of agrupar(envioRows || [])) {
      if (!e.formId) continue;
      out[e.formId] = [...(out[e.formId] || []), e];
    }
    return out;
  }, [envioRows]);

  const guardarLista = (lista) =>
    updateCoachPreferences('formularios', formulariosToPreferences(lista));

  const guardarUno = (siguiente) =>
    guardarLista(formularios.map((f) => (f.id === siguiente.id ? siguiente : f)));

  const crear = ({ momento, name, elementos = null }) => {
    setCreando(null);
    if (formularios.length >= MAX_FORMULARIOS) {
      toast({ text: `Ya tienes ${MAX_FORMULARIOS} formularios, que es el tope.` });
      return;
    }
    const creado = buildFormulario({ name, momento, elementos });
    guardarLista([...formularios, creado]);
    setAbierto(creado.id);
  };

  const nuevoDelProtocolo = (momento) => {
    const cuantos = formularios.filter((f) => f.momento === momento).length;
    const base = MOMENTOS.find((m) => m.id === momento).corto;
    crear({ momento, name: cuantos > 0 ? `${base} ${cuantos + 1}` : base });
  };

  const duplicar = (f) => {
    if (f.momento !== 'libre') return;
    crear({ momento: 'libre', name: `${f.name} (copia)`, elementos: duplicarElementos(f.elementos) });
  };

  const quitar = async (f) => {
    const quien = usos[f.id] || [];
    const vivos = envios[f.id] || [];
    const ok = await confirm({
      title: `¿Quitar «${f.name}»?`,
      message: quien.length
        ? `Lo usa ${quien.map((q) => q.name).join(' y ')}. Al quitarlo, ese protocolo deja de pedirlo. Quien ya lo contestó conserva su copia: no se pierde ninguna respuesta.`
        : vivos.length
          ? `Tiene ${vivos.length === 1 ? 'un envío' : `${vivos.length} envíos`} hecho${vivos.length === 1 ? '' : 's'}. Lo mandado sigue en pie y lo contestado se conserva: esto solo lo quita de tu lista.`
          : 'No lo pide ningún protocolo y no lo has mandado nunca, así que no cambia nada para nadie.',
      confirmLabel: 'Quitarlo',
      tone: 'danger',
    });
    if (!ok) return;
    guardarLista(formularios.filter((x) => x.id !== f.id));
  };

  if (form) {
    return (
      <>
        <EditorDeFormulario
          formId={form.id}
          onVolver={() => setAbierto(null)}
          onMandar={form.momento === 'libre' ? () => setMandando(form) : null}
        />
        {mandando && <MandarAlgo formulario={mandando} onCerrar={() => setMandando(null)} />}
      </>
    );
  }

  return (
    <div className="stack cascada">
      <div className="taller">
        {/*
          ── LA MISMA CINTA QUE EL PROTOCOLO, con el tramo puesto ───────────

          Esta pantalla dejó de ser una puerta del Taller: es el tercer tramo de
          Protocolos, y por eso la banda dice «Protocolos» y no «Formularios».
          El tramo ES la ruta —`/formularios` sigue existiendo—, igual que en la
          Librería, así que cambiar de tramo navega y el botón de atrás hace lo
          que tiene que hacer.

          El porqué está en el protocolo: dos puertas para una sola partida, y
          cada una explicando por escrito qué mitad del trabajo le tocaba.
        */}
        <Cinta
          titulo="Protocolos"
          tramos={[
            { id: 'protocolos', label: 'Protocolos' },
            { id: 'sale', label: 'Lo que sale', n: cuantasPorSalir(envioRows || []) },
            { id: 'formularios', label: 'Formularios', n: formularios.length },
          ]}
          tramo="formularios"
          onTramo={(id) =>
            id !== 'formularios' && navigate('/protocolos', { state: { tramo: id } })
          }
          accion={
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setCreando('momento')}
            >
              <Plus size={15} /> Nuevo formulario
            </button>
          }
        />

        <div className="cartera-cuerpo">
          {formularios.length === 0 ? (
            <EmptyState
              icon={SquarePen}
              title="Todavía no le preguntas nada"
              message="Un formulario de alta es lo que sustituye al Word de trece páginas que va por correo."
            />
          ) : (
            <div className="plantilla">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Formulario</th>
                    <th scope="col">Cuándo</th>
                    <th scope="col">Lleva</th>
                    <th scope="col">Lo piden</th>
                    <th scope="col" aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody>
                  {formularios.map((f) => {
                    const Icono = ICONO_MOMENTO[f.momento] || Text;
                    const quien = usos[f.id] || [];
                    const vivos = envios[f.id] || [];
                    const suelto = f.momento === 'libre';
                    return (
                      <tr key={f.id}>
                        <td>
                          {renombrando === f.id ? (
                            <RenombrarEnSitio
                              value={f.name}
                              onRename={(name) => guardarUno({ ...f, name })}
                              onDone={() => setRenombrando(null)}
                              label="el nombre del formulario"
                            />
                          ) : (
                            <span className="p-name f-nombre">
                              <span className="f-disco" data-tono={TONO_MOMENTO[f.momento]} aria-hidden="true">
                                <Icono size={13} />
                              </span>
                              <button
                                type="button"
                                className="p-abrir"
                                onClick={() => setAbierto(f.id)}
                              >
                                {f.name}
                              </button>
                            </span>
                          )}
                        </td>
                        <td>{MOMENTOS.find((m) => m.id === f.momento)?.corto}</td>
                        <td>{resumenFormulario(f)}</td>
                        <td>
                          {suelto ? (
                            vivos.length > 0 ? (
                              <span className="badge badge-info">
                                {vivos.length === 1 ? '1 envío' : `${vivos.length} envíos`}
                              </span>
                            ) : (
                              <span className="t-tertiary">Sin mandar</span>
                            )
                          ) : quien.length > 0 ? (
                            /* El nombre del protocolo LLEVA al protocolo. Era
                               texto plano, y saber quién pide un formulario sin
                               poder ir a verlo deja el viaje a medias. */
                            <span className="row gap-2 wrap">
                              {quien.map((q) => (
                                <button
                                  key={q.id}
                                  type="button"
                                  className="link"
                                  onClick={() => navigate('/protocolos', { state: { abrir: q.id } })}
                                >
                                  {q.name}
                                </button>
                              ))}
                            </span>
                          ) : (
                            <span className="badge badge-warn">Ningún protocolo lo pide</span>
                          )}
                        </td>
                        <td>
                          <span className="row">
                            {suelto && (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-icon"
                                  aria-label={`Mandar ${f.name}`}
                                  title="Mandarlo"
                                  disabled={cuentaElementos(f.elementos) === 0}
                                  onClick={() => setMandando(f)}
                                >
                                  <Send size={15} />
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-icon"
                                  aria-label={`Duplicar ${f.name}`}
                                  title="Duplicarlo"
                                  onClick={() => duplicar(f)}
                                >
                                  <Copy size={15} />
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              className="btn btn-icon"
                              aria-label={`Renombrar ${f.name}`}
                              onClick={() => setRenombrando(f.id)}
                            >
                              <SquarePen size={15} />
                            </button>
                            <button
                              type="button"
                              className="btn btn-icon btn-icon-danger"
                              aria-label={`Quitar ${f.name}`}
                              onClick={() => quitar(f)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/*
            El pie decía «Aquí se escriben; qué protocolo usa cada uno —y a quién
            se le manda— se decide en Protocolos». Una pantalla que necesita una
            nota para explicar qué mitad del trabajo le toca está partida por
            donde no debía, y ya no lo está: los tres tramos son la misma puerta
            y el formulario de una acción se escribe dentro de su protocolo.
          */}
          <p className="t-xs t-tertiary taller-pie">
            {formularios.length} de {MAX_FORMULARIOS}. Un formulario dice QUÉ le preguntas; cuándo
            se le pide lo dice el protocolo que lo usa.
          </p>
        </div>
      </div>

      {/*
        Paso 1. Crear pregunta por el MOMENTO y no por el nombre: el momento
        decide qué se puede poner dentro (el catálogo, los enchufes, las clases
        de pregunta) y no se puede cambiar después sin vaciar el formulario. El
        nombre se pone luego, en sitio, como en el resto del producto.
      */}
      {creando === 'momento' && (
        <Modal size="md" title="¿Cuándo se lo preguntas?" onClose={() => setCreando(null)}>
          <div className="momentos">
            {MOMENTOS.map((m) => {
              const Icono = ICONO_MOMENTO[m.id];
              return (
                <button
                  key={m.id}
                  type="button"
                  className="pieza"
                  onClick={() => (m.id === 'libre' ? setCreando('plantilla') : nuevoDelProtocolo(m.id))}
                >
                  <span className="f-disco" data-tono={TONO_MOMENTO[m.id]} aria-hidden="true">
                    <Icono size={13} />
                  </span>
                  <span className="pieza-texto">
                    <span className="pieza-nom">{m.label}</span>
                    <span className="pieza-dice">{m.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Modal>
      )}

      {/* Paso 2, solo para el suelto: por dónde empezar. */}
      {creando === 'plantilla' && (
        <Modal size="lg" title="¿Qué quieres preguntar?" onClose={() => setCreando(null)}>
          <div className="col gap-4">
            <div className="galeria">
              {PLANTILLAS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="plantilla-carta"
                  onClick={() =>
                    crear({ momento: 'libre', name: p.name, elementos: elementosDePlantilla(p.id) })
                  }
                >
                  <span className="plantilla-nom">{p.name}</span>
                  <span className="plantilla-dice">{p.dice}</span>
                </button>
              ))}
            </div>

            {formularios.some((f) => f.momento === 'libre') && (
              <div className="col gap-2">
                <span className="ajustes-rot">O duplica uno tuyo</span>
                <div className="row gap-2 wrap">
                  {formularios
                    .filter((f) => f.momento === 'libre')
                    .map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => duplicar(f)}
                      >
                        <Copy size={13} /> {f.name}
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {mandando && <MandarAlgo formulario={mandando} onCerrar={() => setMandando(null)} />}
    </div>
  );
};
