# Caveman Hub

Aplicación de gestión de entrenamiento personal: programación de rutinas,
nutrición, antropometría y seguimiento de la evolución física con fotos.

Dos roles sobre la misma base de datos:

- **Entrenador** — da de alta clientes, les programa microciclos, define su plan
  nutricional, registra sus mediciones y monta comparativas de sus fotos.
- **Cliente** — consulta su rutina y registra lo que levanta, ve su dieta, anota
  su peso semanal y **sube sus fotos de progreso**, que le llegan al entrenador.

## Stack

| Pieza | Tecnología |
|---|---|
| Build y dev server | Vite 5 |
| Interfaz | React 18 (JSX, sin TypeScript por ahora) |
| Iconos | lucide-react |
| Backend | Supabase — Postgres + Auth + Storage |
| Estilos | CSS propio con tokens y utilidades (`src/index.css`) |
| Lint | ESLint 9 (flat config) + react-hooks |

No hay framework de servidor: es una SPA que habla directamente con Supabase, y
la autorización la aplican las políticas de **Row Level Security** de la base de
datos.

## Arrancar el proyecto

```bash
npm install
cp .env.example .env      # rellena con los datos de tu proyecto Supabase
npm run dev               # http://localhost:3000
```

Las variables van en `.env` (Supabase Dashboard → *Settings* → *API*):

```
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=...
```

La `anon key` es segura de exponer en el cliente: toda la autorización real vive
en RLS. **Nunca** pongas aquí la `service_role key`.

Necesitas además el esquema de base de datos y un bucket privado llamado
`client-media`. Ver **[`supabase/README.md`](supabase/README.md)** — incluye la
estructura que la aplicación espera y cómo exportar el esquema real.

### Comandos

```bash
npm run dev       # servidor de desarrollo
npm run build     # build de producción en dist/
npm run preview   # sirve el build para comprobarlo
npm run lint      # ESLint sobre todo el proyecto
```

## Estructura

```
src/
├── main.jsx                  ErrorBoundary → ConfirmProvider → AppProvider → App
├── App.jsx                   decide entre Login, panel del coach y portal del cliente
├── index.css                 tokens, primitivas (.btn, .input, .panel…) y responsive
│
├── domain/                   REGLAS DE NEGOCIO — funciones puras, sin React
│   ├── training.js           volumen efectivo, tonelaje, MEV/MRV, microciclos
│   ├── anthropometry.js      % graso por pliegues, promedios, series temporales
│   ├── nutrition.js          macros, kcal por alimento/opción/día
│   ├── photos.js             semanas, rutas de Storage, agrupación, ángulos
│   └── photoLayout.js        geometría del montaje de fotos
│
├── lib/                      infraestructura
│   ├── supabaseClient.js
│   ├── mappers.js            frontera snake_case ↔ camelCase
│   ├── saveQueue.js          cola de guardado con debounce y estado
│   ├── useMirroredState.js   estado con espejo sincrónico (ver el archivo)
│   ├── ids.js, num.js, useClickOutside.js
│
├── context/AppContext.jsx    estado global, carga y persistencia
│
└── components/
    ├── ui/                   primitivas compartidas (Panel, Modal, charts…)
    ├── photos/               diálogo de subida, usado por coach y cliente
    ├── Coach/
    │   ├── Workout/          editor de rutina, en piezas
    │   ├── Nutrition/        editor de comidas
    │   └── PhotoStudio/      comparador y editor de fotos
    └── Client/               portal del cliente, una vista por pestaña
```

La separación importante es **`domain/` no sabe que existe React**. Todo lo que
es una regla de negocio (qué cuenta como serie efectiva, cómo se calcula el %
graso, cómo se encaja una foto en un hueco) son funciones puras que se pueden
razonar y testear sin montar un componente.

## Modelo de datos

Híbrido relacional + JSONB. Las entidades con identidad propia son tablas; los
árboles profundos van en columnas `jsonb`, una fila por cliente:

```
microcycles[] → { id, weekNumber, sessionNumber, date, days[] }
                                                  → { dayName, exercises[] }
                                                        → { id, name, muscle, sets[] }
                                                              → { kg, reps, rir, targetReps }
```

Detalle completo de tablas y columnas en [`supabase/README.md`](supabase/README.md).

### Cómo se guardan los cambios

Toda mutación es optimista: primero se actualiza la interfaz, después se
persiste. Tres garantías, implementadas en `src/lib/saveQueue.js`:

1. **Una sola petición en vuelo por clave.** Si llegan más cambios mientras se
   guarda, se retiene el último y se reenvía al terminar. Sin esto, una respuesta
   antigua puede llegar después de una nueva y pisar el cambio reciente.
2. **Debounce en los campos de texto.** Escribir `102.5` en un campo de kg
   lanzaba cinco escrituras, y cada una reserializaba el programa completo. Los
   cambios estructurales (añadir, borrar, reordenar) sí se envían al instante.
3. **Los fallos se ven.** El estado de guardado es `saving` / `saved` / `error`
   con botón de reintento. La interfaz nunca dice «Guardado» sobre una escritura
   que falló.

## Fotos de progreso

El circuito completo:

1. El cliente sube una foto desde **Mis fotos**, indicando semana y ángulo
   (frontal / lateral / espalda).
2. Se guarda en el bucket privado `client-media`, en
   `<clientId>/photos/week-<n>/…`. Las carpetas por semana son reales.
3. Al entrenador le aparece en **Fotos & Evolución**, agrupada por semana.

En el **Photo Studio** el entrenador puede:

- Comparar en tres composiciones: **antes/después**, **rejilla** de varias
  semanas, y **deslizador** superpuesto.
- **Encuadrar** cada foto (zoom, desplazamiento, rotación, espejo) para que dos
  fotos de semanas distintas queden a la misma escala y altura. Sin esto la
  comparación engaña: dos fotos a distinta distancia sugieren un cambio que no
  existe.
- **Ajustar** brillo, contraste y saturación para compensar diferencias de luz.
- **Anotar** con guías horizontales, líneas, flechas y texto.
- **Exportar** a PNG en proporción automática, 1:1, 4:5, 9:16 o 16:9.

Los ajustes son **no destructivos**: son parámetros de renderizado del montaje.
El archivo original en Storage no se modifica nunca.

## Decisiones y deuda técnica conocida

Cosas que están así a propósito, y por qué:

- **Sin routing.** Las secciones son pestañas con estado local, así que no hay
  URLs por sección ni enlaces profundos. Es la mejora estructural más rentable
  pendiente: habilitaría deep links, botón atrás y code splitting por ruta.
- **Sin TypeScript.** El contrato de las estructuras JSONB es convencional, no
  verificado. Ya se rompió una vez (`targetReps` pasó de estar en el ejercicio a
  estar en cada serie y una vista siguió leyendo el sitio antiguo). Tipar la
  frontera de datos es donde más rendiría.
- **Sin tests.** Las funciones de `domain/` son puras precisamente para poder
  testearlas; es el siguiente paso natural.
- **Un solo contexto global.** Funciona y está memoizado, pero mezcla caché de
  datos de servidor con estado de interfaz. Una librería de datos (TanStack
  Query) daría revalidación, reintentos y rollback automáticos.
- **Escritura concurrente coach ↔ cliente.** Los dos pueden editar las mismas
  series y se escribe el bloque JSONB completo, así que el último en guardar gana
  sobre *todo el programa*, no solo sobre la celda tocada. Lo más sensato es
  separar el **plan** (del coach) del **registro de ejecución** (del cliente) en
  tablas distintas.
- **Carga inicial completa.** Al entrar se traen los datos de todos los clientes.
  Con muchos clientes y programas largos habrá que paginar o cargar bajo demanda.
- **Vulnerabilidad de `esbuild` (moderada, solo desarrollo).** Afecta al dev
  server de Vite 5, no al build de producción (`npm audit --omit=dev` da 0).
  Resolverla exige subir a Vite 6/7, que es un cambio con rupturas.
- **Google Fonts por CDN.** Bloquea el primer render y añade una dependencia
  externa. Autoalojar la fuente lo arreglaría.

## Convenciones

- Los estilos van en **clases CSS** (`src/index.css`). El `style` inline se
  reserva para valores dinámicos de verdad (un ancho calculado, el color de un
  dato). Nada de simular `:hover` con handlers de JavaScript.
- Los números que teclea el usuario se guardan como texto y se convierten con
  `toNum` de `src/lib/num.js`, que devuelve `null` para «sin dato» — `Number('')`
  es `0` y confundir ambos falseaba los cálculos de volumen.
- Los identificadores de entidades dentro de JSONB se crean con `newId()`
  (`crypto.randomUUID`), nunca con `Date.now()`.
- Toda acción destructiva pasa por `useConfirm()`.
- Importaciones con el alias `@/` en lugar de cadenas `../../..`.
