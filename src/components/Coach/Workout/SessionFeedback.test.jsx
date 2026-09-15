import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { CHECKIN_QUESTIONS } from '@/domain/protocol';
import { SessionFeedback } from './SessionFeedback';

/**
 * LA HOJA DE PREGUNTAS, montada.
 *
 * ── Qué atrapa ─────────────────────────────────────────────────────────────
 * Dos cosas que no se ven leyendo el componente:
 *
 *   · Que lo condicionado NO se pinta hasta que toca. «¿Dónde te ha molestado?»
 *     es un cuerpo de dos figuras y veinte zonas, y salía todas las semanas
 *     —incluida la mayoría, en las que no ha dolido nada—.
 *   · Que cada escala dice qué significan sus puntas Y sale con SU INSTRUMENTO.
 *     Es lo que hace que nueve preguntas seguidas dejen de ser nueve veces el
 *     mismo control, y las dos se pierden con solo dejar de pasar una propiedad.
 *
 * Con `renderToStaticMarkup` y sin DOM: aquí no se contesta nada, se comprueba
 * lo que se pinta con unas respuestas dadas.
 */

const dolor = CHECKIN_QUESTIONS.find((q) => q.id === 'week_pain');
const zona = CHECKIN_QUESTIONS.find((q) => q.id === 'week_pain_zone');
const adherencia = CHECKIN_QUESTIONS.find((q) => q.id === 'adherence');
const ganas = CHECKIN_QUESTIONS.find((q) => q.id === 'motivation');
const energia = CHECKIN_QUESTIONS.find((q) => q.id === 'week_energy');
const nada = () => {};

const pinta = (props) =>
  renderToStaticMarkup(
    <SessionFeedback questions={[dolor, zona]} onChange={nada} title={false} {...props} />
  );

describe('SessionFeedback', () => {
  it('el cuerpo no sale la semana que no ha dolido nada', () => {
    const html = pinta({ answers: { week_pain: '0' } });
    expect(html).toContain('Dolor o molestias');
    expect(html).not.toContain('¿Dónde te ha molestado?');
    expect(html).not.toContain('zonas-svg');
  });

  it('y sale en cuanto se marca dolor, en su sitio', () => {
    const html = pinta({ answers: { week_pain: '4' } });
    expect(html).toContain('¿Dónde te ha molestado?');
    expect(html).toContain('zonas-svg');
  });

  /* Una respuesta guardada que la pantalla no enseña es un dato que el cliente
     no puede corregir: hay semanas entregadas con una zona marcada y el dolor en
     blanco, de cuando esto no era una condición. */
  it('lo ya contestado no se esconde aunque la condición no se cumpla', () => {
    const html = pinta({ answers: { week_pain: '0', week_pain_zone: ['hombroD'] } });
    expect(html).toContain('¿Dónde te ha molestado?');
  });

  /* El constructor enseña el formulario ENTERO: lo que se viene a ver ahí es qué
     preguntas lleva, no qué preguntas le tocarían hoy a nadie. */
  it('el constructor lo enseña entero', () => {
    const html = pinta({ answers: {}, soloLectura: true });
    expect(html).toContain('¿Dónde te ha molestado?');
  });

  it('cada escala dice qué significan sus dos puntas', () => {
    const html = pinta({ answers: {} });
    expect(html).toContain('rampa-puntas');
    expect(html).toContain('Nada');
    expect(html).toContain('Mucho');
  });

  /* Sin extremos escritos no se reserva el renglón: un hueco por si acaso es
     peor que no tenerlo. */
  it('una pregunta propia sin extremos no pinta el renglón', () => {
    const html = renderToStaticMarkup(
      <SessionFeedback
        questions={[{ id: 'q1', label: '¿Qué tal?', kind: 'scale', min: 1, max: 5 }]}
        answers={{}}
        onChange={nada}
        title={false}
      />
    );
    expect(html).toContain('rampa');
    expect(html).not.toContain('rampa-puntas');
  });

  /* EL INSTRUMENTO LLEGA HASTA EL PASO. Se pierde con solo dejar de pasar una
     propiedad, y entonces el cuestionario vuelve a ser nueve veces el mismo
     control: es justo lo que este renglón evita.

     Se comprueban los tres, porque los tres se sirven distinto: las estrellas y
     las caras traen icono (y las caras uno DISTINTO por paso, que es su razón de
     ser) y el depósito no trae ninguno. */
  it('cada pregunta sale con su instrumento', () => {
    const conEstrellas = renderToStaticMarkup(
      <SessionFeedback questions={[adherencia]} answers={{}} onChange={nada} title={false} />
    );
    expect(conEstrellas).toContain('is-estrellas');
    expect(conEstrellas.match(/lucide-star/g)).toHaveLength(5);

    const conCaras = renderToStaticMarkup(
      <SessionFeedback questions={[ganas]} answers={{}} onChange={nada} title={false} />
    );
    expect(conCaras).toContain('is-caras');
    /* Cinco caras y cinco DISTINTAS: con una sola repetida cinco veces el
       instrumento no diría nada que la rampa no dijera ya. */
    expect(conCaras.match(/lucide-(angry|frown|meh|smile|laugh)"/g)).toHaveLength(5);

    const conDeposito = renderToStaticMarkup(
      <SessionFeedback questions={[energia]} answers={{}} onChange={nada} title={false} />
    );
    expect(conDeposito).toContain('is-deposito');
    expect(conDeposito).not.toContain('<svg');
  });

  /* Y lo que es una cantidad se queda en la rampa, con sus discos lisos y sus
     once pasos: el dolor de 0 a 10, donde entre un 3 y un 5 hay una decisión de
     entrenamiento. */
  it('lo que no lleva instrumento sigue siendo la rampa de once pasos', () => {
    const html = pinta({ answers: {} });
    expect(html.match(/rampa-disco/g)).toHaveLength(11);
    expect(html).not.toContain('instrumento');
  });

  /* Y una pregunta inventada por el entrenador tampoco estrena instrumento:
     sería decidir por él qué clase de cosa está preguntando. */
  it('una pregunta propia no estrena instrumento', () => {
    const html = renderToStaticMarkup(
      <SessionFeedback
        questions={[{ id: 'q1', label: '¿Cuántos días has salido a andar?', kind: 'scale', min: 0, max: 10 }]}
        answers={{}}
        onChange={nada}
        title={false}
      />
    );
    expect(html).toContain('rampa-disco');
    expect(html).not.toContain('<svg');
  });
});
