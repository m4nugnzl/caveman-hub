# CavemanHUB — de prototipo a app real (Supabase)

## Diagnóstico (por si lo necesitas releer)

- **`CavemanHUB` (sin guion)** es el proyecto real: Vite + React, todos los
  módulos del entrenador y el portal del cliente ya escritos y con el
  diseño visual que te gusta. Pero vivía 100% en memoria (`AppContext.jsx`
  con `useState`) — al recargar, se perdía todo.
- Los `docs/` de ese mismo repo describen una arquitectura objetivo con
  Express + Prisma + Redis + Docker, pero `packages/` y `apps/` están vacíos
  (solo `package.json`, cero código). Es un plan de 9 semanas sin empezar.
- Decidiste el atajo: mismo modelo de datos relacional que ya tenías
  pensado, pero sobre **Supabase** (Postgres + Auth + Storage) en vez de
  construir Express/JWT/Redis/Docker a mano.

## Qué hice en esta carpeta

Es tu `CavemanHUB` con **una sola pieza reemplazada**: `AppContext.jsx`.
Ningún componente de `components/Coach/` o `components/Client/` cambió —
siguen recibiendo exactamente la misma forma de datos que antes
(`clients`, `workoutData`, `anthropometry`, `nutrition`, `videos`,
`activeClient`, y las mismas ~20 funciones de mutación). Solo cambió
**de dónde vienen esos datos**.

- **`supabase/schema.sql`**: el esquema completo — tablas `profiles`,
  `clients`, `workout_data`, `anthropometry`, `nutrition_plans`, `videos`,
  con Row Level Security para que un entrenador solo vea a sus clientes y
  un cliente solo vea lo suyo. Los bloques muy anidados (microciclos →
  días → ejercicios → series, historial antropométrico, comidas cerradas)
  se guardan como JSONB — es la misma decisión que ya tenías en
  `architecture_decision.md` (`WorkoutData.data Json` en Prisma), aplicada
  directamente en Postgres sin el paso intermedio de Prisma/Express.
- **`src/lib/supabaseClient.js`**: cliente de Supabase para Vite.
- **`src/context/AppContext.jsx`**: reescrito. Al cargar, trae de Supabase
  los clientes del entrenador logueado (o el propio registro si es un
  cliente) y todos sus datos relacionados. Cada función de mutación
  (`updateExerciseSet`, `cloneMicrocycle`, `addAnthropometryLog`,
  `uploadClientVideo`, etc.) actualiza el estado local al instante (UI
  optimista, igual que antes) y además persiste en Supabase.
- **`src/components/Auth/Login.jsx`** + `App.jsx` actualizado: login/registro
  real con Supabase Auth. Sin sesión, ves el login; con sesión, tu
  dashboard de siempre.
- **`package.json` corregido**: el que tenía tu repo en la raíz era la
  configuración del monorepo Turbo (vacío), sin `react` ni `vite` como
  dependencias — por eso no podía arrancar de verdad. Este trae lo que la
  app realmente usa: `react`, `vite`, `lucide-react`, `@supabase/supabase-js`.

## Cómo arrancarlo

1. Crea un proyecto en [supabase.com](https://supabase.com) (gratis para
   empezar).
2. SQL Editor → pega el contenido de `supabase/schema.sql` → Run.
3. Settings → API → copia `Project URL` y `anon public key`.
4. `cp .env.example .env` y rellena esas dos variables.
5. `npm install`
6. `npm run dev` → verás el login. Créate una cuenta (queda como `coach`
   por defecto) y desde el dashboard usa "+ Nuevo Cliente" para dar de
   alta a tus atletas — ya no son los 3 clientes de ejemplo, es tu roster
   real.

## Lo que queda simplificado (y por qué)

- **Vídeos**: se suben de verdad a Supabase Storage (bucket
  `client-media`, privado). Por simplicidad, la URL firmada que se guarda
  dura 1 año; para producción real conviene regenerarla al vuelo en vez
  de guardarla fija (cambio pequeño, lo hacemos cuando quieras).
- **Google Drive y Notion** (fotos de equipo, sincronización de pagos):
  no están conectados todavía. Es la misma fase 4/5 que ya tenías en tu
  roadmap — cambiar de "adapter" de almacenamiento no toca el esquema.
- **Alta de clientes desde cero**: ya no arrancas con Franco/Ana/Javier de
  ejemplo — el roster empieza vacío y lo rellenas tú. Si quieres esos 3
  clientes de ejemplo para seguir probando visualmente, dímelo y te paso
  un `seed.sql` con esos mismos datos ya convertidos a filas reales.
- **Vincular la cuenta de un cliente**: la tabla `clients` tiene
  `client_profile_id` preparado para esto (igual que `fitcoach_hub_documentacion_tecnica.md`
  ya describía), pero el flujo de "canjear invitación" (que el cliente se
  registre y quede enlazado a su ficha) todavía no tiene pantalla propia.
  Es el siguiente paso lógico si quieres que tus clientes entren con su
  propia cuenta en vez de que tú operes todo desde el rol de coach.

¿Sigo con el flujo de invitación de clientes, o prefieres que primero te
deje el `seed.sql` con los 3 clientes de ejemplo para probar todo el
ecosistema de un tirón?
