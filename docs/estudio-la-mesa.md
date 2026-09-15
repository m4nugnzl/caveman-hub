# La mesa — el PC del cliente

**14 de septiembre de 2026.** El estudio, con el diagnóstico medido, las capturas reales y el
prototipo clicable de las cinco pantallas, está en
[`estudio-la-mesa.html`](estudio-la-mesa.html). Este archivo es el plan de registro.

**No sustituye a [`estudio-la-app-del-cliente.md`](estudio-la-app-del-cliente.md)**: se monta
encima. De aquel siguen en pie la tesis (*tu historial es el producto*), las tres leyes y el
teléfono entero. Lo que cae es **su PC** —la parrilla de diez microciclos y la frase «el PC
compara»—, rechazado por el dueño: *«la visión del PC no me gusta nada; me gusta más o menos la
base que tenemos, pero con un cambio de visión radical a nivel de diseño»*.

Nada de esto está construido todavía.

---

## La frase

**Hoy una página es un montón de cajas. A partir de aquí es una hoja con una sola caja encima.**

La caja blanca deja de significar «aquí hay contenido» —que no significa nada, porque todo es
contenido— y pasa a significar **esto es lo que puedes hacer ahora**. Lo que sobresale, se toca.

El cambio es de forma, no de estructura: los seis destinos, el reparto trabajo/contexto y las
piezas son las que ya hay. No se toca el dominio, ni las consultas, ni las políticas, ni el
teléfono, ni un solo token.

---

## El diagnóstico, medido

Con la cuenta de cliente de la demo local (`marta@ejemplo.invalid`), monitor de 1600 × 1000,
movimiento desactivado. Capturas en `capturas/pc-cliente-14sep/`.

| Pantalla | Ancho | Empieza en x | Cajas | Última tinta |
|---|---|---|---|---|
| Mi inicio | 1560 | 20 | 5 | y=765 de 1000 |
| Mi rutina | **880** | **360** | 3 | y=2018 |
| Mi dieta | 1560 | 20 | **8** | y=875 |
| Mi progreso | 1560 | 20 | 6 | y=1544 |
| Mis revisiones | **1320** | **140** | 7 | y=1276 |
| Lo tuyo | 1560 | 20 | 2 | y=**596** de 1000 |

Las seis averías:

1. **El papel no es fijo.** Las seis llevan la misma clase (`layout layout-narrow
   layout-portal`) y salen con tres anchos: 1560, 1320 y 880. Incumple la ley de
   [[aire-de-las-hojas]], que es de la casa desde el 8 de septiembre.
2. **«Mi rutina» es el teléfono estirado.** 880 px de columna en 1600 de monitor y 2018 px de
   scroll para una sesión. El recorte viene de `responsive.css` —la decisión «enfocar es
   quitar»—, y en escritorio sale caro.
3. **La caja blanca es el único recurso.** 31 en seis pantallas, mismo peso, mismo radio, misma
   sombra, para tres trabajos distintos. Todo pesa igual: no hay jerarquía, hay inventario.
4. **El monitor no se usa, se sobrevive.** «Lo tuyo» son cinco renglones de menú de teléfono a
   1490 px, con 1400 px entre el rótulo y su flecha.
5. **Dos vocabularios.** PC: `Mi inicio · Mi rutina · Mi dieta · Mi progreso · Mis revisiones ·
   Lo tuyo`. Teléfono: `Hoy · Entreno · Dieta · Revisión · Tú`. Y un h1 «Tu revisión» debajo de
   una pestaña «Mis revisiones».
6. **«Mi progreso» es el panel del entrenador trasplantado.** Morado, rosa, verde azulado y azul
   en la misma pantalla, con «Ver a fondo» dos veces. Se salta [[ley-del-color]].

Las seis son de forma. Ninguna es de estructura.

---

## La ley de la mesa

1. **La hoja es fija.** Una reja para las cinco pantallas: margen de rótulos 148 · trabajo ·
   carril 292 separado por un filete. Mismo origen, mismo techo, el título siempre en el mismo
   sitio.
2. **Una sección no es una caja: es un filete con su rótulo colgado en el margen.** El margen
   izquierdo —hoy papel muerto— pasa a ser el índice de la página: se lee en vertical qué hay en
   la pantalla sin leer la pantalla.
3. **Solo se levanta lo que puedes tocar ahora.** Una caja blanca por pantalla: lo que está a
   medias o lo que toca ahora. Si no hay nada pendiente, no hay caja — y la ausencia se lee
   desde la puerta.
4. **El ancho se gasta en los dos carriles.** *Pedido → hecho* es lo único que no se puede
   copiar de una captura, porque guardamos la pauta junto al registro. En el monitor va al lado,
   no apilado.

### El aviso que hay que tener delante

El 6 de septiembre el dueño **desandó** una superficie única sin cajas en el puesto del
entrenador: «quizás fuese mejor que las boxes fuesen como boxes y no todo junto». Está escrito
en `src/styles/tokens.css`. **Esto no es aquello**: allí la tarjeta blanca se fundía con una hoja
blanca y se perdía la rejilla. Aquí la hoja sigue en crema (`--canvas`), la tarjeta sigue en
blanco con su sombra y el escalón entre las dos no se toca. Lo único que cambia es cuántas veces
se usa: de 31 a 4.

---

## El prototipo, medido

Cinco pantallas navegables a 1280 px de hoja, con los datos de la demo.

| Pantalla | Cajas hoy | Cajas aquí | Alto de la hoja |
|---|---|---|---|
| Hoy | 5 | 1 | 894 |
| Entreno | 3 | 1 | 1.474 *(hoy 2.018)* |
| Dieta | 8 | 1 | 1.142 |
| Revisión | 7 | 1 | 892 |
| Tú | 2 | **0** | 712 |

En «Entreno» caben **los 6 ejercicios y las 21 series** de la sesión, con sus dos carriles, en
1.474 px — donde hoy la misma sesión ocupa 2.018 en una columna de 880.

---

## Tres decisiones antes de construir

| # | La decisión | Recomendado |
|---|---|---|
| 1 | **El vocabulario.** ¿La cinta del PC pasa a decir lo mismo que la barra del teléfono (`Hoy · Entreno · Dieta · Revisión · Tú`)? | Sí, uno solo; las rutas viejas rebotan. |
| 2 | **«Mi progreso».** ¿Se reparte —cifras a «Tú», curva del peso a «Revisión», tonelaje a «Entreno»— o se queda como pantalla propia sin la caja de pinturas? | Repartirlo: cada pantalla tiene su pasado. |
| 3 | **Apuntar desde el PC.** ¿La hoja de «Entreno» sigue siendo editable en el monitor? | Que se quede: el gimnasio es del teléfono, pero corregir el jueves lo del martes se hace sentado. |

---

## Las tandas

| Tanda | Qué | Qué arregla |
|---|---|---|
| **1 · La hoja** | El papel fijo: un ancho, un origen, la reja de tres columnas y el rótulo colgado. CSS del chasis del portal, no de cada pantalla. | Averías 1 y 4 |
| **2 · La caja** | De 31 a 5: solo «lo que toca ahora». Lo demás pasa a filete, rótulo y aire. | Avería 3 |
| **3 · Los dos carriles** | La hoja de «Entreno» y el día de «Dieta» a lo ancho, pedido y hecho al lado. Aquí muere la columna de 880. | Avería 2 |
| **4 · La voz y el reparto** | Un solo vocabulario en las dos barras y «Mi progreso» repartido, con sus gráficas devueltas a la ley del color. | Averías 5 y 6 |

Las cuatro son independientes y se puede parar después de cualquiera. La 1 sola ya se nota: es
la que hace que las cinco pantallas parezcan la misma app.
