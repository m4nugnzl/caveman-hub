# Estudio · Cuatro acabados

15 sep 2026. Encargo: *«quiero replantear el diseño general de la aplicación,
pulirlo, hacerlo más limpio. Plantea varias versiones y dame distintos
acabados»*, con dos capturas de referencia de un Resumen de cliente.

Las láminas están en `docs/estudio-cuatro-acabados.html`. **Nada de esto está
construido**: es un estudio para elegir.

Las cuatro pintan la **misma pantalla** —Resumen de un cliente—, con el mismo
contenido, los mismos datos del cliente demo y el mismo costado. Lo único que
cambia es el acabado; si no, la comparación no vale.

---

## 1. Diagnóstico

Medido sobre `capturas/barrido-acabado-11sep/10-resumen.png` y el árbol de hoy.

La pantalla no está sucia de adornos: está sucia de **empate**.

| Lo que se ve | Lo que lo causa |
|---|---|
| Nada manda | 8 cajas al mismo peso; la firma de la pantalla —la cifra de peso— comparte escalón con tres rótulos más |
| El costado compite | «El plan», «Lo último» y «Cómo le llevas» son cartas idénticas a las del cuerpo, solo que más estrechas |
| El azul dejó de significar | `revision.css:4798` pinta en acento el rótulo de toda fila que sea puerta: cinco rótulos azules en «El plan» compitiendo con los dos verbos que sí piden algo |
| Agujeros, no vacíos | ~190 px de caja gris bajo tres píldoras en «Cómo va»; ~700 px en Dieta sin comidas |
| Los datos están en silos | Peso, calorías, tonelaje y adherencia son **la misma serie semanal** dibujada a cuatro anchos, cuatro escalas y en cuatro cajas |

Esa última fila es la que abre la puerta a algo más que un pulido, y es de donde
sale el tercer acabado.

Dos de estos puntos son incumplimientos de reglas que **ya están escritas** en
`tokens.css` y llevan meses sin aplicarse: «una firma por pantalla, sola en su
escalón más alto» (la regla L-07) y «el acento solo donde se toca, nunca
titula».

---

## 2. Lo que comparten los cuatro

Si esto no se decide primero, el acabado solo cambia el color del problema. Las
cuatro láminas ya lo llevan puesto:

1. **Una firma por pantalla, sola en su escalón.** En Resumen es la cifra de
   peso con su veredicto, a 42 px. Nada más llega a 22.
2. **El costado acompaña, no compite.** Deja de ser «cartas más estrechas» y
   pasa a ser otro material.
3. **El acento solo donde se toca.** Ni un rótulo azul en reposo. El azul queda
   para el botón, la pestaña abierta, el foco, el enlace y lo que está pendiente
   de que tú lo pongas —«Ponle cardio»—.
4. **La regla de graduación, solo donde hay escala.** Canto de la cinta y línea
   base de los gráficos. Repetida como separador se vuelve textura.

---

## 3. Los cuatro acabados

### Hoja — la caja desaparece

Una hoja por pantalla. No hay tarjetas dentro: las secciones se separan con aire
y un filete, y el costado es una columna de **la misma hoja**. Toda la jerarquía
la lleva el tipo.

- **Gana:** el más limpio; no toca ni un componente de datos; responsive casi
  gratis.
- **Cuesta:** sin cajas, el orden lo lleva todo el espaciado. Pantallas con
  muchas secciones sueltas —Ajustes, Librería— pueden pedir alguna caja de
  vuelta, y eso hay que decidirlo de una vez y no pantalla a pantalla.

### Mesa — cartas, pero con rango

La evolución del diseño de hoy y la más parecida a las referencias que mandaste.
Se quedan las cartas, pero **una manda** y ocupa dos tercios, y el costado cambia
de material —hundido, sin sombra— en vez de ser una carta más estrecha.

Con la mano en el corazón: quitar bordes, ablandar sombras y abrir el radio es lo
que sale para cualquier panel parecido. Lo digo así para que elijas sabiendo que
esta es la opción segura, no la distintiva. Lo que sí son decisiones y no
defaults son la **mesa un paso más oscura** (`#e9e6dc` en vez de `#f7f6f2`,
porque un blanco sobre un casi-blanco no se lee como hoja) y el costado en otro
material.

- **Gana:** lo más barato; cero riesgo.
- **Cuesta:** sigue siendo un panel de cartas como el de todos, y deja intacto el
  problema de los silos.

### Cinta — bandas sobre un solo eje de semanas

La única que sale de **este** producto. Todo lo que mira el entrenador en esta
pantalla es la misma cosa: una serie por semana. Así que se dibujan una debajo de
otra **compartiendo un eje** que aparece una sola vez, abajo.

Lo que da no es estética: «bajó el tonelaje la semana 5 y esa misma semana se
paró el peso y cayó la adherencia» se lee **en vertical, de un vistazo**. Hoy eso
exige abrir cuatro cajas y acordarse.

- **Gana:** contesta la pregunta que de verdad se hace el entrenador; cuatro
  series en menos alto que dos cartas de hoy.
- **Cuesta:** la más cara —hay que hacer que los cuatro gráficos compartan escala
  y ancho, y eso toca `datos.css` y los componentes de gráfico—; el móvil hay que
  resolverlo aparte; y solo encaja donde el contenido es serie temporal, así que
  admite dos gramáticas en el producto.

### Noche — el mismo chasis con la luz apagada

No es un quinto diseño: es el tema oscuro hecho bien, y va encima de cualquiera
de los tres anteriores. Va aparte porque el oscuro de hoy sí es un problema
—`index.html` lo dice con todas las letras: grafito azulado con acento cobalto es
exactamente el default que `CLAUDE.md` §25.2 manda evitar—.

- **Grafito cálido, no azul.** `#151412` lleva el mismo tono que el papel —40°,
  casi sin saturación—.
- **La misma señal.** El índigo del día subido de luminosidad, no un acento
  nuevo. Un acento distinto de noche es un segundo producto.

---

## 4. Recomendación

**Hoja como base del producto entero**, y **Cinta solo en Resumen y en Progreso**,
que son las dos pantallas donde todo es serie semanal. Hoja resuelve el empate en
todas partes y no cuesta casi nada; Cinta paga su precio justo donde el entrenador
hace su trabajo. Noche va encima de las dos, en cuanto la base esté decidida.

**Mesa** es la salida si prefieres no mover el esqueleto: mejora lo de hoy de
forma clara y se hace en una tarde, pero la pantalla sigue siendo un panel de
cartas como el de todos.

---

## 5. Fases, si se aprueba

| Fase | Qué toca | Dónde |
|---|---|---|
| 0 · Chasis común | La firma sola en su escalón, el costado en otro material, el acento fuera de los rótulos, los vacíos con verbo | `tokens.css`, `revision.css`, `superficies.css` |
| 1 · Hoja | Quitar la caja como unidad | `superficies.css`, `layout.css`, `piezas.css` |
| 2 · Mesa | *Alternativa a la 1.* Mesa más oscura, cartas sin canto, costado hundido | `tokens.css`, `superficies.css` |
| 3 · Cinta | Eje de semanas compartido y bandas alineadas | `datos.css`, `revision.css`, componentes de `analytics/` |
| 4 · Noche | Grafito cálido, señal recalibrada, paleta de datos repasada | bloque oscuro de `tokens.css` |

Las fases 1 y 2 son excluyentes. **La 0 vale para cualquiera de las dos y se puede
hacer ya**, sin decidir el resto.

---

## 6. Comprobaciones hechas sobre las láminas

- **Contraste.** Medido par a par en los dos temas. Dos valores no pasaban 4,5:1
  y se corrigieron: el terciario sobre el hundido en día (4,45 → 4,52, `#756f64`
  → `#746e63`) y sobre el hueco en noche (3,81 → 4,53, `#8b847a` → `#999186`).
- **Defaults de IA (§25.2).** Noche arrancó en `#0d1014` con el índigo tal cual:
  azul-negro + un acento es el default prohibido, y además el índigo del día se
  queda en 3,1:1 sobre esa superficie. Cinta arrancó con las bandas sobre mesa
  templada y leía crema, que es el otro. Los dos corregidos.
- **Eje compartido de Cinta.** En el primer montaje las líneas iban de canto a
  canto y las barras y los discos por celdas: las bandas *parecían* compartir eje
  sin compartirlo. Todo va ahora al centro de su celda. Las barras y los discos
  pasaron de SVG a HTML porque un `preserveAspectRatio="none"` estiraba los
  círculos en óvalos con el ancho de la columna.
- **Móvil.** El documento no desborda a lo ancho (`scrollWidth === clientWidth`);
  quien se desplaza es el marco de cada lámina, no la página.
- **Teclado y movimiento.** Foco visible y `prefers-reduced-motion` respetado.

---

## 7. Lo que este estudio no resuelve

- **El móvil de cada acabado.** Las láminas son de escritorio. Hoja y Mesa caen
  solas; Cinta no, y es parte de su coste.
- **Las otras cinco pantallas.** Inicio, Clientes, Entreno, Dieta y Revisión
  heredarían el acabado, pero cada una tiene su firma y habría que comprobarla
  una a una con la tabla de `tokens.css` delante.
- **El portal del cliente.** Va aparte: es otro aparato y otra jerarquía.
