/* SOLO LECTURA: comprueba que lo sembrado es coherente. */
import { createClient } from '@supabase/supabase-js';

const ID = 'c91c5cd3-ddb6-4469-947c-9d2070080c23';
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const [c, w, a, n, ci, ph] = await Promise.all([
  db.from('clients').select('name, start_date, plan, preferences').eq('id', ID).single(),
  db.from('workout_data').select('microcycles, blocks, weekly_split').eq('client_id', ID).maybeSingle(),
  db.from('anthropometry').select('history').eq('client_id', ID).maybeSingle(),
  db.from('nutrition_plans').select('target_kcals, protein_grams, carbs_grams, fats_grams, steps_goal, cardio_goal').eq('client_id', ID).maybeSingle(),
  db.from('check_ins').select('week_start, program_week, weight, answers, snapshot').eq('client_id', ID).order('week_start'),
  db.from('client_phases').select('title, direction, rate_pct, starts_on, ends_on').eq('client_id', ID).order('starts_on'),
]);

const micros = w.data?.microcycles || [];
const hist = a.data?.history || [];
const checks = ci.data || [];

console.log(`${c.data.name} · alta ${c.data.start_date} · plan ${c.data.plan}`);
console.log(`preguntas de check-in: ${(c.data.preferences?.protocol?.checkinQuestions || []).join(', ') || '—'}`);
console.log(`\nPROGRAMA  ${micros.length} semanas · bloques: ${(w.data?.blocks || []).map((b) => `${b.name} S${b.fromWeek}-${b.toWeek ?? '…'}`).join(' | ')}`);
console.log(`  días por bloque: S1 [${(micros[0]?.days || []).map((d) => d.dayName).join(', ')}] · S15 [${(micros.at(-1)?.days || []).map((d) => d.dayName).join(', ')}]`);
console.log(`  sesiones anotadas: ${micros.reduce((t, m) => t + (m.sessions?.length || 0), 0)}`);
console.log(`  semanas sin sesión: ${micros.filter((m) => !(m.sessions || []).length).map((m) => m.weekNumber).join(', ') || 'ninguna'}`);
const push = micros.filter((m) => (m.sessions || []).some((s) => s.dayName === 'Push A'));
console.log(`  «Push A» con sesión en: S${push.map((m) => m.weekNumber).join(', S')}`);
const cargas = push.map((m) => m.sessions.find((s) => s.dayName === 'Push A').entries[0].sets[0].kg);
console.log(`  press banca semana a semana: ${cargas.join(' → ')} kg`);

console.log(`\nCUERPO    ${hist.length} pesajes · ${hist.filter((h) => h.perimeters).length} con perímetros`);
console.log(`  peso: ${hist[0]?.weight} → ${hist.at(-1)?.weight} kg (min ${Math.min(...hist.map((h) => h.weight))}, max ${Math.max(...hist.map((h) => h.weight))})`);
console.log(`  ombligo: ${hist.find((h) => h.perimeters)?.perimeters.ombligo} → ${[...hist].reverse().find((h) => h.perimeters)?.perimeters.ombligo} cm`);

console.log(`\nDIETA     ${n.data.target_kcals} kcal · P${n.data.protein_grams} C${n.data.carbs_grams} G${n.data.fats_grams} · ${n.data.steps_goal} pasos · ${n.data.cardio_goal || '—'}`);

console.log(`\nCHECK-INS ${checks.length} · con respuestas: ${checks.filter((r) => r.answers).length} · con foto de plan: ${checks.filter((r) => r.snapshot).length}`);
const peldanos = [];
let prevK = null, prevP = null;
for (const r of checks) {
  const k = r.snapshot?.kcals, p = r.snapshot?.steps;
  if (k !== prevK || p !== prevP) peldanos.push(`S${r.program_week}: ${k} kcal / ${p} pasos`);
  prevK = k; prevP = p;
}
console.log(`  peldaños: ${peldanos.join('  →  ')}`);
console.log(`  hambre: ${checks.map((r) => r.answers?.hunger).join(' ')}`);
console.log(`  adherencia: ${checks.map((r) => r.answers?.adherence).join(' ')}`);

console.log(`\nFASES     ${(ph.data || []).map((p) => `${p.title} (${p.direction} ${p.rate_pct}%) ${p.starts_on}→${p.ends_on}`).join('\n          ')}`);
