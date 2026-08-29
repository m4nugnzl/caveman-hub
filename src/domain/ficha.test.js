import { describe, expect, it } from 'vitest';

import { age, identityFacts, identitySubtitle } from './ficha';

/**
 * ══ El caso que motiva este archivo ════════════════════════════════════════
 *
 * La edad es el dato de esta pantalla que MÁS se usa fuera de ella: entra en las
 * fórmulas de gasto energético y en las zonas de frecuencia cardíaca. Y es el
 * más fácil de calcular mal de las dos maneras clásicas:
 *
 *   · restar los años a secas, que envejece hasta once meses a quien todavía no
 *     ha cumplido este año;
 *   · restar milisegundos, que se equivoca en un año entero según la franja
 *     horaria del navegador.
 *
 * Las dos dan un número creíble en pantalla, que es lo que las hace caras.
 */

describe('age', () => {
  it.each([
    ['1990-06-15', '2026-06-15', 36, 'justo el día de su cumpleaños'],
    ['1990-06-15', '2026-06-16', 36, 'al día siguiente'],
    ['1990-06-15', '2026-06-14', 35, 'la víspera: todavía no los ha cumplido'],
    ['1990-12-31', '2026-01-01', 35, 'el cambio de año no cumple años'],
    ['1990-01-01', '2026-12-31', 36, 'cumplió hace casi un año'],
    ['2026-08-25', '2026-08-25', 0, 'recién nacido'],
  ])('%s visto desde %s → %s (%s)', (nacimiento, hoy, esperado) => {
    expect(age(nacimiento, hoy)).toBe(esperado);
  });

  /* El 29 de febrero no tiene día propio tres de cada cuatro años. Se cumple el
     1 de marzo, que es lo que hace el registro civil y lo que sale solo de
     comparar «02-28» < «02-29». */
  it('un 29 de febrero cumple el 1 de marzo en los años normales', () => {
    expect(age('2000-02-29', '2026-02-28')).toBe(25);
    expect(age('2000-02-29', '2026-03-01')).toBe(26);
  });

  it.each([
    [null, 'sin fecha'],
    ['', 'vacío'],
    ['no es una fecha', 'texto cualquiera'],
    [undefined, 'sin poner'],
  ])('%s → null (%s)', (valor) => {
    expect(age(valor, '2026-08-25')).toBeNull();
  });

  /* Un negativo sería un número creíble en un sitio donde no cabe ninguno. Y
     pasa de verdad: un dedo de más al teclear el año en el selector de fecha. */
  it('una fecha futura no da una edad negativa', () => {
    expect(age('2030-01-01', '2026-08-25')).toBeNull();
  });
});

describe('identityFacts', () => {
  const client = { birthDate: '1992-03-10', heightCm: 168, gender: 'Mujer' };

  it('devuelve los cuatro hechos, siempre y en el mismo orden', () => {
    const facts = identityFacts({ client, weight: 61.42 }, '2026-08-25');
    expect(facts.map((f) => f.id)).toEqual(['age', 'height', 'weight', 'gender']);
    /* Con coma decimal: `fmt` dice la cifra en el idioma de la aplicación, no en
       el de JavaScript. Ver `lib/num.js`. */
    expect(facts.map((f) => f.value)).toEqual(['34 años', '168 cm', '61,4 kg', 'Mujer']);
  });

  /* Un hueco es `null` y no la cadena «—»: quien pinta tiene que poder
     distinguir «no lo sé» de «lo sé y es un guion», y además decidir él cómo se
     dibuja un hueco. */
  it('una ficha vacía devuelve los cuatro huecos, no tres hechos', () => {
    const facts = identityFacts({ client: {}, weight: null }, '2026-08-25');
    expect(facts).toHaveLength(4);
    expect(facts.every((f) => f.value === null)).toBe(true);
  });

  it('el peso llega de fuera y no de la ficha', () => {
    /* Si esto dejara de ser cierto sería que alguien ha vuelto a guardar el peso
       en `clients`, que es exactamente lo que la 0048 tuvo que borrar. */
    const facts = identityFacts({ client: { ...client, weight: 99 }, weight: 61 }, '2026-08-25');
    expect(facts.find((f) => f.id === 'weight').value).toBe('61 kg');
  });

  it('un año se dice en singular', () => {
    const facts = identityFacts({ client: { birthDate: '2025-08-25' }, weight: null }, '2026-08-25');
    expect(facts.find((f) => f.id === 'age').value).toBe('1 año');
  });
});

describe('identitySubtitle', () => {
  it('junta el plan y la antigüedad', () => {
    expect(identitySubtitle({ plan: 'Asesoría completa' }, 'marzo de 2025')).toBe(
      'Asesoría completa · desde marzo de 2025'
    );
  });

  it('sin plan lo dice, en vez de dejar la línea empezando por un punto', () => {
    expect(identitySubtitle({}, 'marzo de 2025')).toBe('Sin plan · desde marzo de 2025');
  });

  it('sin fecha de alta no deja el separador colgando', () => {
    expect(identitySubtitle({ plan: 'Solo dieta' }, null)).toBe('Solo dieta');
  });
});
