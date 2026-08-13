# Auditoría: qué hace falta para que esto sea una app real

> Revisión del estado del proyecto de cara a ponerlo en producción con clientes
> pagando. No es una lista de deseos: cada punto es algo que va a doler, y está
> ordenado por cuánto.
>
> Fecha de la revisión: agosto de 2026.

---

## 1. Errores que hay que arreglar

### 1.1 El cliente y el entrenador escribían las series en sitios distintos — **CORREGIDO**

El fallo más grave que tenía el proyecto.

El portal del cliente llamaba a `updateExerciseSet`, que escribe dentro de
`microcycle.days` (el PLAN). El panel del entrenador llama a `logSessionSet`, que
escribe en `microcycle.sessions` (la EJECUCIÓN, con fecha). El mismo dato en dos
formas distintas según quién lo metiera.

Dos consecuencias:

1. Lo que registraba el cliente se fechaba con la fecha del **microciclo**, no con
   el día en que entrenó de verdad. La analítica de progresión salía movida.
2. `allSessions()` descarta la versión heredada de un día que ya tiene sesión
   real. Es decir: **en cuanto el entrenador abría una sesión de ese mismo día,
   los kilos del cliente desaparecían de la analítica**, sin ningún error.

Reproducido y verificado antes y después del arreglo:

```
ANTES · solo el cliente ha registrado:        2026-08-03 (1520 kg)
ANTES · el entrenador abre una sesión:        2026-08-05 (0 kg)     ← 1520 kg perdidos
AHORA · el cliente registra su sesión:        2026-08-04 (1520 kg)
AHORA · el entrenador añade otra:             2026-08-04 (1520 kg), 2026-08-06 (680 kg)
```

**Pendiente relacionado — el normalizador ya existe.** Los datos que YA existen
con kilos dentro del plan siguen leyéndose (`legacySession` los expone), pero
conservan el riesgo del punto 2 hasta que se normalicen.

Está en *Ajustes → Copia de seguridad → Normalizar registros antiguos*, junto a la
descarga porque esa es su red de seguridad. Ensaya antes de escribir: el primer
botón cuenta lo que haría y no toca nada, y solo después aparece el que escribe.
La regla vive en `normalizeMicrocycles` (`domain/sessions.js`) y lo que sus
pruebas comprueban no es la forma del resultado sino que **el tonelaje es idéntico
antes y después**, que es lo único que no se puede romper.

**Sigue sin ejecutarse**: reescribe el `workout_data` de todos los clientes y eso
se hace con la copia delante y con el visto bueno explícito.

Es además el requisito de la carga perezosa (1.5): con los datos normalizados,
«cuándo entrenó este cliente» se responde leyendo fechas en el servidor. Sin
normalizar habría que reimplementar en SQL la compatibilidad de `legacySession`
—qué cuenta como día entrenado, cuándo se descarta— y duplicar en otro lenguaje
justo la regla que causó el fallo de arriba.

### 1.2 Dos ejes de «semana» incompatibles

Las fotos se archivan por **semana de programa** (`<clientId>/photos/week-12/…`, en
la ruta de Storage) y el check-in va por **semana natural** (el lunes, `weekStart`).
Son dos calendarios distintos y la única conversión entre ellos es
`weekFromStart(startDate, fecha)`, que depende de que `start_date` sea correcto.

Efecto práctico: si un cliente empieza en miércoles, su «semana 3» de fotos y su
«semana del 17 de agosto» de pesajes no cubren los mismos días, y un check-in no
puede casar con sus fotos de forma fiable.

**Recomendación:** que la identidad del check-in sea la **semana natural** y que
guarde también la semana de programa como dato derivado. Está previsto en la
migración `0009` propuesta.

### 1.3 Escritura sin control de concurrencia — **CORREGIDO**

`updated_at` se escribe en cada guardado pero **nadie lo compara**. Dos pestañas
abiertas, o dos entrenadores del mismo equipo sobre el mismo cliente, se pisan sin
aviso: gana el último en escribir y el otro no se entera.

La cola de guardado resuelve el reordenamiento de respuestas *dentro de una
pestaña*, no entre pestañas.

Resuelto sin migración: `upsertClientRow` escribe con `.eq('updated_at', leído)` y,
si afecta a cero filas, distingue «no existía» de «alguien escribió en medio». El
conflicto se muestra con dos salidas —quedarse con la versión del servidor o
imponer la propia— y NUNCA se escribe encima en silencio, que era el fallo.

Protege las TRES tablas de bloque y la fila entera. La función `save_workout_data`
de la 0014 hace la misma comprobación pero solo sobre `microcycles`, así que
usarla habría dejado de persistir el split, el calentamiento y las notas.

### 1.4 `workout_data.microcycles` es un JSONB que crece sin límite

Todo el programa de un cliente —todas las semanas, días, ejercicios, series y
sesiones— vive en **una sola columna** que se reescribe **entera** en cada
guardado. Un año de entrenamiento (≈50 semanas × 5 días × 8 ejercicios × 4 series,
más las sesiones) son varios MB que suben por cada ráfaga de teclas.

Es la razón por la que el guardado necesita debounce, y el techo real de
escalabilidad del proyecto.

**Recomendación:** cuando empiece a doler, normalizar a `microcycles` /
`sessions` / `session_sets` como tablas. Es una migración grande; hasta entonces,
al menos no cargar los microciclos antiguos (ver 1.5).

### 1.5 Se cargan todos los datos de todos los clientes al arrancar — **CORREGIDO (0024)**

```js
supabase.from('workout_data').select('*').in('client_id', ids)   // y 3 tablas más
```

Cómodo con 20 clientes y letal con 200: la aplicación no pinta nada hasta que baja
el programa completo, el historial completo y todas las fotos de la cartera entera.

Hecho, y como estaba recomendado: `training_summaries()` (migración 0024) devuelve
por cliente lo justo para el tablero —cuándo entrenó, cuántas sesiones, cuántas
semanas, y las sesiones de los últimos días— y el programa completo se descarga
solo del cliente que se abre. `domain/` no se enteró de nada: recibe un resumen en
lugar de un programa y calcula exactamente lo mismo.

Lo importante de cómo está hecho: **la función de Postgres no reimplementa ninguna
regla**. Selecciona sesiones y las devuelve tal cual; el tonelaje, las series y las
alertas los sigue calculando el mismo JavaScript. Eso solo es posible con los
registros heredados normalizados (ver 1.1), y por eso la función informa de si a
algún cliente le quedan: mientras quede uno, la aplicación vuelve a cargarlo todo
—cargar de más es un problema de velocidad; enseñar «40 días sin entrenar» a quien
entrenó ayer es un problema de confianza—.

**Sigue cargándose entero** lo que no pesa: antropometría, fotos y check-ins. Y la
nutrición, que sí podría diferirse pero la leen sitios que todavía no la piden por
cliente. Cuando moleste, el camino ya está abierto (`ensureProgram`).

### 1.6 Sin miniaturas de fotos — **CORREGIDO**

La biblioteca del estudio carga los originales. Sesenta fotos de 3 MB son 180 MB
de tráfico para pintar una tira de miniaturas de 90 px.

**Recomendación:** el transformador de imágenes de Supabase
(`?width=200`) en la firma de las URLs de la biblioteca; el original solo para el
lienzo.

---

## 2. Cosas que sobran

| Qué | Por qué sobra |
|---|---|
| Tabla `videos` | La corrección de vídeos se retiró del producto. |
| `clients.posture_reviewed` | Resto de otra versión, con un interruptor a medias en el listado. |
| `clients.youtube_explanation_url` | Un enlace suelto a YouTube dentro de la rutina, sin sitio en el producto actual. |
| `clients.gym_equipment_link` | Enlace a una carpeta de Drive, del flujo anterior. |
| `clients.coach_id` | Duplica `assigned_to` desde la migración de equipos. Retirada pendiente (es `NOT NULL`). |
| `clients.current_weight` | El peso vive en `anthropometry.history`; esta columna es una copia que puede quedar desfasada. |

**Tres columnas que no dicen lo que guardan** (deuda consciente y documentada,
pero deuda): `progress_photos.photo_url` guarda una **ruta**, no una URL;
`progress_photos.tag` guarda **JSON** con ángulo, peso y notas; y
`nutrition_plans.meals` guarda el **objetivo de los días de descanso**. La tercera
la arregla la migración `0004`, que está escrita y sin aplicar.

---

## 3. Riesgos de cara a producción

### 3.1 Cero pruebas automatizadas — **CORREGIDO en el dominio**

No hay ni una. Tampoco comprobación de tipos (el proyecto es JSX sin TypeScript).
La única red de seguridad es `npm run verify`, que solo mira el CSS.

Lo más rentable, por orden: **el dominio**. `domain/` es todo funciones puras
—`training.js`, `analytics.js`, `sessions.js`, `anthropometry.js`, `nutrition.js`,
`portfolio.js`, `preferences.js`, `photos.js`— y son justo las que contienen las
reglas que duelen si se rompen: tonelaje, series efectivas, 1RM, promedios
semanales, reparto de macros. Vitest y cincuenta casos cubren el 80 % del riesgo
real sin tocar un solo componente.

### 3.2 No existe el flujo de invitación de clientes — **CORREGIDO**

`clients.client_profile_id` existe y **no hay ninguna pantalla que lo rellene**.
Hoy, para que un cliente entre a su portal, hay que enchufar su id a mano en la
base de datos. Es el agujero más grande del producto: toda la mitad «cliente» de
la aplicación es inalcanzable en la práctica.

Hace falta lo mismo que ya se hizo para invitar entrenadores
(`invite_team_member`): una función `SECURITY DEFINER` que vincule por email, y
una pantalla en la ficha del cliente.

### 3.3 Sin traza de cambios — **CORREGIDO (migración 0017)**

Nadie sabe quién cambió el plan de un cliente, ni cuándo, ni qué había antes. Con
un entrenador es un inconveniente; con un equipo es un problema de
responsabilidad, y ante una reclamación de un cliente es la palabra de uno contra
la del otro.

**Recomendación:** una tabla `audit_log` escrita por trigger en las tablas de
bloque, guardando `(tabla, client_id, actor, cuándo)` sin el contenido. Barato y
suficiente.

### 3.4 Sin división de código — **CORREGIDO**

Todo se importa en el arranque: 233 KB de aplicación + 218 KB de cliente de
Supabase, aunque un cliente solo use tres pestañas. `React.lazy` por pestaña y el
panel del entrenador fuera del arranque del cliente rebajarían bastante la primera
carga, que es la que se nota en un móvil con datos.

### 3.5 Sin política de datos personales — **CORREGIDO (migración 0018)**

Esto guarda **fotos corporales, peso, pliegues cutáneos y perímetros**: datos de
salud, la categoría más sensible del RGPD. Faltan tres cosas que no son opcionales
si hay clientes reales en la UE:

- **Exportación** — HECHA. `Clientes` → ficha → «Descargar sus datos»: un JSON con
  todo, incluidos enlaces firmados a las fotos (7 días).
- **Borrado** — HECHO. Borra los archivos del bucket, los bloques, los check-ins,
  el calendario y la ficha, en ese orden (las claves foráneas no tienen cascada).
  Pide escribir el nombre y reporta lo que no haya podido borrar.
- **Consentimiento y finalidad** — HECHO. Al canjear su invitación, el cliente lee
  qué se guarda, quién lo ve y qué puede pedir, y lo acepta con una casilla que
  llega sin marcar. Queda archivado en `client_consents` con la versión del texto
  que se le enseñó, en la **misma transacción** que el enlace de su cuenta: no
  existe el estado «enlazado sin consentimiento».

  **Los clientes que ya estaban enlazados** antes de la 0018 tampoco se quedan
  fuera (migración 0023): al entrar al portal se les pide, y hasta que aceptan no
  pasan —lo que hay detrás es el tratamiento, y en cuanto entran pueden subir una
  foto—. No se les inventa una fila: el consentimiento se da, no se deduce de que
  alguien lleve seis meses usando el portal.

- **Política de privacidad y condiciones** — HECHAS, en `/privacidad` y
  `/condiciones`, públicas y enlazadas desde el registro y el consentimiento.
  Faltan los datos del titular, que la página marca en rojo mientras no estén.

- **Una cesión de datos que nadie había decidido** — CORREGIDA. La ficha del
  cliente pedía su avatar a `api.dicebear.com` **con el nombre de la persona en la
  URL**: cada vez que se abría la pantalla se le mandaba a un tercero el nombre de
  alguien de quien esto guarda su peso, sus pliegues y fotos de su cuerpo. Ahora
  las iniciales se dibujan en el propio navegador y no sale nada.

### 3.6 Recuperación — **PARCIAL**

No había ninguna copia de seguridad propia más allá de lo que hiciera Supabase por
su plan, y el modelo de datos concentra todo el trabajo de un año en unas pocas
filas JSONB: un `UPDATE` mal hecho puede borrar el programa completo de un cliente
sin que quede rastro.

Hecho: `npm run backup` (ver **[`copias.md`](copias.md)**) vuelca las filas, **las
cuentas de `auth`** —sin las que los datos restaurados no pertenecen a nadie— y
**los archivos del bucket**, que la copia de la aplicación no traía. Tiene modo de
verificación que recalcula la huella de cada archivo, y termina con error si algo
falta, de modo que una tarea programada avisa.

Sigue **PARCIAL** por una razón que no es de código: **nadie ha probado una
restauración completa todavía**. El procedimiento está escrito paso a paso, pero
hasta que no se ejecute contra un proyecto de usar y tirar no se sabe qué se ha
olvidado. Es lo que hay que hacer antes del primer cliente de pago, no después.

---

## 4. Qué está bien y no conviene tocar

Para no perderlo de vista al refactorizar:

- **La separación dominio / interfaz.** `domain/` no importa React ni Supabase, y
  eso es lo que permite probar y razonar las reglas por separado.
- **La cola de guardado** (`lib/saveQueue.js`): una petición en vuelo por clave,
  debounce, estado visible y reintento. Resuelve tres fallos reales y bien.
- **RLS como única frontera de autorización**, sin lógica de permisos duplicada en
  JavaScript. Con equipos se reforzó en lugar de romperse.
- **Los tokens de diseño y la ausencia de literales de color**, con verificación
  automática.
- **El estado derivado y no almacenado** para la semana, el día y la sesión
  activos: elimina de raíz una familia entera de bugs de selección rancia.

---

## 5. Orden que recomiendo

1. **Flujo de invitación de clientes** (3.2). Sin eso, media aplicación no existe.
2. **Pruebas del dominio** (3.1). Barato y es lo que permite hacer el resto sin
   miedo.
3. **Normalizar los registros heredados** del punto 1.1, con copia de seguridad.
4. **Exportación y borrado de datos** (3.5). Antes del primer cliente de pago.
5. **Control de concurrencia** (1.3), en cuanto haya un equipo de verdad.
6. **Carga perezosa por cliente** (1.5) y **miniaturas** (1.6), cuando la cartera
   pase de treinta clientes.
7. Limpieza de lo que sobra (sección 2), que es media hora y quita ruido.

Lo de 1.4 (normalizar el JSONB) es el más caro y el que menos urge: duele a partir
de un volumen que este proyecto todavía no tiene.
