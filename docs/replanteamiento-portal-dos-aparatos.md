# El portal del cliente: dos aparatos

**12 de septiembre de 2026.** Prototipo clicable en `docs/portal-dos-aparatos.html`.
Nada construido en `src/`.

Cuatro vueltas con el dueño, y la última manda: **§9 > §8 > §7 > §5**.

Continúa `docs/replanteamiento-portal-cliente.md` y
`docs/replanteamiento-movil-el-aparato.md`, cuyas tandas están en el árbol sin
commitear y son el suelo de esto.

---

## 1. El veredicto del dueño, con la app delante

> «En el móvil ver tanta información, gráficas, elementos incómodos es feo,
> engorroso, no está bien planteado. Para el PC sí que puede tener más sentido,
> pero tal y como lo muestras no. Para el caso del cliente veo una app fea y
> pobre, tanto para PC como para móvil. La dieta para PC no tiene sentido que se
> muestre igual que para móvil, con los días como elementos pulsables, comidas
> desplegables que son incómodas: es mucho mejor la visión de entrenador.»

Y la frase que ordena todo lo demás:

> «La misión del cliente en la aplicación, entre otras, es entrar a rellenar sus
> semanas y apuntar sus pesos y subir sus revisiones. Eso debería ser la parte
> sencilla para él, no tiene mucho más realmente.»

---

## 2. El diagnóstico, verificado en el árbol

### 2.1 El PC del cliente no tiene diseño: es el teléfono con una columna al lado

`ClientStart.jsx` y `ClientDietRoute.jsx` envuelven **exactamente las mismas
piezas del móvil** en `.resumen` + `.resumen-trabajo` + `.resumen-lado`, repartidas
por consulta de contenedor. Eso resolvió un problema real —a 1440 px la pantalla
se acababa a media página— pero **no es un diseño de escritorio: es el remedio de
no tener uno**. Por eso a 1440 px:

- los días de la dieta siguen siendo la cinta táctil del teléfono,
- las comidas siguen plegadas (`plegadaAlInicio`, `ClientDiet.jsx:268`), o sea
  cuatro clics para ver lo que hay que comparar,
- y el inicio sigue siendo una tarjeta y tres filas de consulta.

### 2.2 `/mi/progreso` es el panel del entrenador, sin traducir

`ClientProgresoRoute.jsx` monta `<Dashboard audience="client"/>`. Es el mismo
componente de 405 líneas que usa el entrenador: «Cómo va», «Desde que empezaste»,
«El cuerpo», «El entreno», «El plan» y «Cómo lo lleva». En el teléfono son cuatro
pantallas de scroll con tonelaje por microciclo y volumen por grupo.

**Las capturas 2 (móvil) y 4 (PC) del dueño son el mismo componente.** Es el que
nunca se rediseñó, y está anotado como pendiente (`A-08`) en el propio archivo.

### 2.3 Quedan instrumentos del entrenador dentro de piezas del cliente

- **El anillo de macros por comida** (`MealCard.jsx:1423`) se pinta **solo para el
  cliente** (`!editable`): «Objetivo de esta comida», 40 g / 140 g / 20 g y
  18 % / 62 % / 20 %. Es el reparto del entrenador metido en el desayuno.
- «Cómo vas» gasta media pantalla en decir que su entrenador no le ha fijado
  objetivo.
- El tonelaje por microciclo, en violeta, en un teléfono.

### 2.4 Y su misión no está destacada en ninguna parte

Lo que viene a hacer está repartido en tres sitios y ninguno lo nombra: anotar la
sesión está en «Entreno», apuntar el peso detrás de «Tú» → asistente, y entregar
la revisión detrás de otra fila. La portada le ofrece una tarjeta y **tres filas
de consulta**. Lo que viene a mirar está más accesible que lo que viene a hacer.

---

## 3. Las tres decisiones del dueño (12 sep)

1. **Las gráficas en el teléfono: como en Efort.** No desaparecen y no se
   amontonan: se llega a ellas y **se ve una cada vez**, elegida por él.
   Verificado en `capturas/referencias/efortcoach/app movil/`: su pantalla de
   «Estadísticas» tiene dos pestañas (Ejercicios · Peso corporal), un selector de
   métrica (`E1RM ▾`), un rango (1M · 3M · Todo), **una sola curva grande** y
   debajo el registro en crudo.
2. **El PC usa la gramática del entrenador: mesa + costado.** La misma de
   `NutritionModule` y de Entreno. No las pilas del teléfono.
3. **Baja lo suyo, traducido.** El filtro no es de quién es el instrumento: es si
   contesta una pregunta suya. Confirma la ley levantada el 14 de septiembre.

---

## 4. El modelo

> **El teléfono ejecuta la jornada. El PC es el repaso.**
> Ninguna pantalla es la otra estirada.

| | Teléfono | PC |
|---|---|---|
| Para qué se abre | anotar la sesión, apuntar el peso, entregar la semana | repasar la semana y entender cómo va |
| Mueble | una pila corta, un sujeto por pantalla | mesa a lo ancho + costado de lecturas |
| Gráficas | solo en «Tu progreso», **una cada vez** | una grande con su tabla, y sparklines en el costado |
| Dieta | el día, plegado, sin instrumental | la mesa entera: días en cinta y **opciones en columnas** |

### La firma: «Tu semana»

Tres renglones con marcas que se rellenan —sesiones, pesajes, revisión—, la misma
pieza en los dos aparatos. Es lo único que el cliente viene a hacer, y hoy no
está en ninguna pantalla.

**No lleva semáforo ni porcentaje.** Dice cuántas van de cuántas, y de lo que
falta no se le echa la culpa: la app resalta información, no reprende
(`la-app-no-receta`, `ley-del-color`).

---

## 5. Los movimientos

### Tanda 1 — el teléfono suelta el panel del entrenador

- **`D-01` · `Client/TuProgreso.jsx` (nuevo).** `/mi/progreso` deja de montar
  `<Dashboard audience="client"/>`. Tres pestañas (Tu peso · Tu entreno · Tu
  dieta), rango 1M · 3M · Todo, **una** gráfica y el registro debajo. El dato ya
  existe entero: `weightSeries`, `buildWeeklySeries`, `metricPoints`, `dietLog`.
- **`D-02` · fuera el anillo de la comida.** `MealCard.jsx:1423`, el bloque
  `!editable && objetivo`. Se va con sus porcentajes; la cifra del día se queda.
- **`D-03` · `Client/TuSemana.jsx` (nuevo).** Sesiones anotadas de las pautadas,
  pesajes de los pedidos y el estado de la revisión. Sustituye las filas «Tu
  semana» de la portada. Sin migración: `currentCheckInPeriod`, `weighInsTarget`
  y los microciclos ya lo saben todo.

### Tanda 2 — el PC deja de ser el teléfono con una columna

- **`D-04` · la mesa de la dieta.** En ≥1024 px, `ClientDietRoute` deja de montar
  `ClientDiet`: días en cinta (la gramática de `TiraDeLaDieta`), **las opciones de
  cada comida en columnas y ninguna plegada**, y en el costado el día, sus
  calorías y las pautas. `MealCard` no sirve tal cual: es un acordeón con
  pestañas por opción.
- **`D-05` · el inicio.** Mesa: la tarjeta de la sesión a medias —ancha, con «lo
  que te queda» al lado— y **la tabla de la semana** (sesión · día · series ·
  estado). Costado: «Tu plan» y «Desde que empezaste».
- **`D-06` · el progreso.** La pieza de `D-01`, en mesa + costado: la curva
  grande con su tabla de pesajes, y al lado su entreno, sus fotos y **lo que le
  dijo su entrenador** (dato que ya existe y no ve nadie).

### Tanda 3 — lo que baja, traducido

- **`D-07` · las pestañas que faltan de «Tu progreso»**: kilos por semana, un
  ejercicio y sus calorías.
- **`D-08` · retirar `audience` del `Dashboard`.** Cierra `A-08`: cuando ninguna
  ruta del portal lo monta, la prop deja de tener sentido en 18 archivos.

### Lo que NO se toca

- **`/mi/rutina`** — es la pantalla que mejor está y el dueño no la señala.
- **La hoja de la sesión** en el teléfono. Es lo que funciona.
- **Ningún token, ninguna fuente.** Rediseñar no es cambiar valores
  (`rediseno-no-es-cambiar-tokens`).

---

## 6. Lo que este plan NO resuelve

- **El chat.** Sigue siendo el hueco más grande contra Coachway y Efort, y no
  entra aquí.
- **La miniatura del ejercicio.** Descartada por dato, no por diseño:
  `catalog_exercises` no tiene columna de imagen.
- **El tema oscuro del portal.** Las capturas del dueño son del hierro; el
  acabado de la tanda 0 se hizo en claro.

---

# 7. SEGUNDA VUELTA (12 de septiembre, misma tarde)

El dueño acepta el reparto —«me gusta bastante el concepto»— y corrige cinco
cosas. El prototipo se reescribe entero; **lo de arriba sigue vigente salvo donde
esta sección lo contradice**, y lo contradice en dos sitios: la superficie y la
lista de destinos.

## 7.1 Lo que pidió, literal

1. «Busco un diseño más moderno, más estilo iOS, limpio e intuitivo, para app y
   para PC.»
2. «Dieta no debería tener 500 días como el ejemplo que estás poniendo. Para el
   móvil una vista de día, estilo Coachway o MyFitnessPal. Y en el PC, con
   mostrar el *schedule* estilo móvil y sus dos dietas vale.»
3. «Mi progreso, para el PC, no deberías escatimar en gastos: algo informativo
   similar a lo que tiene el entrenador. Para el móvil no abusar del exceso de
   información; información básica en entrenamiento estilo *logbook*.»
4. «El cliente —o si no, la propia app— ha de añadir semanas nuevas, de forma que
   cuando acaba su microciclo rellenado añade otro.»
5. «Falta, tanto en móvil como en PC, una ventana de revisiones donde apunte sus
   pesos diariamente y suba su revisión con sus fotos.»

## 7.2 Dos de las cinco ya estaban construidas, y ese es el hallazgo

- **Añadir la semana ya se puede.** `continueProgram(clientId)` la crea;
  `HojaNueva` es la última hoja de la cinta del teléfono (`CintaDeHojas.jsx:159`)
  y en escritorio es el `+ Semana 3` del `WeekPicker` (`ClientRoutine.jsx:1227`),
  solo del bloque abierto. **Lo que no existe es el momento**: hay que ir a
  buscarlo pasando la última hoja. Por eso el movimiento no es construir el
  gesto, es *anunciarlo* al cerrar el microciclo — y ofrecer que se abra sola.
- **La revisión ya existe entera**: `/mi/evolucion` (báscula y medidas),
  `/mi/evolucion/fotos`, `ReviewWizard` por pasos y `ClientWeek` para entregar.
  **El fallo es de sitio**: está repartida entre «Tú» y una ruta empujada, o sea
  a dos toques, y el prototipo de la primera vuelta ni la enseñaba. Sube a
  destino.

## 7.3 Las decisiones de esta vuelta

### A. La superficie cambia, y con ella la letra

Gris del sistema (`#f2f2f6`) con tarjetas blancas —la profundidad es el escalón,
no el filete—, listas agrupadas con separador metido a la izquierda del rótulo,
segmentados con pastilla, radios de 16/10 px y sombras de 1 px. Es la norma
vigente de la casa (`estandar-visual-2d-minimal`), que el portal no cumplía.

**Y entra Inter en lugar de Archivo.** Archivo es tipografía de rótulo —ancho
variable, itálica de titular— y es la razón de que el portal pareciera impreso.
Esto **contradice a propósito** el «ninguna fuente» de §5: congelar los tokens es
lo que hizo imposible que se viera nuevo (`estudio-diseno-efort`). El azul
`#3B49DF` no se toca: la ley del color ya está decidida.

### B. La barra del teléfono pasa a CINCO destinos

`Hoy · Entreno · Dieta · Revisión · Tú`. Sus tres misiones tienen que estar las
tres en el primer nivel. «Tu progreso» se queda como pantalla **empujada** desde
«Hoy» y desde «Tú» — se mira, no se hace.

### C. La dieta: el día, no el catálogo

La cinta `D1…D9` de la primera vuelta era **el instrumental del editor**. El
modelo real es otro: el entrenador monta dos días con nombre —«Alto», «Bajo»— y
los reparte por las casillas del ciclo (`cycleMap`, `planDays`). Así que:

- **Teléfono:** siete casillas con el día que toca a cada una, y debajo **el
  día**, con sus comidas. `CintaDeDias` ya pinta eso.
- **PC:** arriba **el horario** —los siete días con su dieta, sus calorías y la
  sesión de ese día— y debajo **las dos dietas completas, una al lado de la
  otra**. Eso es «la visión de entrenador» que pidió.
- **En los dos, la opción se ELIGE, no se despliega**: un segmentado por comida
  con la opción a la vista. Muere el acordeón, que es lo que llamó incómodo.

### D. El progreso, a dos alturas

- **Teléfono:** dos pestañas. *Tu peso* —una curva, sus pesajes— y *Tu entreno*
  como **logbook**: la lista de sus ejercicios con lo último y su mejor serie, y
  el historial de uno al tocarlo. Ni tonelaje, ni volumen por grupo.
- **PC:** sin escatimar. Curva del peso con la media semanal encima, series por
  semana, kilos movidos por semana, la tabla de ejercicios con el cambio a cuatro
  semanas, medidas y fotos comparadas. **Lo único que no baja sigue siendo el
  veredicto** (adherencia como nota, «en rumbo»): `la-app-no-receta`.

## 7.4 Los movimientos, corregidos

| | Qué | Estado |
|---|---|---|
| `D-01` | `TuProgreso.jsx` — pestañas, rango, una curva | sigue, **+ logbook** como segunda pestaña |
| `D-02` | fuera el anillo de macros de `MealCard` | sin cambios |
| `D-03` | `TuSemana.jsx` en la portada | sigue |
| `D-04` | la dieta del PC | **cambia**: horario + las dos dietas, no la mesa de un día |
| `D-05` | el inicio del PC | sigue, + el aviso de la semana nueva |
| `D-06` | el progreso del PC | **crece**: seis lecturas, no dos |
| `D-07` | las pestañas que faltaban | absorbido por `D-01` y `D-06` |
| `D-08` | retirar `audience` del `Dashboard` | sigue, cierra `A-08` |
| `D-09` | **la dieta del teléfono pasa a vista de día**, opción por segmentado | nuevo |
| `D-10` | **«Revisión» sube a destino** de la barra (cinco pestañas) y recoge el pesaje del día, las tres fotos, la entrega y el historial | nuevo |
| `D-11` | **el aviso de la semana nueva** al cerrar el microciclo, en los dos aparatos, con «que se abra sola cada lunes» | nuevo |
| `D-12` | **la superficie**: gris del sistema, tarjetas, listas agrupadas, segmentados, Inter | nuevo, y va primero |

## 7.5 El prototipo

`docs/portal-dos-aparatos.html`, reescrito. Diez pantallas clicables —seis del
teléfono, cuatro del PC— y **los estados se pueden enlazar**: `#movil/dieta`,
`#pc/progreso`. Los gestos que prueban algo funcionan de verdad: cambiar de día
en la dieta, cambiar de opción en una comida, pasar a la hoja de la semana que
aún no existe, cambiar de pestaña en el progreso.

### Tres trampas de esta vuelta

- **`<svg><use>` sin `viewBox` no escala**: el símbolo se dibuja a 1:1 y la caja
  de 14 px lo recorta. Los ticks de la sesión salían como un borrón.
- **La pantalla del teléfono necesita `flex:1;min-height:0`**, o crece con su
  contenido y empuja la barra del pulgar fuera del marco, que la recorta sin
  avisar.
- **Otro gráfico plano.** «Tus calorías, semana a semana» eran seis barras
  idénticas porque el plan no ha cambiado: lo mismo que ya pasó con la curva
  plana. Lo que no cambia se cuenta con la cifra y la fecha; en su sitio va
  «series por semana», que sí se mueve.

---

# 8. TERCERA VUELTA (12 de septiembre, misma tarde)

## 8.1 Lo que pidió, literal

> «Me gusta bastante el concepto, pero tengo un par de cosas.
>
> En el pc, no le veo mucho sentido a que no muestre la dieta del día, muestre el
> día alto y el bajo, quizás emular un poco la visión del móvil pero con las
> gráficas e información del entrenador.
>
> Para el caso del móvil, añade iconos, por ejemplo carpetas donde los ficheros,
> iconos para comidas y que sea más bonito de ver, hazlo más limpio, más
> estructurado, más pulido.
>
> Cuando el microciclo no es semanal, que se abra sola cada lunes no tiene
> sentido.
>
> Quizás mis revisiones desde el ordenador debería ser más sencillo, veo un poco
> complicado el anotar o apuntar el peso.»

## 8.2 El PC miraba el armario, no el plato

`D-04` de la vuelta anterior decía «horario + las dos dietas, **no** la mesa de un
día». **Estaba mal, y el error era de sujeto**: el cliente no elige entre dos
dietas, tiene una hoy y otra mañana. Enseñarle «Alto» y «Bajo» enteras, una al
lado de otra, es enseñarle el armario del entrenador.

El PC pasa a mirar **lo mismo que el teléfono —el día—** y lo que añade es lo que
en 392 px no cabe:

- el **horario de siete casillas es el mando**, no un rótulo: se pulsa, y es el
  mismo gesto que las siete casillas del teléfono;
- las cuatro comidas con **todas sus opciones desplegadas a la vez** (en el
  teléfono hay que ir cambiando el segmentado, una por una);
- el costado del entrenador: sus pautas, las cifras del plan, las equivalencias.

Las dos dietas enteras **no se tiran**: bajan al segundo tramo de un segmentado
—«El día» / «Las dos dietas»—, que es su frecuencia real. Se miran una vez al mes
para entender el plan, no cada mañana para saber qué desayunar.

## 8.3 Siete barras que duraron una captura

El costado iba a llevar el **vaivén del ciclo** en siete barras de kcal. Se
construyó, se capturó y se tiró en la misma vuelta:

**3.100 contra 2.600 es un 16 %.** En una banda de 52 px son ocho píxeles, así
que las siete salían iguales y la fila entera se leía como un control
estropeado. Es **la tercera vez** que pasa lo mismo en este proyecto —la curva
plana, «tus calorías semana a semana», y ahora esto—, y la regla ya se puede
escribir: *antes de dibujar una serie, mirar cuánto se mueve; si el recorrido no
llega a un tercio de la caja, no es un gráfico, es un adorno.*

Y aunque se hubieran visto, no decían **nada que las casillas de arriba no
dijeran ya con su cifra**.

En su sitio va la gráfica que esta pantalla sí necesita, y que contesta la única
pregunta que un cliente le hace a su dieta: **si está funcionando**. Es la curva
de su peso desde el día que empezó *este* plan —no la de «Mi progreso», que
responde a otra cosa—, con lo que lleva ganado y a qué ritmo.

## 8.4 Iconos sí, colores no

Entran tres piezas nuevas en el teléfono:

- **la tesela**: 29 px, radio 8, fondo del sistema, en cada fila de lista, con el
  separador entrando a 57 px —a la altura del rótulo, no del icono—;
- **las carpetas**: lo que le ha mandado el entrenador sale en cuadrícula, no en
  filas de ajustes. Un PDF se busca por el dibujo y por el sitio; una fila se lee;
- **el icono de cada comida**, que sale del **nombre que escribió el entrenador**.
  En `dietSheet.js` una comida es un objeto con `name`, `note`, `target` y
  `options`, y el nombre es texto libre, así que un mapa de palabra → icono es
  exactamente lo que ya hace `varianteDeTexto()` para decidir si un día es de
  entreno o de descanso. Taza, cuenco, manzana, batido, y el tenedor cuando no
  reconoce la palabra.

**Lo que NO entra es el color por categoría**, el de las pastillas de Ajustes de
iOS. La ley del color lo prohíbe —*si el color no compara ni juzga, es adorno*—
y el portal comparte tinta con la app del entrenador, donde el azul ya significa
«tocable» y el semáforo «ojo con esto». **Distingue el dibujo.** Queda como
decisión abierta del dueño: si lo quiere con color, hay que tomarla para los dos
lados a la vez, no solo para el portal.

## 8.5 El lunes no es el microciclo

`D-11` decía «con la alternativa de **que se abra sola cada lunes**». El dueño lo
tumbó y tenía razón dos veces:

1. **El vocabulario.** El prototipo decía «Semana 3» y el código dice
   `Microciclo`: `unitLabel()` en `src/domain/training.js:191` devuelve siempre
   eso, nunca «Semana». El portal lo respeta en `CintaDeHojas` y el prototipo no.
2. **El disparador.** Un microciclo puede medir cinco días o nueve —el reparto
   rotativo ya está montado así en `CintaDeDias`—, así que atar la oferta al
   calendario parte el plan en cuanto el ciclo deja de medir siete días.

La casilla pasa a decir **«que el siguiente se abra solo al cerrar este»**: el
disparador es el hecho, no la fecha, y así vale para los dos casos.

**Donde sí se sigue diciendo «semana» es en la revisión, y a propósito**: la
entrega va por `weekStart` en `ClientWeek.jsx:104`, es semanal de verdad. El
microciclo es la unidad del entreno, no la de la revisión, y confundirlas es el
mismo error del revés.

## 8.6 Apuntar el peso eran tres puertas

Lo que el dueño veía complicado se puede contar: **apuntar el peso estaba en tres
sitios de la misma pantalla** —la caja del costado, la fila «Corregir» de la
tabla de pesajes, y el botón genérico «Seguir con la entrega»—. Con tres puertas
a lo mismo, cualquiera de las tres parece la equivocada.

Queda **una caja con cuatro pasos** —peso, medidas, fotos, cómo lo has llevado—,
cada uno con su marca y su verbo, y el campo del peso **dentro del primero**:

- la cifra viene puesta con el último peso: se mira y se pulsa, son dos gestos;
- si estaba mal, **se escribe encima** y el botón vuelve a ofrecerse solo. No hay
  modo «editar», que era la tercera puerta;
- cada paso lleva su propio verbo, así que arreglar una sola cosa no obliga a
  pasar por un asistente de cuatro pantallas.

**Desaparece la tabla de pesajes de esta pantalla**: sus cinco filas ya están en
«Mi progreso», que es la pantalla del histórico. Aquí basta con los siete puntos
de la semana.

**Y la portada deja de pedir el peso.** Antes tenía su propia barra de cuatro
tiras y un «Seguir con la entrega»; ahora dice qué falta —con la misma marca que
la pantalla de revisión— y lleva. Una oferta, una puerta.

La misma pieza de cuatro pasos entra en el teléfono, sustituyendo a las cuatro
tiras: para saber qué faltaba había que **leer la frase y contar las tiras**.

## 8.7 Los movimientos, corregidos

| | Qué | Estado |
|---|---|---|
| `D-04` | la dieta del PC | **rehecho**: el día es el sujeto; las dos dietas al segundo tramo |
| `D-05` | el inicio del PC | **+ la portada deja de pedir el peso**: dice qué falta y lleva |
| `D-11` | el aviso del microciclo siguiente | **corregido**: «Microciclo», y la oferta atada al hecho |
| `D-13` | **la tesela** en cada fila de lista, en gris | nuevo |
| `D-14` | **las carpetas** para lo que le ha mandado el entrenador | nuevo |
| `D-15` | **el icono de cada comida**, derivado del nombre como `varianteDeTexto()` | nuevo |
| `D-16` | **la entrega en cuatro pasos** con verbo propio, en los dos aparatos | nuevo |
| `D-17` | **el campo del peso en el PC**, único, dentro del primer paso | nuevo |
| `D-18` | **fuera la tabla de pesajes** de «Tu revisión»: vive en «Mi progreso» | nuevo |
| — | el vaivén del ciclo en barras | **construido y tirado**, ver 8.3 |

## 8.8 El prototipo

`docs/portal-dos-aparatos.html`, tercera vuelta. Los gestos nuevos están probados
con el navegador, no solo mirados: cambiar de día en el horario del PC cambia la
cabecera, los macros, la chapa y las cuatro comidas; el segmentado lleva a las dos
dietas; el campo del peso apunta, marca el sábado y vuelve a ofrecerse al
corregir; la casilla de la oferta alterna en los dos aparatos.

### Dos trampas de esta vuelta

- **`.comida .ch span` le robaba la tinta a dos piezas nuevas.** Una regla vieja
  de dos clases gana a `.ico` y a `.tit`, que tienen una, así que el icono salía
  en gris de subtítulo y **el nombre de la comida también** —el `<b>` heredaba el
  gris de su padre—. Es la misma familia de colisión que ya mordió con `.tira` y
  con `.rail`: **en una hoja larga, una clase nueva de una palabra casi nunca
  gana**.
- **`toLocaleString` en español no agrupa los números de cuatro cifras**: 3100
  sale «3100», no «3.100», y en esta pantalla convive con «900 kcal» de una
  comida. El separador hay que ponerlo a mano.

---

# 9. CUARTA VUELTA (12 de septiembre, por la tarde)

## 9.1 Lo que pidió, literal

> «Tampoco me gusta el formato equivalencias, quizás debería ser más sencillo de
> ver en la propia dieta.
>
> Mi progreso quizás está bien que se parezca más a lo que tiene el entrenador, y
> la sesión similar también para el caso del PC, aunque está muy bien el concepto
> de lo que se le pide y lo que ha de hacer y por ese mismo hecho enfocar la
> página.»

Tres cosas, y las tres son **la misma**: donde el portal se inventó una pieza
para el cliente, entra la pieza que el entrenador ya tiene. Esta vuelta no añade
vocabulario nuevo — quita el que sobraba.

## 9.2 Las equivalencias eran un documento con tres puertas

Estaban en tres sitios, y ninguno era el sitio:

1. una fila al pie de la dieta del teléfono («Equivalencias · cambiar un alimento
   por otro»),
2. una **carpeta** en «Tú», entre el plan en PDF y el contrato,
3. una caja en el **costado** de la dieta del PC («Ver tus equivalencias ›»).

Las tres llevaban a una lista aparte. Y la pregunta que resuelve una equivalencia
—«no tengo plátanos»— se hace **con el desayuno delante**, no en una pantalla a la
que hay que ir y en la que hay que buscar la fila que ya estabas mirando.

**En la aplicación esto ya está resuelto, y no así.** `MealCard` abre las
equivalencias de un alimento **debajo de su fila**, como filas hijas de la misma
tabla (`.food-row.is-equiv`), con la ración recalculada y el desvío al lado; la
ventana quedó solo para lo que sí es una decisión —«Usar» esa ración, montar un
grupo, decidir si el cliente ve la lista—. Y al cliente **le llegan**: la
migración `0113` publica los grupos con `equiv_groups(target)` (ver la memoria
`grupos-de-equivalencia`).

Así que el movimiento es **quitar tres puertas** y enseñar la pieza que ya existe,
con lo que no es suyo fuera:

- **sin «Usar»**: el cliente no cambia su dieta, viene a saber cuánto pesar;
- **sin ventana**: si no hay que elegir nada, la lista de tres raciones es todo;
- **el dibujo del cambio pegado al nombre**, como el botón de la aplicación, que
  es lo único que dice que esa fila tiene salida;
- y el rótulo de la lista enseña el gesto: «Tus comidas · **toca un alimento para
  cambiarlo**». Una frase donde hace falta ahorra una pantalla de ayuda.

## 9.3 «Mi progreso» pasa a ser el Resumen, con su gramática

La pantalla tenía cajas propias —una gráfica grande, dos de barras, una tabla y
**cuatro cajas apiladas** en el costado— y se leía como un informe. El Resumen del
expediente, que es a lo que el dueño quiere que se parezca, tiene otra gramática:

| | En el panel del entrenador | Lo que había en el portal |
|---|---|---|
| rejilla | `mosaico` de **doce columnas** con tramos (8+4, 12, 12) | cajas apiladas y una `rejilla dos` |
| tarjeta | rótulo en voz baja + **puerta** («Ver a fondo») | un `h4` y nada más |
| el peso | `ReviewChart`: **dos bandas** con el mismo eje de semanas | una curva sola |
| el costado | **un panel** de apartados con filete (`.es-panel`) | cuatro tarjetas |
| el fondo | ventanas `PanelCuerpo` / `PanelEntreno` | una tabla suelta en la página |

Todo eso entra: «Cómo vas» con la proyección de la fase (8), «Desde que
empezaste» (4), «Tu cuerpo» (12) con la gráfica de dos bandas y sus puertas
«Tus fotos» y «Ver a fondo», y «Tu entreno» (12) con el tonelaje por microciclo y
el volumen por músculo contra su tope. El costado se funde en un panel: «Tu
plan», «Cómo lo llevas» y «Tus medidas». Las fotos suben a ser **puerta** de «Tu
cuerpo», que es donde se pregunta por ellas.

### Dos diferencias a propósito con el panel del entrenador

1. **La banda de abajo son los pasos, no las calorías.** El plan no ha cambiado
   en cinco semanas, así que la escalera de kcal saldría plana — y sería la cuarta
   serie muerta que dibuja este estudio (ver 8.3). Lo que no cambia se cuenta con
   la cifra y la fecha, y está en el panel del costado. El conmutador
   «Calorías / Pasos» se queda, porque es el de la tarjeta del entrenador.
2. **El músculo que se pasa de su tope no se pinta en rojo.** En el panel del
   entrenador sí (`--negative`). Aquí el tope lo puso él: teñir al cliente por
   cumplir el plan que le dieron es el reproche que este portal no hace.

Y **en el teléfono el progreso no se toca**: allí los instrumentos se ven de uno
en uno porque el límite son 392 px, no el público.

## 9.4 La sesión del PC: la hoja, y nada más en la página

La pestaña «Mi rutina» estaba en la cinta del PC desde la primera vuelta y **no
llevaba a ninguna parte**. Y en la aplicación el cliente recibe, en un monitor, la
misma lista de fichas que en el teléfono:

- `ClientRoutine.jsx:560` monta **siempre** `ExerciseList` —tarjetas con tres
  cajas grandes por serie, que es lo que hace falta con el pulgar—;
- `WorkoutLogEditor.jsx:871` (`const Lista = esTelefono ? ExerciseList :
  HojaDeSeries`) cambia a la **hoja** en cuanto hay ancho, porque programar es
  mirar de un vistazo diez ejercicios y comparar lo que se puso con lo que hizo.

El cliente en su ordenador hace exactamente eso: mirar lo que le piden y lo que
lleva. Así que va la hoja: **te pide (kg · reps · RIR) ‖ has hecho**, con la
**costura** bajando por la tabla de cada ejercicio, los rótulos repetidos en cada
uno —con una sola cabecera arriba, en el quinto ejercicio hay seis casillas
iguales de tres caracteres y el rótulo que las nombra a seiscientos píxeles—, lo
pedido en su casilla y lo hecho en un renglón hasta que se escribe, y **una
repetición por debajo de la pedida en negativo**, que es lo único que hay que ver
sin leer.

**Y «enfocar» es quitar:** esta pantalla no tiene costado, ni gráficas, ni
lecturas del bloque. Arriba, «Hoy te pide · Legs B · 6 ejercicios, 18 series» con
su tira de series; al lado, «Lo que llevas · 5 de 18» y el único verbo de la
página. Lo demás vive en «Mi progreso», que es la pantalla que sí es de
instrumentos. Sin veredictos: «5 de 18 series» es un hecho.

## 9.5 Los movimientos

| | Qué | Estado |
|---|---|---|
| `D-09` | la dieta del teléfono | **+ las equivalencias en la fila del alimento** |
| `D-19` | **fuera las tres puertas de «Equivalencias»** (fila, carpeta y caja del costado) | nuevo |
| `D-20` | **las filas hijas del alimento** en los dos aparatos, sin «Usar» ni ventana | nuevo |
| `D-21` | **«Mi progreso» con la gramática del Resumen**: mosaico de doce, tramos y puertas | nuevo |
| `D-22` | **la gráfica de dos bandas** del `ReviewChart` en el portal, con los pasos abajo | nuevo |
| `D-23` | **el costado como un panel** (`.es-panel`), y las fotos como puerta de «Tu cuerpo» | nuevo |
| `D-24` | **la ventana «a fondo»**, una para el cuerpo y otra para el entreno | nuevo |
| `D-25` | **«Mi rutina» en el PC**: `HojaDeSeries` para el cliente cuando hay ancho | nuevo |
| `D-26` | la página de la sesión **sin costado ni lecturas**: el foco y la hoja | nuevo |

`D-25` es el único que toca dominio de verdad: hoy `ClientRoutine` no conoce la
hoja, y qué columnas se pautan lo decide `camposDeLaHoja` (`TablaDeSeries`). Lo
demás es maquetación y borrado.

## 9.6 El prototipo

`docs/portal-dos-aparatos.html`, cuarta vuelta. Probado con el navegador y no
solo mirado: las filas de alimento abren y cierran sus equivalencias en los dos
aparatos, la pestaña «Mi rutina» existe y enseña la hoja, las dos puertas «Ver a
fondo» abren la misma ventana —y también el «ver todos tus pesajes» de la
revisión, que antes prometía una tabla de otra pantalla—, y el par
«Calorías / Pasos» se marca.

### Tres trampas de esta vuelta

- **`class="g pide"` para el rótulo de la mitad izquierda**: `.pide` es la casilla
  de lo pedido —fondo gris y radio 8—, así que el rótulo salía dentro de una
  pastilla gris de trescientos píxeles. Dos usos de la misma palabra en la misma
  hoja; el rótulo pasa a `izq` / `der`.
- **`1fr` en las columnas de la hoja**: sin costado, a 1.400 px, tres cifras de
  dos caracteres se estiran a ochocientos píxeles cada una y la hoja deja de ser
  una hoja. Las columnas van en píxeles y la ficha se parte en dos —nombre a la
  izquierda, tabla a la derecha— con **flex y no grid**: con la tabla cruzando dos
  filas del grid, el navegador reparte su alto entre las dos y la nota del
  entrenador se iba al centro de la ficha.
- **`.alim + .alim::before`**: entre dos alimentos ahora puede haber un bloque de
  equivalencias, y con el hermano adyacente la fila de después pierde su filete
  —también cerrado, porque la adyacencia es del árbol y no de lo que se pinta—.
  Hermano general (`~`).

### Y una incoherencia de fixture que salió al cuadrar las cifras

El prototipo decía «cinco semanas» y «el mismo plan desde el 11 de agosto», y a la
vez la tabla de revisiones entregadas tenía una semana 2 del 11 al 17 de agosto
—o sea, seis— y una respuesta del entrenador diciendo «sube 100 g de carbos», que
es un cambio de plan. Con la gráfica y la tabla del histórico saliendo ahora del
mismo dato, eso se ve a la primera. Cuadrado: cinco semanas desde el 11 de agosto,
la curva es la **media semanal** (62,3 → 64,2), los tres pesajes de esta semana son los
de lunes, martes y jueves —el de hoy es justo lo que la pantalla viene a pedir— y
el último es 64,7; dos
microciclos cerrados (70.000 y 74.080 kg) más el que está en curso (3.240), que
suman los 147.320 de «Desde que empezaste».

---

# 10. LO CONSTRUIDO EN `src/`

Con el visto bueno del dueño al `.html`. **Lo primero que hay que saber: la mayor
parte de este estudio YA ESTABA construida** por las sesiones del 12 al 14 de
septiembre, con la documentación diciendo lo contrario. Antes de construir un
movimiento de aquí, comprobarlo contra el árbol.

## 10.1 La quinta vuelta, y `D-22`

- **«Mi rutina» en el PC** (`D-25`, `D-26`). Piezas nuevas:
  `Client/HojaDelCliente.jsx` —la hoja como TABLA, cabecera escrita una vez y
  pegajosa, el ejercicio como rótulo de sus series— y `Client/FocoDeLaSesion.jsx`
  —la tarjeta del foco con la muesca por serie y el único verbo—. `ClientDay`
  recibe `enEscritorio` y elige hoja o `ExerciseList`, igual que hace
  `WorkoutLogEditor`. El costado desaparece en el nivel de hoja.
  **La medida es 880 (`--max-w-columna`) y no los 940 del prototipo**: 940 no es
  ninguno de los cuatro anchos de la casa, y la hoja necesita 637.
- **La dieta del PC.** Los dos mandos eran ALTERNATIVOS —la cinta si el ciclo
  está repartido, los chips si no—, así que a quien lo tuviera repartido las
  dietas enteras no le salían por ningún lado. Ahora son un `SegmentedControl`
  «El día» / «Tus dietas» sobre el MISMO cuerpo.
- **`D-22`**: el `Dashboard` le pasaba `[]` al `useReviewTrack` del cliente, así
  que su curva salía sola, sin la segunda banda. Ahora recibe su track y abre en
  pasos.

## 10.2 Los iconos: `D-13`, `D-14`, `D-15`

- **`D-13` · la tesela.** `Fila` acepta `icono` y lo pinta en `.list-icon`, que
  ya existía sin fondo: se lo lleva puesto la tesela, así que las tres filas del
  entrenador que la usaban —los pasos del alta, las renovaciones de Cobros, la
  tabla de métricas— la ven también. Gris, la misma para todas: quien distingue
  es el dibujo. El filete entre filas entra a 58 px, a la altura del rótulo.
  Con dibujo en cada fila se vio que **el punto de «esto te espera» empujaba la
  fila 19 px** y descuadraba la de en medio de cada grupo: sale del flujo y se
  va a la sangría de la tarjeta.
- **`D-14` · las carpetas.** `.papeles` / `.papel`, la hermana en cuadrícula de
  `.list`: misma superficie, mismo canto, misma tesela. La montan
  `IntakeDeliverables` —lo que te dejó al empezar— y la lista de la carpeta
  compartida de `ClientFolder`, que eran dos columnas de `card-inset` con
  «Abrir ›» al canto. El verbo se va con las filas: la tesela entera es el
  enlace. `auto-fill` desde 150 px: dos columnas en el teléfono, cuatro en una
  ventana de escritorio, sin un `@media`.
- **`D-15` · el dibujo de cada comida.** `iconoDeComida()` en
  `domain/dietSheet.js`, al lado de `varianteDeTexto()` y con su misma ley: la
  palabra entera, y un cubierto para lo que no reconoce. La casilla de la
  izquierda de `.comida-cab` **dice qué es esta comida, y lo dice distinto según
  quién mire**: al que la ordena, su número; al que la come, el dibujo. Es la
  misma casilla, no dos.

## 10.3 Y `D-08` no se puede hacer: su premisa es falsa

`D-08` decía «cuando ninguna ruta del portal monta el `Dashboard`, la prop
`audience` deja de tener sentido». **Sí lo monta**: `ClientProgresoRoute` es
`<Dashboard audience="client" />`, y eso no es un resto por limpiar —es la
decisión de `9.3`, que «Mi progreso» sea el Resumen con su gramática, y lo que
`D-22` vino a arreglar—. Retirar la prop sería borrar la pantalla del progreso
del cliente. `A-08` se cierra al contrario: el `audience` del `Dashboard` es la
pieza, no la deuda.

`D-19` también es un no-op: las tres puertas a «Equivalencias» nunca existieron
en `src/`, solo en el prototipo.

## 10.4 Lo que queda, y por qué no se ha hecho

**`D-10`** —la barra del teléfono a CINCO destinos, con «Revisión»—. Contradice
de frente la decisión escrita en `routes.jsx`, del mismo día: cuatro, porque
«una pestaña permanente para eso es una pestaña apagada seis días; el ritual se
convoca desde Hoy». El prototipo v5 enseña cinco. Es la navegación primaria del
portal y **lo decide el dueño**.

### La trampa de esta tanda

**`.carpeta` y `.carpetas` YA EXISTÍAN** —son las carpetas de una copia de
seguridad en Ajustes, con `display: flex` y radio `--r-lg`—, y `ajustes.css` se
importa después de `superficies.css`. La rejilla nueva salía en UNA columna y con
otro radio, sin un solo aviso: `verify-styles` comprueba que toda clase escrita
exista, no que dos hojas declaren la misma. Se vio midiendo con
`getComputedStyle` en la probe, no leyendo. De ahí `.papel`. Familia de
`.pide` / `.g` y de `.comida .ch span`: **antes de bautizar una pieza, buscar el
nombre en el CSS entero.**

---

# 11. LO QUE FALTABA DE «HOY» (13 sep 2026)

Tres cosas, y las tres cierran huecos abiertos en el §10: la casilla que el §8.3
dejó escrita y sin construir, el punto de «Revisión» que el `D-10` trajo sin su
aviso, y la razón por la que el apartado «Hoy» de la portada se quedaba mudo.

## 11.1 «Que el siguiente se abra solo al cerrar este» (`D-11`, la casilla)

Construida. Tres piezas y ninguna migración:

- **La regla sube al dominio.** `cicloPorAbrir(program)` en `domain/blocks.js`
  devuelve el número del microciclo que se abriría, o `null`. Tres condiciones y
  las tres son hechos: el ciclo abierto entero anotado, ninguna sesión a medias,
  y el bloque en curso. La portada la usaba escrita a mano; ahora la preguntan
  los dos —el aviso y el automatismo— y por eso no pueden discrepar.
- **La preferencia es del cliente**: `clients.preferences.rutina.seguirSolo`,
  que él mismo escribe por `set_client_preferences` (0008). Ni columna ni
  política nuevas. Lector: `abreSoloElCiclo(preferences)`.
- **El automatismo vive en el MARCO** (`useCicloAutomatico`, montado en
  `ClientLayout`) y no en la portada, porque el microciclo se cierra
  ENTRENANDO: colgado de «Hoy» habría que volver a la portada para que se
  abriera el siguiente, o sea justo el viaje que la casilla ahorra. No se
  dispara con el entrenador mirando («Ver como»): una preferencia del cliente no
  puede convertirse en una escritura del entrenador por abrir la pantalla.

La casilla es un `Switch` y no una casilla de tarea: no es algo que se marque
hecho, es un ajuste que queda puesto. Sale **solo donde la tarjeta decide** —la
portada—; en la cinta esto es una hoja más del programa. Y marcarla NO abre el
que tienes delante: ése tiene su verbo, y un interruptor que además ejecuta la
acción de al lado deja a quien lo marca sin saber qué acaba de pasar.

Sobre el azul lleno del aviso, el interruptor **invierte la pareja** —papel
donde iría la tinta—, que es lo mismo que ya hace su verbo: los dos colores del
interruptor de la casa (`--fill-strong` y `--accent`) son invisibles ahí, y el
segundo es literalmente el color de la tarjeta.

## 11.2 El punto de «Revisión» en la barra del pulgar

La barra tenía un punto y solo uno, en «Hoy», con un argumento bueno: cuatro
puntos encendidos dejan de decir «mira aquí». Ahora son **dos**, y el segundo no
es una excepción a esa regla:

- «Hoy» se enciende cuando hay LISTA que leer (`ClientUpdates`).
- «Revisión» se enciende el día que le toca entregarla y no lo ha hecho. Es la
  única de sus tres misiones **con fecha**, y la única que sin hacerse deja a su
  entrenador sin con qué trabajar — el mismo argumento con el que `D-10` la
  subió a destino. Se apaga al entregar, así que nunca es mobiliario.

El punto va en **acento**, no en brasa: no es un suspenso, es una oferta de
mirar (la ley del color). Lo demás sigue sin punto: el pesaje en «Tú», la dieta
en «Dieta».

La cuenta pasa al dominio: `estadoDeLaEntrega({ preferences, startDate, entrega,
today })` en `domain/calendar.js`, que empareja el periodo vigente con lo
entregado. La escribían a mano la portada y ahora también la barra, y con
cadencia quincenal las dos ventanas no son la misma: escrita dos veces, la fila
y el punto acabarían diciendo cosas contrarias.

## 11.3 Por qué «Hoy» se quedaba en una línea

El apartado «Hoy» de la portada contesta tres cosas —qué come, qué entrena,
cuánto anda— y a la mayoría de los clientes le salía **solo la de los pasos**.

`dietaDeHoy` exigía SIEMPRE un reparto: el mapa de casillas a días. Pero **con
una sola dieta no hay nada que repartir** —hoy come lo que come todos los días—
y ése es el plan normal: el alto/bajo es una pauta avanzada y repartir por días
es algo que el entrenador hace después, si lo hace. En la demo local, cinco de
seis clientes están así.

Ahora, con un solo día del plan, contesta sin reparto y sin mirar el tipo de
ciclo (un rotativo con una dieta también sabe qué toca). Con varias, sigue
haciendo falta el reparto y el ciclo semanal: elegir una de las dos sería
mandarle a comer el menú de otro día.

Dos remates de la misma línea:

- **Una dieta vacía no es una respuesta.** Sin comidas y sin objetivo la fila
  diría «Tu dieta · 0 comidas» y llevaría a una pantalla en blanco.
- **El nombre no viaja.** Con varios días el nombre ES la respuesta —«Alto»,
  «Descanso»: dice cuál le toca hoy—; con uno solo se titula «Tu dieta», porque
  «Dieta única» es como se llama por dentro un plan al que nadie le ha puesto
  días, no algo que el cliente haya leído nunca.

## 11.4 Lo que sigue sin decir «Hoy», y es a propósito

**Qué entrena.** Sin reparto por días (`weeklySplit` vacío) la aplicación no
sabe qué sesión es la de hoy, y `buildStrip` no marca ninguna: es el estado de
todo cliente al que su entrenador aún no le ha asignado días. Decir «la
siguiente» sería anunciar una sesión que a lo mejor no es la que va a hacer.
Queda escrito aquí porque es la única de las tres preguntas que «Hoy» no
contesta para esa gente, y porque la salida —pedirle el reparto al entrenador—
es de producto, no de esta pantalla.

---

# 12. LA DIETA CONTRA LA 5.ª VUELTA (13 sep 2026)

Lo que quedaba del prototipo en `/mi/dieta`. Los dos mandos y la cinta ya
estaban; faltaba lo que hace que el mando diga algo.

## 12.1 Una sola cuenta: `repartoDelCiclo`

En el prototipo, el reparto se escribía a mano en tres sitios —el subtítulo, la
línea de debajo del mando y las tarjetas de «Tus dietas»— y ya se contradecían
entre ellos. Ahora es una cuenta en `domain/nutrition.js`, del mismo mapa que
usa todo lo demás (`cycleMap`): cada dieta con sus kcal, sus macros, **cuántas
casillas le tocan y cuáles**. El día que el entrenador monte una tercera dieta,
las tres cosas lo dicen a la vez o ninguna.

## 12.2 La cinta dice QUÉ dieta le toca a cada día, y la muesca se retira

La cinta marcaba «los días altos» con una muesca. El prototipo la mata en la
quinta vuelta y tiene razón: **con dos dietas dice la verdad y con tres miente**
—el medio no es ni alto ni bajo— y clasificar por color está prohibido en esta
casa. En su sitio va la letra.

Y la letra no puede ser la inicial a secas, porque el nombre lo escribe el
entrenador: «Día alto» y «Día bajo» darían D y D los siete días, y ése es un
nombre de lo más normal. La regla de `siglasDeDietas` es **la última palabra**,
que en castellano es donde vive la distinción («día alto» → A, «días de
descanso» → D). Si con una letra dos chocan, la sigla se alarga hasta que no; si
ni así, se numeran: dos dietas que se llaman igual no se distinguen por su
nombre, y el número por lo menos no miente.

La muesca se queda con el único trabajo que sí es suyo: ser **la aguja de la
regla** —el día que se está mirando— y decir cuál está sin repartir.

## 12.3 «Tus dietas»: de píldoras a tarjetas

Era una fila de chips con el nombre y nada más, y el nombre solo no contesta la
pregunta que trae aquí a alguien: **cuál es la mía y en qué se diferencian**.
Cada dieta trae ahora cuántos días de su ciclo le tocan, sus kcal y sus macros,
y la de hoy viene marcada.

Sigue siendo un `tablist` y no una lista de opciones: aquí no se elige nada, se
elige QUÉ SE MIRA, y `OptionCard` monta sobre un `radio` que un lector anunciaría
como «botón de opción, 1 de 3» a quien está navegando. Es la misma semántica que
la cinta, que es el mando hermano.

Las columnas se cuentan solas y con tope de ancho (`auto-fit` + `20rem`): con dos
dietas no salen dos tarjetas de 680 px, y con siete no se rompe nada.

## 12.4 La línea del reparto y la marca del día

- **Debajo del mando**: «Tu ciclo reparte 4 días de Entreno y 3 de Descanso · de
  media 1.979 kcal al día.» La media sola no se entiende —en un alto/bajo es la
  única cifra que significa algo, pero no aparece en ningún día de su semana—;
  con el reparto delante se lee como lo que es. El nombre del día **no se
  pluraliza**: el prototipo decía «2 días altos, 2 medios y 3 bajos» y eso solo
  funciona con nombres que sean adjetivos («3 Descansos» es lo que sale en
  cuanto el entrenador escribe otra cosa). La preposición lo resuelve.
- **Al lado de la cifra**: «Hoy entrenas · Legs B», que contesta por qué hoy come
  más. Mirando otro día, «Entrenas · Push A». Con el mando en «Tus dietas» no hay
  día que mirar, así que dice CUÁLES le tocan: «Te toca Mié, Sáb y Dom».

Va en `.estado` —punto y rótulo— y no en la píldora azul del prototipo: la
cápsula es de lo que JUZGA y el azul invita a pulsar, y esto ni juzga ni se
pulsa.

**Y calla del entreno cuando no hay reparto por días**: ahí `cycleSlots` da todas
las casillas como descanso —es el valor por defecto para poder repartir— y
anunciarlo sería decirle que descansa toda la semana.

## 12.5 El remate de «Hoy te toca …»

`dietaDeHoy` contesta ahora también sin reparto (§11.3), así que el subtítulo de
la pantalla podía decir «Hoy te toca Dieta única»: falso de fondo —no le toca
hoy, le toca siempre— y con el nombre interno delante. Con una sola dieta la
cabecera calla.

# 13. La comida deja de ser la del entrenador

El 13 de septiembre el dueño señala que su dieta «en NADA se parece» al
prototipo, después de varias vueltas corrigiendo lo de alrededor. Tenía razón, y
la causa estaba donde ninguna de esas vueltas miraba.

## 13.1 La avería: el cliente montaba el editor

`ClientDiet` pintaba sus comidas con `MealCard`, la pieza con la que el
entrenador MONTA una dieta, pasándole `editable={false}`. Son mil seiscientas
líneas de asa de arrastre, renombrar en sitio, duplicar la opción, guardarla como
plato, copiarla al portapapeles, micros y diálogo del alimento. En consulta todo
eso se apaga, pero lo que queda es el ESQUELETO del editor:

  · la cabecera numerada y el acordeón con su chevron;
  · `FoodTableHead` —«Alimento · Cantidad · P · C · G · Kcal»—, seis columnas
    que son las de quien cuadra un día, no las de quien se lo come;
  · el anillo «Objetivo de esta comida», que además solo se pintaba para el
    cliente (`!editable`) y contradice la ley escrita en `CifraDelDia`: la dieta
    pauta, no contabiliza.

La comida es ocho de cada diez píxeles de esa pantalla. Mientras la montara esa
pieza, corregir la cinta, el reparto o la cifra no podía cambiar nada de lo que
el dueño veía.

## 13.2 Lo que entra: `ComidaDelCliente`

Otra maqueta, no otra dieta. Los macros, la ración, el reparto de equivalencias
y el juicio del desvío siguen saliendo del dominio y de `macros`; lo único que
deja de compartirse es la MAQUETA, que es lo que tenía que dejar de compartirse.
Para no dejar dos copias de nada, tres piezas suben a un sitio común:
`abreviarUnidad` al dominio, y `dibujoDeComida` y `Desvio` a `components/
nutrition`.

Dos formas, la del prototipo:

  · **teléfono** — una opción a la vista, elegida con el segmentado; filas de
    tres columnas (qué, cuánto, kcal) y las equivalencias colgando de la fila.
  · **escritorio** — todas las opciones en una fila, que es lo que en 392 px no
    cabe. Con UNA sola opción no hay rejilla ni rótulo «Opción 1»: elegir entre
    una no es elegir, que es la regla que el teléfono ya aplicaba al segmentado.

## 13.3 La cinta, a lo ancho: `horario-dias`

La misma lista, no otro componente. En el monitor la sigla es una abreviatura
que nadie ha pedido —cabe la palabra—, así que la casilla pasa a tarjeta con el
día, el nombre entero de su dieta, sus kcal y qué entrena. Las columnas se
cuentan solas: un microciclo mide nueve días o cinco, y siete columnas fijas es
exactamente lo que se rompe el día que el entrenador monta otro.

## 13.4 La cifra, en tarjeta

Estuvo suelta sobre el papel y era coherente con «la hoja es plana», pero debajo
vienen las comidas, que sí son tarjetas: lo primero que se leía era lo único sin
cuerpo, y el día entero parecía empezar en el desayuno. Los tres macros entran
dentro, en tres casillas, porque son el desglose de esa cifra.

## 13.5 Lo que el prototipo pide y NO se ha hecho

  1. **El chip azul** «Hoy entrenas». El prototipo lo pinta en acento y en
     cápsula; las dos cosas están prohibidas por `ley-del-color` y por
     `controles.css` —el azul invita a pulsar, la cápsula es de lo que juzga— y
     aquí no hay nada que pulsar ni que juzgar. Se queda en el sitio y con el
     papel del prototipo, en tinta callada.
  2. **La casilla activa rellena de tinta.** El prototipo la pinta en negro; la
     casa la marca con la muesca de la regla, que es su firma en tres pantallas.
  3. **Los siete días de la semana.** El prototipo dice «L M X J V S D» porque
     está escrito antes de que la dieta dejara de repartirse por días de la
     semana. Con un ciclo rotativo las casillas son `D1…D9` y no hay martes que
     enseñar: no es un fallo de la pantalla, es el modelo que hay debajo.
  4. **La cabecera «Sábado 12 · te toca Alto».** El portal del teléfono no lleva
     cabecera desde `el-teléfono-es-otro-aparato`.

---

# 14. LA SEMANA MANDA (13 sep 2026, por la tarde)

El dueño, con las dos capturas de su dieta delante —la del monitor y la del
teléfono—:

> «Faltan los márgenes y adaptar cosas a nivel visual que hacen que el prototipo
> se vea mucho mejor. Aunque se utilicen microciclos y no días, creo que está
> bien que la app móvil sea semanal, estilo MyFitnessPal, así que esa visión y
> diseño de los días me gustaba. En el PC no muestra las gráficas que el
> prototipo sí, y hay muchas cosas que pulir a nivel visual en toda la app. La
> app móvil se ve mucho más cargada.»

Cuatro cosas y las cuatro medidas contra `docs/portal-dos-aparatos.html` con la
app real capturada a 392, 1024 y 1600, en claro y en oscuro.

## 14.1 La semana: `D1…D9` deja de ser lo que se enseña

**Esto tumba el punto 3 del §13.5**, que decía que los siete días de la semana
del prototipo eran «un fallo del prototipo, no de la pantalla, porque el modelo
es el ciclo». El modelo sigue siendo el ciclo; lo que cambia es que el ciclo ya
no es lo que se enseña.

**Y la premisa de aquel punto era falsa.** Decía —y lo repetía `dietaDeHoy` por
escrito— que la fecha de arranque de una vuelta «no se guarda en ninguna parte».
Se guarda desde siempre: **`micro.date`**, la fecha de cada microciclo, que el
entrenador edita (`setMicrocycleDate`) y de la que ya cuelgan dos cosas de peso
—fechar el ciclo siguiente (`nextCycleDate`) y agrupar la analítica—.

`semanaDelCliente(client, program, casillas)` en `domain/blocks.js` es la
traducción, y hace la MISMA cuenta que fecha el ciclo siguiente: los ciclos van
seguidos desde el último montado, así que un día cae en la casilla
`(días desde el ancla) mod (número de casillas)`. Con ciclo natural no traduce
nada —la casilla ya ES el día—. Sin fecha de la que partir devuelve `null` y la
pantalla se queda con las casillas a secas: colocar la semana a ojo sería
decirle que hoy come una dieta que a lo mejor no es la suya.

Consecuencias, todas comprobadas con un cliente rotativo de verdad (Marta
convertida a `rotating` en la demo local y restaurada al terminar):

- **El teléfono** enseña `L M X J V S D` con la letra de su dieta debajo, y la
  casilla que toca cada día sale de su ciclo. En un 2/1 de seis casillas el lunes
  puede ser su D5; la tarjeta del escritorio lo dice entero: «Lunes · D5».
- **La cabecera** pasa a «Domingo 13 · te toca Entreno», que es la del prototipo.
- **Y la portada contesta por fin a los ciclos rotativos.** `dietaDeHoy` acepta
  la casilla de hoy, así que «Hoy · Entreno · 2.150 kcal · 4 comidas» aparece
  también para quien no tiene martes. Antes su portada callaba.

**Lo que NO se ata al calendario es el ENTRENO.** Se come todos los días, así
que colocar la dieta en la semana es exacto; una sesión, en cambio, va por
dónde vas y no por qué día es —quien se salta el martes no ha hecho el D4—. La
ley de `LoQueTocaHoy` sigue en pie y por eso la fila del entreno sigue callada
en un rotativo.

## 14.2 La muesca se retira del teléfono, y la casilla se pinta en macizo

Las siete casillas eran texto suelto sobre un canto de 3 px —la regla de la casa,
la misma que mide el peso en la portada—. Se sostenía mientras la fila enumeraba
CASILLAS, que es una escala. Desde que enumera días de la semana la fila es un
CALENDARIO, y un calendario no se lee en un canto.

Entran `.semana-dias` / `.semana-dia`: teselas con papel, canto y sombra, el día
arriba en pequeño y la letra de la dieta debajo. **La que se mira va pintada
entera**, que es el punto 2 del §13.5 —rechazado entonces, aceptado ahora con el
prototipo delante—. La regla sigue midiendo el peso y la sesión, que es donde sí
hay una escala.

**Y el macizo cambia con el tema, que es donde estuvo el único fallo real de
esta tanda.** El primer intento reusó `--sesion-tinta` (#171a20, igual de día y
de noche a propósito, porque es una BANDA y de noche la separan su filete y su
sombra). En una tesela de 44 px no: capturado en oscuro, las siete casillas se
veían idénticas y el día de hoy desaparecía. De ahí `--elegido` /
`--elegido-texto` / `--elegido-apagado` / `--elegido-filete`, que **sí** se
invierten de noche: lo macizo pasa a ser lo claro.

## 14.3 Los márgenes: 12 → 16 en el teléfono

Medido: `--hueco-hoja` valía `--s3` (12 px) por debajo de 640 y el prototipo
sangra 20. Sube a `--s4` (16) —el escalón de la escala; 20 no es ninguno de los
pasos y `verify-styles` lo rechaza con razón—. Es el único sitio donde se toca:
desde el 11 de septiembre el margen tiene nombre y todo lo que sangra lo sangra
por `calc(var(--hueco-hoja) * -1)`. Barrido después a 360, 392 y 430 px en las
seis secciones del portal: ninguna desborda.

## 14.4 El costado del PC deja de estar vacío

Era UNA tarjeta y mil doscientos píxeles de papel en blanco debajo. Entra
`Client/CostadoDeLaDieta.jsx` con lo que el prototipo pone ahí, y las tres cosas
ya estaban en la pantalla, escondidas:

- **Pautas de tu entrenador** — estaban detrás de una fila y una ventana.
- **Tu plan** — el reparto estaba en una línea de texto corrido; ahora es una
  fila por dieta con sus kcal y sus días, la media del ciclo, los pasos y el
  cardio.
- **Cómo va tu dieta** — la gráfica existía y medía **34 px**: a esa altura una
  línea de 1,8 px sobre papel no se lee como una gráfica. Pasa a 72 px con el
  área teñida (`Sparkline area`) y con las dos cifras que el prototipo pone
  debajo: desde cuándo y a qué ritmo (`seriesDelta`, `weeklyRateOfChange` — las
  dos del dominio, las mismas que lee su entrenador).

Las filas no se duplican: `ClientDiet` recibe `conCostado` y en el monitor no
pinta las suyas. En el teléfono se quedan como estaban, que allí es lo correcto.

## 14.5 Lo que se le quita al teléfono

- El renglón «Elige UNA de las N opciones, la que mejor te encaje ese día», que
  explicaba el segmentado que tiene justo encima. La cabecera dice «4 opciones»
  y, en el monitor, «4 opciones · elige una».
- Las versalitas. «TUS COMIDAS», «DESCANSO» y «PROTEÍNA» eran los únicos rótulos
  troquelados de una pantalla donde «Cómo va tu dieta» y «Tu plan» van en caja
  baja. Y el de la cifra es peor que una inconsistencia: **el nombre lo escribió
  su entrenador**, así que «High» salía «HIGH» y «Día de partido», «DÍA DE
  PARTIDO».
- La cifra del día, que en el teléfono se quedaba SIN tarjeta: A-03 aplana los
  bloques del portal y debajo vienen cuatro comidas que sí son tarjetas, así que
  lo primero que se leía era lo único sin cuerpo. Tercera excepción escrita a
  A-03 (`.card.cifra-dia`), y no rompe «una superficie elevada por pantalla»: la
  sombra es la de una tarjeta normal, no la de la decisión.
- Y la cifra y sus macros pasan a UN renglón en el monitor, que es la forma del
  prototipo y ahorra 90 px antes de la primera comida.

## 14.6 Y una avería de ley que salió al mirar `/mi/progreso`

La pantalla estaba bien —el mosaico entero con sus gráficas; lo que parecía vacío
era la cascada de entrada congelada por la captura, no la página— pero abría con
**«✓ En rumbo: −0,34 kg/semana» en verde**, con marca de aprobado.

Eso es exactamente lo que el prototipo prohíbe por escrito en esta pantalla:
*«lo que sigue fuera es el veredicto: ni nota de adherencia, ni "en rumbo". Las
cifras son suyas; el juicio es de su entrenador»*. Y son las dos leyes de la casa
a la vez: el semáforo JUZGA y la app RESALTA, no dictamina.

El cliente lee ahora el mismo dato sin el juicio: «A tu ritmo de las últimas 8
semanas · −0,34 kg por semana», sin marca y en tinta. Con dos decimales, que es
como se decide: redondeado a uno, −0,34 sale −0,3, que es otra cifra.

## 14.7 Lo que queda

- **El segmentado «El día / Tus dietas»** sigue debajo del título y el prototipo
  lo pone a la derecha, en el renglón del titular. Exige subir el estado del
  mando a la ruta, que es quien monta `PageHead`.
- **El PC también pasa a semanal**, y eso no lo pidió: con un microciclo de nueve
  días, la tarjeta de «D7, D8, D9» deja de estar en pantalla y lo que las cuenta
  es la línea del reparto y «Tus dietas». Si prefiere el ciclo entero en el
  monitor, es una condición en `ClientDiet`.
- **La enfermedad vertical de `Cómo vas`**: la tarjeta mide lo que mide su
  vecina del mosaico y con una sola línea dentro se ve hueca. Es la misma que
  `aire-de-las-hojas` dejó declarada y sin arreglar.

---

# 15. EL PULIDO (13 sep 2026, por la tarde)

El dueño, con las capturas de la app y el prototipo delante. Cinco cosas, y las
cinco son **piezas de más**, no valores mal puestos.

> «La perspectiva de móvil me gusta, aunque siento que hay demasiado texto que
> sobra, y siento que los márgenes no se terminan de parecer a los estipulados
> en el prototipo […] en el PC no me gusta tener esa periodicidad del
> calendario, tendría que ser más sencillo y cómodo […] quizás simplemente
> tengas que poder seleccionar entre un día u otro en el PC […] no me gusta el
> cómo se ve la rutina para PC y para móvil, es bastante engorroso e incómodo
> […] reduce elementos que se ven demasiado como las miniaturas de los enlaces
> […] tampoco veo los elementos en cabecera que están en el prototipo (falta
> progreso) […] mis revisiones es un poco incómodo, poco intuitivo: en vez de ir
> pulsando y que vayan saliendo pantallas que te piden cosas […] la revisión
> debería ser sencilla de hacer.»

## 15.1 Los márgenes: 16 → 20, y por fin con nombre

§14.3 los subió de 12 a 16 y se quedó ahí «porque 20 no es ninguno de los pasos
de la escala». Medido contra el prototipo: su `.scroll` del teléfono sangra
`4px 20px 24px`. Y la escala **no puede** tener ese paso, porque por debajo de
640 px se remapea y `--s5` pasa a valer 16, igual que `--s4`: entre 16 y 24 no
queda escalón.

Así que el valor se declara donde se declaran los valores —`tokens.css`, junto a
la escala— como `--hueco-movil: 20px`, con su porqué escrito. El único lector es
`--hueco-hoja` en `responsive.css`; todo lo que sangra ya sangra por él.

## 15.2 «Mi progreso» sube a la cabecera, y solo a la del monitor

Era literal: la cabecera del prototipo tiene cinco pestañas —Inicio · Mi rutina ·
Mi dieta · **Mi progreso** · Mis revisiones— y en la app `/mi/progreso` existía
como ruta, con el panel entero dentro, **sin una sola puerta en la barra**. Se
llegaba tocando la cifra del peso en la portada y de ningún otro sitio.

`soloAncho` en `CLIENT_SECTIONS` es lo que deja añadirla sin tocar el teléfono,
donde los cinco destinos del pulgar están decididos (`D-10`). Quien lo filtra es
`destinosDeBarra()`, y filtra en los DOS sitios que dependen de esa cuenta: la
barra de abajo y el deslizado entre destinos. Con el índice sacado de una lista y
los botones de la otra, deslizar llevaría a la sección de al lado de la que la
barra marca.

Y con la pestaña puesta, la miga «← Hoy» de esa pantalla pasa a ser **solo del
teléfono**: una vuelta a «Hoy» debajo de una pestaña marcada dice que se ha
entrado desde una pantalla de la que no se venía.

**Esto contesta además «en el PC no muestra las gráficas de progreso que el
entrenador sí tiene»**: las tiene, enteras —«Tu cuerpo» con sus dos bandas, «Tu
entreno» con el tonelaje por microciclo y el volumen por músculo— y lo que
faltaba era el camino.

## 15.3 El calendario sale del monitor

`D-04` lleva tres vueltas discutiendo qué enseña la dieta del PC. La cuarta dijo
«el día, como en el teléfono»; la del §13.3 estiró la cinta a siete tarjetas de
doscientos píxeles. Y ahí estaba el fallo: **esas siete tarjetas contestaban dos
veces lo que el costado ya contesta**. «Tu plan» dice qué dietas hay, con sus
kcal y cuántos días le toca a cada una; las tarjetas repetían eso siete veces y
gastaban cuatrocientos píxeles de alto antes de la primera comida.

Lo que de verdad se elige en un monitor es la DIETA, y para eso ya existía el
segundo tramo del mando. Así que:

- el segmentado **«El día / Tus dietas» sube al renglón del titular** —lo que
  §14.7 dejó pendiente—, con el estado en la RUTA, que es quien monta `PageHead`;
- «El día» en el monitor es el de HOY y nada más, que es a lo que se abre;
- y muere `aLoAncho` de `CintaDeDias` con las siete clases de `.horario-*`.

La cinta semanal se queda entera en el teléfono, que es donde el dueño la pidió
(«estilo MyFitnessPal», §14.1).

## 15.4 La rutina baja de cuatro planos de mandos a dos

Medido a 1440 px con un bloque de diez microciclos, el nivel de hoja apilaba:
el rótulo «Tu programa», la miga, el carril de microciclos y la tira de sesiones.
El carril salía **cortado por los dos lados** —la primera píldora aparecía como
«o 4» y el «+ Microciclo 11» se quedaba fuera de la pantalla—.

- **Fuera el rótulo** en el nivel de hoja: es el tercer encabezado seguido para
  una sola cosa. En el nivel del bloque se queda, porque allí lo de debajo SÍ es
  el programa entero.
- **Fuera el `WeekPicker`**: el recorrido de microciclos es el MAPA, y el mapa ya
  vive un nivel arriba, a un clic por el nombre del bloque de la miga.
- **«+ Microciclo N» baja a la tira de sesiones** como última pastilla, que es
  exactamente donde el teléfono ya lo tiene: la última hoja del programa.

Y dos averías que solo salen midiendo:

- **`display: flex` no deshace `align-items: start`.** `.rutina-cuerpo.es-hoja`
  quitaba la rejilla del costado pero heredaba su `align-items: start`, y en una
  columna flex el eje transversal es el ANCHO: `.rutina-centro` se quedaba en 672
  px dentro de un marco de 816, con 144 de papel en blanco a la derecha de la
  hoja. Es la avería que `es-hoja` vino a arreglar, sobreviviéndole cuatro días
  un nivel más adentro.
- **La casilla del RIR sin RIR pautado** se pintaba igual: `.hcl-pide` con su
  fondo gris, sin rótulo encima —la cabecera deja ese hueco en blanco— y
  repetida en las veintiuna series. Se leía como un campo roto. La columna sigue
  (es lo que mantiene cuadrada la rejilla); lo que se va es su relleno.

## 15.5 Su cuaderno, que en el monitor no existía

*«Tampoco veo dónde puede él mismo anotar sus propias pautas.»* Y no estaba:
escribir una nota en un ejercicio solo se podía desde la FICHA, y la ficha
únicamente existe si su entrenador puso vídeo o indicación (regla de la 0098). En
un día de seis ejercicios sin vídeo no había una sola puerta. En el teléfono sí
(`ExerciseList` lleva su «+ nota» junto al nombre), así que `HojaDelCliente`
recibe el mismo gesto y la misma escritura: `log_exercise_note` (0119).

## 15.6 La miniatura del calentamiento

`.warmup-thumb` era una caja de 44 × 30 con un disco y su triángulo: «el hueco
donde iría el fotograma», que es como lo dice iOS. Pero **no hay fotograma** —lo
único que se dibujaba era el hueco—, así que eran ciento treinta píxeles de caja
vacía con tres movilidades, y el calentamiento pesaba más que el primer ejercicio
de verdad. Queda el triángulo pegado al nombre, a 13 px, con el chevron de la
derecha diciendo que se abre.

## 15.7 La revisión: el peso se apunta donde se pregunta

*«En vez de ir pulsando y que vayan saliendo pantallas que te piden cosas.»*
Apuntar el peso costaba abrir un asistente de cuatro pantallas para escribir un
número de cuatro caracteres que se escribe siete veces por semana.

`Client/PesoDeHoy.jsx` es la pieza que el prototipo pone PRIMERA en el teléfono:
la cifra viene puesta con el último pesaje, «Apuntar 64,7 kg», los siete días con
su punto y la media de la semana con la anterior al lado. Dos gestos. Si estaba
mal se escribe encima y el verbo vuelve a ofrecerse solo — sin modo «editar»,
que es la tercera puerta que §8.6 mandó cerrar.

Y el paso «Tu peso» de la lista **pierde su verbo**: con la casilla justo encima,
un botón ahí sería la segunda puerta a lo mismo. El renglón se queda, porque
sigue diciendo cuántos pesajes te pide y cuántos llevas.

El `ReviewWizard` no se va: sigue siendo el sitio de las medidas y del
cuestionario, que sí son formularios largos y sí se agradecen por pasos.

## 15.8 El texto que sobraba, medido

- **«Tu ciclo reparte 4 días de Entreno y 3 de Descanso · de media 1.979 kcal al
  día.»** Decía dos cosas y las dos estaban ya en pantalla: el reparto, en la
  letra de cada día de la cinta y en «Tu plan» del costado; la media, que es una
  cifra del plan como los pasos. La media baja a la lista del pie del teléfono y
  la frase se va.
- **«Tu entrenador no ha cambiado tus calorías desde que empezaste.»** Lo dice el
  rótulo de su propia tarjeta, en dos palabras: «Cómo va tu dieta · sin cambios».
- **La pauta repetida en cada serie del teléfono.** «6-8 reps» cuatro veces
  debajo de un galón que ya decía «4 series · 6-8 reps · RIR 2», y con seis
  ejercicios, veinticuatro renglones. `pautaUniforme()` la calla solo cuando las
  series piden lo mismo: una pirámide sigue diciendo la suya, que es donde el
  argumento viejo acertaba.

### Tres trampas de esta vuelta

- **La inicial del día sacada de `weekdayName(...).charAt(0)`** da **M para
  martes y M para miércoles**. La tabla buena ya existía en `domain/blocks.js`
  con su comentario; lo que faltaba era la segunda puerta (`inicialDelDia(iso)`).
  Familia de `.pide` / `.g`: antes de escribir una cuenta, buscarla.
- **`.list-row.es-puerta` se partía en dos renglones** a 392 px con el margen
  nuevo: el rótulo reclama el 55 %, `.row-meta` trae 84 px de mínimo y el chevron
  de 15 no cabía por cuatro píxeles, así que se caía solo a un segundo renglón
  debajo de la tesela. Es exactamente el fallo que ya estaba escrito para
  `.marcas`, en el otro caso de la misma familia.
- **Y otra sesión escribiendo en el mismo árbol** (`AppContext.jsx`,
  `AnthropometryPanel.jsx`). Síntoma: `verify` y `eslint` fallando en ficheros
  ajenos, distinto en cada ejecución, y el Vite compartido escupiendo
  «useSession debe usarse dentro de AppProvider». **Antes de deshacer nada,
  volver a medir con `grep -c` sobre los marcadores propios.**

## 15.9 Lo que queda

- **La enfermedad vertical de «Cómo vas»**, ahora a la vista en la pestaña nueva:
  sin fase ni objetivo declarados, la tarjeta mide lo que mide su vecina del
  mosaico y se ve hueca. Está declarada desde `aire-de-las-hojas` y no se toca
  aquí: encogerla deja la fila con el canto de abajo desigual, y esa decisión es
  del mosaico entero, no de esta tarjeta.
- **Las fotos dentro del paso de la entrega.** El prototipo las pone como tres
  huecos pulsables DENTRO del renglón «Tus fotos»; aquí siguen debajo, en su
  tira, y el verbo del renglón abre el asistente. Se sube a la casilla cuando se
  suba la de las medidas, que es la otra mitad del mismo movimiento.
