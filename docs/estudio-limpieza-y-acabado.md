# Estudio · «Lo que separa esto de Coachway»

11 sep 2026. Encargo: *«propón cambios o mejoras de diseño y limpieza globales,
quiero que la app esté a la altura de Coachway o Efort»*.

Nada de esto está construido. Todo lo que sigue está medido sobre el árbol de
trabajo de hoy y sobre las capturas de `capturas/barrido-acabado-11sep/`.

---

## 0. Lo primero: hay una avería viva

`npm run verify` **falla ahora mismo**:

```
FALLO clases sin definir: 15
        components/Client/BarraDeSesion.jsx → .barra-sesion
        components/Client/BarraDeSesion.jsx → .sesion-regla
        …y 13 más
```

`BarraDeSesion.jsx` no está en git (sin seguimiento), está montada en
`ClientLayout.jsx:91`, y **ninguna de sus quince clases existe en ningún CSS**:
la barra de sesión del portal se pinta sin estilo. Es la tanda del móvil a
medias. Va aparte de este estudio, pero se arregla antes que nada de lo de
abajo, porque mientras esté así el verificador no sirve de red para el resto.

Lo demás del verificador está limpio: 0 tokens sin definir, 0 usos de la paleta
de datos como cromo, 0 iconos fuera de escala, 0 anchos fuera de escala, y
`eslint` pasa sin una sola queja. El sistema que existe se cumple. El problema
es lo que **no** está escrito en ninguna comprobación.

---

## 1. Diagnóstico

### A. El sistema visual está escrito y no se cumple

`tokens.css` declara dos leyes en su cabecera y una tabla de firmas. Se
incumplen en la propia aplicación:

**«El acento nunca titula.»** `revision.css:4798`:

```css
.palanca.is-puerta > .palanca-k { color: var(--accent); }
```

Toda fila que sea puerta pinta **su rótulo** en azul, en reposo. En «El plan»
(`10-resumen.png`) las cinco filas son puertas, así que salen cinco rótulos
azules —Objetivo, Calorías, Pasos, Cardio, Entreno— compitiendo con los dos
verbos que de verdad piden algo («Ponle objetivo», «Ponle cardio»). El azul
deja de significar «aquí se toca» y pasa a ser el color de la tarjeta. Es
además lo contrario de la ley del reposo: *una oferta que no se apaga es
mobiliario*.

**«Una firma por pantalla.»** La tabla de `tokens.css` asigna una a cada
pantalla, y la prueba que propone es taparla con la mano y ver el resto
tranquilo. Hoy no pasa: Inicio son seis cajas del mismo peso, mismo canto,
mismo radio y mismo rótulo de 15 px; Resumen son ocho. Ninguna manda, así que
el ojo no tiene por dónde entrar y la pantalla se lee como un formulario.

### B. El vacío es un agujero, no un estado

Medido sobre las capturas de hoy:

| Pantalla | Hueco |
|---|---|
| Dieta sin comidas (`12-dieta.png`) | **~700 px** de caja con una frase gris y un botón arriba del todo |
| Clientes (`23-clientes.png`) | **~350 px** de tabla vacía bajo seis filas |
| Resumen, «Cómo va» (`10-resumen.png`) | **~190 px** bajo tres píldoras |
| Inicio, «Sin señales» (`01-hoy.png`) | ~60 px |

Y no es un fallo de redacción: es que no hay **una** gramática de vacío. Existe
el primitivo `EmptyState` (33 usos) y conviven con él diez vacíos ad hoc:
`vacio-invita`, `biblioteca-vacio`, `cartera-vacio`, `hoja-vacia`,
`hoja-calentamiento-vacio`, `auto-vacia`, `food-vacia`, `sidebar-vacio`,
`selector-etiquetas-vacio`, `cierre.is-vacio`. Cada pantalla resolvió el suyo.

Una pantalla que es 40 % gris vacío no se lee como sobria: se lee como sin
terminar. Es lo que más separa esto de Coachway, por encima de cualquier token.

### C. El peso tipográfico no es una escala: son dieciséis valores

```
400(15)  500(71)  550(31)  560(1)  600(155)  640(5)  650(128)  660(1)
680(6)   700(216) 720(9)   730(1)  740(4)    750(2)  800(14)
```

Coachway usa **tres** (400/500/600). Archivo es variable, así que inventar un
730 no cuesta nada — y por eso hay 560, 640, 660, 680, 720, 730, 740 y 750,
cada uno puesto una tarde por alguien que quería «un pelín más». Ninguno es
reproducible, y juntos son la razón de que dos rótulos del mismo rango no se
vean iguales.

Los **tamaños** sí están disciplinados: todo sale de `--fs-*`, cero literales
sueltos. El problema es solo el peso.

### D. El espaciado se sale de la escala una vez de cada tres

1.599 usos de `var(--sN)` contra ~700 literales en px:

```
163× 2px   102× 3px   98× 6px   98× 4px   85× 5px   78× 1px   32× 7px   23× 8px
  9× 9px     9× 10px   4× 22px   4× 12px   3× 30px   3× 14px   3× 11px
```

4 y 8 están en la escala y se escriben a mano igual. 6, 5, 22, 30, 11, 14 y 9
no están en ninguna parte.

### E. El CSS no tiene sistema de nombres

- **2.413 clases** repartidas en **426 prefijos**, de los cuales **179 tienen
  una sola clase**.
- Dos idiomas en la misma hoja: `.card`/`.tarjeta`, `.empty`/`.vacio`,
  `.name`/`.nombre`, `.btn`/`.boton`.
- Abreviaturas que no dicen nada a quien llega: `bl`, `pp`, `q`, `p`, `es`,
  `etq`, `rmap`, `side`/`lado`.
- **354 clases definidas en más de un fichero.** `.btn` en diez hojas, `.input`
  en ocho; `.name`, `.k`, `.n`, `.v`, `.who`, `.d`, `.value`, `.active` sueltas
  y globales en siete cada una.

Esa última línea es la que produce las trampas que ya se han pagado tres veces
—el `.rail` que hacía invisibles los menús, la colisión de `.tira`, la de
`.tira-semana`—. No son accidentes: son la consecuencia aritmética de tener
ocho clases de una letra en el espacio global.

El propio código ya lo confiesa. `ui/Hoja.jsx`, en su cabecera: *«`.hoja` YA ES
OTRA COSA en esta casa […] Dos vocabularios distintos compartiendo prefijo es
exactamente el fallo del que se viene»* — y aun así la pieza nueva se llamó
`.sheet` para esquivarlo, que es el tercer idioma.

### F. Los ficheros ya no dicen lo que contienen

`revision.css`: **6.348 líneas, 91 secciones**. Dentro están Entreno, Dieta, la
cartera, la tira de semanas, el pie de la barra lateral, el menú de la cuenta y
las palancas del plan. El corte del fichero de 14.402 líneas se hizo
—correctamente— conservando el orden de cascada byte a byte, pero se cortó por
**orden**, no por **materia**, y el resultado es que buscar la regla que pinta
una fila sigue costando lo mismo que antes. El nombre miente.

### G. 368 clases definidas que ningún `className` escribe

Candidatas, no condenadas: algunas se componen en tiempo de ejecución. En una
cata de ocho al azar, **cinco estaban muertas de verdad** (`crumb`,
`coverage`, `is-matrix`, `proto-preset`, `folio-head`) y tres eran falsos
positivos. Extrapolando, hay del orden de 200 clases que solo ocupan.

### H. El peso de arranque

- **472 KB de CSS en una sola hoja** (77,6 KB gzip), que se carga entera
  también en la portada pública, donde solo se usan las ~97 clases `lp-*`.
  Quien entra a la web a leer qué es esto se descarga el CSS de la hoja de
  entreno.
- `index.js` de **672 KB**.
- **4 `React.lazy`** en 267 componentes.

### I. Y la decisión que no se ha tomado: cuál de los dos temas es la cara

`index.html` arranca con `data-theme="dark"`. La noche es lo que ve todo el
mundo. Y sin embargo, la vuelta de tuerca del 11 sep —papel templado #f7f6f2,
sombras teñidas con la tinta del papel, contraste del secundario subido a
7,8:1— se dio **solo en el tema claro**.

El hierro se quedó donde estaba: `--canvas: #090b0e`, un negro azulado, con
acento cobalto. Eso es, literalmente, el segundo de los tres defaults de IA que
`CLAUDE.md` §25.2 manda evitar («fondo casi negro + un único acento»). El
trabajo de acabado se hizo en el tema que casi nadie ve.

No lo resuelvo aquí porque no es un movimiento, es una decisión de producto
—ver §4—.

---

## 2. Los movimientos

Trece, en cuatro tandas. Las dos primeras se ven y son baratas; la tercera es
la que sube el nivel; la cuarta no se ve y se paga sola.

### Tanda 1 · La ley del peso

**L-01 · Tres pesos, no dieciséis.** 400 cuerpo · 500 rótulo · 700 cifra y
titular. Los trece intermedios se colapsan al más cercano, y se añade la
comprobación a `verify-styles.mjs`: un `font-weight` fuera de {400,500,700} es
un fallo. Sin la comprobación vuelven en un mes.

**L-02 · La escala de espacio manda.** Todo literal de ≥4 px pasa a su token.
Se declara la excepción de 1–3 px —canto, sombra, desplazamiento óptico— y se
comprueba lo demás. Son ~200 sustituciones mecánicas.

**L-03 · El acento vuelve a su sitio.** Cae
`.palanca.is-puerta > .palanca-k { color: var(--accent) }`. El rótulo es gris
siempre; el azul se queda en el hueco (`.palanca-invita`) y en el `:hover`. «El
plan» pasa de siete azules a dos, y los dos que quedan son los que piden algo.

### Tanda 2 · El vacío deja de ser un agujero

**L-04 · Un solo vacío.** Los diez vacíos ad hoc pasan por `EmptyState`, y
`EmptyState` se rehace con la gramática que la casa ya tiene: una frase que
dice **qué va a aparecer ahí** y el verbo en azul. Nada de icono decorativo
grande ni de disculpa.

**L-05 · La caja mide lo que tiene.** La ley «la lista es una CAJA que llena el
alto» se matiza: llena el alto **cuando hay contenido que desplazar**; con
menos filas que el alto disponible, la caja acaba donde acaba su última fila y
el lienzo queda debajo. Ataca los cuatro agujeros medidos en §1.B de una vez.

**L-06 · Las tarjetas de una fila dejan de estirarse.** `align-items: start` en
las rejillas donde hoy el `stretch` fabrica el hueco de «Cómo va».

### Tanda 3 · La firma, de verdad

**L-07 · Una firma por pantalla, aplicada.** Para cada una de las seis
pantallas de la tabla de `tokens.css`: la pieza firma sube un escalón de
tamaño y peso, y **todo lo demás baja uno**. Rótulos de 11 px en versales →
12 px normales en gris; cifras secundarias de 30 → 22. La prueba es la que ya
está escrita: taparla con la mano y ver la pantalla plana.

**L-08 · La profundidad la hace la superficie, no el canto.** Hoy en hierro las
ocho cajas de Resumen llevan el mismo canto al mismo alfa; eso es lo que lee
«robótico». Las tarjetas de segundo nivel —las del costado— pierden el canto y
se apoyan en `--surface-sunken`; el canto y la luz se reservan a la firma.
Coachway hace exactamente esto: cinco escalones de superficie y casi ninguna
sombra. Aquí los escalones ya existen (`--surface`, `--surface-raised`,
`--surface-sunken`, `--canvas-alt`) y no se usan para jerarquizar.

**L-09 · La entrada se coreografía, una vez.** Al montar una pantalla, la
columna principal entra en cuatro escalones de 40 ms y el costado en uno. Con
`--ease`, que ya está, y bajo el bloque de `prefers-reduced-motion`, que ya
está. Son ~30 líneas y es la diferencia entre «pintado» y «vivo» — es lo que
hace Coachway en cada sección, y aquí no cuesta una librería porque los 40
`@keyframes` ya existen.

### Tanda 4 · La limpieza que no se ve

**L-10 · Un nombre por cosa.** Mueren las clases genéricas sin prefijo —`.name`,
`.k`, `.n`, `.v`, `.d`, `.who`, `.value`, `.active`— sustituidas por su prefijo
de bloque; y con ellas la mayor parte de las 354 colisiones. Comprobación
nueva: una clase de menos de cuatro caracteres, o sin guion, es un fallo.

**L-11 · Los ficheros, por materia.** `revision.css` se parte por sus 91
secciones conservando el orden de cascada exacto, con el mismo método que ya se
verificó byte a byte en el corte anterior. Objetivo: ningún fichero por encima
de ~1.200 líneas y el nombre igual a lo que hay dentro.

**L-12 · La portada no carga la aplicación.** Las ~97 clases `lp-*` salen a su
propia hoja, que importa `LandingPage`. Hoy la web pública descarga 472 KB de
CSS para pintar una portada.

**L-13 · El barrido de lo muerto.** Las 368 candidatas se revisan a mano; lo que
se compone en tiempo de ejecución se declara como excepción —igual que ya se
hace con los literales de color— y el resto se va.

---

## 3. Qué NO propongo

- **Tocar la paleta.** Los 116 tokens están medidos, razonados, y solo cinco no
  se leen nunca. El problema no son los valores: es que la estructura no los
  usa. Rediseñar no es cambiar tokens.
- **Cambiar de tipografía.** Archivo + Archivo Expanded ya es una voz propia y
  está bien repartida (la ancha solo en cifras y portadillas). Lo que falta no
  es otra letra: son menos pesos.
- **Copiar el verde de Coachway ni los anillos de Efort.** Lo que hay que
  copiarles es el método —escalones de superficie, tres pesos, una coreografía
  de entrada—, no el aspecto.

---

## 4. La decisión abierta

**¿Cuál de los dos temas es la cara del producto?**

Hoy arranca en noche y el acabado se hizo de día. Hay tres salidas y solo una
la puedes decidir tú:

1. **La noche es la cara** → el hierro se lleva el mismo trabajo que se llevó el
   papel: sacarlo del negro azulado genérico hacia un grafito con temperatura
   propia, y el cobalto se revisa contra él.
2. **El papel es la cara** → `index.html` arranca en claro, y la noche pasa a
   ser lo que es en Linear o Stripe: una preferencia bien hecha, no el default.
3. **Se queda como está** → entonces §1.I es deuda asumida, y conviene
   escribirlo en `tokens.css` para que dentro de tres meses nadie lo vuelva a
   descubrir.

No hay una respuesta técnica. Las tres son defendibles; lo que no lo es es que
sean dos productos distintos según la hora.

---

## 5. Orden sugerido

```
0   BarraDeSesion sin CSS           ── bloqueante, va sola
1   L-01 L-02 L-03                  ── se nota en todas las pantallas
2   L-04 L-05 L-06                  ── mata los agujeros
3   L-07 L-08 L-09                  ── es la que sube el nivel
4   L-10 L-11 L-12 L-13             ── no se ve
```

---

## 6. Lo que se construyó (12 sep 2026)

Encargo: *«procede con los cambios, el tema principal es el claro, y propón
mejoras visuales de diseño»*. Nada commiteado.

### La decisión de §4: EL PAPEL ES LA CARA

Salida 2. `index.html` arranca en `data-theme="light"`, `ThemeProvider` cae en
`'light'` cuando no hay preferencia guardada, el `theme-color` sin `media` pasa
al papel y el `manifest.webmanifest` se pone al día (llevaba el `#eceef1` de la
paleta anterior, dos vueltas viejo). La noche no se retira: pasa a ser lo que
debía ser, una preferencia en Ajustes → Apariencia. El porqué queda escrito en
los tres sitios donde se va a buscar: `index.html`, `useTheme.jsx` y la cabecera
de `tokens.css`.

Efecto lateral que confirma la decisión: la barra de tinta —oscura en los dos
temas por diseño— pasa a hacer el trabajo para el que se escribió. Con el lienzo
de papel al lado es el ancla que hace que el contenido se lea iluminado; contra
el hierro era una columna oscura sobre otra.

### Los movimientos

| | Qué | Estado |
|---|---|---|
| L-01 | Tres trabajos y un display: la escala de peso | **hecho** |
| L-02 | La escala de espacio manda | **hecho, la mitad medida** |
| L-03 | El acento vuelve a su sitio | **hecho** |
| L-04 | Un solo vacío | **hecho** |
| L-05 | La caja mide lo que tiene | **hecho, acotado** |
| L-06 | Las tarjetas de una fila dejan de estirarse | **no: contradice una decisión del dueño** |
| L-07 | Una firma por pantalla | **sí** (§7) |
| L-08 | La profundidad la hace la superficie | **hecho** |
| L-09 | La entrada se coreografía | **hecho; ya existía y no llegaba al Resumen** |
| L-10…L-13 | La limpieza que no se ve | **no** |

**L-01.** 195 declaraciones recolocadas; de dieciséis pesos a cinco. La escala
se declara con nombre en `tokens.css` (`--peso-cuerpo` 400 · `--peso-rotulo` 500
· `--peso-fuerte` 600 · `--peso-cifra` 700 · `--peso-display` 800) y la sostiene
un guardián nuevo en `verify-styles.mjs`: un `font-weight` numérico fuera de esos
cinco es un fallo. Comprobado metiendo un 730 a mano: falla y señala la línea.

Cinco y no los tres que proponía el estudio. Colapsar las 298 declaraciones de
600 contra las 238 de 700 dejaba media aplicación en negrita, que es otra forma
de que todo pese lo mismo; y la cifra —que es la firma de cuatro de las seis
pantallas— necesita un escalón por encima del nombre de fila. El 800 se queda
acotado por escrito a la portada y las portadillas.

**L-02.** 405 literales a su token. Se cambian los que YA tenían token
—4·8·12·16·22·32·44, que es el mismo valor escrito a mano y no mueve un píxel—
más 5 y 7, que se van a su vecino a un píxel. Guardián nuevo: un literal de
espacio con token es un fallo. Los 328 que quedan (6, 9, 10, 11, 14…) salen como
AVISO y no como fallo: no tienen token, arreglarlos es mirarlos uno a uno —6 px
cae justo entre dos escalones y moverlo son 2 px en 148 sitios— y el aviso está
para que la cuenta no vuelva a crecer sin que nadie lo note.

De paso, el CSS compilado ADELGAZA en gzip pese a crecer en crudo: 78.286 bytes
contra los 79.462 de antes. `var(--s2)` repetido comprime mejor que catorce
literales distintos.

**L-03.** Cae `.palanca.is-puerta > .palanca-k { color: var(--accent) }` y el
azul se muda al `:hover` y al foco. Medido en el Resumen con la aplicación
delante: «El plan» pasa de siete azules a tres, y los tres que quedan son los
que piden algo —«Ponle objetivo», «Ponle cardio», «Monta su rutina»—.

**L-04.** El vacío es una banda —azulejo, qué va a aparecer ahí, verbo al final
de la fila— en todas partes. El taller ya lo había resuelto así para su lado;
esa corrección no era del taller, era del vacío, así que sube a `controles.css`
y el bloque de `taller.css` desaparece. El azulejo baja de 58 px con glifo de 26
a 40 con glifo de 20: 26 es tamaño de ilustración y un vacío no ilustra nada.
`/plantillas` pasa de 290 px de losa a ~130 de banda.

Lo que NO se hizo: meter los diez vacíos ad hoc por `EmptyState`. Nueve de ellos
no son vacíos de pantalla sino renglones dentro de otra cosa —una fila de tabla
(`.food-vacia`), una línea en un desplegable (`.selector-etiquetas-vacio`), un
pie de hoja (`.hoja-calentamiento-vacio`)—, y meterlos en un `Panel` con tarjeta
sería el error contrario. Son dos gramáticas y son dos a propósito: el vacío que
ES la pantalla, y la línea callada dentro de una pieza.

**L-05, acotado.** La ley se matiza donde está el agujero de verdad: **una caja
vacía deja de estirarse; una caja a medias, no**. La hoja de la dieta sin
comidas pasa de 890 px con canto —de los cuales 700 eran rectángulo vacío— a
acabar donde acaba su contenido. La cartera con seis clientes se queda como
está: ahí la caja ES la tabla, con cabecera de columnas arriba y su cuenta
abajo, y cortarla por la última fila deja la cuenta flotando en el lienzo.
Vacío es vacío; poco no es vacío.

**L-06, no.** `revision.css` ya documenta que `align-items: start` se probó en
ese mosaico y el dueño lo devolvió: *«sigue sin corregirse, hay espacio vacío
ahí»*. Estirar la fila es correcto y está discutido dos veces. Lo que sí era
corregible es adónde iba el alto sobrante: los 190 px bajo «Cómo va» se
acumulaban ABAJO, que es lo que se lee como «falta algo». Repartidos arriba y
abajo (`justify-content: center` cuando la tarjeta no lleva trayectoria), la
pregunta queda en el centro de su caja y el aire deja de tener forma de agujero.

**L-08.** El costado del Resumen era tres cajas sueltas al lado de un mosaico de
cinco: ocho cantos redondeados en una pantalla. La casa ya tenía resuelto esto
para la dieta («EL COSTADO ES UN PANEL»), así que la regla deja de colgar de
`.dieta-lado` y pasa a colgar de `.es-panel`; el Resumen lo pide en su JSX.
`.tarjeta` entra en la lista de lo que pierde su caja dentro de un panel, y el
`:hover` que alza una tarjeta se apaga ahí dentro: una sección que se ilumina al
pasar vuelve a decir «soy una caja aparte».

**L-09.** La coreografía YA existía (`pantalla-entra`, cuatro escalones de
50 ms). Lo que no existía era su alcance: medido con la aplicación delante, el
hijo de `.layout` en el Resumen es `.resumen-pagina` y no un `.stack`, así que
la pantalla más poblada del producto —ocho cajas— era la única que aparecía de
golpe. Ahora la cascada va por el mosaico y el costado entra al final como una
sola pieza, que es lo que dice su forma.

**L-07, parcial.** La parte medible ya estaba hecha en una pasada anterior: el
rótulo de sección es 12 px en caja normal y tinta terciaria, no 11 en versales.
Lo que queda —subir un escalón la pieza firma de cada una de las seis pantallas
y bajar uno todo lo demás— es un repintado transversal y subjetivo que pide el
ojo del dueño pantalla por pantalla, no un `replace`. Va aparte.

**L-12, no, y con motivo.** Sacar las ~97 clases `lp-*` a su hoja no es gratis:
`portada.css` lleva también el acceso (`.acceso*`, `.login*`) y `LandingPage` se
importa en firme desde `App.jsx`, así que la hoja se metería igual en el paquete
principal. Para ganar los 77 KB habría que volver perezosas la portada y el
acceso, y la portada está PRERRENDERIZADA: su CSS en un trozo diferido es un
destello sin estilo en la página pública, que es el sitio donde menos se puede
permitir. Se cambia un peso por un defecto visible. Merece su propia decisión.

**L-10, L-11, L-13, no.** Son las tres masivas —renombrar 354 colisiones,
partir `revision.css` por materia, barrer 368 candidatas muertas— y ninguna se
puede hacer a ciegas en la misma tanda que un cambio de tema. Van solas y con el
verificador de red.

### Lo que no era del estudio

- `BarraDeSesion.jsx` ya no rompe `npm run verify`: sus quince clases existen.
- Dos pruebas de `foodEquivCatalogo.test.js` fallan, y fallaban antes de tocar
  nada (comprobado con el árbol en `git stash`). Van aparte.

---

## 7. L-07, entero — medido con la aplicación delante (12 sep 2026)

§6 lo dejó «parcial» porque la parte que quedaba —subir la pieza firma de cada
pantalla y bajar todo lo demás— parecía subjetiva. No lo era tanto: lo que
faltaba no era un ojo, era **una regla que dijera qué se mide**.

> En cada pantalla, la firma OCUPA SOLA el escalón más alto de la escala de tipo
> que esa pantalla usa. Nada más lo alcanza — y menos el costado.

Con eso, la prueba de taparse la firma con la mano deja de ser una impresión y
pasa a ser un número. Se midió con Playwright sobre la demo local —sesión de
entrenador para las cinco del panel, **cuenta de cliente de verdad** para el
portal—, recorriendo cada pantalla y sacando `font-size` y `font-weight`
calculados de todo nodo con texto propio, ordenados de mayor a menor.

### Lo que salió

| Pantalla | Firma (`tokens.css`) | Lo más grande, medido | |
|---|---|---|---|
| Inicio | el saludo con su cuenta | saludo 42 · cola 30 | **pasa** |
| Clientes | la cartera | nombre 18 · cinta 20 | **pasa** ¹ |
| Entreno | la hoja veraz | **costado 22** · hoja 18/14/11 | falla |
| Revisión | la cifra con su veredicto | cifra 42 · el plan 18 | **pasa** |
| Dieta | la cifra de kcal | kcal 42 · **pasos 22** | falla |
| Portal | la sesión de hoy | saludo 32 · peso 32 · **sesión 18** | falla |

¹ El 20 de la cinta es el rótulo de la barra de cabecera, que es **chasis**: la
misma pieza en las once pantallas, decidida aparte y con el dueño delante
(«chirría», ver `.cartera-cab-titulo`). No es contenido de esta pantalla, así
que no compite con su firma. Tocarlo sería deshacer una decisión tomada para
ganar un punto en una tabla.

Tres pantallas pasaban ya —el trabajo de la pasada anterior— y tres no. Las que
fallan lo hacen todas por lo mismo: **lo que acompaña habla más alto que lo que
manda.**

### Los tres arreglos

**Entreno.** El número más grande de la pantalla estaba FUERA de la hoja: las
cuatro cifras del costado —60 series, 278.552 kg, 23/24, 96 %— a 22, contra un
rótulo de día a 18 y un nombre de ejercicio a 14. Se cruzan: el rótulo de la
columna sube a 22 y el costado baja a 18 (es el mismo caso que
`.comparativa-tope`, que ya estaba razonado en `base.css`). Dentro de la hoja, el
nombre del ejercicio coge el peso que la escala le reserva —600, «el nombre de
una fila»— y el registro sube de 11 a 12, porque el fantasma de lo hecho es un
tercio de la firma y 11 px es el escalón de un encabezado de columna, no el de un
dato que se lee.

El tamaño del nombre NO sube: la fila mide 42 px fijos y lleva dos renglones, y
de ese alto depende que las ocho columnas se lean como una sola mesa. Comprobado
además que el peso no estrecha nada que no estuviera ya estrecho: a 1440 y a
1680, los mismos dos nombres se cortaban a 500 y se cortan a 600 (cuatro píxeles
más de desbordamiento, ningún nombre nuevo cortado).

**Dieta.** Dos cifras grandes en el mismo panel y a dos palmos: las kcal a 42 y
los pasos a 22. Los pasos bajan a 18, que además es el cuerpo que ese mismo dato
ya tenía en «El plan» del Resumen y de la Revisión — el mismo número escrito
igual en las tres pantallas donde aparece.

**Portal.** El peor de los tres, y el único que hacía falta ver con una cuenta de
cliente para creérselo: «Buenas, Marta» a 32, «61,0» a 32, «−3» a 24 y **la
sesión del día a 18**. La firma era la quinta pieza más grande de su propia
portada, y lo único que se veía de su tarjeta era el botón azul. La sesión sube
al escalón de arriba con una clase que la nombra (`.sesion-hoy-nombre`,
compartida por las dos tarjetas que contestan esa pregunta y que hasta ahora la
escribían con dos cuerpos distintos); el saludo baja a rótulo —esta casa ya tenía
escrito que «el saludo es cortesía; el título es estructura»— y el peso baja un
punto, porque en el portal el peso es una lectura y no el trabajo. La misma cifra
sigue a 42 en el Resumen del entrenador: ahí sí es a lo que se va.

Antes y después en `capturas/l07-firma-12sep/`.

### Lo que se deja fuera, y por qué

- **El Resumen del cliente no tiene firma asignada.** La tabla de `tokens.css`
  nombra seis pantallas y el Resumen no es una de ellas, y se le nota: una cifra
  a 42 y tres a 30. Asignarle una es una decisión de producto —añadir una fila a
  esa tabla—, no un repintado. Queda apuntado.
- **La firma de la Dieta es «la cifra de kcal *con su barra de macros*»**, y
  barra no hay: hay una tabla de tres filas. Eso es rehacer una pieza, no bajar
  un escalón.
