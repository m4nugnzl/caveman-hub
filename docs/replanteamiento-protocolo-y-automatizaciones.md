# Replanteamiento: EL PROTOCOLO Y LAS AUTOMATIZACIONES

> **Encargo (10 sep 2026).** «Siento que el protocolo del cliente está un poco
> escondido: ahora mismo solo se encuentra en la cartera, pinchando en opciones
> de cliente. Y lo de la dieta también podría ser en cierta forma parte del
> protocolo. Actualmente el protocolo (pantalla) es una especie de
> automatizaciones pobre, que debería replantearse ofreciendo automatizaciones
> reales, véase el mecanismo de Coachway. Al final un protocolo al entrar o
> pesarse no es más que una automatización. Deberíamos replantear ambas cosas.»
>
> **Estado: ESTUDIO. Nada construido en `src/`.** Los hechos del §2 están
> comprobados en el código; las decisiones del §11 siguen abiertas.

---

## 1. La tesis

El diagnóstico del dueño es correcto por partida doble, y las dos mitades tienen
la misma causa. La tesis, en una frase:

> **La automatización de verdad ya está construida y se llama «Mandar algo». Lo
> que le falta no es un motor: es que el disparador deje de ser el dedo del
> entrenador. Y el protocolo no está escondido: está repartido en cuatro sitios
> y ninguno de ellos lo enseña entero.**

`MandarAlgo.jsx` + `domain/envios.js` contestan ya las tres preguntas de una
acción —qué, a quién y cuándo—, escriben filas reales con fecha en
`client_actions` y el portal solo las enseña el día que tocan (`vigente`,
`envios.js:469`). Eso es una automatización completa con el disparador clavado
en un botón.

`/protocolos`, en cambio, tiene el vocabulario de la automatización —premisas,
verbos, «Al entrar», «Cada semana»— y por debajo son conmutadores. `accionesDe`
(`acciones.js:194`) no lee acciones: las **compone al vuelo** recorriendo
`intake.steps`, `modules`, `forms`, `schedule` y `alertDays`. Es una lectura, y
una lectura no se dispara, no guarda que ya corrió y no puede tener dos pasos a
distinto día.

Las dos mitades del producto que hacen lo mismo están una en cada pantalla, y
ninguna de las dos sabe de la otra.

---

## 2. Lo verificado en el código

Doce hechos con su sitio. Ninguno es una impresión.

### El protocolo, dónde se toca

**D1 — La hoja del protocolo de una persona tiene UNA sola puerta, y está en la
pantalla de todos.**
`ClientSettingsSheet` (`ClientSettings.jsx:48`) se monta en un único sitio:
`ClientPortfolio.jsx:1601`, abierta desde el «···» de una fila
(`ClientPortfolio.jsx:943`, «Su protocolo…»). No la ofrece el expediente, no la
ofrece la cabecera del cliente y no la ofrece `⌘K` — `CommandPalette.jsx` no
nombra el protocolo en ninguna acción.

**D2 — El expediente del cliente no enseña su protocolo en ninguna de sus cinco
pestañas.**
`COACH_CLIENT` (`routes.jsx:346`) es Resumen · Entreno · Dieta · Revisiones ·
Perfil. Y sin embargo `ClientFile.jsx:33` ya importa tres piezas de
`ClientSettings.jsx` (`LoQueLeHasMandado`, `PauseRow`, `TagsRow`): el camino de
«una implementación, dos sitios que la enseñan» está abierto y el protocolo no
lo ha tomado.

**D3 — El protocolo de un cliente se edita HOY desde cuatro sitios.**

| Dónde | Qué toca | Línea |
|---|---|---|
| `/protocolos` (Taller) | la plantilla, no la persona | `ProtocolosPanel.jsx` |
| Cartera → «···» → «Su protocolo…» | la excepción de esa persona | `ClientPortfolio.jsx:943` |
| Dieta → ajustes del plan | `toggleModule(protocolo,'dietSwaps')` | `NutritionModule.jsx:1080-1083` |
| Entreno → ajustes del ciclo | los módulos de entrenamiento | `CycleSettings.jsx:168` ← `WorkoutLogEditor.jsx:832` |

Los dos últimos **son una decisión deliberada y buena**: el docblock de
`modulesFor` (`protocol.js:111-117`) declara los «interruptores a mano» —el
módulo se enciende en la pantalla donde se echa en falta—. No hay dos
implementaciones: hay una función de dominio y varias bocas.

**D4 — Pero ninguna de las cuatro dice que está tocando el protocolo.**
El interruptor de la dieta —el de la segunda captura del encargo— escribe
exactamente la misma clave que el conmutador «Equivalencias en la dieta» de la
hoja del protocolo (`MODULES`, `protocol.js:102`), y no lo menciona. Quien lo
toca no puede saber que acaba de declarar una excepción de protocolo sobre esa
persona.

**D5 — Y ese panel mezcla dos naturalezas.**
En «Cómo se le pauta» (`AjustesPlan.jsx:63`) conviven el segmentado *Menú
cerrado / Por macros* —que es **el trabajo**: cómo está montado el plan de esa
persona— y el interruptor de equivalencias, que es **protocolo**: qué piezas
tiene encendidas su app. Es la misma clase de error que ese panel ya corrigió
una vez (las dos casillas que en realidad eran una sola elección), un nivel más
arriba.

### La pantalla de protocolos, qué es de verdad

**D6 — Las premisas son cinco y cuatro son momentos fijos del producto.**
`PREMISAS` (`acciones.js:74`): entrar · sesión · semana · silencio · mandada. No
se puede decir «a las cuatro semanas», «cuando conteste el alta», «la primera
vez que se pese», «el día 1 y el día 7». El catálogo no es extensible por el
entrenador: es la lista de los cuatro momentos que la aplicación ya sabía
calcular.

**D7 — No hay secuencia dentro de una premisa.**
Los pasos de «Al entrar» son una lista sin desfase. Coachway escribe «día 1 a
las 10:00» y «día 2 a las 14:30»
(`capturas/referencias/coachway/automations/explicacion.png`); nosotros
escribimos una lista y todo cae a la vez.

**D8 — No hay estado de ejecución, porque no hay ejecución.**
Nada guarda «esta acción ya le corrió a Marta el día 3». Al ser una lectura
derivada, apagar una acción **reescribe el pasado**: desaparece de la línea como
si nunca hubiera existido. Es el motivo real por el que la pantalla no puede
crecer sin modelo nuevo.

**D9 — El «cuándo» sí existe, pero en la otra pantalla.**
`CUANDOS` (`envios.js:277`) son tres: ahora · el día… · a las N semanas de
empezar. Y `fechaPara` (`envios.js:295`) los resuelve por cliente contra
`clients.start_date`. O sea: **el desfase relativo al alta —el disparador
estrella de Coachway— ya está implementado y probado**, y el protocolo no lo usa.

**D10 — Y la entrega diferida también funciona ya.**
Una acción programada se escribe entera en el momento, con su `due`, y el portal
solo enseña las vigentes: `vigente` (`envios.js:469`) y `pendientesDeCliente`
(`envios.js:546`). No hay ninguna promesa que dependa de un servidor.

### La infraestructura

**D11 — Sí hay latido programado, y la nota interna dice que no.**
`wrangler.jsonc:76-77` declara `"crons": ["0 7 * * *"]` y `worker.mjs:85`
implementa `scheduled()`, que llama a la función edge con
`RADIOGRAFIA_CRON_SECRET`. Hay once funciones edge desplegadas
(`supabase/functions/`) y seis leen la clave de servicio. La nota de trabajo que
decía «NO HAY SERVIDOR (verificado)» quedó vieja el día que se desplegó ese
worker.

**D12 — El cliente no puede escribir en `client_actions`.**
La política de escritura de la 0105 es solo del entrenador; lo del cliente entra
por `marcar_accion`, una RPC `SECURITY DEFINER` que solo puede marcar y
contestar su propia fila. **Esto decide la arquitectura del §6**: una
automatización disparada por un hecho del cliente no puede materializarse en el
navegador del cliente.

---

## 3. Qué hace Coachway, medido en sus capturas

De `capturas/referencias/coachway/automations/`:

- **Disparadores** (`triggers.png`): fecha de activación · inicio de la asesoría
  · inicio del pago · formulario de alta completado · manual.
- **Pasos con desfase y hora** (`construir.png`, `explicacion.png`): «Send
  message on day 1 at 10:00», «Share document on day 2 at 14:30».
- **Modo de entrega** por paso: *Auto send* · *Smart send* · *Review first*.
- **Destino** (`send.png`): chat, vault, o los dos.
- **Audiencia por etiqueta** (`workflow.png`): *Target mode: by tag / manually*,
  con las etiquetas del entrenador.

**Qué de esto vale aquí y qué no:**

| Suyo | Nuestro equivalente | Veredicto |
|---|---|---|
| Trigger por fecha de alta | `CUANDOS.semanas` + `start_date` | **Ya está** (D9) |
| Trigger «onboarding completado» | `client_actions.submitted_at` del alta | Falta el disparador; el hecho está |
| Pasos con día y hora | — | **Falta**, y es el corazón |
| Auto send / Review first | — | Falta; «Review first» es una tarea del entrenador, y `client_events` ya guarda tareas con fecha |
| Destino: chat o vault | — | **No aplica.** Aquí no hay chat: el vídeo y el trato van por WhatsApp, decidido y vigente. Nuestro destino es la lista de pendientes del portal |
| Target por etiqueta | `AUDIENCIAS` (`envios.js:217`) | **Ya está**: marcados · etiqueta · protocolo · todos |

Dos de las seis columnas ya están construidas y una no nos interesa. Lo que
falta es **el paso con desfase y el estado de haberse ejecutado**.

---

## 4. El diagnóstico, en tres averías

**A. El protocolo no tiene dónde verse entero por persona.** Cuatro bocas, una
puerta, y la puerta está en la lista de todos. No es que sobren bocas —la de la
dieta está bien puesta—: es que **falta la vista**. Se puede encender el
interruptor y no se puede leer el estado.

**B. «Cómo se le pauta» mezcla el trabajo con el protocolo.** Un segmentado que
decide cómo está montado el plan y un interruptor que decide qué ve la app del
cliente, en la misma caja y con el mismo peso.

**C. `/protocolos` habla como una automatización y por dentro es un panel de
opciones.** Y el producto ya tiene el motor completo a dos pantallas de
distancia, sin usar.

---

## 5. El modelo: qué es una automatización aquí

Una automatización son **tres cosas y una lista**:

```
Automatización
  nombre, activa
  a quién      audiencia            ← AUDIENCIAS de envios.js, sin tocar
  disparador   { tipo, valor }      ← §6
  pasos[]      { desfase: {dias}, ...lo que filasDeEnvio ya sabe escribir }
```

Y entonces todo lo que hoy son cosas distintas pasa a ser lo mismo:

- **Un protocolo** es un paquete de automatizaciones con nombre + la
  configuración de la app de esa persona. Sigue siendo lo que el alta le pone a
  alguien.
- **Un envío** («esto, a estos cinco, hoy») es una automatización de disparador
  manual que ya corrió. Es literalmente el tramo «UNA VEZ» de hoy.
- **El check-in semanal** es una automatización de disparador «cada semana» con
  un paso: pedirle su formulario. Su `schedule` (día, cada N semanas,
  recordatorio) es el disparador, no un ajuste suelto.
- **Las varas de aviso** (`alertDays`) son automatizaciones de disparador
  «silencio» cuyo único paso te avisa a ti.

### Lo que NO es una automatización, y hay que decirlo

El protocolo tiene **dos mitades** y hoy están mezcladas en la misma hoja:

| Mitad | Qué es | Piezas de hoy |
|---|---|---|
| **Cómo es su app** | un estado: qué le llevas, qué piezas tiene encendidas, qué cifras no le vuelven | `services`, `modules`, `hidden` |
| **Qué le pasa y cuándo** | hechos en el tiempo | `intake.steps`, `schedule`, `alertDays`, `forms` |

La primera mitad **no se automatiza**: se configura. Y es exactamente la mitad
que la dieta y el entreno ya encienden a mano, con razón. La segunda es la que
se convierte en automatizaciones.

Esa línea de corte es la respuesta a la primera mitad del encargo: **no hay que
sacar el interruptor de la dieta; hay que reconocer que la dieta es uno de los
escaparates de la mitad de arriba, y darle a esa mitad un sitio donde leerse
entera.**

---

## 6. Los tres motores, y cuál está ya montado

La pregunta que decide el coste es de dónde sale el disparo. Hay tres clases y
solo una necesita obra nueva de verdad.

### Motor 1 · Materializar al disparar — **ya funciona**

Cuando el hecho es del entrenador o se puede fechar por adelantado, las filas se
escriben en el momento con su `due` y el portal las enseña el día que tocan
(D10). Cubre entero el disparador «Al entrar»: el vídeo el día 1, el PDF el día
3, el primer check-in el día 7 — tres filas escritas de una vez al dar de alta.

Coste: **cero infraestructura.** Lo que hay que escribir es el editor de pasos.

### Motor 2 · Disparar en la base — **la obra nueva**

Cuando el hecho lo produce el cliente —contesta el alta, se pesa, entrega su
check-in, cierra una sesión— el navegador del entrenador está cerrado y el del
cliente no puede escribir (D12). Así que tiene que correr **en la base**: un
disparador `AFTER INSERT/UPDATE` que mire las automatizaciones del entrenador de
esa persona y materialice los pasos, o —mejor— una función que las RPC de
entrega existentes (`submit_check_in`, `marcar_accion`) llamen al final.

Los hechos ya están guardados y no hay que inventar ninguno:

| Disparador | El hecho, donde ya vive |
|---|---|
| Al entrar | `clients.start_date` |
| Al aceptar la invitación | `clients.client_profile_id` deja de ser NULL (0083) |
| Al contestar el alta | `client_actions.submitted_at` de un `form` de momento alta (0105) |
| Al entregar su check-in | `check_ins` (0009/0060) |
| **Al pesarse** | `anthropometry.history` |
| Al cerrar una sesión | `workout_data` |
| Al cobrar | `client_payments` (0090) |

### Motor 3 · El latido diario — **ya existe, y nadie lo usa para esto**

Para lo que ni provoca el cliente ni se puede fechar: «si pasan diez días sin
entrenar». Hoy eso se calcula al leer, y por eso el aviso solo existe cuando el
entrenador abre la aplicación — **lo cual es correcto mientras el aviso sea para
él**. En cuanto una automatización tenga que hacerle algo al cliente por su
silencio, hace falta el cron. Y el cron ya está desplegado y corriendo todos los
días a las 07:00 (D11): lo que falta es una segunda llamada dentro de
`scheduled()`.

---

## 7. Dónde vive el protocolo de una persona

La avería A no se arregla con otra puerta. Se arregla haciéndolo **visible donde
ya estás**.

### Ver: una tarjeta en Perfil ~~una tira en el Resumen~~

**Corregido el 10 sep por el dueño: «no sé si tiene mucho sentido un protocolo
en Resumen».** Tiene razón y el corte es limpio:

- **Resumen contesta «cómo va esto»** — hechos que cambian solos: qué entrenó,
  qué pesó, qué contestó. El protocolo no cambia solo; lo cambias tú.
- **Perfil contesta «qué lleva puesto»** — quién es, su alta, su cobro, su
  acceso, su carpeta. Eso es exactamente lo que es un protocolo.

Y Perfil ya tiene el mueble hecho: es una rejilla de tarjetas que abren su hoja
(`ClientFile.jsx:1548-1615` → Quién es · Su alta · Cobro · Acceso y baja · Datos
personales · Su carpeta). **«Su protocolo» es una tarjeta más, con la misma
gramática**, no una pieza nueva:

```
Su protocolo                        Mi protocolo
Entreno + Dieta · equivalencias     6 automatizaciones activas
```

Es información, no receta: dice qué lleva puesto. No propone cambiarlo — la ley
de la casa.

**Lo que sí es de Resumen, y es otra cosa:** *qué le va a pasar esta semana*
(«su check-in, el lunes»). Eso no es el protocolo, es su cola — el mismo
material que el carril de lo mandado. Entra cuando existan las automatizaciones
y con vocabulario de hecho, no de ajuste. Hasta entonces no se pone nada.

### Editar: una hoja, dos puertas

La misma `ClientSettingsSheet` de hoy, abierta desde la tarjeta de Perfil y
desde el «···» de la cartera (como ahora, que funciona y nadie ha pedido
quitarlo). Una implementación, dos sitios que la enseñan: el patrón que
`ClientFile.jsx:33` ya usa. Tres puertas eran una de más en cuanto el sitio
para verlo y el sitio para editarlo son el mismo.

### Y las bocas dicen de dónde vienen

El interruptor de las equivalencias se queda en la dieta —ahí es donde se echa
en falta—, pero deja de ser un interruptor huérfano: lleva su procedencia («De
su protocolo») y la puerta a la hoja. Lo mismo con los del ciclo en Entreno.

---

## 8. La dieta: partir «Cómo se le pauta»

El panel se separa en sus dos naturalezas, sin cambiar de sitio:

- **El plan** — *Menú cerrado / Por macros*. Es el trabajo, se queda arriba y
  manda.
- **Su app** — *El cliente ve las equivalencias*, bajo un rótulo que diga que
  eso es protocolo y con el enlace a la hoja.

No se mueve nada de sitio y se deja de mentir sobre qué es cada cosa. Es la
tanda más barata del documento y arregla la mitad literal del encargo.

---

## 9. Las tandas

**Tanda 1 · Que se vea (sin migración).**
La tarjeta «Su protocolo» en Perfil. La hoja abierta desde ahí y desde la
cartera. El desdoble de «Cómo se le pauta» y la procedencia en las bocas de
Dieta y Entreno. Nada de esto toca el modelo.

**Tanda 2 · El paso con desfase.**
El editor de `/protocolos` deja de ser una lista de conmutadores y pasa a ser
una línea de pasos con su día. Modelo nuevo: las automatizaciones **en tabla, no
en `preferences`** — la 0112 ya dejó escrito el argumento (`profiles.preferences`
se lee y se reescribe entera en cada guardado), y aquí no aplica el
contraargumento de la 0099, porque una automatización no la siembra el alta como
función pura: se dispara. Y una segunda tabla de ejecución, o dos columnas en
`client_actions` (`auto_id`, `paso_id`): **sin estado de ejecución una
automatización se dispara dos veces o ninguna**, y ése es el fallo que no se
puede corregir después.

**Tanda 3 · Los disparadores del cliente.**
El motor 2: la función en la base y su llamada desde las RPC de entrega. Aquí
entran «al contestar el alta» y «al pesarse», que son los dos que el encargo
nombra.

**Tanda 4 · El latido.**
La segunda llamada en `scheduled()` para lo que nadie provoca.

---

## 10. Los riesgos, dichos antes

1. **Doble disparo.** Es el riesgo entero de este trabajo. Cualquier diseño que
   no guarde «este paso ya corrió para esta persona» acaba mandándole el vídeo
   de bienvenida dos veces a alguien. Va con pruebas antes que con pantalla.
2. **`clientProtocol` sanea y descarta lo que no conoce.** Toda clave nueva del
   protocolo entra en su saneado y en `COMPARED_KEYS`/`NOT_COMPARED_KEYS` en el
   mismo commit — hay una prueba que lo vigila.
3. **Resolver antes de comparar.** `necesitaSuPlan`/`protegidoDeSuPlan` comparan
   al cliente contra su plantilla; con automatizaciones en tabla, la comparación
   pasa a depender de algo que se carga aparte. Si no se resuelve antes, la
   cartera dirá «tiene excepciones» a todo el mundo.
4. **RLS y GRANT juntos.** Tabla nueva = política **y** `GRANT`. Este proyecto ya
   se comió el 403 invisible tres veces, y el síntoma no es un error: es un dato
   falso.
5. **Vocabulario.** Mientras el motor 3 no exista, no se puede escribir «le
   llegará el martes» para nada que dependa de leer. Con el motor 1 sí: la fila
   está escrita y su día es firme.

---

## 11. Las decisiones abiertas

1. **¿`/protocolos` cambia de nombre?** El paquete con nombre sigue siendo «el
   protocolo» —es lo que se le pone a una persona— pero dentro son
   automatizaciones. Opciones: dejar «Protocolos» y que el tramo interno se
   llame automatizaciones; o renombrar la puerta.
2. **¿Los envíos de hoy («UNA VEZ») pasan a ser el historial de ejecución**, o se
   quedan como una lista aparte?
3. **¿Entra el «Review first» de Coachway** —el paso que te pide el visto bueno
   antes de salir— o toda automatización sale sola? Tenemos dónde ponerlo
   (`client_events` guarda tareas con fecha) y es la diferencia entre una
   herramienta que ayuda y una que manda cosas en tu nombre.
4. **¿La hora, o solo el día?** Coachway programa a la hora. Con el motor 1 la
   hora no significa nada (la fila ya está escrita y `due` es una fecha); con el
   motor 3 sí. Empezar por el día es más honesto.
5. ~~**¿La tira del protocolo va en Resumen o en Perfil?**~~ **CERRADA el 10 sep
   por el dueño: Perfil.** Una tarjeta más de la rejilla, con la misma
   gramática que «Su alta» o «Su carpeta». Resumen es para lo que cambia solo;
   el protocolo lo cambias tú. Ver §7.
6. **CERRADA el 10 sep: el editor es un flujo, no una lista de conmutadores.**
   Ver §12. Queda abierto dentro de esa decisión si el lienzo llega a ser libre
   (ramas) o se queda en carril vertical; recomendado carril hasta que haya una
   rama de verdad que dibujar.

---

## 12. La forma del editor: un flujo, no una lista

> «Me gusta más la interfaz al estilo Coachway, es más moderna, como suelen
> hacerse las automatizaciones estilo n8n o así.» — el dueño, 10 sep.

Aceptado. Con una precisión medida en sus capturas, porque cambia el trabajo.

### Coachway no es n8n

**n8n es un lienzo libre**: nodos que colocas donde quieras, aristas que se
cruzan, ramas, y datos que viajan de un nodo al siguiente.

**Coachway es un carril vertical** (`workflow.png`, `construir.png`): un nodo
disparador arriba, debajo los pasos en orden, cada uno con su punto, y un «+»
que ofrece los tipos de contenido. Sin coordenadas, sin cables, sin ramas.

Lo que hace que se lea moderno no es el lienzo. Son cuatro cosas, y las cuatro
son gratis en un carril:

1. **El disparador es un nodo**, no un desplegable en una esquina. La
   automatización empieza por «cuándo pasa esto» y eso se ve antes que nada.
2. **Los pasos están encadenados** y el desfase se lee *entre* nodo y nodo, en
   el filete que baja. Hoy el «cuándo» está dentro de un formulario; ahí es un
   campo, en el hilo es la estructura.
3. **El «+» vive entre dos pasos**, no al final de una lista: se añade donde va.
4. **Cada paso se edita en su sitio**, sin cambiar de pantalla.

### Por qué el lienzo libre sería ceremonia

Una automatización nuestra es *disparador + n pasos con desfase* (§5). No hay
bifurcación, no hay confluencia, y no hay datos que viajen entre pasos. Un
lienzo pediría colocar cajas y estirar cables para escribir una lista ordenada:
todo el coste de la metáfora y ninguna de sus ventajas. Además no cabe en el
móvil, y aquí eso no es un detalle ([[el móvil ejecuta, el PC planifica]]).

El día que haya una rama de verdad —«si contestó el check-in, esto; si no,
avísame a mí»— el lienzo se la habrá ganado y se replantea. Ese día es la
tanda 3, no la 2.

### La forma

```
  Mi protocolo · Nutrición de 6 semanas                    Activa ( ●—)
  A quién   Etiqueta «pérdida de grasa»   · 12 personas

     ╭───────────────────────────────────────────────╮
   ● │ CUANDO   empieza su asesoría                  │   ← el disparador es un nodo
     ╰───┬───────────────────────────────────────────╯
         │  ese día
     ╭───┴───────────────────────────────────────────╮
   ● │ Pedirle   su formulario de alta               │
     ╰───┬───────────────────────────────────────────╯
         │  +2 días                                      ← el desfase, en el hilo
     ╭───┴───────────────────────────────────────────╮
   ● │ Mandarle  la guía de medidas                  │
     ╰───┬───────────────────────────────────────────╯
         ⊕   Pedirle algo · Mandarle algo · Avisarme
```

**Los verbos son los nuestros, no los suyos.** Coachway ofrece tipos de
contenido (*Chat message · Document · Video · Audio*) porque su destino es un
chat. Aquí no hay chat —el trato va por WhatsApp, decidido y vigente— y el
destino es la lista de pendientes del portal. Nuestros tipos son los tres verbos
que `MandarAlgo` ya sabe escribir: **pedirle**, **mandarle**, **avisarme**. El
«+» abre exactamente el mismo selector que ya existe, sin inventar vocabulario.

**El hilo dice días, no horas.** Con el motor 1 la fila se escribe con su `due`
y `due` es una fecha: un «a las 10:00» sería un adorno que miente (§11.4). El
filete entre nodos dice «+2 días» y punto.

**Y la mecánica ya está en la casa**: la caja se enciende al acercarte y el
verbo va en azul ([[la ley de los gestos]]), no hay flechas ni lápices; el paso
abierto es la misma hoja de `MandarAlgo`; el nodo apagado no está
([[la ley del reposo]]). El nodo no es un componente nuevo: es la fila de la
mesa con un punto y un filete que baja.

### Lo que muere

`/protocolos` deja de ser una columna de conmutadores. Los que sobreviven son
los de la mitad de arriba —«cómo es su app»— y ésos **no entran en el flujo**:
son la configuración, y van en su propia caja, arriba, separados por el corte
de §5. Un conmutador dibujado como nodo sería la mentira contraria a la de hoy.
