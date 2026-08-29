# Propuestas de diseño y estructura

> Fecha: 29 de agosto de 2026. Base: `93ab681`.
>
> Sale de comparar el repositorio con las dos referencias guardadas en
> `capturas/referencias/` —Efort Coach y ProCoach— y con lo que hacen las
> aplicaciones de registro de entreno que usa el cliente por su cuenta (Hevy,
> Strong).
>
> **Qué es esto:** una lista de propuestas con su evidencia y un orden de
> trabajo. **Qué NO es:** una decisión. Ninguna propuesta de aquí depende de que
> se contesten las cinco preguntas de la §8 de `producto.md`, y eso es a
> propósito.
>
> **Nada de esto está validado con `npm run check`**: en el entorno donde se
> escribió no había `node_modules`. Es lectura de código, del esquema y de los
> documentos.

---

## 0. Lo que no hay que tocar

La mayor parte, y conviene decirlo antes de proponer nada.

- **«Hierro y tiza».** Resuelve un problema que las dos referencias ni se
  plantean —el cromo sin color, para que el círculo cromático entero quede libre
  para el dato— y lo resuelve con una regla que `verify-styles.mjs` verifica.
- **`domain/`.** Funciones puras, con pruebas, sin React.
- **`lib/saveQueue` y `lib/pendingSaves`.** Cubren el único fallo que pierde
  datos de verdad.
- **El razonamiento escrito en los propios archivos.** `BottomNav`,
  `CLIENT_SECTIONS`, `SetCell`, `AppContext`: cada uno defiende su decisión y
  casi siempre tiene razón. Donde una propuesta contradice a uno de ellos, se
  dice.

La tesis de la lista, en una frase: **el lenguaje visual y el oficio por cliente
están por encima de las dos referencias; lo que está por debajo es que el
producto es dueño de la semana pero no de la conversación, que todo escala en
línea recta con el número de clientes, y que el móvil del gimnasio sigue tratado
como un escritorio pequeño.**

---

## A. El producto: lo que no existe

### A1 · La conversación vive fuera del producto

**Hoy.** No hay ninguna tabla de mensajes entre entrenador y cliente. Las que
hay —`support_tickets`, `support_messages`— son el soporte de la plataforma,
otra cosa. El bucle se cierra con el check-in y la decisión escrita; todo el
«oye, esto cómo lo hago» ocurre en WhatsApp.

**La referencia.** Efort lleva el chat acoplado abajo a la derecha en todas las
pantallas, y su panel de inicio cuenta «6 unanswered chats» como métrica de
primer nivel. ProCoach lo pone en la frase con la que se vende: «message
clients… from one place».

**Propuesta.** Un hilo por cliente, pero **anclado al contexto**: cada mensaje
nace de una pieza del producto —esta serie, esta comida, esta foto, esta
revisión— y se lee con ella delante. Es lo que WhatsApp no puede hacer, y por
tanto la única razón por la que alguien se cambiaría. Un chat genérico sería un
WhatsApp peor.

La versión pequeña que ya cabe sin infraestructura nueva: comentarios en la
sesión y en el ejercicio, más una bandeja «sin responder» en Inicio, al lado de
«Te esperan». La grande necesita tabla, RLS, tiempo real y avisos.

> Impacto alto · la más cara de la lista · es donde está la retención.

### A2 · Todo escala en línea recta con el número de clientes

**Hoy.** Hay biblioteca de *ejercicios* y de *alimentos* (`exercises`,
`catalog_exercises`, `foods`), pero no de **estructuras**: no existe un bloque,
una semana ni una dieta guardados con nombre y reutilizables. Lo más parecido es
copiar de otro cliente (`CopyToClientPanel`, `ImportDayDialog`). El lote existe
en un solo sitio: el «aplicar a todos» de nutrición.

Y «Inicio» mira hacia atrás: la barra de las últimas dos semanas y el hilo
cuentan lo que **ha pasado**; `buildInbox` solo conoce dos motivos, y los dos son
reactivos (check-in entregado, cobro pendiente).

**La referencia.** «Librería» es una entrada de nivel 1 en Efort, al lado de
Atletas. Y su panel de inicio no cuenta lo que pasó: cuenta lo que hay que hacer
—«New block needed: 10», «Block update needed: 13»— con una previsión de bloques
nuevos por semanas.

**Propuesta**, en orden de rentabilidad:

1. **La previsión**, que es casi gratis. «Inicio» ya conoce el microciclo activo
   de cada cliente y su semana; leído hacia delante, ese mismo dato contesta «a
   quién se le acaba el bloque esta semana». Es la misma barra mirando hacia el
   otro lado, y sale de `domain/`.
2. **La biblioteca de estructuras.** Bloques, semanas, sesiones y dietas con
   nombre. Es la pieza que convierte veinte aperturas en tres.
3. **El lote.** Generalizar el «aplicar a todos» que ya existe: aplicar una
   progresión a seis clientes, subir 100 kcal a cuatro.

### A3 · Los hallazgos existen por cliente y no existen por cartera

**Hoy.** `domain/reading.js` ya produce veredictos del tipo «estancado y la
adherencia es del 40 %», y `Hallazgos.jsx` los pinta dentro de la ventana del
panel de *un* cliente, encima de su prueba. Bien puesto: la conclusión va donde
está su prueba.

**Propuesta.** La **transpuesta** de lo que ya se calcula. El entrenador con
cuarenta clientes no se pregunta «¿cómo va Javier?»; se pregunta «¿quién se me
está yendo?». Es agregación de un cálculo hecho y probado: un tercer motivo en la
bandeja de Inicio —«se está apagando»— con su prueba a un clic. La regla que ya
sostiene `Hallazgos` se mantiene: son hechos, no consejos.

Es la única propuesta de la lista donde la referencia **no** enseña el camino
—ninguna de las dos lo hace bien— y por eso puede ser la más diferencial.

---

## B. La estructura, por dentro

Cuatro cosas medidas. Ninguna es urgente hoy; las cuatro se vuelven caras justo
cuando el producto empieza a funcionar.

### B1 · 13.784 líneas de CSS en un archivo, y la portada dentro

**Medido.** `src/index.css`: 13.784 líneas, 3.355 reglas, cuarenta secciones,
123 `@media`. Las líneas 3.040–6.183 son la portada pública y el acceso: el 22 %
del archivo. El JS ya está partido por rutas con `lazyRoute`; el CSS no está
partido por nada.

**El precio real, para no exagerarlo:** unos **50 KB comprimidos**, de los cuales
7,6 son de la portada. *No es un problema de peso.* Es de navegación y de riesgo:
el CSS del escaparate convive en el mismo archivo con el de la hoja de series.

**Propuesta.** Partirlo por el eje que ya usa el JS, **sin tocar un solo
selector**: un `base/` (reset, tipografía, superficies, botones, formularios), el
chasis, y un archivo por dominio. `marketing.css` importado desde
`LandingPage.jsx`, que Vite ya sabe llevar a su propio trozo. Ni un token cambia.
Es la refactorización más segura de la lista, y desbloquea que
`verify-styles.mjs` verifique por zona en vez de por archivo.

### B2 · Al entrar se descarga la cartera entera

**Hoy.** El arranque de `AppContext` pide con `.in('client_id', ids)` la
antropometría, los planes de nutrición y las fotos de **todos** los clientes —y
los programas completos si el RPC de resúmenes no se puede usar. Las fotos,
además, ordenadas y sin `limit`. Con quince clientes va bien; el coste crece con
cada alta.

**Propuesta.** La solución ya está inventada dentro del propio proyecto:
`training_summaries` es exactamente el patrón correcto —resumen por RPC para la
lista, detalle al entrar— y está aplicado a **una** de las cuatro tablas.
Extenderlo a las otras tres e hidratar el cliente completo al entrar en su ruta.
No es arquitectura nueva: es terminar la que ya se eligió.

### B3 · El corte en tres contextos está hecho, y 38 componentes no lo usan

**Hoy.** `AppContext` se partió en sesión, datos y acciones, y está bien
argumentado en el propio archivo. Pero `useApp()` los vuelve a fundir en un
objeto, y **38 archivos siguen llamándolo** frente a 12 que usan los ganchos
estrechos: se repintan con cualquier escritura aunque solo lean una función.

**Propuesta.** Terminar la migración —es mecánica— y **cerrarla con una regla, no
con una intención**: `no-restricted-imports` sobre `useApp` en cuanto llegue a
cero. Sin eso vuelve solo, igual que volvía el color de marca antes de que
`verify-styles` lo persiguiera.

### B4 · Treinta archivos abren una ventana; la referencia usa un inspector

**Hoy.** Treinta componentes montan `<Modal>`. Solo el editor de rutina tiene
seis: `BloquePopup`, `ProgresionPopup`, `SensacionesPopup`, `NuevoBloqueDialog`,
`ImportDayDialog` y la comparativa de ejercicio.

**La referencia.** Efort resuelve el mismo editor con tres columnas: lista de
días, hoja de series y **un inspector fijo a la derecha** con el ejercicio
seleccionado —historial, equipamiento, tempo, rango de movimiento— en chips. Cero
ventanas.

**Propuesta.** Un modal es la forma correcta de una decisión con respuesta
cerrada (`ConfirmProvider` lo usa bien). Es la forma equivocada de *editar
mientras miras*, porque tapa justo lo que hay que comparar. Convertir en
inspector lo que en el editor es consulta —la comparativa, la progresión, las
sensaciones— y dejar en ventana solo lo que interrumpe a propósito.

---

## C. El móvil del cliente

Aquí está la mayor distancia con el mercado, y no con Efort ni con ProCoach:
con Hevy y Strong, que es contra quien compara el cliente cuando abre la
aplicación en el gimnasio.

### C1 · Sin cobertura, la aplicación abre — y está vacía

**Hoy.** El camino sin red está construido por los dos extremos y le falta el
medio. El service worker precachea el casco con la lista real del build, así que
la aplicación *abre*. `pendingSaves` guarda en el navegador lo que falta por
enviar, así que lo escrito *no se pierde*. Pero la tercera regla del worker es
explícita —Supabase «ni se toca»—, así que en un sótano el cliente abre la
aplicación, la ve pintarse y **no tiene su sesión**.

**Propuesta.** Cachear **dos objetos**, no inventar un modo sin conexión: el
microciclo activo y el plan de dieta vigente. Son los únicos dos que se usan sin
red y los dos que caben. Con la marca de cuándo se vieron por última vez, que es
lo que evita que una caché vieja mienta. Es la misma decisión que ya se tomó para
lo pendiente de guardar —«una nota de lo que faltaba», no una base de datos
local— aplicada a la lectura en vez de a la escritura.

### C2 · Registrar una serie sigue siendo rellenar un formulario

**Hoy.** Está bien resuelto y con criterio: la fila en vez de la tarjeta cuando
quien escribe es el cliente, `inputMode` por campo, objetivo por serie, y el
cliente **sí** recibe sus series previas y sus mejores marcas
(`previousSetsBefore`, `bestSetsBefore`). Lo que no hay es lo que separa un
formulario de un compañero de entreno.

**Propuesta.** Dos gestos, los dos de cliente y sin tocar `domain/`:

- **Temporizador de descanso** que arranca solo al marcar la serie —el momento
  exacto en que el dato existe y nadie tiene que pulsar nada.
- **Repetir la serie anterior de un toque**, que ahorra la mayoría de las
  escrituras porque la mayoría de las series repiten kilos y repeticiones.

### C3 · Cinco destinos y cuatro huecos

**Hoy.** `CLIENT_SECTIONS` declara cinco secciones y `BottomNav` razona muy bien
por qué solo caben cuatro. La consecuencia aritmética es que una está siempre
detrás de «Más». La §4.2 de `producto.md` propone bajar a tres y quedó sin
decidir por falta de datos, con dos portales en producción.

**Propuesta.** Una tercera opción que **no obliga a decidir esa pregunta**: que la
primera entrada de la barra deje de ser una sección y pase a ser *el gesto de
hoy* —«Entrenar» cuando toca sesión, «Entregar la revisión» cuando toca
check-in—. Las demás se quedan como consulta y ninguna se retira, así que no hay
redirecciones nuevas ni hay que elegir entre dos razonamientos escritos. Es lo
que enseña ProCoach en la captura del iPhone, y es coherente con la tesis del
propio proyecto: la unidad es la semana, no el módulo de datos.

---

## D. Lo visual: poco, porque está bien

### D1 · Sin color de marca, la jerarquía se apoya entera en contraste y tamaño

**El coste de la regla.** «El cromo no tiene color» es una decisión correcta y
bien defendida: con nueve series que distinguir, gastar una franja del círculo
cromático en la interfaz se paga dos veces. Pero tiene una factura y conviene
mirarla de frente: en las pantallas densas —Inicio, la ficha— *lo accionable y lo
informativo se distinguen solo por posición*, porque los dos ejes que quedaban
(color y tamaño) están comprometidos con el dato y con la cifra.

**Propuesta.** No romper la regla: usar el eje que le queda libre. El sistema ya
tiene `--surface-sunken`, `--edge` y el juego de rellenos, y hoy se usan como
decoración de agrupación. Convertirlos en gramática: **hundido = te está
esperando; elevado con canto = información**. Una regla más, del mismo tipo que
las que ya funcionan, y sin gastar ni una gota de color.

La brasa se queda donde está —«aquí», pequeña y estructural—: ese trabajo ya lo
hace bien y ampliarlo la convertiría en tema.

> Es lo más discutible de la lista y lo único que no se apoya en una medida.
> Merece verse en pantalla antes que discutirse por escrito.

---

## E. Orden de trabajo

Ordenado por lo que rinde antes, no por lo que impresiona más. Los tres primeros
no tocan `domain/`, no mueven ninguna URL y se pueden parar en cualquier punto.

| # | Qué | Coste | Por qué ahí |
|---|---|---|---|
| 1 | La previsión en Inicio (A2.1) | Días | El dato ya está cargado; es leerlo hacia delante |
| 2 | Los dos gestos del gimnasio (C2) | Días | Lo que más veces al día toca un cliente, y no hay nada que decidir antes |
| 3 | El microciclo y la dieta sin red (C1) | 1–2 semanas | Cierra el camino offline que ya está construido por los dos extremos |
| 4 | Partir `index.css` (B1) | 1 semana | Antes de que llegue nada de lo grande, no después |
| 5 | La biblioteca de estructuras (A2.2) | Semanas | La primera pieza que cambia cuánta gente puede llevar un entrenador |
| 6 | La carga por resumen en las cuatro tablas (B2) | 1 semana | Aquí y no antes: es cuando la biblioteca hace crecer las carteras |
| 7 | El hilo con el cliente (A1) | Un mes | La más cara y la que más retención da; conviene entrar con el resto asentado |

`B3` (terminar la migración de `useApp`) y `B4` (el inspector del editor) no
llevan número: son trabajo de acompañamiento, y el sitio natural de cada uno es
el primer día que se toque el archivo por otro motivo.

---

## F. Lo que no se ha comprobado

- **No se ha ejecutado la aplicación.** Sin `node_modules` en el entorno, nada de
  esto está validado con `npm run check`.
- **Las capturas de `capturas/` son del 21 de agosto** y el lenguaje visual se
  rehízo el 29 (`93ab681`, `d99cadb`, `820fb59`). Todo lo que se dice de la
  interfaz sale del CSS y del JSX actuales, no de esas imágenes.
- **Ninguna propuesta se ha contrastado con uso real.** La condición que
  `producto.md` se puso para su fase 5 —usarla un ciclo entero antes de
  decidir— vale igual aquí.
