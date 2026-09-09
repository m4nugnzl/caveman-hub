# Replanteamiento: UNA PUERTA — protocolos y formularios

> **Encargo (8 sep 2026).** «Respecto a protocolo y formulario, siento que son
> páginas demasiado relacionadas; no sé si tiene sentido que existan como
> existen actualmente o habría que darle una vuelta.»
>
> **Estado: ESTUDIO. Nada construido en `src/`.** Este documento mide lo que hay,
> nombra la costura y propone el corte. Las decisiones del §9 siguen abiertas.

---

## 1. La tesis

La sensación del dueño es correcta y tiene una causa concreta:

> **Las dos pantallas no son dos pantallas. Son una sola, partida por un eje que
> el modelo no respeta.**

El rediseño anterior dejó escrita la línea de corte —*«Formularios = el qué (sin
momento dentro); Protocolos = el a quién y el cuándo»*— y el código hace otra
cosa: **el «cuándo» está guardado dentro del formulario**. Ese campo es la
costura. Todo lo demás que molesta —las columnas que se repiten, los enlaces de
ida y vuelta, las dos tablas idénticas— cuelga de él.

---

## 2. Lo verificado en el código

Nueve hechos, con su sitio. Ninguno es una impresión.

### D1 — El momento vive dentro del formulario

`sanitizeFormulario` guarda `momento` como campo del propio objeto
(`domain/formularios.js:235-245`), y hay **cuatro formas de dato distintas según
el momento**: `alta` lleva la forma de `intakeForm`, `sesion` lleva
`{questions, custom}`, `semana` añade `checkin` y `weighIns`, y `libre` lleva
`elementos` (`defaultFormulario`, `formularios.js:159-171`).

No es una etiqueta: es el discriminante de un tipo suma. Por eso un formulario
**no se puede reutilizar** en otro momento, y por eso hacen falta dos
constructores.

### D2 — El protocolo solo acepta el formulario de su casilla

`resolveProtocolo` descarta cualquier formulario cuyo momento no coincida
(`domain/protocolos.js:253-255`), y `formulariosDe(preferences, momento)` filtra
la lista antes de ofrecerla (`formularios.js:294`). El desplegable del carril
hace lo mismo a mano: `formularios.filter((f) => f.momento === momento)`
(`ProtocolosPanel.jsx:703`).

### D3 — Y el momento también se deriva de la premisa: dos fuentes de verdad

`ProtocolosPanel.jsx:680`:

```js
const momento = accion.premisa === 'entrar' ? 'alta' : accion.premisa === 'sesion' ? 'sesion' : 'semana';
```

El protocolo **sabe** en qué momento cae la acción, por su premisa. El formulario
**también** lo dice, por su campo. Se comparan para ver si encajan. Cuando dos
sitios guardan el mismo hecho, uno de los dos sobra — y sobra el del formulario,
porque el momento no es una propiedad del cuestionario, es una propiedad de su
uso.

### D4 — La aplicación confiesa el corte por escrito

El hint del desplegable, `ProtocolosPanel.jsx:694`:

> «Qué formulario — **Se escribe en Formularios; aquí se elige cuál se usa.**»

Y otro igual en la línea 946: «El formulario — Se escribe en Formularios.» Una
pantalla que tiene que explicar dos veces que la otra mitad de lo que estás
haciendo está en otra pantalla no está describiendo una relación: está pidiendo
perdón por una frontera.

### D5 — Los dos viajes de ida y vuelta, reconstruidos a mano

- `FormulariosPanel.jsx:345` → `navigate('/protocolos', { state: { abrir: q.id } })`
- `ProtocolosPanel.jsx:211-213` → `navigate('/formularios', { state: { abrir: form.id, volver: { to: '/protocolos', abrir: abierto } } })`

El segundo **fabrica su propia vuelta atrás** porque el navegador no sabe volver
a un protocolo abierto. Un `volver` escrito a mano es la factura de una frontera
que no debería estar ahí.

### D6 — Cada panel importa el dominio del otro

| | importa de la otra mitad |
|---|---|
| `ProtocolosPanel` | `coachFormularios`, `cuentaPreguntas`, `formulariosToPreferences`, `agrupar` |
| `FormulariosPanel` | `coachProtocolos`, `agrupar` |

Las dos montan además `BandaTaller` y `MandarAlgo`. No hay una dirección de
dependencia: hay un ciclo.

### D7 — Las dos tablas son el mismo mueble

Mismo `.plantilla`, mismo `f-disco` + `.p-name.f-nombre`, mismos verbos de fila
(renombrar · duplicar · quitar), mismo `taller-pie` con recuento. Y las columnas
dicen lo mismo con otro nombre:

| `/protocolos` | `/formularios` | qué es |
|---|---|---|
| Protocolo | Formulario | el nombre |
| Qué lleva | Lleva | el contenido |
| Acciones | Cuándo | *(ver D8)* |
| Clientes | Lo piden | quién lo usa |

### D8 — La columna «Cuándo» repite el disco

`FormulariosPanel.jsx:287` pinta una columna «Cuándo» cuyo valor
(`MOMENTOS.find(...).corto`, línea 324) es exactamente el mismo dato que el disco
de color que hay treinta píxeles a la izquierda (`TONO_MOMENTO[f.momento]`). Es
la misma avería que ya se corrigió en la cinta de la Librería: **un rótulo que
repite lo que el vecino ya dice no informa, ocupa.** Estaba declarada como C-06
y sigue sin hacer.

### D9 — `/protocolos` ya aloja tráfico de formularios

El rótulo «Una vez» es `EnviosSeccion`: envíos de formularios. Y el docblock de
`Envios.jsx:18-30` ya escribió el argumento que este documento extiende:

> «Es la misma clase de cosa… se leen con la misma gramática —verbo, qué, a
> quién, cuándo— y **separarlos habría obligado a mirar en dos sitios para
> contestar una sola pregunta**.»

Ese argumento, aplicado una vez más, es la propuesta entera.

---

## 3. Lo que NO está roto

Para no tirar lo que funciona:

- **La gramática del banco de acciones** (premisa como rótulo, verbo + sujeto en
  el renglón, carril con el control real) es buena y no se toca.
- **Los dos rótulos SIEMPRE / UNA VEZ** son correctos y se conservan.
- **La tabla del envío abierto** —una columna por pregunta— es la pantalla que
  nos distingue de Efort y de Coachway. Intacta.
- **`GuiaDeMedidas`** y el renglón que contiene su control real: intactos.

El problema no es cómo se ven las dos pantallas. Es que son dos.

---

## 4. La propuesta: una puerta, dos tramos

**Un destino en la barra —«Protocolo»— con dos tramos en la cinta:**

```
Tu taller
  ├── Protocolo        ← /protocolos  ·  /formularios
  ├── Librería         ← /ejercicios  ·  /alimentos     (precedente ya aceptado)
  ├── Plantillas
  └── …
```

```
┌──────────────────────────────────────────────────────────────────┐
│  Protocolo      [ Cómo trabajas ] [ Formularios 6 ]     + Mandar │  ← BandaTaller
├──────────────────────────────────────────────────────────────────┤
│  SIEMPRE                                                          │
│  ▸ Fuerza 3 días        Alta · parte · check-in     9      12     │
│  ▸ Solo nutrición       Alta · check-in             5       4     │
│                                                                   │
│  UNA VEZ                                                          │
│  ▸ Hábitos de sueño     14 · etiqueta «online»   4 sep  ███░ 9/14 │
└──────────────────────────────────────────────────────────────────┘
```

**Por qué esta forma y no otra:**

1. **El precedente existe y lo aprobó el dueño.** La Librería son dos rutas en
   una fila de la barra, con `also` en `COACH_TALLER` manteniendo la fila
   encendida en las dos. `BandaTaller` ya soporta tramos y ya sabe no pintarlos
   cuando hay uno solo. No hay pieza nueva de chasis.
2. **Once filas fijas siguen siendo once**, porque la fila que se va es la que se
   funde con la otra. La barra no crece.
3. **La ida y la vuelta desaparecen**: editar el formulario de una acción es
   cambiar de tramo, no navegar a otra ruta con un `volver` inventado.

### Lo que se hace en cada tramo

| tramo | qué es | qué contesta |
|---|---|---|
| **Cómo trabajas** | protocolos (SIEMPRE) + envíos (UNA VEZ) | *a quién y cuándo* |
| **Formularios** | la biblioteca de cuestionarios | *el qué* |

Y en el tramo de formularios, **fuera la columna «Cuándo»** (D8). En su lugar,
«Dónde se usa», con una sola voz para las dos clases de uso: «Fuerza 3 días ·
Solo nutrición», o «3 envíos», o «Nadie lo pide».

---

## 4-bis. Los dos tramos no valen — y el motivo no es de gusto

> **Veredicto del dueño:** «Me parece bien la idea, aunque no sé si me termina de
> gustar que sean 2 elementos en la cabecera.»

Tiene razón, y hay una regla detrás. **En esta casa los tramos de la cinta parten
UNA lista:** «Ejercicios» y «Alimentos» son las dos mitades de la Librería, y los
de `PlantillasPanel` las dos mitades de sus plantillas. El propio docblock de
`BandaTaller` lo dice al revés —«un carril de una pestaña no es una navegación:
es un rótulo con caja»— y añade que la cinta del cliente sí lleva destinos «y a
propósito», porque allí son destinos.

«Cómo trabajas» y «Formularios» no son dos mitades de nada: son **dos objetos
distintos**. Ponerlos en tramos es meter navegación en la cabecera, que es el
trabajo de la barra lateral. La cinta acabaría además con nombre + dos tramos +
dos verbos, contra «una pantalla, una acción primaria».

### Las tres formas, y lo que cuesta cada una

| | la cabecera | la biblioteca | cuesta |
|---|---|---|---|
| **A · Dos tramos** | nombre + 2 tramos + 2 verbos | su propio tramo | la objeción de arriba |
| **B · Una hoja** | un nombre y sus verbos | tercer rótulo del cuerpo | un scroll |
| **C · Sala** | un nombre y sus verbos | capa sobre la hoja | menos visible |

**Recomendada: B — una hoja, tres rótulos.** SIEMPRE · UNA VEZ · **LO QUE
PREGUNTAS**. Motivos, en orden:

1. **No inventa mecanismo.** La pantalla ya tiene dos rótulos; esto añade uno.
2. **El contenido tiene techo.** `MAX_PROTOCOLOS = 6` y `MAX_FORMULARIOS = 20`:
   el peor caso son ~26 filas y lo normal, doce. No es la cartera ni la Librería,
   que crecen sin límite — por eso allí sí hacen falta tramos y aquí no.
3. **Contesta la objeción entera**: la cabecera vuelve a ser un nombre y su verbo.

Lo que roza: «la lista es una caja que llena el alto» (de [aire de las hojas]) —
aquí son tres cajas y la tercera nace fuera de pantalla. Es el precio, y es
menor que meter navegación en la cinta.

**C queda como alternativa** si al usarlo el scroll molesta: la biblioteca como
capa, que es la ley que el producto ya sigue en «Cómo va el bloque». Su coste es
que hay que saber que está.

---

## 4-ter. La pregunta buena: desde dónde se dispara

> **Dueño:** «Lo que creo que me gustaría es desde la cartera poder mandar
> formularios de forma sencilla, integrar mejor todo este tipo de mecanismos que
> añadimos en el sistema.»

Esto reordena el estudio entero. La puerta y los tramos son **dónde vive** el
material; esto es **desde dónde se usa**, y pesa más.

### D10 — «Mandar algo» está encerrado en el Taller

`MandarAlgo` se monta en exactamente dos ficheros, los dos del Taller:
`ProtocolosPanel.jsx:446` y `FormulariosPanel.jsx:253`. Desde la cartera no se
llega. Desde la ficha, tampoco.

### D11 — Y el dominio documenta un viaje que nunca se cableó

`envios.js:100-112`, el docblock de `AUDIENCIAS`, escrito con todas las letras:

> «`marcados` es la primera porque es la que trae el gesto: **se llega aquí desde
> la cartera con gente marcada**, y la barra de lote ya existía —solo sabía
> avisar, etiquetar y pausar—.»

La primera audiencia se llama **«A los que marqué»**. El único sitio de la
aplicación donde se marca gente es la cartera. Y `AccionesEnLote`
(`ClientPortfolio.jsx:380`) ofrece *Enviar aviso · Etiquetar · Pausar*. El
enchufe existe, tiene el nombre del gesto, y nadie lo conectó.

### D12 — Tres formas distintas de darle algo a alguien

| | dónde | qué manda | dónde cae |
|---|---|---|---|
| `MandarAlgo` | Taller | formulario, documento, vídeo, casilla | `client_forms` / `intake.custom` |
| `AvisoSheet` | cartera (lote) | una nota | `preferences.updates.note` — **el nuevo sustituye al anterior** |
| `MandarleAlgo` | ficha del cliente | texto + enlace | `intake.custom` |

Tres modelos, tres vocabularios, y **solo el primero sabe mandar un
formulario** — que es justo lo que el dueño quiere hacer desde la cartera.

### Lo que se hace

- **P-01 · El verbo entra donde está el gesto. ✅ CONSTRUIDO (8 sep).**
  «Mandar algo» es el primario de `AccionesEnLote`, con los marcados ya puestos.
  `MandarAlgo` gana la prop `preseleccion`: con ella **el paso «A quién»
  desaparece** —quedan dos— y los destinatarios se quedan a la vista en los dos
  que quedan (`.wiz-ya`), porque un asistente que se salta una pregunta y no
  enseña la respuesta decide a espaldas de quien lo usa. Es la misma inversión
  que ya hacía `formulario` por el otro extremo.
  · La lista de formularios deja de ser un `<select>` nativo y pasa a la misma
    gramática de opciones que el paso «Qué», con lo que lleva cada uno.
  · Nuevo: **un mensaje del entrenador** (`MAX_NOTA = 280`), congelado en el
    esquema del envío y leído por el cliente antes de las preguntas
    (`.libre-recado`). Sin migración: `schema` ya es `jsonb`.
  · El diálogo se carga **perezoso** desde la cartera (chunk de 9,9 kB), como
    las capas de `CoachLayout`: la cartera va en el arranque y esto se abre de
    vez en cuando.
- **P-02 · La ficha usa el mismo diálogo** con un solo marcado, y muere el
  `MandarleAlgo` de `ClientSettings.jsx:255`, que no sabe mandar formularios.
- **P-03 · El aviso deja de ser un tercer mecanismo** y pasa a ser un
  `QUE_MANDAR` más, con su audiencia y su cuándo. *Decisión pendiente:* hoy un
  aviso nuevo sustituye al anterior; como envío, no debería.
- **P-04 · Lo mandado vuelve.** Qué espera cada cliente se lee en la cartera y en
  su ficha, sin entrar al Taller.

**Y esto cambia el orden del plan.** P-01 es más barato que el paso 1 del §5 y
vale más para el día a día: **va primero**. El §5 se ejecuta después, y con P-01
hecho la pregunta de la cabecera pierde casi toda su carga — la biblioteca deja
de ser un sitio al que se va, y pasa a ser un sitio en el que se entra a
escribir.

---

## 5. El corte de verdad: tres pasos

La puerta sola es maquillaje si el modelo sigue diciendo otra cosa. El orden
importa, y dos de los tres están medio hechos.

### Paso 1 — La puerta *(barato, reversible)*

- `COACH_TALLER`: una fila «Protocolo» con `also: ['/formularios']`.
- La cinta lleva **un solo nombre y sus verbos** (variante B del §4-bis);
  `BandaTaller` se queda como está, sin tramos. `/formularios` deja de montar su
  propia banda y su tabla pasa a ser el tercer rótulo del cuerpo.
- Fuera la columna «Cuándo»; «Lo piden» y «Clientes» con una sola voz.
- Los dos `navigate` cruzados dejan de existir; muere el `volver` escrito a mano.

**No toca dominio. No toca datos. No hay migración.**

### Paso 2 — El alta al lienzo *(medio)*

El parte y el check-in ya son `elementos` desde la tanda 2 (`elementosDe` /
`desdeElementos`). **El alta es el único que se quedó con su forma vieja**, y por
eso sobreviven dos constructores: `ConstructorFormulario` (1.012 líneas) y
`ConstructorLibre` (712).

Llevar el alta a `elementos` deja **un solo constructor** y borra ~1.000 líneas.
Riesgo real y acotado: las respuestas del alta caen en `clients.profile` por
campo (`set_client_profile`, 0080), así que el puente de lectura tiene que
sobrevivir intacto — igual que sobrevivió para el parte y el check-in.

### Paso 3 — El momento sale del formulario *(el corte)*

`momento` deja de ser campo del formulario y pasa a ser **propiedad del uso**: lo
dice el protocolo (en qué casilla lo pone) o el envío (que no tiene casilla).

Lo que se gana:

- Un formulario **se puede reutilizar**: el mismo cuestionario de sueño como
  paso del alta *y* como envío suelto, sin duplicarlo.
- `/formularios` pasa a ser de verdad una biblioteca —el qué—, y `/protocolos`
  de verdad el a-quién-y-el-cuándo. La tesis escrita y el código dicen lo mismo
  por primera vez.
- Mueren `formulariosDe(preferences, momento)`, el filtro de `resolveProtocolo`
  y la línea 680 que deriva el momento de la premisa.

Y entonces los dos tramos son **honestamente distintos**: uno tiene artefactos,
el otro tiene planes. Que es la única razón buena para que sean dos tramos y no
una sola lista.

---

## 6. Lo que NO propongo

**Fundirlos en una sola tabla.** Un protocolo y un formulario no son la misma
clase de objeto: uno es un plan y el otro un artefacto. Meterlos en la misma
lista es el error contrario al de ahora, y produciría una tabla con columnas
vacías en la mitad de las filas.

**Meter los formularios dentro de cada protocolo.** Se perdería la biblioteca
—que es justo lo que el paso 3 viene a construir— y un formulario compartido por
dos protocolos no tendría casa.

---

## 7. Riesgos declarados

| riesgo | dónde | mitigación |
|---|---|---|
| `sanitizeFormulario` fuerza cualquier momento desconocido a `alta` (`formularios.js:235`) | paso 3 | mudanza silenciosa: sin momento, el uso lo decide |
| Tope de 8 KB en `preferences` (0008) | pasos 2-3 | `MAX_ELEMENTOS = 24` ya acota; medir antes |
| `COMPARED_KEYS` — hay una prueba que vigila toda clave nueva de `protocol` | paso 3 | entra en el mismo commit |
| `matchesTemplate` / `necesitaSuPlan` comparan contra el plan **resuelto** | paso 3 | pruebas antes que pantalla, como en la vuelta anterior |
| El alta siembra el protocolo con funciones puras (`newClientPreferences`, `planDe`) | paso 2 | la biblioteca sigue en `preferences`, no en tabla — decisión ya tomada (opción B, cabecera de la 0099) |
| Consumidores del portal (`IntakeQuestions`, `SessionFeedback`, revisión) | pasos 2-3 | todos pasan por `checkinQuestions`/`activeQuestions`: el puente los protege |

---

## 8. Lo que cuesta, dicho en voz alta

- El paso 1 no tiene coste de datos y se puede deshacer en una tarde.
- El paso 2 borra más líneas de las que escribe, pero toca el alta, que es la
  pantalla que más consumidores tiene.
- El paso 3 es el único que cambia lo guardado. Es también el único que hace que
  la pregunta del dueño deje de tener respuesta.

---

## 9. Las decisiones que esperan al dueño

1. **¿La puerta se llama «Protocolo», «Tu método» o se queda «Protocolos»?**
   Recomendado: **«Protocolo»**, singular — es el nombre del oficio, y el plural
   ya lo dice la tabla.
2. **¿B (una hoja, tres rótulos) o C (la biblioteca como sala)?**
   Recomendado: **B**, por el §4-bis. A queda descartada.
3. **¿Se ejecutan los tres pasos seguidos, o solo el 1 y se mide?**
4. **En el paso 3, ¿un formulario puede estar en dos casillas del mismo
   protocolo** (p. ej. el mismo cuestionario al entrar y a las 8 semanas)?
   Recomendado: **sí** — es lo que hace que la biblioteca valga.

---

Ver también: `docs/replanteamiento-protocolos-y-formularios.md` (1ª y 2ª vuelta),
`docs/replanteamiento-formularios-y-envios.md` (3ª vuelta, envíos y formulario
libre), `docs/replanteamiento-del-taller.md` §4.
