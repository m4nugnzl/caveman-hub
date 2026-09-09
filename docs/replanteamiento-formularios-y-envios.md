# Segunda vuelta: el formulario es libre, el protocolo es quien manda

> **Encargo (8 sep 2026, segunda vuelta).** *«Protocolo no es solo un protocolo
> concreto a un cliente, es una serie de acciones, las que sean: por ejemplo, si
> quiero hacer que x clientes de repente rellenen un formulario porque sí,
> debería poder hacerlo. Respecto a formulario, esta casuística puede ser mucho
> más amplia: analizar bien el alcance y sus consideraciones, y quizás a nivel
> diseño partir de 0 elementos y poder ir añadiendo en vez de partir ya de una
> base; poder copiar plantillas de formularios o tener reglas escritas. Quiero
> que sean dos pantallas muy potentes que doten al entrenador de una herramienta
> versátil, capaz de empoderarnos de información y ajustable.»*

La primera vuelta acertó en la mitad y se quedó corta en la otra. La tesis
—*«un protocolo es una lista de acciones con su premisa»*— sigue en pie. Lo que
falló es el alcance de las dos palabras: **acción** y **formulario**.

---

## 0. Qué corrige exactamente el encargo

Son dos correcciones y por debajo son la misma.

**Primera.** Una acción, tal y como se construyó, tiene **qué** y **cuándo**, y
da el **a quién** por supuesto: es el que lleve ese protocolo. Por eso «que estos
cinco rellenen esto, hoy, porque sí» no cabe en ninguna parte — no porque falte
un botón, sino porque en el modelo no existe la pregunta.

**Segunda.** Un formulario, tal y como se construyó, **tiene un momento dentro**
(`momento: 'alta' | 'sesion' | 'semana'`) y el protocolo lo referencia en la
casilla de ese momento. Hay exactamente tres casillas. Un cuarto formulario
—«hábitos de sueño», «cómo llevas el viaje», «pásame tus marcas»— no tiene dónde
vivir, aunque se pueda crear.

Las dos correcciones dicen lo mismo desde dos lados: **hoy el formulario y el
momento están casados, y quien decidió el matrimonio fue la aplicación.**

El divorcio es la tesis de esta segunda vuelta:

> **Una acción son tres respuestas: QUÉ, A QUIÉN y CUÁNDO.**
>
> · **Formularios** es el **qué**. Un formulario no sabe cuándo se pide ni a
>   quién: solo qué quieres saber y **dónde cae** cada respuesta.
> · **Protocolos** es el **a quién** y el **cuándo**. Todo lo que apunta algo
>   hacia una persona y hacia un momento pasa por ahí — incluido «a estos cinco,
>   ahora».

Y de ahí sale la forma de las dos pantallas: una es un **taller** (se fabrica) y
la otra es un **puesto de mando** (se apunta y se dispara). Hoy las dos son
listas de ajustes, y por eso ninguna de las dos es potente.

---

## 1. El diagnóstico, verificado en el código

Cada punto lleva el fichero donde se comprueba. Nada de esto es impresión.

### E1 · Una acción no tiene «a quién»

`accionesDe({ protocolo, formularios })` (`domain/acciones.js`) deriva la línea
entera desde un protocolo. La audiencia es implícita: los clientes que lo llevan
puesto. No hay ni un campo, ni un argumento, ni una prueba donde aparezca un
conjunto de personas. **La mitad del encargo nuevo no tiene sitio donde
escribirse.**

### E2 · «Mandarle algo» es de uno en uno, y lo que manda no es un formulario

`mandarleAlgo(intake, { label, link })` añade un **paso propio del alta**: una
casilla con texto y, si acaso, un enlace. Sirve para «mírate este vídeo», no para
«contéstame esto». Y solo se alcanza desde `ClientSettings.jsx`, la hoja de
**una** persona.

La cartera **sí** tiene selección múltiple y barra de lote
(`ClientPortfolio.jsx`, `AccionesEnLote`), pero sus tres verbos son *enviar
aviso*, *etiquetar* y *pausar*. El gesto de grupo existe; lo que no existe es que
pueda pedir nada.

### E3 · Un cliente solo puede tener UN formulario a la vez

`clients.preferences.intakeForm` es **un objeto, no una lista**, y se escribe al
dar de alta (`newClientPreferences`, `lib/protocolTemplate.js:412`). Mandarle un
segundo formulario a alguien que ya tiene uno significa, hoy, **pisarle el
primero**. No hay forma de que dos cuestionarios convivan en un cliente.

### E4 · Una respuesta no tiene fecha, ni dueño, ni historia

Lo que el cliente contesta en `IntakeQuestions.jsx` se guarda con
`set_client_profile` (0080) **mezclado en `clients.profile`, con la clave de cada
campo**. No hay entrega: hay campos de ficha que se sobrescriben.

Consecuencia dura: **la misma pregunta hecha dos veces no da dos respuestas, da
una**. Preguntar en enero y en junio «¿cuántos días puedes entrenar?» deja el
dato de junio y borra el de enero. Un formulario que se manda cada mes no puede
existir con este almacenamiento.

Los otros dos sí tienen entrega, y por eso funcionan: el check-in guarda en
`check_ins.answers` (0060, tope 4 KB) con su semana, y el parte en el feedback de
la sesión (0016, tope 4 KB). **La entrega es lo que le falta al tercero.**

### E5 · El tope de 8 KB de `clients.preferences`

`set_client_preferences` (0008) rechaza cualquier objeto de más de 8192 bytes, y
esa columna la comparten el protocolo resuelto, el alta, el formulario copiado,
los sellos de novedades, el panel, lo oculto y las etiquetas. **La copia es el
mecanismo** —el cliente no puede leer el perfil de su entrenador (0002)— y el
mecanismo tiene techo. Dos o tres formularios de verdad no caben.

### E6 · Un formulario tiene tres momentos y ningún cuarto

`MOMENTOS` en `domain/formularios.js` son tres, `sanitizeFormulario` fuerza
cualquier otro valor a `'alta'`, y `resolveProtocolo` coloca las preguntas en
`questions` o en `checkinQuestions` **según el momento**. El momento no es una
etiqueta: es lo que decide dónde caen las preguntas. Quitarlo no es borrar un
campo, es cambiar el almacenamiento (ver §4).

### E7 · El constructor no parte de cero: parte de un catálogo cerrado

Lo que hoy se puede añadir a un formulario:

| Momento | De catálogo | Propias | Tipos de pregunta propia |
|---|---|---|---|
| Alta | los 19 campos de la ficha | **8** (`MAX_CUSTOM`, `intakeForm.js`) | texto · número · sí/no |
| Sesión | `SESSION_QUESTIONS` | **6** (`MAX_CUSTOM`, `protocol.js:719`) | escala · texto |
| Semana | `CHECKIN_QUESTIONS` | **6** | escala · texto |

O sea: **tres tipos de pregunta y un tope de seis u ocho**. No hay elegir una, ni
elegir varias, ni fecha, ni archivo, ni apartado, ni texto explicativo. «Partir
de 0 elementos y poder ir añadiendo» hoy significa partir de un catálogo ajeno y
poder añadir seis cosas de tres clases.

### E8 · No hay ninguna regla

Ni una condición en todo el dominio de formularios: nada de «si contesta que sí,
enséñale esta otra». Todo el mundo ve todas las preguntas siempre.

### E9 · No hay plantillas de formulario

`PlantillasPanel.jsx` existe, pero es de **días de entrenamiento**
(`domain/pieces.js`). Un formulario nuevo nace vacío (sesión y semana) o con los
diez de siempre (alta). No hay galería, no se puede duplicar uno, no se puede
partir de «anamnesis inicial» y quitarle tres cosas.

### E10 · Nada ocurre solo: no hay quien dispare nada

No hay `pg_cron` desplegado —solo se menciona como sugerencia en tres
migraciones— y las once funciones de borde son a petición. **Todo lo que la
aplicación "hace sola" lo hace cuando alguien abre la pantalla**, derivándolo
(`updates.js` lo dice por escrito: una novedad es una comparación de fechas, no
una tabla de mensajes).

Esto no impide nada de lo que pide el encargo, pero **fija el vocabulario**: se
puede prometer «lo verá la próxima vez que entre», no «le llegará el martes a las
nueve». Y un envío es una **escritura en el momento en que pulsas**, que es más
fácil, no más difícil.

---

## 2. El alcance de un formulario

### 2.1 Los elementos, empezando por cero

La rejilla que de verdad organiza esto no es «tipos de campo» —eso lo tiene
cualquiera— sino **dónde cae la respuesta**. Es lo que este producto puede decir
y Google Forms no: una respuesta no se queda en una hoja, entra en la ficha de
una persona.

**Preguntas** — la respuesta se guarda con la entrega.

| Elemento | Qué contesta |
|---|---|
| Texto corto | una línea |
| Texto largo | un párrafo |
| Un número | con su unidad opcional (kg, km, horas) |
| Sí o no | un interruptor |
| Elegir una | opciones que escribes tú |
| Elegir varias | ídem, con tope |
| Escala | de N a M, con «mejor arriba o abajo» y color → **se convierte en serie** |
| Una fecha | fecha |
| Subir un archivo | PDF, imagen |
| Subir una foto | va a su carpeta, no a las de progreso |

**Del oficio** — la respuesta **sale del formulario** y entra donde vive ese
dato. Son los `enchufes` que el constructor ya tiene, generalizados: es la firma
del producto y aquí pasa a ser el eje.

| Elemento | Dónde cae | Estado hoy |
|---|---|---|
| Su peso | `anthropometry` | ya existe (`weighIns`) |
| Sus perímetros | `anthropometry` + **guía de medición** | ya existe |
| Sus pliegues | `anthropometry` + guía | ya existe |
| Sus fotos de progreso | `progress_photos` | ya existe (`askPhotos`) |
| Datos de partida | edad y altura a `clients`, peso a su serie | ya existe (`askBasics`) |
| Su salud | `client_conditions` (0077) | ya existe (`askHealth`) |
| Cribado TCA | `profile.scoff` | ya existe (`askScreening`) |
| Un campo de su ficha | `clients.profile` | ya existe (los 19) |
| Su maquinaria | `client_equipment` (0079) | **existe la tabla, no el enchufe** |
| Su consentimiento | `client_consents` (0018/0088) | **existe la tabla, no el enchufe** |

Los dos últimos son regalo: la tabla, sus políticas y su lectura ya están
desplegadas y nadie las alimenta desde un formulario.

**Estructura** — no pregunta nada.

- **Un apartado**: título y, si hace falta, una línea de contexto. Es lo que
  convierte un cuestionario de 24 campos en cuatro bloques legibles.
- **Un texto**: explicar antes de pedir. («Contéstalo el domingo por la mañana,
  en ayunas y después de ir al baño.»)
- **Un vídeo o una imagen**: la guía de medición es el caso obvio, y ya está
  hecha (`GuiaDeMedidas.jsx`).

### 2.2 Lo que tiene cada elemento

Enunciado · ayuda opcional · obligatorio o no · **dónde cae** · y, si es de
elección, sus opciones. Nada más. Todo lo demás —marcador de posición, valor por
defecto, validación fina— es peso sin retorno para quien pregunta ocho cosas.

### 2.3 Las reglas

«Reglas escritas» tiene dos lecturas y las dos valen, porque son la misma cosa
mirada por los dos lados:

1. **La condición**: si contesta *X*, enséñale *Y*.
2. **La frase**: que esa condición se lea como una frase y no como tres
   desplegables.

La propuesta es escribirla como se lee:

> **Si** contesta **Sí** a *«¿Arrastras alguna lesión?»* → **enséñale**
> *«¿Cuál, y desde cuándo?»*

**Acotación deliberada:** una regla por elemento, que mire a un elemento
**anterior** del mismo formulario, con un solo operador (`es` / `no es` / `mayor
que`). Eso cubre lo que un entrenador escribe de verdad —lesiones, embarazo,
alergias, «si has fallado entrenos, cuéntame por qué»— y evita el árbol de
dependencias que obligaría a un motor de evaluación en el portal. Sin ciclos
posibles, porque solo se mira hacia atrás.

### 2.4 El ciclo de vida

- **Duplicar** uno existente. Es la forma más usada de «partir de una base».
- **Plantillas de fábrica**: anamnesis inicial · check-in semanal · parte de la
  sesión · revisión mensual con medidas · consentimiento y datos · hábitos
  (sueño, pasos, estrés) · historial de lesiones · preferencias alimentarias ·
  marcas de fuerza · satisfacción. Se copian y se editan; no se «usan» ligadas,
  para que tocar una plantilla nunca cambie lo que alguien ya tiene puesto.
- **La versión se congela al mandarlo.** Cambiar un formulario mañana no puede
  cambiar lo que alguien contestó ayer, ni lo que tiene a medias. Es la razón
  técnica más fuerte de §4.

### 2.5 Las respuestas: leerlas es la mitad del valor

«Empoderarnos de información» es esto, y hoy no existe:

- **Por persona**: qué contestó, cuándo, y qué contestó la vez anterior.
- **Por envío**: las 12 personas a las que se lo mandaste, en una tabla, con una
  columna por pregunta. Ocho contestaron; ves las ocho de un vistazo.
- **Por pregunta**: una escala da una serie; una elección da un recuento.

### 2.6 Lo que se queda fuera, a propósito

Puntuación y resultado (tests con nota), varios idiomas, firma dibujada, cobro
dentro del formulario, saltos de página condicionales y tablas repetibles
(«añade otra comida»).

Y **formularios públicos para quien todavía no es cliente**: es el único de la
lista con demanda previsible, porque es captación. Queda apuntado como fase
futura, no como recorte definitivo — cambia el alcance del producto, no solo el
de la pantalla.

---

## 3. El alcance de un protocolo

### 3.1 Las tres respuestas

Todo lo que ocurre en esta pantalla se dice igual: **verbo + qué + a quién +
cuándo.**

> *Pídele* · **el check-in** · a **los 14 de Mi protocolo** · **cada domingo**
>
> *Pídele* · **hábitos de sueño** · a **los 5 con #presencial** · **ahora**
>
> *Dale* · **el vídeo de bienvenida** · a **quien entre** · **al entrar**

Lo construido cubre las filas cuyo «a quién» es *los de este protocolo*. Lo que
falta es que esa columna se pueda decir.

### 3.2 Las audiencias que ya se pueden decir hoy

Sin ninguna tabla nueva y sin ningún concepto nuevo:

| Audiencia | De dónde sale | Estado |
|---|---|---|
| Estos, marcados a mano | selección de la cartera | **ya existe** |
| Los que llevan una etiqueta | `clients.tags` (0093) | **ya existe** |
| Los de un protocolo | `preferences.protocolId` | **ya existe** |
| Los activos / pendientes / en pausa | tramos de `portfolio.js` | **ya existe** |
| Los que tienen un servicio | `protocol.services` | **ya existe** |
| Todos | — | — |

No hace falta inventar «segmentos»: el producto ya sabe decir a quién.

### 3.3 Los cuándos

Los cinco de `PREMISAS` siguen valiendo tal cual. Se añaden tres, y solo la
tercera cuesta algo:

- **Ahora** — el envío. Se escribe al pulsar; es el más barato de todos.
- **El día X** — queda pendiente y aparece cuando llegue el día (se evalúa al
  leer, como todo lo demás: E10).
- **A las N semanas de empezar** — la única con aritmética propia: se cuenta
  desde `start_date`, y se evalúa igual, al leer.

### 3.4 Un envío tiene vida

No es «mandar y olvidar». Es una fila que dice: mandado a 12 · entregado 8 ·
pendiente 3 · uno no lo ha abierto. Ahí está la información que el encargo pide,
y ahí está la diferencia entre un formulario y un correo.

### 3.5 Lo que no se puede prometer

Sin servidor (E10): nada «llega» a nadie. Aparece **la próxima vez que el cliente
abre su portal**, por el canal de novedades que ya existe (`updates.js`). El
texto de la interfaz tiene que decirlo así, y no fingir un envío que no ocurre.

---

## 4. La decisión que gobierna todo: dónde vive una respuesta

Todo lo anterior se apoya en una sola decisión. Sin ella, ninguna de las dos
pantallas puede ser lo que el encargo pide, por bien que se dibuje.

**El problema en una frase:** un formulario suelto no tiene dónde guardarse
(E3: la casilla es una y se pisa; E5: la columna tiene 8 KB) ni dónde guardar lo
que se conteste (E4: cae en la ficha, sin fecha y machacando lo anterior).

### Las tres salidas

**A · Quedarse en JSON.** Cero migraciones. No resuelve E3, E4 ni E5: un
formulario suelto por cliente, sin historia y con techo. *Descartada: es decir
que no al encargo.*

**B · Una tabla para lo que se manda.** `client_forms`: una fila por «esto, a
esta persona, este día», con **el esquema congelado** y las respuestas dentro.
Resuelve E3, E4, E5, el versionado y la lectura por envío. La biblioteca del
entrenador se queda donde está.

**C · B, y además la biblioteca en su tabla.** `forms` para los formularios del
entrenador, además de `client_forms`. Añade poder crecer sin apretar
`profiles.preferences`, y hace posible la galería de plantillas de fábrica.

**Recomendación: C, en una sola migración.** El SQL de la segunda tabla son
veinte líneas más en el mismo fichero, y hacerlo después significa dos
migraciones, dos caminos de lectura y una temporada con formularios grandes
apretando una columna que se carga entera en cada arranque. Con el patrón de
mudanza silenciosa que ya se usó dos veces (`intakeForms`, `formularios`): **sin
fila en la tabla, los de `preferences` son la lista**, y nadie nota nada.

### Boceto de la migración

```sql
-- La biblioteca del entrenador
create table forms (
  id uuid primary key,
  coach_id uuid not null references profiles(id),
  name text not null,
  schema jsonb not null default '{}'::jsonb,  -- elementos y reglas
  updated_at timestamptz not null default now()
);

-- Lo que se le manda a una persona
create table client_forms (
  id uuid primary key,
  client_id uuid not null references clients(id) on delete cascade,
  coach_id uuid not null,
  form_id uuid,                      -- de cuál salió; puede borrarse y esto sigue
  title text not null,
  schema jsonb not null,             -- CONGELADO al mandarlo
  answers jsonb,                     -- lo que contesta
  status text not null default 'pending',
  due date,
  sent_at timestamptz not null default now(),
  submitted_at timestamptz
);
```

Con las reglas de la casa, que no son opcionales:

- **RLS**: el entrenador ve y escribe las filas de **sus** clientes; el cliente ve
  **las suyas** y solo puede escribir `answers` y `submitted_at`.
- **`GRANT` explícito además de la política** — el 403 invisible ya mordió dos
  veces en este proyecto.
- **La escritura del cliente por RPC `SECURITY DEFINER`**, calcada de
  `submit_check_in` (0060), con tope de tamaño en el propio cuerpo de la función:
  es invocable con la anon key y no puede fiarse de la aplicación.
- **Los enchufes disparan al entregar**: si el formulario pedía perímetros, la
  entrega los escribe en `anthropometry` como hasta ahora. La fila es el
  registro; el enchufe es el efecto. Se conservan los dos.

**Lo que NO cambia:** el check-in semanal y el parte de la sesión se quedan donde
están (`check_ins`, feedback de sesión). Ya tienen entrega, ya tienen fecha y ya
funcionan. Moverlos sería una migración de datos a cambio de elegancia — el mismo
razonamiento por el que `domain/formularios.js` no unificó el almacenamiento de
las preguntas.

---

## 5. Ventana 1 · Formularios — el taller

Cumple la ley de la hoja: hoja fija, la lista es una caja que llena el alto, el
titular no es display.

### El vacío es la galería

Un formulario nuevo no nace con diez preguntas puestas ni con un lienzo mudo:
nace con **la elección de por dónde empezar**, a pantalla completa.

```
┌──────────────────────────────────────────────────────────┐
│  ¿Qué quieres preguntar?                                 │
│                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐     │
│  │ En blanco│ │ Anamnesis│ │ Check-in │ │ Revisión │ ... │
│  │          │ │  inicial │ │  semanal │ │ mensual  │     │
│  │ 0 campos │ │ 18 campos│ │ 9 campos │ │ 6 + fotos│     │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘     │
│                                                          │
│  O duplica uno tuyo:  Alta general ·  El check-in        │
└──────────────────────────────────────────────────────────┘
```

### El lienzo, con el elemento dentro

Se conserva lo bueno de la primera vuelta (el renglón **contiene** su control
real, no lo describe) y se le añade lo que faltaba: **el paso 0**.

```
 Alta de powerlifting                       [Vista del cliente] [Mandar]
┌────────────────────────────────────┬───────────────────────────────┐
│ ▸ APARTADO · Quién eres            │  El elemento tocado           │
│   ┌──────────────────────────────┐ │  ──────────────────────────   │
│   │ ● ¿Arrastras alguna lesión?  │ │  Enunciado                    │
│   │   ( ) Sí   ( ) No            │ │  [¿Arrastras alguna lesión?]  │
│   └──────────────────────────────┘ │                               │
│   ┌──────────────────────────────┐ │  Dónde cae la respuesta       │
│   │ ● ¿Cuál, y desde cuándo?     │ │  ⌁ Sus condicionantes    ▾    │
│   │   [                        ] │ │                               │
│   │   ↳ solo si «Sí» arriba      │ │  ☐ Obligatoria                │
│   └──────────────────────────────┘ │                               │
│                                    │  REGLA                        │
│ ▸ APARTADO · Cómo entrenas         │  Enséñasela solo si contesta  │
│   ...                              │  [Sí ▾] a [¿Arrastras… ▾]     │
│                                    │                               │
│   [ + Añadir ]                     │  Así lo ve él: ▸ (el control) │
└────────────────────────────────────┴───────────────────────────────┘
```

- **El disco de familia** a la izquierda de cada renglón, por `data-tono`
  (nunca `--data-*`: `verify-styles.mjs` lo prohíbe como cromo).
- **La regla se lee bajo el renglón**, en una línea gris con «↳», para que la
  lógica del formulario se lea recorriendo el lienzo y no abriendo diez carriles.
- **«+ Añadir» abre la lámina** —ilustración, «¿Qué quieres preguntar?», columnas
  de icono y palabra sin cajas— con las tres familias: Preguntas · Del oficio ·
  Estructura.

### La cabecera dice lo que el formulario es

Nombre, número de elementos, y **quién lo pide**: los protocolos que lo llevan y
los envíos vivos. Un formulario que no pide nadie se dice con una chapa, no con
un aviso: no es un error, es un dato.

---

## 6. Ventana 2 · Protocolos — el puesto de mando

### Primer nivel: dos listas y un verbo

Todo lo que le pasa a un cliente, leído junto. Arriba lo que pasa **siempre**;
abajo lo que pasó **una vez**.

```
 Protocolos                                        [ Mandar algo ]
┌──────────────────────────────────────────────────────────────────┐
│ SIEMPRE                                                          │
│  Mi protocolo          14 clientes   9 acciones   dom · semanal  │
│  Powerlifting           3 clientes   6 acciones   lun · quincenal│
│                                                                  │
│ UNA VEZ                                                          │
│  Hábitos de sueño      a 5 · #presencial     hace 2 días   3/5 ▓▓│
│  Aviso: cierro en agosto  a 17 · todos       hace 1 semana   —   │
│  Marcas de fuerza      a 8 · Powerlifting    programado 1 oct    │
└──────────────────────────────────────────────────────────────────┘
```

La columna de la derecha de un envío es la que devuelve información: **3 de 5**,
con su barra. Se pincha y se abre.

### El diálogo de mandar: tres preguntas, en este orden

```
  ¿Qué les mandas?        ¿A quién?                ¿Cuándo?
  ─────────────────       ────────────────         ──────────────
  ○ Un formulario    →    ○ A los que marqué (5)   ○ Ahora
  ○ Un archivo            ○ Con la etiqueta…       ○ El día…
  ○ Un vídeo              ○ De un protocolo…       ○ A las N semanas
  ○ Una tarea tuya        ○ A todos                   de empezar
  ○ Un aviso
                          → 5 personas             Lo verán la próxima
                                                   vez que entren.
```

Tres pasos, y el tercero dice la verdad sobre cuándo se enteran (§3.5). El
recuento en vivo bajo el segundo paso es lo que evita mandarle algo a 40 personas
sin querer.

### El envío abierto: la tabla que devuelve la información

```
 Hábitos de sueño · mandado el 6 oct a 5 personas          3 de 5
┌─────────────┬──────────┬───────────┬──────────┬──────────────────┐
│ Cliente     │ Entregó  │ Horas     │ ¿Duermes │ ¿Qué te lo       │
│             │          │ de sueño  │ seguido? │ estropea?        │
├─────────────┼──────────┼───────────┼──────────┼──────────────────┤
│ Marta R.    │ 6 oct    │ 6,5       │ No       │ El bebé          │
│ Javi L.     │ 6 oct    │ 8         │ Sí       │ —                │
│ Ana P.      │ 7 oct    │ 5         │ No       │ Turnos de noche  │
│ Luis M.     │ pendiente│           │          │                  │
│ Carmen S.   │ pendiente│           │          │      [Recordar]  │
└─────────────┴──────────┴───────────┴──────────┴──────────────────┘
```

Una columna por pregunta, las pendientes abajo y en gris. Esto es la pantalla que
hoy no existe en ninguna parte del producto y la que justifica todo lo demás.

### El protocolo abierto

Lo construido en la primera vuelta se queda **tal cual**: rótulos por premisa,
verbo y sujeto por renglón, carril derecho con el control real, disco de familia.
Gana una cosa: en la cinta, **cuántos lo llevan** y el acceso a esa lista.

---

## 7. Lo que se conserva de lo construido

No se tira nada de la primera vuelta. Se ensancha:

| Pieza | Qué le pasa |
|---|---|
| `domain/acciones.js` | Gana el eje «a quién». La lectura del protocolo no cambia. |
| `domain/protocolos.js` | Intacto. |
| `domain/formularios.js` | El `momento` deja de ser obligatorio (los tres de siempre lo conservan). |
| `ConstructorFormulario.jsx` | Gana elementos, apartados y reglas. La gramática es la misma. |
| `GuiaDeMedidas.jsx` | Intacta, y por fin también para el cliente. |
| `ProtocolosPanel.jsx` | Gana el nivel «Una vez» y el diálogo de mandar. |
| Enchufes | Pasan de ser cuatro casos especiales a ser **el eje del catálogo**. |

---

## 8. Riesgos, dichos antes de empezar

1. **La migración toca el portal del cliente.** Un formulario suelto es una
   pantalla nueva en su lado. Sin ella, mandar no sirve de nada: el trabajo del
   cliente entra en el mismo bloque, no después.
2. **`resolveProtocolo` se apoya en el momento.** Aflojarlo sin cuidado deja
   preguntas sin caer en ninguna lista. Va con pruebas antes que con pantalla.
3. **Las reglas se evalúan dos veces** —en el constructor, para la vista previa, y
   en el portal, de verdad—. Una sola función de dominio para las dos, o
   divergen.
4. **El envío a muchos son N escrituras** desde el navegador. Con 40 clientes hay
   que hacerlo en tanda y contar los fallos, no dar por hecho que fueron todas.
5. **La cartera y el envío comparten selección.** Si «los marcados» viven en dos
   sitios, a la tercera pantalla alguien manda algo al grupo equivocado.

---

## 9. Las decisiones que esperan

1. **¿Se hace la migración (opción C)?** Es la que abre todo lo demás. Sin ella,
   el resto es maquillaje sobre tres casillas fijas.
2. **¿Los envíos viven en `/protocolos`** (recomendado: sí, es la misma
   gramática) **o son una banda propia del Taller?**
3. **¿Entran las reglas en la primera tanda** o se dejan para la segunda? Son el
   único punto con coste de motor en los dos lados.
4. **¿Formularios públicos para quien todavía no es cliente?** Es captación, no
   asesoría: cambia el alcance del producto, no solo el de la pantalla.
