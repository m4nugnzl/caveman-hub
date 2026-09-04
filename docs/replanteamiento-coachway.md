# El despacho — replanteamiento a partir de Coachway

> **SUPERSEDIDO** (4 sep 2026, misma tarde): el usuario pidió replantear la
> aplicación de base, no por piezas, y descartó el Despacho de tres columnas.
> El plan vigente es [replanteamiento-de-base.md](replanteamiento-de-base.md)
> («El puesto»). Este documento queda como registro; su tabla de diseño
> (suyo/nuestro/veredicto) sigue siendo válida.

**Encargo** (4 sep 2026): acercar Caveman Hub a Coachway en estructura y en
oficio de diseño, **conservando nuestra base estética**. Es decir: se adopta su
arquitectura de trabajo (la cola, el contexto al lado, el grano fino de las
piezas) y su disciplina de sistema; no se adopta su piel (verde bosque + papel
crema + serif itálica), que es su identidad y no la nuestra. «Papel y señal»
—gris frío, tarjetas blancas, azul #3B49DF como única señal, la brasa, la
regla, Archivo a una voz— **se queda**.

Fuentes: el dossier completo en [referencias/coachway/](referencias/coachway/)
(producto, diseño extraído de su CSS de producción, landing, negocio).

---

## 0. El diagnóstico en un párrafo

Coachway y Caveman Hub creen lo mismo: todo el cliente en una pantalla, sin
seis pestañas. La diferencia es **desde dónde trabaja el coach**. En Caveman
se trabaja *entrando en clientes*: Inicio te dice «8 cosas por hacer» y cada
cosa te lleva a una ruta distinta, donde el contexto se vuelve a montar. En
Coachway se trabaja *despachando una cola*: la lista de quien necesita algo a
la izquierda, la conversación con el check-in incrustado en el centro, la
ficha viva a la derecha — y el coach no navega nunca, resuelve y pasa al
siguiente. Ese es el cambio estructural que vale la pena. Todo lo demás
(piezas con grano fino, alternativas previstas, borradores, tareas privadas)
son consecuencias de esa misma idea: **preparar antes para no navegar después**.

---

## 1. Estructura: los cambios, pantalla a pantalla

### C-01 · Inicio se convierte en el Despacho ⭐ (el cambio grande)

**Hoy**: `Today.jsx` es una bandeja de tarjetas (`colasDeInicio`) donde cada
elemento es una *puerta*: pulsas y saltas a `/c/:id/semana`, trabajas, vuelves,
pulsas la siguiente. El contexto se paga en cada salto.

**Después**: la misma bandeja, pero se despacha **sin salir**. Tres zonas:

```
┌─────────────┬──────────────────────────────┬─────────────────┐
│ LA COLA     │ EL TRABAJO                   │ LA FICHA        │
│             │                              │ (panel, C-02)   │
│ ● Marta     │ La semana de Marta:          │                 │
│   check-in  │ check-in entregado como      │ Anatomía        │
│ ● Jon       │ tarjeta, la hoja al lado,    │ Pulso           │
│   sin señal │ la caja de respuesta abajo   │ Hojas           │
│ ○ Lucía     │                              │ Cobro           │
│   renueva   │ [Responder]    [Siguiente →] │                 │
└─────────────┴──────────────────────────────┴─────────────────┘
```

- **La cola** (izquierda): los clientes que necesitan algo, con el porqué
  debajo del nombre. Los filtros son los de Coachway traducidos a nuestra ley
  de «sin reproches»: *check-in por revisar · sin señal esta semana · renueva
  pronto · mensaje sin responder*. No son alarmas: son un orden.
- **El trabajo** (centro): la revisión de esa persona — lo que WeekReview ya
  sabe hacer, montado aquí. El check-in no es una página: es una tarjeta
  dentro del hilo.
- **La ficha** (derecha): el panel de C-02, cerrado por defecto en portátil.
- **«Siguiente»**: al terminar con uno, el siguiente de la cola. Esto es lo
  que convierte una lista en un despacho.

Reusa: `colasDeInicio`, `portfolioInbox`, `WeekReview` (sus dos columnas son
ya el centro+derecha de esto), el Modal side. La ruta `/hoy` se queda; la
firma de Inicio sigue siendo el saludo con su cuenta de trabajo.

### C-02 · La ficha deja de ser solo una ruta y pasa a ser un panel

**Hoy**: la ficha (anatomía, pulso, hojas) vive en `/c/:id/ficha`. Para verla
mientras respondes una revisión, no hay manera.

**Después**: la misma ficha, invocable como **panel lateral** desde cualquier
sitio donde haya un cliente delante — el Despacho, la Revisión, la cartera.
Una sola implementación (el contenido actual de `ClientFile`/`ClientDataPanel`
reempaquetado), dos monturas: ruta y panel. Es el «tercer panel» del Power
Panel de Coachway, con nuestra ficha ya rediseñada dentro.

### C-03 · Clientes: de listado a lista con filtros de atención

**Hoy**: la cartera lista a todos con su señal de vida por fila.

**Después**: la misma tabla + una fila de filtros arriba (los mismos de la
cola: por revisar / sin señal / renueva / todos) y el estado del cliente como
dato de primera (activo · pausado · termina pronto). Sin colores de juicio:
el filtro ordena, no regaña. Cambio pequeño; `buildPortfolio` ya calcula casi
todo.

### C-04 · La biblioteca de piezas (Entreno, grano fino)

**Hoy**: los bloques se definen enteros; reutilizar es importar un día
(`ImportDayDialog`) o duplicar.

**Después**, dos piezas de Coachway que encajan con «el plan sube al bloque»:

1. **Secciones guardables**: un tramo de sesión (el calentamiento de siempre,
   tu mejor día de pierna) se guarda con nombre y se arrastra dentro de
   cualquier bloque. No es «auto-programar»: es no volver a teclear lo que ya
   está decidido.
2. **Alternativas previstas por ejercicio**: el coach deja escritas 1–2
   sustituciones; en el portal, el cliente cambia con un toque cuando la
   máquina está ocupada. El criterio sigue siendo del entrenador — solo que
   puesto *antes*.

### C-05 · El portal del cliente abre en «hoy»

**Hoy**: el portal abre en «Mi progreso»; la rutina es una pestaña.

**Después**: la primera pantalla es **el día**: la sesión de hoy (con la vez
anterior en fantasma, que ya es la firma del portal), el check-in si toca, y
nada más. Sobrio, sin racha gamificada ni confeti: el móvil ejecuta. Las demás
pestañas no cambian.

### C-06 · Check-in con borrador y recordatorio silencioso

El cliente puede dejar el check-in a medias y terminarlo por la noche
(borrador local → `pendingSaves` ya existe como patrón). Si el domingo no lo
ha entregado, la app —no el coach— se lo recuerda una vez. El coach deja de
ser el que persigue; la casa sigue sin reproches.

### C-07 · Visibilidad de números por cliente

Un ajuste en la ficha: ocultar peso y/o kcal en el portal de *ese* cliente
(mala relación con la báscula o con la comida). Barato, y es sensibilidad
profesional que Coachway ya vende.

### C-08 · Tareas privadas del coach

Notas-recordatorio por cliente que solo ve el coach («revisar macros el
día 15», «preguntar por la rodilla»), con fecha y un filtro «vencidas» en el
Despacho. Deliberadamente tontas: sin push, sin recurrencia. Como en Coachway.

### C-09 · El acuerdo en el cobro

En Cobros: unos términos por defecto (duración, qué incluye, aviso de baja,
política de devolución), prefilados en cada alta, aceptados con fecha y hora
antes de pagar, versión congelada por cliente. Cierra la seriedad del módulo
de ingresos que ya está commiteado.

### C-10 · La portada aprende de su landing (mecánica, no piel)

Lo que su landing hace bien y la nuestra puede hacer con hierro y brasa:
- **Enseñar el producto de verdad, muchas veces**: reconstrucciones HTML del
  Despacho y de la hoja de series que se auto-animan al entrar en viewport
  (con datos realistas y un protagonista con nombre), antes de pedir nada.
- **Un solo CTA repetido** con el desactivador de riesgo al lado.
- La secuencia: promesa → producto vivo → cómo se trabaja → prueba →
  cierre. Nuestra ley de «menos texto y tomar partido» ya apunta ahí.

### Lo que NO cambia

- Las cuatro puertas (Inicio, Clientes, Cobros, Agenda) y el carril del
  cliente: el Despacho vive *dentro* de Inicio, no es una pestaña nueva.
- La hoja de series: es nuestra identidad y Coachway no tiene nada igual.
- «La app no receta»: nada de generar planes en 20 segundos, nada de
  algoritmo que rellena comidas. Escalar una porción a un objetivo que fijó
  el coach sí; proponer, no.
- La estética entera: paleta, Archivo, la brasa, la regla, radios cerrados.

---

## 2. Diseño: lo que se adopta de su *sistema* (no de su piel)

Su CSS de producción enseña disciplina más que colores. Correspondencias:

| Suyo | Nuestro | Veredicto |
|---|---|---|
| 5 superficies en escala (frame→card) | `--canvas / canvas-alt / surface / raised / sunken` | **Ya lo tenemos.** Profundidad por superficie, no por sombra: mantener. |
| Hairlines y sombras teñidas de la tinta de marca | Sombras ya en tinta fría `rgba(18,24,38)`; hairlines neutros | **Ya resuelto** a nuestra manera. No tocar. |
| Titulares en peso 500 con tracking −0.04/−0.05em | Titulares Archivo con pesos varios | **Adoptar el principio**: los títulos grandes bajan de peso y cierran tracking; la jerarquía la da el tamaño, no la negrita. Revisar `tipografia.css`. |
| Eyebrow-píldora como hilo estructural de secciones | La etiqueta troquelada (`--tracking-stencil`) | **Equivalente nuestro ya existe.** Usarla con la misma constancia: toda sección con nombre lleva su rótulo troquelado. |
| Radios en 4 pasos, tarjeta 24px | 4/7/11/14–18, tarjeta 14 | Mantener los nuestros (instrumento, no consumo). |
| **Spring con overshoot** `cubic-bezier(.18,1.32,.34,1)` para lo que «cae en su sitio» | Solo `--ease` (salida suave) | **Adoptar**: añadir `--spring` a tokens.css y usarlo en chips, contadores y piezas que aterrizan. Es lo que hace que su producto parezca vivo. |
| **Entradas escalonadas** por sección (delays 0/.16/.26/.38s, `backwards`) | `useReveal` existe; la cascada `--slow` existe | **Sistematizar**: al entrar una vista, sus piezas entran escalonadas — regla de la casa, no efecto por pantalla. `prefers-reduced-motion` ya se respeta. |
| Animación = demostración (solo se anima lo que explica) | La ley implícita de «la luz nunca se anima» | **Adoptar como ley escrita**: se anima lo que aterriza, se dibuja o llega; nunca decoración. |
| Marco físico de 8px alrededor de la página | — | Solo candidato para la **portada** (escaparate). Dentro del producto, no. |
| Serif itálica como voz emotiva | La firma «cifra + frase» + Archivo Expanded | **La nuestra.** No se importa una segunda familia. |

En tokens, el cambio real es pequeño y honesto: **un `--spring`, y la
coreografía de entrada como norma**. El resto ya estaba decidido y bien.

---

## 3. Orden propuesto (tandas)

| Tanda | Piezas | Por qué este orden |
|---|---|---|
| **1 · El Despacho** | C-01 + C-02 + C-03 | Es donde Coachway más ventaja saca y donde más piezas tenemos a medio camino (WeekReview, colas, Modal side). Cambia cómo se siente trabajar en la app. |
| **2 · El movimiento** | `--spring` + cascada estándar + repaso de tipografía de títulos | Barato, transversal, se nota en todas partes. Puede ir en paralelo con la 1. |
| **3 · Las piezas** | C-04 (secciones + alternativas) | Toca el dominio de bloques; conviene después de que «el plan sube al bloque» tenga UI. |
| **4 · El cliente** | C-05 + C-06 + C-07 | Portal: hoy-primero, borrador, visibilidad. |
| **5 · El negocio** | C-08 + C-09 | Tareas privadas y acuerdo en el cobro. |
| **6 · El escaparate** | C-10 | La portada, con la mecánica de su landing y nuestra noche de hierro. |

Cada tanda es independiente y deja la casa coherente si se para ahí.

---

## 4. La prueba del algodón

Cuando la tanda 1 esté montada, la mañana del lunes debe poder hacerse así:
abrir Inicio, ver la cola ordenada, despachar cinco revisiones seguidas con
«Siguiente» sin tocar la barra de navegación ni perder la ficha de vista, y
que al terminar la cola diga que no queda nadie — sin que ninguna pantalla
haya regañado a nadie por el camino.
