# El puesto — replanteamiento de base

**Encargo** (4 sep 2026): «dale un repaso a la aplicación completa, replantéala de
base». Sustituye a `replanteamiento-coachway.md`: aquel plan (C-01…C-10) tocaba
piezas; este toca el chasis. El usuario descartó el «Despacho» de tres columnas
y las selecciones con relieve; la selección activa es siempre **píldora plana**.

Prototipo clicable: https://claude.ai/code/artifact/9e159f7e-c330-458a-8994-39a21098b058
Dossier de Coachway: [referencias/coachway/](referencias/coachway/).

---

## 1. La lección de fondo

La lección de Coachway no es su verde ni su bandeja: es que su aplicación es
**un solo lugar**. La lista de clientes nunca se va; el cliente es una pila de
paneles, no páginas; y lo que no es trabajo del cliente (agenda, caja, perfil)
aparece encima y se cierra. La nuestra, en cambio, son **sitios a los que ir**:
cuatro puertas (Inicio · Clientes · Cobros · Agenda) y cinco pestañas por
cliente. Cada viaje desmonta el contexto y lo vuelve a montar.

El replanteo en una frase: **la aplicación entera es una pantalla — un puesto
de trabajo con capas.**

## 2. La arquitectura nueva

```
┌────────────────┬──────────────────────────────────────────────┐
│ LA BARRA       │ EL EXPEDIENTE                                │
│ (tinta, fija)  │                                              │
│                │  Marta Ferrer · Activa · [chapas] ← fija     │
│ Por revisar  2 │  (Resumen · Entreno · Dieta · Revisiones)    │
│  ● Marta       │  ──────────────────────────────────────────  │
│  ● Andrés      │                                              │
│ Sin señales  1 │   la sección elegida, cambiando EN EL SITIO  │
│  ● Jon         │                                              │
│ Cobros       1 │                                              │
│  ● Lucía       │                                              │
│ ───────────    │   CAPAS (encima, no destinos):               │
│ Cartera      7 │   · Perfil (desde el nombre)                 │
│  Sara, Íker…   │   · Agenda (esta semana)                     │
│ ───────────    │   · Caja (cobros)                            │
│ Agenda · Caja  │   · «a fondo» (las ventanas que ya existen)  │
│ ⌘K · Manu      │   · ⌘K                                       │
└────────────────┴──────────────────────────────────────────────┘
```

### 2.1 La barra ES el inicio
`Today.jsx` ya son cuatro colas con verbo (`colasDeInicio`). Dejan de ser una
pantalla: **son la barra**, siempre a la vista, cada persona con su porqué
debajo del nombre y un punto de brasa si te espera. El saludo y la cuenta
(«Buenos días, Manu · 4 te esperan») viven arriba de la barra. La pantalla
`/hoy` desaparece como destino; su estado vacío se convierte en el vacío
glorioso del expediente («No queda nadie»). «Clientes» como pantalla-lista
también se disuelve: la cartera completa es el tramo inferior de la barra
(la tabla con filtros sobrevive como capa si hace falta densidad).

### 2.2 El cliente es una superficie
La cabecera (avatar, nombre, Activa, chapas: edad, talla, bloque·semana,
renovación) queda **fija**; las secciones cambian debajo sin sensación de
página. Las URLs no se mueven — es navegación, no rutas (misma jugada que ya
hizo la agrupación de agosto). **Perfil deja de ocupar pestaña**: quién es, sus
fechas, su tarifa y sus condiciones se abren desde su nombre como panel
lateral. Quedan cuatro segmentos: Resumen · Entreno · Dieta · Revisiones.

### 2.3 Lo demás son capas
Agenda y Caja dejan de ser puertas de nivel 1 y pasan a capas invocables desde
la barra — la misma gramática que las ventanas «a fondo» del Resumen, que ya
existen (`PanelCuerpo`, `PanelEntreno`). Regla nueva de la casa: **ir a otro
sitio se reserva para cambiar de persona; todo lo demás viene a ti.**

### 2.4 La prueba de las cuatro preguntas
`routes.jsx` defiende las cuatro puertas porque cada una contesta algo distinto.
El puesto las sigue contestando, sin puertas:
- *¿Qué falta?* — la barra (las colas).
- *¿Qué viene?* — la capa Agenda.
- *¿Cuánto?* — la capa Caja (el `IncomePanel` entero, como ventana grande).
- *¿Qué ha pasado?* — el expediente del cliente y su hilo; la actividad global
  puede ser una capa menor si se echa de menos.

### 2.5 La carne (la parte que no es diseño)
Las pantallas de Coachway parecen vivas por el **contenido**: recetas con foto,
ejercicios con vídeo, fotos presentes. Lo nuestro es todo cifra y texto. Entra:
miniatura por ejercicio en la hoja, plato con imagen en Dieta, y las fotos de
la semana visibles en la Revisión (no mencionadas). Esto es dato y catálogo,
no CSS — y es la mitad del «se ve brutal».

### 2.6 La piel (cerrada en la iteración anterior)
Barra de tinta; **selección = píldora plana** (nunca relieve, nunca inset);
veredictos tintados solo donde se juzga (la ley del color manda); chapas; aire
(radios 13–16 en tarjetas héroe); `--spring` y cascada. Todo con nuestra tinta:
Archivo, azul #3B49DF, brasa pequeña. Ni verde bosque, ni serif, ni 3D.

## 3. Lo que NO cambia

La Revisión por dentro (es la mejor pantalla; cambia lo que la rodea). La hoja
de series y su densidad. «La app no receta.» «El móvil ejecuta»: el portal del
cliente no se toca en este replanteo. Los Ajustes. Las URLs.

## 4. Costes y conflictos, en voz alta

- **Contradice `docs/producto.md`** y el razonamiento de `routes.jsx` (§ las
  cuatro puertas). No es un descuido: es un cambio de criterio deliberado —
  de «cada pregunta, una puerta» a «cada pregunta, una capa del mismo puesto».
  Si se aprueba, hay que anotar la decisión en esos dos sitios.
- La barra crece (colas + cartera): en carteras de 30+ necesita colapsos por
  grupo y búsqueda. El prototipo ya agrupa; el diseño de colapso es tanda 1.
- En móvil el puesto no cabe: el panel del coach en móvil conserva la
  navegación actual (la barra del pulgar); el puesto es la vista de escritorio.
- `/hoy` y `/clientes` siguen respondiendo (redirigen al puesto) — marcadores.

## 5. Tandas

1. **El chasis** — la barra de tinta con colas + cartera; el expediente con
   cabecera fija y segmentos en el sitio; Perfil a panel. (CoachLayout,
   routes: solo navegación.)
2. **Las capas** — Agenda y Caja como ventanas; el vacío glorioso; retirar las
   puertas de nivel 1.
3. **La piel** — tokens (`--spring`, veredictos, chapas), píldora plana en
   toda la casa, aire en tarjetas héroe.
4. **La carne** — miniaturas de ejercicio, platos con imagen, fotos en la
   Revisión. (Catálogo + media, la tanda más cara.)

Cada tanda deja la casa coherente si se para ahí. La prueba del algodón: la
mañana del lunes entera sin salir de una pantalla, y al acabar, «no queda
nadie».

## 6. Estado (5 sep 2026)

**Tanda 1 EJECUTADA** y verificada con el entorno real (demo local, capturas en
claro y oscuro; 1.672 tests, lint, verify y build en verde):

- La barra es la tinta (`.barra-tinta` en tokens.css, mismo mecanismo que
  `.lp-noche`). **Corrección del mismo día**: desplegar las cuatro colas en la
  barra con sus porqués era «un lío con demasiada información» (dueño, al
  verlo con su cartera real). La barra volvió a su ley — navegar: UNA lista
  (la cartera entera, ordenada por la urgencia de `buildPortfolio`, punto en
  quien espera, semana en los demás), «Cartera» como puerta a `/clientes`,
  Agenda/Cobros como utilidades, y la barra de scroll oculta (la franja rueda
  sin enseñarla). Las colas con sus verbos y acciones se quedan en Inicio, en
  las dos geometrías. Selección de píldora plana; la regleta de brasa se
  retira solo dentro de la tinta.
- «Perfil» fuera del carril de escritorio (`oculta` en routes.jsx); su puerta
  es el nombre del cliente, que se marca en azul cuando está abierta. El móvil
  no cambia (barra del pulgar con la lista entera).
- `/hoy` en escritorio es LA MESA: agenda de la semana + trámites + actividad;
  las colas solo en la barra. En móvil, la pantalla de siempre
  (`useMediaQuery` al corte del chasis).
- `--spring` añadido a tokens (aún sin más consumidores).
- **La anatomía en la cabecera** (la primera chapa rica, al ver la cabecera de
  Coachway): los cuatro hechos de `identityFacts` —edad, altura, último peso,
  sexo— en la línea de meta de las cinco pestañas, en voz baja y atados con
  interpunto. Solo los puestos: el hueco que invita («+ Altura») sigue siendo
  de la ficha. Y la cara viaja dentro de la puerta del perfil, con el nombre.
- **El perfil es un salto de página** (dos correcciones del 5 sep): primero se
  le puso una miga «← Resumen» y el nombre en azul de seleccionado; el dueño lo
  rechazó — «queda seleccionado en azul y se ven las pestañas encima… casi me
  gustaría un saltar de página como Coachway». Ahora, dentro del perfil, la
  cabecera SE TRANSFORMA (`is-perfil`): flecha de vuelta pegada al nombre
  (vuelve a la sección de origen vía `state.desde`; por URL directa, al
  resumen), pestañas retiradas, nombre en tinta plena. Sin miga y sin azul.
  Y el titular NO SE MUEVE: la flecha sustituye a la cara en su mismo hueco
  (38 px y el mismo gap de 12 — dos huecos distintos lo hacían saltar 4 px);
  medido con la demo, x idéntica dentro y fuera.
  La línea de anatomía es la segunda puerta del perfil (vacía dice «Su perfil»
  en azul) y dentro del perfil se retira. En móvil nada cambia: pestaña.

**Tanda 2 EJECUTADA** (5 sep, tras aprobarse el salto del perfil):

- **Agenda y Caja son capas.** En la barra, «Cobros» y «Agenda» son botones
  que abren su pantalla ENTERA en una ventana (`size="capa"` del Modal:
  `modal-lg` crecido a 1160×92vh) encima de donde estés; cerrar (equis,
  Escape, fondo) te deja donde estabas. Navegar cierra la capa. Las rutas
  `/ingresos` y `/calendario` siguen respondiendo con la página completa —
  marcadores y móvil (la barra del pulgar navega, no abre ventanas). En su
  propia ruta, el botón se marca y no abre nada (sería un espejo).
- `enCapa` en `IncomePanel` y `CoachCalendar`: retira su `PageHead` dentro de
  la ventana (el título lo pone ella). Perezosos también en la capa, como en
  sus rutas.
- El vacío glorioso NO se ha tocado: al conservarse Inicio como pantalla
  (corrección de la tanda 1), su «Todo al día» de siempre ya hace ese papel.

**De la piel (5 sep)**: `--spring` puesto en lo que ATERRIZA — la ventana
(`sheet`), la hoja móvil (`modal-sube`) y el panel lateral (`panel-entra`);
las salidas siguen en `--ease`. La fila del cliente abierto se desplaza sola
a la vista en la cartera (`scrollIntoView nearest`, probado con ventana baja).
El aire ya estaba (tarjetas a `--r-lg` 18). Los «veredictos tintados» NO se
han construido: chocan con dos reglas escritas — «estado en cápsula, dato en
tinta» (datos.css: la delta es dato) y «la Revisión no se rediseña» — así que
se decidirá con el dueño delante, no en silencio.

**LA CARNE QUEDA DESCARTADA por orden del dueño** (5 sep: «miniatura de
ejercicio y platos con foto nada»). La tanda 4 se retira del plan.

**Corrección del 6 sep — la escala de superficies iba del revés sobre papel.**
Al ver el HUB local con datos reales, el dueño: «parece como que la cabecera
crea una hoja gris en vez de unificar todo bien». El diagnóstico: en tema
claro la hoja del expediente era `--canvas-alt` (#eceff3), MÁS OSCURA que el
lienzo de detrás (#f6f7f9), con la cabecera del cliente todavía en `--surface`
blanco encima — un gorro de otra pieza sobre un pozo gris. La regla del
dossier de Coachway es la contraria: el marco es lo único hundido y cada paso
hacia dentro ACLARA (frame → content → card). Sobre hierro la escala ya nacía
bien (#090b0e → #0f1216 → #1c2027), así que el arreglo son dos tokens por tema
(`--mesa` / `--hoja` en tokens.css) que cruzan los dos grises solo sobre
papel, y dos cambios en chasis.css: la mesa (`body:has(.sidebar)`) toma el
tono hundido con la hoja clara encima, y la cabecera del cliente deja de
pintar superficie — es EL MISMO papel de la hoja con su filete debajo (tercer
intento fallido, anotado junto a los otros dos en `.cliente-cab`). Blanco,
solo lo que se posa encima: las tarjetas. Verificado con la sonda de CSS
compilado en claro y oscuro: la escala aclara hacia dentro en los dos temas y
el oscuro no cambia de aspecto. El móvil hereda la cinta transparente y también
gana: banda y contenido son el mismo papel bajo las tarjetas.

**LA HOJA BLANCA: probada y desandada** (mismo día, segunda vuelta): puesta
la app real al lado del expediente de Coachway, el dueño eligió probar su
material — «una sola superficie blanca con secciones a filete» — y sobre
papel `--hoja` pasó a `--surface`, verificado contra la app real con
antes/después. Al verla puesta, la desanduvo: «quizás fuese mejor que las
boxes fuesen como boxes y no todo junto» — tarjeta blanca sobre hoja blanca
deja solo el canto al 9 % separándolas y la rejilla se funde. Vuelta al
escalón corto: la hoja en el gris de `--canvas` (como Coachway, cuyo lienzo
de contenido es #f7f6f2 contra tarjetas #fff), la mesa hundida en
`--canvas-alt`, el blanco solo para lo que se posa. La lección que queda
escrita en tokens.css: el escalón hoja/tarjeta no se funde en ningún tema.
Y la misma lección alcanzó a LA NOCHE en la tercera vuelta («yo lo sigo
viendo todo junto», el dueño, mirando el tema por defecto): la hoja
intermedia (#0f1216) dejaba la tarjeta a 1,12:1 de su fondo — por debajo del
1,2 «medido» que este mismo archivo calibró. Sobre hierro la hoja vuelve al
negro de la mesa (`--hoja: var(--canvas)`) y la tarjeta recupera entero su
escalón; la hoja se delimita por su canto, no por un peldaño de gris.
Y en la cuarta vuelta salió el nombre de verdad del problema: no era el
contraste sino la FUSIÓN — el mosaico del Resumen y su columna derecha iban
en «hoja de bandas» (`es-hoja` + `.resumen-lado`, movimiento 02 del 5 sep) y
se leían como «2 boxes, la del centro y la de la derecha unificadas». El
dueño deshizo el movimiento: `es-hoja` retirado, la columna del lado vuelta
a pila de tarjetas, cada elemento en su caja. Tercera vez que «una hoja con
tramos» se prueba y se descarta en este producto — queda anotado en
revision.css y en Dashboard.jsx para no volver.

**Quinta vuelta — LA REJILLA DE ESTANTES** («veo las boxes desalineadas… el
que ponga el plan justo debajo antes de empezar la hoja no me gusta»): con
las cajas sueltas, el mosaico y la columna del lado eran dos pilas
independientes y sus cantos no casaban nunca. En escritorio de coach, las
siete tarjetas pasan a ser celdas de UN grid de doce columnas con filas
compartidas (Cómo va 6 · Desde 3 · Lo último 3 / El cuerpo 9 · El plan 3 /
El entreno 9 · Cómo lo lleva 3): todo lo que comparte fila comparte altura y
los cantos caen a plomo. `display: contents` disuelve los envoltorios; el
portal conserva sus dos columnas; por debajo de 940 se apila como siempre.
Y EL MANDO DEL RESUMEN SE RETIRA: su única línea («Trimestral · 240 € ·
desde 18 may») colgaba entre cabecera y tarjetas — la tarifa ya la dice la
chapa del cobro y la antigüedad «Desde que empezó». Entreno y Dieta
conservan su mando, que lleva acciones. Validado: lint, 1675 tests, verify,
build, capturas en claro y noche.

*Corrección posterior (mismo día, con ida y vuelta):* la queja del dueño
(«las boxes más grandes que antes») se resolvió en dos pasos y una lección.

1. La columna del lado volvió a ser **fija de 300 px** — como fracción
   (3/12) crecía con la pantalla. Las pistas son `repeat(9, 1fr) 300px`.
2. LA QUEJA ERA DE ALTURA, NO DE ANCHURA — «modificaste el valor de x,
   decía el valor de y: sobraba espacio en y» (el dueño, tras una tarde de
   ida y vuelta con el ancho). El estirado de la rejilla (`align-items:
   stretch` + el `height: 100%` del mosaico) igualaba cada fila a su caja
   más alta: «Cómo va» crecía ~100 px de aire para plantar cara a «Lo
   último». Arreglo: la rejilla va en `start` (ninguna caja estira, el
   estante es la CIMA compartida y el canto de abajo acaba donde acaba el
   contenido, como las pilas de producción) y `height: auto` para las
   tarjetas del mosaico dentro de los estantes. El ancho volvió al de
   producción (`--max-w-trabajo`; «Cómo va» 789 px a 1920) — estrecharlo
   además APILABA las dos mitades de «Cómo va» (corte 640) y la hacía aún
   más alta.

3. Y CON LAS ALTURAS NATURALES, LA REJILLA ÚNICA SE CAYÓ SOLA: sin estirar,
   «Lo último» (la caja alta del lado) empujaba la fila de «El cuerpo» y
   dejaba agujeros bajo las cortas («ahora no sé por qué ocurre esto»). La
   fila de un grid mide lo que su caja más alta, y no hay tercera opción.
   El Resumen vuelve a las DOS PILAS de producción — trabajo + lado fijo de
   300 px, cada columna empaqueta lo suyo — con el mosaico sin estirar.
   Los estantes compartidos entre mosaico y lado quedan DESCARTADOS.

LECCIONES: pares de capturas solo a pantalla completa; y ante «más
grande/más ancha», confirmar el EJE antes de tocar nada.

**Sexta vuelta — la luz pasa de la caja al gesto**: con los estantes
igualados, la `lumbre-dato` del «Cómo va» (la luz fija del hero, de noche)
dejó de leerse como firma — «¿por qué el cómo va está sombreado distinto?».
Se retira de ahí (queda solo en el hero de la Revisión, su pantalla firma) y
entra lo que el dueño pidió a cambio: **la caja se alza bajo la mano** —
`.tarjeta:hover` sube a `--surface-raised` (un escalón de luz de noche,
no-op sobre papel, donde responden canto y sombra), igual para TODAS las
tarjetas del panel y solo con ratón (`@media (hover: hover)`).

**Y el aire de los estantes se ajusta** («las boxes tienen demasiado
espacio… el cómo lo lleva se ve demasiado largo»): en las filas 2 y 3, las
tarjetas del lado (`El plan`, `Cómo lo lleva`) dejan de estirar hasta la
altura de sus vecinas —que son las más altas del panel— con `align-self:
start`: la cima sigue clavada al estante y el canto de abajo acaba donde
acaba el contenido. La fila 1 sí estira entera (allí la alta es «Lo último»
y sus vecinas saben repartirse). El hover coloreado sobre las barras de
«Cómo lo lleva» se DESCARTÓ con el dueño: el color es del dato (ley del
color) y esas barras no son puertas — si algún día la fila del rating abre
su tendencia, se encenderá la FILA, como cualquier puerta.

**Y LA CINTA VUELVE A DOS LÍNEAS, con oficio** (tercera vuelta del 6 sep):
con la hoja blanca puesta, el dueño siguió sin comprarlo — «Resumen dieta
entreno revisiones queda impostado ahí… no se trata de replicarlo, se trata
de adaptar lo bueno y mejorarlo». El diagnóstico: el carril colgaba en medio
de la banda de 60 px, entre el nombre y las acciones, sin pertenecer ni a la
identidad ni al contenido. Lo adaptado de Coachway es su ANATOMÍA, no su
piel: línea de identidad arriba con su aire (avatar md, nombre a `--fs-lg`,
anatomía de corrido, estado y verbos al extremo) y el raíl de destinos como
segunda línea A TODO EL ANCHO, posado sobre el filete — la marca azul muerde
el borde y el primer destino cae a plomo sobre la primera tarjeta. ~100 px
en total (la primera versión de dos filas eran 138). El orden de retirada se
remidió (1280 el rótulo de «Ver como», 1120 la anatomía; el corte de partir
la banda desaparece — ya nace partida) y el salto del perfil conserva su
ley: flecha de 38 en el hueco del avatar md, x del titular idéntica dentro y
fuera (medido: 351/351). Validado: lint, 1675 tests, verify, build y
capturas reales en claro, oscuro y perfil.

**Pendiente**: el colapso de grupos para carteras de 30+, y el veredicto
tintado si el dueño lo quiere pese al conflicto de arriba. La revisión ya
traía su propio despacho (el carril Marta·Nerea·Javier con «Cerrar y pasar
a»), así que las tandas no lo tocan.
