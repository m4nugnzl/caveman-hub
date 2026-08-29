# Propuestas de diseño y estructura

> Fecha: 29 de agosto de 2026. Base: `93ab681`.
>
> Sale de comparar el repositorio con las dos referencias guardadas en
> `capturas/referencias/` —Efort Coach y ProCoach— y con las aplicaciones de
> registro de entreno que el cliente ya usa por su cuenta (Hevy, Strong).
>
> **Qué es esto:** una lista de propuestas con su evidencia en el código y un
> orden de trabajo. **Qué NO es:** una decisión.
>
> **Nada de esto está validado con `npm run check`.** Es lectura de código, del
> esquema y de la documentación.
>
> **Corrección (misma fecha).** La primera versión de este documento daba por
> ausentes tres cosas que existen: la triaje de cartera de `portfolio.js`, el
> gesto de repetir la serie anterior y —como decisión tomada, no como olvido— la
> ausencia de mensajería. Estaban mal porque se leyó `domain/today.js` y no
> `domain/portfolio.js`, que es donde vive la mitad importante. Lo que sigue está
> corregido y cada afirmación lleva el archivo donde se comprueba.

---

## 0. Lo que no hay que tocar, y lo que ya está resuelto

La mayor parte. Y conviene ser explícito con lo segundo, porque es donde la
primera versión de este documento se equivocó.

**No se toca:**

- **«Hierro y tiza».** Resuelve un problema que las dos referencias ni se
  plantean —el cromo sin color, para que el círculo cromático quede libre para el
  dato— y con una regla que `verify-styles.mjs` verifica.
- **`domain/`.** Funciones puras, con pruebas, sin React.
- **`lib/saveQueue` y `lib/pendingSaves`.** Cubren el único fallo que pierde
  datos de verdad.

**Y ya está construido, aunque parezca que no:**

- **La triaje de cartera.** `portfolio.js` tiene `BOARD_COLUMNS` (Por revisar ·
  En riesgo · Check-in pendiente · Al día), `INBOX_TASKS` con ocho tareas,
  `PORTFOLIO_FILTERS` y `COLAS_INICIO` —«Por revisar», «Sin programar», «Sin
  señales», «Cobros»— con sus cifras en Inicio y en la chapa de la barra lateral.
  Es, casi pieza por pieza, el panel de Efort. No hay que construirlo.
- **Repetir la serie anterior.** `SetRow` ya lo hace: cuando hay referencia y la
  serie está vacía, la marca es un botón que apunta lo mismo que la vez anterior.
  El comentario del propio archivo lo llama «el gesto de Hevy».
- **El cliente ve sus series previas y sus mejores marcas** mientras entrena
  (`previousSetsBefore`, `bestSetsBefore` en `ClientRoutine`).

---

## A. El producto

### A1 · La conversación está fuera, y es una decisión tomada

**Esto no es un olvido.** `domain/updates.js` lo dice literalmente: «No es una
bandeja de mensajes. La conversación con el cliente es de WhatsApp — ahí hay una
persona». De ahí sale que las novedades del portal no tengan ni un campo de
texto: son dos sellos de tiempo comparados, sin tabla y sin migración.

El argumento es bueno y barato. **Lo que sigue lo contradice**, así que va con
esa etiqueta puesta (regla 20 de `CLAUDE.md`) y no como una propuesta neutra.

**El argumento para revisarlo.** Las dos referencias tratan el chat como pieza de
primer nivel: Efort lo lleva acoplado en todas las pantallas y cuenta
«unanswered chats» en su panel; ProCoach lo vende en su frase principal. Y no es
por moda: mientras la conversación esté fuera, **el contexto del trabajo está
partido en dos sitios**, y el que está fuera no es auditable, no se exporta con
el cliente y no se puede enseñar en un juicio de protección de datos.

**Propuesta, si se revisa.** No un chat: **comentarios anclados a la pieza** —a
esta serie, a esta comida, a esta foto—. Un chat genérico sería un WhatsApp peor
y le daría la razón a `updates.js`. Un comentario que nace de una serie concreta
es lo que WhatsApp no puede hacer.

> La más cara de la lista, la única que contradice una decisión escrita, y la que
> más retención daría si sale bien.

### A2 · Al cliente se le pueden acabar las semanas y nadie avisa

**Lo que hay.** `clientStatus` emite `no_program` cuando el cliente **no tiene
ningún** microciclo, y `stale_training` cuando lleva días sin entrenar. Las dos
alimentan «Sin programar» y «Sin señales» en Inicio. Funciona.

**El hueco, y es estrecho.** `no_program` solo dispara en cero. No hay ninguna
alerta para *«tiene rutina, y se le acaba el domingo»*, que es el trabajo que de
verdad se planifica con antelación. Efort lo trata como su métrica principal
—«New block needed: 10», «Block update needed: 13», con previsión por semanas— y
aquí no existe.

**Y el dato ya está calculado.** `buildPortfolio` expone `weeksProgrammed:
resumen.microcycleCount` en cada fila de la cartera, y **no lo lee nadie**: es la
única propiedad de la fila sin un solo consumidor en todo el repositorio.

**Propuesta.** Una alerta más —`program_ending`— y una cola más en
`COLAS_INICIO`. Es `domain/` puro, encaja en una estructura que ya existe y no
inventa ninguna pantalla.

### A3 · No hay estructuras reutilizables, solo copiar de otro cliente

**Lo que hay.** Biblioteca de *ejercicios* y de *alimentos* (`exercises`,
`catalog_exercises`, `foods`), y `CopyToClientPanel`, que replica de un cliente a
otro el entrenamiento, la dieta y la estructura semanal. Está bien hecho y
resuelve el caso de «montar a uno nuevo como otro que ya tengo».

**El hueco.** No existe un bloque, una semana ni una dieta guardados **con
nombre y sin dueño**. Todo plan es propiedad de un cliente, así que reutilizarlo
obliga a recordar de quién copiarlo. En Efort, «Librería» es entrada de nivel 1,
al lado de Atletas.

**Propuesta.** La biblioteca de estructuras, y **generalizar el lote**: el
«aplicar a todos» de nutrición ya existe y es la forma correcta; falta que valga
para una progresión de entreno o para un ajuste de kcal sobre un subconjunto.

Es la pieza que cambia cuánta gente puede llevar un entrenador, y la única de
esta lista que necesita tabla nueva además de A1.

### A4 · Los veredictos buenos no llegan a la cartera

**Lo que hay.** `domain/reading.js` produce lecturas del tipo «estancado y la
adherencia es del 40 %», y se consumen en `Dashboard`, `Hallazgos` y
`WeekReview`: los tres, **de un cliente**.

**El hueco.** `portfolio.js` no importa `reading.js`. La triaje de cartera es
buena pero se apoya en señales gruesas —sin entrenar, sin rutina, pago vencido—
mientras que la señal fina —*está entrenando y aun así no avanza*— existe,
está probada y no sale nunca de la ficha.

**Propuesta.** Que «En riesgo» pueda dispararse también por estancamiento, no
solo por inactividad. Es agregación de un cálculo hecho, y la regla que sostiene
`Hallazgos` se mantiene: son hechos, no consejos.

---

## B. La estructura, por dentro

### B1 · 13.784 líneas de CSS en un archivo, y la portada dentro

**Medido.** `src/index.css`: 13.784 líneas, 3.355 reglas, cuarenta secciones,
123 `@media`. Las líneas 3.040–6.183 son la portada y el acceso: el 22 %.
El JS ya está partido por rutas con `lazyRoute`; el CSS no está partido por nada.

**El precio real, para no exagerarlo:** unos **50 KB comprimidos**, de los cuales
7,6 son de la portada. *No es un problema de peso.* Es de navegación y de riesgo:
el CSS del escaparate convive con el de la hoja de series.

**Propuesta.** Partirlo por el eje que ya usa el JS, **sin tocar un selector**:
`base/`, el chasis, y un archivo por dominio; `marketing.css` importado desde
`LandingPage.jsx`, que Vite lleva a su propio trozo. Ni un token cambia.

### B2 · La carga perezosa está a un cuarto, y la auditoría la da por hecha

**La discrepancia.** `auditoria.md` 1.5 titula «Se cargan todos los datos de
todos los clientes al arrancar — **CORREGIDO (0024)**». En el código, el arranque
de `AppContext` sigue pidiendo con `.in('client_id', ids)`:

- `anthropometry` — completa, de todos
- `nutrition_plans` — completos, de todos
- `progress_photos` — todas, ordenadas y **sin `limit`**

Lo que 0024 corrigió es `workout_data`, mediante el RPC `training_summaries`.
Una de las cuatro. La auditoría no miente sobre lo que se hizo; sí sobre el
estado.

**Propuesta.** Extender el patrón —que ya está elegido y probado— a las otras
tres, e hidratar el cliente completo al entrar en su ruta. Y actualizar el 1.5,
que hoy dice que esto está cerrado.

### B3 · El corte en tres contextos está hecho, y 38 componentes no lo usan

`AppContext` se partió en sesión, datos y acciones. Pero `useApp()` los vuelve a
fundir, y **38 archivos siguen llamándolo** frente a 12 con los ganchos
estrechos: se repintan con cualquier escritura aunque solo lean una función.

**Propuesta.** Terminar la migración —es mecánica— y cerrarla con
`no-restricted-imports` sobre `useApp` en cuanto llegue a cero. Sin la regla
vuelve solo.

### B4 · Treinta archivos abren una ventana; la referencia usa un inspector

Treinta componentes montan `<Modal>`. Solo el editor de rutina tiene seis:
`BloquePopup`, `ProgresionPopup`, `SensacionesPopup`, `NuevoBloqueDialog`,
`ImportDayDialog` y la comparativa.

Efort resuelve el mismo editor con tres columnas y **un inspector fijo a la
derecha** —historial, equipamiento, tempo, rango de movimiento— sin una sola
ventana.

**Propuesta.** El modal es correcto para una decisión cerrada (`ConfirmProvider`
lo usa bien) y equivocado para *editar mientras miras*, porque tapa lo que hay
que comparar. Pasar a inspector lo que en el editor es consulta.

---

## C. El móvil del cliente

### C1 · Sin cobertura, la aplicación abre — y está vacía

El camino sin red está construido por los dos extremos y le falta el medio. El
service worker precachea el casco con la lista real del build, así que la
aplicación *abre*. `pendingSaves` guarda lo que falta por enviar, así que lo
escrito *no se pierde*. Pero la tercera regla del worker es explícita —Supabase
«ni se toca»—, así que en un sótano el cliente abre la aplicación, la ve pintarse
y **no tiene su sesión**.

**Propuesta.** Cachear **dos objetos**, no inventar un modo sin conexión: el
microciclo activo y el plan de dieta vigente, con la marca de cuándo se vieron.
Es la misma decisión que ya se tomó para lo pendiente de guardar —«una nota de lo
que faltaba», no una base de datos local— aplicada a la lectura.

Es la propuesta con mejor relación entre lo que cuesta y lo que arregla.

### C2 · Falta el temporizador de descanso

Lo demás del registro está resuelto y con criterio: la fila en vez de la tarjeta
cuando escribe el cliente, `inputMode` por campo, objetivo por serie, series
previas, mejores marcas y el botón de repetir la serie anterior.

Lo que no hay es el temporizador de descanso. Y el sitio donde ponerlo ya
existe: `SetRow` sabe el momento exacto en que una serie pasa a estar hecha
(`isSetLogged`), que es cuando el descanso empieza sin que nadie pulse nada.

### C3 · Cinco destinos y cuatro huecos

`CLIENT_SECTIONS` declara cinco secciones y `BottomNav` razona bien por qué solo
caben cuatro: la consecuencia aritmética es que una está siempre detrás de «Más».
La §4.2 de `producto.md` propone bajar a tres y quedó sin decidir.

**Propuesta.** Una tercera opción que no obliga a decidir esa pregunta: que la
primera entrada deje de ser una sección y pase a ser *el gesto de hoy*
—«Entrenar» o «Entregar la revisión» según toque—. Ninguna sección se retira, así
que no hay redirecciones nuevas ni hay que elegir entre dos razonamientos
escritos.

---

## D. Lo visual

### D1 · Sin color de marca, la jerarquía se apoya en contraste y posición

«El cromo no tiene color» es correcto y está bien defendido. Su factura: en las
pantallas densas, *lo accionable y lo informativo se distinguen sobre todo por
posición*, porque los otros dos ejes están comprometidos con el dato y con la
cifra.

**Propuesta.** No romper la regla: usar el eje libre. `--surface-sunken`,
`--edge` y los rellenos ya existen y hoy agrupan; convertirlos en gramática
—hundido = te espera; elevado con canto = información—. Sin gastar color.

> Es lo más discutible del documento y lo único sin una medida detrás. Merece
> verse en pantalla antes que discutirse por escrito.

---

## E. Orden de trabajo

| # | Qué | Coste | Por qué ahí |
|---|---|---|---|
| 1 | El temporizador de descanso (C2) | Días | Único hueco de una pantalla por lo demás resuelta, y el sitio ya existe |
| 2 | `program_ending` y su cola (A2) | Días | `weeksProgrammed` ya está calculado y sin consumidor |
| 3 | El microciclo y la dieta sin red (C1) | 1–2 semanas | Cierra el camino offline construido por los dos extremos |
| 4 | Partir `index.css` (B1) | 1 semana | Antes de que llegue nada grande, no después |
| 5 | El estancamiento en «En riesgo» (A4) | 1 semana | Agregación de un cálculo ya probado |
| 6 | La carga perezosa en las otras tres tablas (B2) | 1 semana | Y corregir el 1.5 de `auditoria.md` |
| 7 | La biblioteca de estructuras (A3) | Semanas | Lo que cambia cuánta gente cabe en una cartera |
| — | El hilo con el cliente (A1) | Un mes | Sin número: contradice una decisión escrita y hay que decidirla antes |

`B3` y `B4` no llevan número: son trabajo de acompañamiento, el primer día que se
toque cada archivo por otro motivo.

---

## F. Lo que no se ha comprobado

- **No se ha ejecutado la aplicación con datos.** El build sí corre y la portada
  se renderiza; las pantallas internas necesitan una sesión de Supabase que no
  hay en el entorno donde se escribió esto.
- **Las capturas de `capturas/` son del 21 de agosto** y el lenguaje visual se
  rehízo el 29 (`93ab681`, `d99cadb`, `820fb59`). Nada de lo que aquí se dice de
  la interfaz sale de esas imágenes.
- **Ninguna propuesta se ha contrastado con uso real**, que es la condición que
  `producto.md` se puso a sí mismo antes de su fase 5.
