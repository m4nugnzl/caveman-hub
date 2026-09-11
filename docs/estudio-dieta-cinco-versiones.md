# La dieta: cinco versiones de rediseño

> **Qué es esto.** Cinco maneras distintas de organizar la pantalla de la dieta,
> no cinco estilos de la misma. Cada una tiene un eje distinto —el ciclo, la
> comida, el ancho, la fecha, el cliente—, quita cosas que hoy existen y se
> puede construir sin las otras cuatro. Al final hay una comparación y una
> recomendación, pero la elección es del dueño.
>
> **De dónde sale.** Del replanteamiento de la dieta ya construido
> (`docs/replanteamiento-dieta.md`, tandas 1-3 hechas) y de lo que quedó vivo
> después: un hueco de ~500 px, el ciclo que solo se ve de uno en uno y las dos
> caras de la misma dieta. No propone tokens, ni fuentes, ni paletas: eso ya
> está decidido, y cambiar valores no es rediseñar.
>
> **Se mira en** `docs/dieta-cinco-versiones.html`, que las enseña clicables, y en
> `docs/dieta-cinco-versiones-cambios.html`, que enseña cada una **contra la pantalla
> de hoy**: se pulsa antes/después sobre el mismo marco y lo que sale va señalado en
> rojo y lo que llega en azul, con el fichero al lado.

---

## 1. Lo que NO se toca

Rediseñar lo que ya funciona es la manera más rápida de empeorar una pantalla.
De la dieta de hoy se quedan, en las cinco versiones:

- **La cinta.** Los días arriba, el reparto del ciclo debajo. Es la misma pieza
  que la tira del programa y ya no tiene excepciones por tipo de ciclo.
- **La mesa a ras del papel.** La casilla que se enciende con la fila
  (`.hoja-celda`), sin recuadros flotando. Es la gramática de Entreno.
- **El semáforo con suelo** (`estadoDe`), en un solo sitio del dominio.
- **La ley de que no receta.** Ninguna versión propone kilocalorías.
- **Las equivalencias dentro de la comida**, con sus grupos.

---

## 2. Lo que sigue mal, medido

| # | Qué | Dónde |
|---|-----|-------|
| A | **Un plan por macros sin reparto deja ~500 px de hoja vacía.** La caja llena el alto por ley y se ve: dentro solo hay dos tarjetas de elección, cuatro cifras y las pautas. | `NutritionModule.jsx:240` |
| B | **El ciclo solo se ve de uno en uno.** Toda la hoja cuelga de `variant`, un solo día. Lo que define un alto/bajo es la DISTANCIA entre sus días, y esa distancia no se ve en ninguna pantalla: la tarjeta «El ciclo» da las kcal de cada uno y nada más. | `NutritionModule.jsx:224` |
| C | **El objetivo se edita en una ventana, y hay una por día.** Montar un alto/medio/bajo son tres aperturas de la misma ventana con cuatro casillas, sin ver nunca los tres a la vez. | `MacroTargetCard.jsx:146` |
| D | **La misma dieta está dibujada dos veces**: la del entrenador (`NutritionModule.jsx`, 1.589 líneas) y la del cliente (`ClientDiet.jsx`, 451). Comparten las piezas y no el reparto, así que cada arreglo hay que pensarlo dos veces —y ya se han desincronizado dos veces—. | los dos ficheros |
| E | **El costado son cuatro tarjetas apiladas** —objetivo, el día, el ciclo, la evolución— junto a una mesa que en una dieta cerrada mide varias pantallas. Al pie del menú, el costado hace mucho que se acabó. | `LecturasDeLaDieta.jsx` |
| F | **La decisión que de verdad se toma aquí —subir o bajar— vive en una ventana.** La evolución es una tarjeta de 120 px con una chispa y un modal detrás; el plan ocupa la pantalla entera. | `EvolucionPopup.jsx` |

---

## 3. Las cinco versiones

### V1 · La mesa del ciclo
**El eje: la mesa es el ciclo entero, no un día.**

```
 ┌ Alto  Medio  Bajo  + día ─────────────────────── ··· ─┐
 │ Lun    Mar    Mié    Jue    Vie    Sáb    Dom         │
 │ Alto   Bajo   Alto   Bajo   Alto   Medio  Bajo        │
 ├───────────────────────────────────────────────────────┤
 │              KCAL     P      C      G    VECES        │
 │  Alto       [3200]  [180]  [420]  [ 80]   ×3          │
 │  Medio      [2800]  [180]  [320]  [ 75]   ×1          │
 │  Bajo       [2400]  [180]  [220]  [ 70]   ×3          │
 │  ────────────────────────────────────────────         │
 │  De media    2743    180    306     76   7 casillas   │
 │                                                       │
 │  Pautas ─────────────────────────────────────────     │
 └───────────────────────────────────────────────────────┘
```

- **Quita:** la ventana de cuatro casillas (C), la tarjeta «Objetivo» del
  costado, la tarjeta «El ciclo» del costado y el hueco de 500 px (A).
- **Gana:** la distancia entre días se ve y se teclea de una vez. La media
  ponderada deja de ser una frase al margen y pasa a ser el pie de la tabla,
  que es donde una media significa algo.
- **Cuesta:** medio día. La mesa es la rejilla de `PlanDia` con otras filas y
  el editor pasa de modal a celdas (`hoja-celda`, la que ya se usa).
- **Riesgo:** bajo. En una dieta CERRADA esta mesa no sustituye al menú:
  convive con él arriba, y hay que decidir si nace plegada.
- **Para quién:** todo el que pauta por macros, y cualquiera con más de un día.

---

### V2 · Las columnas del ciclo
**El eje: los días, uno al lado del otro, como el plan del bloque.**

```
 ┌──────────── Alto ──┬──── Medio ──┬──── Bajo ──────────┐
 │ 3200 kcal          │ 2800        │ 2400               │
 │ ───────────────────┼─────────────┼─────────────────── │
 │ Desayuno    900    │ Desayuno 780│ Desayuno   600     │
 │  · Avena 80 g      │  · Avena 60 │  · Claras 200 g    │
 │  · Whey  30 g      │  · Whey  30 │  · Whey    30 g    │
 │ Comida     1100    │ Comida  980 │ Comida     900     │
 │ Cena       1200    │ Cena   1040 │ Cena       900     │
 └────────────────────┴─────────────┴────────────────────┘
```

- **Quita:** el cambio de día como gesto (B). Copiar una comida «a otro día»
  deja de ser un menú y pasa a ser arrastrarla a la columna de al lado.
- **Gana:** es la pantalla que hace obvio lo que un ciclado ES. Y es la forma
  que el cliente ya tiene para su entreno en `PlanDelBloque`: una casa, una
  gramática.
- **Cuesta:** dos días. Con cuatro días y cinco comidas son veinte tarjetas a la
  vista: hay que resolver el plegado por comida, el ancho mínimo de columna y
  la vuelta a una sola columna en móvil.
- **Riesgo:** medio, y es de alto: cinco comidas en columna son 2.000 px de
  scroll, así que las cabeceras de día tienen que quedarse arriba.
- **Para quién:** dietas cerradas con dos o más días.

---

### V3 · La hoja a todo lo ancho
**El eje: quitar el costado. Una superficie y una lectura fija.**

```
 ┌ Alto  Medio  Bajo ──────────────────────────────────────┐
 │ 3200 kcal · 180 P · 420 C · 80 G · 2,1 g/kg · ▁▂▃▅  ↗   │ ← regla pegada
 ├─────────────────────────────────────────────────────────┤
 │  1 Desayuno ······································· 900 │
 │  2 Media mañana ··································· 400 │
 │  3 Comida ········································ 1100 │
 │  …                                                      │
 └─────────────────────────────────────────────────────────┘
      «El día»   «El ciclo»   «La evolución»  ← ventanas, no tarjetas
```

- **Quita:** las cuatro tarjetas del costado (E). Lo que hoy es una columna de
  lectura pasa a ser una **regla pegada** —la misma pieza que Entreno ya tiene—
  con tres puertas detrás.
- **Gana:** el menú recupera todo el ancho, que es donde está el trabajo; y la
  cifra contra la que se cuadra deja de perderse al bajar: hoy, al pie de la
  quinta comida, el objetivo lleva dos pantallas fuera de cuadro.
- **Cuesta:** medio día. La regla existe, las ventanas existen.
- **Riesgo:** bajo, con un pero: el costado es hoy la única lectura pasiva, y
  metida en ventanas puede no mirarse nunca. Por eso la cifra y la chispa se
  quedan EN la regla y solo el detalle entra en la ventana.
- **Para quién:** todo el mundo, y sobre todo en portátil.

---

### V4 · La dieta fechada
**El eje: la dieta no es un documento, es una sucesión de decisiones.**

```
 ┌─────────────────────────────────────────────────────────┐
 │  78,4 kg  ▁▂▃▄▃▂▁▂▃        3200 → 2950 → 2800 kcal      │
 │  ●──────────●───────────●──────────●──────────●         │
 │  6 jun     20 jun       4 jul     18 jul     hoy        │
 │             −250                   −150                 │
 ├─────────────────────────────────────────────────────────┤
 │  EN VIGOR DESDE EL 18 DE JULIO            [ cambiar ]   │
 │  Alto 2800 · Medio 2600 · Bajo 2400                     │
 │  …el plan, debajo                                       │
 └─────────────────────────────────────────────────────────┘
```

- **Quita:** la ventana de la evolución (F), y la idea de que el plan es un
  formulario. Un cambio de kcal deja de ser «teclear otro número» y pasa a ser
  un hecho con fecha — que es lo que ya se guarda (`dietLog`, `kcalSteps`) y
  hasta ahora solo se dibujaba a posteriori.
- **Gana:** la pantalla contesta sin abrir nada la pregunta que trae aquí al
  entrenador: «¿lo que le puse está funcionando?».
- **Cuesta:** dos días. El dato existe entero; lo que cambia es quién manda.
- **Riesgo:** el más alto de los cinco, porque cambia lo que la pantalla ES. Y
  hay que cuidar que no se deslice a recomendar («llevas tres semanas plano»):
  la ley de que la app no receta sigue mandando.
- **Para quién:** el seguimiento, que es casi todas las visitas a partir del
  primer mes.

---

### V5 · Una sola dieta, dos permisos
**El eje: el entrenador edita la hoja que el cliente ve. No hay dos pantallas.**

```
   La dieta de Javier                      [ Ver como él ]
 ┌─────────────────────────────────────────────────────────┐
 │  Desayuno                                     900 kcal  │
 │   Avena           80 g   ⇄                              │
 │   Whey            30 g   ⇄                              │
 │                                          + alimento     │ ← solo con permiso
 └─────────────────────────────────────────────────────────┘
```

- **Quita:** `ClientDiet.jsx` como pantalla aparte (D): 451 líneas que dibujan
  la misma dieta con otra maqueta y que se desincronizan cada vez que se toca
  una de las dos.
- **Gana:** lo que el entrenador monta es literalmente lo que el cliente abre.
  «Ver como» pasa a ser la comprobación y no otra pantalla.
- **Cuesta:** dos días largos, y es el que más regresión puede traer: los
  permisos y lo oculto (`Oculto.jsx`, `HIDDEN_INFO`) pasarían a decidirse
  dentro de una sola pieza en vez de por fichero.
- **Riesgo:** alto, y con un antecedente en contra escrito en el propio
  repositorio: `PlanDelBloque` existe justo porque «`VistaBloque` no es una
  vista: es un EDITOR». Antes de construir esto hay que contestar por qué aquí
  sí — y la respuesta candidata es que en la dieta el cliente no toca NADA, así
  que lo que sobra es exactamente el editor.
- **Para quién:** el producto entero, a medio plazo.

---

## 4. Comparación

| | Eje | Qué quita | Coste | Riesgo | Arregla |
|---|-----|-----------|-------|--------|---------|
| **V1** La mesa del ciclo | el ciclo | la ventana del objetivo y dos tarjetas | ½ día | bajo | A, B, C |
| **V2** Las columnas | la comida | el cambio de día | 2 días | medio | B |
| **V3** A todo lo ancho | el ancho | el costado entero | ½ día | bajo | E |
| **V4** La dieta fechada | el tiempo | la ventana de la evolución | 2 días | alto | F |
| **V5** Una sola dieta | la audiencia | una pantalla entera | 2 días | alto | D |

**Recomendación: V1 y V3, en ese orden; V4 después.**

V1 y V3 no se estorban —una cambia lo que hay DENTRO de la hoja y la otra
DÓNDE está la lectura— y entre las dos se llevan por delante cinco de los seis
defectos medidos con un día de trabajo. V2 y V5 son buenas pantallas, pero
compiten con V1 y V3 respectivamente: conviene verlas después de construir las
baratas. V4 es la que más cambia el producto y la que hay que decidir despacio.

---

## 5. Lo que ninguna de las cinco propone

- Registro de comidas del cliente: la app no pide adherencia y esa decisión
  está tomada.
- Recomendar kilocalorías. Ninguna versión propone un número.
- Cambiar tokens, tipografía o paleta.
- Tocar el esquema: las cinco caben en `days` + `week` tal como están hoy.
