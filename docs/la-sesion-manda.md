# La sesión manda — el rediseño del portal del cliente

**Encargo** (15 sep 2026): cuatro propuestas de rediseño del HUB del cliente en
PC y móvil, mirando cómo diseñan las mejores aplicaciones de móvil; después,
«propón una versión rediseñada y cómo se verían las cosas». Aprobada la
propuesta con dos correcciones del dueño, que están recogidas en §4.

Prototipo clicable: https://claude.ai/artifact/LcoR6hjnuwG5bjhPSXdDTh

Parte de lo hecho el 6 sep: hoja blanca, cabecera de dos líneas y el acabado de
`plan-quedarse-a-mirar.md`. **Este plan no toca la gramática visual**: toca
dónde empieza el portal y qué pasa mientras se entrena.

---

## 1. El terreno: tres cosas que el portal hacía y no debía

**Aterrizaba en un índice.** `CLIENT_HOME = '/mi/rutina'`, o sea una lista de
días. Los avisos —lo único urgente— vivían en otra pestaña, y la respuesta del
entrenador, que es el momento que cierra el círculo del producto, dos niveles
dentro de «Mi revisión».

**Apuntar era rellenar una tabla.** Veintiuna series por sesión, tres campos
cada una, quince ejercicios en una página de scroll. El descanso ya estaba
pautado (`restSeconds`) y los récords ya se calculaban (`isRecord`), pero
ninguno de los dos llegaba a ocupar la pantalla. Y la sesión no terminaba: se
dejaba de hacer scroll.

**En PC era la app de móvil estirada.** Salvo la rutina —que abre a dos
columnas desde 1.100 px— todo el portal es una columna centrada. En un monitor
de 27", tres campos de 500 px para un número de dos cifras.

## 2. La tesis

El portal tiene **tres estados** y solo tenía pantallas:

| | Qué contesta | Dónde vive |
|---|---|---|
| Antes de entrenar | ¿qué me toca ahora? | la portada |
| Entrenando | ¿dónde iba y qué apunto? | el modo entreno |
| Repasando | ¿cómo voy? | el puesto |

De las cuatro propuestas se toman la **B** (modo entreno) y la **C** (el
puesto), más el mínimo de la **A** (la portada contesta al momento). Se
descarta la **D** (reorganizar el hub por el eje temporal): choca con que la
dieta en ciclos rotativos no tiene «hoy», y eso está documentado en
`ClientDiet`.

## 3. Las tandas

### S-1 — Modo entreno ✦ EJECUTADA (15 sep)

- **S-1a · El descanso se enciende siempre.** Ver §4.
- **S-1b · Un ejercicio a la vez** (`Client/SesionEnCurso.jsx`), solo en el
  teléfono. El carril de ejercicios arriba —qué llevas hecho, dónde estás y a
  cuál saltas—, la serie viva alzada con un − y un + por campo (2,5 kg, una
  repetición, un RIR) y el campo intacto para lo que cambia mucho. En
  escritorio se queda `ExerciseList`: ahí los ejercicios caben a la vez y los
  campos ya son editables sin gesto ninguno. Es el mismo reparto que ya hace
  esa lista para programar.
- **Nada se cierra con llave.** Una serie hecha es un botón que se vuelve a
  abrir con sus valores dentro. Corrección del dueño, §4.
- **El vacío parte de la vez anterior.** El primer toque en un campo en blanco
  pone lo que levantaste la última vez en ESA serie, no 2,5 kg.
- **Dónde estás es donde has tocado algo.** Lo destapó una prueba: al cerrar la
  última serie de un ejercicio, la pantalla se derivaba de «el primero que
  tenga series sin registrar» y te teletransportaba al siguiente justo después
  del gesto, sin decirlo. Ahora terminar deja la pantalla donde está y la
  salida es una puerta que se pulsa.

**No entra en esta tanda**, y se decide aparte: el modo a pantalla completa
—retirar la barra inferior y el reloj de sesión— que enseña el prototipo. Es
chrome que depende del estado y conviene verlo funcionando antes.

### S-2 — La portada ⟡ PENDIENTE

El héroe del gesto del día (entrenar · pesarte · leer la respuesta) y el
aterrizaje en `/mi/inicio`. Toca `Client/ClientStart.jsx`,
`Client/ClientUpdates.jsx`, `routes.js` y `domain/updates.js`.

Roza una decisión escrita: «Hoy» se retiró como sección porque la mayoría de
los días no tenía nada que decir. La diferencia defendible es que esto no es
una pestaña a la que haya que entrar y, por construcción, nunca está vacío —
día de descanso dice «pésate y sube tus fotos»—. **Es decisión del dueño.**

### S-3 — El puesto ⟡ PENDIENTE

Carril lateral desde 1.100 px y el costado con contexto, generalizados a todo
el portal y no solo a la rutina. Toca `Client/ClientLayout.jsx`,
`layout-portal` en `piezas.css` y `responsive.css`.

### Aparte — Avisos que llegan ⟡ PENDIENTE

No hay `pushManager` en ninguna parte: el descanso y la respuesta del
entrenador dependen de que el cliente abra la aplicación. No es diseño, y es lo
que más rinde por hora invertida.

## 4. Las dos correcciones del dueño

**El descanso no puede depender solo de la pauta.** «Depende de si los
entrenadores pautan o no descanso, no de otra cosa; yo por ejemplo no pauto.»
La regla vieja —«sin pauta no hay cuenta atrás»— es correcta en lo que
protege: un número en pantalla es una instrucción, y no sería suya. Pero de
ella se sacaba una conclusión que no se seguía: que sin pauta no hubiera NADA.
Y sin pauta está la mayoría, así que la pieza existía en el código y no en el
producto.

Son dos cosas y estaban juntas en una: **el objetivo** lo dice quien programa;
**el tiempo que llevas parado** es un hecho, y saberlo no es instrucción de
nadie. Así que la cuenta arranca siempre y lo que cambia es qué cuenta:

- Con pauta (`restSeconds`), cuenta atrás hacia el objetivo y se apaga al
  llegar. Es lo que hacía.
- Sin pauta, cuenta hacia arriba y no reclama nada. Sin meta no hay meta que
  dibujar. Se apaga sola a los cinco minutos: por encima de ahí ya no es un
  descanso entre series.

Ver `Coach/Workout/useDescanso.js` y sus pruebas.

**Moverse y corregir es lo primero, no un remate.** «Un sistema cómodo de pasar
de un ejercicio a otro, moverse e interactuar para rellenar, que incluso si te
confundes puedas darle otra vez y corregir.» El modelo de datos ya lo permitía
—una serie está hecha si tiene repeticiones (`isSetLogged`), no porque se haya
cerrado nada— y la primera maqueta lo empeoraba: metía un ✓ que parecía un
candado. Cerrar es una marca, no un cerrojo.

## 5. Estado

**S-1 ejecutada el 15 sep.** Validación: lint, tipos, verify (0 clases, 0
tokens, 0 usos indebidos de la paleta de datos), 2.445 pruebas y `vite build`.
El componente se miró renderizado con el CSS real en las dos pieles.

Dos avisos honestos:

- `npm run build` no llega al final en un entorno sin credenciales: el paso de
  `prerender` pide Supabase. `vite build` pasa.
- Fallan dos pruebas de dominio ajenas a esto —`foodEquivCatalogo` y
  `blockPlanEquivalencia`, el catálogo de equivalencias— y fallaban igual antes
  de tocar nada. Trabajo en curso de otra mano.
