import { describe, expect, it } from 'vitest';

import { anamnesisFileName, buildAnamnesis } from './anamnesis';
import { anamnesisHtml } from '@/lib/anamnesisDoc';
import { cleanCondition } from './conditions';
import { cleanEquipment } from './equipment';
import { cleanProfile } from './profile';

/**
 * ══ Lo que estas pruebas defienden ══════════════════════════════════════════
 *
 * Dos cosas, y las dos son de las que no se ven mirando la pantalla:
 *
 *   1. Que un documento de salud no MIENTA. Lo que no consta tiene que decirse
 *      como que no consta, y lo que no se puede hacer tiene que salir arriba y
 *      marcado: quien lee esta hoja con prisa busca exactamente eso.
 *   2. Que el archivo sea un DOCUMENTO y no un programa. Todo lo que entra lo ha
 *      escrito una persona, y esto acaba en un `.html` que se abre en local —
 *      donde el navegador es más confiado que en ninguna otra parte—.
 */

const cliente = {
  name: 'José Pérez',
  gender: 'Hombre',
  birthDate: '1990-06-15',
  heightCm: 178,
  email: 'jose@ejemplo.com',
  profile: cleanProfile({ sleepHours: 7, mealsPerDay: 4 }),
  preferences: {},
};

const armar = (extra = {}) =>
  buildAnamnesis(
    { client: cliente, conditions: [], equipment: [], history: [], ...extra },
    '2026-08-25'
  );

describe('buildAnamnesis', () => {
  it('lleva la fecha en la que se generó', () => {
    /* Un historial sin fecha invita a creer que está al día. Éste vale
       exactamente lo que valía el día que se sacó. */
    expect(armar().generatedAt).toBe('2026-08-25');
  });

  it('la edad se calcula, no se copia', () => {
    expect(armar().identidad).toContainEqual(['Edad', '36 años']);
  });

  /* «No tiene» y «no se preguntó» son cosas distintas, y en un historial la
     diferencia es la mitad del valor. */
  it('lo que falta se enumera aparte en vez de desaparecer', () => {
    const doc = buildAnamnesis(
      { client: { name: 'Sin datos', preferences: {} }, conditions: [], equipment: [], history: [] },
      '2026-08-25'
    );
    expect(doc.sinConstar).toContain('Altura');
    expect(doc.sinConstar).toContain('Edad');
    expect(doc.identidad.map(([k]) => k)).not.toContain('Altura');
  });

  it('los vetos van los primeros y marcados', () => {
    const doc = armar({
      conditions: [
        cleanCondition({ id: '1', label: 'Molestia de hombro', severity: 'note', area: 'training' }),
        cleanCondition({ id: '2', label: 'Hernia L5-S1', severity: 'block', area: 'training' }),
      ],
    });
    expect(doc.conditions[0].label).toBe('Hernia L5-S1');
    expect(doc.conditions[0].blocking).toBe(true);
  });

  it('lo resuelto se conserva pero va aparte', () => {
    const doc = armar({
      conditions: [
        cleanCondition({ id: '1', label: 'Rotura fibrilar', resolvedAt: '2026-01-10' }),
      ],
    });
    expect(doc.conditions).toHaveLength(0);
    expect(doc.resolved[0].label).toBe('Rotura fibrilar');
  });

  it('solo salen las tandas del perfil que tienen algo', () => {
    const doc = armar();
    const etiquetas = doc.blocks.map((b) => b.label);
    expect(etiquetas).toContain('Cómo entrena');
    expect(etiquetas).toContain('Cómo come');
    for (const bloque of doc.blocks) expect(bloque.rows.length).toBeGreaterThan(0);
  });

  it('del gimnasio va el recuento, no las fotos', () => {
    const doc = armar({
      equipment: [
        cleanEquipment({ id: 'a', photoPath: 'c/gym/1.webp', muscleGroup: 'Pecho' }),
        cleanEquipment({ id: 'b', photoPath: 'c/gym/2.webp', muscleGroup: 'Pecho' }),
      ],
    });
    expect(doc.gym.total).toBe(2);
    expect(doc.gym.groups).toEqual([{ group: 'Pecho', count: 2 }]);
  });
});

describe('anamnesisFileName', () => {
  it('quita los acentos en vez de convertirlos en guiones', () => {
    /* Sin normalizar, la «é» de «José» no pasa el filtro de a-z y el archivo se
       llamaría «jos-». */
    expect(anamnesisFileName(cliente, '2026-08-25')).toBe('anamnesis-jose-perez-2026-08-25.html');
  });

  it('aguanta un cliente sin nombre', () => {
    expect(anamnesisFileName({}, '2026-08-25')).toBe('anamnesis-cliente-2026-08-25.html');
  });
});

describe('anamnesisHtml', () => {
  it('escapa lo que escribe una persona', () => {
    /*
      El caso que esto impide: un condicionante escrito con un `<script>` dentro
      acabaría ejecutándose al abrir el archivo descargado — y un `.html` local
      es donde el navegador menos protege.
    */
    const doc = armar({
      conditions: [
        cleanCondition({ id: '1', label: '<script>alert(1)</script>', area: 'training' }),
      ],
    });
    const html = anamnesisHtml(doc);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapa también el nombre, que va en el título', () => {
    const doc = buildAnamnesis(
      { client: { name: '"><img src=x>', preferences: {} }, conditions: [], equipment: [], history: [] },
      '2026-08-25'
    );
    expect(anamnesisHtml(doc)).not.toContain('<img src=x>');
  });

  it('es un documento completo y en español', () => {
    const html = anamnesisHtml(armar());
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('lang="es"');
    expect(html).toContain('charset="utf-8"');
    /* Los estilos van dentro: el archivo tiene que verse igual dentro de tres
       años en un ordenador que no conoce esta aplicación. */
    expect(html).toContain('<style>');
    expect(html).not.toContain('<link');
  });

  it('dice lo que es y lo que no es', () => {
    const html = anamnesisHtml(armar());
    expect(html).toContain('no sustituye a un informe');
    expect(html).toContain('datos de salud');
  });

  it('sin condicionantes lo dice, en vez de dejar el hueco', () => {
    expect(anamnesisHtml(armar())).toContain('No consta ninguno');
  });
});
