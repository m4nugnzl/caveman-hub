# La plataforma: la radiografía deja de ser un archivo

> Cómo el informe que se generaba en local pasa a ser una pantalla de la
> aplicación y un bot que avisa, sin dejar de ser lo mismo por dentro.
>
> Fecha: agosto de 2026. **En curso** — el estado de cada fase, en §7.

---

## 0. Qué cambia, en una frase

Hasta ahora `npm run radiografia` recogía, analizaba y escribía un HTML de 140 KB
que solo existía en una máquina. Ahora el análisis vive en un sitio y lo consumen
tres: **la CLI**, **un panel dentro de la aplicación** y **un bot de Telegram**.

Lo que no cambia: el razonamiento. Los diagnósticos, el censo, la hoja de cuentas
y las reglas de seguridad son exactamente los que ya estaban, con sus pruebas.

---

## 1. Por qué ahora, si `observabilidad.md` decía lo contrario

Ese documento decide, en su §2, no meter esto en la aplicación, y da tres razones.
Dos de ellas eran ciertas cuando se escribieron y han dejado de serlo:

| Razón de `observabilidad.md` §2 | Estado hoy |
|---|---|
| **2.1 «Puede ver más».** El catálogo de Postgres no se expone por la API | **Resuelta por la propia 0053.** El catálogo va envuelto en `radiografia_seguridad()` y `radiografia_volumen()`, ejecutables por `service_role`. Cualquier servidor con esa clave las llama |
| **2.2 «No hay dónde ponerlo».** SPA estática, sin servidor donde guardar una clave | **Falsa.** Hay ocho funciones edge desplegadas y seis leen `SUPABASE_SERVICE_ROLE_KEY` de `Deno.env`. Ese entorno **inyecta la clave**: no hay nada que repartir |
| **2.3 «No tiene puerta».** Una pantalla protegida se puede desproteger | **En pie.** Es la única que importa, y §2 de este documento la contesta |

La 2.2 es la que decidía, y cayó sin que nadie lo notara: las funciones edge se
fueron añadiendo de una en una —cobros, calendario, soporte— y con la sexta el
proyecto tenía servidor propio desde hacía meses.

---

## 2. La puerta, que es lo único delicado

**La comprobación no puede ser RLS.** Ese es el punto entero. `observabilidad.md`
§2.3 tiene razón en que una política mal escrita puede publicar el mapa de
seguridad de la base —la 0046 documenta que RLS estuvo apagado en nueve tablas
durante meses sin que nadie lo viera— y la respuesta no es escribir una política
mejor.

La respuesta es que **no haya ninguna política que escribir**. La función edge:

1. Lee el JWT de quien llama.
2. Comprueba contra `platform_admins` **con la clave de servicio, en el
   servidor**, antes de leer un solo dato.
3. Solo entonces recoge, analiza y contesta.

Una política mal escrita no puede abrir un endpoint que nunca lee a través de RLS.
Es el patrón que ya usa `support-notify` —«el identificador llega del navegador y
no se cree»— aplicado del revés: allí se comprueba que la fila es tuya, aquí que
tú eres tú.

### Lo que se paga, y no se recupera

Hoy la superficie de ataque es **cero**: un archivo en un disco. Mañana es una URL
en internet que, con un fallo, entrega el estado de seguridad de la base y las
cifras del negocio en la misma respuesta. Eso no se mitiga a cero. Se mitiga con:

- La comprobación en servidor de arriba.
- **Solo agregados en la respuesta.** Recuentos, porcentajes y mensajes saneados,
  más los nombres de los entrenadores por la razón de `observabilidad.md` §3.0.
  De los clientes finales no sale ni un nombre, igual que ahora.
- **La CLI se queda.** Es la salida de emergencia —funciona con la función edge
  caída— y lo único que puede correr `--estricto` en integración continua.

Ese último punto es una decisión tomada, no una opción abierta: retirar la CLI
dejaría el proyecto con un solo camino a su propio diagnóstico, y ese camino
pasando por la infraestructura que el diagnóstico tiene que poder auditar.

---

## 3. Un cerebro, tres caras

```
        src/domain/radiografia/          ← el razonamiento, puro, con pruebas
        analisis · cuentas · dinero · diagnosticos · catalogo · estado
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
   scripts/          supabase/functions/   (el panel recibe JSON,
   radiografia.mjs   radiografia/          no recalcula nada)
        │                 │
   HTML en local     JSON autenticado ──→ panel en la app
                                     └──→ bot de Telegram
```

**La regla que sostiene todo esto: nunca dos implementaciones de «qué va mal».**
Un bot que dijera «todo bien» mientras el panel dice «atender» destruye la
confianza en los dos a la vez, y es lo que pasa siempre que el aviso se escribe
aparte del análisis.

### Por qué el análisis NO se hace en el navegador

Podría: el código es puro y el `@` alias llega. No se hace por dos motivos:

1. **Volumen.** Analizar en el cliente exige mandarle los datos crudos. Con 15
   clientes da igual; con mil es justo la «computación grande en cliente» que
   `CLAUDE.md` §12 señala.
2. **Bulto.** Serían ~90 KB de lógica en el bundle de una pantalla que abre una
   persona.

El panel recibe JSON ya masticado. Los módulos están en `src/domain/` porque es
lógica de dominio pura con pruebas de vitest —que es exactamente lo que hay en esa
carpeta— y porque `catalogo.js` lee `src/routes.jsx`, no porque la aplicación los
importe.

---

## 4. Qué le falta al HTML, de verdad

El formato no es el problema. El problema es que es **una foto precalculada**:

1. **No se puede preguntar.** «Cinco cobros vencidos, 720 €» y ahí muere. No hay
   camino de la cifra a las filas.
2. **No hay serie.** `estado.json` son 6 KB de instantáneas: seis métricas. Un
   histórico que cabe en un archivo es un histórico superficial.
3. **No hay acción.** Dice «pendiente: mover a esa persona a la prueba que le
   tocaba» y luego eso se hace a mano en otro sitio, sin rastro.
4. **No recuerda lo que decidiste.** Solo recuerda hallazgos de seguridad
   aceptados. No recuerda «hablé con esta cuenta el martes», «esto es un falso
   positivo», «vigilo esto hasta el 30».

La cuarta es la que separa un informe de una herramienta. Los diagnósticos ya son
buenos; lo que no existe es el **bucle**: diagnóstico → decisión → seguimiento →
¿se arregló?

---

## 5. Las aceptaciones se mudan a una tabla, y qué se pierde

`observabilidad.md` §1 versiona `informes/estado.json` a propósito: «es una
decisión, no un dato, y tiene que poder revisarse en un diff». Es buen criterio y
deja de poder aplicarse en cuanto se acepte un hallazgo desde el panel: el
navegador no escribe en git.

**La decisión: las medidas y las aceptaciones van a la base, en tablas separadas,
y la de aceptaciones es de solo añadir.**

| | Antes | Ahora |
|---|---|---|
| Instantáneas de métricas | `estado.json`, tope de 26 | Tabla, sin tope. Es lo que hace posible una serie de verdad |
| Aceptaciones de seguridad | `estado.json`, revisables en un diff | Tabla de solo añadir: quién, cuándo, qué clave y **por qué** |

Lo que se pierde: la revisión en un diff de pull request.

Lo que se gana, y es lo que decide: **autoría** —el diff decía qué cambió, nunca
quién— y que una aceptación **no se pueda reescribir en silencio**. Retirar una
aceptación pasa a ser una fila nueva que la revoca, no una línea borrada. Para lo
que existen estas aceptaciones —poder explicar dentro de seis meses por qué se dio
por bueno un hallazgo crítico— un registro que solo crece vale más que un archivo
que cualquiera puede editar sin dejar constancia.

La tercera opción —tabla *y* volcado a `estado.json`— se descarta por lo que dice
`CLAUDE.md` §9: dos fuentes de verdad para lo mismo es de donde salen los fallos.

`estado.json` no se borra: lo lee la migración una vez para no perder lo aceptado,
y a partir de ahí manda la tabla.

---

## 6. El bot: la mitad que empuja del mismo cerebro

`observabilidad.md` §5.4 dice que esto «no es monitorización en tiempo real, no
hay alertas y no avisa a nadie». Eso deja de ser cierto, y es un cambio de intención
deliberado, no un descuido: lo que aquella frase protegía era no construir una
guardia, y sigue sin construirse.

**No es una segunda interfaz.** Es el mismo `diagnosticar()` con otra salida.
`support-notify` ya prueba que el canal funciona, con el escapado de HTML resuelto.

### Empujar: solo lo que cambia

La regla que hace que un bot sobreviva más de dos semanas es **cuándo se calla**:

- Habla cuando un diagnóstico **cruza** a «atender». No cada vez que sigue en
  «atender».
- Habla cuando algo con fecha **entra en plazo** — las pruebas que acaban, los
  periodos de cobro. Es la única lista con fecha límite que existe.
- **Nunca un resumen diario.** Un mensaje que llega esté pasando algo o no se
  silencia, y con él se silencia el que sí importaba.

### Preguntar

`/estado` devuelve el veredicto —el mismo `resumenDe`—, y luego `/cuentas`,
`/dinero`, `/seguridad`.

### Quién puede hablarle

Una lista blanca de `chat_id` en un secreto. A cualquier otro, **silencio**: un
mensaje de error confirma que el bot existe y a qué responde.

---

## 7. Las fases

| | Qué | Estado |
|---|---|---|
| **0** | **Mover el cerebro.** Los módulos puros a `src/domain/radiografia/`; `estado` partido en razonamiento (dominio) y disco (`scripts/radiografia/archivo.mjs`) | **Hecho** |
| **1** | **La puerta.** Función edge `radiografia`, migración 0074 y la memoria mudada del archivo a la base | **Desplegada** — ver abajo |
| **2** | **La pantalla.** `/plataforma`, en el menú de cuenta y solo para admins. Paridad con el HTML, más los indicadores que el HTML nunca pintó | **Hecha** — ver abajo |
| **3** | **La profundidad.** Series en tabla, drill-down de la cifra a las filas, ventana ajustable sin reejecutar, y el bucle de decisión de §4 | **A medias** — ver abajo |
| **4** | **El bot.** Empujar lo que cambia, responder lo que se pregunta | **Escrito, sin configurar** |

La fase 0 no cambia ni un comportamiento: lo validan las 111 pruebas que se
movieron con los módulos, más las 820 de la suite entera.

### Lo que la fase 2 tiene y lo que le falta

**Tiene** el veredicto, los indicadores con su línea de tendencia —el nivel que
`observabilidad.md` §1 describía y que el HTML nunca llegó a pintar: la serie se
calculaba y no la leía nadie—, la hoja de cuentas con sus motivos de riesgo, y
seguridad con el filtro de pendientes.

**Y aceptar hallazgos**, que es lo que cierra la regresión que abrió la 0074: el
panel HTML dejaba marcar y descargar un `estado.json` que desde entonces no lee
nadie. Se marcan, se escribe el motivo —obligatorio, mínimo tres caracteres— y se
guarda con tu nombre y la fecha.

Tres decisiones de ese camino que conviene no deshacer:

- **El nivel y el objeto no llegan del navegador.** La función vuelve a leer el
  catálogo y los coge de ahí. Si vinieran del cliente, el registro de por qué se
  dio por bueno un hallazgo crítico llevaría dentro lo que el cliente dijera que
  era — y ese registro existe justo para poder revisarlo dentro de seis meses.
- **Una clave que ya no existe no se acepta.** Se devuelve como desconocida. O el
  hallazgo se arregló entre que se pintó la pantalla y se pulsó el botón, o
  cambió su texto y ya es otro; aceptarla dejaría una fila que no corresponde a
  nada y que taparía el hallazgo de verdad si volviera.
- **Retirar una aceptación no tiene pantalla**, y por eso lo ya aceptado no lleva
  casilla. Retirar es añadir una fila que retira (0074), no desmarcar; una
  casilla desmarcable diría lo contrario de lo que hace la tabla.

Y lo que la función **contesta** ya se lee, que es lo que le faltaba a ese
camino. Devuelve `{ aceptadas, desconocidas }` y el panel se limitaba a volver a
pedir el informe: el caso normal se notaba —el hallazgo salía de los
pendientes—, pero el que importa no. Una clave que ya no existe no se acepta a
propósito, así que marcabas cinco, se guardaban tres y las otras dos volvían a
aparecer en la lista sin que nada dijera por qué; se leía como un fallo del
panel y era la regla funcionando. Ahora lo dice, con las claves que no cuadraron.

Del mismo repaso salen dos que eran pérdida de trabajo: **una aceptación que
falla ya no borra lo escrito** —antes se vaciaban la selección y el motivo
pasara lo que pasara, y el error aparecía arriba del todo, fuera de la pantalla,
porque el botón está al final de la lista— y **cada casilla dice qué hallazgo da
por bueno**, que antes era «Crítico» repetido para un lector de pantalla.

Y **las cuatro secciones que faltaban** ya están: dinero con sus dos capas
separadas y rotuladas —lo que te pagan a ti y lo que le pagan a ellos, que nunca
se suman—, soporte con el asunto literal y quién lo escribió, qué se rompe
ordenado por cuentas afectadas y no por veces, y qué se usa abriendo por las
pantallas que no ha abierto nadie.

### Y el repaso de la pantalla como pantalla

Cuatro cosas que no eran del informe sino de cómo se leía:

- **La pantalla no tenía ritmo vertical.** Devolvía un fragmento suelto, y
  `.layout` no reparte aire entre sus hijos: lo pone cada pantalla con `.stack`,
  que es lo que hacen las otras once. Sin él, la cabecera, el carril, el
  veredicto y los ocho paneles salían pegados: se leía como un volcado.
- **Mientras se relee, el informe viejo ya no pasa por nuevo.** Cambiar la
  ventana lo vuelve a pedir entero; en esos segundos el chip decía «7 días» y
  debajo seguían intactas las cifras de 30. El peor estado de un informe no es
  estar vacío, es contestar con seguridad a otra pregunta. Se apaga, se marca
  `aria-busy` y se dice que está actualizándose.
- **El carril de pestañas se queda a la vista** (`.tab-rail`, la misma factura
  de cristal que `.proto-nav`). Dentro de cada pestaña hay tablas de una
  pantalla larga, y el mapa quedaba tres pantallas más arriba.
- **El vacío y el error traen con qué actuar**: generar desde el propio vacío y
  reintentar desde el propio error, en vez de mandar a buscar el botón de la
  cabecera en la pantalla que más tarda en contestar.

En el veredicto, la cifra salía tres veces por fila —en el título, en su píldora
y en el resumen del pliegue—, y el pliegue se comía también los `porque` de una
sola frase, que miden lo mismo cerrados que abiertos. Ahora solo se pliega la
lista, y el rótulo es «Por qué» y no «Quiénes»: dentro no siempre hay personas
—en soporte son asuntos de tickets y en seguridad, nombres de tablas—.

**Lo que sigue sin tener pantalla es retirar una aceptación.** No es un olvido:
retirar es añadir una fila que retira (0074), y la operación tiene que dejar
claro que no borra nada. Hasta entonces se corrige a mano en la base.

### Lo que la fase 3 tiene ya, y lo que le falta

La fase 3 se abrió por donde no exige datos que todavía no existen. El aviso de
§8 sigue en pie —construir **reglas** nuevas sobre 15 clientes es construir un
motor para un conjunto de datos que no hay— y nada de lo de abajo añade una sola
regla: es poder preguntar, y dejar de tirar lo ya calculado.

**Se puede preguntar.** Las tablas se ordenan por cualquier columna (`ThOrden` y
`ordenar`, en `src/components/ui/tabla.jsx` — las primeras del proyecto), la hoja
de cuentas se busca por nombre o correo y se filtra por «en riesgo», «de prueba»
y «sin clientes», y las pantallas usadas dejan de estar cortadas en diez.

Tres decisiones de ahí que conviene no deshacer:

- **Sin columna elegida manda el orden del dominio.** Cada tabla llega ordenada
  por lo que su análisis considera importante —los fallos por cuentas afectadas
  y no por veces, que es la regla más importante de esa sección—. Ordenar por
  defecto por algo de la pantalla taparía ese criterio siempre para servir a
  quien quiera otro de vez en cuando.
- **Los huecos van al final en los dos sentidos.** Una cuenta que no ha entrado
  nunca no es una que entró hace cero días; y si el sentido moviera los huecos,
  invertir el orden llenaría la primera pantalla de filas vacías.
- **`aria-sort`, no `aria-pressed`.** Es el primer uso de ese atributo en el
  repositorio. La convención de la casa para «esto está seleccionado» no vale
  aquí: no hay dos estados sino tres.

**Hay camino de la cifra a las filas.** `ancla` la produce el dominio desde
siempre y el HTML ya la usaba como enlace; el panel la ignoraba. Ahora cada
diagnóstico lleva a su pestaña. Un diagnóstico sin ancla se queda sin flecha, a
propósito: llevar a un sitio elegido a ojo es peor que no llevar a ninguno.

**Y se dejó de tirar lo que ya se calculaba.** Nueve conjuntos viajaban por la
red sin que los pintara nadie: el cruce de suscripción contra uso (`negocio`,
lo único que Stripe no puede contestar), los gestos por evento —`Uso` recibía
`eventos` y solo contaba cuántos había—, los fallos por día, la actividad
semanal, las altas de clientes por semana, el importe medio de cobro, los
nombres de las cuentas de cada plan, y la mitad del censo: nutrición entera,
fotos entera y media de programas y de revisión.

### El embudo y la retención vuelven, corregidos

`scripts/radiografia/informe.mjs` los quitó a propósito —«esto es una hoja de
registro, no un cuadro de mando»— con una razón concreta: con cuatro cuentas «el
13 % tiene portal» son 2 de 15, o sea que **el porcentaje divide y borra los
nombres**. Era verdad y no era un capricho.

Vuelven porque hoy son veinte equipos, y sobre todo vuelven arreglados por lo
que aquella regla protegía de verdad. Las tres correcciones, que tienen prueba
cada una porque son justo lo que alguien «simplificaría» dentro de seis meses:

- **La cifra que se lee son cuentas, no un porcentaje.** «12 de 20», nunca
  «60 %». El porcentaje decide **solo el ancho de la barra**, que es el único
  sitio donde un porcentaje no puede mentir sobre el tamaño de la muestra.
- **La caída de cada paso va al lado.** Es la única cifra del embudo que dice
  dónde trabajar: un 20 % final puede ser una fuga enorme en el paso 2 o cuatro
  repartidas, y el porcentaje sobre el total no distingue esos dos casos —que
  piden cosas distintas—. Un paso sin caída lo dice, en vez de dejar un hueco.
- **No se nombra el peor paso.** Sería un veredicto, y los veredictos los da
  `diagnosticos.js`. Aquí están las cinco cifras y se ven las cinco.

La retención sigue la misma regla —«de las 17 activas volvieron 11», no «el
65 %», porque a esta escala la diferencia entre el 60 y el 65 % es UNA persona—
y avisa cuando hay menos de cuatro semanas con las que comparar: es la misma
cortesía que el dominio ya tiene con los diagnósticos, sin muestra suficiente no
hay veredicto.

Detalle de implementación con consecuencias: el color por defecto de una barra
de datos (`.meter-fill`) pasa a estar **en la hoja de estilos**. Una pantalla no
puede escribir `var(--data-*)` —lo prohíbe `npm run verify`, porque el color es
del dato y se declara una vez— pero el CSS sí, que es donde vive el sistema. Los
tres consumidores que sí distinguen series lo siguen pisando en línea.

**Lo que le falta a la fase 3**:

- **La ventana ajustable sin reejecutar.** Hoy cambiar de 30 a 7 días vuelve a
  pedir el informe entero.
- **El bucle de decisión de §4.** «Hablé con esta cuenta el martes», «esto es un
  falso positivo», «vigilo esto hasta el 30». Es lo que separa un informe de una
  herramienta, y sigue sin existir para nada que no sea seguridad.
- **`PlatformPanel.jsx` pasa de 1.600 líneas.** Las secciones ya están separadas
  y exportadas una a una, así que partirlo en archivos es mecánico; conviene
  hacerlo antes de la próxima tanda, no después.

### Poner en marcha el bot

Antes de nada, lo que no es un paso sino un requisito que faltaba: **`telegram`
necesita `verify_jwt = false`** en `supabase/config.toml` (ya está puesto, con
el porqué al lado). Sus dos llamadores —el cron del worker y los servidores de
Telegram— no pueden traer un JWT de Supabase, así que con la pasarela exigiendo
uno el bot no arranca en absoluto. Se cierra dentro de la función, por
triplicado.

La migración **0075** —que a día de hoy **no está aplicada**: `platform_alerts`
da 404— y luego, con el token que te dé
[@BotFather](https://t.me/BotFather) y tu `chat_id` (ver
[`correo-transaccional.md`](correo-transaccional.md), que ya explica cómo
sacarlos):

```bash
npx supabase secrets set TELEGRAM_BOT_TOKEN=123456:AA...
npx supabase secrets set TELEGRAM_CHAT_IDS=123456789
npx supabase secrets set TELEGRAM_WEBHOOK_SECRET="$(openssl rand -hex 24)"
npx supabase secrets set RADIOGRAFIA_CRON_SECRET="$(openssl rand -hex 24)"
npx supabase secrets set APP_URL=https://tu-dominio.com
npx supabase functions deploy telegram
```

Dar de alta el webhook —una vez, con el MISMO valor del secreto de arriba:

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://<proyecto>.supabase.co/functions/v1/telegram" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

Y el mismo `RADIOGRAFIA_CRON_SECRET` en el worker, que es quien llama al
empujón: `npx wrangler secret put RADIOGRAFIA_CRON_SECRET`.

**Si no configuras nada, no pasa nada**: la función contesta «no configurado» y
el cron lo deja escrito en el registro. Es la misma cortesía que `support-notify`.

### La fase 1, ya puesta en marcha (23/08/2026)

Los tres pasos están hechos y comprobados contra el proyecto:

```bash
npx supabase db push                          # la 0074
npm run radiografia                            # siembra las tablas desde estado.json
npx supabase functions deploy radiografia
```

- La **0074 está aplicada**: `platform_snapshots` y `platform_acceptances`
  contestan.
- La **siembra se hizo**: el informe corre en modo base —no sale el aviso de «la
  0074 no está aplicada»— y los cuatro puntos de histórico de `estado.json`
  están en la tabla. Que `platform_acceptances` esté vacía es correcto y no es
  una pérdida: el archivo tenía **cero** aceptaciones.
- La **función responde**: `POST` sin sesión da 401 en la pasarela, y el
  preflight `OPTIONS` contesta 204. Eso último es lo que permite dejarle puesta
  la comprobación de JWT del gateway (ver `supabase/config.toml`).

Lo que queda de esta fase es **abrir la pantalla con una cuenta admin de
verdad**. Los tres fallos que se corrigieron al escribirla salieron de mirarla
con datos, no de leerla.

El aviso de abajo se conserva porque sigue valiendo para cualquier otro proyecto
o para una restauración: la segunda línea importa y no es opcional. La primera
ejecución tras aplicar la
migración se lleva a la base lo que hubiera en `informes/estado.json` —cada
aceptación con su motivo y su fecha original—. Sin ese paso, la función edge
arranca con la memoria en blanco y saca todos los hallazgos ya revisados como si
nadie los hubiera mirado nunca.

**Antes de aplicar la migración, `npm run radiografia` sigue funcionando igual
que siempre**, con el archivo. Los dos modos se eligen solos y lo dice en los
avisos del informe; ver la cabecera de `scripts/radiografia/memoria.mjs`.

Para probar la puerta una vez desplegada — con la sesión de una cuenta que **no**
esté en `platform_admins`, tiene que contestar 403:

```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/radiografia" \
  -H "Authorization: Bearer $UN_JWT_CUALQUIERA" | head -c 200
```

---

## 8. Lo que puede salir mal

**~~El import desde Deno.~~ Resuelto.** Era el riesgo principal de la fase 1: la
función edge importa `src/domain/radiografia/*.js` con rutas relativas que salen
de `supabase/functions/`. `deno check supabase/functions/radiografia/index.ts`
pasa limpio, así que Deno resuelve los módulos, el `import ... with { type:
'json' }` del catálogo y los tipos.

Que compruebe los tipos **en serio** tuvo un efecto secundario que merece la pena
apuntar: destapó cuatro firmas del dominio con JSDoc incompleto que `tsc` sobre
`jsconfig.json` no veía, porque dentro de `src/` nadie las llamaba con esos
argumentos. La función edge es el primer consumidor estricto que tienen esos
módulos.

Lo que queda por comprobar es el **despliegue**, que es otra cosa: `deno check`
resuelve rutas del disco y `supabase functions deploy` tiene que empaquetarlas.
Si ahí fallara, la alternativa **no es copiar los módulos**: es mover el
compartido a `supabase/functions/_shared/` y estrechar el `exclude` de
`vite.config.js` para que sus pruebas sigan corriendo en `npm test`.

**~~La programación del bot.~~ Decidido: Cron Trigger en el worker.**

`observabilidad.md` §7 dejaba `pg_cron` en el aire («si el plan lo incluye»), y
averiguarlo era un requisito para empezar. Ya no: **un Cron Trigger de Cloudflare
no depende del plan de Supabase**, va en el `wrangler.jsonc` del worker que ya
está desplegado, no cuesta nada y se lee en el mismo repositorio que todo lo
demás.

`pg_cron` habría tenido una ventaja —correr dentro de la base, sin red de por
medio— y dos inconvenientes que pesan más: depende de un plan que puede cambiar,
y su programación vive en una tabla del servidor y no en el repositorio, o sea
fuera de cualquier diff. La misma clase de estado invisible que este proyecto ya
ha pagado tres veces.

El worker tendrá que poder llamar a la función edge, y para eso necesita un
secreto propio (`wrangler secret put`). Es el único añadido.

**Los datos son casi todos de pruebas propias.** `observabilidad.md` §8 lo dice:
4 equipos, 15 clientes, una semana de actividad. Las fases 1, 2 y 4 valen igual con
cuatro cuentas que con cuatrocientas, porque lo que cambian es el **acceso** y la
**latencia**. La fase 3 no: construir análisis profundo sobre 15 clientes es
construir un motor para un conjunto de datos que todavía no existe. Cada regla que
se añada ahí tiene que declarar su muestra mínima, igual que ya hacen los
diagnósticos —«sin datos suficientes no hay veredicto»— o dirá casualidades con
voz de conclusión.

**Esto no está en `producto.md`.** Es herramienta interna, no producto: no consume
una fase del roadmap, pero sí consume semanas. La fase 5 de `producto.md` sigue
pendiente.
