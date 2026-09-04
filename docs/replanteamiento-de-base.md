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
