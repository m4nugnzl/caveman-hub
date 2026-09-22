# El microciclo como secuencia dentro del bloque

Estudio y plan aprobados el 22 sep 2026. Objetivo: admitir repartos asimétricos
(«2-1 2-1 3-1») sin cambiar nada de lo que ya se ve ni de lo que ya está fechado.

Estado: **F1 construida** (dominio y pruebas, sin UI y sin persistir) y **F2a
construida** (apariciones y `previstoHasta`) y **F2b construida** (la secuencia
se guarda en el bloque al escribir). F2c y F3 pendientes.

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
  ya no están en el plan cuentan como antes.
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

*F2c — el editor.* La tira (§6), la regeneración mientras no se retoque, el
aviso al añadir una hoja a una secuencia retocada, la reconciliación (§5) y el
portapapeles. `CycleSettings` pierde tipo y patrón.

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
