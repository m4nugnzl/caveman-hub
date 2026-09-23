# El microciclo como secuencia dentro del bloque

Estudio y plan aprobados el 22 sep 2026. Objetivo: admitir repartos asimétricos
(«2-1 2-1 3-1») sin cambiar nada de lo que ya se ve ni de lo que ya está fechado.

Estado: **F1 construida** (dominio y pruebas, sin UI y sin persistir) y **F2a
construida** (apariciones y `previstoHasta`) y **F2b construida** (la secuencia
se guarda en el bloque al escribir) y **F2c construida** (la tira del
microciclo, sin commitear). F2d y F3 pendientes.

---

## 0. Decisiones cerradas (no se reabren)

1. **La estructura vive en el BLOQUE**, no en el cliente. Cambiarla en un bloque
   no altera cómo se leen los anteriores.
2. **Dos tipos, una misma forma de datos:**
   - **Semanal:** siempre 7 días anclados al lunes. Puede ser asimétrica dentro
     de la semana; no hay microciclos semanales de 14 días.
   - **Rotativo:** longitud libre N, se repite sin ancla de calendario.
3. **El microciclo es una SECUENCIA explícita**: lista ordenada de
   `{ hoja }` o `{ descanso: true }`, más un `tipo`. Una hoja puede aparecer más
   de una vez.
4. **La cadena («2-1 2-1 3-1») es un GENERADOR puro**: cadena + hojas del
   bloque → secuencia. Después la secuencia se retoca a mano. Solo en rotativo.
5. **Fuera de alcance:** qué pasa cuando un cliente rotativo se salta un día. Se
   conserva el comportamiento actual (§1.4).

Y la migración **no cambia nada visible**: fechas, analítica y claves de la dieta
se quedan donde están.

---

## 1. Lo que había, y cambia el planteamiento

1. **El reparto del bloque abierto no estaba en el bloque.** Vive en
   `workout_data.weekly_split` (`program.weeklySplit`) y solo se congela dentro
   del bloque al cerrarlo (`openNextBlock`).
2. **Las sesiones se identifican por el nombre de la hoja** (`dayName`).
   `cicloPorAbrir` cuenta hojas como CONJUNTO y `blockSummary` planifica una
   sesión por hoja. Con una hoja repetida, se cuenta una vez. **El fallo ya
   existe en semanal**: el menú «Cae el …» deja poner la misma hoja en dos días.
3. **Dos reglas para fechar un microciclo nuevo.** El entrenador usa
   `nextCycleDate` (fecha anterior + duración); el cliente, con
   `continue_program` (0109), recibe `current_date`. No se toca.
4. **El día saltado, hoy** (se documenta, no se cambia):
   - **Entreno:** no va por calendario. «Hoy» es `null` en rotativo; la portada
     ofrece la sesión a medias o la primera hoja sin terminar, y el microciclo
     avanza al completarse.
   - **Dieta:** sí va por calendario. Casilla = `(días desde la fecha del último
     microciclo) mod (número de casillas)`. Un día saltado desfasa dieta y
     entreno hasta que el siguiente microciclo reancla la cuenta.

---

## 2. Forma de los datos y dónde se guarda

```js
block.microciclo = {
  tipo: 'semanal' | 'rotativo',
  dias: [{ hoja: 'Push A' } | { hoja: null } | { descanso: true }, …],
  // semanal: exactamente 7, empezando en lunes
}
```

- **`{ hoja: null }`** es un día de entreno sin hoja todavía. Solo lo produce el
  generador cuando el bloque aún no tiene hojas (así se ve la forma del ciclo
  antes de tener nombres, como hacía `rotatingSlots` con «Entreno»).
- **En el JSON de cada bloque, también en el abierto.** Desaparece el baile de
  congelar al cerrar.
- **La cadena no se guarda: se deriva** con `cadenaDe(dias)`.
- **No hace falta SQL.** `blocks` es jsonb sin validación; `continue_program` y
  `training_summaries` ignoran claves nuevas; RLS ya limita `workout_data` al
  entrenador. Migración en dominio, perezosa e idempotente, como
  `migrateBlockPlans`.

### Las columnas del cliente

`clients.cycle_type` y `clients.cycle_pattern` **se quedan**, con dos usos:

1. **Quien solo tiene la dieta** (`entrenaPorSuCuenta`): son su única fuente.
2. **Punto de partida** para derivar los bloques sin materializar y para el
   primer bloque de un cliente. Después, cada bloque hereda del anterior.

Ya no rigen para ningún bloque materializado. `CycleSettings` deja de editarlas
en F2; `AjustesPlan` sigue editándolas para quien entrena por su cuenta.

### La columna `weekly_split`

Se sigue escribiendo **como copia del bloque abierto**, desde un solo sitio,
para que una versión en caché de la app (PWA) no lea repartos viejos. Se retira
cuando ningún lector la use (anotado en el código).

---

## 3. El generador

`generarSecuencia(cadena, hojas)`:

- **Una sola tanda («2-1»):** se repite hasta colocar todas las hojas, en orden;
  la última tanda cierra con su descanso aunque quede corta. Es exactamente
  `rotatingSlots`, y hay una prueba de propiedad que lo demuestra. Con menos
  hojas que la tanda, la tanda se queda corta («3-1» con dos hojas es A B ·):
  una sola tanda nunca repite hojas.
- **Varias tandas («2-1 2-1 3-1»):** literal, fija la longitud.
  - Si sobran casillas, las hojas vuelven a empezar en orden (repeticiones).
  - Si sobran hojas, van a «Sin día». Nada de añadir «1-1».

`cadenaDe(dias)` agrupa entrenos seguidos con los descansos que los siguen. Un
generado de una tanda se relee como varias («2-1» con 6 hojas → «2-1 2-1 2-1»);
para saber si una secuencia sigue siendo la generada (§5) se prueba primero con
su primera tanda sola y después con la cadena literal.

---

## 4. Inventario de consumidores

**Dominio**

| Sitio | Qué leía | Qué pasa |
|---|---|---|
| `training.js` `normalizePattern`, `rotatingSlots`, `cycleLengthDays` | patrón `{train, rest}` | Se quedan como generador de la migración y para quien entrena por su cuenta |
| `training.js` `cycleSlots` | tipo, patrón, sesiones, split | Acepta `microciclo` (F1); con él, `casillasDe`. Claves: `Lunes…Domingo` o `"1".."N"` |
| `training.js` `trainingDayCount`, `isRestDay` | split | `entrenosDe(microciclo)` en F3 |
| `training.js` `cycleSpanDays`, `nextCycleDate` | tipo, patrón, `previous.days` | `duracionDe` + `fechaDelCicloSiguiente` (F1) |
| `training.js` `weekdayForDay` | split | Lee la secuencia semanal (F2, con el editor) |
| `blocks.js` `structureOfBlock`, `openNextBlock`, `deleteBlockFrom`, `programAfterRemovingWeek` | congelan el split | Se quedan mientras exista la columna |
| `blocks.js` `tramoDelBloque` | tipo y patrón del cliente | `hasta` desde la secuencia (F1) |
| `blocks.js` `clientCycleSlots` | tipo, patrón, sesiones, split | Secuencia del bloque en curso (F1) |
| `blocks.js` `semanaDelCliente` | `client.cycleType` | Tipo del bloque en curso (F1) |
| `blocks.js` `cicloPorAbrir`, `blockSummary` | hojas como conjunto | Contar apariciones (F2) |
| `blocks.js` `rename/remove/add/duplicate/moveBlockSessionIn` | nada | Reconciliación (F2, §5) |
| `deshacer.js` `mismoPlan` | split y `blocks` | Nada: la secuencia va en `blocks` |
| `reparto.js` | `program.cycleType` (siempre `undefined`) | La secuencia viaja al pegar (F2) |
| `semanasDelPlan.js` | tipo y patrón del cliente | Se sigue pasando: es el `client` de la derivación |
| `nutrition.js` `cycleMap`, `cycleFoto` | casillas ya hechas | Nada |

**Contexto**

| Sitio | Qué pasa |
|---|---|
| `useWorkout` `fechaSiguienteCiclo` | Lee la secuencia del bloque del microciclo anterior (F1) |
| `useWorkout` `updateWeeklySplit` | Escribe la secuencia del bloque y la copia `weekly_split` (F2) |
| `useWorkout` `startProgram`, `startBlock`, `startBlockWithPlan` | Aceptan y heredan `microciclo` (F2) |
| `useWorkout` `applyPlan` | Añade `materializarMicrociclos` (F2) |
| `useWorkout` `replicateClient` | Nada: viaja en `blocks` |
| `types.d.ts` | Añadir `Microciclo` al bloque (F2) |

**Portal del cliente (F3)**: `hoy.js` (`entradasDeLaSemana`, `sesionDeHoy`,
`tiraDeLaSemana`) lee la secuencia semanal; `hojas.js` `buildStrip` la secuencia.
`proximaDelMicrociclo` pasa a F2 (cuenta apariciones, sigue el orden de la
secuencia). `PlanDelBloque.jsx` y `buildTape` no tienen quien los use.

**Panel y editor**: `TarjetaPlan`, `TarjetaArranque`, `FranjaCifras` usan
`trainingDayCount(program.weeklySplit)` sin mirar el tipo — avería ya existente
con rotativos (F3). `CycleSettings` pierde tipo y patrón (F2).
`ConjuntoDelBloque` recibe la tira (F2). `Compositor` hereda y reconcilia (F2).
`TiraDelPrograma` pone «D4» en rotativo (F3). `CycleChain.jsx` no lo importa
nadie y pinta flechas (ley de los gestos): se retira en F3.

**SQL**: ninguna función lee `cycle_type`, `cycle_pattern` ni `weekly_split`.
Nada que migrar.

---

## 5. Herencia y reconciliación

- **Bloque nuevo:** copia la secuencia del anterior. En blanco: semanal con 7
  descansos; rotativo generado con la cadena del anterior.
- **Secuencia generada vs. retocada** (sin campo nuevo, se deduce comparando):
  - Mientras sea igual a lo que da el generador (§3) con las hojas actuales, se
    **regenera sola** al añadir, quitar o reordenar hojas.
  - En cuanto se retoca a mano, deja de hacerlo.
- **Hoja renombrada:** su nombre cambia en la secuencia, en el mismo gesto.
- **Hoja quitada** (secuencia retocada): sus días pasan a descanso; la longitud
  no cambia, así que no se mueven fechas ni claves de la dieta.
- **Hoja nueva o duplicada** (secuencia retocada): no entra, va a «Sin día» y se
  **avisa en ese momento** («no cae en ningún día del microciclo»), además de la
  línea de la tira.
- **Reordenar hojas** (secuencia retocada): no toca el ciclo.
- **Portapapeles:** la secuencia viaja, reconciliada con las hojas de destino;
  las que no existan allí pasan a descanso.

### Hojas repetidas

Se cuentan apariciones: una hoja que aparece k veces necesita k sesiones, y la
i-ésima sesión por fecha cubre la i-ésima aparición. **Va en F2, antes que el
editor**: el editor no sale permitiendo repetir hojas si `cicloPorAbrir`,
`blockSummary`, la adherencia y `proximaDelMicrociclo` no lo cuentan bien. Y
arregla de paso el fallo que ya tiene el semanal.

---

## 6. El editor (F2)

En la banda de arriba de `ConjuntoDelBloque` (misma rejilla en Entreno y en el
Compositor). Sustituye al menú «Cae el …».

```
Rotativo
 Microciclo  [ Semanal | Rotativo ]                    10 días · 7 entrenos
 Tandas  [ 2-1 2-1 3-1          ]  Aplicar
 ┌────┬────┬────┬────┬─────┬────┬────┬────┬────┬────┐
 │ D1 │ D2 │ D3 │ D4 │ D5  │ D6 │ D7 │ D8 │ D9 │ D10│  + día
 │Push│Pull│ ·  │Legs│Upper│ ·  │Push│Pull│Legs│ ·  │
 └────┴────┴────┴────┴─────┴────┴────┴────┴────┴────┘
 Sin día: Brazos

Semanal
 Microciclo  [ Semanal | Rotativo ]                     7 días · 4 entrenos
 ┌────┬────┬────┬────┬─────┬────┬────┐
 │Lun │Mar │Mié │Jue │Vie  │Sáb │Dom │
 │Push│Pull│ ·  │Legs│Upper│ ·  │ ·  │
 └────┴────┴────┴────┴─────┴────┴────┘
```

- **Tipo:** `SegmentedControl` con las opciones y ayudas de `CYCLE_OPTIONS`.
- **Casilla:** `MenuAcciones` con las hojas (marca en la actual), «Descanso» y,
  solo en rotativo, «Añadir un día después» / «Quitar este día».
- **Arrastrar:** `useArrastreOrden({ eje: 'x' })`; Alt+flechas como hoy.
- **Tandas:** muestra `cadenaDe(dias)`; «Aplicar» regenera; ⌘Z deshace.
- **Cambiar de tipo:** semanal → rotativo, D1…D7; rotativo → semanal, los 7
  primeros y descanso en lo que falte.
- **Móvil:** la tira se desplaza dentro de su carril; el entrenador no compone
  en el teléfono.

---

## 7. Fases

**F1 — dominio y pruebas, sin UI, sin persistir (HECHA).**
- `training.js`: `TIPO_DEL_CICLO`, `normalizaMicrociclo`, `leerCadena`,
  `generarSecuencia`, `cadenaDe`, `duracionDe`, `entrenosDe`, `casillasDe`,
  `secuenciaSemanal`; `cycleSlots` acepta `microciclo`.
- `blocks.js`: `microcicloDelBloque`, `microcicloEnCurso`,
  `fechaDelCicloSiguiente`, `materializarMicrociclos` (pura, sin conectar).
- Reconectados: `clientCycleSlots`, `semanaDelCliente`, `tramoDelBloque`
  (`hasta`) y `useWorkout.fechaSiguienteCiclo`.
- Por qué no persistir aún: los escritores viejos (`updateWeeklySplit`,
  `CycleSettings`) escribirían donde ya nadie lee. Derivando al leer, F1 no
  cambia nada visible por construcción.

**F2 — en tres entregas, cada una con su commit.**

*F2a — arreglos de lo que ya falla (HECHA).*
- Apariciones: `vecesDeCadaHoja` (training), `microcicloDeLaSemana` y
  `vecesDeLaHoja` (blocks). Una hoja que no cae en ningún día cuenta una vez.
- `cicloPorAbrir` y `blockSummary` (adherencia incluida) cuentan apariciones y
  reciben el cliente; una sesión de más no sube la adherencia; las de hojas que
  ya no están en el plan cuentan como antes. **Corregido el 22 sep:** esas
  van a `extra` y no a `hechas`, porque la adherencia pasaba del 100 %
  (Gustavo Dueñas, 4 de 1).
- `proximaDelMicrociclo` recorre la secuencia; la «Próxima sesión» del teléfono
  (`ClientRoutineRoute`) la usa en vez de su propia búsqueda.
- `previstoHasta` de `tramoDelBloque` mide con `duracionDe` (adelantado de F3).

*F2b — persistencia, sin editor (HECHA).*
- `applyPlan` guarda la secuencia de los bloques que aún la derivan, con la
  ficha de antes, y después `seguirALasHojas` hace lo que hacía la lectura: los
  bloques nuevos (el Compositor) guardan la suya con el reparto que traen, y los
  rotativos que siguen siendo lo generado se regeneran con las hojas nuevas.
  Sin la ficha del cliente no se guarda nada.
- `updateWeeklySplit` escribe el día en el semanal guardado (`ponerDiaSemanal`).
- `weekly_split` es copia del bloque abierto, escrita solo por
  `conRepartoDelAbierto` dentro de `applyWorkout`.
- `CycleSettings` no cambia de cara, pero el tipo y el patrón pasan al bloque
  abierto (`cambiarCicloDelBloque`); los cerrados ya no los siguen.
- Ensayo (`npm run ensayo:microciclo`) con la copia del 22 sep: 44 programas,
  48 bloques (41 semanales, 7 rotativos), 0 diferencias, `weekly_split` intacto.

*Antes de F2c — las hojas fantasma (HECHO).* Quitar o renombrar una hoja la
dejaba como retirada en los `days` de todos los microciclos del bloque, se
hubiera entrenado o no: fuera del plan y sin forma de editarla (56 hojas en 9
clientes con la copia del 22 sep; 38 sin sesiones). `proyectarPlanEnDias` ya
solo conserva una retirada donde tiene sesiones o kilos heredados, y las que
hay se van en la siguiente escritura del plan. Ensayo (`npm run
ensayo:fantasmas`): quita exactamente las 38 y deja las 18 con sesiones.
El renombrado y la proyección hacia delante se decidieron después (abajo).

*Antes de F2c — adherencia, renombrado y versiones viejas (HECHO, 22 sep).*
- La adherencia no pasa del 100 %: las sesiones de hojas que el microciclo no
  tiene en el plan van a `extra` en `blockSummary` (Gustavo Dueñas, 4 de 1).
- Renombrar una hoja se lleva sus sesiones y su día en los microciclos de su
  bloque (`renameBlockSessionIn`). El teléfono no relee el nombre de la sesión
  que tiene abierta, así que con una sesión en curso de esa hoja (abierta y de
  menos de 24 h, `sesionEnCursoDeLaHoja`) el lápiz se apaga y dice por qué.
- Versiones viejas de la app: `lib/version.js` y `version.json` (aviso
  «Hay una versión nueva · Recargar», que para los guardados del programa); la
  cola apunta la versión de cada nota; la 0130 añade `workout_data.escrito_por`
  y la 0131 rechaza un cambio del plan sin firma nueva.

*Antes de publicar — series rechazadas y lo editado tras el aviso (HECHO, 22 sep).*
- Una serie que el servidor rechaza ya no se pierde: se apunta aparte en el
  navegador (`lib/seriesNoGuardadas`), cuenta en el indicador y sigue a la vista
  tras recargar (`794434a`).
- El teléfono vuelve a pedir su programa al volver a primer plano si hace más de
  cinco minutos, con las series de la cola encima; si la hoja cambió de nombre
  con la sesión abierta, la pantalla sigue a la sesión (`bc493b8`).
- Una serie rechazada por un cambio del plan se recoloca: por su sesión si
  existe, o por el único día de esa semana con ese ejercicio. Si no tiene sitio
  se queda «No guardada», con su valor (`7fb2566`).
- Cada no guardada se marca en su fila; el pie dice cuántas y por qué (`efb5422`).
- El entrenador lo sabe: `report_unsaved_set` (0132) y una línea en la tarjeta
  del entreno de su Revisión (`6883b21`).
- Lo que el entrenador edita después del aviso «Hay una versión nueva» se aplica
  con la versión nueva al recargar, con la guardia de la versión sobre la que se
  hizo; si alguien escribió encima, pregunta (`45baf07`).

*Publicar — lista completa y en orden.* La cabecera de la 0131 repite los
pasos 1, 3, 4 y 5.

Qué entra (rama `microciclo-f2`, que sale de `ddd690f`):

| Qué | Commits | Migración |
|---|---|---|
| F1 y F2a (ya en master) | `67ea4d2`, `ddd690f` | — |
| F2b y hojas fantasma | `4149cc3`, `61b078c` | — |
| Adherencia y renombrado | `eedb761`, `ac05e52` | — |
| Versiones viejas | `78cf236`, `c56980b`, `45baf07` | 0130, 0131 |
| Series rechazadas | `794434a`, `bc493b8`, `7fb2566`, `efb5422`, `6883b21` | 0132 |
| Estudio | `f089896` y el de esta lista | — |

Orden:
0. Unir la rama a master. En master: `npm run check` (salvo los tres ficheros
   que fallan sin `copias/` ni `.env`), y `ensayo:microciclo` con una copia
   nueva (`npm run backup`). `ensayo:fantasmas` ya no: mide la regla de
   `61b078c`, que F2c deshizo.
1. Aplicar la 0130: solo añade `escrito_por`. Lo que esté abierto sigue igual.
2. Aplicar la 0132: tabla y función nuevas, no toca nada existente. Puede ir
   después de publicar: hasta que exista, el teléfono no consigue avisar al
   entrenador, lo apunta y lo vuelve a intentar en cada arranque.
3. Publicar la app.
4. Comprobar que firma: guardar un cambio del plan y ver que `escrito_por` de
   esa fila ya no es NULL y empieza por el id de `/version.json`.
5. Aplicar la 0131 cuando ya no escriba ninguna pestaña de antes del paso 3:
   `select count(*) from workout_data where updated_at > '<hora del paso 3>'
   and escrito_por is null` a 0 durante uno o dos días. Desde ahí, una pestaña
   vieja recibe un error al guardar el plan en vez de pisarlo.

   El error lleva el código 55000 y no P0001, a propósito (22 sep): la versión
   publicada hoy trata P0001 como rechazo definitivo y BORRA la nota del
   navegador, así que el «Recarga» del mensaje perdía lo editado. Con 55000 la
   nota se queda, y al recargar la versión nueva la vuelve a aplicar
   preguntando antes (no trae `base`).

Pendiente de la sesión del roadmap: `tramoDelBloque` sigue sin commitear en
el árbol compartido. Con él esperan la línea `hasta` de F1, el arreglo de
`previstoHasta` de F2a y sus pruebas, que siguen solo en ese árbol. Entran en
cuanto esa sesión haga su commit; no bloquean esta lista. Tampoco entran aquí
las 0122–0125 que hay sin commitear en ese árbol, de otras sesiones.

*F2c — el editor (HECHO el 22 sep, sin commitear en la rama).* Boceto aprobado
con correcciones del dueño.
- `EditorDelMicrociclo`, detrás del ritmo de la barra de arriba
  (`RitmoDelMicrociclo`: SOLO los puntos, lleno entreno y hueco descanso,
  agrupados por tanda), entre los microciclos y «+ hoja», en Entreno y en el
  Compositor. Popover en el escritorio, hoja inferior en el teléfono. Nada fijo
  en la página: como banda encima de la rejilla se comía la vista del bloque
  (2.ª vuelta del dueño), que queda igual que en master. Orden: tipo → tandas →
  días, en una sola cabecera. En el escritorio, UNA FILA POR TANDA: sus
  entrenos (112 px fijos, para que el nombre entre en una línea) y, al final,
  su descanso, que es una ranura estrecha. Se ven todas las vueltas, sin «×3»
  ni filas plegadas. En el teléfono (< 640 px) es una lista tipo Ajustes, con
  una caja por tanda. El descanso casi no se dibuja.
- *4.ª vuelta del dueño (22 sep).* La pastilla decía dos veces lo mismo —los
  puntos Y «2-1 2-1 2-1»—: la cadena escrita se va al editor, que es donde
  además se escribe, y en la barra quedan los puntos solos. Y la cadena se
  escribe CORTA cuando todas las tandas son iguales («2-1», no «2-1 2-1 2-1»
  ni «2-1 ×3»), porque una tanda ya significa que se repite hasta colocar
  todas las hojas; solo se deletrea cuando son distintas. Al escribir se
  aceptan las dos formas y, como lo guardado es la secuencia, al releerla sale
  siempre la corta (`cadenaDe`; la literal, para comparar secuencias, es
  `cadenaLiteral`). La fila de la barra pasa de ceder dos cosas a ceder una
  (`PASOS_DE_APRIETO`): el ritmo ya no tiene texto que ceder.
- *5.ª vuelta del dueño (22 sep), ocho arreglos de diseño del editor.*
  1. **El popover mide su contenido** (`width: max-content`, techo la ventana)
     y se alinea por el canto DERECHO de la pastilla. Con 760 fijos y el canto
     izquierdo, un rotativo de dos tandas dejaba media casilla de aire muerto
     y el semanal acababa colgando lejos de su mando. Medido a 1440: rotativo
     550 px, semanal 742, los dos con el canto derecho en el de la pastilla.
  2. **El descanso casi no se dibuja.** En rotativo, ranura de 38 px SIN
     rótulo —«D3» en un día que no se entrena no le sirve a nadie— y sin filo.
     En semanal conserva su día, porque es calendario, pero pierde la caja:
     con el filo alrededor parecía una casilla por rellenar. Los dos llevan un
     trazo mínimo, que es lo que distingue el hueco de lo que falta.
  3. **Una sola tipografía** para el rótulo del día: mandan las minúsculas
     («Lun», «D1»), no las versales del semanal.
  4. **Los nombres no se parten**: un renglón, y lo que no cabe se corta con
     puntos; entero se lee en el menú y en el rótulo del ratón.
  5. **Las ranuras de descanso caen en columna** entre filas, porque todas las
     casillas miden lo mismo (112 px el entreno, 38 la ranura). Ese es el
     motivo de la fila por tanda: tres tandas iguales salen idénticas y una
     3-1 sobresale. Medido: las ranuras de dos tandas 2-1 en x = 740, la de la
     3-1 en x = 858.
  6. **Una sola cabecera**: «Semanal | Rotativo  Tandas 2-1 ›  9 días · 6
     entrenos». Las tandas tenían su renglón aparte, y dos renglones de
     etiqueta + valor se leen como dos secciones cuando son la misma cosa.
  7. **El día en curso**, marcado en rotativo con un punto de acento
     (`diaEnCursoDe`: cuenta desde la fecha del microciclo en curso; fuera de
     la vuelta, nada). Es el único dato de la vuelta que no se deduce
     mirándola —«D3» no es ningún día de la semana—. En semanal no hace falta:
     lo dice el calendario.
  8. **«+ día» del alto de una casilla** y callado (sin el filo discontinuo):
     a media altura descuadraba la fila que cierra.
  El semanal sigue siendo un renglón de siete, el teléfono una lista de días
  y arrastrar sigue cruzando filas (`useArrastreOrden` decide por geometría).
- Gestos: tocar un día abre un menú (escritorio) o la hoja inferior (teléfono).
  Arrastrar intercambia en semanal y mueve en rotativo, y Alt + flechas hace lo
  mismo. «+ día» es la única acción visible. Todo lleva Deshacer.
- «Sin día»: tocar la hoja pregunta el día, y si está ocupado pregunta
  nombrando la hoja que hay; también se arrastra.
- El rótulo del día de cada columna («LUN», «D1») sigue siendo el mando de su
  día, como «Cae el …», ahora sobre la secuencia (también en rotativo) y con
  la misma pregunta si el día está ocupado (`useCambiosDelMicrociclo`). Se
  van `updateWeeklySplit` y `cambiarCicloDelBloque`. `CycleSettings` pierde tipo y patrón. Si el
  bloque ABIERTO cambia de tipo o de tandas, la ficha se pone igual: es una
  copia para el portal y el panel (F3), como `weekly_split`.
- Reconciliación (`seguirAlPlan`): lo generado se regenera; en lo demás, lo
  quitado pasa a descanso y lo nuevo va a «Sin día», con aviso al añadirla.
  Renombrar se lleva sus días. Al pegar o mandar un bloque, su secuencia
  viaja (`microcicloParaLasHojas`).
- Hojas fuera del plan: `61b078c` deshecho, y ninguna escritura las quita
  sola. Quitar una hoja las suelta en el mismo gesto
  (`soltarHojaSinEntrenar`). El aviso con «Colocar en un día» / «Archivar» se
  decidió NO construirlo: las que ya hay se quedan donde están, y las hojas del
  plan sin día salen solo en el editor, en «Sin día».

**F2d — el plan de cada microciclo se congela al cerrarlo.** Aprobada el 22
sep como fase aparte, después de F2c; no depende de F3. Hoy, tocar el plan del
bloque reproyecta TODOS sus microciclos, también los cerrados: quitar una hoja
la quita de lo previsto en semanas que ya pasaron. La regla nueva: un
microciclo cerrado conserva las hojas y apariciones que tenía al cerrarse, y
un cambio del bloque vale desde el microciclo abierto.

*Qué cambiaría (copia del 22 sep).* 108 microciclos cerrados; 6 cambian de
hojas previstas, todos con sesiones. Son mínimos: `block.log` existe desde el
31 ago y no apunta los renombres.

| Cliente | Microciclo | Diferencia | Adherencia (sesiones) hoy → congelada |
|---|---|---|---|
| Javier Bolaños | M1 | +TORSO, EMPUJE, TIRÓN · −TORSO B | 5/4 → 5/6 (83 %) |
| Javier Bolaños | M2 | igual | 4/4 → 4/6 (67 %) |
| Gustavo Dueñas | M1 · M2 · M4 | +Torso B, Pierna A, Torso A | 4/1 → 4/4 (100 %) |
| Gustavo Dueñas | M3 | igual | 3/1 → 3/4 (75 %) |

«Hoy» es antes del arreglo de `extra` (`eedb761`): con él, esas sesiones ya no
suben la adherencia, y congelar las volvería a contar porque en su microciclo
sí estaban previstas. Por eso lo de Javier y Gustavo no se arregla renombrando
sesiones: sus sesiones no comparten ni un ejercicio con las hojas de hoy
(Javier) o son hojas quitadas del bloque cerrado (Gustavo). Es esta fase. Aparte, 66 cambios de ejercicio de alcance «bloque»
hechos después de un cierre tocan 16 microciclos cerrados.

*De qué depende.* Hay dos capas que leen el plan de una semana pasada, y las
dos tienen que cambiar a la vez o se contradicen:
- A: `micro.days`, que escribe `proyectarPlanEnDias` (y lee
  `log_session_set` y el resumen del servidor, 0110).
- B: `resolvedMicrocycles` / `planOfWeek`, que leen el `block.sessions` de hoy
  para cualquier semana.

*Lo que se complica.*
- Anotar tarde en un cerrado una hoja que se añadió después del cierre: el
  servidor la rechaza, porque su día no está en ese microciclo.
- Editar un bloque ya cerrado: ¿cuenta como «desde el abierto» si no tiene
  microciclo abierto?
- `vecesDeLaHoja` lee una secuencia por bloque; habría que guardarla por
  microciclo o por tramo.
- `weekSignals` y `untrainedWeeksOfDay` comparan semanas con el plan de hoy.
- Importar sobre semanas cerradas (el importador) y los tres scripts de
  reparación, que hoy reproyectan todo.

*Lo que no depende de esto:* deshacer (guarda el programa entero), la
comparativa y la progresión por ejercicio (leen sesiones) y el Compositor
(trabaja sobre el bloque, no sobre semanas).

**F3 — consumidores.** `hoy.js`/`hojas.js`, las tres cifras del panel, «D4» en
`TiraDelPrograma`, retirar `CycleChain`, `PlanDelBloque`, `buildTape`.

---

## 8. Riesgos aceptados

- **Bloques cerrados** se derivan con el patrón que tenga el cliente al migrar.
  Las fechas están guardadas: la analítica no se mueve; solo el dibujo.
- **La duración.** Antes `cycleSpanDays` contaba `previous.days`, que tras
  `proyectarPlanEnDias` puede incluir hojas retiradas con kilos antiguos. Ahora
  cuenta las hojas del plan del bloque, así que en ese caso raro un microciclo
  rotativo futuro nace unos días antes. Lo pasado no cambia. Escrito en la
  prueba de F1.
- **`previstoHasta` de `tramoDelBloque`** medía cada semana prevista con UNA
  tanda del patrón (3 días en un 2-1 con seis hojas, no 9). F1 lo conservó para
  no cambiar nada visible; F2a lo corrige con `duracionDe`.
- **Claves de la dieta:** insertar un día desplaza las casillas `"3".."N"`. Se
  avisa con «no coincide con el entreno»; no se recoloca solo.
- **Quien entrena por su cuenta** sigue en «X-Y» simétrico.
- **`continue_program`** fecha con `current_date`. No se toca.

---

## 9. Aparte, sin tocar en este trabajo

- **`clients_self_prefs` (0006)** deja al cliente hacer UPDATE de cualquier
  columna de su fila, incluidas `cycle_type` y `cycle_pattern`. Con la secuencia
  en `workout_data.blocks` la estructura queda detrás de los permisos del
  entrenador, pero la política sigue siendo demasiado ancha. Pendiente aparte.

---

## 10. Documentación y código que no coinciden

Se corrige en la fase que toque cada sitio:

- `estudio-portapapeles.md` L741 habla del `cycleType` «del programa»; es del
  cliente. Seis sitios leen `program.cycleType` (siempre `undefined`); no rompe
  porque `unitLabel` ignora su argumento. (F2, con el portapapeles.)
- `replanteamiento-dieta.md` L144: «Repartir por el entreno no puede existir» en
  rotativo; el código lo permite desde `cycleSlots`. (F3.)
- `replanteamiento-rutina-bloques.md` L88: campos del bloque sin `microciclo`.
  (F2.)
- `columnas.json` no tiene la columna `blocks`. (Aparte.)
