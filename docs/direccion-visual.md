# Dirección visual: poner la firma

> Fecha: 29 de agosto de 2026. Base: `93ab681`.
>
> Contesta a una pregunta concreta: cómo tener una aplicación que se sienta
> propia y que dé ganas de abrirla. **No propone rediseñar nada.**
>
> La demostración interactiva de estos cinco gestos —con la sesión funcionando—
> está publicada aparte; este documento es el registro de la decisión.

---

## La medida de la que sale todo

`tokens.css` llama a la regla «**LA FIRMA**: la firma visual» y precisa dónde
aparece: *el canto inferior de la cabecera, la línea base de los gráficos y el
eje de días de «Hoy»*.

```
var(--rule)           index.css: 1 uso   ·  jsx: 0
var(--rule-major)     index.css: 0       ·  jsx: 0
var(--rule-vertical)  index.css: 0       ·  jsx: 0
```

De esos tres sitios está hecho **cero**. El único uso en 13.784 líneas vive en
`.lp-eyebrow`, o sea en la portada.

**La tesis, entonces:** el problema no es que falte personalidad. Es que la
personalidad está escrita en `tokens.css` y no está en pantalla. El gesto está
inventado, argumentado y tokenizado; solo no se llegó a poner.

Eso cambia la naturaleza del trabajo: no es un rediseño, es terminar uno.

---

## Los cinco gestos

### 1 · Poner la regla donde ya está dicho que va

Canto de la cabecera, base de los gráficos, carril de días de «Hoy». Tres
declaraciones de CSS y cero decisiones nuevas. El efecto que se busca: las barras
dejan de flotar y apoyan sobre algo que se lee como una cinta métrica, así que la
pieza dice «esto mide» sin escribirlo.

### 2 · La cifra es el contenido; que lo parezca

Hoy los números son tipografía: viven en una fila de etiqueta y valor, del mismo
tamaño que el resto. Archivo tiene cifras tabulares y ya está cargado.

La regla: **una cifra por bloque manda y todo lo demás se subordina a ella**. La
unidad se encoge, el delta se hace pequeño y coge el color del dato, el contexto
baja a pie de bloque.

Se resuelve con una primitiva —`<Cifra>`— y sustituirla donde hoy hay una fila.
`--fs-2xl` y `--font-display` ya existen.

### 3 · La sesión como instrumento

Tres piezas, y las tres salen del vocabulario que el proyecto ya tiene:

- **La espina.** `--rule-vertical` —que nunca se usó— recorriendo la sesión: dice
  cuánto llevas sin ninguna barra de progreso genérica. Es una cinta métrica que
  se llena.
- **Los discos.** Traducir los kilos a lo que hay que montar en la barra. Ver el
  gesto 4.
- **La consecuencia.** Marcar una serie hace que la espina avance, el tonelaje
  suba y el descanso arranque. Hoy no pasa nada, y por eso se siente formulario.
  `SetRow` ya sabe el momento exacto: `isSetLogged`.

### 4 · El disco es la única pieza que nadie puede copiar

La paleta sale de los discos de competición —rojo 25, azul 20, amarillo 15, verde
10, blanco 5—, así que **significa algo antes de explicarse**: un entrenador lee
«rojo, azul» y sabe que son 45 kg por lado sin traducir.

La condición, que es la misma regla que ya ordena el color en este proyecto:
**tiene que ser información, no textura**. Los discos solo salen donde hay una
carga real que montar en una barra. En una prensa o en una polea no se pintan,
porque ahí serían una mentira con forma de ayuda. En cuanto aparezcan de adorno
en una cabecera, dejan de significar y pasan a ser un tema.

### 5 · Para el entrenador, el lujo es el silencio

Lo que engancha al cliente es la consecuencia; al entrenador, lo contrario.
Revisar es una tarea larga con una decisión al final, y hoy se hace en una
pantalla que sirve para otras cinco cosas.

Un **modo de revisión** —lienzo más oscuro, el cromo retirado, la cifra grande, la
única decisión abajo— no es una pantalla nueva: es la misma con menos. Y es la
sección «Su semana» de `producto.md` §4.1, que ya está construida y a la que solo
le falta el tratamiento.

---

## Lo que NO se propone, y por qué

- **Ningún color de marca.** «El cromo no tiene color» es lo mejor del sistema y
  es lo que mantiene las nueve series distinguibles. Los cinco gestos se escriben
  con la brasa, la tiza y los discos.
- **Ninguna celebración.** Ni confeti, ni rachas, ni medallas. La satisfacción
  sale de que la máquina responda —la espina avanza, la cifra sube—, no de que te
  feliciten. Un producto que mide no aplaude.
- **Ningún degradado ni sombra nueva.** El aire es de la portada y dentro no
  pinta nada: «una hoja impresa no lleva focos», y eso está escrito en
  `tokens.css`.
- **Nada que toque `domain/`.** Los cinco son de pintado. Si alguno obligara a
  cambiar una regla de negocio, estaría mal planteado.

---

## Orden

| # | Gesto | Coste |
|---|---|---|
| 1 | La regla en sus tres sitios | Una tarde |
| 2 | La primitiva `<Cifra>` y las pantallas de cabecera | Días |
| 3 | Los discos en la hoja de series | Días |
| 4 | La espina y la consecuencia al marcar | 1 semana |
| 5 | El modo de revisión | 1–2 semanas |

Del 1 al 3 no cambian ninguna estructura: se pueden hacer sueltos y se ven desde
el primer día. El 4 y el 5 conviene verlos juntos.

---

## Lo que no se ha comprobado

- La demostración se construyó con los tokens copiados de `tokens.css`, no
  montando la aplicación real: **no hay garantía de que estas piezas encajen sin
  ajuste** dentro de los componentes que ya existen.
- No se ha visto ninguna de estas pantallas con datos de verdad ni con un cliente
  delante.
