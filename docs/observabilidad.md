# Observabilidad: ver las entrañas

> Cómo se sabe qué se usa de esta aplicación, qué se rompe, qué información le
> sirve de verdad a un entrenador y por dónde se podría entrar.
>
> Fecha: agosto de 2026.

---

## 0. La confusión que hay que deshacer primero

«Ver las entrañas» suena a **un** panel. Son **cuatro preguntas distintas**, y
mezclarlas es lo que produce esos cuadros de mando que nadie abre dos veces:

| Pregunta | Dónde vive el dato | Cada cuánto caduca |
|---|---|---|
| ¿Qué se usa? | `product_events` (0045) | 6 meses |
| ¿Qué se rompe? | `app_errors` (0052) | 90 días |
| ¿Por dónde se entra? | El catálogo de Postgres | No caduca: es el estado de ahora |
| ¿Quién paga y usa? | `team_subscriptions` + eventos | No caduca |

Tienen distinto volumen, distinta retención y distinto riesgo legal. Por eso son
cuatro tablas —o cuatro fuentes— y una sola herramienta que las lee.

Y hay una quinta pregunta, la que más rinde, que **no se contesta con
instrumentación** y por eso casi nadie la contesta: ver §4.

---

## 1. Cómo se usa

```bash
npm run radiografia                      # últimos 30 días
npm run radiografia -- --dias 90         # otra ventana
npm run radiografia -- --sin-programas   # sin leer los JSONB pesados
npm run radiografia -- --salida D:/x     # otra carpeta
npm run radiografia -- --estricto        # termina en error si hay críticos
npm run radiografia -- --aceptar-todo "motivo"   # fija la línea base (§3.1)
```

Necesita lo mismo que la copia de seguridad: `SUPABASE_SERVICE_ROLE_KEY` en
`.env.backup`. Resume lo urgente en la terminal y escribe:

| Archivo | Qué es |
|---|---|
| `informes/radiografia.html` | **El panel.** Nombre fijo, para marcarlo en favoritos |
| `informes/historico/…html` | El mismo, con fecha, para poder mirar atrás |
| `informes/estado.json` | Qué hallazgos se han dado por buenos y por qué (§3.1) |

`informes/` está en `.gitignore` **menos `estado.json`**, que sí se versiona: es
una decisión, no un dato, y tiene que poder revisarse en un diff. El panel no
lleva datos de ninguna persona —son recuentos, porcentajes y mensajes de error
saneados— pero **no es publicable**: es el estado de seguridad de la base y las
cifras de negocio en la misma página.

### El panel

Tres niveles de acercamiento, y el primero es el que hace que sirva:

1. **El veredicto.** Qué hay que atender hoy, con su cifra, de dónde sale y
   **qué hacer**. Es lo único del panel que se moja, y vive en
   `src/domain/radiografia/diagnosticos.js` con sus propias pruebas. Antes esta
   parte no existía y el panel empezaba por una tabla: quien lo abría tenía que
   saber por su cuenta que el portal es media aplicación y decidir si 13 % es
   poco. Eso es trabajo que la herramienta puede hacer.
2. **Los indicadores.** Seis cifras con su variación y su línea de tendencia,
   que sale del histórico que el propio script va acumulando.
3. **El detalle.** Las secciones de siempre, para cuando el veredicto lleva a
   una de ellas.

Con el lenguaje visual del producto —«Hierro y tiza»—, tema claro y oscuro,
teclado, impresión, y **sin una sola petición al exterior**.

#### Las dos reglas de los diagnósticos

- **Ningún umbral redondo sin motivo.** Cada número lleva escrito por qué es ése
  y no otro. Un umbral inventado produce alarmas inventadas, y a la tercera nadie
  mira la sección.
- **Sin datos suficientes no hay veredicto.** Decir «nadie mide pliegues» con
  nueve registros —de los cuales ocho son de pruebas— es peor que callar: suena a
  conclusión y es una casualidad. Cada regla declara cuánta muestra necesita, y
  si no la hay lo dice en vez de opinar.

#### Y las de los gráficos

**Todos son de una sola serie.** No es una limitación: es la respuesta correcta a
lo que miden —magnitud y tendencia, nunca identidad— y además esquiva un problema
real. La paleta de datos del proyecto **no pasa la validación de daltonismo**:
`--data-orange` ↔ `--data-lime` tienen ΔE 2,5 en deuteranopia (son el mismo color
para quien no distingue rojo y verde) y `--data-teal` y `--data-slate` caen por
debajo del suelo de croma. Con una serie por gráfico esos pares no coinciden
nunca en pantalla.

De ahí lo demás: sin leyendas (con una serie, el título ya dice qué es),
etiquetas directas solo en el extremo, rejilla de un pelo y **sólida**, eje que
empieza en cero siempre, barras de 16 px con el extremo del dato redondeado y la
base cuadrada, líneas de 2 px, marcadores con anillo del color del fondo. Los
colores de estado nunca se usan como color de serie y **siempre van con su
palabra al lado**: nada se distingue solo por el color.

Y cada gráfico tiene **su tabla debajo**. Un valor que solo se lee pasando el
ratón por encima no existe para quien navega con teclado, para quien imprime ni
para quien quiere copiarlo.

---

## 2. Por qué está FUERA de la aplicación

> **Revisado en agosto de 2026: dos de estas tres razones han caducado.** La 2.2
> —«no hay dónde ponerlo»— era la que decidía, y dejó de ser cierta cuando el
> proyecto acumuló ocho funciones edge sin que nadie relacionara una cosa con la
> otra. La 2.3 sigue en pie y es la única que importa.
>
> La sección se queda entera y sin retocar porque el razonamiento era correcto
> **con lo que había entonces**, y saber por qué se decidió lo contrario es lo que
> permite juzgar el cambio. Lo que se hace ahora, y cómo se contesta la 2.3 sin
> escribir una sola política, está en [`plataforma.md`](plataforma.md).
>
> Esto **no retira la herramienta local**: la CLI se queda, y sigue siendo la
> única que puede correr `--estricto` en integración continua.

Fue la primera decisión y condiciona todas las demás. Tres razones, y la tercera
es la que decide.

### 2.1 Puede ver más

La mitad más valiosa del informe —el estado real de RLS, qué puede ejecutar quien
no ha iniciado sesión, qué funciones corren con permisos del definidor, qué
buckets son públicos— vive en el catálogo de Postgres, y **el catálogo no se
expone por la API**. Desde el navegador esa sección sencillamente no existiría.

### 2.2 No hay dónde ponerlo

La aplicación es una SPA estática servida por Cloudflare (`wrangler.jsonc`): no
hay servidor propio donde guardar una clave. Un panel web tendría que leerlo todo
con la sesión del usuario, y para eso habría que abrir por política justo lo que
no se quiere abrir.

### 2.3 No tiene puerta

Una pantalla protegida es una pantalla que se puede desproteger. Bastaría una
política mal escrita para publicar el mapa de la seguridad de la base — y este
proyecto ya tiene documentado que eso pasa: la migración 0046 cuenta cómo RLS
estuvo **apagado en las nueve tablas base** durante meses sin que nadie lo viera.

Un archivo que se genera en local no se puede filtrar por una política mal
escrita, porque no hay ninguna política que escribir. Y el reparto de llaves ya
existía: la misma `service_role key` de `npm run backup`, en `.env.backup`, que
nunca sale de la máquina de quien administra.

**El precio**: no se consulta desde el móvil. A cambio se guarda, se compara con
el del mes pasado y se manda por correo, que es lo que de verdad se hace con algo
que se mira una vez a la semana.

---

## 3. Qué contesta cada sección

> **El orden cambió, y fue el arreglo más importante.** Las primeras versiones
> abrían por agregados —embudos, porcentajes, tasas de retención— y con cuatro
> cuentas eso no informa: divide y borra los nombres. «El 13 % tiene portal» son
> 2 de 15, y quien lo lee ya lo sabía.
>
> Ahora abre por **la hoja de cuentas** (§3.0) y lo agregado queda detrás, que es
> donde sirve. Cuando haya cientos de cuentas habrá que volver a darle la vuelta;
> hasta entonces, agregar es esconder.

### 3.0 Las cuentas y el dinero — la parte que se mira

Una ficha por entrenador con su nombre, su correo, el plan, **cuántos días le
quedan de prueba**, **cuándo entró por última vez**, cuántos clientes tiene,
cuántos de ellos alcanzan el portal, cuántas acciones hizo en siete días, sus
tickets y sus integraciones. Ordenadas por urgencia: primero lo que caduca.

`last_sign_in_at` sale de `auth.users`, no de los eventos, y esa es la diferencia
entre saber si una cuenta está viva o no: los eventos existen desde que se aplicó
la 0045 y solo se apuntan desde el panel; la fecha de la última sesión existe
desde el primer día y para todo el mundo.

El dinero va con las dos capas **separadas y rotuladas**, porque las dos se
llaman «pagos» y no son lo mismo:

- **Lo que te pagan a ti** — `team_subscriptions`. Cuentas por plan y estado, con
  sus fechas límite. No se calcula ningún ingreso recurrente: `plan_limits`
  guarda límites, no precios, y una cifra inventada acaba repitiéndose en una
  reunión.
- **Lo que le pagan a ellos** — `client_payments`, los cobros que cada entrenador
  pasa a sus clientes por Notion o Stripe (0010). No es tu caja, pero un
  entrenador que cobra a través de esto no se va, y un impago suyo es un cliente
  que se le está yendo — o sea, tu uso bajando dentro de un mes.

Y **qué dicen**: los tickets de soporte con su asunto literal y quién lo escribió.
Es la información más cara que se recibe —alguien se paró a escribirla— y no
aparecía en ninguna versión anterior.

#### Nombres, y por qué aquí sí

La regla de «sin datos personales» de las migraciones 0045 y 0052 protege a los
**clientes finales**: las personas de las que esta aplicación guarda su peso, sus
pliegues y fotografías de su cuerpo. Sigue intacta y de ellos solo salen
recuentos.

Los **entrenadores** son los clientes de pago del negocio, con una relación
comercial de por medio, y sus nombres ya están en `profiles` porque hacen falta
para facturar y para contestarles un ticket. Aplicarles la regla del cliente
final fue el error que dejó el informe sin servir para nada: no se le puede
escribir un correo a un porcentaje.

El precio es que el archivo generado **ya no se puede compartir a la ligera**. El
pie lo dice y la carpeta sigue en `.gitignore`.

### 3.1 Seguridad — la que hay que mirar primero

Sale de `radiografia_seguridad()` (migración 0053), que lee el catálogo:

- Tablas de `public` **sin RLS**. El hallazgo de la 0046, hecho comprobación.
- Tablas con RLS y **sin ninguna política** (cerradas del todo, a veces a
  propósito).
- Políticas que alcanzan a `anon` o a `public`.
- Permisos de tabla concedidos a `anon`.
- Funciones **ejecutables sin sesión**.
- `SECURITY DEFINER` **sin `search_path` fijo** — la escalada de privilegios
  clásica de PostgreSQL.
- **Buckets públicos**. El único hallazgo de la lista que sería una brecha de
  datos de salud.

**La lista no queda vacía sola.** Hay decisiones deliberadas que salen siempre:
los planes son públicos a propósito (0049), y por la trampa que documenta la 0047
—Supabase concede `EXECUTE` a `anon` en toda función nueva— cada migración con
una función suma una línea hasta que alguien la revoque.

Una lista que nunca queda limpia se deja de mirar, y entonces el hallazgo que sí
importa aparece entre los de siempre y no lo ve nadie. La respuesta no es bajar
el listón de lo que se considera grave —eso es dejar de mirar, disfrazado— sino
**poder decir «esto ya lo he visto y es deliberado»**:

Desde la línea de órdenes, con **el motivo obligatorio** y en tres ámbitos:

```bash
npm run radiografia -- --aceptar-nuevos "motivo"   # los que ayer no estaban
npm run radiografia -- --aceptar-avisos "motivo"   # todos los no críticos
npm run radiografia -- --aceptar-todo   "motivo"   # TODOS. Fija la línea base
```

**Los dos primeros nunca alcanzan a un crítico**, y ésa es la regla que hace que
esto se pueda usar cada semana: dar por buenos dos avisos nuevos no puede dejar
de pedir atención sobre algo que sigue sin arreglar. Un crítico solo se acepta
escribiendo `--aceptar-todo`, que cuesta más de teclear a propósito.

O desde **el panel de la aplicación** (`/plataforma`), que es donde se hace lo
selectivo: se marcan los hallazgos, se escribe el motivo y queda guardado con tu
nombre y la fecha. Ver [`plataforma.md`](plataforma.md).

> **El marcado desde el panel HTML generado en local ya no funciona.** Ese
> archivo deja seleccionar hallazgos y descargar un `estado.json`, y desde la
> migración 0074 lo aceptado vive en la base: ese archivo descargado no lo lee
> nadie. Los botones siguen ahí y se retiran cuando el HTML se jubile.

A partir de ahí solo destaca **lo nuevo**. Y si un hallazgo aceptado **cambia**
—una política pasa de `SELECT` a `ALL`, una tabla suma un permiso— el texto
cambia, la clave cambia y vuelve a salir como nuevo: se acepta un hallazgo
concreto, nunca un objeto para siempre.

Cuando la lista de pendientes esté en cero, una tarea programada con `--estricto`
convierte esto en una alarma de verdad.

> **Lo que se aprendió estrenándolo.** La 0053 devolvió **239 críticos** contra
> el proyecto real, de los que dos lo eran: `handle_new_user()` sin `search_path`
> y una política `FOR ALL` para `public` en `videos`. Los otros 237 eran la
> configuración por defecto de Supabase —el `GRANT ALL … TO anon` sobre las 31
> tablas y las 187 funciones de `btree_gist`—. La 0054 los correlaciona con RLS y
> excluye lo que no es del proyecto: 239 → 5. Ese trabajo es el que decide si una
> herramienta así se usa o se abandona.

### 3.2 Activación — y por qué no usa los eventos

El embudo sale de las **tablas reales**, no de `product_events`:

| Hito | De dónde sale |
|---|---|
| Se registró | `teams` |
| Dio de alta un cliente | `clients` |
| Le programó algo | `workout_data.microcycles` no vacío |
| Le dio acceso al portal | `clients.client_profile_id` |
| Revisó un check-in | `check_ins.reviewed_at` |

Parece contraintuitivo teniendo una tabla de instrumentación, y es lo más
importante de todo el diseño: los eventos solo existen desde que se aplicó la
0045, así que un embudo hecho con ellos **empieza a contestar dentro de tres
meses**. Los de arriba se leen hoy, sobre todo el histórico, y no dependen de que
la instrumentación estuviera bien puesta.

La unidad es la **cuenta**, no la persona: un equipo de cuatro entrenadores es un
cliente que paga.

### 3.3 Actividad semanal — lo único que solo pueden decir los eventos

Entrar y trabajar no deja rastro en ninguna tabla: alguien puede pasarse una hora
revisando el progreso de sus clientes sin escribir una fila. Esto es para lo que
se hizo la 0045.

La retención se mide como «de las cuentas activas esta semana, cuántas siguen la
siguiente», que es lo que distingue un producto de una demo.

### 3.4 Qué se usa

Las pantallas y los gestos, con sus veces y sus cuentas distintas. **La lista que
decide es la segunda**: *pantallas que no ha abierto nadie*. Una lista de lo más
usado no dice nada de lo que sobra, y quitar una pantalla vale más que añadir
dos.

Para poder decir qué no se usa hay que saber qué existe, y eso está en el código,
no en la base. `src/domain/radiografia/catalogo.js` lo extrae de `src/routes.jsx` y
de `src/domain/anthropometry.js`, con pruebas que corren contra esos mismos
archivos: si alguien los reescribe con otra forma, la prueba se rompe en vez de
que el informe empiece a decir «no falta nada» — que es la manera silenciosa de
mentir.

### 3.5 Qué se rompe

De `app_errors` (0052), agrupado y **ordenado por cuentas afectadas, no por
veces**. Es la regla más importante de esa sección:

> Un fallo que le ocurre doscientas veces a una persona es un caso raro suyo. Uno
> que le ocurre una vez a seis personas es un error del producto. Con el orden
> por veces, el segundo no aparece nunca en la primera pantalla y no se arregla
> nunca.

Debajo, el volumen por tabla. Ahí está la señal que `auditoria.md` §1.4 dejó
pendiente: **bytes por fila de `workout_data`**. Cuando se acerque al megabyte,
cada ráfaga de teclas con debounce mueve un megabyte y la conversación sobre
normalizar el JSONB deja de ser teórica.

### 3.6 Barra libre indefinida — el hallazgo que no se buscaba

Una cuenta `active` **sin cliente de Stripe y sin periodo de cobro** está dentro,
sin límites y no se le va a cobrar nunca. Se detecta así, por los datos, y no
buscando el nombre del plan: `fundador` se lee como «el fundador del producto» y
significa «ya estaba dentro antes de que empezaras a cobrar».

Lo produjo el injerto de la 0019 y lo decidió el reloj, no una conversación. La
historia entera, con el procedimiento para sacar a alguien de ahí, está en
[`monetizacion.md` §3.7](monetizacion.md). La cuenta propia se excluye por
`platform_admins`.

---

## 4. El censo: la pregunta que la instrumentación no puede contestar

«¿Qué información le sirve de verdad a un entrenador?» **no la contesta ningún
evento**, y no es una limitación de cómo está hecho: `product_events` no lleva
`client_id` a propósito (0045), así que nunca podrá decir qué campos se rellenan.

La contesta **contar lo que ya está guardado**. Y tiene tres ventajas sobre
cualquier instrumentación:

1. Contesta **hoy**, sobre todo el histórico, sin esperar a acumular nada.
2. No hay que instrumentar ni una línea, así que no se puede instrumentar mal.
3. No describe a nadie: lo que sale son porcentajes sobre el conjunto.

Lo que mide, y qué decisión desbloquea cada cosa:

| Cifra | Qué decide |
|---|---|
| % de clientes **con acceso al portal** | Media aplicación es el portal. Si es baja, media aplicación no la usa nadie — y no porque esté mal hecha |
| **Qué pliegues y perímetros se miden** | Un campo al 0 % no lo ha rellenado nadie nunca. Es la lista de lo que sobra del formulario |
| % de clientes **con sexo registrado** | Sin ese campo la fórmula del % graso no se puede aplicar: se toman las medidas y el resultado no sale, y nadie relaciona una cosa con la otra |
| **Mediana de horas en contestar un check-in** | La promesa del producto, medida |
| Check-ins entregados hace **+7 días sin contestar** | La deuda del entrenador con sus clientes. La razón más común de que uno se vaya, y no se ve en ninguna pantalla |
| % de planes con variantes, pasos, hábitos | Qué partes de la nutrición usa alguien |

La unidad del censo de medidas es el **registro**, no el cliente: «el 4 % de las
revisiones incluye el pliegue de pantorrilla» es la cifra que decide si el campo
se queda; «el 30 % de los clientes lo ha medido alguna vez» no decide nada.

---

## 5. Qué NO se hace, y por qué

### 5.1 Ni PostHog ni Google Analytics ni nada de terceros

Dos motivos, y el segundo es el que decide:

1. `public/_headers` limita `connect-src` a Supabase. Meter una herramienta
   externa obligaría a abrir la CSP a un dominio más, y es estricta a propósito.
2. Esto guarda **fotos corporales, peso y pliegues**: artículo 9 del RGPD.
   Mandarle el comportamiento de sus usuarios a un tercero es una cesión de datos
   que habría que declarar, justificar y probablemente consentir. Ya hubo una
   cesión así sin decidirla —el avatar que se pedía a un servicio externo **con
   el nombre de la persona en la URL**, `auditoria.md` §3.5— y se retiró. No se
   vuelve a abrir esa puerta para saber cuántos clics tiene un botón.

El informe generado tampoco hace ni una petición al abrirse: sin CDN, sin fuentes
remotas, sin librerías de gráficos. Los gráficos son SVG escrito a mano.

### 5.2 No se mide el comportamiento del cliente final

`track()` no apunta nada desde `/mi/`. Quien abre el portal es la persona de la
que esta aplicación guarda su peso, sus pliegues y fotos de su cuerpo; medir
además su comportamiento sería usar como sujeto de análisis a quien ya es sujeto
de los datos.

**Los fallos sí viajan desde los dos lados**, y la distinción es deliberada: un
fallo no dice qué hizo esa persona, dice que el software se rompió mientras lo
intentaba. Enterarse de que el portal lleva una semana sin dejar subir fotos
protege al cliente; no enterarse no le protege de nada. La fila lleva `rol` para
poder separarlos.

### 5.3 No hay datos personales en las tablas de telemetría, y lo impone Postgres

- **Nombres de evento** (0045): `^[a-z][a-z0-9_]{2,40}$`. Un nombre propio, un
  correo o una medida no pasan ese patrón. Es un CHECK, no una convención.
- **Propiedades**: categorías y tramos —`{ seccion: 'rutina' }`,
  `{ clientes: '10-29' }`—, nunca valores. `bucket()` convierte «28 clientes» en
  «10-29», que contesta la misma pregunta de producto sin señalar a nadie.
- **Sin `client_id`** en ninguna de las dos tablas. Su ausencia es lo que impide
  que puedan describir, ni siquiera de forma indirecta, a las personas cuyos
  datos de salud guarda la aplicación.
- **Mensajes de error** (0052): son el caso difícil, porque el texto lo escribe
  Postgres. Hay **dos capas y ninguna se fía de la otra**:
  1. El cliente **sanea** (`saneaMensaje` en `lib/analytics.js`): corta por la
     primera línea, sustituye lo que va entre `=(…)` —donde Postgres pone los
     valores—, los correos y los identificadores.
  2. La base **rechaza**: los CHECK tiran la fila si aun así llega un `@` o un
     UUID. No la limpian, la rechazan; y como el emisor se traga los errores, ese
     fallo simplemente no se registra. Perder el registro de un fallo es barato;
     guardar el correo de alguien en una tabla de diagnóstico no lo es.
- **Rutas**: `/c/:id/rutina`, nunca `/c/8f3a…/rutina`. La salida se **construye**
  a partir de una lista blanca sacada de la tabla de rutas, no se sanea la
  entrada: saneando siempre queda el caso que no se previó; construyendo, lo que
  no se previó no existe. Lo fija `analytics.test.js`.

### 5.4 Lo que esto no pretende ser

No es infalible. Un mensaje de error de una librería cualquiera podría colar un
dato con una forma que no se ha previsto. Por eso los plazos de conservación son
cortos (90 días los fallos, 6 meses los eventos) y por eso `message` está topado
a 300 caracteres: se guarda lo justo para reconocer el fallo, no para reconstruir
la escena.

Tampoco es monitorización en tiempo real. No hay alertas, no hay guardia y no
avisa a nadie a las tres de la mañana. Es una herramienta para **decidir**, que
se mira una vez a la semana.

---

## 6. Las piezas

| Archivo | Qué hace |
|---|---|
| `supabase/migrations/0045_product_events.sql` | Tabla de uso. Ya existía |
| `supabase/migrations/0052_app_errors.sql` | Tabla de fallos, con las dos capas de §5.3 |
| `supabase/migrations/0053_radiografia.sql` | Las dos funciones de catálogo, solo para `service_role` |
| `supabase/migrations/0054_radiografia_afina.sql` | Afina qué se llama crítico: 239 → 5 |
| `src/lib/actor.js` | Quién está usando esto. Lo comparten uso y fallos |
| `src/lib/analytics.js` | El canal de salida: las dos corrientes por el mismo tubo |
| `src/lib/diagnostics.js` | Recoge los fallos en memoria y avisa por un enganche |
| `scripts/radiografia.mjs` | Recoge, orquesta y escribe |
| `scripts/radiografia/informe.mjs` | El panel en HTML |
| `scripts/radiografia/archivo.mjs` | `estado.json`: leerlo y escribirlo. Lo único que sabe que hay disco |
| `scripts/credenciales.mjs` | La clave, comprobada. Compartido con `backup.mjs` |

Y **el razonamiento**, que ya no vive en `scripts/` porque lo comparten la CLI, la
función edge y el panel (ver [`plataforma.md`](plataforma.md) §3):

| Archivo | Qué hace |
|---|---|
| `src/domain/radiografia/analisis.js` | Las reglas. Funciones puras, con pruebas |
| `src/domain/radiografia/catalogo.js` | Qué ofrece la aplicación, leído del código |
| `src/domain/radiografia/cuentas.js` | **La hoja de cuentas.** Una fila por entrenador |
| `src/domain/radiografia/dinero.js` | Planes, pruebas, cobros e invitaciones |
| `src/domain/radiografia/diagnosticos.js` | **El veredicto.** Lo único que se moja |
| `src/domain/radiografia/estado.js` | Lo aceptado, lo de la vez anterior y el histórico |

### Por qué `diagnostics` no importa el cliente de Supabase

`lib/supabaseClient.js` ya importa `diagnostics` —engancha el `fetch` para que
ninguna llamada se olvide de apuntar sus errores—, así que importarlo de vuelta
cerraría un círculo. Con el enganche (`onIssue`) las flechas van todas en el mismo
sentido, `diagnostics` sigue sin una sola dependencia y sus pruebas no necesitan
simular nada.

### Por qué el uso y los fallos comparten `analytics.js`

Porque es el mismo tubo: las dos corrientes se acumulan, se sueltan cada pocos
segundos, no se reintentan y no pueden retrasar nada. Un archivo aparte habría
duplicado la cola, el temporizador, el interruptor de apagado y el enganche al
cierre de la pestaña — dos temporizadores compitiendo y dos sitios donde arreglar
el mismo fallo. Lo único que no comparten es la regla de quién se mide (§5.2).

---

## 7. Mantenimiento

**Poda.** Las dos tablas crecen para siempre y su valor caduca. Con `pg_cron`, si
el plan lo incluye:

```sql
SELECT cron.schedule('podar-eventos', '0 4 * * 0', $$
  DELETE FROM public.product_events WHERE at < now() - interval '6 months';
$$);

SELECT cron.schedule('podar-fallos', '0 4 * * 0', $$
  DELETE FROM public.app_errors WHERE at < now() - interval '90 days';
$$);
```

**Un evento nuevo** solo se añade si su respuesta cambia una decisión. Si saber
que nadie usa X no va a hacer que se mejore o se retire, no se mide. La
alternativa es acabar con cincuenta eventos y ninguna conclusión.

**Ninguna de las dos tablas entra en la copia de seguridad**, y está escrito en
`EXCLUIDAS` de `scripts/backup.mjs` porque `supabase/tests/copia.test.js` obliga a
decidirlo por escrito: son desechables por diseño y restaurarlas no devuelve nada
que nadie vaya a echar de menos.

---

## 8. Estado, y lo que falta

**Ejecutado contra el proyecto real** el 16/08/2026, con las migraciones 0052 a
0055 aplicadas. Lo que encontró del negocio:

- **Dos pruebas acaban el 28/08.** La única lista con fecha límite que existe.
- **Una cuenta entró y no hizo nada**: alta el 13/08, última sesión el 15, cero
  clientes y cero acciones. Es el abandono más temprano y el más recuperable, y
  no aparece en ninguna lista de «inactivos» porque acaba de entrar.
- **Cinco cobros vencidos y sin pagar, 720 €**, entre los que los entrenadores
  pasan a sus clientes.
- **Una cuenta con barra libre indefinida** por el injerto de la 0019
  (§3.6 y [`monetizacion.md` §3.7](monetizacion.md)). **Pendiente**: mover a esa
  persona a la prueba que le tocaba, hablándolo antes — no hay correo
  transaccional que la avise.
- **Ninguna cuenta salvo la propia tiene un solo cliente con acceso al portal**
  (0/2, 0/1, 2/12, 0/0). Explica el 13 % mucho mejor que el 13 %.
- **Cinco tickets**, dos de ellos con el mismo asunto —«No puedo dar de alta a un
  cliente»— de dos personas distintas. Eso no es soporte: es un fallo de
  producto.

- **Un 10 % de los eventos llegaba sin equipo.** `lib/analytics.js` apunta con lo
  que sabe, y al abrir la aplicación la sesión resuelve antes que el equipo: todo
  lo que pasa en ese hueco se guarda a nombre de una persona y de ningún equipo.
  Quedaban huérfanos y no aparecían en ninguna ficha — y son justo los primeros
  minutos de cada sesión, donde se ve si alguien entra y se va. Se recuperan
  desde `team_members`, que sabe de qué equipo es cada actor.
- **Ninguna cuenta tiene actividad en más de 2 de los últimos 14 días.** Es lo que
  enseña el pulso y no enseñaba ninguna cifra: 125 acciones en un solo día y 125
  repartidas en ocho son el mismo número y dos cuentas opuestas.

Y lo que encontró de la base:

- `handle_new_user()` es `SECURITY DEFINER` **sin `search_path` fijo**. Corre al
  registrarse un usuario. Sigue **sin arreglar**:
  `ALTER FUNCTION public.handle_new_user() SET search_path = '';` — comprobando
  antes que su cuerpo nombre los objetos con esquema, o pasará a fallar en cada
  registro nuevo, que es peor.
- La tabla `videos` tiene una política `FOR ALL` con rol `public`. Sigue **sin
  arreglar**, y lo correcto no es tocar la política: `auditoria.md` §2 ya dice
  que esa tabla sobra.
- Tres funciones `SECURITY DEFINER` alcanzables sin sesión cuyo cuerpo no nombra
  ninguna comprobación de permisos: `can_write_client_active`,
  `log_session_feedback` y `revoke_client_invite`. **Hay que mirarlas una a una**
  —la comprobación es una heurística— y aceptarlas con su motivo o revocarlas.
- **RLS activo en 31 de 31 tablas** y **ningún bucket público**. Es lo que la
  0046 dejó arreglado, y ahora se puede afirmar en vez de suponer.

**Los dos críticos los cierra la migración 0057**: fija el `search_path` de
`handle_new_user` —que `bootstrap.sql` ya tenía bien, así que lo desplegado no
era lo del repositorio, el mismo patrón que la 0046— y retira la tabla `videos`,
negándose a hacerlo si tuviera una sola fila.

Lo que falta:

- **Los tres arreglos de arriba.** Son cambios sobre el funcionamiento de la
  aplicación y no se han colado dentro del trabajo de instrumentación.
- **La línea base de seguridad**, que sale de lo anterior: hasta que la lista de
  pendientes no esté revisada y en cero, `--estricto` no sirve para programar una
  alarma.
- **Los eventos nuevos no están desplegados.** Hasta que se suba el build, en
  «Gestos» solo aparecen los cuatro anteriores a este trabajo.
- **Casi todos los datos son de pruebas propias** —4 equipos, 15 clientes, una
  semana de actividad—. El censo dice la verdad sobre lo que hay guardado, pero
  todavía no es evidencia sobre entrenadores reales. Que los seis pliegues y los
  nueve perímetros estén al 0 % es la pregunta a vigilar, no una conclusión.
