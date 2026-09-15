# El PC del cliente — replanteamiento

> **DESCARTADO el 13 de septiembre de 2026.** Su premisa —«el cliente entrena con el
> teléfono y abre el PC para entender lo que le has puesto»— pone al entrenador en el
> centro de una app que no es suya. Lo sustituye
> [`estudio-la-app-del-cliente.md`](estudio-la-app-del-cliente.md).
>
> Se salvan dos hallazgos: que en un monitor el ancho se gasta en contexto y no en
> estirar una tabla, y que la ficha del ejercicio puede vivir en un costado en vez de
> en una ventana. Los dos siguen vivos en el estudio nuevo.

**13 de septiembre de 2026.** El estudio con las láminas está en
[`estudio-el-pc-del-cliente.html`](estudio-el-pc-del-cliente.html). Este archivo es el plan de
registro: las averías con su causa, las decisiones abiertas y las tandas.

Nada de esto está construido todavía.

---

## La frase

**El cliente entrena con el teléfono. Abre el PC para entender lo que le has puesto y para
entregarte la semana.** Hoy lo que abre es una pantalla de teléfono estirada.

Dos leyes salen de ahí:

- **La ley del mueble** — en el monitor, las cinco pantallas del portal son el mismo mueble: el
  trabajo a la izquierda, lo que se consulta a la derecha en un costado pegajoso, y un solo techo
  de ancho. El ancho de un monitor se gasta en contexto, nunca en estirar una tabla. Ya lo cumplen
  `.resumen-pagina` (dieta) y `.revision-cliente`; faltan rutina, inicio y progreso.
- **La ley de la cabecera** — la cabecera no dice dónde estás, dice qué te toca. El h1 pasa a ser el
  dato («Legs A Cueva», «Domingo 13 · te toca High») y el nombre de la sección se queda para el
  lector de pantalla, exactamente como ya se hace en el teléfono.

---

## Las seis averías, con su causa verificada

| # | Avería | Causa |
|---|---|---|
| **A-01** | La rutina cabe en 880 px y el resto es papel | `responsive.css:857` — `.layout-portal:has(.rutina-cuerpo.es-hoja) { max-width: var(--max-w-columna) }`. Fue la cura de la tabla estirada a 1.272, y se llevó por delante el costado («enfocar es quitar», `replanteamiento-portal-dos-aparatos.md` §9.4). Lo que se quitó no era un costado: era una caja sin relación con lo que estabas haciendo. |
| **A-02** | El calentamiento habla el idioma del entrenador | `Coach/Workout/WarmupBlock.jsx` montado tal cual en el portal: ▶, renglón-botón y chevron. El glifo ya está decidido en `ui/MarcaFicha` (cadena · comillas · ángulo) y se aplicó solo a la hoja de series. |
| **A-03** | «Te pide / Has hecho» y una columna de kg que nadie pautó | `HojaDelCliente.jsx` — `CAMPOS` es fijo (`kg · reps · rir`). Sabe apagar el RIR por protocolo, pero no mirar la sesión y declarar las columnas realmente pautadas. |
| **A-04** | El h1 repite la pestaña | `tipografia.css:318` ya lo esconde… **en el teléfono**, que es el aparato sin raíl. Está puesta al revés. |
| **A-05** | La dieta es un mosaico de 21 cajas y 20 flechas azules | `.comidas-cliente` = `repeat(auto-fill, minmax(30rem, 1fr))` (`revision.css:6371`) con otra rejilla de opciones dentro; y `.cc-cambio` (`:6440`) pinta el ⇄ en azul siempre. La decisión escrita en `ComidaDelCliente.jsx` («en el monitor, todas las opciones en una fila») es correcta; la ejecución con cajas la traiciona. |
| **A-06** | Apuntar el peso son cuatro planos | `PesoDeHoy.jsx` + `.peso-hoy-campo`: tarjeta → campo gris de 54 px → píldora azul dentro → siete letras con punto → la media. |

---

## Lo que se retira y lo que se añade

**Se retira:** el h1 que repite la pestaña (×5 pantallas) · la tarjeta «Hoy te pide»
(`FocoDeLaSesion`, dice lo que pasará a decir la cabecera) · los rótulos «Te pide»/«Has hecho» ·
las columnas no pautadas · la caja de cada comida y la de cada opción · el campo gris de la báscula
y la píldora azul de dentro.

**Se añade:** un costado vivo en la hoja (el ejercicio donde está el foco, con vídeo, pauta e
histórico) · el fantasma de la vez anterior bajo cada casilla · las comidas a lo ancho, una por fila
y sin cajas · la semana de pesajes como regla graduada · teclado real en la hoja (`Enter` baja a la
serie siguiente).

---

## Las cinco interacciones

1. **El foco enciende el costado** — entrar en una casilla (ratón o `Tab`) cambia el costado a ese
   ejercicio. Ninguna ventana modal.
2. **El teclado recorre la hoja** — `Tab` en orden de lectura, `Enter` baja de serie, `Esc` sube al
   ejercicio.
3. **El fantasma** — lo de la vez anterior en gris bajo la casilla vacía. Es la firma escrita de esta
   pantalla («la sesión de hoy, con la vez anterior en fantasma», `tokens.css`) y hoy solo existe a
   medias, en el disco de repetir.
4. **En reposo no está** — ⇄, visto y lápiz aparecen al acercarse a la fila.
5. **El vídeo no se despliega** — la cadena manda el vídeo al costado, no a un acordeón que empuja
   la página.

---

## Las tandas

| Tanda | Qué | Dónde | Arregla |
|---|---|---|---|
| **1 · El mueble** | Un solo techo de ancho; muere el recorte a 880; el h1 pasa a ser el dato en las cinco pantallas; muere la tarjeta del foco | `responsive.css`, `tipografia.css`, `ClientRoutineRoute`, `FocoDeLaSesion` | A-01, A-04 |
| **2 · La hoja** | Columnas declaradas por la sesión, fuera los rótulos, el fantasma, calentamiento con `MarcaFicha`, `CostadoDeLaHoja` conectada al foco | `HojaDelCliente`, `ClientRoutine`, pieza nueva, calentamiento propio del portal | A-02, A-03 |
| **3 · La dieta** | La comida pasa de caja a fila de mesa y las opciones a columnas; la cifra en una línea con su barra; el ⇄ al reposo | `ComidaDelCliente`, `ClientDiet`, `revision.css` | A-05 |
| **4 · La báscula** | La cifra es el campo; la semana pasa a regla; los pasos pierden su caja | `PesoDeHoy`, `PasosDeLaEntrega`, `datos.css` | A-06 |

Ninguna tanda toca el dominio, ni las consultas, ni las políticas de la base. **«De cero» aquí
significa forma nueva con las piezas que ya funcionan**, no reescribir el portal: una reescritura
volvería a traer averías ya resueltas (los permisos del vídeo por `exercise_sheets`, el reparto del
ciclo, el registro con fecha por `log_session_set`, las equivalencias podadas por densidad).

---

## Lo que hay que decidir antes de construir

1. **La tabla de la hoja: ¿A o B?**
   **A** funde pedido y hecho en una casilla (la pauta en gris, donde se escribe) — de seis columnas
   a tres. **B** mantiene las dos mitades y solo les quita los rótulos y las columnas vacías.
   *Recomendación: A.* Es la que cambia de verdad la sensación de formulario; el pie del renglón
   recoge la pauta y lo de la vez anterior.

2. **La dieta: ¿la mesa (D-A) o el menú (D-B)?**
   *Recomendación: D-A en el PC y D-B en el teléfono*, que es el reparto que el código ya hace. Lo
   único que cambia es que la versión ancha deja de dibujarse con cajas.

3. **¿El cliente sigue apuntando series desde el PC?**
   Todo el estudio asume que sí. *Recomendación: que siga.* Quien entrena en casa con el portátil
   delante lo usa.
