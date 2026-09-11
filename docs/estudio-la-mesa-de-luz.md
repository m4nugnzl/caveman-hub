# Estudio · La mesa de luz

*11 de septiembre de 2026. Con la aplicación delante, sesión de Marta Ruiz.*

> «El estudio sigue sin convencerme nada la verdad, es más bien un apaño que una
> herramienta real viva.» — el dueño, 11 sep.
>
> «Si quisiese analizar mientras voy viendo las fotos, tirar líneas y estar
> grabándome a mí y a la pantalla, poder hacer esto de forma intuitiva y sencilla
> a día de hoy imposible.»

Este documento **no propone tocar el archivo de fotos**, que se acaba de arreglar
(descargas y check-in inicial), ni la ventana flotante de la maquinaria. Va solo
sobre `revision/estudio`.

---

## 1. El diagnóstico: no es que esté mal hecho, es que hace otra cosa

El estudio funciona. Encuadra, compensa la luz, traza líneas, monta rejillas de
semanas × ángulos y exporta un PNG. Nada de eso está roto.

El problema es **cuál es su verbo**. Léase la pantalla de arriba abajo tal y como
está hoy:

```
      Compara dos semanas, encuadra para que coincidan y monta el antes y después.
      ┌───────────────────────────────────────────────────────────────────────┐
      │ Composición  [A/D] [Semanas×áng] [Rejilla] [Deslizador]               │
      │ Salida       [Automático ▾] [Pies de foto]         [↓ Descargar PNG]  │
      └───────────────────────────────────────────────────────────────────────┘
      ┌─ Fotos por semana ─┐ ┌─────── lienzo ───────┐ ┌── Ajustar│Anotar│Montar ──┐
      │ [Subir]            │ │  ▣ ▣                 │ │ 1·S5 2·S10 3·S5 4·S10   │
      │ Todos Frontal …    │ │  ▣ ▣                 │ │ Semana 5 · Frontal      │
      │ ▾ Semana 10    3   │ │  ▣ ▣                 │ │ Zoom       ▁▃▁  1.00×   │
      │  [✓][✓]            │ │                      │ │ Horizontal ▁▃▁     0%   │
      │  [✓]               │ │                      │ │ Vertical   ▁▃▁     0%   │
      │ ▾ Semana 5     3   │ │                      │ │ Rotación   ▁▃▁   0.0°   │
      │  [✓][✓]            │ │                      │ │ Brillo     ▁▃▁   100%   │
      └────────────────────┘ └──────────────────────┘ └─────────────────────────┘
```

«Composición». «Salida». «Descargar PNG». «Pies de foto». Siete deslizadores.
Todo lo que se ve nombra **un archivo que se va a producir**. Es un editor de
imagen, y uno correcto.

Pero lo que se pide es otra cosa: **mirar un cuerpo y explicarlo en voz alta**.
Y para eso esta pantalla falla en cinco puntos concretos, todos visibles arriba:

**1.1 · La foto es lo más pequeño de la pantalla.** En 1560 px, las tres columnas
—biblioteca 300, lienzo ~790, panel 380— dejan cada foto de la rejilla en unos
190 px de ancho. Se abre el estudio para MIRAR y lo que menos se ve es la foto.
La miniatura del archivo, la pantalla que existe para no mirar de cerca, mide lo
mismo.

**1.2 · Dibujar es un modo detrás de una pestaña.** Para trazar la primera línea:
pestaña «Anotar» → elegir herramienta entre seis iconos → elegir color entre seis
discos → arrastrar. Cuatro decisiones antes del primer trazo, y las dos primeras
hay que repetirlas cada vez que vuelves de encuadrar. En una herramienta de mirar,
el trazo tiene que ser lo que pasa al arrastrar, sin preguntar.

**1.3 · El trazo es un objeto permanente, y una explicación no lo es.** Las
anotaciones se guardan en el montaje y salen en el PNG. Eso está bien para «marca
la cintura y expórtalo». Pero explicando en voz alta se traza *mientras se habla*
—«mira aquí… y aquí»— y esa línea sobra tres segundos después. Hoy cada línea
dicha hay que deshacerla a mano, o el lienzo acaba siendo una telaraña.

**1.4 · El encuadre se hace con formularios.** Zoom, Horizontal, Vertical y
Rotación son cuatro deslizadores. El lienzo SÍ acepta arrastrar, pero lo que se
ve —lo que enseña que se puede hacer— son los deslizadores. Un gesto convertido
en formulario.

**1.5 · Solo come fotos de progreso.** El estudio se alimenta de `progressPhotos`,
con su semana y su ángulo. Una foto de su gimnasio, una de la técnica de un
ejercicio o una que mandó en un formulario no pueden entrar. Y «tirar líneas
sobre una foto» es exactamente lo que se quiere hacer con una foto de técnica.

### Y el grabador, aparte

El grabador existe, mezcla cámara + fuente en un lienzo y funciona. Pero:

- **Empieza recogido detrás de un botón** y, al abrirlo, pide *elegir la fuente*:
  ¿el lienzo del montaje o la pantalla? Esa pregunta es de la implementación, no
  del trabajo. Quien va a grabar quiere grabar **lo que está viendo**.
- **Graba el lienzo, que es el montaje terminado**, no la sesión de mirar. Así que
  «grabarme explicando mientras muevo, comparo y trazo» no es un camino: es
  montar primero y narrar después.
- Y lo pesado —el grabador— vive en la misma pantalla que lo ligero.

**Resumen del diagnóstico:** el estudio es una **mesa de montaje**. Lo que falta
es una **mesa de luz**: un sitio donde las fotos son grandes, la mano dibuja
sola, y grabar es un botón que captura exactamente lo que hay delante.

---

## 2. La propuesta: la mesa de luz

El nombre no es decorativo. Una mesa de luz es el artefacto del oficio de mirar
imágenes: un cristal iluminado donde se ponen dos negativos al lado, se acercan,
se comparan y se señalan con el dedo. No produce nada — **sirve para ver**.
(Y no colisiona con «la mesa» de Entreno, que es la hoja del programa.)

```
 ┌──────────────────────────────────────────────────────────────────────────┐
 │  ‹ Marta · Revisión             S1  ●S5  ●S10   frontal ▾        ● 02:14 │  ← se apaga solo
 │                                                                          │
 │        ┌────────────────────┐        ┌────────────────────┐              │
 │        │                    │        │                    │              │
 │        │                    │        │      ╱             │              │
 │        │      SEMANA 1      │────────│   SEMANA 10        │  ← la guía   │
 │        │                    │        │                    │    cruza las │
 │        │                    │        │                    │    dos       │
 │        └────────────────────┘        └────────────────────┘              │
 │          84,2 kg · 2 mar               78,9 kg · 10 sept                 │
 │                                                                   ┌────┐ │
 │   ✏  ▬  ⊞          ● Grabar                              ↓ PNG    │ 📷 │ │
 │                                                                   └────┘ │
 └──────────────────────────────────────────────────────────────────────────┘
```

Nueve movimientos. Los tres primeros son la mesa; los tres siguientes, la mano;
los tres últimos, la voz.

### La mesa

**L-01 · La foto ocupa la pantalla.** Fuera las tres columnas. La mesa es el
lienzo a sangre y todo lo demás son capas que **se apagan solas** cuando llevas
dos segundos sin mover el ratón (la ley del reposo, aplicada al pie de la letra).
La biblioteca deja de ser una columna fija: es la cinta de semanas de arriba, que
en esta casa ya es la gramática de Entreno y de la dieta.

**L-02 · Cualquier foto entra.** La mesa no come `progressPhotos`: come
`{ url, pie }`. Con eso, «llevar a la mesa» aparece en el archivo (elige dos y
ábrelas), en la maquinaria (una foto de la prensa, para marcarle el agarre), en
el check-in y en cualquier formulario con foto. Es lo que convierte una pantalla
de la revisión en **una herramienta del producto**.

**L-03 · Se abre con lo que estabas mirando.** Desde el archivo con las dos
marcadas; desde el check-in con «esta semana contra la anterior» ya puesto. Hoy
se entra a la mesa vacía y hay que volver a elegir lo que ya habías elegido.

### La mano

**L-04 · Arrastrar dibuja.** Sin modo y sin pestaña. Mover el encuadre es con la
rueda y con el espacio, como en cualquier herramienta de dibujo del mundo; los
cuatro deslizadores bajan a un cajón «ajuste fino» que se abre cuando de verdad
hace falta clavar dos encuadres. El color: uno, y basta — el trazo es del
entrenador, no un dato (ley del color).

**L-05 · La tinta se desvanece.** Un trazo dura ocho segundos y se va solo. Es lo
que hace que se pueda hablar y señalar sin acabar con una telaraña, y es la
diferencia entre anotar un documento y explicar en directo. Lo que tenga que
quedarse, se fija: doble clic sobre el trazo y ya no se borra (y entonces sí sale
en el PNG).

**L-06 · La regla es la única herramienta con nombre.** Una línea horizontal que
cruza **las dos fotos a la vez** y contesta la única pregunta medible que tiene
una comparación: ¿los hombros están donde estaban? Hoy existe («regla
horizontal») enterrada entre otras cinco. Aquí es la segunda pieza de la barra, y
es la única que no se desvanece.

### La voz

**L-07 · Grabar es un botón, y graba la mesa.** Se acabó elegir fuente: la fuente
es lo que estás viendo. Se pulsa, sale la cuenta, y todo lo que haces —pasar
semanas, acercar, trazar— queda grabado tal cual, con tu cara en la burbuja y tu
voz encima. La burbuja se arrastra, que ya funciona.

**L-08 · Al parar, ya está en su portal.** Hoy la grabación termina en un
`<a download>` y hay que subirla a algún sitio. La revisión por URL externa
(YouTube/Loom) ya existe y el circuito de «se lo mando» también: parar debería
ofrecer las dos salidas en una línea —«Mandársela» / «Guardarla»— y nada más.

**L-09 · Lo corto se queda dentro, lo largo se va fuera.** La aritmética del
grabador actual es correcta y hay que conservarla y **decirla**: por encima de
cinco minutos la mesa ofrece el enlace externo en vez de tragarse el archivo. El
aviso del tamaño mientras grabas ya está escrito.

---

## 3. Lo que se tira, lo que se queda

| Se queda (funciona y cuesta caro rehacerlo) | Se va |
|---|---|
| El mezclador cámara + fuente (`lib/useReviewRecorder`) | La elección de fuente |
| El dibujo sobre lienzo y la exportación (`renderComposition`) | Los seis iconos de herramienta y los seis colores |
| La rejilla semanas × ángulos, como UNA disposición más | «Composición» y «Salida» como barra fija |
| La revisión por URL externa | El panel de tres columnas |
| Los pies de foto con semana y peso | Los cuatro deslizadores a la vista |

No es tirar el estudio: es sacarle la herramienta que tiene dentro.

---

## 4. Coste y orden

- **Tanda 1 — la mesa** (L-01, L-02, L-03). Es la que cambia la sensación: fotos
  grandes, cualquier foto, y entrar con lo que traías. Toca `PhotoStudio.jsx`,
  `usePhotoStudio.js` y las puertas del archivo y de la maquinaria.
- **Tanda 2 — la mano** (L-04, L-05, L-06). Toca `StudioCanvas`, `StudioToolbar`
  y `renderComposition` (la tinta que se desvanece es estado nuevo, no un cambio
  de dibujo).
- **Tanda 3 — la voz** (L-07, L-08, L-09). Toca `ReviewRecorder` y el circuito de
  revisiones, que ya existe entero.

---

## 5. Lo que hay que decidir antes de construir

1. **¿El trazo por defecto se desvanece, o se queda?** Es la decisión que separa
   «explicar» de «anotar», y toda la barra depende de ella.
2. **¿La mesa vive en la revisión, o es una capa de toda la aplicación?** Si
   cualquier foto entra (L-02), la mesa se parece más al portapapeles —una
   herramienta que se invoca desde donde estés— que a una pestaña del cliente.
3. **¿Grabar también la voz sin cámara?** Muchos entrenadores no quieren salir en
   vídeo; hoy la cámara es obligatoria en la mezcla.
