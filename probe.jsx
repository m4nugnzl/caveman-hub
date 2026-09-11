/* Banco de pruebas temporal: la hoja real con datos, para mirarla. Se borra. */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';

import '@/index.css';
import { planExerciseView } from '@/domain/blocks';
import { buildExercise } from '@/domain/training';
import { EscribirHoja } from '@/components/Coach/Workout/EscribirHoja';

const conPesos = (ex, pesos) => ({
  ...ex,
  sets: ex.sets.map((s, i) => ({ ...s, targetKg: pesos[i] ?? '', targetRir: String(3 - i) })),
});

const inicial = [
  conPesos(buildExercise({ name: 'Press banca', muscle: 'Pectoral', numSets: 4, targetReps: '6-8' }), [
    '100',
    '100',
    '95',
    '95',
  ]),
  {
    ...conPesos(buildExercise({ name: 'Press inclinado con mancuernas', muscle: 'Pectoral', numSets: 3, targetReps: '8-10' }), ['34', '34', '30']),
    restSeconds: 90,
  },
  {
    ...buildExercise({ name: 'Extensiones tríceps unilateral', muscle: 'Tríceps', numSets: 3, targetReps: '8-10' }),
    enlazado: true,
  },
];
inicial[2].sets[2].tecnica = { id: 'bajada', tandas: 2, recorte: 20 };

const Banco = () => {
  const [lista, setLista] = useState(inicial);
  const con = (name, fn) => setLista((l) => l.map((ex) => (ex.name === name ? fn(ex) : ex)));
  const conSets = (name, fn) => con(name, (ex) => ({ ...ex, sets: fn(ex.sets || []) }));
  const siguiente = (sets) => ({ kg: '', reps: '', rir: '', targetKg: '', targetReps: sets[sets.length - 1]?.targetReps || '', targetRir: '' });

  return (
    <div style={{ padding: 24, maxWidth: 860 }}>
      <EscribirHoja
        dayName="Empuje"
        exercises={lista.map(planExerciseView)}
        library={[{ name: 'Fondos en paralelas', muscle: 'Pectoral', equipment: 'Peso libre' }]}
        conNotas
        showRir
        onAdd={(ex) => setLista((l) => [...l, ex])}
        onQuitar={(_d, name) => setLista((l) => l.filter((ex) => ex.name !== name))}
        onMover={(_d, name, delta) =>
          setLista((l) => {
            const i = l.findIndex((ex) => ex.name === name);
            const j = i + delta;
            if (i < 0 || j < 0 || j >= l.length) return l;
            const copia = [...l];
            const [p] = copia.splice(i, 1);
            copia.splice(j, 0, p);
            return copia;
          })
        }
        onSeries={(_d, name, n) =>
          conSets(name, (sets) => {
            const s = [...sets];
            while (s.length < n) s.push(siguiente(s));
            while (s.length > n && s.length > 1) s.pop();
            return s;
          })
        }
        onTodas={(_d, name, campo, valor) => conSets(name, (sets) => sets.map((s) => ({ ...s, [campo]: valor })))}
        onGramatica={(_d, name, campos) => con(name, (ex) => ({ ...ex, ...campos }))}
        onSerie={(_d, name, i, campo, valor) =>
          conSets(name, (sets) => sets.map((s, k) => (k === i ? { ...s, [campo]: valor } : s)))
        }
        onAnadirSerie={(_d, name) => conSets(name, (sets) => [...sets, siguiente(sets)])}
        onQuitarSerie={(_d, name, i) => conSets(name, (sets) => sets.filter((_, k) => k !== i))}
        onTecnica={(_d, name, i, t) =>
          conSets(name, (sets) => sets.map((s, k) => (k === i ? { ...s, tecnica: t || undefined } : s)))
        }
        onRecordar={() => {}}
      />
    </div>
  );
};

createRoot(document.getElementById('root')).render(<Banco />);
