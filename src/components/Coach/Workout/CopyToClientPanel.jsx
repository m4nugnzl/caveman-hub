import { useState } from 'react';
import { Copy, Layers, Salad, Waves } from 'lucide-react';

import { unitLabelPlural } from '@/domain/training';
import { Field, Notice, OptionCard, Panel } from '@/components/ui/primitives';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useToast } from '@/components/ui/ToastProvider';

/**
 * Réplica de un cliente a otro.
 *
 * Antes solo copiaba días o semanas del entrenamiento, y dejaba fuera la
 * estructura semanal y el tipo de ciclo — así que el programa llegaba a medias:
 * los días existían pero no la planificación de la semana. Y no había forma de
 * traerse la dieta, que es la otra mitad del trabajo cuando montas a un cliente
 * nuevo como otro que ya tienes.
 *
 * Ahora se elige **entrenamiento, dieta o las dos cosas**. Copiar SUSTITUYE lo
 * que el destino tuviera de esos bloques, así que la confirmación lo dice
 * explícitamente antes de tocar nada.
 *
 * ── El mismo panel, con un solo bloque ──────────────────────────────────────
 * `bloques` dice qué se ofrece. Entreno lo abre con los tres; Dieta lo abre con
 * `['diet']`, porque allí la pregunta no es «qué me llevo» sino «de quién»:
 * ofrecer desde la dieta sustituir doce semanas de programa sería abrir una
 * puerta a otra sección. Con un solo bloque no hay nada que elegir —viene
 * marcado y el selector no se pinta—, pero la confirmación, los tres finales y
 * el aviso de qué se sustituye son exactamente los mismos.
 */
export const CopyToClientPanel = ({
  clients,
  activeClient,
  cycleType,
  weekCount,
  hasProgram,
  hasDiet,
  hasWarmup,
  conNutricion = true,
  bloques = ['training', 'warmup', 'diet'],
  onReplicate,
  onClose,
}) => {
  const confirm = useConfirm();
  const toast = useToast();
  const [sourceId, setSourceId] = useState('');
  /*
    ══ Nada viene marcado ═════════════════════════════════════════════════════

    Copiar SUSTITUYE lo que el destino tuviera, así que llegar con una casilla ya
    puesta es llegar armado: basta con elegir de quién y pulsar para reemplazar
    doce semanas de programa sin haber decidido nada.

    Y era además lo que rompía la movilidad: «Entrenamiento» venía marcado y la
    casilla del calentamiento estaba `disabled` mientras lo estuviera, así que
    NACÍA BLOQUEADA. Para poder pulsarla había que descubrir primero que hay que
    desmarcar la de arriba, cosa que no dice nadie.
  */
  /* …salvo cuando solo se ofrece un bloque: ahí no hay nada que armar —es ese
     bloque o nada—, y la decisión que queda, de quién, sigue siendo explícita. */
  const soloUno = bloques.length === 1;
  const [training, setTraining] = useState(soloUno && bloques[0] === 'training');
  const [warmup, setWarmup] = useState(soloUno && bloques[0] === 'warmup');
  const [diet, setDiet] = useState(soloUno && bloques[0] === 'diet' && conNutricion);
  const [result, setResult] = useState(null);

  const others = clients.filter((c) => c.id !== activeClient.id);
  const source = others.find((c) => c.id === sourceId) || null;
  const nothingSelected = !training && !diet && !warmup;

  const handleCopy = async () => {
    if (!source || nothingSelected) return;

    const parts = [
      training && 'el programa de entrenamiento',
      !training && warmup && 'el calentamiento',
      diet && 'el plan nutricional',
    ]
      .filter(Boolean)
      .join(' y ');

    /*
      Qué se pierde, dicho antes de tocar nada. El calentamiento solo aparece
      aquí cuando va SUELTO: dentro de «entrenamiento» ya está incluido en «su
      programa actual», y nombrarlo dos veces haría dudar de si son dos cosas.
    */
    const overwrites = [
      training && hasProgram && 'su programa actual',
      !training && warmup && hasWarmup && 'su calentamiento actual',
      diet && hasDiet && 'su dieta actual',
    ]
      .filter(Boolean)
      .join(' y ');

    const ok = await confirm({
      title: `¿Copiar de ${source.name}?`,
      message: `Se traerá ${parts} de ${source.name} a ${activeClient.name}.`,
      detail: overwrites
        ? `Atención: esto SUSTITUYE ${overwrites}. No se puede deshacer.`
        : `${activeClient.name} no tiene nada configurado en esos bloques, así que no se sobrescribe nada.`,
      confirmLabel: 'Copiar',
      tone: overwrites ? 'danger' : 'default',
    });
    if (!ok) return;

    const done = await onReplicate(sourceId, { training, diet, warmup });
    const NOMBRES = { training: 'entrenamiento', warmup: 'calentamiento', diet: 'dieta' };
    const copied = ['training', 'warmup', 'diet'].filter((k) => done[k]).map((k) => NOMBRES[k]);
    const fallidos = (done.failed || []).map((k) => NOMBRES[k]);

    /*
      ── Tres finales, no dos ──────────────────────────────────────────────────
      «No se pudo leer» era antes «no tiene datos», y son cosas opuestas: la
      primera se arregla volviendo a pulsar y la segunda significa que ahí no hay
      nada que traer. Confundirlas hacía que un fallo de red pareciera un cliente
      sin dieta, y nadie reintenta lo que cree vacío.
    */
    if (fallidos.length > 0) {
      const copiadoTambien = copied.length > 0 ? ` Sí se copió: ${copied.join(' y ')}.` : '';
      setResult({
        tone: 'error',
        text: `No se pudo leer ${fallidos.join(' y ')} de ${source.name}. Inténtalo otra vez.${copiadoTambien}`,
      });
      return;
    }

    /*
      ── Salió bien: el panel se CIERRA ────────────────────────────────────
      Copiar es un encargo, no una sesión de trabajo: se elige de quién, se
      copia y se acabó. El panel se quedaba abierto con su aviso verde encima
      del menú que se acababa de traer, así que había que leerlo, entenderlo y
      cerrarlo a mano para ver el resultado — y hasta entonces tapaba justo lo
      que confirmaba. Lo que se hizo se dice en el aviso efímero, que es lo que
      esta casa usa para «ya está», y la pantalla se queda en lo copiado.

      Los otros dos finales SÍ se quedan: un fallo se reintenta desde aquí y un
      cliente sin datos pide elegir otro. Cerrar en esos casos sería esconder la
      única pieza donde continuar.
    */
    if (copied.length > 0) {
      toast({ text: `Copiado de ${source.name}: ${copied.join(' y ')}.` });
      onClose();
      return;
    }

    setResult({ tone: 'warn', text: `${source.name} no tiene datos en los bloques seleccionados.` });
  };

  if (others.length === 0) {
    return (
      <Panel tight>
        <Notice tone="info">Necesitas al menos dos clientes para copiar entre ellos.</Notice>
      </Panel>
    );
  }

  return (
    <Panel tight className="col gap-4">
      {result && <Notice tone={result.tone}>{result.text}</Notice>}

      <div className="row-end wrap gap-4">
        <Field label="Copiar desde" hint="El cliente que ya tiene lo que quieres replicar">
          {(props) => (
            <select
              {...props}
              className="select"
              style={{ minWidth: 200 }}
              value={sourceId}
              onChange={(e) => {
                setSourceId(e.target.value);
                setResult(null);
              }}
            >
              <option value="">Selecciona cliente…</option>
              {others.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          )}
        </Field>

        {/*
          ══ Por qué esto ya no son tres tics ═══════════════════════════════════

          Eran tres casillas del sistema operativo con una frase al lado, y la
          primera sustituye doce semanas de programa de otra persona. Un control
          de 16 px, idéntico al de «acepto las condiciones», para una operación
          irreversible.

          Ahora cada una es una tarjeta con su icono, su nombre y qué se lleva
          exactamente. La consecuencia se lee antes de marcarla, no después en el
          diálogo de confirmación.

          Con un solo bloque ofrecido no se pinta: elegir entre una cosa no es
          elegir, y una tarjeta marcada que no se puede desmarcar solo estorba a
          la única pregunta que queda —de quién—.
        */}
        {!soloUno && (
        <Field label="Qué se copia">
          <div className="opt-group">
            {bloques.includes('training') && (
            <OptionCard
              icon={Layers}
              label="Entrenamiento"
              hint={`Estructura semanal, ${weekCount} ${unitLabelPlural(cycleType)}, tipo de ciclo y su calentamiento.`}
              checked={training}
              onChange={setTraining}
            />
            )}
            {/*
              ══ El calentamiento, suelto y SIEMPRE pulsable ══════════════════

              Va aparte de «Entrenamiento» porque es lo que MÁS se repite entre
              clientes —la misma pauta articular para media cartera— mientras que
              el programa es lo que menos. Mezclarlos obligaba a sustituir doce
              semanas de trabajo para traerse cuatro estiramientos.

              Y ya no se desactiva. Estaba `disabled` mientras «Entrenamiento»
              estuviera marcado —que era siempre, porque venía marcado de
              serie—, así que en la práctica no se podía pulsar nunca. La
              redundancia se DICE, que es lo que hacía falta; no se prohíbe.
            */}
            {bloques.includes('warmup') && (
            <OptionCard
              icon={Waves}
              label="Calentamiento y movilidad"
              hint={
                training
                  ? 'Ya va incluido con el entrenamiento.'
                  : 'Solo la pauta previa a entrenar, sin tocar su programa.'
              }
              checked={warmup || training}
              onChange={setWarmup}
            />
            )}
            {/*
              La dieta solo se ofrece si a esta persona se la llevas. Copiarle un
              plan nutricional a un cliente de solo entrenamiento lo dejaría
              guardado en una sección que ni él ni tú podéis abrir.
            */}
            {conNutricion && bloques.includes('diet') && (
              <OptionCard
                icon={Salad}
                label="Dieta"
                hint="Objetivo, macros, menú cerrado y tus pautas."
                checked={diet}
                onChange={setDiet}
              />
            )}
          </div>
        </Field>
        )}

        <div className="row gap-2">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleCopy}
            disabled={!sourceId || nothingSelected}
          >
            <Copy size={15} /> Copiar
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>

      {/* Qué NO se lleva, dicho antes de pulsar. Lo del registro solo se nombra
          si el entrenamiento está sobre la mesa; con la dieta sola, lo que hay
          que decir es qué viaja, porque el selector que lo decía no se pinta. */}
      {bloques.includes('training') ? (
        <p className="t-xs t-tertiary">
          No se copian las sesiones registradas: son el registro de lo que ejecutó otra persona y no tienen
          sentido en esta ficha.
        </p>
      ) : soloUno && bloques[0] === 'diet' ? (
        <p className="t-xs t-tertiary">
          Se trae su objetivo, sus macros, el menú entero con sus alternativas y sus pautas. Lo que el
          cliente haya registrado no se toca.
        </p>
      ) : null}
    </Panel>
  );
};
