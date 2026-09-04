# Coachway · Lecciones para Caveman Hub

Qué merece adoptarse, qué merece adaptarse y qué debe ignorarse — filtrado por
nuestra forma de trabajar: la app no receta (el criterio es del entrenador),
el móvil ejecuta y el PC planifica, el plan vive en el bloque, y la hoja de
entreno es nuestra identidad.

## A. Estructura de producto: lo que ellos entienden y nosotros aún no

### 1. La bandeja como corazón (Power Panel)
Su mejor idea estructural: **el trabajo diario del coach es una cola, no una
colección de fichas**. Tres columnas: quién espera | la conversación con el
check-in inline | la ficha viva al lado. El coach nunca navega: despacha.
Nosotros tenemos las piezas (colas, Revisión de dos columnas, hilo del
cliente pendiente del estudio de referencias) pero dispersas. La lección:
**una pantalla de despacho donde la unidad de trabajo es «cliente que
necesita algo», con su contexto ya abierto**.

### 2. Filtros de atención, no listas
«Missing check-ins / unread / no contact / ending soon». La lista de clientes
ordenada por urgencia real. Compatible con nuestra ley de «sin reproches»: son
filtros que el coach elige, no alarmas que juzgan.

### 3. La ficha del cliente como panel conmutable
Overview / Development / Nutrition / Workouts / Vault / Payments en paneles
dentro de la misma vista, no como páginas. Nuestra ficha rediseñada (anatomía,
pulso, hojas) ya apunta ahí; falta que sea invocable desde cualquier contexto
(al lado del chat, al lado de la revisión) como panel lateral.

### 4. Plantillas con grano fino
Guardan **secciones** de sesión, no solo programas enteros, y las arrastran.
Encaja con nuestros bloques: la biblioteca de piezas reutilizables (un día de
pierna, un calentamiento) con drag al plan es el punto medio entre artesanía
y velocidad. Sin «auto-programar»: la app no receta.

### 5. Alternativas predefinidas por ejercicio
El coach deja previstas las sustituciones; el cliente resuelve solo en el
gimnasio. Pura filosofía nuestra: el criterio lo puso el entrenador antes.

### 6. Visibilidad configurable por cliente
Ocultar peso/calorías a clientes con mala relación con la comida. Barato de
hacer, enorme en sensibilidad profesional.

### 7. Draft del check-in + recordatorio automático
El cliente puede dejar el check-in a medias; la app recuerda sola al que no
entrega. Quita al coach el papel de policía (nuestra regla: sin reproches).

### 8. Tasks privadas del coach
Recordatorios por cliente que solo ve el coach + un filtro global «vencidas».
Deliberadamente tontas (sin push, sin recurrencia). Barata y muy usada.

### 9. Offer text con aceptación en el checkout
Términos aceptados con timestamp antes de pagar. Con nuestros Cobros ya
montados, es una pieza pequeña que da seriedad de negocio.

### 10. El «today screen» del cliente
La app del cliente abre en **hoy**: entreno de hoy, comida de hoy, check-in
pendiente. El nuestro («el móvil enseña la rutina») puede conservar la
sobriedad y aun así ordenar por hoy.

## B. Diseño: lo que su estética nos enseña (sin copiarla)

1. **Tokens con carácter y disciplina**: 5 superficies en escala, hairlines y
   sombras teñidas de la tinta de marca, radios en 4 pasos, 3 pesos de fuente.
   La coherencia sale del sistema, no del gusto por pantalla. Nuestro
   tokens.css debería tener esa misma verticalidad (pocos tokens, muy
   intencionados).
2. **Una firma tipográfica**: su serif itálica en la palabra emotiva. Nosotros
   decidimos «cifra + frase» como firma; la lección es que la firma debe
   aparecer en todas partes con la misma gramática.
3. **El marco físico**: la app dentro de un marco de 8px con lienzo papel.
   Convierte la web en objeto. Interesante para la landing de Caveman, no
   necesariamente para la app.
4. **Titulares peso 500 con tracking negativo**, no bold: elegancia sin gritar.
5. **Animación = demostración**: solo animan lo que explica el producto
   (la gráfica se dibuja, el chip aterriza, el check se traza). Springs con
   overshoot (cubic-bezier(.18,1.32,.34,1)) para lo que «cae en su sitio»,
   expo-out para lo que entra. Reveal por IntersectionObserver, escalonado
   con delays. `prefers-reduced-motion` siempre.
6. **Su punto débil confesado es el pulido de la app**. Nuestra vara
   (Linear/Stripe, 2D minimal iOS) es la ventaja a defender.

## C. Lo que NO debemos copiar

- **El recetario/algoritmo que rellena planes solo**: choca de frente con «la
  app no receta». Nuestra nutrición puede escalar porciones a un objetivo que
  fijó el coach, pero no «generar el plan en 20 segundos».
- **Su gramática plantilla-y-masa** (packs, cookbooks, broadcasts) como centro:
  nuestro usuario es artesano; las plantillas son atajo, no identidad.
- **Su estética concreta** (verde bosque + papel + serif): es SU identidad y
  además caería en imitar. Lo nuestro ya está decidido: 2D minimal limpio,
  gris frío + acento, la hoja como artefacto.
- **CTA repetido 14 veces / marketing agresivo** en la app. En la landing sí
  aplica la disciplina de un solo CTA.

## D. Esbozo de replanteamiento estructural (a discutir)

La app hoy: 5 pestañas + ficha + Revisión + Resumen. El giro que Coachway
sugiere no es tirar nada, sino **reordenar alrededor del despacho**:

1. **Fase 1 — El Despacho** (su Power Panel, a nuestra manera): una pantalla
   de trabajo con cola de atención a la izquierda (check-ins sin revisar,
   mensajes, semanas sin contacto), el hilo/revisión del cliente en el centro
   y la ficha como panel lateral invocable. Reusa: WeekReview 2 columnas,
   Modal side, colas ya existentes.
2. **Fase 2 — La ficha como panel universal**: la ficha (anatomía/pulso/hojas)
   invocable desde cualquier pantalla como panel lateral, no solo como ruta.
3. **Fase 3 — Biblioteca de piezas**: secciones de sesión reutilizables con
   drag al bloque (grano fino de plantillas), alternativas por ejercicio.
4. **Fase 4 — Cliente**: today-screen sobrio en el móvil, draft de check-in,
   recordatorios automáticos silenciosos, visibilidad configurable de números.
5. **Fase 5 — Negocio**: offer text en el flujo de Cobros; tasks privadas.

Cada fase es independiente y compatible con lo ya construido (el plan sube al
bloque, la hoja de series, la ley de los gestos y la ley del color siguen
mandando).
