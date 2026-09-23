# El lenguaje visual

Qué radio, qué canto, qué sombra y qué duración le toca a una pieza nueva.

La fuente de verdad son los tokens (`src/styles/tokens.css`). Este documento es
su índice: dice **cuál coger y cuándo**, que es lo que el archivo de tokens no
puede decir porque está ordenado por tipo de valor y no por tipo de pieza.

Regla de uso: si estás montando algo y no encuentras aquí su fila, **no inventes
un valor** — coge el de la fila más parecida. Un token mal elegido se corrige en
un minuto; un número suelto tarda tres meses en descubrirse.

---

## 0. De dónde sale esto

De medir la aplicación el 20 sep 2026, hoja por hoja. El resumen, porque explica
por qué el documento existe:

| Qué se midió | Resultado |
| --- | --- |
| `font-size` con token | 1.293 de 1.468 — **88 %** |
| `gap` con token | 1.022 de 1.392 — **73 %** |
| `box-shadow` sin token crudo | 327 de 335 — **98 %** |
| Colores literales fuera de `tokens.css` | 97 |
| Tokens de sombra | **11** |
| Primitivas de tarjeta | **3** (`.card`, `.tarjeta`, `.kpi`) |
| Tokens de movimiento en uso | 5, pero `--fast` firma el **83 %** |
| Valores literales de `letter-spacing` | **20**, con un solo token |

La disciplina de tokens es alta y no es el problema. El problema es que el
vocabulario tiene **dos generaciones conviviendo**: la de `.card` (radio 20,
`--edge-card`, `--shadow-sm`) y la del rediseño de septiembre (radio 12–18,
`--edge-fino`, `--shadow-tarjeta`). Las pantallas nuevas usan la segunda sin que
esté escrito en ninguna parte que es la que manda.

**Manda la segunda.** Todo lo que sigue la da por buena.

---

## 1. Superficies: las cuatro capas

De fuera hacia dentro, y cada paso **aclara**:

```
  mesa            --mesa           el marco de la ventana, fuera de la hoja
   └ hoja         --hoja           el papel de la página
      └ tarjeta   --surface        lo que se posa encima (blanco puro)
         └ hueco  --surface-sunken donde se escribe o se mete algo
```

En tema claro el escalón es corto a propósito (≈1,03:1 entre hoja y tarjeta) y
quien separa de verdad es el **canto más la sombra**. En tema oscuro es al revés:
la sombra no existe sobre grafito y separa el **canto solo**. Por eso ninguna
pieza debe fiarse de una sola de las dos cosas.

`--fill`, `--fill-subtle` y `--fill-strong` **no son superficies**: son rellenos
de estado (el hover de una fila, el fondo de una casilla de cifra, el mando
apagado). Una caja no se pinta nunca con un `--fill`.

---

## 2. Cantos

Siete tokens, y cada uno tiene un trabajo distinto. La confusión más común es
usar `--hairline` para el borde de una caja: `--hairline` **separa por dentro**,
no rodea.

| Token | Valor claro | Para qué |
| --- | --- | --- |
| `--hairline` | `#e5e7eb` | el filete **dentro** de una superficie: entre dos filas, bajo una cabecera, el `.divider` |
| `--hairline-strong` | `#cbd5e1` | el mismo filete cuando tiene que verse: el canto de una tabla, el hover de un campo |
| `--edge` | tinta al 10 % | el canto de lo pequeño y lo hundido: `.card-inset`, popover, modal |
| `--edge-card` | `#e2e8f0` | el canto de una **tarjeta grande**: `.card`, `.list`, `.tarjeta` |
| `--edge-fino` | negro al 6 % | el canto de una **mini-tarjeta** dentro de otra tarjeta: `.kpi`, `.palanca`, las filas-caja |
| `--edge-control` | `#e2e8f0` | el canto de lo que se toca: botón secundario, campo, select |
| `--canto-tocado` | `#94a3b8` | el canto al pasar por encima de una caja pulsable |

Todos son 1 px. **No hay cantos de 2 px** en el producto; lo que parece un canto
grueso es siempre un `box-shadow: inset 0 0 0 1.5px …` haciendo de marca de
selección, que es otra cosa.

---

## 3. Elevación: dos niveles

Cada nivel son **dos capas y siempre las mismas dos**:

- una **sombra de contacto** — corta, casi sin desenfoque, pegada al canto de
  abajo: dice que la pieza toca el papel.
- una **sombra ambiental** — larga, muy tenue y con *spread* negativo, que la
  recoge para que no manche el lienzo: da el volumen.

Una sombra de una capa se lee como un borde gris mal puesto. Una sombra dura
(alfa alta y sin *spread* negativo) se lee como un recorte pegado encima.
Ninguna de las dos aparece aquí.

| Nivel | Token | Para qué |
| --- | --- | --- |
| **1 · posado** | `--elev-1` | la tarjeta, la lista, la barra lateral flotante, la cabecera de cristal. Es el defecto: el 90 % de las superficies no pasa de aquí |
| **2 · flotando** | `--elev-2` | lo que está **encima de otra cosa**: menú, popover, modal, ventana lateral, y la tarjeta mientras el ratón la levanta |

**No hay nivel 3.** Si algo parece pedirlo, lo que pide es un velo (`--scrim` +
`--scrim-blur`), que es como esta casa dice «lo de atrás está inerte».

Dos sombras más, que **no son elevación** sino anatomía de un mando, y por eso
conservan nombre propio:

- `--shadow-control` — el botón de acción: contacto de 1 px **más** un filo de
  luz por dentro del canto de arriba. Sin el filo, un rectángulo azul con sombra
  parece un rectángulo azul con sombra.
- `--shadow-field` — el campo, que se **hunde** un punto. Si se nota, ya no es un
  campo: es una ranura.

> ⚠ Un `none` dentro de una lista de sombras separada por comas **invalida la
> declaración entera**. Para apagar una capa se escribe `0 0 0 0 rgba(0,0,0,0)`,
> nunca `none`.

### Migración

`--shadow-tarjeta`, `--shadow-flotante`, `--shadow-profunda`, `--shadow-float` y
`--shadow-tocada` ya **son** alias de los dos niveles: nacieron para una pantalla
cada uno y han dejado de ser decisiones independientes.

Los cuatro veteranos conservan su valor hasta que se migren sus 83 usos:

| Legado | Usos | Va a |
| --- | --- | --- |
| `--shadow-xs` | 18 | `--elev-1` |
| `--shadow-sm` | 37 | `--elev-1` |
| `--shadow-md` | 14 | `--elev-2` |
| `--shadow-lg` | 14 | `--elev-2` |

En una pieza nueva **se escribe `--elev-1` o `--elev-2`**, nunca uno de los
cuatro de arriba.

---

## 4. Radios

La escala no es «pequeño, mediano, grande»: es **cuánto se parece la pieza a un
instrumento**. Lo que se pulsa y se escribe va cerrado (8–12); lo que contiene va
abierto (14–26). Esa distancia entre las dos familias es lo que evita que una
tarjeta se lea como un campo de formulario grande.

| Pieza | Token | px |
| --- | --- | --- |
| Marca fina, barra de progreso, avatar pequeño | `--r-xs` | 5 |
| Botón, campo, select, chip pulsable | `--r-control` | 8 |
| Celda de una hoja, caja pequeña dentro de una tarjeta | `--r-sm` | 9 |
| Mando de barra de herramientas, fila-caja | `--r-control-md` | 10 |
| Botón de cabecera, mando alto | `--r-control-lg` | 12 |
| **Mini-tarjeta** (KPI, fila que es su propia caja) | `--r-tarjeta-sm` | 12 |
| Caja interior hundida (`.card-inset`), popover, menú, miniatura | `--r-md` | 14 |
| **Tarjeta de panel** (`.tarjeta`) | `--r-tarjeta` | 18 |
| **Tarjeta grande y lista** (`.card`, `.list`) | `--r-lg` | 20 |
| Modal, ventana flotante | `--r-xl` | 26 |
| Píldora, etiqueta, disco de serie, estado | `--r-pill` | 999 |

`--r-tarjeta-sm` y `--r-control-lg` valen los dos 12 px **a propósito**: son dos
nombres porque el día que el mando cambie de canto, la mini-tarjeta no tiene por
qué seguirlo.

**La píldora no es la forma del botón.** Lo que la píldora dice bien es «esto es
una etiqueta», y un botón no lo es.

Para una caja **dentro** de otra, el radio interior es
`calc(var(--r-x) - 1px)` — si no, la esquina de dentro sobresale de la de fuera.

Los radios del escaparate (`--lp-r`, `--lp-r-lg`, `--lp-r-xl`: 18/26/34) son
**solo** de la portada y del acceso. Dentro del producto no aparecen.

---

## 5. Espaciado

| Token | px | Para qué |
| --- | --- | --- |
| `--hueco-glifo` | 2 | lo que va pegado: icono y su palabra, unidad y su cifra, dos renglones de la misma etiqueta |
| `--s1` | 4 | el aire mínimo entre dos piezas distintas |
| `--hueco-renglon` | 6 | título y subtítulo, dos mandos de la misma barra |
| `--s2` | 8 | dentro de una fila |
| `--s3` | 12 | el relleno lateral de un control, el hueco entre filas |
| `--s4` | 16 | el relleno de una caja apretada (`.card-tight`, `.card-inset`) |
| `--s5` | 22 | **el relleno de una tarjeta** |
| `--s6` | 32 | entre bloques de una pantalla |
| `--s7` | 44 | entre secciones |

`--hueco-glifo` y `--hueco-renglon` son nuevos y cubren un agujero real: la
escala saltaba de 4 a 8 px y los dos huecos más escritos de la casa caían justo
ahí debajo — `gap: 2px` 105 veces y `gap: 6px` 83. No son escalones que faltaran
en la escala: son **el aire de dentro de una pieza**, que es otra medida. Un
icono contra su rótulo no se separa como dos filas de una lista.

Fuera de la escala, con nombre propio y razón escrita: `--hueco-movil` (20 px, la
sangría del teléfono) y `--hueco-hoja` (la sangría de la hoja, que se recalcula
por ancho en `responsive.css`).

**Alturas de control**, que son su propia escala: `--h-control-sm` 26 ·
`--h-control` 32 · `--h-control-lg` 36 · `--h-control-touch` 40 · `--h-placa` 52.
En táctil no hay «al acercarse» y la diana tiene que caber en una yema: por
debajo de 1024 px, lo pulsable va a `--h-control-touch`.

---

## 6. Tipografía

Una voz: **Geist**, autoalojada (`--font`). `--font-display` apunta a lo mismo;
lo que separa un titular de un párrafo es el peso y el interletraje, no la
familia. `--font-mono` es solo para valores que se copian y pegan literalmente
(una URL de webhook, un id) y para cifras que se comparan en columna.

### Tamaño

| Token | px | Para qué |
| --- | --- | --- |
| `--fs-3xs` | 9 | glifo preso de su caja: iniciales de un avatar, rótulo de eje. **No es texto** |
| `--fs-micro` | 10 | rótulo en versales de una mini-tarjeta |
| `--fs-2xs` | 11 | encabezado de columna |
| `--fs-xs` | 12 | etiqueta, delta, pie |
| `--fs-control` | 13 | el rótulo de un mando de la cinta |
| `--fs-sm` | 14 | secundario, botón, campo, fila |
| `--fs-base` | 16 | cuerpo |
| `--fs-md` | 18 | título de fila |
| `--fs-lg` | 22 | título de sección |
| `--fs-xl` | 30 | cifra de tarjeta |
| `--fs-2xl` | 42 | cifra principal |

### Peso

Cinco, y el guardián falla ante cualquier otro número:

`400` cuerpo · `500` rótulo · `600` fuerte (nombre de fila, `strong`, pestaña
abierta) · `700` cifra y titular de sección · `800` **solo** en la portada.

### Interletraje

Va **al revés que el tamaño**: cuanto más grande la letra, más se cierra; cuanto
más pequeña y más en versales, más se abre.

| Token | Valor | Para qué |
| --- | --- | --- |
| `--tracking-titular` | −0,02 em | de `--fs-lg` para arriba, y las cifras grandes |
| `--tracking-texto` | −0,01 em | el cuerpo apretado: botón, fila, rótulo de mini-tarjeta |
| *(nada)* | 0 | el resto |
| `--tracking-versal` | 0,04 em | etiqueta en mayúsculas de 11–12 px |
| `--tracking-stencil` | 0,1 em | la etiqueta troquelada de sección, versales de 9–10 px |

Los tres tokens nuevos sustituyen a veinte valores literales
(−0,01 / −0,012 / −0,015 / −0,02 / −0,022 / −0,025 / −0,026 / −0,028 / −0,03 por
un lado; 0,01 / 0,02 / 0,04 / 0,05 / 0,06 / 0,08 / 0,09 / 0,1 / 0,14 por el
otro). Al migrar: lo que esté entre −0,012 y −0,03 va a `--tracking-titular` si
la letra es grande y a `--tracking-texto` si no; 0,05 y 0,06 van a
`--tracking-versal`; 0,08 y 0,09 van a `--tracking-stencil`.

### Firma

En cada pantalla, **la firma ocupa sola el escalón más alto** de la escala que esa
pantalla usa. Nada más lo alcanza, y menos el costado. Un costado acompaña a una
firma; cuando la empata, la parte en dos. La tabla de las seis firmas está en
`tokens.css`, en el bloque «Una firma por pantalla».

---

## 7. Color

Tres familias que **no se mezclan nunca**, y la regla que las ordena:

> **El cromo no tiene color, salvo uno. El color es del dato.**
> La señal aparece solo donde se puede tocar o donde estás: el botón, la pestaña
> abierta, el foco, el enlace, la semana en curso, el día de hoy. Nunca decora
> una superficie, nunca titula, nunca tiñe una caja entera.

### 7.1 El cromo

`--accent` (#2b7ab8 de día, #5aa9e8 de noche) y nada más. Elegido por contraste:
4,59:1 sobre blanco, porque aquí el acento **también es texto**. Por eso se
descartó el azul de sistema de iOS (#007AFF), que se queda en 3,8:1.

`--accent-soft` es el relleno de **lo activo** (pestaña puesta, día abierto).
`--accent-wash` es el tinte de **hover**, con más cuerpo, porque el 8 % detrás de
un título de dos palabras es el mismo color que la tarjeta.

`--brasa` (#c4452e) es marca, no cromo: el rojo del disco de 25 kg del logotipo.
Dos reglas — es **estructural, nunca un estado** (`--negative` dice «mal»; la
brasa dice «aquí»), y es **pequeña**: un punto, una regleta. En cuanto pinta una
superficie deja de ser una marca y pasa a ser un tema.

### 7.2 El estado

Tres tintas, cada una con **dos pesos** que se eligen por sitio:

| | Texto (≥4,5:1) | Figura (≥3:1) | Tinte | Canto |
| --- | --- | --- | --- | --- |
| bien | `--positive` | `--positive-grafico` | `--positive-soft` | `--positive-edge` |
| aviso | `--warning` | `--warning-grafico` | `--warning-soft` | `--warning-edge` |
| mal | `--negative` | `--negative-grafico` | `--negative-soft` | `--negative-edge` |

La letra lleva la tinta que **se lee**; la figura lleva la que **se ve**. Bajar
una figura al escalón de la letra pequeña es lo que deja una pantalla apagada al
lado de su dibujo.

`--semaforo-bien/medio/mal` son el relleno de una barra de juicio, más vivos aún,
porque una barra de 4 px no es texto.

`--info` vale **lo mismo que el acento**, a propósito: un aviso informativo no
dice nada de un dato, dice algo de la pantalla — o sea que es cromo.

### 7.3 El dato

**Seis tintas más una neutra**, y salen de los discos de competición: rojo 25,
azul 20, amarillo 15, verde 10. Un entrenador los lee sin traducirlos.

| Tinta | Qué significa | Quién la lleva |
| --- | --- | --- |
| `--data-blue` | el cuerpo y su medida | peso, ritmo, pesaje, cita, cómo duermes |
| `--data-rose` | el cuerpo que cambia de forma | % graso, cintura, dolor, hambre |
| `--data-violet` | la carga | tonelaje, serie tope, esfuerzo, fatiga, entrenos hechos, ganas de seguir |
| `--data-teal` | el trabajo hecho | series efectivas, adherencia al plan, energía, ánimo |
| `--data-amber` | la comida | kcal, carbos, adherencia a la dieta, digestiones, agujetas, temperatura |
| `--data-pink` | lo que se cuenta a mano | pasos, proteína, fotos, estrés |
| `--data-slate` | **la referencia** | el fantasma, lo comparado, lo que no lleva color |

`--data-slate` **no es la séptima categórica**: es lo que contestan
`metricColor`, `medidaColor` y `readiness.js` cuando una serie no dice tinta, y
por eso **tiene que sobrar siempre**. Si una categoría se lo queda, deja de
significar «esto no tiene color».

Eran nueve hasta el 20 sep. El resto de esta sección es el porqué.

**Veredicto de la auditoría: era sistema donde alguien se paró a pensarlo, y
acumulación donde no.**

Lo que hay medido: la paleta se reparte desde **siete tablas independientes**,
cada una con su propia asignación completa.

| Tabla | Qué colorea |
| --- | --- |
| `domain/metrics.js` | las métricas del panel |
| `domain/medidas.js` | las medidas antropométricas, más una rueda de 6 para las propias |
| `domain/nutrition.js` | los macros |
| `domain/calendar.js` | los tipos de evento de la agenda |
| `domain/protocol.js` | los tipos de pregunta, más otra rueda de 6 |
| `domain/today.js` | los tipos de tarea de «Hoy» |
| `domain/goals.js` | los objetivos |

`metrics.js` **sí es un sistema**: razona cada asignación contra las demás, y
está escrito por qué las series pueden compartir color (el ritmo *es* el peso; la
serie tope *es* el tonelaje medido de otra forma) y por qué otras no pueden (los
pasos no comparten el ámbar de las kcal porque se dibujan en la misma banda). Eso
es exactamente lo que hay que hacer.

Las otras seis no razonan: reparten. El resultado es que el violeta significa
tonelaje, grasas, competición y entreno según dónde mires, y el ámbar significa
kcal, carbos, descanso y objetivo. **No es grave mientras dos tablas no se
dibujen en el mismo gráfico** —el color categórico es local por naturaleza— pero
tampoco está escrito en ninguna parte que esa sea la condición.

#### Las colisiones que sí importan

No son entre tablas: son entre **el dato y el estado**, porque ahí sí se miran
las dos cosas a la vez y una juzga.

| Serie | Estado | Separación | Veredicto |
| --- | --- | --- | --- |
| ~~`--data-orange`~~ `#b3520f` | `--warning` `#c2410c` | 8° de matiz | **el mismo naranja** → retirada |
| ~~`--data-lime`~~ `#557d12` | `--positive` | verde distinto | no distinguía nada → retirada |
| `--data-rose` `#c0392b` | `--negative` `#dc2626` | 6° de matiz | **el mismo rojo** → se separa por sitio |
| `--data-teal` `#0e7f73` | `--positive` `#047857` | 11° de matiz | casi el mismo verde → se separa por sitio |
| `--data-blue` `#1b6ea6` | `--accent` `#2b7ab8` | — | ya estaba resuelto por sitio |

Retirar tintas no basta, y no puede bastar: **el semáforo se queda el rojo, el
naranja y el verde**, que son tres de las seis familias útiles del círculo. No
hay sitio donde esconder una paleta categórica de seis.

Así que se resuelve como ya se resolvió el azul del acento — **por SITIO, no por
matiz**, y esto es ahora la ley:

> **El semáforo solo aparece como relleno pegado a un juicio**: una chapa, una
> barra de «cómo lo lleva», una flecha de tendencia.
> **La paleta de dato solo aparece como trazo, disco de leyenda o cifra de una
> serie.**
> Nunca la misma marca.

Mientras eso se cumpla, que `--data-rose` y `--negative` sean parientes no
confunde a nadie: uno dibuja una línea y el otro rellena una chapa.

#### El mínimo

Seis categóricas más una neutra. El número no es de gusto: **es el que ya usa el
producto donde reparte color por sí solo.** Las dos ruedas que asignan tinta sin
que nadie elija —las medidas propias de `domain/medidas.js` y las preguntas
propias de `domain/protocol.js`— tienen exactamente **seis** entradas cada una, y
rotan. O sea que seis es el número al que el producto ya decidió que dos series
pueden empezar a repetir color sin que se note. Nueve tintas para eso es,
literalmente, acumulación.

Se fueron `--data-orange` y `--data-lime`: son las dos que no añadían una
distinción que no diera otra ya, y las dos que más se acercaban al naranja del
aviso y al verde del bien. El reparto resultante es la tabla del principio de
esta sección.

#### Lo que se movió (20 sep)

| Dónde | Qué | De | A | Por qué |
| --- | --- | --- | --- | --- |
| `metrics.js` | cintura | naranja | **rojo** | con el % graso: las dos miden la forma del cuerpo, no su masa |
| `metrics.js` | adherencia (entreno) | lima | **teal** | con las series efectivas: cuánto del trabajo previsto se hizo |
| `medidas.js` | temperatura basal | naranja | **ámbar** | la única libre de las cinco de fábrica, y se lee como temperatura |
| `medidas.js` | rueda de medidas propias | — | **las seis** | entra el rojo, sale el lima |
| `protocol.js` | fatiga | naranja | **violeta** | con el esfuerzo: la misma sesión medida dos veces |
| `protocol.js` | energía | lima | **teal** | con el ánimo: el mismo eje, y se preguntan seguidas |
| `protocol.js` | adherencia (dieta) | lima | **ámbar** | con las digestiones: cumplir y cómo te sienta |
| `protocol.js` | hambre | naranja | **rojo** | con el dolor: los dos son avisos del cuerpo |
| `protocol.js` | ganas de seguir | gris | **violeta** | el gris es la referencia y tiene que sobrar; va con los entrenos hechos |
| `protocol.js` | rueda de preguntas propias | — | **las seis** | salen el gris y el lima; mismo orden que la rueda de medidas |

`calendar.js`, `today.js`, `goals.js` y `nutrition.js` no se tocaron: ya estaban
dentro de las seis.

#### Cuando dos series comparten tinta

**Comparten porque son la misma familia, y se dice cuál en el sitio donde se
asigna.** El peso y su ritmo, el tonelaje y la serie tope, el esfuerzo y la
fatiga: son el mismo dato medido dos veces, y por eso no estorba que se vean
iguales. Compartir por falta de tintas, sin escribir la razón, es exactamente lo
que la regla viene a impedir.

Dos tablas obligan a compartir por aritmética, y está declarado:

- **la sesión** tiene 8 preguntas medibles → dos parejas (esfuerzo/fatiga,
  energía/ánimo);
- **la semana** tiene 9 → tres parejas (adherencia/digestiones,
  hambre/dolor, entrenos/ganas).

#### Lo que sigue sin resolver

Una **medida propia puede coincidir con una de fábrica**: la rueda tiene seis
tintas y las cinco fijas ocupan cinco de ellas, así que la primera medida
inventada sale del mismo rojo que la glucosa. Ya pasaba antes —el teal y el
violeta colisionaban igual— y no empeora, pero tampoco se arregla cerrando la
paleta: se arreglaría haciendo que la rueda empiece por la primera tinta **libre
en ese cliente**, que es un cambio de lógica y no de paleta.

---

## 8. Movimiento

Tres tiempos, elegidos por **lo que responde cada uno**:

| Token | Duración | Para qué |
| --- | --- | --- |
| `--micro` | 0,12 s | lo que no se mueve de sitio: un color, una opacidad, un canto que se enciende |
| `--entrada` | 0,26 s | lo que **llega** y ocupa sitio: ventana, panel, fila nueva |
| `--salida` | 0,16 s | lo que se va |
| `--gesto` | 0,12 s + muelle | hover y press de una caja o un botón |
| `--slow` | 0,5 s | la cascada con la que se monta una pantalla. No responde a un gesto: presenta |

**La salida siempre es más rápida que la entrada.** Esperar a que algo
desaparezca es la forma más barata de que una interfaz se sienta lenta, y lo que
ya decidiste no merece ceremonia.

Cuatro curvas:

| Curva | Valor | Para qué |
| --- | --- | --- |
| `--ease` | `cubic-bezier(0.32, 0.72, 0, 1)` | todo lo normal: sale rápido y frena al llegar |
| `--ease-salida` | `cubic-bezier(0.4, 0, 1, 1)` | acelera y se va. No frena: no hay nada que aterrizar |
| `--muelle` | `cubic-bezier(0.34, 1.12, 0.64, 1)` | el muelle **discreto**: pasa un pelo del valor final y vuelve |
| `--spring` | `cubic-bezier(0.18, 1.32, 0.34, 1)` | el rebote **de verdad**, y solo para lo que **aterriza**: un modal, una marca que cae en su sitio |

`--spring` **nunca** en hover ni en salida: una tarjeta que rebota al pasar el
ratón es un juguete. Para eso está `--muelle`, envuelto en `--gesto`.

Y dos reglas de suelo:

- **Nada que se anime puede mover una caja de sitio.** Se animan `opacity`,
  `transform`, `color`, `background-color`, `border-color` y `box-shadow`. Nunca
  `height`, `width`, `padding` ni `margin` en una interacción.
- `prefers-reduced-motion` está respetado globalmente en `base.css`. No hace
  falta repetirlo por pieza.

---

## 9. Foco

Uno para toda la casa:

```css
outline: var(--foco);          /* 2px solid var(--accent) */
outline-offset: var(--foco-sep); /* 2px */
```

Hacia dentro, cuando la pieza va a sangre y no tiene por fuera dónde dibujarlo:
`outline-offset: calc(var(--foco-sep) * -1)`.

Un foco que cambia de grosor según dónde estés es un foco que no se reconoce.

---

## 10. Agrupar superficies: el patrón *inset grouped*

**Una lista de filas no es una tarjeta por fila.** El patrón de iOS —y el que el
producto ya usa— es: una sola superficie, las filas dentro, y **separadores de
1 px sangrados** que no llegan al canto.

```jsx
<Grupo title="Tu semana">
  <button className="list-row">…</button>
  <button className="list-row">…</button>
</Grupo>
```

- El rótulo va **fuera** de la superficie, encima. Dentro sería una cabecera de
  panel, que es justo la caja que este patrón viene a quitar.
- El separador es un `::before` con `left`/`right` sangrados a `--s4`, no un
  `border-top`: con borde, el de la primera fila tocaría el canto de la tarjeta.
- Si hay icono, el sangrado sube a 58 px para que el filete arranque bajo el
  texto y no bajo el icono.
- La fila entera se pulsa. El chevron es la **única** flecha permitida del
  producto, y solo ahí: cierra una fila pulsable en vez de rotular un verbo.

Todo eso ya lo hacen `.list` / `.list-row` (`superficies.css`) y `Grupo`
(`components/ui/Grupo.jsx`). `Grupo` se escribió para el teléfono pero el patrón
no es del teléfono: **cuando una pantalla nueva tenga entre tres y ocho filas del
mismo tipo, esto es lo que se usa**, no una rejilla de tarjetas.

Una tarjeta por fila se reserva para cuando cada fila lleva **más de un dato y
una forma propia** — la franja de cifras del Resumen, las tarjetas de día.

---

## 11. Las tres primitivas de caja

| Clase | Radio | Canto | Sombra | Relleno | Cuándo |
| --- | --- | --- | --- | --- | --- |
| `.card` | `--r-lg` 20 | `--edge-card` | `--shadow-sm` | `--s5` | la caja de propósito general |
| `.tarjeta` | `--r-tarjeta` 18 | `--edge-card` | `--elev-1` | `--s5 --s5 --s6` | **la tarjeta de panel**: Resumen, Entreno, Dieta |
| `.kpi` | `--r-tarjeta-sm` 12 | `--edge-fino` | `--elev-1` | `--s3 --s4` | la mini-tarjeta dentro de otra |
| `.card-inset` | `--r-md` 14 | `--edge` | — | `--s4` | el hueco hundido **dentro** de una caja |

Que haya tres no es sano y está dicho: `.card` (57 usos) es la generación
anterior y `.tarjeta` (31) la actual. **En una pantalla nueva se usa `.tarjeta`.**
La fusión de las dos es trabajo aparte, porque `.card` viste 57 sitios y cambiar
su radio de 20 a 18 se ve en todos a la vez.

---

## 12. Lo que el guardián comprueba

`npm run verify` (`scripts/verify-styles.mjs`) falla ante:

- una clase de `className` que no existe en el CSS, y una clase de CSS que no
  escribe nadie;
- un `var(--x)` que apunta a un token inexistente — en JSX **y** en CSS (un
  `var()` que no resuelve invalida la declaración entera y no da ningún error);
- la paleta de datos usada como cromo;
- un `font-weight` numérico fuera de 400/500/600/700/800;
- un ancho de `@media` fuera de 639.98 / 1023.98 / 1199.98 / 1439.98;
- un icono fuera de la escala 13/15/20;
- un campo por debajo de 16 px sin pareja táctil (el zoom de iOS);
- los verbos prohibidos («Eliminar», «Agregar», «Agendar»…).

Y **avisa**, sin fallar, de los espacios en px que tienen token (535 hoy).

Lo que **no** comprueba todavía, y son los tres agujeros por los que se coló lo
que este documento viene a cerrar:

1. **Sombras**: nada impide escribir un `box-shadow` a mano ni usar uno de los
   cuatro tokens legado. Debería exigir `--elev-1` / `--elev-2`.
2. **Interletraje**: nada impide un `letter-spacing: -0.022em`. Debería exigir
   la escala de cinco, igual que ya hace con `font-weight`.
3. **Radios de caja**: nada impide vestir una tarjeta con un radio de mando.

Los tres son el mismo trabajo y van después de la migración, no antes: hoy
fallarían en cientos de sitios legítimos.

---

## 13. Suelo de calidad

No se anuncia, se cumple:

- responsive hasta 390 px, sin scroll horizontal a 1280;
- foco de teclado visible (§9);
- objetivo táctil de 40 px por debajo de 1024;
- contraste AA en todo lo que sea texto — y la casa lo mide y lo escribe junto al
  token, que es lo que hace que se pueda comprobar;
- cero saltos de layout al abrir, cerrar, colapsar o cambiar de pestaña;
- `prefers-reduced-motion` respetado.

Y la regla de Chanel: antes de salir, quitarse un accesorio.
