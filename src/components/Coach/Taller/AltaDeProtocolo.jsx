import { useEffect, useMemo, useState } from 'react';
import { Check, Users } from 'lucide-react';

import { MAX_PROTOCOLO_NAME, clientProtocoloId } from '@/domain/protocolos';
import { parchePara } from '@/lib/protocolTemplate';
import { Field, Notice, TextInput } from '@/components/ui/primitives';
import { ServicesSection } from '@/components/Coach/Settings/Protocol/ServicesSection';
import { ModulesSection } from '@/components/Coach/Settings/Protocol/ModulesSection';

/**
 * MONTAR UN PROTOCOLO ES UN CAMINO, y ahora se recorre SIN CAMBIAR DE MUEBLE.
 *
 * ══ Lo que pasaba ══════════════════════════════════════════════════════════
 *
 * El camino era el bueno —① qué le llevas, ② las acciones, ③ a quién— pero
 * estaba repartido en tres muebles distintos: una ventana, una pantalla y otra
 * ventana. Y se notaba en el salto: pulsabas «Seguir», la ventana desaparecía
 * de golpe y aparecía una pantalla entera que no se parecía en nada a lo que
 * acababas de dejar. «Como si fuesen elementos separados» (dueño, 14 sep).
 *
 * Peor: una vez dentro, el paso que acababas de dar —«Qué lleva»— reaparecía
 * como un botón arriba a la derecha, o sea en el sitio de lo que viene DESPUÉS,
 * al lado del verbo de la pantalla. Volver al paso anterior parecía avanzar.
 *
 * ══ El camino, ahora ═══════════════════════════════════════════════════════
 *
 *     ① Qué lleva   →   ② Las acciones   →   ③ Quién lo lleva
 *
 * Los tres son TRAMOS de la misma pantalla, en el raíl de su cinta, con su
 * número. No hay ventana que se cierre ni pantalla que aparezca: cambia lo de
 * debajo del raíl, que es lo que hace cualquier producto con un camino de tres
 * paradas. Volver al ① es pulsar el ①.
 *
 * Lo que queda aquí son los dos cuerpos que no son el banco de acciones. El ②
 * sigue viviendo en `ProtocolosPanel` porque es la pantalla misma.
 *
 * ── Y nada se escribe hasta «Seguir» ──────────────────────────────────────
 * Un protocolo nuevo se recorre igual, pero vive en memoria (el `borrador` del
 * panel) hasta que se pulsa «Seguir» en el paso ①: cerrar sin terminar no deja
 * un protocolo huérfano en la lista. Por eso `QueLleva` sabe si lo que edita es
 * un borrador: en un borrador cada tecla se guarda en el acto —no cuesta nada,
 * es memoria— y en uno de verdad el nombre se escribe al soltar el campo, que
 * si no sería una escritura en la cuenta por letra tecleada.
 */

/** ① Qué lleva: cómo se llama, qué le llevas y con qué piezas. */
export const QueLleva = ({ protocolo, onCambiar, borrador = false }) => {
  const [nombre, setNombre] = useState(protocolo.name);
  useEffect(() => {
    setNombre(protocolo.name);
  }, [protocolo.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const escribir = (v) => {
    setNombre(v);
    if (borrador) onCambiar({ ...protocolo, name: v });
  };

  /* Al soltar el campo, y solo si ha cambiado: un protocolo ya guardado vive en
     las preferencias de la cuenta, así que escribir por tecla serían sesenta
     guardados para poner un nombre. Vaciarlo no borra el nombre —devuelve el
     que había—, que es lo que hace `RenombrarEnSitio` en la lista. */
  const soltar = () => {
    if (borrador) return;
    const n = nombre.trim();
    if (n && n !== protocolo.name) onCambiar({ ...protocolo, name: n });
    else if (!n) setNombre(protocolo.name);
  };

  /*
    Dos columnas, y no por llenar: son las dos preguntas del paso —qué le
    llevas y con qué piezas—, y la segunda depende de la primera. El porqué de
    la medida, y de que el nombre vaya dentro de la izquierda, en `.proto-rejilla`.

    Las dos secciones dejan de ir `desnudo`. Lo estaban porque este paso vivía
    en una ventana, donde la ventana YA es la tarjeta; ahora es media pantalla,
    y dos listas sueltas una al lado de la otra no se leen como dos preguntas,
    se leen como una lista que se ha partido sola.
  */
  return (
    <div className="proto-rejilla">
      <div className="col gap-5">
        <Field
          label="Cómo lo llamas"
          hint="Solo lo ves tú."
          hintArriba
          className="proto-nombre"
        >
          {(props) => (
            <TextInput
              {...props}
              value={nombre}
              onChange={escribir}
              onBlur={soltar}
              maxLength={MAX_PROTOCOLO_NAME}
              autoFocus={borrador}
              placeholder="Pérdida de grasa"
            />
          )}
        </Field>

        <ServicesSection
          protocol={protocolo}
          onSave={(next) => onCambiar({ ...protocolo, ...next })}
          title="Qué le llevas"
        />
      </div>

      <ModulesSection
        protocol={protocolo}
        onSave={(next) => onCambiar({ ...protocolo, ...next })}
      />
    </div>
  );
};

/**
 * ③ Quién lo lleva.
 *
 * ══ Por qué se puede cambiar de aquí y no solo desde cada ficha ════════════
 *
 * Porque la pregunta que sigue a «ya lo tengo montado» es «¿y a quién?», y la
 * respuesta estaba a una ficha por persona. Con doce clientes en pérdida de
 * grasa eso son doce ventanas.
 *
 * ── Y se APLICA, no se apunta ─────────────────────────────────────────────
 * Es la misma decisión que ya estaba tomada en la ficha (`ClientSettings`):
 * apuntar sin escribir deja al cliente «sin decidir y desviado», o sea con lo de
 * antes puesto y fuera del alcance de «poner al día». Un selector que no cambia
 * nada es peor que no tenerlo.
 *
 * ── Los que ya lo llevan no se pueden desmarcar ───────────────────────────
 * Porque «quitarle este protocolo» no es una operación: todo cliente lleva uno.
 * Lo que hay es ponerle OTRO, y eso se hace desde el otro protocolo o desde su
 * ficha. Enseñarlos marcados y quietos dice las dos cosas —quién lo lleva ya y
 * que aquí no se le toca— sin escribir un aviso.
 *
 * ── Y aquí vive el azul de la pantalla ────────────────────────────────────
 * Era el verbo de la cinta, y ahora la cinta lleva el raíl del camino: un raíl
 * no es un botón, así que el acento baja a donde de verdad ocurre la acción.
 * Sigue habiendo UNO solo en toda la pantalla.
 */
export const AQuienSeLoPones = ({
  protocolo,
  clients = [],
  coachPrefs,
  aplicarACliente,
  onHecho,
}) => {
  const [marcados, setMarcados] = useState([]);
  const [yendo, setYendo] = useState(false);
  const [aviso, setAviso] = useState(null);

  const { suyos, otros } = useMemo(() => {
    const dentro = [];
    const fuera = [];
    for (const c of clients) {
      (clientProtocoloId(c.preferences) === protocolo.id ? dentro : fuera).push(c);
    }
    return { suyos: dentro, otros: fuera };
  }, [clients, protocolo.id]);

  const ponerselo = async () => {
    const gente = otros.filter((c) => marcados.includes(c.id));
    if (gente.length === 0) return;
    setAviso(null);
    setYendo(true);
    let fallos = 0;

    /* En tandas de tres, como «poner al día» y como el cambio de cita: con una
       cartera grande, cincuenta RPCs a la vez son cincuenta conexiones
       peleándose y aquí nadie tiene prisa. */
    for (let i = 0; i < gente.length; i += 3) {
      const res = await Promise.allSettled(
        gente.slice(i, i + 3).map((c) =>
          aplicarACliente(
            c.id,
            parchePara(coachPrefs, {
              ...c,
              preferences: { ...c.preferences, protocolId: protocolo.id },
            })
          )
        )
      );
      fallos += res.filter((r) => r.status !== 'fulfilled' || !r.value?.ok).length;
    }

    setYendo(false);
    const hechos = gente.length - fallos;
    setMarcados(fallos === 0 ? [] : gente.slice(hechos).map((c) => c.id));
    if (fallos > 0) setAviso(`Se lo has puesto a ${hechos}; ha fallado en ${fallos}.`);
    if (hechos > 0) onHecho({ hechos });
  };

  return (
    <div className="col gap-4 proto-paso">
      {aviso && <Notice tone="error">{aviso}</Notice>}

      {/* Quién lo lleva ya, con los nombres mientras quepan: con tres es lo que
          hace falta saber, con quince la cifra sola y la lista está en la
          cartera, que es donde se filtra por protocolo. */}
      <p className="t-sm t-secondary" style={{ margin: 0 }}>
        {suyos.length === 0
          ? 'No lo lleva nadie.'
          : suyos.length <= 3
            ? `Lo llevan ${suyos.map((c) => c.name).join(', ')}.`
            : `Lo llevan ${suyos.length} clientes.`}
      </p>

      {otros.length === 0 ? (
        <p className="ajustes-nada">
          {clients.length === 0
            ? 'Da de alta a alguien y aparecerá aquí.'
            : 'Ya lo llevan todos.'}
        </p>
      ) : (
        <>
          <ul className="mandar-gente">
            {otros.map((c) => {
              const puesto = marcados.includes(c.id);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    className="mandar-quien"
                    aria-pressed={puesto}
                    disabled={yendo}
                    onClick={() =>
                      setMarcados((prev) =>
                        puesto ? prev.filter((x) => x !== c.id) : [...prev, c.id]
                      )
                    }
                  >
                    <span className="mandar-tic" aria-hidden="true">
                      {puesto && <Check size={13} />}
                    </span>
                    {c.name}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="row between gap-3 wrap">
            {/* La consecuencia, al lado del botón y no tres párrafos antes de la
                lista: lo que se marca aquí se escribe en la ficha de esa persona
                en cuanto pulsas. */}
            <span className="t-xs t-tertiary">
              Se lo pones al pulsar. Lo que le hayas cambiado en su ficha se respeta.
            </span>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={marcados.length === 0 || yendo}
              onClick={ponerselo}
            >
              <Users size={15} />
              {/* Sin nadie marcado dice el verbo a secas: «Ponérselo a 0» es una
                  cifra dentro de un botón apagado, o sea un dato donde va una
                  acción. */}
              {yendo
                ? 'Poniéndoselo…'
                : marcados.length === 0
                  ? 'Ponérselo'
                  : `Ponérselo a ${marcados.length}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
};
