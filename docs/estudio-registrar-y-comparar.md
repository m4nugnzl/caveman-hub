> **DESCARTADO por el dueño el 13 de septiembre de 2026.** El lenguaje visual nuevo —gris
> frío, Instrument Sans, renglones planos— no le gustó nada. Lo vigente es
> [`estudio-la-app-del-cliente.md`](estudio-la-app-del-cliente.md), corregido con lo que sí
> valía de aquí: **fuera la miniatura de vídeo** (la prueba del 1,2 % está abajo) y **el PC
> diseñado entero**, en el lenguaje de la casa.

# Registrar y comparar — la app del cliente en dos aparatos

**13 de septiembre de 2026.** El estudio con las láminas y los dos prototipos clicables está en
[`estudio-registrar-y-comparar.html`](estudio-registrar-y-comparar.html). Este archivo es el
plan de registro.

**Corrige a [`estudio-la-app-del-cliente.md`](estudio-la-app-del-cliente.md)**, cuyo concepto
sigue en pie —«tu historial es el producto», las tres leyes y los cuatro destinos— pero que
falló en tres cosas: proponía la miniatura de vídeo como cara de la app, no enseñaba el PC y
daba por buena la paleta de la casa.

Nada de esto está construido.

---

## La frase

**El teléfono registra. El PC compara.** Y ninguna pantalla necesita la foto de un ejercicio
para tener cara.

---

## 1 · Por qué se cae la miniatura

Contado contra la base local:

| Cifra | Qué es |
|---|---|
| **239** | ejercicios del catálogo con el que arranca todo entrenador. `catalog_exercises` **no tiene columna de vídeo**: ninguno puede tener miniatura, nunca |
| **7** | ejercicios propios en la base de demostración (`exercises`), los únicos que pueden llevar vídeo |
| **3** | de esos siete lo tienen puesto — el **1,2 %** de los renglones |

Y cuatro averías que no se arreglan con más vídeos:

1. **La foto no la elegimos nosotros.** La fija YouTube; en un vídeo de gimnasio el primer
   fotograma suele ser el entrenador, un logo o una careta de intro.
2. **El vídeo puede no ser el ejercicio.** Es una URL pegada a mano. Si está mal, la lista
   miente con una imagen, que es lo más difícil de desmentir.
3. **Una columna de iniciales es peor que no tener fotos.** Con el 1,2 % cubierto, el ojo lee
   «aquí falta algo» y el que parece incompleto es el entrenador.
4. **Se rompe sola.** Cuarenta renglones son cuarenta peticiones a un tercero; sin red o con
   el vídeo borrado, huecos.

**Lo que ocupa su sitio:** la **cifra de tu última serie** y una **curva de ocho puntos** en
cada renglón. Está siempre disponible después de la primera sesión, no puede estar equivocada
y es distinta en la pantalla de cada persona. El vídeo baja a un renglón dentro de la ficha
—«Ver el vídeo»— que sencillamente no existe si no lo hay. Lo que sube a lo alto de la ficha
es el `cue`: lo que le repite su entrenador.

---

## 2 · El idioma visual, empezado de cero

Se retiran el papel crema (`#f1efe8`), el azul `#3b49df`, la fuente Archivo y las tarjetas
anidadas. Entra:

| | |
|---|---|
| **Color** | Suelo `#F6F7F9` · hoja `#FFFFFF` · hundido `#EDEFF3` · tinta `#0E1116` · tinta apagada `#878E9C` · acción `#1F55E0`. Semáforo (`#0E7A4F` `#B4690E` `#BE3A2E`) acotado a juzgar entregas, nunca lo que levantas |
| **Letra** | Instrument Sans para lo que se lee; JetBrains Mono **solo** en el carril del registro, para que la semana de arriba caiga sobre la de abajo |
| **Forma** | Una hoja por pantalla con renglones dentro · el número es la imagen · el color solo significa «esto se toca» · aire de 4 en 4 |
| **Movimiento** | Respuesta < 100 ms · se guarda donde ocurrió · nada gira esperando · la serie apuntada cae en su sitio (6 px, 140 ms). Todo se apaga con `prefers-reduced-motion` |

Razón del gris frío: la app es un instrumento de medida. El crema calentaba lo que tiene que
estar callado para que destaquen cifras y líneas.

---

## 3 · De dónde se copia

| App | Qué se toma | Qué no |
|---|---|---|
| Hevy | El fantasma de la vez anterior dentro de la casilla; la sesión como modo | El cronómetro que arranca solo; lo social |
| Strong | La cifra del récord con su fecha | El «1RM estimado» como titular |
| MacroFactor | La línea de tendencia sobre los puntos; el objetivo fechado | El algoritmo que decide qué comer |
| Whoop · Oura | Un titular por pantalla, y que el titular sea el dato | Inventarse una puntuación |
| Strava | La sesión acabada como objeto que se vuelve a abrir | Todo lo social |
| Apple Salud | La gráfica como objeto principal con su rango | Los anillos; el color por categoría |
| Linear | El PC: dos columnas, ⌘K, respuesta inmediata | La densidad de una herramienta de trabajo |
| Efort · Coachway | El bloque como línea de tiempo | Su color de marca pintándolo todo; el chat como destino |

Las seis primeras salen de conocer esas apps, no de capturas del repositorio; Efort y Coachway
sí están en `capturas/referencias/`.

**Lo que no tiene ninguna:** en todas, el plan lo escribe el usuario, así que pedido y hecho son
lo mismo. Aquí están guardados por separado, y por eso cada serie se dibuja dos veces en el
mismo renglón —**la línea de la serie**, la firma del producto—.

---

## 4 · Los dos aparatos

**Teléfono (390 × 812).** Hoy · Entreno · Comer · Tú. La sesión es un modo que sustituye la
app entera —barra de destinos incluida— con dos salidas nombradas: «Dejarla» y «Terminar». La
ficha del ejercicio es una hoja que sube, también desde dentro de la sesión.

**PC (1 196 px).** Se abre para lo que el teléfono no puede:

| Lo que hace el PC | Cómo se traduce |
|---|---|
| Ver el bloque entero | **La parrilla**: diez semanas en filas, las sesiones en columnas, el volumen en cada celda |
| Comparar dos momentos | Pinchas una celda y el costado enseña esa sesión con su pedido → hecho, sin salir de la pantalla |
| Leer una tabla ancha | El historial de un ejercicio con **una columna por serie** |
| Ir a cualquier sitio | **⌘K** con ejercicios, sesiones y fechas |
| Poner dos fotos juntas | El comparador de Tú |

Lo que el PC **no** hace: registrar. Se puede, pero la pantalla no se diseña para eso.

El mueble es el mismo en las cinco pantallas del PC: trabajo a la izquierda, su pasado a la
derecha, un solo techo de ancho.

---

## 5 · Las tandas

| Tanda | Qué | Dónde |
|---|---|---|
| **1 · El idioma** | Los seis colores, las dos familias, la escala de aire. Única tanda que toca las dos mitades de la app | `src/styles/tokens.css`, `tipografia.css`, `scripts/verify-styles.mjs` |
| **2 · El renglón** | La cifra de la última serie y la curva de ocho puntos. Sustituye entera a la tanda «la cara» del estudio anterior. Pide una lectura que hoy no existe: último registro por ejercicio | Sobre `workout_data.blocks`; `ExerciseList`, `HojaDelCliente` |
| **3 · La sesión** | El modo sesión con el fantasma dentro de la casilla y la cuenta bajo el pulgar | `ClientRoutine`, `HojaDelCliente`, `SesionAMedias` |
| **4 · La ficha** | Sin vídeo obligatorio: el `cue` arriba, el vídeo en un renglón que desaparece, tres pestañas | `FichaEjercicioCliente`, `ui/Hoja` |
| **5 · El PC** | Parrilla, costado vivo, mesa del ejercicio y ⌘K. La más grande y la única que crea pantallas nuevas | `responsive.css`, `ClientLayout`, rutas de `/mi` |
| **6 · La voz** | Los ~30 puntos ya inventariados en el estudio anterior. No cambia | Los `sub=` de `PageHead` y `Fila`, y los vacíos |

Ninguna toca dominio, consultas ni políticas de la base. La 2 es la única que lee algo nuevo,
y lo lee de donde ya está guardado.

---

## 6 · Lo que hay que decidir antes de construir

1. **¿El idioma nuevo es de toda la app o solo del portal?** Comparten `tokens.css`. Si se
   queda solo en el portal hay dos productos con dos caras en el mismo repositorio.
   *Recomendación: las dos mitades, empezando por el portal.*
2. **¿La curva de ocho puntos se calcula al vuelo o se guarda?** *Recomendación: al vuelo; si
   se nota, se guarda un resumen por ejercicio. Reversible.*
3. **¿⌘K en una app en la que se entra dos veces por semana?** *Recomendación: sí, pero todo
   lo que hay dentro tiene además su camino pinchando.*
4. **¿«Comer» en lugar de «Dieta»?** Sigue pendiente del estudio anterior. *Recomendación: sí,
   con rebote de rutas.*

---

## Nota sobre los prototipos

Los números del PC están **calculados**, no dibujados: la parrilla, el costado, el volumen del
bloque y las fechas salen de un modelo de diez semanas que vive en el `<script>` del propio
documento. Por eso pinchar una celda de la semana 4 enseña kilos coherentes con los de la 9.
Las cifras estáticas del teléfono se han cuadrado con ese mismo modelo.
