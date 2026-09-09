# Entreno — el bloque, replanteado

**Encargo (8 sep 2026).** El dueño, con la captura de PRODUCCIÓN delante: «la
estructura de entrenamiento y bloques en producción me gusta más que lo que
está en local. Me gusta la información del bloque y la información de las
hojas, pero no me gusta la presentación actual de los bloques, y creo que se
puede aprender mucho de Coachway y Efort, que dan la sensación de tener
interfaces mucho más pulidas y mejor pensadas».

Es decir: **producción es la línea de salida** (no el banco de tres columnas de
local), el contenido se queda entero, y lo que se replantea es la PRESENTACIÓN.

**Prototipo clicable** (antes/después, chasis real, datos reales de Javier
López, con las averías señalables y las dos pieles):
<https://claude.ai/code/artifact/40060cba-e40a-448c-8abd-0bef17c8a276>

---

## 1. Las referencias, medidas de primera mano

No de memoria: sobre las capturas de `capturas/referencias/`.

### Efort · Planificación (`efortcoach/Entrenamiento.png`)

Tres zonas: **navegador · mesa · panel contextual**.

- **Navegador** (izquierda, estrecho): «‹ Atrás», el bloque («Develop Block 2»)
  con su «···», dos pestañas *Entrenamientos · Protocolos*, «Semana 6 ⌄» como
  desplegable, dos verbos (*Añadir al calendario · Copiar semana*) y los días
  apilados como fichas con su fecha y un disco de estado.
- **Mesa**: una tarjeta plegable por ejercicio — nombre, subtítulo con su rol
  («Sentadilla Primaria»), «Series: 4» a la derecha y una tabla con **OBJETIVO**
  y **REAL** bajo la misma cabecera (peso · reps · RPE cada uno), un disco de
  color por serie y el vídeo al lado. Debajo, sin abrir nada: **e1RM, tonelaje y
  S.I.** Y arriba un conmutador **«✎ Editar»**.
- **Panel derecho**: es del EJERCICIO elegido, no del bloque — pestañas
  *Historial · Modificadores*, buscador y chips por familia (Equipamiento,
  Tempo, Rango de movimiento, Tablas).
- En su material de producto (`{D3303680…}.png`) el mismo bloque se enseña con
  **las semanas como pestañas con fecha y acciones por semana** (ojo, editar,
  duplicar, borrar) y los días como columnas, ~120 px por ejercicio.

**Lo que se toma:** el panel contextual, el conmutador leer/editar y las
estadísticas del ejercicio a la vista en lugar de en un popup.
**Lo que no:** el navegador de tres columnas — nuestra mesa ya enseña el reparto
entero, que es a lo que se viene.

### Coachway · Workout plan (`coachway/client training program creator 1–5.png`)

Dos zonas: **biblioteca (solo al editar) · mesa**.

- **Cabecera**: una línea. «← Strength Training Dave» + chapa de estado
  (**Draft** / **Local changes**) y, a la derecha, *Discard Changes · Edit ·
  Save*. Nada más.
- **Biblioteca** (izquierda): pestañas *Exercises · Sections*, buscador con
  filtro, fichas con miniatura, nombre y «músculo – equipamiento», y un «+».
  Aparece al editar y se va al guardar.
- **Mesa**: chips de sesión con engranaje propio (Push ⚙ · Pull ⚙ · Day 3 ⚙ · +)
  y, debajo, un renglón por ejercicio: miniatura, nombre, «Add note» en fantasma
  y a la derecha **campos rotulados de ancho fijo** —Sets · Weight · Min Reps ·
  Max Reps · Rest— idénticos en todas las filas. Abierto: serie a serie,
  alternativas, y un menú con superserie / bajada / tipos de serie / mover.

**Lo que se toma:** la cabecera de una línea con el estado en chapa; las cifras
en columnas rotuladas; el aire (renglones de ~60 px, sin filete entre filas); la
biblioteca que solo existe mientras editas.
**Lo que no:** Draft/Publish — nuestro tramo («solo M9», «desde M12») es una
política, no un binario.

### El diagnóstico en una frase

Ni Efort ni Coachway están más pulidos por sus colores: **cada uno tiene UNA
cabecera y UNA mesa.** Lo nuestro tiene tres cabeceras (el chasis del cliente,
la franja del bloque, la franja del microciclo) y la mesa empieza a media
pantalla.

---

## 2. Segunda vuelta: por qué la primera propuesta no valía

La primera versión de este documento proponía ocho arreglos sobre la anatomía
de producción. El dueño pidió replantearla, y al verificarla contra el código
se cayó sola. Queda escrito para no repetirlo:

1. **No tenía tesis, tenía una lista.** Ocho mejoras que se sostenían entre sí
   y ninguna firma. La ley de la casa es «una firma por pantalla».
2. **La regla era decoración con coartada.** Nueve muescas de la misma altura
   no llevan un dato más que nueve pastillas.
3. **El conmutador Leer/Escribir era un retroceso.** Producción ya edita en el
   sitio —las series y las reps son campos dentro del renglón
   (`VistaBloque.jsx`)—, que es la ley de los gestos. Envolverlo en un modo
   global es el Draft/Publish de Coachway, descartado en el expediente.
4. **Bajaba el volumen a la firma de la pantalla.** La firma declarada de
   Entreno en `tokens.css` es **la hoja veraz: pauta + semáforo + fantasma de
   lo hecho**, y la propuesta la comprimía y la mandaba al margen.
5. **Y el movimiento 04 ya estaba construido.** `VistaBloque.jsx` ya dibuja
   nombre · semáforo · registro · pauta en un renglón, y `piezas.css` lo dice
   literalmente: *«un renglón donde quepa, dos donde no»*. Lo que lo rompe no
   es la gramática: son los **176 px** de columna.

## 3. Las averías, corregidas

1. **Tres franjas de cromo antes del plan** (bloques · microciclos · días). La
   versión 4 de `LineaDeBloques` ya se descartó por esto y bajó a dos; la
   franja de días es la tercera y no se contó.
2. **Un bloque y un microciclo dibujados igual**, y «+ bloque» en la fila de
   los bloques: una acción con forma de objeto.
3. **El estado, en letra pequeña y a la derecha** — «desde el 6 jul · abierto».
4. **La franja de días repite las cabeceras de las hojas.** El día se escribe
   tres veces por hoja.
5. **El renglón bueno ya existe y no cabe** (ver §2.5). Por eso la pauta cae
   sangrada y el registro de lo que hizo no llega a verse nunca.
6. **El estado de cada hoja habla cuatro idiomas**: «❋ M9», «hecha el lunes»,
   «aún no», y un pie suelto «M9 va distinta».
7. **300 px permanentes para lo que no se acciona** — tonelaje, series por
   microciclo y cumplimiento, fijos toda la sesión. Son exactamente el dato del
   que él dijo «es brutal, pero ya está». Y son los 300 px que le faltan al 5.
8. **«Sube en 18 de 18» es un veredicto sin pruebas**, y la progresión por
   ejercicio vive en un popup.

## 4. La tesis

> **La pantalla es la hoja viva del bloque, a todo el ancho, y todo lo demás
> son capas.**

Nada se pierde: el volumen contra el tope, la progresión, el tonelaje, el
material y los tramos siguen enteros, detrás de un verbo.

1. **El margen se retira y la hoja respira.** Sin las tres tarjetas fijas, las
   cuatro hojas pasan de ~176 px a ~265 px, y entra en una línea lo que el
   componente ya sabe dibujar: nombre, semáforo, **lo que hizo** y la pauta.
   Es la firma de la pantalla, y hoy no se ve por noventa píxeles. Es además lo
   que ninguna referencia tiene: Efort enseña objetivo y real dentro de una
   sesión, de una en una; aquí se lee el bloque entero de un vistazo.
2. **Lo que se consulta va a una capa.** Lo accionable sube a la cabecera («26
   de 36 · 72 % de lo pautado»); tonelaje, series por microciclo, volumen
   contra el tope, progresión y comparar bloques viven tras «Cómo va el
   bloque ›» en `Modal size="capa"` — el mueble de Agenda y Cobros.
3. **Los microciclos, sobre una regla que MIDE.** La altura de cada muesca es
   lo entrenado en ese microciclo; el bache de M4 (2 de 4) se ve sin abrir
   nada, y la tira sigue siendo el selector. **Decisión del dueño, 8 sep.**
4. **El ejercicio entra por el canto derecho** — `Modal size="side"`: e1RM,
   tendencia por microciclo, lo último registrado, el pautado y en qué hojas
   aparece. Se come `HistorialPopup` y `ProgresionPopup`. *(De Efort.)*
5. **No hay modo: lo dispara la hoja.** Pulsas su título y se abre a todo el
   ancho con las cifras en campos rotulados; las otras quedan en un lomo
   horizontal. Esto reconcilia «hojas apiladas y plegables» (su decisión) con
   la rejilla de producción: son dos densidades de la misma superficie.
6. **El material, al escribir y donde se busca.** El buscador del pie de la
   hoja abierta es también la puerta de su gimnasio, su historial y tus piezas,
   por el mismo canto derecho. *(De Coachway: la biblioteca solo existe
   mientras editas.)*
7. **Un punto y una palabra** para el estado de la hoja; el punto del renglón
   solo aparece cuando el registro es real, en ámbar si se quedó corto; y lo
   que este microciclo tiene de distinto es una chapa con su tramo.
8. **La franja de días se retira.** Los descansos se resumen en el renglón del
   microciclo elegido. **Pendiente:** en **ciclo rotativo** no hay lunes ni
   martes — ahí la cabecera de la hoja tiene que decir su sitio en la cadena.

## 5. Decisiones tomadas y lo que queda
## 5. Lo construido (8 sep 2026)

**Sin commitear.** `npm run check` en verde: lint, tipos, verify (0 clases y 0
tokens sin definir), 1.782 pruebas y build. Validado además contra la demo local
con datos reales (Marta Ruiz), en noche y en claro, y con medidas tomadas en el
navegador a 1440, 1680 y 1920.

- **Una sola mesa.** `.bloque-pagina` pasa de dos (y a ratos tres) columnas a
  una. `is-banco` e `is-definiendo` desaparecen del CSS. Medido: la columna de
  cada hoja pasa de **176 a 255 px** a 1440.
- **«Cómo va el bloque»** (`VistaBloque` → `Modal size="capa"`): las cuatro
  tarjetas del antiguo margen —cifras, volumen, registro y progresión— en la
  capa, con su verbo en la cabecera (`LineaDeBloques`, prop `onComoVa`; el
  portal del cliente no la pasa, así que allí no existe).
- **Las dos cifras accionables suben a la cabecera**: «7 de 8 entrenamientos ·
  88 % de lo pautado», en la misma línea que «desde el 14 ago · abierto».
- **La regla con dato**: `.linea-regla` sustituye a la tira de pastillas. La
  altura de cada muesca es `6px + entrenamientos × 5px` (variable `--hechas`
  desde el JSX). Comprobado con datos reales: M1 con 4 entrenamientos mide
  26 px, M2 con 3 mide 21. El bloque abierto acaba en aire rayado.
- **La franja de días se retira** de la lectura: aparece al escribir una hoja o
  cuando todavía no hay reparto —que es cuando hay algo que decidir—. Los
  descansos se dicen en un renglón (`.plan-descansos`), y solo si hay reparto:
  siete días libres no son «descansa siete días», son «esto no está repartido».
- **El material entra por el canto** (`Modal size="side"`) desde una puerta que
  solo existe mientras se escribe una hoja. Deja de ser un carril fijo.
- **La fila del ejercicio pasa a rejilla de dos por dos** (`.plan-ej`): nombre,
  registro y pauta son hermanos y se recolocan según la anchura. **Ese es el
  arreglo que faltaba:** retirar el margen daba 79 px por columna, pero medido
  seguían faltando 29 para cruzar el umbral de 250 px del `@container`, así que
  el registro seguía escondido justo en la anchura de trabajo. Ahora en columna
  estrecha el nombre se lleva el renglón entero y la pauta comparte el segundo
  con el registro. **La hoja veraz se ve a 1440, que era el objetivo.**

### Lo que NO se ha construido, y por qué

- **El nombre del bloque como desplegable** (B1 · B2 · bloque nuevo). La línea
  de bloques se queda como está en producción: es el mapa de «dónde estás» que
  él dijo que le gusta, y no era una de las dos decisiones tomadas.
- **El panel lateral del ejercicio** (e1RM y tendencia al pulsar un nombre).
  `HistorialPopup` y `ProgresionPopup` siguen donde estaban.
- **Reasignar el día desde la propia hoja.** Se hace en la franja, que ahora
  aparece al escribir. Mover el selector a la cabecera de cada columna exige
  invertir el reparto (`split` va de día → hoja) y es otra tanda.
- **El ciclo rotativo** está contemplado en los descansos (D1, D4…) pero sin
  capturar: la demo local va en semana natural.

### Medidas, para la próxima

| Ancho | Caja de la hoja | Contenido | Para el nombre | Nombres cortados |
|---|---|---|---|---|
| 1440 | 255 px | 221 px | 138 px | 24 de 24 |
| 1680 | 315 px | 281 px | 198 px | 1 de 24 |
| 1920 | 359 px | 325 px | 242 px | 0 de 24 |

A 1680 y más, la fila cabe entera en un renglón por sí sola. A 1440 va en dos,
pero **con el registro puesto**, que es lo que importa.

## 6. Lo que NO vale (del expediente)

- Quitar contenido. Nada de esto retira el cajón, el MRV, el registro, la
  progresión ni los microciclos: los cambia de sitio.
- Planificación, previsión, calendario o duración prometida.
- Un carril permanente de material (el banco de tres columnas de local).
- Prototipos fuera del chasis o con datos que la aplicación no sabe.
