import { useState } from 'react';

import { useApp } from '@/context/AppContext';
import {
  PERIMETER_LABELS,
  buildAnthropometryLog,
  chronological,
  emptyPerimeters,
} from '@/domain/anthropometry';
import { toNum } from '@/lib/num';
import { todayISO } from '@/lib/dates';
import {
  BotonAccion,
  Field,
  Notice,
  NumberInput,
  Panel,
  useAccionDeBoton,
} from '@/components/ui/primitives';

/**
 * Sus medidas de partida: los perímetros del día 0, tomados por el cliente.
 *
 * ══ Lo que sustituye ═══════════════════════════════════════════════════════
 * Las medidas iniciales llegaban por WhatsApp y las tecleaba el entrenador en
 * la antropometría — o no llegaban, y la primera medición de verdad era la de
 * la semana 4. Aquí caen directas en su serie (`anthropometry`), por la misma
 * puerta que usa todo lo demás, como PRIMERA medición.
 *
 * ══ Solo perímetros, y a propósito ═════════════════════════════════════════
 * Los pliegues piden un plicómetro y una mano entrenada: pedírselos a alguien
 * en su casa produce números que parecen datos. La cinta métrica sí la sabe
 * usar cualquiera con la foto de dónde medir, que es lo que dicen las pistas.
 *
 * ══ Una vez, y después lo lleva quien mide ═════════════════════════════════
 * Es el punto de partida. En cuanto hay perímetros en su serie, este bloque
 * desaparece del alta: las mediciones siguientes las toma el entrenador (o su
 * check-in, si lo pide), y dos sitios donde medirse son dos cifras que no
 * coinciden. La misma regla que el peso en «Quién eres».
 */
export const IntakeMeasures = ({ client }) => {
  const { anthropometry, addAnthropometryLog } = useApp();

  const historia = anthropometry?.[client.id]?.history || [];
  const yaMedido = chronological(historia).some(
    (h) => h.perimeters && Object.keys(h.perimeters).length > 0
  );

  const [form, setForm] = useState(emptyPerimeters);
  const guardado = useAccionDeBoton();
  const [aviso, setAviso] = useState(null);
  const [tocado, setTocado] = useState(false);

  /* Ya hay una medición: el punto de partida existe y esto no pinta nada. */
  if (yaMedido) return null;

  const puestas = Object.values(form).filter((v) => toNum(v) !== null).length;

  const set = (campo) => (valor) => {
    setTocado(true);
    setForm((f) => ({ ...f, [campo]: valor }));
  };

  const guardar = (e) => {
    e.preventDefault();
    if (puestas === 0) return;
    guardado.lanzar(async () => {
      setAviso(null);
      /* Sin peso: el peso de partida entra por «Quién eres» y dos cajas para el
         mismo dato son las dos cifras que no coinciden. `weight: null` no
         ensucia su serie — la gráfica de peso solo lee pesajes de verdad. */
      addAnthropometryLog(
        client.id,
        buildAnthropometryLog({ date: todayISO(), weight: null, perimeters: form })
      );
      setTocado(false);
      setAviso({
        tone: 'success',
        text: 'Guardadas. Son tu punto de partida: contra ellas se compara lo que venga.',
      });
      return true;
    });
  };

  return (
    <Panel
      title="Tus medidas de partida"
      sub="Con una cinta métrica, sin apretar. Pon las que puedas: contra estas se compara todo lo que venga."
      className="col gap-4"
      action={<span className="badge">{puestas} de {Object.keys(PERIMETER_LABELS).length}</span>}
    >
      {aviso && <Notice tone={aviso.tone}>{aviso.text}</Notice>}

      <form className="col gap-4" onSubmit={guardar}>
        <div className="grid-2">
          {Object.entries(PERIMETER_LABELS).map(([id, label]) => (
            <Field key={id} label={label}>
              {(props) => (
                <div className="input-suffix">
                  <NumberInput
                    {...props}
                    center={false}
                    placeholder="Ej.: 92,5"
                    value={form[id]}
                    onChange={set(id)}
                  />
                  <span aria-hidden="true">cm</span>
                </div>
              )}
            </Field>
          ))}
        </div>

        <div className={`form-bar${tocado ? ' is-dirty' : ''}`}>
          <span className="t-xs t-secondary" style={{ minWidth: 0 }}>
            {tocado
              ? 'Tienes medidas sin guardar.'
              : 'No hace falta ponerlas todas: guarda las que tengas.'}
          </span>
          <BotonAccion
            type="submit"
            className="btn btn-primary btn-sm shrink-0"
            estado={guardado.estado}
            disabled={!tocado || puestas === 0}
          >
            Guardar
          </BotonAccion>
        </div>
      </form>
    </Panel>
  );
};
