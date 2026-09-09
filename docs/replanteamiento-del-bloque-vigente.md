# Leer y editar — replanteamiento de rutina y bloques

**Encargo** (7 sep 2026): la lógica del bloque es fea, mal diseñada y con poca
visión global del conjunto. Replantear el sistema entero.

**Prototipo clicable**:
<https://claude.ai/code/artifact/28d1a42c-d3ad-430e-8134-3adb2bcdc9ec>

Sustituye la §3 y la §5 de
[`replanteamiento-rutina-bloques.md`](replanteamiento-rutina-bloques.md) y anula
su M-01 y M-02.

---

## 1. Dos correcciones de hecho, verificadas en el código

Antes que nada, porque media propuesta anterior se apoyaba en ellas y eran
falsas.

**El gimnasio del cliente son FOTOS.** `src/domain/equipment.js` guarda imágenes
con una etiqueta de grupo muscular (`muscleGroup`) y nada más. La app **no sabe
que esa foto es un multipower**. Todo aviso del tipo «en su gimnasio hay
multipower y press de hombro sentado» era invención mía. El álbum sirve para lo
que se creó —que el entrenador MIRE lo que tiene mientras programa, en vez de
abrir Drive en otra pestaña—, no para que la app deduzca nada.

**Un ejercicio no tiene equipamiento.** `buildExercise` (`training.js:333`) es
`{ id, name, muscle, sets[] }`, más `enlazado`, `tecnica` y `restSeconds`
opcionales. Así que subtítulos como «Pecho · Barra» tampoco existen: lo único
que hay es el músculo.

**Y una tercera, al revés:** lo mejor que tenemos estaba enterrado.
`strengthByExercise` (`reading.js:214`) devuelve por ejercicio
`{ e1rm, delta, perWeek, dir: 'up' | 'flat' | 'down' }`, con un mínimo de tres
microciclos registrados. **Es el dato que dice si el bloque está funcionando**, y
vivía dentro de un popup.

---

## 2. La estructura: una superficie, dos estados

> **La herramienta aparece cuando vas a cambiar algo, y desaparece cuando no.**
> (Suyo, y es la idea que ordena todo lo demás.)

### LEER — lo de siempre

Dentro del chasis de cliente de verdad. Sin una sola caja: cada hoja es un
titular con su regla, y debajo las líneas. Cuatro columnas fijas y siempre en el
mismo sitio:

```
EMPUJE                                        6 ejercicios · 19 series
──────────────────────────────────────────────────────────────────────
 Ejercicio                        Pauta            Último    Tendencia
 Press banca                      4 × 5-6 · RIR 1  62,5 kg      ↑ sube
 Press inclinado con mancuernas   3 × 8-10 · RIR 2    24 kg     → plano
 Press militar de pie             3 × 6-8 · RIR 2   32,5 kg     ↑ sube
 A1 Fondos en paralelas           3 × 10-12 · RIR 1  +10 kg     ↑ sube
 A2 Elevaciones laterales         3 × 12-15 · RIR 0     9 kg    → plano
 Extensión de tríceps en polea    3 × 12-15 · RIR 1    30 kg    ↓ baja
    última con bajada · descanso 60 s
```

Nada más. Ni biblioteca, ni campos, ni asas, ni menús, ni tira de semanas. La
**tendencia** es lo que integra el plan con lo que está pasando, en la misma
línea, y respeta [[la-app-no-receta]]: informa, no propone. Un ejercicio recién
puesto dice **«aún no»** —hacen falta tres microciclos—, que es la verdad.

### EDITAR — un momento

Un botón, y la misma superficie sin moverse de sitio: las líneas ganan campos
(Series · Reps · RIR · Descanso), asa y `⋯`; entra un **buscador** que añade
—`AddExerciseForm` + `mergeCatalog`, que ya existen— y las **patologías como el
texto que escribió el cliente**, sin inventar sustitutos. «Listo» y vuelve a
estar limpio.

### COMPARAR — una capa

Dos bloques: qué cambió (`sessionDiff`, que hoy solo se usa al heredar), series
por hoja, e1RM por ejercicio y cumplimiento. Se abre, se mira y se cierra.

---

## 3. Nueve piezas fuera

Casi todas estaban ahí por una de dos razones: **fingían saber algo que la app no
sabe**, o eran **mobiliario de taller montado en la pantalla de leer**.

| Fuera | Por qué |
|---|---|
| El álbum del gimnasio como herramienta | La app no sabe qué hay en la foto. Sigue en la ficha, que es su sitio. |
| Los avisos con alternativas | Eran invención. |
| `Compositor.jsx` y `/rutina/componer` | Editar es un estado, no una habitación. |
| `EscribirHoja` como ventana y `?v=hoja` | Se escribe donde se lee. |
| El cajón, el MRV y el registro del costado | Tres muebles alrededor de una lectura. |
| La tira de microciclos | Lo ejecutado de una semana es trabajo de Revisiones. |
| `plannedWeeks` | Un bloque dura lo que dura. |
| La gráfica de métricas en el tiempo | Su trabajo lo hace la columna de tendencia, ejercicio a ejercicio. |
| `HistorialPopup` | Absorbido por comparar. |

Y tres dentro: la **tendencia en la línea**, **editar como estado**, y
`moveExerciseToSheetIn` (hoy `moveBlockExerciseIn`, `blocks.js:1354`, solo
reordena dentro del día).

---

## 4. El modelo no se toca

El plan ya vive en el bloque, el puesto ya es `toWeek: null`, las excepciones ya
llevan tramo, `sessionDiff` y `planExerciseView` ya existen, y
`strengthByExercise` ya calcula la tendencia. Todo el trabajo es de pantalla.

| Tanda | Piezas | Riesgo |
|---|---|---|
| **1 · Leer** | `VistaBloque` se queda con las hojas y suelta cajón, MRV, registro, progresión y línea. Las líneas se imprimen con `planExerciseView` y se les añade la tendencia. Fuera `plannedWeeks`. | Medio — recolocar el MRV |
| **2 · Editar** ⭐ | El estado editando; entra el buscador; desaparecen `EscribirHoja` y `Compositor.jsx`. Falta `moveExerciseToSheetIn`. | Alto — es la mudanza |
| **3 · Comparar** | Una capa con `sessionDiff` entre dos bloques cualesquiera. `HistorialPopup` se jubila. | Bajo |

---

## 5. Por qué hicieron falta cinco vueltas

Cada rechazo fue por la misma causa, y conviene tenerlo escrito:

1. Convertí en **estructura** (una ruta, un eje, una portada) lo que para él es
   un **momento** o una consulta ocasional.
2. Monté **mobiliario de taller** en la pantalla de leer.
3. Hice piezas que **fingían saber** lo que la app no sabe.
4. Dibujé los prototipos **fuera del chasis del cliente**, y por eso «mal
   integrado».

Lo que destrabó el concepto fue dejar de proponer y **preguntar las decisiones
con maquetas de cada alternativa**.

---

## 6. Lo que queda abierto

1. **La tendencia, ¿con tinta?** Ahora «sube» va en verde y «baja» en rojo. Es un
   hecho con dirección, no un juicio; si debe ir todo en gris y hablar solo la
   flecha, es un cambio de una línea.
2. **¿Qué falta en la línea de leer?** Ahora: nombre, pauta, último peso,
   tendencia. ¿El músculo? ¿El descanso? ¿El volumen por grupo?
3. **Las patologías**, ¿solo al editar o siempre visibles?
