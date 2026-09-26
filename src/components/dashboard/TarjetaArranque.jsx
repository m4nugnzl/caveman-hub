import { Link } from 'react-router-dom';

import { useApp } from '@/context/AppContext';
import { clientIntake, intakeProgress, intakeSteps } from '@/domain/intake';
import { onboardingState } from '@/domain/onboardingState';
import { sortPhases } from '@/domain/roadmap';
import { trainingDayCount } from '@/domain/training';
import { shortDate } from '@/lib/dates';
import { fmt } from '@/lib/num';
import { clientPath } from '@/routes';
import { useInvite } from '@/components/Coach/useInvite';
import { Tarjeta } from './Tarjeta';

/**
 * PARA EMPEZAR — el Resumen de alguien a quien todavía no le ha pasado nada.
 *
 * ══ Por qué sustituye al mosaico entero ════════════════════════════════════
 *
 * El Resumen cuenta lo que PASA: cómo va, cuánto ha cambiado, el cuerpo, el
 * entreno, lo que contesta. Con un cliente recién dado de alta no ha pasado
 * nada, y el mosaico eran siete cajas vacías, cada una con su frase. Un
 * entrenador lo dijo tal cual: «no tiene sentido enseñar boxes vacías». Lo que
 * hay que hacer con esa persona es montarla, y eso es una lista.
 *
 * Las filas son las palancas de «El plan», con su misma ley: el hueco dice su
 * verbo en azul y lo hecho dice su cifra. Cada fila lleva a donde se hace.
 *
 * Se va sola en cuanto hay algo que resumir. Ver `sinHistoria` en `Dashboard`.
 */
export const TarjetaArranque = ({ client, phases, plan, ciclo, program, conEntreno, conDieta }) => {
  const { equipment, checkIns } = useApp();
  const { busy: invitando, send: invitar, result: invite } = useInvite();

  const fases = sortPhases(phases);
  const primera = fases[0] || null;
  const ultima = fases[fases.length - 1] || null;

  const dias = program?.weeklySplit ? trainingDayCount(program.weeklySplit) : 0;
  /* Las calorías de su ciclo y no las del primer día: ver `cycleFoto`. */
  const kcal = Number(ciclo?.kcals ?? plan?.targetKcals) || null;

  const intake = clientIntake(client.preferences);
  const conAlta = intakeSteps(intake).length > 0;
  const alta = intakeProgress(
    client,
    intake,
    onboardingState({ client, equipment, checkIn: checkIns?.[client.id] })
  );

  const invita = (verbo) => <span className="palanca-invita">{verbo}</span>;

  return (
    <Tarjeta rotulo="Para empezar" span={12} className="resumen-arranque">
      <ul className="palancas">
        <li>
          {/* Las fases se marcan en la Temporada. */}
          <Link className="palanca is-puerta" to={clientPath(client.id, 'temporada')}>
            <span className="palanca-k">Fases</span>
            <span className="palanca-v is-texto">{primera ? primera.title : invita('Define sus fases')}</span>
            {primera && (
              <span className="palanca-s">
                {fases.length} {fases.length === 1 ? 'fase' : 'fases'}
                {ultima?.endsOn ? ` · hasta el ${shortDate(ultima.endsOn)}` : ''}
              </span>
            )}
          </Link>
        </li>

        {conEntreno && (
          <li>
            <Link className="palanca is-puerta" to={clientPath(client.id, 'rutina')}>
              <span className="palanca-k">Entreno</span>
              {dias > 0 ? (
                <span className="palanca-v">
                  {dias}
                  <small> {dias === 1 ? 'día' : 'días'} a la semana</small>
                </span>
              ) : (
                <span className="palanca-v is-texto">{invita('Monta su rutina')}</span>
              )}
            </Link>
          </li>
        )}

        {conDieta && (
          <li>
            <Link className="palanca is-puerta" to={clientPath(client.id, 'nutricion')}>
              <span className="palanca-k">Dieta</span>
              {kcal ? (
                <span className="palanca-v">
                  {fmt(kcal)}
                  <small> kcal</small>
                </span>
              ) : (
                <span className="palanca-v is-texto">{invita('Fija sus calorías')}</span>
              )}
            </Link>
          </li>
        )}

        {/* Su alta la contesta él: aquí no hay verbo tuyo, solo cuánto lleva. */}
        {conAlta && (
          <li>
            <Link className="palanca is-puerta" to={clientPath(client.id, 'ficha')}>
              <span className="palanca-k">Su alta</span>
              {alta.complete ? (
                <span className="palanca-v is-texto">Contestada</span>
              ) : (
                <span className="palanca-v">
                  {alta.done}
                  <small> de {alta.total} hechos</small>
                </span>
              )}
            </Link>
          </li>
        )}

        <li>
          {client.clientProfileId ? (
            <div className="palanca">
              <span className="palanca-k">Acceso</span>
              <span className="palanca-v is-texto">Con cuenta</span>
            </div>
          ) : (
            <button
              type="button"
              className="palanca is-puerta"
              disabled={invitando}
              onClick={() => invitar(client)}
            >
              <span className="palanca-k">Acceso</span>
              <span className="palanca-v is-texto">
                {invitando ? 'Generando…' : invita('Mándale su enlace')}
              </span>
              {/* El enlace se copia solo, y hay que decirlo: si no, la fila
                  parece no haber hecho nada. Lo mismo que en la guía. */}
              {invite?.ok && (
                <span className="palanca-s">{invite.copied ? 'Enlace copiado' : invite.url}</span>
              )}
              {invite?.ok === false && (
                <span className="palanca-s" style={{ color: 'var(--negative)' }}>
                  {invite.error}
                </span>
              )}
            </button>
          )}
        </li>
      </ul>

      <p className="tarjeta-pie">Cuando entrene o se pese, aquí verás cómo va.</p>
    </Tarjeta>
  );
};
