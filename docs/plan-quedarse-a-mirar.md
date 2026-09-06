# Quedarse a mirar — el plan del acabado

**Encargo** (6 sep 2026): «no escatimes en gastos por mejorar el cómo se ve la
plataforma, analiza bien coachway y procede con un plan de ruta claro y
unificado, mejorando aquellos puntos en los que coachway falla, partiendo de
nuestra base, y puliendo a nivel estético la interfaz para que sea muy
atractiva, haga querer quedarse scrolleando y tocando cosas, sea intuitiva,
visual, entendible, sencilla, moderna, práctica».

Parte de la base del 6 sep: hoja blanca, cabecera en dos líneas con el raíl
sobre el filete (ver `replanteamiento-de-base.md`).

---

## 1. El terreno: dónde falla Coachway y dónde no

Del dossier ([referencias/coachway/](referencias/coachway/)), con sus palabras:

**Donde falla — y es NUESTRA batalla:**
- **El pulido.** Lo admiten en su propia review: «competidores ofrecen
  interfaces más pulidas» (citan a Everfit). Su landing es una máquina de
  demostrarse — animaciones por sección, gráficas que se dibujan, chips que
  aterrizan — pero **su app no está a la altura de su anuncio**. Ahí está el
  hueco: que NUESTRA app se demuestre como SU landing.
- **La hoja densa.** Su builder es formulario + drag; un coach de fuerza
  espera una hoja de series. La nuestra ya existe y es identidad.
- **El artesano es ciudadano de segunda** en su gramática plantilla-y-masa.
  El nuestro es el usuario.
- **Sin agenda, sin español.** Ya las tenemos.

**Donde NO falla (y se le compra adaptado, nunca copiado):**
- El producto se demuestra animándose: springs con rebote para lo que
  aterriza, entradas escalonadas, gráficas que se dibujan. (Ya se le compró
  `--spring`; esta es la segunda compra.)
- La anatomía del expediente (identidad → raíl → contenido). Comprada el 6 sep.
- La escala de superficies con el marco hundido. Comprada el 6 sep.

**Lo que NO entra**, por ley de la casa: su verde/serif (identidad ajena), el
recetario que rellena solo (la app no receta), la carne con foto (descartada
5 sep), tocar la Revisión por dentro, el reveal por scroll (el escaparate se
recorre una vez; una herramienta se abre cincuenta veces al día).

## 2. La tesis

«Quedarse a mirar» no es decoración: es que **el dato se demuestre**. La
cascada de entrada ya presenta los bloques; lo que falta es que dentro de los
bloques el dato haga su número — la línea del peso se dibuja, el relleno de
una barra crece hasta su cifra, lo tocable se enciende bajo la mano, y la
navegación nunca se va de la pantalla. Movimiento SOLO al llegar y SOLO donde
enseña algo; `prefers-reduced-motion` lo apaga entero (regla global que ya
existe).

## 3. Los movimientos

### Tanda 1 — El producto se demuestra ✦ EJECUTADA (6 sep)

- **Q-01 La gráfica se dibuja.** La línea de las series (`.chart-line`) se
  traza al montar (pathLength normalizado + dashoffset, ~0,9 s) y el área
  aparece detrás en fundido. Sin animar el punto de «hoy»: se desmonta al
  pasar el ratón y repetiría el truco a cada pasada — un aterrizaje repetido
  es un tic.
- **Q-02 Las barras crecen.** Todo relleno-sobre-riel crece de 0 a su cifra al
  montar (`subjetivo-relleno`, `meter-fill`, `macro-bar`, `plan-bar-fill`,
  `rutina-barra`) y **transiciona su anchura** cuando el dato cambia en vivo
  (cambiar de semana en la Revisión, editar gramos en Dieta): el número que
  se mueve se VE moverse.
- **Q-03 La cabecera acompaña.** La cabecera del cliente es pegajosa en
  escritorio: identidad y raíl siempre a mano al bajar — scrollear ya no
  cuesta el contexto ni la navegación. (Práctica pura; Coachway lo hace, y
  cualquier expediente serio también.)

### Tanda 2 — Todo lo tocable responde ✦ EJECUTADA (6 sep)

- **Q-04 Auditoría de encendidos.** Hallazgos y arreglos: `.cab-accion:hover`
  era un NO-OP (color base = color hover; el «tinte de al pasar» que su
  propio comentario prometía no existía) — restaurado: el verbo callado habla
  en secundaria y al pasar se enciende con su tinte. `.comova` conservaba el
  realce fijo (`--surface-raised` + filete fuerte), que con el hover nuevo
  dejaba su reposo igual al hover de las demás — retirado: manda por sitio y
  tamaño. De antes ya encendían: `palanca.is-puerta`, `cab-accion.is-puerta`,
  `tarjeta-puerta`/`task-hit`, `.tarjeta:hover`.
- **Q-05 Vacíos como invitación.** El coach ve verbos, el portal no cambia:
  «Anota su primer pesaje» (El cuerpo → la revisión), «Monta su rutina»
  (El entreno → su hoja), «Elegir sus preguntas» (Cómo lo lleva sin protocolo
  → Ajustes), y las palancas del plan dicen su verbo en azul donde había
  rayas — «Ponle objetivo · Fija sus calorías · Ponle pasos · Ponle cardio ·
  Monta su rutina» — porque la fila ya era la puerta y ahora dice a qué viene.
- **Q-06b La fila del rating es una puerta a su tendencia** (la versión con
  sustancia de «que la barra se tiñera al pasar», descartada juntos por la
  ley del color). Cada fila de «Cómo lo lleva» se enciende al pasar y al
  pulsar abre la ventana donde su curva YA vive — las del check-in en el «a
  fondo» del cuerpo, las de sesión en el del entreno. Sin ventana nueva:
  `Subjetivo` acepta `onFila` y los demás consumidores no cambian.
  **Rematada tras el visto bueno**: la ventana llega CON la curva de esa
  pregunta a la vista —vivía al fondo, bajo el pliegue— y la fila se señala
  una vez con el eco azul del clic (`is-buscada`), que se apaga solo. El
  Resumen pasa la pregunta (`abrirVentana`), y las aperturas normales la
  ponen a null para no heredar el aterrizaje. De paso, el arreglo destapó un
  sombreado real: en `PanelEntreno` un `const pregunta` local pisaba el
  nombre de la prop.

### Tanda 3 — La tinta cohesiona ✦ EJECUTADA (6 sep)

- **Q-06 Sombras teñidas.** La auditoría dio que ya estaba hecho: las
  `--shadow-*` de la luz llevan `rgba(18, 24, 38, …)` —el azul-gris del
  texto—, y las de la noche van en negro, que sobre un lienzo casi negro es
  lo correcto (teñirlas no se vería). Una sola suelta iba en un gris ajeno
  —la barra de guardar móvil, `responsive.css`— y se armonizó.
- **Q-07 El navegador de bloques de Entreno.** Recompuesto con la gramática
  de la cabecera (quinta versión de `LineaDeBloques`): el bloque abierto es
  el TITULAR —fuente ancha, sin caja: ya estás en él y no era un botón—, los
  cerrados quedan en voz baja delante (el tiempo sigue de izquierda a
  derecha), «estás aquí» lleva el punto azul de «en curso», y la fecha se
  sienta a la derecha de los microciclos en vez de abrir una tercera altura.
  Dos alturas donde había tres, y los microciclos NO cambian de dibujo (la
  pastilla compartida con la hoja de series, la lección de la versión 3).
  El portal hereda el mismo dibujo; en móvil el carril rueda (los nombres se
  estrujaban sin `flex-shrink: 0`).
- **Q-08 Chapas con icono en la cabecera.** CONSTRUIDA para que el dueño la
  juzgue en vivo: cada medida de la anatomía es una chapa con su signo —tarta
  (edad), regla (altura), figura (sexo)— en cápsula callada (`--fill-subtle`,
  sin canto, no se enciende: es dato, no puerta). El microciclo se queda en
  texto llano al lado: la diferencia entre lo que mide y por dónde va se ve
  ahora en el dibujo. El azul de la banda sigue siendo solo de «Revisar
  semana». Revierte fácil si no convence: un bloque de JSX y otro de CSS.

## 4. Estado

- **Tanda 1 ejecutada el 6 sep** — junto con la hoja blanca y la cabecera de
  dos líneas del mismo día (documentadas en `replanteamiento-de-base.md`).
  Validación: lint, tests, verify, build y capturas/vídeo contra la app real
  (demo local).
- **Tanda 2 ejecutada el 6 sep**, a orden directa del dueño tras aprobar la 1
  (y tras las cuatro vueltas de las cajas del mismo día: estantes, hover,
  aire — ver `replanteamiento-de-base.md`). Validación: lint, 1680 tests,
  verify, y contra la app real: el cliente vacío habla en verbos y la fila
  del RPE abre su ventana.
- **Tanda 3 ejecutada el 6 sep**, Q-08 incluida (construida a la espera del
  veredicto del dueño con capturas en claro y noche). Validación: lint, tests,
  verify, y contra la app real: el navegador de bloques en escritorio (abierto
  y cerrado) y en móvil, y la cabecera con chapas en las dos pieles. Nota: al
  validar Q-08 fallaban 2 tests de dominio ajenos (pesajes según protocolo,
  `weighInsTarget` — trabajo en curso de otra mano, ficheros tocados a las
  16:38-16:40 del 6 sep).
