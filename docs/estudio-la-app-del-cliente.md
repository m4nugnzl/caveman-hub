# La app del cliente — replanteamiento

> **CONSTRUIDO el 14 de septiembre de 2026.** El prototipo de TELÉFONO de este
> estudio es ya la visión del cliente en el móvil: `styles/portal-telefono.css` y
> `components/Client/movil/`. Cuatro destinos (Hoy · Entreno · Comer · Tú), la
> sesión como modo, la ficha como hoja que sube con su historial a dos carriles, el
> récord y el cajón de ejercicios. Su PC sigue descartado: el del monitor sale de
> `estudio-cajas.md`.

**13 de septiembre de 2026.** El estudio con las láminas y los dos prototipos clicables
—teléfono y PC— está en [`estudio-la-app-del-cliente.html`](estudio-la-app-del-cliente.html).
Este archivo es el plan de registro.

**Revisado el mismo día** con dos cambios que pidió el dueño: fuera la miniatura de vídeo, y el
PC diseñado de verdad (cinco pantallas, no una lámina). El intento de rehacerlo todo con un
lenguaje visual nuevo está en `estudio-registrar-y-comparar.html` y quedó **descartado**.

> **Su PC quedó descartado el 14 de septiembre.** La parrilla de diez microciclos y la
> frase «el PC compara» no le gustaron al dueño. Lo que va en su lugar está en
> [`estudio-la-mesa.md`](estudio-la-mesa.md), que conserva la tesis, las tres leyes y el
> teléfono de este estudio y solo cambia el PC.

**Sustituye a [`estudio-el-pc-del-cliente.md`](estudio-el-pc-del-cliente.md)**, descartado por
el dueño: su premisa ponía al entrenador en el centro de una app que no es suya.

Nada de esto está construido todavía.

---

## La frase

**No es el complemento del panel del entrenador. Es una app de entrenamiento que vale por sí
sola, y a la que además se le puede enganchar un entrenador.**

Alguien que no es cliente de nadie tiene que poder usarla para llevar sus entrenos.

---

## La tesis

**La app de hoy es un lector de planes. Tiene que ser un registro de entrenamiento que además
trae un plan dentro.**

El plan caduca —se acaba el bloque, se acaba el entrenador—. El registro no: los kilos que has
movido, las semanas que llevas, la curva de tu peso. Es lo único que sigue valiendo cuando no
hay nadie al otro lado, y hoy está enterrado.

### Las tres leyes

1. **El sujeto eres tú.** El entrenador es una *fuente*, no el protagonista. La app dice el
   hecho («1750 kcal desde el 2 de julio»), no quién lo escribió.
2. **Toda pantalla tiene pasado.** No hay sección «Historial»: cada cosa lleva el suyo colgando
   —el ejercicio abre su registro, el peso su curva, el bloque los bloques anteriores—. Una
   sección «Historial» es donde el pasado se va a morir.
3. **Lo que hay que hacer cabe en la primera pantalla.** El trabajo del cliente son cinco
   cosas: apuntar lo que levanta, seguir la dieta, pesarse, hacerse las fotos y contestar lo
   que le pidan.

---

## El diagnóstico, con las cadenas reales

La palabra *entrenador* es el sujeto gramatical de casi todos los estados del portal. Quita el
entrenador y no queda app: quedan cuatro pantallas explicando a quién esperan.

| Cadena | Dónde |
|---|---|
| «Tu entrenador no ha cambiado tus calorías desde que empezaste.» | `TuDieta.jsx` |
| «Tu entrenador no ha programado ejercicios en este día.» | `ClientRoutine.jsx`, `HojaDelCliente.jsx` |
| «Lo que tu entrenador necesita de ti para montarte el plan. Se hace una vez.» | `ClientOnboarding.jsx:56` |
| «Cuando tu entrenador te mande un cuestionario, un vídeo o te pida algo, aparecerá aquí.» | `FormulariosDelCliente.jsx` |

---

## Las referencias: qué se copia y qué no

| Se toma | No se toma |
|---|---|
| La **sesión del día abierta en la portada**, ejercicio a ejercicio | La **miniatura del ejercicio** en cada renglón: los dos la tienen, y es la pieza que peor envejece en la nuestra |
| — | Los **anillos de macros** — tres cifras con su gramo dicen más |
| La **sesión como modo**, con barra propia y una sola salida | El **verde de Coachway / azul de Efort** como color que lo pinta todo: rompe la ley del color |
| La **ficha del ejercicio como hoja que sube**, vídeo arriba, historial en pestañas | El **cronómetro que sube solo** en la barra de sesión |
| La **cifra del récord** («Joined · Check-ins 15 · Workouts 124», Coachway) | El **chat como cuarto destino** — el carril de lo mandado ya hace ese trabajo |
| Los **bloques como línea de tiempo** con la fecha en el carril (Efort) | La estética **«bienestar»**: fotos con filtro, emojis de estado |

**Lo que ninguno de los dos tiene:** su historial enseña solo el resultado. Nosotros guardamos
la pauta junto al registro, así que podemos enseñarlo **a dos carriles — pedido → hecho**, en
la misma línea. Ahí está la diferencia que no se copia de una captura.

---

## Por qué la miniatura se queda fuera

Era la propuesta de la primera versión y estaba mal. Barata de construir —`parseVideoUrl` ya
guarda el `id` y YouTube sirve la miniatura sin clave— no es lo mismo que buena. Contado contra
la base local:

| Cifra | Qué es |
|---|---|
| **239** | ejercicios de `catalog_exercises`, el catálogo con el que arranca todo entrenador. **No tiene columna de vídeo**: ninguno puede llevar miniatura, nunca |
| **7** | ejercicios propios en la demo (`exercises`), los únicos que pueden tener vídeo |
| **3** | de esos siete lo tienen puesto. Tres de doscientos cuarenta y seis renglones: **el 1,2 %** |

Y el porcentaje es lo de menos:

1. **La foto no la elegimos nosotros.** La fija YouTube; en un vídeo de gimnasio el primer
   fotograma suele ser el careto del entrenador, un logo o una careta de intro.
2. **El vídeo puede no ser el ejercicio.** Es una URL pegada a mano.
3. **Una columna de iniciales es peor que no tener fotos.** Con el 1,2 % cubierto, el que
   parece incompleto es el entrenador.
4. **Se rompe sola.** Cuarenta renglones son cuarenta peticiones a un tercero.

**Lo que ocupa su sitio: la cifra de tu última serie y la línea de tus ocho últimas sesiones**,
a la derecha del renglón. Está siempre después del primer entrenamiento, no depende de nadie, no
puede estar equivocada y es distinta en la pantalla de cada persona.

El vídeo baja a **una fila dentro de la ficha, y solo si existe**. Lo que sube arriba es el
`cue`: lo que te repite tu entrenador.

---

## La planta: cuatro destinos, y ninguno es el entrenador

| Destino | Qué es | Su pasado |
|---|---|---|
| **Hoy** | Lo que toca ahora. La sesión del día con sus ejercicios, tres cifras y lo que te han pedido si lo hay. | La racha y el récord |
| **Entreno** | El bloque en curso con sus sesiones. Debajo, el cajón de ejercicios: el logbook. | Bloques anteriores · historial por ejercicio |
| **Comer** | El día: kcal, macros y las comidas con sus opciones. | La curva de tus calorías |
| **Tú** | Tu cuerpo y tu rastro: peso, medidas, fotos, entregas, cuenta. | Todo; esta pantalla es pasado |

Coinciden en número con los de hoy (Hoy · Entreno · Dieta · Tú): la partición era correcta.
Cambia qué hay dentro y que **ninguna depende de que haya un entrenador al otro lado**.

---

## La voz — vale para toda la aplicación, no solo para el portal

### Las seis reglas

1. **Un titular no lleva subtítulo explicativo.** El subtítulo solo vive si trae un *dato*
   («Sábado 12 · Bloque 1 · semana 10 de 10»), nunca una definición.
2. **El sujeto eres tú, no tu entrenador.** Se dice el hecho, no quién lo escribió.
3. **Una cifra antes que una frase.** Si se puede decir con un número y una unidad, no se dice
   con una oración.
4. **El botón dice el verbo; la consecuencia va en la confirmación.** Nunca dentro de la etiqueta.
5. **Un vacío es una invitación de una línea.** Sin «todavía», sin disculpa, sin explicar el sistema.
6. **Una acción conserva su nombre en todo el recorrido.** Ya está escrito en el proyecto
   (§5.8); falta cumplirlo.

### Antes y después

| Hoy | Propuesta | Dónde |
|---|---|---|
| Mi rutina — *Lo que toca este microciclo, y dónde apuntas lo que levantas.* | **Bloque 1 · microciclo 10 de 10** | `ClientRoutineRoute` |
| *Tu entrenador no ha cambiado tus calorías desde que empezaste.* | **1750 kcal desde el 2 de julio** | `TuDieta` |
| *Objetivo: -0,3 kg/semana (0.5 % del peso). Media de 8 semanas.* | **−0,34 kg/sem · objetivo −0,3** | `ClientProgresoRoute` |
| *Seguir donde lo dejaste* · *Descartarla y perder la serie que apuntaste* | **Seguir** · **Descartar** | `SesionAMedias` |
| *Todavía no has anotado ningún pesaje.* | **Apunta tu primer peso** | `TuDieta` |
| *Cuando tu entrenador te mande un cuestionario, un vídeo o te pida algo, aparecerá aquí.* | **Nada pendiente** | `FormulariosDelCliente` |
| *Lo que tu entrenador necesita de ti para montarte el plan. Se hace una vez.* | **Cuéntanos de ti — 4 de 11** | `ClientOnboarding` |
| *Tu entrenador no ha programado ejercicios en este día.* | **Descanso** | `ClientRoutine` |
| Lo tuyo — *Tu rastro, tus datos y tu cuenta* | **Marta Espinosa** · desde el 29 oct · 38 sesiones | `ClientTu` |
| *Reparte como quieras, cuadra el día.* | **1750 kcal** · 1078 apuntadas | `ClientDiet` |
| *Tres datos con los que se calculan tus calorías, tus zonas de pulso y tus medidas. Son los que tu entrenador necesita antes de escribir nada.* | **Altura, peso y fecha de nacimiento** | `IntakeBasics` |
| Tu progreso — *Cómo va tu peso y qué levantas* | **−3,0 kg** en 10 semanas | `ClientProgresoRoute` |

No es un buscar-y-reemplazar. La mayoría viven en una prop `sub=` de `PageHead` o de `Fila`:
hay que recorrer esos ~30 puntos y decidir en cada uno si el subtítulo trae dato (se queda,
reescrito) o definición (se va).

---

## Lo que se retira y lo que se añade

**Se retira:** el h1 que repite la pestaña (×4 pantallas) · los ~30 subtítulos que definen la
sección · los rótulos «Te pide»/«Has hecho» y las columnas que nadie pautó · el campo gris de
la báscula con su píldora azul dentro · la caja de cada comida y la de cada opción · la tarjeta
«Hoy te pide» · el entrenador como sujeto gramatical de los vacíos.

**Se añade:** la última marca y su línea en renglón, lista y mesa · el récord (sesiones,
kilos movidos, semanas seguidas) · el cajón de ejercicios (el logbook) · el historial a dos
carriles dentro de la ficha · el historial de bloques como línea de tiempo · el fantasma de la
vez anterior bajo la casilla vacía · el costado vivo en el PC.

---

## Las tandas

| Tanda | Qué | Dónde |
|---|---|---|
| **1 · La cara** | La última marca y su línea de ocho puntos en el renglón, el cajón y la mesa del PC. Sale de leer el último registro por ejercicio de `workout_data.blocks`: sin migración, con una consulta que hoy no se hace. | Pieza nueva `MarcaDelEjercicio`, `ExerciseList`, `HojaDelCliente` |
| **2 · La voz** | Los ~30 puntos de la tabla, en toda la app —también en el panel del entrenador—. La más barata y la que más se nota. | Los `sub=` de `PageHead` y `Fila`, y los vacíos |
| **3 · La firma** | La ficha pasa de `Modal` a hoja que sube en el teléfono y a costado en el PC. Pestañas Pauta · Historial · Curva, con el historial a dos carriles. | `FichaEjercicioCliente`, pieza nueva `ui/Hoja`, `ClientRoutineRoute` |
| **4 · El récord** | El cajón de ejercicios y la cifra del récord. Sale de lo que ya hay en `log_session_set`. | Pantalla nueva en Entreno, cabecera de `ClientTu`, `ClientStart` |
| **5 · El PC** | La parrilla del bloque, el costado que se enciende con la celda, la mesa del ejercicio con una columna por serie y el comparador de fotos. Es la única tanda que crea pantallas que no existen. | `responsive.css`, `ClientLayout`, rutas de `/mi` |
| **6 · La planta** | Un solo techo de ancho en las cuatro pantallas; el titular pasa a ser el dato; la comida deja la caja; la báscula pierde sus cuatro planos. | `responsive.css`, `tipografia.css`, `ComidaDelCliente`, `PesoDeHoy` |

Ninguna tanda toca el dominio, ni las consultas, ni las políticas de la base. **«De cero» aquí
significa forma y voz nuevas sobre las piezas que ya funcionan**: una reescritura del portal
volvería a traer averías ya resueltas (los permisos del vídeo por `exercise_sheets`, el reparto
del ciclo, el registro con fecha por `log_session_set`, las equivalencias podadas por densidad).

---

## El PC

**El teléfono registra. El PC compara.** En el monitor el ancho no se gasta en márgenes: se
gasta en poner dos cosas juntas. Cinco pantallas con el mismo mueble —trabajo a la izquierda,
su pasado a la derecha—, hechas con las piezas del teléfono.

| Lo que puede el PC y el teléfono no | Cómo se traduce |
|---|---|
| Ver el bloque entero | **La parrilla**: diez microciclos en filas, las cuatro sesiones en columnas, lo que moviste en cada celda |
| Comparar dos momentos | Pinchas una celda y el costado enseña esa sesión con su *pedido → hecho* |
| Leer una tabla ancha | El historial de un ejercicio con **una columna por serie** |
| Poner dos fotos juntas | El comparador de «Tú» |
| Tener el detalle al lado | La ficha, que en el teléfono es hoja que sube, aquí es el costado |

Lo que el PC **no** hace: registrar. El botón de su portada dice *Seguir en el teléfono*.

En el prototipo, los kilos de la parrilla y del costado están **calculados** por un modelo de
diez microciclos que vive en el `<script>` del documento —escala de discos de 2,5 kg, rango de
repeticiones más alto en los cinco primeros microciclos, dos sesiones sin hacer—, así que las
celdas cuadran entre sí y con lo que enseña el teléfono.

---

## Lo que hay que decidir antes de construir

1. **¿La app sin entrenador se construye ya, o solo se deja de estorbar?**
   La tesis no obliga a abrir el registro público mañana; sí obliga a que ninguna pantalla
   dependa de que haya un entrenador detrás. *Recomendación: esto último ahora; el alta libre,
   cuando toque por hoja de ruta.*

2. **¿«Dieta» pasa a llamarse «Comer»?**
   Coherente con la ley 1 —lo que haces, no lo que te dan— pero cambia una palabra que está en
   la barra, en las rutas y en los avisos. *Recomendación: sí, con las rutas viejas rebotando,
   como ya se hizo con `/mi/hoy`.*

3. **¿El récord cuenta solo lo anotado en la app, o también lo importado?**
   Afecta a la cifra que se le enseña a alguien que viene de Excel.
   *Recomendación: solo lo anotado, y decirlo en la ficha del récord.*
