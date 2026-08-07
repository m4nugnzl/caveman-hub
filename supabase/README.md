# Base de datos (Supabase)

- **`schema.sql`** — esquema real de `public`, ya versionado. Es la fuente de
  verdad del código: los mapeadores de `src/lib/mappers.js` se corresponden con
  estas columnas exactamente.
- **`roles.sql`** — volcado de columnas en JSON. Útil como referencia, pero **no
  contiene las políticas RLS** (ver el apartado pendiente al final).
- **`migrations/0001_optional_normalizations.sql`** — dos mejoras opcionales. La
  aplicación funciona sin ejecutarlas.

## Cómo se corresponde el código con el esquema

Tres decisiones merecen explicación, porque el esquema no tiene columnas para
todo lo que el producto necesita y el código se adapta a lo que hay.

### 1. `anthropometry` guarda solo `history`

La tabla tiene únicamente `id, client_id, history (jsonb), updated_at`.

Cada entrada de `history` es una revisión:

```json
{
  "id": "log_…",
  "date": "2026-03-12",
  "weight": 81.4,
  "skinFolds":  { "tricipital": 8, "abdominal": 14, … },   // opcional
  "perimeters": { "ombligo": 84, "pecho": 104, … },        // opcional
  "nutrition":  { "kcals": 2600, "protein": 180, "carbs": 300, "fats": 70 }
}
```

- **`weight` es obligatorio**; pliegues y perímetros son opcionales y se omiten
  del JSON si no se han medido (un cero no es lo mismo que «no medido»).
- **No existe `three_day_weights`.** El promedio de días alternos se **calcula**
  a partir de los registros de `history` (`rollingWeightAverage` y
  `weeklyWeightAverages` en `src/domain/anthropometry.js`). Mejor así: en vez de
  tres huecos que se sobrescriben cada semana, quedan pesajes con fecha real que
  alimentan la tendencia.
- **`nutrition`** es una foto de las kcal y macros vigentes en el momento de la
  revisión. `nutrition_plans` solo guarda el plan actual, sin histórico, así que
  esta foto es lo que permite cruzar dieta con evolución de peso. Si algún día se
  quiere granularidad fina (cada cambio de macros, no cada revisión), lo suyo es
  añadir `nutrition_history jsonb` a `nutrition_plans`.

### 2. Los metadatos de las fotos viven en `tag`

`progress_photos` tiene solo `id, client_id, photo_url, tag, created_at`.

| Dato | Dónde se guarda |
|---|---|
| Semana del programa | En la **ruta** de Storage: `<clientId>/photos/week-12/…` |
| Fecha | `created_at` |
| Ángulo, peso, notas | JSON compacto en `tag`: `{"angle":"frontal","weight":81.5}` |
| Ruta del archivo | `photo_url` (la URL firmada se genera en cada carga) |

Es un compromiso consciente: evita una migración y queda contenido en
`src/lib/mappers.js`, a cambio de no poder filtrar por ángulo o peso desde SQL
(la aplicación filtra en cliente de todas formas). La migración opcional los
saca a columnas propias.

Las filas antiguas cuyo `tag` sea texto plano se interpretan como el ángulo.

### 3. `photo_url` admite dos formatos

- **Filas nuevas:** la **ruta** de Storage. La URL firmada se genera en cada
  carga de la aplicación (8 h de validez).
- **Filas antiguas:** una URL firmada completa **de un año**. Todas caducan de
  golpe en su fecha de aniversario. `isRemoteUrl` en `src/domain/photos.js`
  distingue los dos casos.

### 4. Columnas del esquema que la aplicación no usa

- `workout_data.data` y `nutrition_plans.meals` — restos de una versión anterior.
  Son `NOT NULL` con default, así que los `insert` funcionan sin tocarlas.
- Tabla `videos` completa — la revisión de vídeos se retiró del producto. No se
  ha borrado nada: los datos históricos siguen ahí si los quieres.
- `profiles.full_name` — el registro lo envía en los metadatos de Auth y lo
  rellena el trigger; la aplicación solo lee `role`.

## Constraints que el código da por hechas

Estas tres existen y son las que hacen posible el `upsert` de un bloque por
cliente (`onConflict: 'client_id'`):

```
anthropometry_client_id_key    UNIQUE (client_id)
nutrition_plans_client_id_key  UNIQUE (client_id)
workout_data_client_id_key     UNIQUE (client_id)
```

**`exercises` y `foods` NO tienen `UNIQUE (coach_id, name)`.** Por eso
`upsertByName` en `src/context/AppContext.jsx` consulta primero y luego decide
entre `INSERT` y `UPDATE`, en vez de hacer un único `upsert`. La migración
opcional añade el índice y permite simplificarlo.

## Storage

Un bucket **privado** llamado `client-media`:

```
<clientId>/photos/week-<n>/<timestamp>-<angulo>.<ext>
```

## Pendiente: las políticas RLS

`roles.sql` no las incluye, así que **siguen sin estar versionadas ni
revisadas**. Es el único riesgo importante que queda abierto: la anon key es
pública por diseño, de modo que RLS es la única frontera de autorización real.

Para exportarlas:

```sql
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

Y para las de Storage:

```sql
select name, definition, check_definition
from storage.policies;   -- o: select * from pg_policies where schemaname='storage';
```

Puntos que la aplicación asume que RLS protege:

1. Un coach solo lee y escribe `clients` con su `coach_id`.
2. Un cliente solo lee la fila de `clients` cuyo `client_profile_id` es el suyo.
3. `workout_data`, `anthropometry`, `nutrition_plans` y `progress_photos` se
   filtran **a través de `clients`**, comprobando que el `client_id` pertenece al
   coach o al propio cliente.
4. `exercises` y `foods`: solo el coach propietario.
5. **Escritura del cliente.** El producto exige que un cliente pueda:
   - escribir en `anthropometry` (registra su peso y sus medidas),
   - escribir en `workout_data` (registra sus kg, reps y RIR),
   - insertar en `progress_photos` y **subir a Storage dentro de su propia
     carpeta** `<clientId>/…`, sin poder leer ni listar las de otros.

   Si alguna de esas políticas no existe, la acción fallará con un error de
   permisos **visible en la interfaz** (el indicador de guardado lo muestra); no
   se pierde nada en silencio.

El conmutador de vista coach/cliente de la interfaz **no es un control de
seguridad**: solo cambia lo que se pinta.
