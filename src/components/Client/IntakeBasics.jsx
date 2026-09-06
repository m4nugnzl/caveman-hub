import { useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useApp } from '@/context/AppContext';
import { buildWeightLog, weightSeries } from '@/domain/anthropometry';
import {
  MAX_AGE,
  MAX_HEIGHT,
  MIN_AGE,
  MIN_HEIGHT,
  age,
  birthDateForAge,
} from '@/domain/ficha';
import { fmt, toNum } from '@/lib/num';
import { dayMonthMaybeYear, todayISO } from '@/lib/dates';
import {
  BotonAccion,
  Field,
  Notice,
  NumberInput,
  Panel,
  useAccionDeBoton,
} from '@/components/ui/primitives';

/** Una respuesta cuenta si tiene algo dentro. El mismo criterio que el cuestionario. */
const puesto = (valor) => valor !== undefined && valor !== null && valor !== '';

/**
 * Quién eres: la edad, la altura y el peso, contestados por el cliente.
 *
 * ══ Por qué esto no es una tanda más del cuestionario ══════════════════════
 *
 * Porque las tres van a sitios distintos y ninguno es `clients.profile`, que es
 * donde el cuestionario deja todo lo que se contesta:
 *
 *   · La edad se guarda como FECHA en `clients.birth_date` — un «34» escrito en
 *     la base miente solo al cabo de un año. Se teclea la edad y se guarda la
 *     fecha; las dos mitades de la decisión están en `domain/ficha.js`.
 *   · La altura va a `clients.height_cm`, que es `numeric` y tiene topes: con
 *     ella la cintura pasa de ser un número suelto a un ratio.
 *   · El peso NO se guarda en la ficha. Es una serie, y ya costó una columna: la
 *     0048 tuvo que borrar `current_weight` por enseñar un peso congelado con
 *     etiqueta de actual. Entra en `anthropometry`, por la misma puerta que el
 *     de cada semana, fechado hoy.
 *
 * Meterlas en el formulario de `IntakeQuestions` habría obligado a que aquel
 * supiera de columnas tipadas y de series. Son dos guardados distintos y por eso
 * son dos pantallas hermanas, como lo es «Tu salud».
 *
 * ══ Por qué las pregunta ÉL y no las teclea su entrenador ══════════════════
 *
 * Porque son los cuatro hechos de la cabecera de su ficha —edad, altura, peso y
 * sexo— y de ellos salen todas las cuentas: el gasto energético, sus zonas de
 * pulso, el ratio cintura/altura, la fórmula de pliegues. Hasta ahora los
 * tecleaba el entrenador de memoria, y lo normal era que la ficha se quedara con
 * los cuatro huecos hasta que hiciera falta una cuenta. Quien sabe cuánto mide
 * es él.
 *
 * ══ Y el correo, que ya lo tenemos ═════════════════════════════════════════
 *
 * No se pregunta: es el de la cuenta con la que ha entrado. Preguntar por él
 * sería pedirle que teclee un dato que la aplicación acaba de verificar
 * dejándole pasar — y abrir la puerta a que escriba otro distinto del que
 * funciona. Se enseña para que lo vea, y la migración 0091 lo sella en su ficha
 * al guardar.
 */
export const IntakeBasics = ({ client }) => {
  const { session, anthropometry, saveClientIdentity, addAnthropometryLog } = useApp();

  /*
    El último pesaje, con su fecha, y no solo su cifra.

    Es lo que decide si aquí hay una pregunta o un hecho: el peso se pide UNA vez
    —el de partida— y a partir de ahí lo lleva su check-in, semana a semana. Sin
    la fecha, la frase de abajo diría «pesas 78,4» sin decir de cuándo, que es
    exactamente el defecto que costó la columna `current_weight`.
  */
  const serie = weightSeries(anthropometry?.[client.id]?.history);
  const ultimoPeso = serie.length > 0 ? serie[serie.length - 1] : null;
  const edadActual = age(client.birthDate);

  const inicial = {
    edad: edadActual === null ? '' : String(edadActual),
    altura: client.heightCm ? String(client.heightCm) : '',
    /* En blanco siempre: si ya hay pesaje, aquí no se pregunta nada. */
    peso: '',
  };

  const [form, setForm] = useState(inicial);
  /* El giro y el tic del botón de guardar; ver `BotonAccion`. */
  const guardado = useAccionDeBoton();
  const [aviso, setAviso] = useState(null);
  /* Lo mismo que hace el cuestionario, y por el mismo motivo: comparar el
     borrador contra la ficha diría «guardado» durante el viaje de ida, porque el
     estado se actualiza de forma optimista. */
  const [tocado, setTocado] = useState(false);

  const set = (campo) => (valor) => {
    setTocado(true);
    setForm((f) => ({ ...f, [campo]: valor }));
  };

  /*
    Los tres avisos, y los tres cortan ANTES de mandar.

    La base también los corta —el CHECK de la 0076 y los topes de la función—
    pero desde allí el mensaje llega con el nombre de un constraint dentro, y esto
    lo lee alguien en su portal. Un dedo de más son «204 años» y «1750 cm».
  */
  const edadMal = puesto(form.edad) && birthDateForAge(form.edad) === null;
  const alturaNum = toNum(form.altura);
  const alturaMal =
    puesto(form.altura) &&
    (alturaNum === null || alturaNum < MIN_HEIGHT || alturaNum > MAX_HEIGHT);
  const pesoNum = toNum(form.peso);
  const pesoMal = puesto(form.peso) && (pesoNum === null || pesoNum <= 0 || pesoNum > 400);
  const hayFallo = edadMal || alturaMal || pesoMal;

  /* El peso cuenta si está en su serie, lo haya puesto aquí o en un check-in.
     Contar la caja de texto haría que este bloque volviera a decir «2 de 3» a
     alguien que lleva ocho semanas pesándose. */
  const contestadas =
    ['edad', 'altura'].filter((c) => puesto(form[c])).length +
    (ultimoPeso || puesto(form.peso) ? 1 : 0);

  const guardar = (e) => {
    e.preventDefault();
    if (hayFallo) return;

    guardado.lanzar(async () => {
      setAviso(null);

      /*
        La fecha solo se recalcula si la edad CAMBIA.

        Quien tenga guardado su día exacto de nacimiento no lo pierde por abrir
        esta pantalla y darle a guardar: reescribirla «por si acaso» cambiaría un
        15 de junio por el día de hoy sin que nadie lo hubiera pedido. Es la misma
        cuenta que hace la ficha del entrenador (`ClientFile`).
      */
      const birthDate =
        !puesto(form.edad) || Number(form.edad) === edadActual
          ? null
          : birthDateForAge(form.edad);

      const res = await saveClientIdentity(client.id, {
        birthDate,
        /* Un campo en blanco no borra: la función deja como estaba lo que llegue
           en `null`. Ver `saveClientIdentity`. */
        heightCm: puesto(form.altura) ? alturaNum : null,
      });

      if (!res.ok) {
        setAviso({ tone: 'error', text: res.error });
        return false;
      }

      /*
        El peso, a su serie, y solo el PRIMERO.

        Aquí se pregunta el de partida y nada más: a partir de él, quien lo mueve
        es su check-in cada semana. Dejar la caja abierta para siempre habría
        puesto dos sitios donde pesarse, y el de esta pantalla es el que no tiene
        gráfico, ni fecha elegible, ni fotos — o sea, el peor de los dos.

        Va fechado hoy, que es cuando lo dice, y entra por la misma puerta que el
        de cada semana (`addAnthropometryLog`): un pesaje es un pesaje.
      */
      if (!ultimoPeso && puesto(form.peso)) {
        addAnthropometryLog(client.id, buildWeightLog({ date: todayISO(), weight: pesoNum }));
      }

      setTocado(false);
      setAviso({ tone: 'success', text: 'Guardado. Puedes cambiarlo cuando quieras.' });
      return true;
    });
  };

  return (
    <Panel
      title="Quién eres"
      sub="Tres datos con los que se calculan tus calorías, tus zonas de pulso y tus medidas. Son los que tu entrenador necesita antes de escribir nada."
      className="col gap-4"
      action={
        <span className={`badge${contestadas === 3 ? ' badge-ok' : ''}`}>
          {contestadas === 3 && <Check size={13} />} {contestadas} de 3
        </span>
      }
    >
      {aviso && <Notice tone={aviso.tone}>{aviso.text}</Notice>}

      <form className="col gap-4" onSubmit={guardar}>
        <div className="grid-2">
          <Field
            label="Edad"
            hint="Se guarda como fecha, para que no envejezca sola."
            error={edadMal ? `Entre ${MIN_AGE} y ${MAX_AGE} años.` : null}
          >
            {(props) => (
              <div className="input-suffix">
                <NumberInput
                  {...props}
                  center={false}
                  placeholder="Ej.: 34"
                  value={form.edad}
                  onChange={set('edad')}
                />
                <span aria-hidden="true">años</span>
              </div>
            )}
          </Field>

          <Field
            label="Altura"
            hint="En centímetros, sin zapatos."
            error={alturaMal ? `Entre ${MIN_HEIGHT} y ${MAX_HEIGHT} cm.` : null}
          >
            {(props) => (
              <div className="input-suffix">
                <NumberInput
                  {...props}
                  center={false}
                  placeholder="Ej.: 175"
                  value={form.altura}
                  onChange={set('altura')}
                />
                <span aria-hidden="true">cm</span>
              </div>
            )}
          </Field>

          {/*
            El peso: una pregunta la primera vez y un hecho a partir de la
            segunda.

            Es la diferencia entre este bloque y el resto de su portal. La edad y
            la altura son constantes y viven aquí; el peso es una SERIE, y una
            serie no se edita en el formulario donde nació — se sigue. En cuanto
            hay un pesaje, esta caja desaparece y lo que queda es el último con su
            fecha y el camino a donde se pone el siguiente.

            Dejarla abierta habría dado dos sitios para pesarse, y de ahí salen
            las dos cifras que no coinciden.
          */}
          {ultimoPeso ? (
            <Field label="Peso">
              <p className="t-sm" style={{ margin: 0 }}>
                {fmt(ultimoPeso.value, { decimals: 1, unit: ' kg' })}
                <span className="t-2xs t-tertiary" style={{ display: 'block' }}>
                  Tu último pesaje, del {dayMonthMaybeYear(ultimoPeso.date)}. El siguiente va en tu
                  check-in.
                </span>
              </p>
              <Link className="btn btn-plain btn-sm" to="/mi/evolucion" style={{ alignSelf: 'start' }}>
                Pesarme <ChevronRight size={15} />
              </Link>
            </Field>
          ) : (
            <Field
              label="Peso"
              hint="El de hoy, para empezar. A partir de aquí lo sigues tú cada semana en tu check-in."
              error={pesoMal ? 'Ponlo en kilos, como 78,4.' : null}
            >
              {(props) => (
                <div className="input-suffix">
                  <NumberInput
                    {...props}
                    center={false}
                    placeholder="Ej.: 78,4"
                    value={form.peso}
                    onChange={set('peso')}
                  />
                  <span aria-hidden="true">kg</span>
                </div>
              )}
            </Field>
          )}

          {/*
            El correo, dicho y no preguntado.

            No es un campo apagado: es un HECHO de la pantalla, y por eso se
            escribe con las palabras del sitio en vez de con una caja gris que
            invita a intentar escribir dentro.
          */}
          <Field label="Tu correo">
            <p className="t-sm" style={{ margin: 0 }}>
              {session?.user?.email || 'El de la cuenta con la que has entrado'}
              <span className="t-2xs t-tertiary" style={{ display: 'block' }}>
                Es el de tu cuenta. Tu entrenador lo ve en tu ficha; para cambiarlo, cambia el de
                la cuenta.
              </span>
            </p>
          </Field>
        </div>

        {/* La misma barra que el cuestionario, y con las mismas tres frases: un
            aviso mientras hay algo sin mandar, un acuse cuando está y la cuenta
            el resto del tiempo. Dos formularios en la misma pantalla que se
            guardaran de dos maneras distintas serían dos aprendizajes. */}
        <div className={`form-bar${tocado ? ' is-dirty' : ''}`}>
          <span className="t-xs t-secondary" style={{ minWidth: 0 }}>
            {tocado
              ? 'Tienes cambios sin guardar.'
              : contestadas === 3
                ? 'Ya están los tres puestos.'
                : `Te faltan ${3 - contestadas} por poner.`}
          </span>
          <BotonAccion
            type="submit"
            className="btn btn-primary btn-sm shrink-0"
            estado={guardado.estado}
            disabled={!tocado || hayFallo}
          >
            Guardar
          </BotonAccion>
        </div>
      </form>
    </Panel>
  );
};
