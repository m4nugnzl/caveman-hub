# Replanteamiento · Lo guardado

**10 sep 2026.** El dueño, probando la mano con un bloque dentro:

> *«Respecto al portapapeles, aún sigo sin poder copiar los bloques en
> plantilla; creo que ese tipo de cosas habría que replantearlas.»*

La queja es de una forma que falta. Lo que se replantea aquí es **el estante**:
no «dónde meto los bloques», sino qué es el material guardado del entrenador,
por qué está repartido en cinco sitios con tres leyes distintas y qué hace falta
para que añadir una forma cueste una fila y no una pantalla.

La quinta vuelta de `estudio-portapapeles.md` (§26-30) ya propuso un cajón de
bloques y lo dejó con una decisión abierta —preferencias o tabla—. Esa vuelta
sigue siendo válida en lo suyo; este documento la mete dentro de una pregunta
más grande, que es la que el dueño acaba de hacer.

---

## 1. Lo que hay hoy, contado

Todo verificado en el código, no de memoria:

| Material | Dónde vive | Puerta | ¿Se edita? | ¿Del equipo? |
|---|---|---|---|---|
| Ejercicios | tabla `exercises` (0006) | Librería | Sí | **Sí** |
| Alimentos | tabla `foods` (0006) | Librería | Sí | **Sí** |
| Formularios | `preferences.formularios.items` | Formularios | Sí | No |
| Protocolos | `preferences.protocolTemplate` y su lista | Protocolos | Sí | No |
| **Días** (piezas) | `preferences.piezas.items` | Plantillas · Días | **No** (renombrar y tirar) | No |
| **Platos** | `preferences.platos.items` | Plantillas · Platos | **No** (renombrar y tirar) | No |
| **Bloques** | — | — | — | — |

Tres leyes distintas para la misma clase de cosa —*tu criterio, guardado para
reutilizarlo*—: tabla del equipo y editable; preferencias y editable;
preferencias y solo de mirar. Y una fila vacía, que es la del dueño.

---

## 2. Cinco averías, con su evidencia

### A-1 · La bandeja lleva seis formas y el archivo acepta dos

`lib/portapapeles.js:90` sabe copiar **ejercicio, hoja, bloque, comida, día de
dieta y dieta**. `ManoDelPortapapeles.jsx:292`:

```js
const tieneCajon = (tipo) => tipo === TIPO.HOJA || tipo === TIPO.COMIDA;
```

Y en `:356` ese booleano es la condición de que salga «Guardar». O sea: **no es
que guardar un bloque falle, es que el verbo no existe**. El dueño no está
tropezando con un fallo; está mirando un hueco.

Está incluso escrito al lado (`:238`): *«Un bloque o un menú entero no tienen
dónde ir —abrir cajón para ellos es una biblioteca de programas, que es otra
pieza de producto— así que el verbo no sale, en vez de salir y fallar.»* La
decisión fue honesta. La pieza de producto es la que ahora se pide.

### A-2 · Lo que no tiene cajón es lo caro

Un día suelto se rehace en cinco minutos. Un bloque son cuatro a ocho hojas con
sus seis ejercicios y sus cuatro series: **el trabajo de una tarde, y lo único
que un entrenador reconoce como suyo de verdad**. La biblioteca guarda lo barato
y tira lo caro cada vez que se cambia de cliente.

### A-3 · El sitio de las dos que existen no aguanta la tercera

`preferences` se lee **entera** al arrancar (`useCoachPrefs.js:47`) y se
**reescribe entera** en cada guardado de sección (`:125`). Medido en la quinta
vuelta: un bloque realista son **7,6 KB**; uno de ocho hojas, 15 KB; veinte
bloques, **152 KB**. Con la biblioteca ahí dentro, tocar un interruptor del
panel reescribe la biblioteca de programas.

Y no se comparte con el equipo, cuando ejercicios y alimentos sí desde la 0006.

### A-4 · La pantalla está escrita como «una de dos», no «una de muchas»

`PlantillasPanel.jsx` bifurca **once veces** por `enDias` —cabecera, columnas,
vacío, resumen, lo que se ve al abrir, el rótulo de renombrar, el aviso de
tirar—. Añadir bloques no es añadir un tramo: es **once ternarios que pasan a
tener tres ramas**, y a la cuarta forma, cuatro.

Ésta es la avería que el dueño intuye cuando dice «ese tipo de cosas». La forma
de la pantalla es la razón de que la siguiente forma sea cara.

### A-5 · El verbo «Guardar» del portapapeles no lo usa nadie

`registrarDestino` acepta `verbo` desde que se escribió, y su docblock dice para
qué: *«Los cajones dicen "Guardar": escribir en el trabajo de alguien y guardar
en tu biblioteca no son la misma acción y no pueden llamarse igual»*
(`lib/portapapeles.js:308`). Verificado: **no hay ni una llamada que lo pase**.
El contrato está construido y esperando a que exista un cajón que lo use.

---

## 3. La tesis: lo que se copia se guarda, y lo que se guarda vuelve a la mano

La pieza que hace todo esto barato ya está construida y casi nadie la ha visto:
**`/plantillas` no coloca nada; copia al portapapeles** (`PlantillasPanel.jsx:9`
importa `copiar as copiarAlPortapapeles`). Y la mano ya sabe dónde cae cada
forma, porque cada pantalla se registra como destino.

De ahí sale la frontera limpia:

> **El cajón no sabe poner. Sabe guardar y sabe devolver a la mano.**
> Dónde cae cada cosa es asunto de la pantalla que la recibe, y eso ya funciona.

Con eso, **añadir una forma al cajón cuesta tres cosas**: cómo se limpia al
guardarla, cómo se resume en una línea y qué se ve al abrirla. Nada de rutas,
nada de selectores de cliente, ningún «poner» nuevo. Lo demás lo pone la mano.

Y la consecuencia que ordena el modelo: **lo guardado y lo copiado son la misma
carga**. Una plantilla es una pieza del portapapeles con nombre y sin caducidad.

---

## 4. La forma: un solo cajón, con la llave de la bandeja

`domain/cajon.js`, una sola pieza guardada:

```js
{ id, kind, name, savedAt, carga }
```

- `kind` es uno de `TIPO` — el mismo vocabulario que el portapapeles, no un
  segundo juego de nombres.
- `carga` es exactamente lo que viaja en la bandeja, ya limpio.

Y una tabla, que es donde vive lo que hoy está repartido por once ternarios:

```js
const CAJONES = {
  [TIPO.BLOQUE]: { tramo: 'Bloques', tope: 20, limpiar, resumen, dentro },
  [TIPO.HOJA]:   { tramo: 'Días',    tope: 30, ... },  // hoy `domain/pieces`
  [TIPO.COMIDA]: { tramo: 'Platos',  tope: 40, ... },  // hoy `domain/platos`
};
```

`tieneCajon` deja de ser un `if` con dos tipos escritos a mano y pasa a ser
`kind in CAJONES`. Los tramos de `/plantillas` se sacan de ahí. `pieces.js` y
`platos.js` no se tiran: sus funciones de limpieza y resumen son las que entran
en la tabla, que es lo que ya hacen bien.

**Las dos leyes que se conservan tal cual**, porque ya están decididas:

- *Ids nuevos al guardar y al poner* (`domain/pieces`, `domain/platos`): dos
  clientes no pueden acabar compartiendo el id de un ejercicio.
- *Poner despliega, no enlaza*: editar la plantilla después no toca lo que ya
  salió de ella. Es como se comporta el resto del producto.

---

## 5. Dónde vive: la tabla del equipo

**Recomendación: tabla `coach_templates`, del equipo**, con el patrón de
`client_forms` (0099): `team_id`, RLS **y GRANT** (la política decide qué filas;
el GRANT, si se puede mirar la tabla — ver el 403 invisible de
`politicas-rls-sin-grant`).

Tres razones, y la tercera es la que decide:

1. **Tamaño**: A-3. Un bloque no cabe en una columna que se reescribe entera.
2. **Equipo**: ejercicios y alimentos son del equipo desde la 0006. Que la lista
   de ejercicios se comparta y el programa montado con ellos no, sería la
   excepción rara.
3. **Y el contraargumento del 0099 aquí no aplica.** Aquella migración dejó los
   formularios en `preferences` por un motivo concreto y escrito:
   `newClientPreferences`, `resolveProtocolo` y `planDe` son funciones **puras**
   que el alta llama para sembrar el protocolo, y con la biblioteca en una carga
   asíncrona el alta puede sembrar a medias. Verificado: **`piecesOf` y
   `platosOf` no se llaman desde ninguna función pura ni desde el alta** — solo
   desde seis pantallas. Días, platos y bloques no tienen esa atadura.

### La migración, con su reflejo

`0112_el_cajon_del_entrenador.sql`, aditiva y del estilo de la 0111:

- crea `coach_templates` con RLS y GRANT;
- **copia** los `preferences.piezas.items` y `.platos.items` que ya existan a
  filas de la tabla;
- y **no borra** las claves de `preferences`. Una versión anterior de la
  aplicación sigue leyendo lo que ya tenía —congelado, pero no vacío ni falso—,
  que es el mismo trato de la 0111.

Se despliega **antes** que el código. Retirar las claves viejas es una segunda
migración, más adelante y aparte.

**Alternativa barata, por si se prefiere ver antes de migrar**: bloques en
`preferences.bloques.items`, como piezas y platos. Es defendible como primer
paso —`domain/platos.js` deja escrito que el salto a tabla «es una migración
posterior que lee ESTE MISMO módulo»— pero es un paso que **hoy ya se sabe que
hay que deshacer**, y con lo más pesado del producto dentro.

---

## 6. Qué formas tienen cajón y cuáles no

| Forma | ¿Cajón? | Por qué |
|---|---|---|
| **Bloque** | **Sí** | Es el que falta y el que se pide. |
| **Hoja** (día) | Sí | Ya lo es: Plantillas · Días. |
| **Plato** (una ración) | Sí | Ya lo es: Plantillas · Platos. Desde la **0114** su `kind` se llama `plato` y no `comida`; ver §12. |
| Comida (con sus alternativas) | **No** | Una comida son varias raciones. Cuál se guarda lo dice quien copia, no el cajón replegándose a `options[0]`. |
| Ejercicio | **No** | Ya tiene biblioteca propia **y editable**: la Librería. Un cajón de ejercicios sería una segunda lista de ejercicios, con dos verdades. |
| Día de dieta | Todavía no | El modelo de la dieta acaba de cambiar (0111, los días y el reparto semanal). Se guarda un día de dieta cuando su forma pare de moverse, no antes. |
| Dieta entera | No | Es *el plan de una persona*, y es la única pieza que **sustituye** en vez de añadir (`lib/portapapeles.js:96`). Lo que de verdad se querría guardar de ella son sus días. |

---

## 7. Los gestos, con la frontera de siempre

**Guardar** — tres sitios, un solo verbo:
- desde **la mano**, con `/plantillas` abierto y el verbo «Guardar» que ya
  acepta `registrarDestino` (A-5);
- desde el **menú de la fila** de `ListaDeBloques`, junto a «Mandarlo a otros
  clientes…», que es donde se ve cuál fue el bloque que funcionó;
- y desde la hoja y la comida, como hoy.

**Ver** — `/plantillas`, con los tramos sacados de `CAJONES`. La ley de la
pantalla no cambia: *aquí se mira*. Ni se compone ni se elige cliente.

**Poner** — copiar al portapapeles y pegarlo donde la pantalla lo ofrezca. Los
destinos del bloque ya están construidos (tanda A de la quinta vuelta): la
lista de bloques, el «+ bloque» y el vacío del cliente sin programa.

**Poner en varios** — `MandarBloque` desde la plantilla, que es el mismo panel
con otro origen.

---

## 8. Lo que este replanteamiento NO propone

- **No mueve formularios ni protocolos.** Tienen una razón escrita para estar en
  `preferences` (0099) y esa razón sigue siendo cierta.
- **No hace editable `/plantillas`.** Editar un bloque es el Compositor, que es
  una pantalla entera y necesita un cliente delante.
- **No toca la Librería.** Ejercicios y alimentos son otra cosa: material, no
  criterio montado.
- **No añade «microciclo».** `lib/portapapeles.js:77` dice por qué no cabe en el
  modelo desde que el plan vive en el bloque.
- **No retira todavía «traer de otro cliente».** Es la tanda C de la quinta
  vuelta (B-09) y se sostiene sola.

---

## 9. Las decisiones, tomadas

El dueño las resuelve el mismo 10 de septiembre, las dos por la recomendación:

| | Pregunta | **Decidido** |
|---|---|---|
| **D-1** | ¿Un cajón para todo o un cajón por forma? | **Uno**, con `kind`. La alternativa era un tercer módulo de 60 líneas casi idénticas y once ternarios más. |
| **D-2** | ¿Tabla del equipo o `preferences`? | **Tabla del equipo**, con su migración y su reflejo. La barata de §5 queda descartada. |
| **D-3** | ¿Días y platos migran, o conviven? | **Migran** (se sigue de D-1 y D-2): un solo cajón en un solo sitio. |
| **D-4** | ¿Entran los de dieta ahora? | **No todavía** (§6). |
| **D-5** | ¿El bloque se guarda desde la fila, desde la mano, o los dos? | **Los dos.** Son los dos momentos en que se sabe que ése era el bueno. |

---

## 10. El plan, en cuatro tandas

**Tanda 1 · El cajón** *(nada visible cambia)* — **HECHA**
- **G-01** `domain/cajon.js`: la forma de §4 y la tabla `CAJONES`, con las
  funciones de `pieces.js` y `platos.js` dentro.
- **G-02** Migración `0112`: tabla, RLS, GRANT y la copia de lo que ya hay.
- **G-03** La lectura y la escritura del cajón, con el reflejo a `preferences`.
- **G-04** `PlantillasPanel` deja de bifurcar por `enDias` y lee de `CAJONES`.

**Tanda 2 · Los bloques dentro** *(es lo que el dueño pide)* — **HECHA**
- **G-05** «Guardar en plantillas» en la fila de `ListaDeBloques`.
- **G-06** El verbo «Guardar» de la mano, con `/plantillas` delante.
- **G-07** Tramo «Bloques» en `/plantillas`, con su resumen y su «qué lleva
  dentro».
- **G-08** Copiar una plantilla de bloque a la mano y pegarla donde ya se pega.

**Tanda 3 · Las puertas**
- **G-09** Cuarta puerta del Compositor: «Desde una plantilla tuya».
- **G-10** `MandarBloque` desde una plantilla (PP-05 con otro origen).

**Tanda 4 · La limpieza**
- **G-11** Retirar la opción de entrenamiento de `CopyToClientPanel` (B-09) y
  rehacer el vacío del cliente nuevo.
- **G-12** Segunda migración: retirar `piezas` y `platos` de `preferences`.

Cada tanda se puede parar y lo anterior sigue en pie. La 1 no cambia nada de lo
que se ve; la 2 es la queja.

---

## 11. AL DÍA (11 sep 2026): tandas 1 y 2, construidas

La **0112 está desplegada** (comprobado contra el proyecto: `coach_templates`
contesta; `client_forms` de la 0099 sigue **sin aplicar**, que es otro asunto).
Con ella aplicada se cerró lo que estaba esperándola.

### Lo que se movió, y una cosa que el plan no decía

El plan hablaba de G-04 como «que `/plantillas` lea de `CAJONES`», y eso solo es
la mitad. Los días y los platos tenían **cinco** puertas en `preferences`, no
una, y mudar la vitrina sin mudar las otras cuatro habría partido el material en
dos: lo guardado desde el bloque no habría vuelto a salir en `/plantillas`.

Mudados a la vez:

| Dónde | Qué hacía | Ahora |
|---|---|---|
| `PlantillasPanel` | leía `piecesOf` / `platosOf` | lee `guardadosDe(cajon, kind)` y se describe con `CAJONES` |
| `WorkoutLogEditor` | `buildPiece` + `updateCoachPreferences('piezas')` | `useGuardarEnPlantillas` |
| `Compositor` | `piecesOf(coachPrefs)` | `comoLista(cajon, TIPO.HOJA)` |
| `NutritionModule` | `buildPlato` + `updateCoachPreferences('platos')` | `useGuardarEnPlantillas` |
| `NutritionModule` | `platosOf(coachPrefs)` | `comoLista(cajon, TIPO.COMIDA)` |

`guardarEnPlantillas.js` deja de tener una rama por forma —el mismo tope, el
mismo desempate de nombre y el mismo aviso escritos dos veces— y pasa a ser el
gesto de las **tres puertas**: la fila de `ListaDeBloques`, la ficha de la mano y
`/plantillas` al llegar con algo copiado. Es asíncrono desde aquí: el cajón es
una tabla, y guardar puede fallar.

### Dos cosas que se descubrieron al construir

- **El nombre no viajaba de vuelta.** `comoPiezaDelPortapapeles` metía el nombre
  en `carga.name`, y `pegarHoja` lee `carga.dayName || 'Hoja'`. Guardar un día y
  volver a ponerlo lo habría bautizado «Hoja». Ahora la clave la dice la forma
  (`alaMano` en `CAJONES`), y hay prueba.
- **`CajonDeMaterial.jsx` no lo monta nadie.** Es el cajón del bloque de antes
  del rediseño de Entreno; `piezas` en `WorkoutLogEditor` solo servía ya para
  contar contra el tope. Ponerlo se hace hoy solo desde el Compositor. No se ha
  tocado: es otra decisión.

### Lo que queda

Tandas 3 y 4 sin tocar. Y de la 4, **G-12 ya se puede plantear**: no queda
ninguna escritura a `preferences.piezas` ni `.platos`; lo único que sigue
leyéndolas es el puente de `useCajon` para cuando la tabla no contesta.

---

## 12. AL DÍA (10 sep 2026): el `kind` del plato deja de mentir

El cajón declara que **`carga` es exactamente lo que viaja en la bandeja**, y
para los platos eso no era cierto: la 0112 los guardó con `kind = 'comida'`
—`{ foods }`— mientras que `TIPO.COMIDA` del portapapeles lleva
`{ name, options[] }`. Dos cosas distintas con el mismo nombre, y de ahí colgaba
`alaMano: null`: un plato no podía volver a la mano porque soltarlo donde va una
comida habría pegado otra cosa.

Con `TIPO.PLATO` en el portapapeles la ración tiene forma propia y las tres cosas
se cierran a la vez: el `kind` vuelve a decir la verdad (**migración 0114**, un
UPDATE de una columna: la carga ya era la buena), `alaMano` pasa a `'name'` y un
plato guardado se pone en cualquier comida de cualquiera, cuadrado a su objetivo.
`FORMAS` sigue teniendo tres entradas, y la cuarta que venga sigue costando una
línea de `CAJONES` — que era la tesis de §4.

El detalle, en `docs/estudio-portapapeles.md` §48-52.

De las tandas de §10 siguen sin tocar la **3** (G-09, G-10) y la **4** (G-11,
G-12).
