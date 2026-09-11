# Estudio · El portapapeles, de utillaje a herramienta

**10 sep 2026.** Encargo: *«analiza bien el proyecto de portapapeles de Efort y
estudia cómo implementar algo bien pulido e integrado que nos permita dotar al
entrenador de mucha versatilidad y funcionalidad, de manera sencilla e
intuitiva.»*

> El mismo estudio, con las pantallas dibujadas y el antes/después:
> **`docs/portapapeles-antes-y-despues.html`**.
>
> Y la **tercera vuelta —cómo entra en la app sin estorbar—**, con el prototipo
> clicable: **`docs/portapapeles-integracion.html`**. Ver §13.

Lo que hay hoy en el árbol (sin commitear) es la **v1**: el almacén, la bandeja
y cinco tipos que viajan. Funciona y está probada. Este estudio no la
reescribe: dice **qué le falta para ser una herramienta** en vez de un sitio
donde se guardan cosas, con la evidencia de las capturas de Efort de un lado y
la del código del otro.

---

## 1. El portapapeles de Efort, leído de sus capturas

Fuente: `capturas/referencias/efortcoach/entrenamiento/` y `.../dieta/`.
No tienen «un portapapeles». Tienen **dos familias de gestos distintas**, y
conviene no confundirlas porque solo una de las dos nos interesa entera.

### Familia A · El utillaje del lienzo (⧉ en cuatro niveles)

    Week 1 · Oct 13-18        👁 ✎ ⧉ 🗑      <- copiar SEMANA
    ┌ Day 1 · Oct 13   ✎ ⧉ ··· ┐              <- copiar DÍA
    │ ⠿ 2ct Pause Bench Press  ⧉ ··· │        <- copiar EJERCICIO
    │ ⌾  P  WEIGHT REPS RPE  ⧉ ▢ ACTUAL │    <- copiar SERIES («Copy sets»)
    └ + Add exercise   ⧉   ⌃ ⌄   🗑 ┘         <- PEGAR, al lado del alta

Cuatro cosas que aprender de ahí, y una que no:

1. **El ⧉ está siempre visible, en la cabecera de cada pieza.** No es un ítem
   de menú. Copiar es un clic y no dos, porque copiar no es una decisión: es el
   principio de una.
2. **Hay una granularidad por debajo del ejercicio: la PAUTA.** «Copy sets»
   copia el esquema de series de un ejercicio *a otro ejercicio distinto*, y el
   destino conserva su nombre. Es su gesto más vendido —tiene lámina propia— y
   es el que más se usa al programar: *«el remo, con la misma progresión que el
   press»*.
3. **Pegar es un botón fijo, y vive pegado al «+ Add exercise».** El sitio donde
   se añade algo es el sitio donde se pega algo. Eso ya lo hicimos bien.
4. **La barra flotante al pie del día** junta copiar · plegar · papelera: el
   utillaje del lienzo tiene un sitio propio y no anda repartido.
5. Lo que **NO** hay que aprender: la cantidad. Su modelo duplica la semana
   (§3 de `estudio-efort-septiembre.md`: la semana 1 dice `Ramp 3x4 @6` y la 2
   dice otro texto independiente), así que **necesita** copiar semanas para
   sobrevivir. El nuestro escribe la hoja una vez en el bloque y la varía por
   tramos. Importar «copiar semana» sería importarnos su avería.

### Familia B · La asignación a varios («Send it to your athlete»)

La lámina 05 de la dieta es otra cosa, y es la importante:

    High Carb Training Day                                          ✕
    Select athletes to assign this nutrition plan to.
    ┌ buscador ──────────────┐  SELECTED 3
    │ ✓ Abigail Cook         │  [Abigail ✕] [Benjamin ✕] [James ✕]
    │   Alexander Evans      │
    │ ✓ Benjamin Wright      │  James Anderson's plans
    │   Caleb Bailey         │   ● ACTIVE 2: High Carb TD · Training Day Var I
    └────────────────────────┘   · LAST ARCHIVED 4
                                          [Cancel]  [Save changes]

Tres decisiones suyas que son buenas y que no tenemos:

- **Un plan se pone a N personas en un gesto**, no una por una.
- **Se ve lo que cada destinatario ya tiene** antes de guardar. Nadie pega a
  ciegas encima del trabajo hecho.
- El plan queda como objeto con estado (*activo / archivado*) en cada atleta.

**Conclusión del análisis:** de Efort hay que traerse **la granularidad de la
pauta** (familia A) y **la asignación a varios con sus consecuencias a la
vista** (familia B). El resto de su utillaje es el parche de un modelo peor que
el nuestro.

---

## 2. Lo nuestro hoy, verificado en el código

| Pieza | Dónde está |
|---|---|
| Almacén | `lib/portapapeles.js` — `useSyncExternalStore` sobre `localStorage`, 12 piezas, tope 1 MB, oyente de `storage` para la otra pestaña |
| Tipos que viajan | ejercicio · hoja · bloque · comida · día de dieta (el microciclo **no**, y está razonado) |
| Bandeja | `ui/Portapapeles.jsx`, flotando abajo a la derecha, solo con algo dentro |
| Copiar | ⧉ en la fila del ejercicio (`HojaDeSeries`), ⧉ en la hoja (`ConjuntoDelBloque`), bloque y menú de dieta desde su menú, comida desde el «···» de `MealCard`, y plantilla → portapapeles (`PlantillasPanel`) |
| Pegar | dentro de «+ hoja», «+ bloque», «+ comida» y en el botón «Pegar» del alta de ejercicio |
| Atajos | ⌘C/⌘V sobre el ejercicio en foco, solo en Entreno |

Es una base sana. Lo que sigue son los huecos.

---

## 3. Ocho huecos, con su evidencia

**H-01 · La bandeja enseña y no hace.** Es lo único visible del sistema y su
único verbo es «Quitar». El verbo que importa vive dentro de un menú «+», tres
clics más allá y en otra esquina de la pantalla. *(Está razonado en el
componente: «no pega, pegar es del destino». El razonamiento es correcto contra
un botón «Pegar» que adivine el destino; no lo es contra un destino que se
presenta. Ver PP-01.)*

**H-02 · La pauta no viaja.** `onCopiar` en `HojaDeSeries.jsx:467` copia el
ejercicio entero, y pegarlo crea **otro** ejercicio (`addPlanExercise`). El
gesto de Efort —darle a este remo las series del press— hoy es: pegar el press,
renombrarlo a mano, borrar el remo. Tres pasos para el gesto más común de
programar. Es el hueco G-08 del estudio de septiembre, todavía abierto.

**H-03 · No se puede poner a varios.** La barra del lote de la cartera sabe
mandar, avisar, etiquetar y pausar. No sabe **poner**. Y esta es la mejor mano
que tenemos: como nuestra hoja es *plan* y no *registro*, pegarla en diez
clientes es barato y seguro. Efort ya lo hace con la dieta.

**H-04 · Cuatro puertas para lo mismo, y no se conocen.** Portapapeles ·
`CopyToClientPanel` (traer de otro cliente, **sustituye**) · `ImportDayDialog` /
`PastePlanDialog` (traer de un fichero) · plantillas. Ninguna desemboca en otra.
Y el puente con plantillas solo va en un sentido: plantilla → portapapeles sí,
portapapeles → plantilla no.

**H-05 · Pegar no se deshace.** `ToastProvider` acepta
`action: { label: 'Deshacer' }` y está documentado como la pareja honesta de
«sin confirmación». Ninguno de los cinco pegados lo usa. Pegar un menú son seis
comidas al final de la lista; deshacerlo, seis clics.

**H-06 · La dieta va por detrás.** Copiar una comida es un ítem de menú (no un
⧉ a la vista), no hay ⌘C/⌘V, y `pegarComida` solo añade al final: no se puede
pegar una comida **como otra opción** de una comida existente, que es
exactamente lo que la estructura de opciones pide.

**H-07 · Se pega a ciegas.** La pieza dice «Lower A · hoja · 6 ejercicios ·
Marta». No hay forma de mirar qué lleva dentro. Con doce piezas y tres «Lower
A», eso ya cuesta; con H-03 en marcha —poner esto en diez personas— es
inaceptable.

**H-08 · La bandeja y el mostrador del lote se pisan.** Las dos son `fixed`,
`z-index: 120`, al pie: `.p-lote` centrada con hasta 760 px y `.pp-bandeja` a la
derecha con 320. Por debajo de ~1200 px de ancho se solapan, y en el teléfono
las dos ocupan el pie a ancho completo. Y coincidir es el caso normal: marcar
clientes con una hoja copiada es justo el gesto de H-03.

---

## 4. Las tres leyes que debe cumplir lo que se construya

1. **Copiar es un clic; pegar dice dónde cae.** Copiar no se pregunta. Pegar
   siempre nombra el destino («Pegar en Acumulación»), nunca es un «Pegar» a
   secas.
2. **Lo que escribe en el programa de alguien se ve antes y se deshace
   después.** La lista de consecuencias por persona antes de pulsar; el
   «Deshacer» en el aviso, después.
3. **Pedir no es poner.** `MandarAlgo` reparte deberes; esto instala plan. Misma
   gramática de pasos, verbos distintos y diálogos distintos.

---

## 5. El plan, en tres tandas

### Tanda 1 · Que se pegue donde estás  *(lo pulido)*

**PP-01 · Destinos que se presentan.** `lib/portapapeles` gana un registro de
destinos, vivo y fuera de React igual que las piezas:
`registrarDestino({ tipos, etiqueta, pegar })`, que cada pantalla monta y suelta
en un efecto. La bandeja pinta el verbo **en azul** (ley de los gestos) solo en
las piezas que el destino registrado acepta, y con su nombre:
«Pegar en Acumulación» · «Pegar en Lower A» · «Pegar en el menú de entreno».
Sin destino registrado, la bandeja es exactamente lo que es hoy. Los destinos
son una pila: manda el más específico, que es el último montado (la hoja abierta
gana al bloque).

**PP-02 · La pauta viaja.** Sexto tipo, `TIPO.PAUTA`: las series sin nombre ni
identidad —objetivos, descanso, remate—. Se copia desde el menú del ejercicio
(«Copiar solo las series») y se pega **sobre otro ejercicio** («Ponerle estas
series»), que conserva su nombre. Cuidado de dominio: cae en el mismo tramo que
se esté editando (`tramoDeAlta`), o un retoque puntual ascendería a norma sin
que nadie lo pida.

**PP-03 · Deshacer al pegar.** Cada verbo de pegar devuelve cómo se deshace y el
aviso lo ofrece. Es una línea por sitio y quita cinco confirmaciones futuras.

### Tanda 2 · Que llegue a varios  *(la versatilidad)*

**PP-04 · «Poner esto en…».** Desde la pieza de la bandeja. Ventana con la pieza
arriba, las audiencias que **ya existen y están probadas** (`AUDIENCIAS` y
`destinatarios` de `domain/envios`: marcados · con una etiqueta · de un
protocolo · todos los activos) y, debajo, **la lista de consecuencias, una por
persona**:

    Poner «Lower A» (6 ejercicios) en 4 clientes
    ├ Marta      se añade al bloque «Acumulación»
    ├ Luis       no tiene bloque abierto → se le abre «Lower A»
    ├ Ana        ya tiene una hoja «Lower A» → entra como «Lower A (2)»
    └ Ruth       en pausa · no se toca
                                        [Cancelar]  [Ponerlo en 3]

Es la lámina 05 de Efort, hecha mejor: ellos enseñan lo que el atleta ya tiene,
nosotros enseñamos **lo que va a pasar**. El bloque exige confirmación aparte
—cierra el bloque abierto de cada uno—; hoja, ejercicio, comida y menú, no.

**PP-05 · Guardar en plantillas desde la bandeja.** Cierra el círculo con una
línea: *portapapeles = lo que llevas encima; plantillas = lo que guardas con
nombre*. Hoy solo se puede ir de la segunda a la primera.

### Tanda 3 · Que sea uno solo  *(la integración)*

**PP-06 · Las otras puertas desembocan aquí.** «Traer de un fichero» deja lo
importado **como pieza** en vez de escribir directo; el «+ hoja» ordena sus
opciones por lo que hay copiado. La réplica cliente→cliente se queda como está
—sustituye el programa entero, no es una pieza— pero se le nombra la diferencia
para que dejen de parecer lo mismo.

**PP-07 · La dieta con los mismos gestos.** ⧉ a la vista en la comida, ⌘C/⌘V
sobre la comida en foco, y pegar una comida **como otra opción** de una
existente.

**PP-08 · Arrastrar desde la bandeja** (solo puntero fino). Se apoya en PP-01:
lo que se ilumina al arrastrar es lo registrado. Va el último porque sin
destinos no hay dónde soltar.

**PP-09 · Ver lo que llevas.** La pieza se despliega y enseña sus cinco primeras
líneas. Requisito de PP-04, no adorno.

**PP-10 · Que no se pisen.** Bandeja y mostrador del lote comparten pie: o la
bandeja se aparta cuando hay lote, o las dos se apilan en una sola columna a la
derecha. Decidirlo con la captura delante.

---

## 6. Lo que este estudio NO propone

- **Copiar semanas / microciclos.** Ya está razonado: en nuestro modelo eso es
  calendario e historial. Lo que la gente quiere decir con «copia esta semana»
  son sus hojas, y las hojas viajan.
- **Sincronizar el portapapeles entre aparatos.** Lo que llevas en la mano no es
  un dato de la cuenta.
- **Tocar `navigator.clipboard`.** Lo copiado son objetos, no texto.
- **Programar el pegado a futuro** («ponle esto dentro de dos semanas»). Es otra
  cosa —planificación— y es de otra fase.

---

## 7. Las decisiones que hacen falta antes de construir

1. **¿La bandeja pega (PP-01)?** Es lo que la convierte en herramienta, y
   matiza una decisión escrita en el componente.
2. **¿Poner a varios sale de la bandeja o de la barra del lote (PP-04)?** Desde
   la bandeja: primero eliges qué y luego a quién, como `MandarAlgo`. Desde el
   lote: al revés. Recomendación: **desde la bandeja**, por coherencia con la
   línea de acciones — y el lote se enchufa como audiencia «a los que marqué».
3. **¿La pauta es un tipo del portapapeles o un gesto local (PP-02)?**
   Recomendación: **tipo**. Así el press de Marta le pone las series al remo de
   Luis, y eso es precisamente lo que Efort no puede hacer.

---
---

# SEGUNDA VUELTA · El mapa de destinos

El dueño contesta a la pregunta 1 con otra pregunta, que es la buena:

> *«No sé, estudíalo bien. La idea era poder pegar cosas allá donde se pueda:
> por ejemplo plantillas o cosas, pero no sé si con la función de guardado tiene
> sentido; o pegárselo a otros clientes, o pegar estructuras en otras semanas,
> cosas así.»*

O sea: antes de decidir si la bandeja pega, hay que saber **cuántos sitios hay
donde pegar**. Esta parte los cuenta todos.

## 8. La avería que salió al contarlos

**Pegar un ejercicio revienta.** `WorkoutLogEditor.jsx:1072` llama a
`tramoDeAlta(null)`, y esa función es `({ semanas } = {}) => …`: el valor por
defecto solo cubre `undefined`, así que desestructurar `null` lanza
`TypeError: Cannot destructure property 'semanas' of 'null'`. Reproducido en
`node`. Afecta al botón «Pegar» del alta y también a ⌘V, que pasa por el mismo
verbo. El otro camino a esa función (`AddExerciseForm`, líneas 2196 y 2210)
manda siempre `{ semanas: … }`, y por eso el alta normal funciona.

Arreglo: `tramoDeAlta()` sin argumento, o `{}`. Una línea. Pero el fallo señala
algo de diseño, y es justo lo que el dueño pregunta: **el pegado se escribió
como si no tuviera que decidir tramo, y sí tiene que decidirlo.** Ver §10.

## 9. El mapa: dónde se puede pegar cada cosa

| Pieza | Destino | Qué pasa al soltarla | Hoy |
|---|---|---|---|
| **Pauta** *(nueva)* | un ejercicio de una hoja | le pone esas series y conserva su nombre | no existe |
| **Ejercicio** | la hoja abierta | se añade, **con su «hasta cuándo»** (§10) | sí, sin tramo y **roto** (§8) |
| **Ejercicio** | tu Librería | — la Librería guarda la ficha (vídeo, pauta de ejecución), no las series de un cliente | no, y no debe |
| **Hoja** | el cajón del bloque | hoja nueva, con nombre libre | sí |
| **Hoja** | **sobre un día que ya existe** | sustituye sus ejercicios; con tramo, solo esas semanas | no |
| **Hoja** | plantillas (tu cajón) | se **guarda** con nombre, no se pega (§11) | no |
| **Hoja** | varios clientes | la reciben todos, con la lista de consecuencias delante | no |
| **Bloque** | la tira de bloques | cierra el abierto y empieza uno nuevo con sus hojas | sí, con confirmación |
| **Bloque** | plantillas | — **no hay cajón de bloques**: plantillas guarda días y platos | decisión pendiente |
| **Comida** | el menú de la dieta | al final, o **como otra opción** de una comida existente | solo al final |
| **Comida** | la otra variante (entreno ↔ descanso) | ya hay un camino propio: «copiar el menú de la otra» | parcial |
| **Comida** | platos (la vitrina) | — un plato es una ración, el interior de una opción; una comida es otra cosa | no, y está razonado |
| **Menú del día** | el menú de la dieta | añade sus comidas al final | sí |
| **Menú del día** | varios clientes | igual que la hoja | no |
| **Microciclo** | — | no viaja: es calendario e historial | razonado, se mantiene |
| **Formulario · protocolo** | — | son objetos del entrenador y ya tienen «Duplicar» | no hace falta |

**Salen siete destinos vivos** (tres de ellos no existen todavía) repartidos por
cinco pantallas. Y ese número es la respuesta a la pregunta 1: con siete sitios
donde algo puede caer, **nadie se acuerda de cuál acepta qué**. Ahí es donde la
bandeja deja de ser un escaparate: no para adivinar el destino, sino para
**enseñar el que hay delante** («Pegar en Acumulación») y callarse cuando no hay
ninguno. Un menú «+» no puede hacer eso, porque para leerlo hay que abrirlo.

## 10. «Pegar estructuras en otras semanas»: el tramo es una pregunta del pegado

Esto en nuestro modelo no es un tipo nuevo ni un destino nuevo: es **una
pregunta que el pegado no está haciendo**.

Añadir un ejercicio desde la hoja ya la hace, y con tres respuestas escritas
(`AddExerciseForm`, «Hasta cuándo»):

    ○ En el bloque, mientras dure     → entra en el plan: lo ven todos los microciclos
    ○ Unas semanas, a prueba          → tres microciclos desde este, y vuelve solo
    ○ Solo este microciclo            → excepción; el bloque no se toca

Por debajo son `addPlanExercise(…, { hasta })`: sin `hasta` escribe en
`block.sessions`; con `hasta` crea un `override` con su tramo. **Pegar tiene que
hacer exactamente la misma pregunta**, porque es el otro camino al mismo sitio
—y hoy no la hace: pasa `null`, que además revienta—.

Con eso, «pegar una estructura en otras semanas» ya se puede decir en el
producto: copias el press del bloque de Marta, lo pegas en el de Luis y eliges
«solo M3» o «de M3 a M5». Efort no puede: para ellos cada semana es un texto
aparte y por eso su respuesta es duplicar. **La nuestra es el tramo, y ya está
construida** — solo hay que enchufarla al pegado.

Dónde **no** se ofrece el tramo, y por qué:

- **Hoja nueva**: una hoja no es de una semana; nace en el plan del bloque. El
  tramo solo tiene sentido al pegar **sobre** un día que ya existe («este día,
  distinto, de M3 a M5»).
- **Bloque**: empieza un bloque entero; el tramo es el bloque.
- **Dieta**: la dieta no tiene bloques ni microciclos. Ahí el eje equivalente es
  la variante (entreno / descanso), no la semana.

## 11. Guardar no es pegar (la frontera con plantillas)

La duda del dueño —*«no sé si con la función de guardado tiene sentido»*— se
resuelve con una regla, no con un botón:

- **Guardar** → a **tu** cajón, con nombre, para siempre. No toca a nadie.
- **Pegar** → al trabajo de **una** persona, ahora, y se puede deshacer.
- **Poner en varios** → lo mismo, a N personas, con las consecuencias delante.

Son tres verbos con tres significados distintos, y los tres caben en la misma
pieza de la bandeja porque los tres empiezan igual: teniendo algo en la mano.
Lo que **no** cabe es llamar «pegar» a guardar: pegar tiene destino y
consecuencia; guardar, ni una cosa ni la otra.

Con esa regla, el puente que falta es corto —hoja copiada → «Guardar en
plantillas»— y cierra el círculo que hoy solo gira en un sentido. Pero deja una
decisión de producto encima de la mesa: **plantillas guarda días y platos**, y
el portapapeles lleva además bloques, ejercicios y menús. O la bandeja solo
ofrece guardar lo que tiene cajón (hoja → días), o hay que abrir cajón para
bloques y menús. El primero es honesto y cabe hoy; el segundo es una biblioteca
de programas, que es otra pieza de producto y de otra fase.

## 12. El plan, renumerado tras esta vuelta

Esta lista **sustituye a la numeración de §5** y es la que usa
`docs/portapapeles-antes-y-despues.html`. Catorce movimientos, tres tandas; cada
tanda se puede parar y lo anterior sigue siendo coherente.

### Tanda 1 · Que se pegue donde estás

| | Movimiento |
|---|---|
| **PP-00** | **La avería.** `tramoDeAlta()`. Una línea, y va delante de todo. |
| **PP-01** | **Destinos que se presentan.** La pantalla registra qué acepta; la bandeja enciende el verbo en azul con el nombre del sitio. |
| **PP-02** | **La pauta viaja.** Sexto tipo; se pega sobre otro ejercicio, que conserva su nombre. |
| **PP-03** | **El tramo del pegado.** Las tres respuestas del alta, también al pegar (§10). |
| **PP-04** | **Deshacer.** El aviso ya sabe hacerlo; ninguno de los cinco pegados lo usa. |

### Tanda 2 · Que llegue a varios

| | Movimiento |
|---|---|
| **PP-05** | **«Poner esto en…»** desde la bandeja, con las audiencias de `domain/envios`. |
| **PP-06** | **La lista de consecuencias** por persona antes de pulsar. El bloque, aparte y con pregunta. |
| **PP-07** | **Guardar en plantillas** desde la bandeja, y solo los tipos que tienen cajón (§11). |
| **PP-08** | **Ver lo que llevas.** La pieza se despliega. Requisito de PP-05, no adorno. |

### Tanda 3 · Que sea uno solo

| | Movimiento |
|---|---|
| **PP-09** | **Pegar sobre un día que ya existe** (sustituir la hoja, con tramo). |
| **PP-10** | **La dieta al día:** ⧉ a la vista, ⌘C/⌘V, y pegar una comida **como otra opción**. |
| **PP-11** | **Las otras puertas.** «Traer de un fichero» deja la pieza en el portapapeles en vez de escribir directo. |
| **PP-12** | **Arrastrar** desde la bandeja, solo con puntero fino y apoyado en PP-01. |
| **PP-13** | **Que no se pisen.** Bandeja y mostrador del lote comparten pie y `z-index` (H-08). |

---
---

# TERCERA VUELTA · La integración

El dueño da el visto bueno al estudio y pone la condición:

> *«Hay que ver cómo integrarlo correctamente para que no se solape con otras
> cosas, no sea complicado para el entrenador de entender, no moleste, y sea una
> herramienta sencilla, visual, bien diseñada, natural para el usuario, útil e
> intuitiva.»*

El prototipo clicable con los tokens reales está en
`docs/portapapeles-integracion.html`: cuatro pantallas, se copia, se navega y se
pega, y trae las tres variantes de reposo para poder compararlas.

## 13. Lo que estorba hoy, medido en el CSS

1. **La bandeja nace abierta y no se cierra sola.** Aparece desplegada con la
   primera pieza y sigue así hasta que se vacía: 320 × ~250 px sobre el trabajo,
   en todas las pantallas del entrenador, haya o no dónde pegar. Y su único
   verbo sigue siendo «Quitar».
2. **El pie es de tres, y dos van al mismo sitio.** `.p-lote` (centrado, hasta
   760 px) y `.pp-bandeja` (derecha, 320) comparten `bottom: 22px` y
   `z-index: 120`. Se pisan por debajo de **1 444 px** de ventana con el
   mostrador a su ancho máximo, y por debajo de **1 284** con uno de 600 —un
   portátil normal—. El aviso (`.toast`, z 400) cae encima de los dos.
3. **En el teléfono tapa la barra del pulgar.** `.pp-bandeja` va a
   `bottom: 12px` a ancho completo con `z-index` 120 contra los 90 de
   `.bottombar`: **56 px de destinos de navegación tapados**. El aviso y el «+»
   flotante sí se apartan con `calc(var(--bottombar-h) + …)`; la bandeja se
   olvidó. Esto es una avería, no un gusto.

## 14. La idea: no es un cajón, es una mano

El fallo de origen es de categoría. La bandeja está **dibujada como un sitio**
—superficie, cabecera, lista, canto— cuando lo que representa es **lo que llevas
en la mano**: dos o tres cosas, un rato, de camino a otro lado. Un sitio pide
superficie; una mano pide peso, y el peso se dice con un número.

La frontera ya estaba escrita en [[portapapeles-y-riel]] y solo faltaba llevarla
al dibujo: **plantillas es el cajón** —lo que guardas con nombre y para siempre—
y **el portapapeles es la mano** —lo que llevas encima ahora—. Si las dos se
dibujan como un panel, hay que aprender cuál es cuál; si una es panel y la otra
una píldora, no hay nada que aprender.

## 15. Las cinco leyes de la integración

| | Ley | Qué resuelve |
|---|---|---|
| **I** | **La mano se ve; el cajón se abre.** En reposo, una píldora: «Llevas 3». La lista está a un clic, hacia arriba, y se cierra al usarla. | «Que no moleste» |
| **II** | **El aviso es de lo que cambia; la mano, de lo que llevas.** Copiar deja de sacar aviso: la mano nombra dos segundos lo que ha entrado y se calla. Pegar sí lo saca, con «Deshacer». | Dos voces para un gesto |
| **III** | **Un mostrador a la vez.** El centro del pie es del lote; la esquina derecha, de la mano. Con el mostrador levantado, la mano **se apoya encima de él**. | El solape (§13.2) |
| **IV** | **Callarse es la mitad del trabajo.** Sin destino, la mano está en gris y no propone nada. En el teléfono, sin destino **no aparece**. | El solape del móvil (§13.3) |
| **V** | **Pegar nombra el sitio y lo que cae.** «Pegar «Sentadilla» en Lower A», nunca un «Pegar» a secas. Caja encendida y verbo en azul: la ley de los gestos, sin inventar forma. | «Que sea intuitiva» |

La ley II es la que quita ruido de verdad: hoy copiar saca un aviso que dice lo
mismo que la bandeja, y son dos voces para un gesto que no le cambia nada a
nadie. Ver [[propuesta-una-sola-voz]].

## 16. Cómo se reparte el pie, en concreto

- El mostrador del lote publica su alto (`--lote-alto`, con un
  `ResizeObserver`) y la mano se apoya encima. Así no hay ancho de ventana en el
  que se pisen, y no hace falta ninguna media query con número mágico.
- En el teléfono, la mano usa el desplazamiento que ya usan el aviso y el «+»
  flotante: `calc(var(--bottombar-h) + var(--safe-b) + var(--s3))`. Y con la
  regla IV casi nunca está.
- `.pp-bandeja` se parte en dos piezas: `.pp-mano` (la píldora) y `.pp-cajon`
  (la lista). El almacén, los cinco tipos y los sitios donde se copia no se
  tocan: la v1 se queda entera.

## 17. Las tres decisiones de esta vuelta

1. **El reposo:** ¿píldora al pie (A), bolsillo en la barra (B) o como hoy (C)?
   B no se pisa con nada nunca, pero deja el verbo a 900 px de donde cae la
   cosa. Recomendación: **A**.
2. **El aviso al copiar:** ¿se retira, y lo dice solo la mano (ley II)?
   Recomendación: **sí**.
3. **Un clic o dos:** la píldora pega de un clic **lo último que acepte el
   destino**, y el número abre la lista para elegir otra. La alternativa —abrir
   siempre la lista— es más honesta con varias piezas y un clic más en el caso
   normal. Recomendación: **un clic**.

---

# CUARTA VUELTA · El veredicto, y lo construido

**10 sep 2026.** El dueño elige la **A** —la píldora al pie— con una condición:

> *«Que no sea intrusiva ni molesta, que sea sencilla e intuitiva, que aporte y
> no sea engorroso.»*

## 18. Las otras dos decisiones, resueltas por esa condición

Las decisiones 2 y 3 de §17 no hacía falta preguntarlas por separado: la
condición las contesta.

| | Decisión | Resuelto | Por qué |
|---|---|---|---|
| **2** | ¿Se retira el aviso al copiar? | **Sí** | Hoy salen dos voces para un gesto que no le cambia nada a nadie. Retirarlo es literalmente «que no moleste». |
| **3** | ¿Un clic o dos? | **Un clic** | El caso normal es copiar algo y pegarlo en el siguiente sitio al que se llega. Obligar a abrir una lista de una sola pieza que cabe es lo que «engorroso» significa. El número, al lado, sigue abriendo la lista para elegir otra. |

## 19. Lo que se ha construido

Las cinco leyes de §15, con la numeración del plan de §12 en lo que toca:

- **PP-01 · Destinos que se presentan.** `lib/portapapeles` gana el registro:
  `registrarDestino({ tipos, donde, verbo, prioridad, pegar })`, el gancho
  `useDestino` y la pieza `<Destino>` que lo monta desde el árbol. Es una pila
  con **prioridad declarada, no deducida del orden de montaje** —los efectos de
  un hijo corren antes que los del padre, así que el contenedor ganaría justo al
  revés de lo que hace falta—. Registrados: la hoja abierta (ejercicio,
  prioridad 1), el bloque a la vista (hoja, prioridad 0) y el menú de la dieta
  (comida y día de dieta). El bloque copiado **no** se registra: pegarlo cierra
  el que está abierto y eso es una conversación, no un clic al pie.
- **La bandeja se parte en dos.** `.pp-mano` (píldora) y `.pp-cajon` (lista).
  El componente pasa a llamarse `ManoDelPortapapeles`.
- **Ley II.** Los cinco avisos de copiar se retiran —hoja, ejercicio, bloque,
  comida, menú y la plantilla del Taller—. Lo dice la mano dos segundos. Los
  avisos de «no hay nada que copiar» se quedan: son de algo que NO ha pasado.
- **Ley III.** `.p-lote` publica `--lote-apoyo` con un `ResizeObserver` (su alto
  más el aire) y la mano se apoya encima. Sin mostrador, la variable no existe y
  el `calc` cae a cero. Ninguna media query con número medido a ojo.
- **Ley IV.** Sin destino la mano está en gris; en el teléfono, `display: none`.
  Y deja de tapar los 56 px de la barra del pulgar: usa el mismo desplazamiento
  que el aviso y el «+» flotante.
- **Ley V.** «Pegar «Sentadilla» en Lower A», con la caja encendida y el verbo
  en azul — que es `border-color: var(--accent)` + `background: var(--accent-soft)`,
  la misma forma que `.opt-card.is-on` y `.proto-preset[aria-pressed]`. No se
  inventa una forma para esta pantalla.

Las láminas con los tokens reales, en claro y en oscuro:
`docs/portapapeles-mano-claro.png` y `docs/portapapeles-mano-oscuro.png`.

## 20. Lo que sigue pendiente

Del plan de §12, sin tocar: **PP-02** (la pauta viaja), **PP-03** (el tramo del
pegado), **PP-04** (deshacer al pegar), la **tanda 2 entera** (poner en varios,
guardar en plantillas desde la mano, ver lo que llevas) y **PP-09…PP-12**.

`useDestino` es además la pieza que faltaba para PP-12 (arrastrar): lo que se
ilumina al arrastrar es lo registrado.

## 21. La corrección: el peso se queda, la oferta se apaga

Con la A construida y en la app de verdad, el dueño la tumba:

> *«Quizás lo siento demasiado intrusivo, siempre está ahí; donde se puede pegar
> nunca para. Y para vaciar el portapapeles es incómodo.»*

Tenía razón, y las tres quejas son **una sola avería de categoría**: se habían
mezclado dos cosas que no pesan igual.

| | Qué es | Cuánto dura | Cómo se dice |
|---|---|---|---|
| Lo que llevas | un **hecho** | mientras lo lleves | un icono y una cifra, sin color |
| Que aquí quepa | una **oferta** | un momento | la frase entera, en azul |

La versión anterior decía la oferta con la permanencia del hecho: verbo largo,
caja azul, esquina de la pantalla, en todas las pantallas donde cupiera algo y
hasta que dejara de caber. **Una oferta que no se apaga deja de ser oferta: es
mobiliario.**

**La ley ya estaba escrita y era de esta misma casa.** `.plantilla .p-marca`, en
`superficies.css`: las casillas de selección de la cartera «en reposo no están»
—trece cuadros vacíos por el canto izquierdo eran lo primero que veía el ojo—,
aparecen al acercarse y se quedan puestas las marcadas, apagadas con `opacity` y
no con `visibility` para que el ratón y el tabulador sigan llegando. Aplicada
aquí, sin inventar nada:

- **En reposo:** `[📋 3]`, **83 px** (antes 297). Sin verbo, sin color, sin
  «vaciar». Igual en todas las pantallas.
- **Que aquí cabe algo:** en reposo solo lo dice **la cifra en acento**. Nada
  más.
- **Al llegar** a un sitio donde cabe: la oferta se enseña **2,6 s** y se calla.
  Y solo en el **canto** —de «aquí no cabe» a «aquí cabe»—, así que recorrer las
  cuatro hojas de un bloque con un ejercicio copiado no la repite cuatro veces,
  que era literalmente el «nunca para».
- **Al acercarse** (y con el foco del teclado dentro): vuelve el verbo, sale el
  «vaciar», y la caja se enciende. 296 px mientras el puntero está encima.
- **En el táctil no hay acercarse**, así que la mano se queda en su peso y lo
  que se puede hacer vive dentro del cajón, donde cada fila que cabe lleva su
  «Pegar aquí». Sin la guarda de `@media (hover: none)`, tocar la píldora la
  dejaría desplegada hasta tocar en otro sitio.

**Y vaciar deja de estar escondido.** Costaba dos gestos y el primero era abrir
una lista para no mirarla. Ahora el «✕» está en la propia mano, al lado de la
cifra, con la misma ley: en reposo no está. No pregunta, porque no borra nada
del programa de nadie — solo deja de llevarlo.

Las láminas de los cinco estados: `docs/portapapeles-mano-claro.png` y
`docs/portapapeles-mano-oscuro.png`.

**La lección, otra vez la misma:** las dos versiones que fallaron inventaron una
forma para esta pieza. La que valió fue buscar qué ley de la casa se estaba
rompiendo. Aquí era «en reposo no está», escrita hace meses para trece casillas
de una tabla.

---

# QUINTA VUELTA · El cajón de bloques

**10 sep 2026.** El dueño prueba la mano con un bloque en ella y salen tres
quejas:

> *«Copio un bloque y no puedo llevarlo a plantilla y pegarlo. Entro en otro
> cliente que no tiene bloques y no me sale "pegar bloque"; sin embargo le doy
> a + y sí me sale pegar bloque copiado, eso quizás es un poco redundante.»*

Y dos decisiones:

> *«Copiar bloques como estructuras para mí tiene sentido. Es posible que traer
> de otro cliente sí son redundancias; el cajón deberías plantearlo bien.»*

*(Las §22 y §23 —la forma prestada que no viaja de lo fijo a lo que flota, y
«una pieza no se elige»— son las dos correcciones de la mano del 10 de
septiembre; están en el código, no en este documento. Esta vuelta arranca en el
24 para no pisarlas.)*

## 24. Lo primero: hoy no viaja una estructura, viajan unas hojas

Antes de decidir dónde se guarda un bloque hay que mirar **qué es un bloque
cuando se mueve**, porque el cajón guardará exactamente eso.

`domain/blocks.js:706` llama a tres cosas «las características del bloque»:
`intent` (a qué juega), `plannedWeeks` (cuánto se previó) y `note` (qué se
persigue). Son las que el Compositor pide en su cabecera y las que
`startBlockWithPlan` acepta (`useWorkout.js:1053`).

Los tres caminos por los que un bloque sale hoy de un cliente las tiran:

| Camino | Dónde | Qué manda |
|---|---|---|
| `copiarBloque` → portapapeles | `WorkoutLogEditor.jsx:1108` | `name` · `sessions` · `mobilityDrills` |
| `pegarBloque` → «+ bloque» | `WorkoutLogEditor.jsx:1135` | lo mismo |
| `MandarBloque` → N clientes | `MandarBloque.jsx:146` | lo mismo |

**El único que las pasa es el Compositor**, y es el único que no copia nada.
Así que copiar «Acumulación · 6 semanas · subir volumen de empuje» produce
«Acumulación» con cuatro hojas: el nombre y el plan, sin la estructura.

Esto **no es un detalle del cajón, es su premisa**: se arregla primero, en las
tres llamadas, y después se guarda. Si no, el cajón nace guardando montones de
hojas con nombre.

## 25. Y las dos averías que el dueño ha visto

- **La mano se calla con un bloque en ella, siempre.** Es deliberado
  (`WorkoutLogEditor.jsx:1789`): *«pegarlo cierra el que está abierto y abre
  otro, y eso es una conversación con su pregunta»*. Pero `pegarBloque` **ya**
  lanza su `confirm`, así que pulsarlo desde la mano preguntaría igual. Lo que
  se gana callándose no es prudencia: es que el verbo esté escondido.
- **En el cliente sin programa no hay ni «+».** Con `microcycles.length === 0`
  la pantalla se va por el vacío de `WorkoutLogEditor.jsx:649`, que ofrece tres
  botones y ninguno es pegar. Es decir: **el momento en que copiar un bloque
  vale más —dar de alta a alguien y montarle lo mismo que a otro— es el único
  donde el portapapeles no existe.** Y el dominio ya sabe hacerlo:
  `startBlockWithPlan` tiene su rama de «sin programa» (`useWorkout.js:1070`),
  escrita precisamente para este caso.

El «+ bloque» **no sobra**. La ley del portapapeles es que el verbo vive en la
pantalla y la mano solo lo presenta (§9): quitarlo dejaría el pegar accesible
solo mientras la mano está encendida. Lo redundante es otra cosa, y está en §29.

## 26. Qué es una plantilla de bloque

Una plantilla de bloque es **un bloque sin dueño**. Lo que la distingue de un
bloque no es el contenido: es que no ocupa un sitio en la línea de nadie.

| Viaja | No viaja | Por qué |
|---|---|---|
| `name` | `id` | El id es de esa fila, no de la estructura |
| `intent`, `plannedWeeks`, `note` | `fromWeek`, `toWeek` | Son la posición en el tiempo de una persona |
| `sessions[]` (el plan) | `log` | La bitácora es qué le cambiaste **a él** y cuándo |
| `mobilityDrills` | `overrides` | Excepciones de semanas que en otro sitio no existen |
| — | todo lo registrado | Regla de la casa: `cloneExerciseAsTemplate` |

Ids nuevos **al guardar y al poner**, como las piezas (`domain/pieces.js`): una
plantilla puesta dos veces no puede compartir ids de ejercicio, o dos clientes
acaban compartiendo historial.

Y la misma consecuencia que ya tienen piezas y platos, dicha: **poner despliega,
no enlaza.** Editar la plantilla después no cambia los bloques que ya salieron
de ella. Es como se comporta todo lo demás del producto.

## 27. Dónde vive: tres sitios, y el que decide no es el tamaño

**(A) `coachPrefs.bloques.items`** — el precedente de piezas y platos, sin
migración.

Medido con un bloque realista (4 hojas × 6 ejercicios × 4 series, con descanso,
RIR y nota): **7,6 KB**. Uno de 8 hojas, 15 KB. Veinte bloques, **152 KB**.

El precio no es el disco, son los dos gestos que rodean a `preferences`: se lee
**entera** al arrancar (`useCoachPrefs.js:47`) y se **reescribe entera** en cada
guardado de sección (`:117-126`). O sea, cambiar una preferencia del panel
reescribiría la biblioteca de programas. Y no se comparte con el equipo.

**(B) Una tabla `coach_blocks`, del equipo** — el patrón de `client_forms`
(0099): tabla con su `team_id`, RLS y **GRANT** (`politicas-rls-sin-grant`: la
política decide qué filas, el GRANT si se puede mirar la tabla).

**(C) Un «cliente plantilla»** cuyos bloques son la biblioteca. Descartado sin
más: ensucia la cartera, las colas y todas las cuentas de la portada.

**Recomendación: (B), y el argumento que decide es el equipo, no los KB.**
`exercises` y `foods` son del equipo desde la 0006. Un bloque es la pieza más
grande del material de la casa; que la lista de ejercicios se comparta y el
programa no sería la excepción rara. `domain/platos.js` deja escrito que el
salto a tabla «es una migración posterior que lee ESTE MISMO módulo», así que
(A) es defendible como primer paso — pero entonces es un paso que se sabe desde
hoy que hay que deshacer.

## 28. Los gestos: dónde se guarda, dónde se ve, dónde se pone

Tres verbos y tres sitios, con la frontera de §11 («guardar no es pegar»):

- **Guardar** — desde el menú de la fila en `ListaDeBloques`, que es donde se ve
  cuál fue el que funcionó, junto a «Mandarlo a otros clientes…». Y desde la
  mano, con `/plantillas` abierto: `registrarDestino` ya acepta `verbo`, y para
  eso estaba puesto («Guardar», no «Pegar»). Hoy no lo usa nadie.
- **Ver** — tercer tramo de `/plantillas`, al lado de Días y Platos. La pantalla
  ya *exhibe y no compone*: renombrar, tirar, leer lo que lleva dentro y copiar
  al portapapeles. Nada más.
- **Poner** — **no** desde `/plantillas`, por su propia ley: *«Aquí se MIRA; se
  pone donde se monta»*. Dos puertas que ya existen y una de la tanda 2:
  - la **cuarta puerta del Compositor**, al lado de «Desde una pieza tuya»;
  - el **«+ bloque»** y la mano, vía portapapeles;
  - y `MandarBloque` desde la plantilla, que es «poner en varios» (PP-05).

## 29. «Traer de otro cliente»: qué sobra exactamente

Verificado: `CopyToClientPanel` **no es un copiador de bloques**. Son tres
opciones en un panel, y `replicateClient` (`useWorkout.js:1800`) hace esto con
la de entrenamiento:

- sustituye **el programa entero** del destino: todos los microciclos, el
  `weeklySplit`, el `cycleType` y el `cyclePattern` del origen;
- los días pasan por `cloneDays`, que **conserva kg, reps y RIR** — o sea, los
  kilos que levantó otra persona entran en la ficha del nuevo;
- y `blocks: deepClone(source.blocks)` se lleva el **`log` de cada bloque**: la
  bitácora de qué le cambiaste a esa persona y cuándo, dentro de la ficha de
  otra. Es de la misma familia que lo de `auditoria-copia-y-permisos`.

Así que el reparto es:

| Opción del panel | ¿Sobra? |
|---|---|
| **Entrenamiento** | **Sí.** El portapapeles y `MandarBloque` hacen lo mismo mejor: mandan el plan y no el historial. Y ésta arrastra kilos ajenos y la bitácora. |
| **Calentamiento** | No. No tiene sustituto. |
| **Dieta** | No. El portapapeles lleva comida y día, no una dieta entera. Es además la puerta que abre `NutritionModule`. |

**El movimiento honesto es retirar la opción de entrenamiento** y dejar el panel
con calentamiento y dieta. En el vacío del cliente nuevo, «Traer de otro
cliente» pasa a ser lo que el dueño ya está haciendo: copiar el bloque del otro
y pegarlo.

## 30. El plan, en tres tandas

**Tanda A · Que un bloque sea una estructura** *(sin esto el cajón no vale)* —
**CONSTRUIDA**
- **B-01 ✓** Las tres características viajan. Sale `planDeLaPieza`, una sola
  función que dice qué es un bloque copiado cuando aterriza, porque se pega en
  dos sitios que no se parecen y estaba escrita dos veces —y las dos se habían
  quedado cortas igual—. `copiarBloque` las mete en la carga y en el rótulo de
  la bandeja («Acumulación · 4 hojas»); `MandarBloque` las manda a los N.
- **B-02 ✓** El bloque se registra como `<Destino>` **en la lista de bloques**,
  no en el conjunto. El argumento viejo («pegarlo es una conversación») no valía
  —`pegarBloque` ya pregunta, la lance quien la lance—, pero el sitio sí: el
  destino vigente es uno, así que un bloque registrado en el conjunto le quitaría
  la mano a la hoja, que es lo que de verdad cae ahí. El bloque cae donde el
  bloque es el sujeto. La lista gana su verbo al lado del «+ bloque».
  Y `pegarBloque` nombra en la pregunta el bloque **abierto** y no el que se
  está mirando, que desde la lista pueden ser distintos.
- **B-03 ✓** El vacío del cliente sin programa es destino y tiene su verbo, el
  primero de los cuatro. Se pega **sin preguntar**: no hay bloque que cerrar ni
  nada entrenado detrás, así que la pregunta no protegería de nada.

**Tanda B · El cajón**
- **B-04** `domain/bloquesGuardados.js` con la forma de §26 y su tope.
- **B-05** El sitio de §27 (tabla o preferencias, según la decisión).
- **B-06** «Guardar en plantillas» en la fila de `ListaDeBloques` y el
  `<Destino>` con verbo «Guardar» en `/plantillas`.
- **B-07** Tercer tramo «Bloques» en `PlantillasPanel`.
- **B-08** Cuarta puerta del Compositor: «Desde una plantilla tuya».

**Tanda C · La limpieza**
- **B-09** Retirar la opción de entrenamiento de `CopyToClientPanel` y rehacer
  el vacío del cliente nuevo.
- **B-10** `MandarBloque` desde una plantilla (es PP-05 con otro origen).

Cada tanda se puede parar y lo anterior sigue en pie. La A arregla lo que el
dueño ha visto roto y no depende de ninguna decisión pendiente.

---

# SEXTA VUELTA · Cerrar la tanda 1

*(10 sep 2026. Sin decisión pendiente del dueño: «sigue con lo del portapapeles,
la decisión te la dejo a ti». Se cierra la tanda 1 de §12 —PP-02, PP-03 y
PP-04— y no la tanda B del cajón, que sigue esperando dónde vive.)*

## 31. PP-02 · La pauta viaja, y NO es un sexto tipo

El estudio la había apuntado como «sexto tipo: se pega sobre otro ejercicio, que
conserva su nombre». Al construirla se ve que como tipo está mal, y por la misma
razón por la que el tramo tampoco lo es (§10): **obligaría a decidir al COPIAR
algo que solo se sabe al pegar.** Cuando se pulsa ⧉ sobre el press todavía no
está decidido si eso va a acabar siendo otra fila —«el press también el jueves»—
o la pauta de una fila que ya existe. Quien lo sabe es el destino.

Así que en la mano se lleva siempre EL EJERCICIO, y «ponerle a esta fila sus
series» es otra manera de soltarlo:

    ┌ Remo con barra   Espalda · 2 series        [❞] [↑] [↓] [⧉] [📋→] [🗑] ┐
                                                            └─ solo aquí

El verbo sale **en la fila encendida y solo llevando un ejercicio** —la ley del
reposo: una oferta que no se puede aceptar es mobiliario—, y es la misma regla
que ⌘V, que también pega lo último copiado. En diez filas serían diez botones
para un gesto que va a una.

`conLaPauta(destino, origen)` está en `domain/training` y dice qué se queda y qué
entra: se queda la fila entera —id, nombre, músculo, nota y su `enlazado`, que es
de la hoja—, entra la serie con sus objetivos y sus remates, y el descanso solo
si el origen lo trae. Y limpia la técnica vieja a nivel de ejercicio, porque los
remates ahora entran con las series y dejarla serían dos verdades.

**Aquí no se pregunta el tramo**, y no es un olvido: esto no da de alta nada,
cambia una fila que ya está, así que cae donde esa fila vive —el plan o su
excepción, lo resuelve `updatePlanExercise`—, igual que cambiarle una serie a
mano. Quien quiera que dure solo unas semanas lo dice antes, con «Cambiarlo solo
este microciclo» de la propia fila.

## 32. PP-03 · El tramo del pegado, y cuándo NO se pregunta

Pegar hace ya la misma pregunta que el alta, con las mismas tres respuestas y
las mismas palabras: viven en `Workout/alcances.js` y las leen los dos caminos
—`AddExerciseForm` y la ventana nueva `TramoDelPegado`—. Escritas dos veces se
habrían separado a la segunda corrección de estilo.

**Dónde se pregunta.** En una ventana, y no en el menú de pegar: tres tramos por
cada pieza copiada son treinta y seis entradas llevando doce. Y no en el
formulario del alta —que es donde vive el «Hasta cuándo» de hoy— porque ese
formulario nace plegado, así que el mando estaría escondido la mayor parte del
tiempo y el pegado desde la mano dependería de un control que no se ve.

**Cuándo NO se pregunta:** con **un solo microciclo** en el bloque. Las tres
respuestas se ven exactamente igual —no hay otra semana a la que el ejercicio
pueda llegar o dejar de llegar—, así que preguntar solo añade un clic. Una
pregunta cuyas tres respuestas hacen lo mismo no es una pregunta, es un peaje. Y
la que vale entonces es la de siempre, el plan del bloque, que además es la que
sigue valiendo cuando mañana se añada el segundo microciclo.

La ventana es `.opt-group` con tres tarjetas, la pieza de la casa para cualquier
elección con consecuencias (ver `ComoSePauta`), y de paso `OptionCard` aprende a
ser **una de varias** (`unaSola`): un grupo de tres casillas mutuamente
excluyentes anunciaba tres cosas que entran o no, y ahora es un grupo de radio
con sus flechas de teclado. El dibujo no cambia.

## 33. PP-04 · Deshacer, en los cuatro pegados que añaden

`ToastProvider` sabía hacerlo desde siempre y no lo usaba ninguno de los cinco
pegados (H-05). Ahora lo usan los cuatro que AÑADEN:

| Pegado | Deshacer |
|---|---|
| Hoja en el bloque | `removeBlockSheet` por el NOMBRE, que `freeSheetName` acaba de garantizar único |
| Ejercicio en la hoja | `removePlanExercise` por el id del clon, esté en el plan o en la excepción del tramo |
| La pauta en una fila | vuelve a escribir las series y el descanso de antes |
| Comida y menú en la dieta | `removeMealsById`, con los ids que devuelve ahora `appendMeal` |

**Por id y no por posición**, que es lo único que aguanta los seis segundos que
el aviso está en pantalla: pegar un menú son seis comidas al final de la lista y
en ese rato se puede haber movido cualquier otra.

**El bloque se queda fuera, a propósito.** Es el único pegado que **pregunta
antes** —cierra el bloque abierto y empieza otro—, así que ya tiene su mitad de
la ley 2; y deshacerlo sería devolver un microciclo y reabrir el bloque cerrado,
o sea reescribir el calendario de alguien desde un aviso de seis segundos.

Lo que un «Deshacer» NO hace es retirar lo apuntado en la bitácora, igual que no
lo retira el de quitar un ejercicio: la bitácora cuenta lo que se hizo, y pegar
y arrepentirse es algo que pasó.

## 34. Cómo queda el plan de §12

Tanda 1 **cerrada** (PP-00 ✓, PP-01 ✓, PP-02 ✓, PP-03 ✓, PP-04 ✓). Sigue sin
tocar la **tanda 2 entera** —poner en varios, guardar en plantillas desde la
mano, ver lo que llevas— y **PP-09…PP-12**; del cajón de bloques, las tandas B
y C, que esperan la decisión de dónde vive.

Validado con `lint`, `types`, 2 174 pruebas y `build`; `verify-styles` sale con
el aviso de siempre (`photos/Thumb.jsx`), que ya venía. Las dos láminas de la
ventana —claro y oscuro— y la hoja con el verbo de la pauta se capturaron con el
banco de la probe: `docs/portapapeles-tramo-{claro,oscuro}.png` y
`docs/portapapeles-pauta-claro.png`. Sin commitear, como todo lo de estos días.

---
---

# SÉPTIMA VUELTA · Cerrar la tanda 2

*(10 sep 2026, siguiendo con la tanda 2 de §12: PP-05, PP-06, PP-07 y PP-08.)*

## 35. La tesis: no había una pantalla de reparto, había un panel de bloques

`MandarBloque` no era la pantalla que reparte: era la pantalla que reparte
BLOQUES. Y no porque un bloque fuera lo único que tiene sentido mandar a seis
personas, sino porque era lo único que se podía llevar de una ficha a otra
cuando se construyó. Desde el portapapeles se llevan cinco piezas.

Así que la tanda 2 no ha sido escribir una pantalla nueva: ha sido **sacarle a
esa el tipo de dentro**. Lo que queda es `domain/reparto.js` —qué necesita leer
cada pieza, qué le pasa a cada destinatario y qué habría que escribirle— y
`Coach/MandarLaPieza.jsx`, que pregunta a quién, lo enseña y lo escribe.
`MandarBloque.jsx` desaparece: dos paneles para la misma pregunta habrían sido
la abstracción paralela que el §5 de `CLAUDE.md` prohíbe, y el bloque entra por
la misma puerta con su pieza hecha (`piezaDeBloque`).

**La regla que estrenó aquella pantalla se queda entera, y es la razón de que
exista:** ésta es la única del producto que escribe en el trabajo de varias
personas a la vez, así que no se pulsa nada sin ver qué le pasa a cada una.

## 36. Las dos familias, que es la decisión de diseño de esta vuelta

Repartir una pieza es contestar «¿dónde cae en el suyo?», y hay dos clases de
respuesta:

| | Qué cae | Dónde |
|---|---|---|
| **Abren sitio** | bloque, hoja, día de dieta | el único que hay: un bloque abre bloque, una hoja entra en el bloque abierto, un día se AÑADE |
| **Caen dentro** | ejercicio, comida | en UNA hoja y en UN día — y ni las hojas ni los días de ocho personas se llaman igual por decreto |

Las segundas **preguntan el sitio una vez y para todos**, por nombre y con el de
origen puesto por defecto. Quien no lo tenga sale en la columna diciendo eso
mismo («Acumulación» no tiene ninguna hoja «Lower A») en vez de recibir la
pieza en un sitio que haya elegido la aplicación. Es la ley que ya salió dos
veces —el tramo y la pauta—: **lo que no se sabe al copiar se pregunta al
pegar**.

Con UN solo día de dieta hay excepción medida: la comida cae ahí se llame como
se llame. Exigirle a una dieta de un día que su día se llame igual que el de
otra persona sería un peaje por un nombre que nadie ha puesto.

## 37. La dieta: las tres reglas que ya estaban decididas

Se construyen aquí las tandas 1-3 de la propuesta de «Mandar esta dieta a…»,
porque son exactamente lo que le faltaba a PP-05 para no dejar dos de las cinco
piezas fuera:

1. **Un día AÑADE.** Una dieta no se «cierra»: no hay lista de planes, así que
   escribir encima sustituye y lo sustituido no está en ninguna parte. El
   destinatario pasa a tener un día más y no se le toca ninguno. Hace falta
   `addDietDayWithMeals` —el día con su menú en UNA escritura—: entre
   `addDietDay` y `setDayMeals` hay una escritura a la base y una cola, y un
   fallo en medio deja un día en blanco en la dieta de alguien.
2. **El menú se reescala al objetivo de cada uno** (`rescaleMeals`, que mueve la
   fuente de hidratos y deja quieta la proteína). Es la firma de la pantalla:
   **mandar la misma dieta a ocho no es darles la misma dieta.** Para eso el
   objetivo del día viaja en el `origen` de lo copiado —no en la carga: no es
   parte del menú, es de dónde salió—. Quien no tenga objetivo lo recibe tal
   cual y la columna lo dice.
3. **Los condicionantes vetan.** Una fila con un «no se le puede poner» entra
   **desmarcada**, y volver a marcarla es una decisión que el entrenador toma
   mirándola; los «tenlo en cuenta» se dicen y no deciden por nadie. Y el veto
   es de las cinco piezas, no solo de la dieta: mandarle un empuje por encima de
   la cabeza a quien tiene el hombro tocado es el mismo error.

**Pieza nueva de datos: `conditionsOfMany`.** `useConditions` dejaba escrita la
salida —«los condicionantes son del cliente abierto; cuando haga falta saber de
varios, la salida es una consulta en bloque»— y hace falta desde hoy. Sin
migración y sin política nueva: `conditions_coach_read` es
`USING (app_can_read_client(client_id))`, un predicado POR FILA, así que filtrar
con `in` pasa por lo mismo que filtrar con `eq`. Devuelve `null` si la consulta
falla, y entonces la pantalla lo dice: un fallo de red leído como vía libre es
justo el error que este dominio existe para evitar.

## 38. Quién entra, al final: no hay «marcados», hay quitados y repuestos

La columna de consecuencias dejó de ser un aviso y pasa a ser la lista: cada
fila se puede quitar sin cambiar la audiencia. Y el estado son **lo que has
quitado** y **lo que has repuesto**, no «quién entra»: así una fila con veto
entra desmarcada aunque el condicionante llegue tres décimas después que el
nombre, porque no hay ningún estado sembrado que corregir cuando llega la
respuesta.

## 39. PP-07 y PP-08, y la ley VII de la mano

**PP-07 · Guardar en plantillas** cierra el círculo que solo giraba en un
sentido, y solo para lo que TIENE cajón (§11): una hoja es un día
(`domain/pieces`) y una comida es un plato (`domain/platos`) —su opción
principal, porque un plato es una ración y las alternativas de una comida son
otras tantas—. Un bloque o un menú entero no salen: abrirles cajón es una
biblioteca de programas, que es la tanda B y otra pieza de producto.

**PP-08 · Ver lo que llevas** era «la pieza se despliega», y era requisito de
PP-05: una lista de doce nombres obliga a pegar para saber cuál era. Ahora una
pieza abierta enseña lo que lleva dentro —los ejercicios de la hoja, las series
del ejercicio, las comidas del día— y sus tres verbos.

Y eso **corrige la ley VI** de la vuelta anterior, que decía que con UNA sola
pieza no hay lista siquiera. Aquel argumento era bueno mientras el cajón fuera
una lista de nombres: *«¿qué sentido tiene que además te muestre el ver más?»* —
ninguno, porque la fila repetía lo que la píldora ya estaba diciendo. Ya no lo
repite, y nada de lo que lleva ahora cabe en una píldora de una línea. La ley
VII lo dice así: **una pieza se abre**. Lo que no cambia es la píldora, que
sigue pegando de un clic: nada de lo de antes se ha hecho más lento.

**Los verbos son botones a la vista y no un «···»**, y por una razón medida: el
cajón recorta lo que se salga (`overflow: hidden` en `.pp-cajon` y el
`overflow-y` de `.pp-lista`), así que un popover ahí dentro no se vería — y la
mano vive a 22 px del borde inferior, donde un menú tampoco tiene hacia dónde
abrirse. De paso `MenuAcciones` aprende `hacia="arriba"` para los que sí lo
necesiten.

Y la mano **se muda a `Coach/`**: desde que escribe en el trabajo de la gente y
lee del contexto, es una pieza del panel del entrenador —donde ya se montaba,
`{isCoach && …}`— y no un primitivo de `ui/`, que no importa de `Coach/` en
ninguna parte. El `Destino`, que no sabe nada de nadie, se queda donde estaba.

## 40. Dos averías que salieron al construir

- **`copiarBloque` copiaba cero hojas de un programa sin migrar.** Leía
  `blockSessionsOf(bloque)` a pelo y la migración al plan del bloque es perezosa
  —corre la primera vez que se TOCA el plan—, así que un bloque de alguien que
  no lo hubiera tocado se copiaba vacío. `MandarBloque` sí lo hacía bien y por
  eso no se había visto: eran dos lecturas del mismo bloque y no coincidían.
  Ahora es una sola, `piezaDeBloque`.
- **A quién se deja fuera se miraba mal.** Era «el cliente abierto», que en
  `MandarBloque` daba igual porque el bloque era suyo. Desde la mano no: se
  copia la hoja de Marta, se navega a Luis y se reparte, y Luis es un
  destinatario tan legítimo como cualquiera. Se mira el ORIGEN de la pieza.

## 41. Cómo queda el plan de §12

Tandas 1 y 2 **cerradas** (PP-00 … PP-08 ✓). Sigue sin tocar la **tanda 3**
—PP-09 (pegar sobre un día que ya existe), PP-10 (la dieta al día), PP-11 (las
otras puertas) y PP-12 (arrastrar)— y, del cajón de bloques, las tandas B y C,
que esperan la decisión de dónde vive.

De la propuesta de la dieta queda su **tanda 4**: mandar la dieta ENTERA, que
sustituye y por eso hay que pedirlo aparte y avisarlo por persona.

Validado con `lint`, `types`, 2 234 pruebas —28 nuevas, todas de
`domain/reparto`— y `build`. `verify-styles` sale con el aviso de siempre
(`photos/Thumb.jsx`) y con un fallo que **ya venía y no es de aquí**:
`.is-portal` en `Client/ClientDiet.jsx`, una clase sin definir de un trabajo
anterior a medio terminar. Sin commitear.

---

# OCTAVA VUELTA · El cajón, en su propio documento

**10 sep 2026.** *«Aún sigo sin poder copiar los bloques en plantilla; creo que
ese tipo de cosas habría que replantearlas.»*

Las tandas B y C de la quinta vuelta seguían esperando la decisión de dónde vive
el cajón, y la pregunta del dueño es más grande que esa decisión: no es dónde
meter los bloques, es qué es el material guardado del entrenador. Sale de este
estudio a **`replanteamiento-lo-guardado.md`**, que se lo lleva entero —§26-30
incluidas— y añade lo que faltaba: las cinco averías con su evidencia, la tesis
de que lo guardado y lo copiado son la misma carga, y las cinco decisiones.

Aquí queda, del plan de §12, solo la **tanda 3** del portapapeles: PP-09 (pegar
sobre un día que ya existe), PP-10 (la dieta al día), PP-11 (las otras puertas) y
PP-12 (arrastrar).

---

# NOVENA VUELTA · La tanda 3, CERRADA

**10 sep 2026.** *«Sigue con la tanda 3 del portapapeles.»* PP-09, PP-10, PP-11
y PP-12. Con esto el plan de §12 queda entero (PP-00 … PP-13 ✓).

## 42. La ley que sale de construirla: pegar dice QUÉ; arrastrar dice DÓNDE

La tanda 3 son cuatro movimientos que parecían sueltos —sustituir una hoja, la
dieta al día, las otras puertas y arrastrar— y al construirlos resulta que tres
de ellos contestan la misma pregunta: **cuando el sitio no es uno, ¿cómo se dice
cuál?**

Hasta aquí el portapapeles daba por supuesto que el destino era único: la
pantalla registra UN destino (`registrarDestino`) y la mano enciende UN verbo.
Eso es cierto en el bloque —una hoja copiada solo puede caer en el bloque que hay
delante— y es falso en dos sitios donde se trabaja todos los días:

    la rejilla del bloque   seis columnas, y la hoja copiada cae en UNA
    el menú de la dieta     seis comidas, y la comida copiada entra en UNA

Con un clic no se puede contestar «en cuál»: la mano está en la esquina y no sabe
a dónde apuntas. Así que:

> **Se PULSA cuando el sitio es uno. Se ARRASTRA cuando hay que elegir cuál.**

Arrastrar no es una segunda manera de hacer lo mismo —eso sería un gesto de
más—: es la única manera de decir dónde. Y por eso hay exactamente dos zonas de
soltar en toda la aplicación, que son esos dos sitios, y no una por cada destino
registrado.

## 43. PP-09 · Una hoja cae también ENCIMA de otra

Pegar una hoja abría una hoja NUEVA, que es el gesto de montar el bloque. El otro
—*«el lunes de esta persona pasa a ser este otro entrenamiento»*— costaba cuatro
pasos: pegar la hoja al lado, mover los ejercicios, borrar la vieja y renombrar.
Y por el camino se perdía el nombre, que es lo único que el cliente reconoce:
«Lower A» sigue siendo su Lower A aunque dentro cambie entero.

**Es la misma ley que la pauta de un ejercicio (§32): lo que viaja es el
CONTENIDO; la identidad es de quien está en su sitio.** Por eso tampoco es un
tipo nuevo del portapapeles —en la mano sigue habiendo una hoja— sino otra manera
de soltarla, y por eso el verbo vive en la hoja que recibe:

    en la hoja abierta      un ⧉ de pegar en su cabecera, junto a copiar y guardar
    en la rejilla           un ⧉ de pegar en la columna, junto a sus otros cuatro

Los dos solo con UNA hoja en la mano (ley del reposo) y los dos llaman a
`sustituirHoja`, que **hace la pregunta del tramo** con la misma ventana del
pegado de ejercicio (`TramoDelPegado`, que aprende `titulo`, `intro` y `verbo`
porque la pregunta es una y lo que cambia es cómo se llama lo que va a pasar).
Las tres respuestas aquí significan:

    En el bloque, mientras dure   la línea base del bloque pasa a ser esa hoja
    Unas semanas, a prueba        tres microciclos, y el bloque no se toca
    Solo este microciclo          la semana de descarga: el mismo lunes, otra cosa

Y no se pregunta con un solo microciclo, por lo de siempre: tres respuestas que
hacen lo mismo son un peaje.

**Lo que costó de dominio:** una escritura nueva, `setBlockSheetExercises`
(`setBlockExercisesIn`), porque hacerlo con las de una en una serían N bajas y M
altas —la pantalla parpadeando por los pasos intermedios y un «Deshacer» que
tiene que rehacerlas al revés y en orden—. Escribiendo la lista entera, **el
inverso es la lista de antes**. Con tramo no hay escritura nueva: son las bajas y
las altas de siempre (`buildOverride`), construidas aquí para poder deshacerlas
por id.

**Lo que se queda y se dice:** lo que esa semana existe solo como excepción —un
alta puntual— no lo pisa la sustitución. Es un cambio que alguien hizo a propósito
para ese microciclo, y borrarlo de paso sería tirar trabajo sin avisar.

## 44. PP-10 · La dieta, con los mismos gestos

Tres cosas, y una ya estaba (el ⧉ a la vista en la comida, que entró con la tanda
1). Quedaban las dos que hacían que la dieta fuera media herramienta:

**⌘C y ⌘V.** Existían en Entreno desde el primer día y no en la dieta, siendo el
mismo gesto sobre la misma clase de pieza. La pieza es **la comida en foco**, que
no había que inventar: es aquella dentro de la cual está el cursor, y sin ninguna
la primera —igual que la hoja copia el primer ejercicio cuando no hay ninguno
señalado—. Lo que ha entrado lo dice la mano dos segundos (ley II).

Las tres guardas —dentro de un campo manda el navegador, con texto seleccionado
también, y no se toca el del sistema— se han sacado a **`lib/useAtajosDeCopia`**,
que es de donde tenían que salir: escritas dos veces se habrían separado a la
segunda corrección, y entonces el mismo atajo haría dos cosas distintas según la
pantalla. Es el mismo movimiento que hizo `Workout/alcances.js` con el tramo.

**Pegar una comida COMO OTRA OPCIÓN.** Es lo que la estructura de opciones pide
desde que existe y no se podía hacer: *«la cena de Marta, como alternativa de
esta cena»* obligaba a pegarla al final, abrirla, copiar sus alimentos uno a uno
en una opción nueva de la de arriba y borrar la pegada. El verbo sale en la fila
de opciones de la comida —lo primero, porque es lo que construye— y solo con una
comida en la mano.

Cómo se llama lo que entra no es un detalle: una opción sin nombre se lee «Opción
2», que dice dónde está en una lista y no qué es (`optionName`) — y aquí es cuando
más falta hace, porque viene de otra comida y a veces de otra persona. La que
llega sin nombre toma el de la comida de la que salió.

Escritura nueva: `setMealOptions`, por el mismo argumento que la hoja —una lista
de una vez, y el inverso es la lista de antes—.

## 45. PP-11 · Las cuatro puertas dejan de ser cuatro

H-04 decía: *cuatro puertas para lo mismo, y no se conocen*. Las tres que traen
piezas terminan ahora en la mano, y la cuarta dice en qué se diferencia:

- **«Traer de un fichero»** gana una tercera respuesta a la pregunta que ya
  hacía —«dónde va la rutina»—: *dejarla copiada*. Y la pregunta pasa a hacerse
  **siempre que haya rutina**, no solo cuando cabe en el día abierto, porque esa
  respuesta vale igual para un día que para la semana entera. Era lo que faltaba
  para que un libro de Excel pudiera montar a las cinco personas que entrenan
  parecido en vez de a una: lo leído es una pieza más y hereda todo lo que la
  mano sabe hacer —pegarla en otro cliente, ponerla encima de un día que ya
  existe con su tramo, repartirla a varios o guardarla en tus plantillas—.
- **«Traer un día de otro cliente»** gana la misma pregunta con las mismas
  palabras («Dónde va el día»), y el botón de cada día dice entonces lo que hace:
  *Traer* o *Copiar*. Su título deja de ser «Traer un día a Push A»: desde que el
  destino es una respuesta de dentro, ya no es el asunto de la ventana.
- **La réplica cliente→cliente** se queda como está —sustituye el plan entero, no
  es una pieza— y **se le nombra la diferencia** al lado del botón, con el nombre
  del gesto que hace lo otro. Era la única que no decía en qué se distingue de las
  demás.
- Y el **«+ hoja»** ordena sus opciones por lo que hay copiado: con algo en la
  mano, abrir ese menú es casi siempre haber venido a soltarlo.

La forma de una hoja copiada sale a **`piezaDeHoja`** en `lib/portapapeles`,
porque ya son tres las puertas que la producen y una sola la que la lee: basta
que una se olvide de `carga.dayName` para que lo pegado se llame «Hoja», que es
exactamente lo que ya pasó una vez con el cajón.

**Lo que NO entra, y por qué:** la dieta leída de un fichero no se puede quedar en
la mano. Esa importación sustituye la dieta entera, reparte las variantes y
resuelve alimentos contra tu biblioteca (`alimentosNuevos`), y una pieza no lleva
nada de eso: se quedaría a medias sin decirlo. Mandar una dieta a varios ya tiene
su camino desde la ficha.

## 46. PP-12 · Arrastrar, y solo donde significa algo

`useZonasDeSoltar` en `lib/portapapeles`, con la ley del §42: dos zonas, las dos
donde hay que elegir cuál —la columna del bloque y la comida del menú—.

- **La pieza viaja por el almacén y no por el `dataTransfer`.** Durante el
  `dragover` el navegador no deja leer lo que se lleva —solo los tipos MIME—, así
  que una zona no podría contestar si acepta esto sin soltarlo primero, que es
  justo lo que hay que saber antes.
- **En reposo no hay ni un oyente.** `zona(id, pegar)` devuelve `{}` mientras no
  viaje nada que ese sitio acepte, y eso es además lo que deja **componerla con el
  arrastre que ya había** en las dos pantallas (reordenar hojas, reordenar
  comidas): los dos no coinciden nunca, así que el de la mano manda cuando hay
  algo viajando y el de siempre cuando no.
- **La marca no puede ser la misma.** `.comida.is-drop-target` es un filo arriba,
  que significa «va ANTES que ésta» (reordenar); lo que llega de la mano cae
  DENTRO, así que se enciende el recuadro entero (`.is-recibe`). Dos destinos
  distintos no pueden llevar la misma señal.
- **Solo con ratón.** `draggable` no existe en táctil (ya está razonado en
  `useArrastreOrden`), así que el atributo —y el cursor de agarre— se ponen solo
  con `(pointer: fine)`. Todo lo que se puede hacer arrastrando se puede hacer
  también desde el sitio que recibe, que tiene su propio verbo.
- Y una guarda medida: `dragleave` sube desde los hijos, así que cruzar por dentro
  de la columna lo dispara sin haberse ido a ningún sitio. Sin
  `currentTarget.contains(relatedTarget)`, la marca parpadea mientras se busca
  dónde soltar — justo cuando hay que verla quieta.

## 47. Validación y qué queda

`lint`, `types`, **2 310 pruebas** (cuatro nuevas: la forma de la hoja copiada, la
pieza en vuelo y la lista entera de una hoja), `build` y `verify` con el aviso de
siempre (`photos/Thumb.jsx`); `.is-portal` ya no falla. Sin commitear.

Del plan de §12 no queda nada. Fuera de él siguen abiertas la **tanda 4 de la
dieta** (mandarla entera, que sustituye) y lo que decida el dueño después de ver
esto en la aplicación real.

---

# DÉCIMA VUELTA · El plato es una forma

**10 sep 2026.** *«Sigue con los pasos de TIPO.PLATO.»* Los pasos no estaban
escritos en ninguna parte: estaban apuntados en el código, en tres sitios que
decían lo mismo.

## 48. La avería, dicha por el propio código

- `MealCard.jsx` guardaba un «copiar la alternativa a otro día» con su razón
  para seguir vivo: *«la pieza más pequeña que sabe llevar la dieta es una
  comida entera con todas sus opciones, no una sola… Lo que lo retiraría es que
  el portapapeles aprendiera a llevar un PLATO. Es la siguiente pieza.»*
- `domain/cajon.js` tenía el plato con `alaMano: null` por lo mismo: *«soltarlo
  donde va una comida sería pegar otra cosa.»*
- Y §11 de este estudio lo había resuelto como decisión razonada: la comida y el
  plato no son la misma pieza.

Los tres tenían razón, y de los tres salía el mismo hueco: **la ración no
viajaba**. Lo que la movía era el peor camino de los dos —solo llegaba a los
días de la misma persona, elegía la comida de destino por su cuenta (la que se
llamara igual) y no pasaba por la mano, así que ni se veía lo que llevabas ni se
podía cuadrar al objetivo de donde caía—.

Y había una segunda avería, callada, en la tabla: la 0112 guardó los platos con
`kind = 'comida'`, mientras que el cajón declara que **`carga` es exactamente lo
que viaja en la bandeja**. Para los platos no lo era.

    kind = 'comida'   →  carga = { foods }              ← una ración
    TIPO.COMIDA       →  carga = { name, options[] }    ← una comida entera

## 49. Lo que se construye: `TIPO.PLATO`, y lo que arrastra

Séptima forma del portapapeles, y con ella:

| | Qué cambia |
|---|---|
| **P-1** | `TIPO.PLATO` y su nombre en `lib/portapapeles`. |
| **P-2** | El ⧉ de la alternativa copia la ración a la mano (`copiarPlato`), con la misma poda y el mismo bautizo que al guardarla — `piezaDePlato`, en `domain/platos`. |
| **P-3** | Se pega como **otra alternativa** de cualquier comida: verbo en la fila, zona de soltar en la comida y `Destino`. Y a partir de ahí es `ponerPlato`: los mismos alimentos desplegados con ids nuevos y la misma oferta de **cuadrarlo** al hueco. |
| **P-4** | Fuera `CopiarA`, `onCopyOption`, `otrosDias` y `copyOptionToVariant` (contexto incluido: 275 → 274 claves). |
| **P-5** | El cajón pasa a `kind: 'plato'` con la **0114**, y `alaMano` deja de ser `null`: un plato de la vitrina vuelve a la mano. |
| **P-6** | Pruebas: 2 317. |

**Un verbo de pegar y no dos.** Dentro de una comida caben dos formas —la comida
entera y el plato— y la fila tiene UN icono: manda **lo último copiado**, que es
la ley de ⌘V y la que ya sigue el resto de la pantalla. Dos `ClipboardPaste`
seguidos habría que distinguirlos por el orden.

**Y no hay «pegar en varios» para el plato**, y es un hueco dicho, no un olvido:
las seis formas que se reparten caen en un sitio que se sabe con UNA respuesta
por persona —el programa, la hoja de un bloque, el día de una dieta—; un plato
cae DENTRO de una comida, así que «pónselo a los seis» pide dos respuestas por
destinatario. Mientras `MandarLaPieza` no tenga ese selector, `seReparte` dice
que no y la mano se calla, en vez de ofrecer un verbo que no sabría a dónde
llevarlo. Está escrito con su prueba en `domain/reparto.test.js`.

## 50. Lo que se pierde, dicho

Llevar una COMIDA en la mano y guardarla desde `/plantillas` ya no vale: el
cajón guarda platos, y la comida no lo es. Antes valía porque `limpiar` se
replegaba a `options[0]` — el cajón eligiendo alternativa por su cuenta, sin
decírselo a nadie. Ahora **elige quien copia**, con el mismo número de gestos:
se copia la alternativa que quieres y se guarda ésa.

## 51. El orden de despliegue, y por qué aquí da igual

La 0112 exigía ir antes que el código. La 0114 no: `mapCajonFromDb` traduce
`'comida' → 'plato'` al leer, así que el código nuevo entiende las filas viejas
y la migración no puede llegar tarde. Sin ese puente, un `kind` que ya nadie
conoce no se enseña en ningún tramo y el entrenador vería su vitrina de platos
VACÍA sin que nada se lo dijera — el dato falso de siempre. El puente se retira
cuando la 0114 esté aplicada en todas partes.

## 52. Validación

`lint`, `types`, **2 317 pruebas** (siete nuevas: la pieza del plato y su poda,
el plato que vuelve de la vitrina con su nombre, la comida que ya no tiene
cajón, y el reparto que dice que no), `verify` con el aviso de siempre
(`photos/Thumb.jsx`) y `build`. Sin commitear. La **0114 está sin aplicar**.

---

# UNDÉCIMA VUELTA · El veredicto con la aplicación delante

**10 sep 2026.** *«Sigue con la tanda 4 del portapapeles.»* No había tanda 4: el
plan de §12 quedó entero con la tanda 3 y la tanda 4 de la dieta se cerró el
mismo día. Lo único abierto era esto —ver las tres tandas funcionando con datos
de verdad—, y es lo que se ha hecho: Supabase local, `npm run demo` resembrado,
Vite contra `127.0.0.1:54321` y Playwright recorriendo los gestos uno a uno.

## 53. La avería que solo sale con la aplicación delante

**Pegar una hoja en un bloque SIN MIGRAR se la comía, y el «Deshacer» remataba.**
Medido con Iván Tormo, cuyo bloque estaba como sale de la siembra —el plan
repartido por sus microciclos, `block.sessions` sin escribir todavía—:

1. Se copia «Empuje» de Marta y se pega en el bloque de Iván, que ya tiene su
   propio «Empuje».
2. No nace «Empuje 2»: los seis ejercicios caen DENTRO del «Empuje» de Iván, que
   pasa de 6 a 12. El aviso dice «Empuje» pegada, sin más.
3. Se pulsa «Deshacer» —el que ofrece el propio aviso— y desaparece la hoja
   entera: el bloque se queda con Tirón, Pierna y Full body. **La hoja de
   siempre del cliente, borrada de un clic.**

La causa es de UNA línea y ya estaba documentada a tres pantallas de distancia.
`pegarHoja` leía los nombres ocupados con `blockSessionsOf(bloque)`, y la
migración del plan es PEREZOSA: corre la primera vez que se toca el plan
(`applyPlan`), así que hasta entonces esa lectura devuelve **cero nombres**.
Con cero nombres `freeSheetName` no ve el choque y devuelve «Empuje»;
`addBlockSessionIn` no crea nada porque tras migrar esa hoja YA existe y
devuelve el bloque tal cual (`domain/blocks.js:1471`); y los ejercicios entran
en la hoja del cliente. El «Deshacer» llama a `removeBlockSheet(…, 'Empuje')`,
que quita la hoja por su nombre — la suya.

Es exactamente la trampa que `piezaDeBloque` explica en su cabecera («aquí se
leían las hojas de `blockSessionsOf` a pelo, que en un programa que todavía
tiene el plan repartido por sus microciclos devuelve CERO»). Se arregló ahí y no
en los otros tres sitios que leen lo mismo.

**Arreglado** con `nombresDeHojaDelBloque()` en `WorkoutLogEditor`, que migra
antes de leer, y usado por los dos gestos que dan de alta una hoja: `pegarHoja`
y `duplicarHojaDelBloque` —que tenía la misma avería: duplicar una hoja en un
bloque sin migrar la duplicaba DENTRO de sí misma—. Comprobado contra la base:
antes, «Empuje» con 12 ejercicios y luego 3 hojas; después, «Empuje 2» con 6 y
el «Deshacer» se lleva exactamente esa.

**Dónde NO estaba la avería, y por qué importa:** `domain/reparto` ya lo hacía
bien —`programaDe(datos)` migra antes de leer los nombres—, así que «Ponerlo en
varios» siempre dijo la verdad («Ya tiene una hoja «Empuje»: entra como «Empuje
2»»). El camino de uno en uno era el que mentía.

## 54. Lo que se ve, y está bien

Capturado con sesión y datos reales (`docs/pp-real-*.png`):

- **La mano en reposo** es un icono y una cifra, sin color y sin frase; al
  acercarse aparece «Pegar «Empuje» en Bloque 1» en azul y el aspa de vaciar.
  La ley del reposo se cumple tal como está escrita.
- **El cajón** dice lo que lleva cada pieza («bloque · 4 hojas · Marta Ruiz»,
  «hoja · 6 ejercicios») y ofrece los tres verbos.
- **La pauta** funciona: «Press militar» pasa de 3×10-12 a 4×6-8 conservando su
  nombre y sus 67,5 kg, con su «Deshacer».
- **La pregunta del tramo** al sustituir una hoja sale entera y bien redactada:
  «En el bloque, mientras dure» / «Unas semanas, a prueba» / «Solo este
  microciclo».
- **«Ponerlo en varios»** es la pantalla que se prometió: una fila por persona
  diciendo qué le entra y con qué nombre, y el pie recordando que esto solo
  añade.

## 55. Tres cosas que chirrían, ninguna de fondo

1. **El menú de «+ comida» se sale de su sitio.** En la dieta vacía, el menú de
   las cuatro puertas (PP-11) abre en `.popover-right` sobre un botón que está
   pegado al canto izquierdo del panel: se pinta de x=190 a x=442 con el botón
   en x=360, o sea 170 px por debajo de la barra lateral. Se leen «…a comida»,
   «…de un fichero», «…la dieta de otro cliente». Reproducido y medido. Ver
   `docs/pp-real-menu-cortado.png`.
2. **Dos ofertas del mismo pegado a la vez.** Con el cajón abierto, el verbo
   azul sale en la píldora («Pegar «Empuje» en Bloqu…», cortado) y otra vez en
   la fila de la pieza («Pegar aquí»). Un gesto, dos botones encendidos.
3. **El aviso tapa lo que acaba de cambiar.** El «Deshacer» de la pauta se pinta
   justo encima de la fila que se acaba de pautar, que es la que hay que mirar
   para decidir si se deshace.

## 56. Lo que NO se ha podido comprobar

- **El arrastre (PP-12).** Con eventos sintéticos la zona no se enciende, y eso
  no prueba nada: `dispatchEvent` no es un arrastre de verdad y ya hay
  precedente de herramienta que miente (ver `setOffline` en el modo sin
  conexión). Queda para una pasada con ratón real.
- **Los gestos de la dieta (PP-10).** La siembra de demostración ya no crea
  menús cerrados —los seis clientes salen «por macros» y con cero comidas—, así
  que no hay comida que copiar sin montar una a mano. Y mientras se capturaba,
  los ficheros de nutrición estaban siendo editados en vivo (el registro de Vite
  encadena `hmr update` de `NutritionModule`, `MealCard`, `MacroTargetCard` y
  `LecturasDeLaDieta`), lo que llenó la consola de «X is not defined» que NO son
  averías: son módulos a medio guardar.

## 57. Validación

`lint` (limpio en `src`; falla solo en `banco-dieta.probe.jsx` y
`banco-shot.probe.mjs`, dos sondas sueltas en la RAÍZ del repositorio que
deberían estar fuera), `types`, **2 329 pruebas**, `verify` con el aviso de
siempre de `photos/Thumb.jsx`. La demo local quedó con dos marcas de las
pruebas: una hoja «Empuje 2» en el bloque de Iván y la dieta de Nerea puesta en
«menú cerrado». Se limpian con `npm run demo`.
