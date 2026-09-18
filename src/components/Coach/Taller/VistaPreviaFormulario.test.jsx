import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { MEDIDAS_DE_FABRICA } from '@/domain/medidas';
import { VistaPreviaFormulario } from './VistaPreviaFormulario';

/**
 * EL ENSAYO del constructor, montado.
 *
 * ── Qué atrapa ─────────────────────────────────────────────────────────────
 * Que cada momento se ensaya con el renderizador que el cliente usa de verdad, y
 * no con una imitación. El riesgo de esta pieza no es el dibujo: es que un
 * momento acabe pintándose con el componente del otro —el parte con la hoja del
 * suelto, por ejemplo— y el entrenador dé por bueno un formulario que a su
 * cliente le llega con otra cara.
 *
 * Y lo segundo que vigila es la traducción: el lienzo son `elementos` y el parte
 * y el check-in se guardan en el modelo viejo, así que el ensayo tiene que pasar
 * por `desdeElementos` como pasa el guardado. Sin eso enseñaría algo que no es lo
 * que se va a escribir, que es peor que no enseñar nada.
 *
 * Con `renderToStaticMarkup` y sin DOM —`Modal` devuelve su contenido tal cual
 * cuando no hay `document`—, así que aquí no se contesta nada: las reglas contra
 * un borrador vivo son de `elementosVisibles`, que tiene las suyas en
 * `domain/formulario`.
 */

const cerrar = () => {};

describe('VistaPreviaFormulario', () => {
  it('un suelto se ensaya con la hoja del cliente, con su pie y su cuenta', () => {
    const form = { id: 'f1', momento: 'libre', name: 'Cómo llevas la vuelta' };
    const elementos = [
      { id: 'e1', tipo: 'escala', enun: '¿Cómo has dormido?', min: 1, max: 10, oblig: true },
      { id: 'e2', tipo: 'texto', enun: '¿Algo que contarme?', oblig: false },
    ];

    const html = renderToStaticMarkup(
      <VistaPreviaFormulario form={form} elementos={elementos} onCerrar={cerrar} />
    );

    expect(html).toContain('Cómo llevas la vuelta');
    expect(html).toContain('¿Cómo has dormido?');
    expect(html).toContain('¿Algo que contarme?');
    /* El pie del cliente, con su botón —apagado— y lo que le falta por contestar:
       sin responder nada, la obligatoria cuenta. */
    expect(html).toContain('Enviárselo');
    expect(html).toContain('Le falta una respuesta');
    /* Y el aviso de que no se guarda nada, que es lo que distingue un ensayo de
       una entrega. */
    expect(html).toContain('no se guarda en ningún sitio');
  });

  /*
    ══ EL CHECK-IN SE ENSAYA CON SU ASISTENTE ═════════════════════════════════

    Y esto es lo que atrapa: que no vuelva a pintarse como una pila de preguntas.
    Lo fue, y encima lo decía —«además le pide su peso, sus perímetros y sus
    pliegues, y no se ensayan aquí»—, o sea que el botón que promete enseñar la
    pantalla del cliente enseñaba una pantalla que no existe. El cliente ve un
    asistente por pasos; el entrenador tiene que ver el mismo.
  */
  it('el check-in se ensaya con el asistente de su revisión, no con una hoja', () => {
    const form = { id: 'f2', momento: 'semana', name: 'Su check-in' };
    const elementos = [
      { id: 'e1', tipo: 'escala', enun: '¿Cuánta hambre has pasado?', min: 1, max: 10 },
    ];

    const html = renderToStaticMarkup(
      <VistaPreviaFormulario form={form} elementos={elementos} onCerrar={cerrar} />
    );

    /* Su diálogo, con su título y su carril de pasos: es lo que ve él. */
    expect(html).toContain('Mi revisión de la semana');
    expect(html).toContain('wiz-rail');
    expect(html).toContain('El peso');
    expect(html).toContain('Tu semana');
    expect(html).toContain('Paso 1 de 2');
    /* Y que sigue siendo un ensayo: nada de lo que se haga aquí se guarda, y el
       pie lo dice al lado del botón que parece entregar. */
    expect(html).toContain('no se guarda en ningún sitio');
    /* Lo que se retiró: la hoja de preguntas y la frase que se disculpaba por no
       poder enseñar los pasos que ahora sí se enseñan. */
    expect(html).not.toContain('Le llega dentro de su revisión');
    expect(html).not.toContain('Además le pide');
    expect(html).not.toContain('Enviárselo');
  });

  /*
    Esto lo encontró una captura de la app de verdad, no el código: el check-in
    de la demo pide tres medidas y ninguna pregunta, y el ensayo abría diciendo
    «todavía no le preguntas nada» — la clase exacta de mentira que este ensayo
    vino a matar. Ahora lo que lo desmiente es que su paso EXISTA.
  */
  it('un check-in de solo medidas tiene su paso, y no dice que esté vacío', () => {
    const form = { id: 'f4', momento: 'semana', name: 'El check-in' };
    const elementos = [
      {
        id: 'e1',
        tipo: 'medida',
        origen: 'glucose',
        enun: 'Glucosa en ayunas',
        unidad: 'mg/dL',
        ayuda: 'Con glucómetro, antes de desayunar.',
        oblig: true,
      },
    ];

    const html = renderToStaticMarkup(
      <VistaPreviaFormulario
        form={form}
        elementos={elementos}
        /* El vocabulario del entrenador: de él salen la unidad y los decimales.
           El elemento solo guarda el id, así que sin catálogo la medida no se
           puede pintar — y el paso no existiría. */
        medidas={MEDIDAS_DE_FABRICA}
        onCerrar={cerrar}
      />
    );

    expect(html).not.toContain('Todavía no le preguntas nada');
    /* Lo que se toma con un aparato tiene SU paso desde que las medidas dejaron
       de ser uno solo con quince casillas dentro. Ver `ReviewWizard`. */
    expect(html).toContain('Los aparatos');
    expect(html).toContain('Paso 1 de 2');
  });

  it('un check-in de solo piezas del oficio abre con sus pasos, no con un vacío', () => {
    const form = { id: 'f5', momento: 'semana', name: 'El check-in' };
    /* Exactamente el de la demo: tres piezas del oficio y ninguna pregunta. */
    const elementos = [
      { id: 'e1', tipo: 'perimetros', enun: 'Sus perímetros', piezas: ['ombligo'] },
      { id: 'e2', tipo: 'pliegues', enun: 'Sus pliegues', piezas: ['abdominal'] },
      { id: 'e3', tipo: 'fotos', enun: 'Sus fotos de progreso' },
    ];

    const html = renderToStaticMarkup(
      <VistaPreviaFormulario form={form} elementos={elementos} onCerrar={cerrar} />
    );

    /* Los pasos que de verdad tendrá esa persona, salidos del mismo protocolo
       que se va a guardar. Sin cuestionario: no hay ninguna pregunta puesta. */
    /* Un paso por técnica: el pellizco y la cinta son dos gestos, dos aparatos
       y dos láminas. */
    expect(html).toContain('Los pliegues');
    expect(html).toContain('Los perímetros');
    expect(html).toContain('Las fotos');
    expect(html).toContain('Paso 1 de 4');
    expect(html).not.toContain('Todavía no le preguntas nada');
  });

  /*
    ── EL ALTA, que era la que no se podía ver ──────────────────────────────

    Su botón saltaba al portal del cliente abierto y allí se ve el alta DE ESA
    PERSONA: otra distinta, y solo si la tiene pendiente. Lo que esta prueba
    vigila es que el ensayo monte el cuerpo de VERDAD del alta —con los rótulos
    de la ficha y en segunda persona— y no una lista de nombres de campo: si
    alguien vuelve a escribir un segundo renderizador, aquí se cae.

    Y desde que el alta se recorre POR CAPÍTULOS —una hoja por tanda, el carril
    del asistente arriba y un pie que nombra la siguiente— lo que se vigila es
    eso. Las dos averías que atrapa son las dos de las que se viene, y son
    opuestas:

      · **La pila** — las trece preguntas de una tirada, 1.504 px de columna en
        los que el nombre del capítulo no se veía. Si vuelve, aquí aparecerán en
        la misma hoja preguntas de tandas distintas.
      · **Una pregunta por pantalla** — trece toques en «Siguiente» sin más
        premio que enseñar la siguiente. Por eso la primera tanda trae DOS
        preguntas: con una sola, un capítulo por hoja y una pregunta por hoja se
        ven igual y esta prueba no distinguiría entre las dos.

    Sin contestar ni pulsar nada: esto es `renderToStaticMarkup` y no hay DOM.
    Desde el 18 sep (frame 104:80) cada pregunta del capítulo es una CAJA y el
    capítulo se ve entero: ni ventana con foco ni número.
  */
  it('el alta se ensaya por capítulos: el carril los nombra y la hoja enseña uno', () => {
    const form = {
      id: 'f6',
      momento: 'alta',
      name: 'Alta general',
      asked: ['likes', 'daysAvailable', 'sessionMinutes'],
      required: [],
      custom: [{ id: 'c1', label: '¿Has hecho alguna dieta antes?', kind: 'text' }],
    };

    const html = renderToStaticMarkup(
      <VistaPreviaFormulario form={form} elementos={[]} onCerrar={cerrar} />
    );

    expect(html).not.toContain('Todavía no le preguntas nada');

    /* El carril, con las tres tandas nombradas y la primera puesta. Es lo que
       sustituye al antetítulo de once píxeles que no se veía. */
    expect(html).toContain('wiz-rail');
    expect(html).toContain('Cómo entrenas');
    expect(html).toContain('Cómo comes');
    expect(html).toContain('Lo que te pregunta tu entrenador');
    expect(html).toContain('Paso 1 de 3');

    /* LA HOJA ES LA DEL PRIMER CAPÍTULO: sus DOS preguntas, cada una en su
       caja, y la cifra al canto (`.es-cifra`). */
    expect(html.match(/campo-q alta-caja/g)).toHaveLength(2);
    expect(html).toContain('alta-caja es-cifra');
    expect(html).toContain('Días que puedes entrenar');
    expect(html).toContain('Cuánto tiempo tienes por sesión');

    /* Y NO las de los otros dos, que es la mitad que atrapa la vuelta de la
       pila. Se buscan por el rótulo de la pregunta y no por el de su tanda: el
       carril nombra las tres, y ahí tienen que estar. */
    expect(html).not.toContain('Lo que te gusta');
    expect(html).not.toContain('¿Has hecho alguna dieta antes?');

    /* El pie cambia de capítulo y lleva escrito a dónde va. */
    expect(html).toContain('alta-sigue-k">Cómo comes<');
    /* En la primera no hay ni «Atrás» ni «Anterior»: un botón apagado en la
       primera pantalla es cromo muerto. */
    expect(html).not.toContain('Atrás');
    expect(html).not.toContain('Anterior');
  });

  /*
    Y que hable en segunda persona. El catálogo del perfil está escrito para el
    entrenador («Le gusta», «Días que puede entrenar») porque de él salen también
    su ficha y su constructor; `formSections` es la única puerta por la que llega
    al cliente y es donde se traduce.

    Con UNA sola tanda, que además es el otro camino del cuerpo: un carril de un
    paso es el índice de algo que no se recorre, así que ahí no sale ni él ni el
    pie — la hoja entera y punto.
  */
  it('con una sola tanda no hay capítulo, y habla en segunda persona', () => {
    const form = {
      id: 'f7',
      momento: 'alta',
      name: 'Solo la comida',
      asked: ['likes'],
      required: [],
      custom: [],
    };

    const html = renderToStaticMarkup(
      <VistaPreviaFormulario form={form} elementos={[]} onCerrar={cerrar} />
    );

    expect(html).toContain('Lo que te gusta');
    expect(html).not.toContain('Le gusta');
    expect(html).not.toContain('Lo que él dice que tiene');
    expect(html).not.toContain('apartado-tit');
    expect(html).not.toContain('wiz-rail');
    /* Una tanda sola no tiene a dónde ir: su caja y ningún pie. */
    expect(html).toContain('campo-q alta-caja');
    expect(html).not.toContain('alta-pie');
  });

  it('sin nada montado todavía, se dice en vez de enseñar una hoja en blanco', () => {
    const form = { id: 'f3', momento: 'libre', name: 'Sin estrenar' };

    const html = renderToStaticMarkup(
      <VistaPreviaFormulario form={form} elementos={[]} onCerrar={cerrar} />
    );

    expect(html).toContain('Todavía no le preguntas nada');
    expect(html).not.toContain('Enviárselo');
  });
});
