# Base de datos (Supabase)

- **`schema.sql`** — esquema real de `public`, ya versionado. Es la fuente de
  verdad del código: los mapeadores de `src/lib/mappers.js` se corresponden con
  estas columnas exactamente.
- **`roles.sql`** — volcado de columnas en JSON. Útil como referencia, pero **no
  contiene las políticas RLS** (ver el apartado pendiente al final).

## Estado de las migraciones

Cada archivo dice en su cabecera si hace falta y por qué. Resumen:

| Archivo | ¿Ejecutar? | Qué pasa si no |
|---|---|---|
| `0001_optional_normalizations.sql` | Opcional | Nada. `upsertByName` hace dos consultas en vez de una. |
| `0002_rls_hardening.sql` | **Sí** | El cliente puede ponerse el pago al día, cambiar su `role` y borrar todo su programa con la anon key. |
| `0003_unique_client_blocks.sql` | Recomendada | Dos escrituras simultáneas pueden partir los datos de un cliente en dos filas, sin error visible. |
| `0004_nutrition_rest_targets.sql` | Opcional | Nada. El objetivo de descanso sigue en la columna `meals`. |
| `0005_client_preferences.sql` | **Sí** | La personalización del resumen no se guarda. |
| `0007_storage_policies.sql` | **Sí** | **El bucket `client-media` no existe**: toda subida de fotos falla. Comprobado en el proyecto real. |
| `0008_client_preferences_rpc.sql` | **Sí** | La personalización del resumen no se guarda (la app llama a esta función). |
| `0009_checkins_calendar.sql` | Cuando quieras el aviso de check-in exacto y el calendario | El tablero deduce el estado y el calendario no guarda eventos. |
| `0010_integrations.sql` | Cuando quieras conectar Notion | La pantalla de Integraciones avisa de que falta. Requiere además desplegar la Edge Function. |
| `0011_review_links.sql` | **Sí, para compartir vídeos** | El enlace del vídeo caduca a los 7 días y no se sabe si el cliente lo ha visto. Requiere desplegar `review-link`. |
| `0006_teams.sql` | Cuando quieras equipos | La pestaña «Equipo» avisa de que falta y la app funciona como entrenador único. Ver `docs/modelo-de-equipo.md`. |
| `0017_audit_log.sql` | Cuando trabajes en equipo, o antes de tener clientes pagando | Nadie sabe quién cambió el plan de un cliente ni cuándo. La ficha del cliente avisa de que falta. Aditiva: solo añade una tabla y unos disparadores. |
| `0016_session_feedback.sql` | Cuando quieras el feedback de las sesiones | El entrenador puede dejar sus notas y montar el calentamiento (los escribe él, que tiene UPDATE), pero **al cliente le falla el guardado** al contestar o al escribir en su cuaderno: ve el error con su botón de reintentar. Aditiva, no cambia ningún permiso. |

Orden si empiezas de cero: `0005` → `0008` → `0002` → `0007` → `0003` → (`0006`).

`0002` va antes de `0007` porque las políticas de Storage se apoyan en poder leer
`clients`, pero son independientes.

## Edge Functions

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase functions deploy notion-payments
npx supabase functions deploy review-link
```

La configuración está en `supabase/config.toml`. `notion-payments` se despliega con
**`verify_jwt = false`** a propósito: con la comprobación en la pasarela, la
petición `OPTIONS` de comprobación del navegador —que nunca lleva cabecera de
sesión— se rechaza con un 401, y el navegador lo reporta como un error de CORS que
no tiene nada que ver con CORS. La autorización la hace la propia función, y
comprueba **más** que la pasarela: que la integración sea tuya, no solo que el
token sea válido.

Para saber si una función está desplegada:

```bash
curl -i -X OPTIONS https://<proyecto>.supabase.co/functions/v1/notion-payments
```

**204** = desplegada. **404** = no lo está — y el navegador lo enseñará como un
fallo de CORS, porque un 404 no lleva cabeceras de CORS. Es el despiste más
probable la primera vez.

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

El primer segmento de la ruta es el id del cliente, y eso es lo que usan las
políticas para acotar el acceso sin ninguna tabla extra
(`0007_storage_policies.sql`). La aplicación firma las URLs con 8 h de caducidad,
así que el bucket **tiene que seguir siendo privado**: si se pone público,
cualquiera con la URL ve la foto para siempre y las políticas de lectura dejan de
importar.

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

---

## Migraciones 0014 y 0015 — el permiso del cliente y su forma de entrar

Estas dos cierran los dos agujeros más grandes que quedaban, y conviene leer por qué
antes de aplicarlas.

### 0014 — el cliente escribía más de lo que necesitaba

El punto 5 de arriba dice «escribir en `workout_data` (registra sus kg, reps y RIR)».
Eso era lo que se pretendía; **no era lo que el permiso concedía**.

RLS filtra FILAS, no columnas, y la fila de `workout_data` contiene el programa
completo en un único jsonb. Así que un `UPDATE` sobre esa fila —dado para anotar «8
repeticiones»— alcanzaba a:

```sql
update workout_data set microcycles = '[]' where client_id = <el suyo>;
```

El cliente podía borrarse el programa entero desde la consola del navegador. Y sin
mala intención: una pestaña vieja guardando su copia en caché encima de la actual
produce lo mismo.

La 0014 sustituye ese permiso por tres funciones que reciben la operación en vez de
la fila: `log_session_set` (un campo de una serie), `continue_program` (una semana en
blanco copiando la estructura de la última) y `save_workout_data` (solo el
entrenador, con control de concurrencia). Al final **retira la política
`workout_client_log`**, así que hay que aplicarla junto con el despliegue del código
que usa las funciones nuevas.

Es el mismo arreglo que la 0008 hizo con `preferences`, por el mismo motivo.

### 0014 — y nadie comparaba `updated_at`

Se escribía y no se leía nunca, así que dos escrituras simultáneas sobre el mismo
cliente se pisaban en silencio: la última ganaba. Con equipos —dos entrenadores— o
con dos pestañas abiertas, eso deja de ser improbable.

`save_workout_data(p_client, p_microcycles, p_seen)` devuelve `null` en vez de
escribir si la fila cambió desde `p_seen`. No es un bloqueo: es poder detectarlo y
avisar, que es lo que hoy no ocurre.

### 0015 — el portal del cliente era inalcanzable

`clients.client_profile_id` es de donde salen TODOS los permisos del cliente
(`is_me()` la consulta), y **no había ninguna pantalla que la rellenara**. La única
forma de que un cliente entrara era escribir su uuid a mano en el panel de Supabase.

La 0015 añade `client_invites` con un token de un solo uso que caduca en 14 días, y
las funciones `create_client_invite`, `revoke_client_invite` y `claim_client_invite`.
El entrenador copia un enlace `/invitacion/<token>` y lo manda por WhatsApp.

**Por qué token y no email:** enlazar por email al registrarse convertiría «conocer
el email de un cliente» en «poder ser ese cliente», y esos emails los tiene el
entrenador en su agenda. Con token hacen falta las dos cosas: recibir el enlace y
crearse una cuenta.

### Orden de aplicación

```
0014_workout_write_scope.sql     (requiere 0002; despliega el código a la vez)
0015_client_invites.sql          (aditiva, sin riesgo)
0016_session_feedback.sql        (aditiva, sin riesgo; requiere 0014 por el mismo motivo)
0017_audit_log.sql               (aditiva, sin riesgo; el disparador de check_ins solo si hay 0009)
```

La `0016` existe por lo mismo que la `0014`: el cliente no tiene UPDATE sobre
`workout_data`, así que contar cómo le ha ido —su feedback y su cuaderno— también
tiene que pasar por una función que escriba exactamente eso y nada más. Fusiona en
vez de reemplazar, para que la aplicación pueda mandar **una respuesta por
llamada**; mandar el objeto entero haría que dos toques seguidos se pisaran.
