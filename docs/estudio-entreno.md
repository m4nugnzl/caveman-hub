# Estudio de Entreno — la casa de la hoja

> 8 de septiembre de 2026. Medido sobre la aplicación corriendo con datos
> reales (Marta Ruiz: 3 bloques, 10 microciclos, 6 ejercicios y 20 series en la
> hoja abierta), a 1600 × 950 y en tema claro, que es como la mira el dueño.
> Capturas en `capturas/estudio-entreno/`.

---

## 0 · El encargo, y lo que queda fuera

El dueño, sobre la pantalla:

> «No me gusta nada, creo que definitivamente hay que darle una vuelta de
> tuerca, por aquí no vamos bien.»

Y al acotar:

> «La hoja de entreno me gustaba como era (como estaba en producción); lo que
> no me gusta es el resto.»

**Entonces la hoja de series no se toca.** Ni sus columnas, ni su cabecera
«Objetivo | Hizo», ni el reparto de anchos entre lo pautado y lo hecho. Este
estudio va de todo lo demás: la cabecera del bloque, la banda de hojas, la
barra de la hoja abierta, el preámbulo, el carril derecho, la vista de conjunto
y la lista de bloques.

> **Pendiente de tu decisión:** la hoja de series del árbol de trabajo NO es la
> de producción. Sobre `d500362` lleva 123 líneas añadidas y 58 quitadas —parte
> de la tanda del plan en el bloque, parte de las dos rondas de pulido de hoy
> (la chapa de la excepción, el filo del foco, la calle entre Objetivo e Hizo,
> las casillas sin raya, el número del ejercicio alineado)—. Si «como estaba en
> producción» significa deshacer eso, se deshace; dilo y se revierte. Este
> estudio asume que no.

---

## 1 · Cómo se ha medido

- **Tinta sobre aire:** rejilla de 8 px sobre la primera pantalla; se marca
  cada celda cubierta por un nodo hoja con texto o por un mando. Es la misma
  medida con la que se hizo `aire-de-las-hojas`, para poder comparar.
- **Distancias:** entre el borde derecho de un rótulo y el izquierdo de su
  verbo, en píxeles reales de la caja.
- **Llenado del carril:** alto del contenido del carril derecho contra el alto
  de la mesa que tiene al lado.

---

## 2 · Las averías

### A-01 · La página salta 100 px al abrir un día

| vista | mesa | carril |
|---|---|---|
| conjunto | **940 px** | 300 px |
| hoja abierta | **840 px** | 400 px |

`.entreno` declara `minmax(0,1fr) 400px` y `.entreno.is-conjunto` declara
`minmax(0,1fr) 300px`. Abrir una hoja —que es el gesto más frecuente de la
pantalla— estrecha la mesa 100 px y mueve horizontalmente todo lo que hay
dentro. La banda es la misma pieza en las dos vistas y sus celdas cambian de
sitio bajo el dedo que acaba de pulsarlas.

### A-02 · El carril derecho está vacío el 73 % de su alto

En la hoja: mesa de **1514 px** de alto, contenido del carril de **406 px**.
**1.108 px muertos** en una columna de 400 px de ancho. Y no es un caso raro:
sale igual con sesión y sin ella.

Rompe una regla que ya está acordada en `aire-de-las-hojas`:

> *Ninguna pantalla tiene un carril derecho vacío; si no tiene qué poner, pone
> la consecuencia de lo que estás tocando.*

Mientras tanto el documento mide 1.779 px: hay que bajar con la rueda para ver
el sexto ejercicio, con 1.108 px en blanco al lado.

### A-03 · La lista de bloques es otra aplicación

Es la misma sección, y no comparte nada con el bloque:

| | lista de bloques | el bloque |
|---|---|---|
| cabecera | titular «Los bloques de Marta» + pie | `‹` + nombre + chapas + pie |
| volver | enlace de texto «Volver a Intensificación» | flecha `‹` pelada |
| crear | enlace de texto «+ bloque» | ítem dentro del `···` |
| filtrar | conmutador segmentado | no existe |

Tres filas de contenido y **~600 px de blanco debajo**; tinta **22,6 %** contra
el **41 %** de las otras dos vistas. La lista no llena su lienzo, que es
justamente lo que la cartera y el Taller ya arreglaron con `superficies.css`.

### A-04 · Los mandos vuelan al canto contrario de su asunto

- «Calentamiento» → su «editar»: **665 px**.
- El estado de la hoja («hecha · 20/20 series») → su primer mando: **381 px**.
- El nombre del bloque → su «···»: ~1.400 px.

Todo son renglones a lo ancho con el asunto pegado a la izquierda y el verbo
tirado a la derecha. Leer una fila es un viaje, y es el mismo defecto que se
midió en `/clientes` («leer la fila de alguien era un viaje de 900 px») y que
allí se arregló.

### A-05 · Tres gramáticas de mando en la misma pantalla

1. **Enlace de texto sin caja:** «editar», «añadir», «Volver a Intensificación»,
   «+ bloque», «+ indicación».
2. **Pastilla con canto:** «Todas las hojas», «sesión del 21 ago ▾», «B3·M2 ▾».
3. **Icono redondo:** el `···` de la cabecera y el de la hoja.

Los tres hacen lo mismo —disparar una acción— y ninguno dice por su forma
cuánto pesa lo que va a pasar.

### A-06 · La banda tiene dos trabajos y sólo cumple uno cuando se parte

Es a la vez el selector de hojas y la cabecera de las columnas del conjunto, y
por eso comparte retícula con `.plan-rejilla` (mínimo de 276 px por pista). Con
cuatro hojas en un panel de 940 px la banda se parte en dos renglones: la tapa
de la cuarta queda **arriba del todo**, a ~700 px de la columna que encabeza.
Como cabecera, sólo es cierta para el primer renglón.

### A-07 · La cabecera del bloque mete siete cosas en un renglón

`‹` · nombre · microciclo ▾ · «+ microciclo» · chapa · pie de cuatro datos ·
`···`. Seis de las siete son de nivel distinto (el bloque, el microciclo, el
programa) y ninguna jerarquía lo dice.

---

## 3 · El diagnóstico

**Entreno no es una pantalla: son tres —la lista de bloques, el conjunto y la
hoja— que comparten una cabecera y nada más.** Cada una decide por su cuenta el
ancho de la mesa, la gramática de sus mandos y qué pone en el carril derecho.

Por eso pulir no lo arregla: lo que está mal no son los valores de una banda,
es que las tres vistas no son el mismo mueble. Y por eso la hoja —que al dueño
le gusta— se ve mal: no es ella, es la casa donde vive.

**La idea rectora, en una frase:**

> *Entreno es un solo mueble de tres cajones, y el carril derecho es siempre la
> consecuencia de lo que tienes delante.*

Dos reglas duras que se pueden comprobar con una regla en la pantalla:

1. **El ancho no cambia al cambiar de cajón.**
2. **Ningún carril vacío.** Si no hay nada que enseñar, enseña lo que produce
   lo que estás tocando.

---

## 4 · Los movimientos

### Tanda 1 · El chasis — que deje de saltar

**E-01 · Un solo ancho para las tres vistas.**
El carril mide lo mismo en el conjunto y en la hoja; la mesa deja de encogerse
100 px al abrir un día.
*Toca:* `.entreno`, `.entreno.is-conjunto` en `revision.css`.
*Rompe:* nada; el conjunto pierde 100 px de mesa o la hoja gana 100. Hay que
elegir uno y medir que las cuatro columnas del conjunto siguen por encima del
umbral de 250 px de contenido.
*Coste:* pequeño.

**E-02 · Una sola cabecera para las tres vistas.**
La lista de bloques pierde su titular propio y entra en `CabeceraDelBloque`
(`‹ Los bloques de Marta`, con sus mandos en el mismo sitio y con la misma
forma que los del bloque). Se acaba «Volver a Intensificación» como enlace.
*Toca:* `ListaDeBloques`, `CabeceraDelBloque`, `WorkoutLogEditor`.
*Coste:* medio.

**E-03 · Una gramática de mando.**
Pastilla para lo que hace algo; texto plano sólo para lo que es un dato. Los
«editar», «añadir», «+ bloque», «+ indicación» y «Volver a…» pasan a la misma
pastilla discreta que ya usan «Todas las hojas» y el menú de sesión.
*Toca:* `revision.css` (una clase, `.cab-accion` y `.hoja-calentamiento-editar`
se funden), y los cinco sitios que las usan.
*Coste:* pequeño, alto impacto visual.

### Tanda 2 · El carril deja de estar vacío

**E-04 · En la hoja, el carril es el ejercicio en foco, a lo grande.**
Hoy son 406 px de 1.514: una tarjeta de progresión y, si hay, «cómo lo llevó».
Pasa a ser el panel del ejercicio que tienes marcado: su progresión, su
historial microciclo a microciclo y lo que levantó la última vez —lo que ahora
sólo se ve abriendo una ventana—.
*Toca:* `ComparativaEjercicio`, `WorkoutLogEditor`.
*Rompe:* la ventana «Ver toda la progresión» pierde parte de su razón de ser;
hay que decidir si se queda para el histórico completo o desaparece.
*Coste:* medio.

**E-05 · Sin ejercicio en foco, el carril enseña cómo va el bloque.**
En vez de dejar hueco. Es la misma pieza que ya existe (`LecturasDelBloque`),
que hoy sólo sale en el conjunto.
*Coste:* pequeño.

**E-06 · El carril acompaña al bajar.**
`position: sticky` en el carril, que hoy se queda arriba mientras la hoja tiene
1.779 px de alto.
*Coste:* pequeño.

### Tanda 3 · Los mandos vuelven junto a su asunto

**E-07 · El preámbulo deja de tirar sus verbos a 665 px.**
«editar» y «añadir» van pegados a lo que editan, no al canto derecho del panel.
*Coste:* pequeño.

**E-08 · La barra de la hoja se compacta.**
El estado y los mandos dejan de estar a 381 px: o el estado se va con ellos, o
los mandos bajan a la izquierda. Una sola decisión, no dos anclas.
*Coste:* pequeño.

**E-09 · La lista de bloques llena su lienzo.**
Tres filas y 600 px muertos → la lista es una caja que llega al bajo de la
ventana, con el mismo mecanismo (`:has()`) que ya usan la cartera y el Taller.
*Coste:* pequeño.

### Tanda 4 · La banda — decidir qué es

**E-10 · Que sea una cosa sola.**
Hoy es selector y cabecera de columnas, y como cabecera falla en cuanto se
parte (A-06). Dos salidas, y es decisión del dueño:

- **(a)** El nombre de la hoja baja a SU columna en el conjunto —donde siempre
  está encima de lo suyo— y la banda queda como tira de pestañas de un solo
  renglón en las dos vistas. Cuesta aceptar el nombre en dos sitios cuando hay
  una hoja abierta.
- **(b)** La banda se queda como cabecera y el conjunto deja de partirse:
  las columnas se estrechan por debajo de 276 px, con lo que `.plan-col`
  recompone su renglón (está avisado en `piezas.css`), o el conjunto se
  desplaza a lo ancho.

*Recomendación:* (a). El nombre de una columna pertenece a la columna.

---

## 5 · Lo que este estudio NO propone

- **Tocar la hoja de series.** Decisión del dueño, y este estudio la respeta.
- **Cambiar tokens, tipografía o color.** Nada de lo de arriba es un valor: son
  anchos, sitios y jerarquías. Si después de mover la estructura sigue sin
  gustar, entonces sí toca hablar de la piel — pero no antes, porque hasta hoy
  se ha intentado al revés cuatro veces.
- **Recetar.** El carril lleno enseña información —lo que hizo, cómo va—, nunca
  un ajuste propuesto. Sigue vigente `la-app-no-receta`.

---

## 6 · Riesgos

- **E-01 obliga a elegir** quién cede los 100 px. Si los cede el conjunto, hay
  que comprobar que cuatro columnas siguen legibles; si los cede la hoja, el
  carril se queda en 300 px y E-04 tiene menos sitio del que querría.
- **E-04 y la ley de las capas.** El dueño eligió en su día que «Cómo va el
  bloque» fuera una CAPA y no un carril. E-05 lo devuelve al carril. Mi lectura
  es que una capa vale para lo que se consulta a fondo y un carril para lo que
  acompaña mientras trabajas, pero es su decisión y conviene decirlo antes de
  construirlo.
- **E-10 (a) duplica el nombre** de la hoja abierta: en su pestaña y en su
  columna. Es el vicio que mató al carril de agosto; aquí es menor porque las
  dos vistas no se ven a la vez, pero hay que mirarlo con la captura delante.

---

## 7 · Orden propuesto

1. **Tanda 1 (E-01, E-02, E-03).** Es la que hace que las tres vistas se
   parezcan; sin ella las demás son maquillaje.
2. **Tanda 3 (E-07, E-08, E-09).** Barata y se nota en la primera mirada.
3. **Tanda 2 (E-04, E-05, E-06).** La más valiosa y la que más hay que hablar
   antes, por el riesgo de la capa.
4. **Tanda 4 (E-10).** Al final, con las otras tres puestas y una captura
   delante.
