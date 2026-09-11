# EL PROTOCOLO Y LAS AUTOMATIZACIONES · la versión

> Continúa `docs/replanteamiento-protocolo-y-automatizaciones.md` (el estudio del
> 10 sep). Aquel diagnosticó; **éste define**. Es la versión que se construye:
> qué son las dos herramientas, cómo se llaman las cosas, qué pantalla tienen,
> qué guarda la base y en qué orden se hace.
>
> **Estado: las cinco decisiones del §10 en pie, las dos preguntas contestadas
> (§10.1) y las CUATRO TANDAS construidas — 1 (§11), 2 (§12), 3 (§13) y 4 (§14).
> Quedan dos veredictos del dueño: el §12.4 y el §14.7.**

---

## 0. Las dos herramientas, en dos frases

> **El protocolo es una forma de trabajar con nombre: qué le llevas a alguien y
> cómo es su app.**
>
> **La automatización es una cosa que le pasa sola: un disparador y unos pasos
> con su desfase.**

Un protocolo **tiene** automatizaciones. Ésa es toda la relación entre las dos, y
por eso viven en la misma puerta y en la misma pantalla.

---

## 1. El corte, que es lo que arregla el encargo

El protocolo de hoy mezcla dos naturalezas y por eso ni se ve ni se entiende:

| | **Cómo es su app** | **Qué le pasa** |
|---|---|---|
| Qué es | un **estado** | **hechos en el tiempo** |
| Piezas de hoy | `services`, `modules`, `hidden` | `intake.steps`, `schedule`, `alertDays`, `forms` |
| Se… | **configura** | **automatiza** |
| Vive en | una caja de la derecha | el carril de la izquierda |
| Al cambiarla | no toca a nadie hasta «Poner al día» | corre en vivo para lo que aún no ha corrido |
| Excepción de una persona | copia suya, distinta de la plantilla | apagarle esa automatización a ella |

**Esto contesta la mitad literal del encargo.** El interruptor de equivalencias de
la dieta **no se mueve de la dieta**: está bien puesto, se echa en falta ahí. Lo
que pasa es que es de la columna izquierda —«cómo es su app»— y esa columna no
tenía dónde leerse entera. Ahora la tiene, y el interruptor lleva su procedencia.

---

## 2. HERRAMIENTA 1 · El protocolo

### 2.1 El modelo

```
Protocolo  «Nutrición · 12 semanas»
  ├─ Qué le llevas       entreno · dieta · seguimiento          (services)
  ├─ Cómo es su app      qué piezas ve, qué cifras no le vuelven (modules, hidden)
  └─ Qué le pasa         n automatizaciones                      → herramienta 2
```

Nada de esto es modelo nuevo salvo la tercera línea. Las dos primeras son
`domain/protocol.js` tal cual, con un rótulo honesto encima.

### 2.2 Dónde se ve y dónde se toca

**Se ve en la ficha de la persona.** Perfil gana una tarjeta más de su rejilla,
con la gramática de «Su alta» y «Su carpeta»:

```
  Su protocolo                                    Nutrición · 12 semanas
  Entreno y dieta · ve equivalencias · 4 cosas le pasan solas
```

Perfil y no Resumen: **Resumen es lo que cambia solo** (entrenó, pesó, contestó);
**Perfil es lo que lleva puesto**, y el protocolo lo cambias tú. Es información,
no receta: dice qué lleva, no propone cambiarlo.

**Se toca desde dos puertas**, no tres ni cuatro: esa tarjeta y el «···» de la
cartera. Las dos abren **la misma hoja**, que se parte en las dos mitades del §1.

**Y las bocas de siempre se quedan**, diciendo de dónde vienen. El interruptor de
la dieta y los del ciclo en Entreno llevan ahora un pie —«De su protocolo»— con
la puerta a la hoja. Un interruptor que declara una excepción sin decirlo es el
D4 del estudio, y se arregla con una línea de texto, no quitándolo.

### 2.3 La excepción, dicha en una frase

Hoy una excepción es «su copia se ha separado de la plantilla». Con el corte del
§1 se dice mejor, y de dos formas distintas porque son dos cosas distintas:

- **De su app:** «Marta ve las equivalencias y su protocolo no» → «Poner al día»
  se lo quita, salvo que esté protegida.
- **De lo que le pasa:** «A Marta le tienes apagada *Al entrar*» → es un
  interruptor en su hoja, y nada se lo vuelve a encender solo.

### 2.4 Qué muere

Muere la columna de conmutadores como forma de contar lo que le pasa a alguien.
Los conmutadores que sobreviven son los de la mitad de arriba, y **ninguno de
ellos entra en el carril**: dibujar un ajuste como nodo sería la mentira
contraria a la de hoy.

---

## 3. HERRAMIENTA 2 · Las automatizaciones

### 3.1 El modelo

```
Automatización
  nombre?        opcional; por defecto, la frase de su disparador
  activa         un interruptor, y solo uno
  disparador     { tipo, valor }          ← el catálogo del §3.2
  pasos[]        { dia: N desde el disparador, ...lo que `filasDeEnvio` ya sabe escribir }
```

**No lleva audiencia.** A quién le pasa lo contesta el protocolo en el que vive:
quien lo lleve puesto. Meterle una audiencia propia sería el tercer sitio donde
decir a quién, y este proyecto ya se ha comido ese error dos veces. Lo transversal
—«esto, a estos cinco, hoy»— **ya tiene su herramienta y no se toca**: «Mandar
algo», con sus `AUDIENCIAS`.

**La misma automatización en dos protocolos** se copia con **la mano**, como un
día de la dieta o un bloque. No hay biblioteca de automatizaciones: hay el gesto
que ya existe.

### 3.2 El catálogo de disparadores

Diez, y **los diez salen de un hecho que la base ya guarda**. Ni uno inventado.

| Disparador (como se lee) | El hecho | Motor |
|---|---|---|
| **Cuando empieza contigo** | `clients.start_date` | 1 |
| **Cada semana** | `schedule` (día · cada N) | 1 |
| **Cuando se la mandes tú** | el dedo | 1 |
| Cuando acepta la invitación | `client_profile_id` deja de ser NULL (0083) | 2 |
| Cuando contesta su alta | `client_actions.submitted_at`, momento alta (0105) | 2 |
| Cuando entrega su check-in | `check_ins` (0009/0060) | 2 |
| Cuando termina de entrenar | `workout_data` | 2 |
| Cuando se pesa | `anthropometry.history` | 2 |
| Cuando le entra un cobro | `client_payments` (0090) | 2 |
| **Cuando lleve tiempo sin…** | nada lo provoca: lo mira el latido | 3 |

**Motor 1** — se puede fechar por adelantado: la fila se escribe con su `due` y el
portal la enseña el día que toca (`vigente`, `envios.js:469`). **Cero
infraestructura, ya funciona.**

**Motor 2** — lo provoca el cliente, y el cliente no puede escribir en
`client_actions` (RLS 0105). **Tiene que correr en la base**: la función la llaman
al final las RPC de entrega que ya existen. No es una preferencia, lo decide la
seguridad.

**Motor 3** — no lo provoca nadie: lo hace el latido de las 07:00
(`wrangler.jsonc` → `worker.mjs` → la función `latido` → `correr_el_latido()`,
migración 0118). **Construido en la tanda 4, ver §14.**

**En la primera versión se ofrecen los tres del motor 1 y ninguno más.** Nada de
disparadores en gris con un candado: una oferta que no se puede pulsar es
mobiliario. *(La 2 añadió los dos del motor 2 y la 4 el del motor 3; los cuatro
del motor 2 que faltan siguen sin ofrecerse por lo mismo: no están escritos.)*

### 3.3 El catálogo de pasos: tres verbos

Los de la casa, no los de Coachway. Ellos ofrecen tipos de contenido (*chat ·
documento · vídeo · audio*) porque su destino es un chat; aquí no hay chat —el
trato va por WhatsApp, decidido y vigente— y el destino es su lista de pendientes.

| Verbo | Qué ofrece | Dónde cae |
|---|---|---|
| **Pídele** | un formulario · su peso · sus perímetros · sus pliegues · sus fotos · una tarea suya | `client_actions` |
| **Mándale** | un vídeo · un documento · una nota | `client_actions` |
| **Avísame** | una casilla mía sobre esa persona | `client_events`, privada (0106) |

Es exactamente `QUE_MANDAR` de `envios.js`, sin inventar vocabulario. El «+» del
carril abre **el mismo selector que ya existe**.

### 3.4 El hilo: el desfase, y por qué en días

Entre dos nodos baja un filete y el filete **dice cuándo le pasa**. No es una
etiqueta: es un botón —se toca y se convierte en su mando— y es **la firma de la
pantalla**.

**El hilo habla el idioma de su disparador**, y esto no es un adorno: es lo que
lo hace legible sin traducir.

| Disparador | Lo que dice el hilo |
|---|---|
| Cuando empieza contigo | *ese mismo día* · *el día 3* · *a las 2 semanas* |
| Cada lunes | *ese lunes* · *el jueves* · *el lunes siguiente* |

Y el desfase se guarda **absoluto desde el disparador**, no relativo al paso
anterior. Es la diferencia entre poder meter un paso en medio sin que se mueva
nada de lo que va detrás, y tener que recolocarlo todo a mano.

**Días, nunca horas.** Con el motor 1 la fila ya está escrita y `due` es una
fecha: un «a las 10:00» sería un adorno que miente. Coachway puede decir la hora
porque tiene un servidor mandando mensajes; nosotros decimos el día porque es lo
único que es verdad. El día que el motor 3 mande cosas, se replantea.

---

## 4. La pantalla

Una sola, dos columnas, la gramática que la app ya tiene en Entreno y en Resumen:
**el trabajo a la izquierda, el panel a la derecha.**

```
 ← Protocolos / Nutrición · 12 semanas                     12 clientes · 2 atrasados

 ┌─ el carril: lo que le pasa ─────────────────────┐  ┌─ el panel ──────────────┐
 │                                                 │  │ QUÉ LE LLEVAS           │
 │  ● CUANDO  empieza contigo            ( ●—)     │  │ Dieta · Seguimiento     │
 │  │  ese mismo día                               │  │                         │
 │  ● Pídele   Alta general · 14 preguntas         │  │                         │
 │  │  el día 3                                    │  │ CÓMO ES SU APP          │
 │  ● Mándale  Cómo medirte en casa · vídeo        │  │ Ve equivalencias   ( ●—)│
 │  │  a la semana                                 │  │ Parte de sesión    (—○ )│
 │  ● Avísame  repasar su primera semana           │  │ No ve su peso      ( ●—)│
 │  │  ⊕                                           │  │                         │
 │                                                 │  │ QUIÉN LO LLEVA          │
 │  ● CUANDO  cada lunes                 ( ●—)     │  │ 12 clientes             │
 │  │  ese lunes                                   │  │ 2 atrasados · 1 con     │
 │  ● Pídele   Su check-in · 6 preguntas           │  │ excepción               │
 │  │  el jueves                                   │  │                         │
 │  ● Avísame  si no lo ha entregado               │  │ ESTA SEMANA SALE        │
 │  │  ⊕                                           │  │ 4 cosas · ver la cola   │
 │                                                 │  │                         │
 │  ⊕  Añadir algo que pase solo                   │  └─────────────────────────┘
 └─────────────────────────────────────────────────┘
```

### 4.1 Las reglas que sigue, todas ya escritas

- **La caja se enciende, el verbo va en azul.** Sin flechas y sin lápices: el
  nodo se toca y se abre en su sitio. El paso abierto es la hoja de `MandarAlgo`,
  no una pantalla nueva.
- **En reposo no está.** El «⊕» del hilo aparece al acercarte; el del final de
  cada automatización, siempre (es donde se añade, no una decoración). En táctil,
  los dos siempre.
- **Un disco por clase**, con el mecanismo que ya usan la cartera y el avatar
  (`f-disco`, `data-tono`). Formulario, medida, entrega, tarea, aviso.
- **El panel no receta.** Cuenta lo que hay: cuánta gente, cuántos atrasados,
  qué sale esta semana. No propone cambiar nada.
- **Móvil:** el carril es una columna y ya lo era. El panel baja debajo. No hace
  falta lienzo, y ése es medio motivo por el que no hay lienzo.

### 4.2 Por qué carril y no lienzo

Una automatización nuestra es *disparador + n pasos con desfase*. No hay
bifurcación, no hay confluencia y no viajan datos entre pasos. Un lienzo pediría
colocar cajas y estirar cables para escribir **una lista ordenada**: todo el coste
de la metáfora y ninguna de sus ventajas. Lo que hace que Coachway se lea moderno
no es el lienzo —son cuatro cosas y las cuatro son gratis en un carril—: el
disparador es un nodo, los pasos están encadenados, el desfase se lee *entre*
nodos y cada paso se edita en su sitio.

El día que haya una rama de verdad —«si contestó, esto; si no, avísame»— el
lienzo se la habrá ganado. Ese día es otra tanda.

---

## 5. La cola: lo que va a salir y lo que ha salido

La puerta **Protocolos** gana un segundo tramo, con el mecanismo de banda que el
Taller ya tiene: **«Protocolos» · «Lo que sale»**.

```
  VA A SALIR                                            (se puede cancelar)
  mar 15   Marta Ruiz     Pídele   Su check-in          Cada lunes
  mié 16   Luis Peña      Mándale  Guía de medidas      Al entrar
  jue 17   9 personas     Pídele   Analítica            tú, el 12 de sep

  YA SALIÓ
  lun 14   Ana Gil        Pídele   Su check-in          contestado ✓
  vie 11   12 personas    Mándale  Vídeo de la fase 2   7 lo abrieron
```

Una sola lista, dos mitades, y la última columna dice **quién lo mandó**: tú, o la
automatización, con su nombre. Aquí se juntan los envíos de hoy y lo que sale
solo, porque para el que mira es la misma pregunta: *¿qué está saliendo en mi
nombre?*

### 5.1 Esto sustituye al «Review first» de Coachway

Ellos tienen un paso que te pide el visto bueno antes de salir. **No hace falta.**
Con el motor 1 la fila se escribe con fecha futura, así que **lo que va a salir ya
se puede ver y cancelar** durante días. Una cola visible es más natural que una
bandeja de aprobaciones: no te pide trabajo, te enseña el tuyo.

Lo que sí sale de aquí, más adelante y como otra cosa: **«qué le va a pasar esta
semana» en el Resumen del cliente**. Eso es su cola, no su protocolo, y entra
cuando exista y con vocabulario de hecho.

---

## 6. Lo que guarda la base

### 6.1 Dos tablas (migración 0116)

```sql
create table coach_automations (
  id            uuid primary key,
  coach_id      uuid not null references profiles(id),
  protocolo_id  text not null,        -- el protocolo del que es
  nombre        text,                 -- opcional
  disparador    text not null,        -- 'alta' | 'semana' | 'manual' | 'pesaje' | …
  disparador_valor jsonb,             -- {dia:1, cada:1} · {dias:10}
  pasos         jsonb not null,       -- [{ id, dia, verbo, tipo, form_id, title, link, body }]
  activa        boolean not null default true,
  orden         int not null default 0
);

create table automation_runs (
  id            uuid primary key,
  coach_id      uuid not null,
  client_id     uuid not null,
  automation_id uuid not null references coach_automations(id) on delete cascade,
  paso_id       text not null,
  ocurrencia    text not null,        -- ← la llave del §6.2
  action_id     uuid,                 -- la fila de client_actions, si la hubo
  event_id      uuid,                 -- la de client_events, si fue «avísame»
  ran_at        timestamptz not null default now()
);

create unique index on automation_runs (client_id, automation_id, paso_id, ocurrencia);
```

**En tabla y no en `preferences`**, y el argumento ya está escrito en la 0112:
`profiles.preferences` se lee y se reescribe entera en cada guardado. Y aquí no
vale el contraargumento de la 0099 —«lo siembra el alta como función pura»—:
una automatización no se siembra, **se dispara**.

**Los pasos van en `jsonb` dentro de la automatización** porque un paso no tiene
vida propia: no se consulta suelto, no se comparte y se edita siempre con su
automatización delante. Lo que sí tiene vida propia —cada ejecución— tiene su fila.

### 6.2 La llave de la ocurrencia · el doble disparo, resuelto

**Es el riesgo entero de este trabajo.** Sin estado de ejecución, alguien recibe
el vídeo de bienvenida dos veces, y es el fallo que no se puede corregir después.

La solución es una columna y un índice único. `ocurrencia` dice **qué vez es**:

| Disparador | `ocurrencia` |
|---|---|
| Cuando empieza contigo | `'once'` |
| Cada semana | `'2026-W37'` |
| Cuando se pesa | el `id` de la fila del pesaje |
| Cuando contesta su alta | el `id` de la `client_action` |
| Cuando se la mandes tú | el `envio_id` |

Con eso, **una sola columna distingue lo que pasa una vez de lo que se repite**, y
el índice único lo hace cierto en el único sitio donde puede serlo: la base. Dos
pestañas abiertas, un reintento de red o dos disparadores encadenados dan
`ON CONFLICT DO NOTHING`, no un vídeo repetido.

### 6.3 Cómo se propaga un cambio

**Lo que ya corrió no se toca; lo que no ha corrido, corre con la última versión.**

Es la consecuencia de que las automatizaciones sean **del protocolo** y las corra
en vivo, y es lo que un entrenador espera: si arreglas el vídeo del día 3, quien
ya lo recibió no lo recibe otra vez y quien entre mañana recibe el bueno. No hace
falta «Poner al día» para esto —«Poner al día» sigue gobernando la otra mitad, la
que sí es una copia sobre cada persona—.

Que las dos mitades se propaguen distinto **no es una incoherencia: es la razón
por la que están separadas**, y cada una lo dice en su sitio.

---

## 7. El vocabulario, cerrado

| Se dice | No se dice |
|---|---|
| **Qué le pasa solo** | «workflows», «reglas», «triggers» |
| **CUANDO** empieza contigo | «si», «trigger: onboarding» |
| **Pídele · Mándale · Avísame** | «enviar», «acción de tipo formulario» |
| **ese mismo día · el día 3 · el jueves** | «delay: 2d», «día 1 a las 10:00» |
| **Va a salir · Ya salió** | «pendiente», «histórico» |
| **Se lo mandó** *Al entrar* / **Se lo mandaste tú** | «sistema», «automático» |
| **Apagada para Marta** | «override», «excepción de regla» |

Y las dos frases que sostienen la pantalla, por si hay que escribirlas otra vez:
*«Qué le llevas»* para la configuración y *«Qué le pasa»* para el carril.

---

## 8. Las tandas

**Tanda 1 · Que se vea. — CONSTRUIDA el 10 sep 2026 (ver §11).** Sin migración y
sin motor.
La tarjeta «Su protocolo» en Perfil. La hoja partida en las dos mitades del §1,
abierta desde ahí y desde la cartera. El desdoble de «Cómo se le pauta» en la
dieta (el plan arriba, su app abajo) y la procedencia en las bocas de Dieta y
Entreno. **Arregla la mitad literal del encargo y no toca el modelo.**

**Tanda 2 · El carril y el hilo. — CONSTRUIDA el 11 sep 2026 (ver §12).**
Migración **0116** (la 0113 se la llevaron los grupos de equivalencia) y motor 1.
Las dos tablas, con RLS **y** `GRANT`. El carril con los tres disparadores
fechables, los pasos con desfase, el «⊕» del hilo, el paso que se abre en su
sitio. La cola de «Lo que sale», con cancelar. Las pruebas de la llave de
ocurrencia **antes** que la pantalla.
*De propina, casi gratis:* al final de «Mandar algo», **«Guardar como paso de un
protocolo»** — es el puente natural entre la herramienta que ya usa y la nueva.

**Tanda 3 · Los disparadores del cliente. — CONSTRUIDA el 11 sep 2026 (ver §13).** Motor 2, migración **0117**.
La función en la base, llamada al final de las RPC de entrega que ya existen.
Entran «cuando conteste su alta» y «cuando se pese», que son los dos que el
encargo nombra.

**Tanda 4 · El latido. — CONSTRUIDA el 11 sep 2026 (ver §14).** Motor 3,
migración **0118**.
La segunda llamada dentro de `scheduled()`, para lo que no provoca nadie.

---

## 9. Los riesgos, dichos antes

1. **Doble disparo.** Resuelto en el §6.2, pero solo si el índice único entra en
   la misma migración que la tabla. Con pruebas antes que con pantalla.
2. **RLS y GRANT juntos.** Tabla nueva = política **y** `GRANT`. Este proyecto se
   ha comido el 403 invisible tres veces y el síntoma no es un error: es un dato
   falso.
3. **Resolver antes de comparar.** `necesitaSuPlan` / `protegidoDeSuPlan` comparan
   al cliente contra su plantilla. Con automatizaciones fuera de `preferences`, la
   comparación pasa a depender de algo que se carga aparte: si no se resuelve
   antes, la cartera dirá «tiene excepciones» a todo el mundo.
4. **`clientProtocol` sanea y descarta lo que no conoce.** Toda clave nueva entra
   en su saneado y en `COMPARED_KEYS` / `NOT_COMPARED_KEYS` en el mismo commit;
   hay una prueba que lo vigila.
5. **Vocabulario que promete.** Mientras el motor 3 no exista no se puede escribir
   «le llegará el martes» de nada que dependa de leer. Con el motor 1 sí: la fila
   está escrita y su día es firme.
   *(Con el motor 3 construido, la regla de «días, nunca horas» NO cambia: el
   latido escribe una fila con su `due`, igual que los otros dos. Lo único que
   ahora se puede decir y antes no es «esto lo mira alguien todas las mañanas».)*

---

## 10. Lo que decido y lo que te dejo

**Decidido aquí** (con su porqué arriba, para poder discutirlo):

1. La puerta sigue llamándose **Protocolos** y gana el tramo **«Lo que sale»**.
   Renombrarla a «Automatizaciones» pondría el nombre en la máquina y no en la
   forma de trabajar.
2. **La automatización vive dentro de un protocolo** y no lleva audiencia propia.
3. **Los envíos y lo automático comparten registro**, y la cola visible sustituye
   al «Review first».
4. **Días, no horas.**
5. **Una pantalla, dos columnas.** Ni tercer nivel ni lienzo.

**Tuyo** (dos preguntas, y las dos cambian lo que se construye):

- **¿La tanda 1 va sola primero, o esperas a verlo con el carril?** La 1 arregla
  la queja de «está escondido» en un rato y no toca el modelo; la 2 es la
  herramienta de verdad y es varios días.
- **¿El «⊕» del hilo ofrece los tres verbos, o también «otra automatización»?**
  Es decir: ¿se puede encadenar un disparador dentro de otro («cuando conteste
  esto, empieza aquello»)? Se puede hacer y es potente, pero es la primera puerta
  hacia el lienzo y prefiero no abrirla sin que lo digas.

### 10.1 Contestadas · 10 sep 2026

**Sí a las dos.**

1. **La tanda 1 va sola primero** — y está **construida** (ver §11).
2. **El «⊕» encadena otra automatización.** Cuatro consecuencias, para que no se
   olviden cuando llegue la tanda 2:

   - Entra un **cuarto tipo de paso** —*empieza «…»*— junto a los tres verbos.
     No es un verbo del catálogo del §3.3: es un salto, y se dibuja distinto.
   - El disparador **«cuando termine otra»** entra en el catálogo del §3.2 y es
     de **motor 1**: se materializa al terminar la que lo llama, así que no pide
     infraestructura ninguna.
   - La `ocurrencia` del §6.2 de la encadenada es **la `ocurrencia` de quien la
     llama**, no `'once'`. Sin eso, «cada lunes → empieza X» dispararía X una
     sola vez en la vida.
   - **El ciclo hay que cortarlo**: A llama a B y B llama a A es un bucle que
     escribe filas hasta que alguien lo vea. Se corta al escribir —una
     automatización no puede encadenar a ninguna que ya esté en su cadena— y con
     un tope de saltos al correr. Va con prueba, como la llave de la ocurrencia.

   Lo que **sigue sin abrirse** es la rama: encadenar es una lista más larga, no
   un «si contestó / si no». El lienzo sigue esperando a que haya bifurcación de
   verdad.

---

## 11. Lo construido · tanda 1 (10 sep 2026)

Sin migración y sin motor, tal como decía el §8.

- **La celda «Protocolo» en Perfil**, primera de la banda del pulso, con la
  gramática de «Alta», «Cobro» y «Carpeta»: el nombre del protocolo como dato y
  qué le llevas debajo —o «Se ha quedado atrás» / «Afinado a mano» cuando su
  copia se ha separado de la plantilla—. Sin tono: quedarse atrás no es una
  avería. Abre **la misma hoja** que el «···» de la cartera, no una copia.
- **La hoja partida en las dos mitades del §1**: «Cómo es su app» (qué le llevas,
  las piezas, qué cifras no le vuelven) y «Qué le pasa» (su check-in, lo que se
  le pregunta al entrenar, su vara de aviso, lo que le has mandado). Lo que las
  separa es aire y un filete, como el cuerpo de la ficha. «Qué no ve» subió a la
  primera mitad, que es donde estaba su sitio, y «Lo que le has mandado» bajó a
  la segunda.
- **El desdoble en la dieta**: los ajustes del plan dicen ahora las tres cosas
  que deciden —«Cómo se le pauta» · «Cómo es su app» · «Lo que ves tú»—. Los dos
  interruptores de abajo colgaban de nada y se leían como peldaños de la
  pauta.
- **La procedencia en las dos bocas a mano** (`PieDeProtocolo`): el interruptor
  de equivalencias de la dieta y los módulos de los ajustes del programa dicen de
  qué protocolo salen y abren la hoja entera. En Entreno esa frase además
  **mentía**: mandaba a «Ajustes → Protocolo», que ya no existe.

Lo que **no** se ha tocado: el modelo, las tablas, `clientProtocol` y su saneado,
y las dos puertas de edición siguen siendo dos.

---

## 12. Lo construido · tanda 2 (11 sep 2026)

El carril, el hilo, la cola y el motor 1. Con la migración **0116**, no la 0113:
ese número se lo llevaron los grupos de equivalencia mientras esto se escribía.

### 12.1 Las piezas

- **`domain/automatizaciones.js`** — el módulo puro, y donde vive todo el
  criterio: los cuatro disparadores fechables, los verbos del «⊕»
  (los de `QUE_MANDAR`, sin inventar vocabulario), `hiloDice` —el idioma de cada
  disparador—, `semanaISO`, `claveDeCorrida`, el corte del ciclo en las dos
  puntas (`encadenaBien` al escribir, `MAX_SALTOS` al correr) y `loQueToca`, que
  contesta la única pregunta del motor: qué filas tendrían que existir ya.
- **`0116_lo_que_pasa_solo.sql`** — `coach_automations` y `automation_runs`, con
  RLS **y** `GRANT`, y el índice único `(client_id, automation_id, paso_id,
  ocurrencia)`. Las dos entran en `backup.mjs` y en el orden de `restore.mjs`:
  restaurar sin el libro no deja un hueco, **vuelve a mandarlo todo**.
- **`context/useAutomatizaciones.js`** — el motor 1, con las tres escrituras en
  su orden (apuntar · hacer · rematar) y el barrido de los apuntes a medias.
- **`Taller/CarrilAutomatizaciones.jsx`** y **`Taller/LoQueSale.jsx`** — la
  pantalla: el carril bajo el rótulo «Qué le pasa solo» y el segundo tramo de la
  puerta. Más «Quién lo lleva» en el panel de la derecha.
- **El puente**, al pie de «Mandar algo»: *¿esto lo haces siempre? Guárdalo como
  paso de un protocolo*. Solo cuando el «cuándo» se puede traducir a un desfase
  —«ahora» y «a las N semanas» sí; un día del calendario no, y se dice por qué—.

### 12.2 Las pruebas, antes que la pantalla

`domain/automatizaciones.test.js` (33) y `supabase/tests/automatizaciones.test.js`
(7, contra una base real y con la clave anónima). La llave se comprobó además
contra el Postgres local: el duplicado rebota con `unique_violation`, otra
ocurrencia entra, y el borrado en cascada se lleva el libro.

Y con la aplicación delante: tres arranques seguidos dejan **seis acciones para
seis personas**. Ni una de más.

### 12.3 Cuatro averías que solo aparecieron al correrlo

Ninguna la veía el linter, ni el build, ni las pruebas de dominio.

1. **`filasDeEnvio` no ha podido escribir nunca una fila.** Ponía
   `envio_id: newId('env')` —`env_3f2a…`— en una columna `uuid`, así que Postgres
   devolvía `22P02` y **«Mandar algo» fallaba entero**, desde que existe. Estaba
   tapado porque el error llega con el texto de Postgres y nadie lo relaciona.
   Es anterior a esta tanda, y se arregla aquí porque las automatizaciones se
   apoyan en esa misma función: lo que no escribe un envío tampoco escribe un paso.
2. **Resolver antes de comparar**, que es el riesgo 3 del §9 y cayó igual.
   `clientProtocoloId` devuelve lo ESCRITO, y casi nadie tiene nada escrito: el
   que nunca eligió lleva el primero. Comparando contra el valor crudo, a la
   cartera entera no le corría nada y sin un solo error.
3. **El cliente tiene dos formas.** La fila dice `start_date` y el objeto del
   contexto dice `startDate` (`mappers.js`). Leer una sola no da error: da un «no
   tiene alta» que no es verdad — y «a las 6 semanas de empezar» se convertía en
   «hoy, a todos». Se arregla con `altaDe`, en `envios.js`, para las dos puntas.
4. **El apunte huérfano.** Si el navegador desaparece entre pedir vez y mandar,
   queda una corrida que dice «ya corrió» sin que haya salido nada, y nadie la
   reintenta: el doble disparo al revés. Lo barre `limpiarApuntesAMedias`, y por
   eso los saltos —que no mandan nada— dejaron de apuntarse: si se apuntaran,
   «sin acción y sin evento» no distinguiría nada.

### 12.4 Y una decisión de producto que hay que confirmar

**Escribir una regla no la ejecuta hacia atrás.** Con seis clientes de meses
atrás, teclear «cuando alguien empiece conmigo, mándale el vídeo del día 3» les
mandó el vídeo a los seis en el acto, fechado en marzo. Se vio pasar.

Así que un disparador de alta **no dispara para quien empezó antes de que la
automatización existiera** (`coach_automations.created_at`). Es el lado barato
del error: quien empieza mañana lo recibe, y a los que ya tienes no les llega un
paquete de bienvenida seis meses tarde. Si prefieres que sí les llegue —o que
haya un «aplicárselo también a los que ya están», que sería un gesto aparte y
explícito—, se cambia en una línea de `disparosDe`.

Lo semanal no lleva esa puerta: arranca en el lunes de ESTA semana y no antes,
que ya es un pasado acotado y es el check-in que de verdad falta.

### 12.5 Lo que NO entra, y sigue esperando

- **El interruptor por persona** del §2.3 —«a Marta le tienes apagada *Al
  entrar*»—. Apagar la automatización entera y cancelar filas sueltas desde la
  cola cubren el caso mientras tanto; la excepción por persona toca
  `clientProtocol` y sus `COMPARED_KEYS`, y eso es un commit suyo.
- **Las premisas siguen siendo otra lista.** El §2.4 da por muerta la columna de
  conmutadores como forma de contar lo que le pasa a alguien, pero mudar el alta
  y el check-in a automatizaciones mueve el dato de cada cliente. Por eso el
  carril entra DEBAJO, con su rótulo, y no encima de lo que ya había.
- **El motor 2 y el latido** (tandas 3 y 4), tal como estaban.

---

## 13. Lo construido · tanda 3 (11 sep 2026)

El motor 2: **lo que dispara el cliente**. Migración **0117**, sin tablas nuevas.

### 13.1 Las piezas

- **`0117_lo_que_provoca_el_cliente.sql`** — cuatro funciones y dos disparadores
  de tabla. `app_protocolo_de_cliente` (el gemelo en SQL de
  `protocoloDeCliente`, con el «resolver antes de comparar» del §9.3 escrito
  desde el principio), `app_correr_una_automatizacion` (recursiva, con la cadena
  y su corte), `correr_automatizaciones_del_cliente` (la puerta: un hecho
  entra, lo que ese hecho desencadena sale) y los dos disparadores.
- **El dominio solo gana vocabulario**: dos disparadores en `DISPARADORES`, con
  su `motor`, y el `valor` de `contesta`. `CORREN_SOLAS` los deja fuera del
  repaso del navegador, y hay prueba de que los deja: si `loQueToca` los
  devolviera, el navegador escribiría encima de lo que ya escribió la base.
- **La pantalla**, con un solo mando nuevo: el desplegable de «qué formulario»
  en la cabecera del disparador, con la misma gramática que el horario del
  semanal.

### 13.2 Dos cambios del plan, con su porqué

**1. Es un disparador de tabla, no una llamada al final de las RPC.** El §8 decía
lo segundo. Al mirarlo:

- **El pesaje no tiene RPC.** El cliente escribe él mismo en `anthropometry`
  (`anthro_client_update`, 0002): el historial es un JSONB que se reescribe
  entero. No hay dónde «llamar al final».
- **Contestar tiene más de una puerta**: `marcar_accion` es la del cliente, y el
  entrenador puede dar por entregada una acción por su lado. Colgarlo de la RPC
  dejaría fuera esa mitad.

El disparador cuelga del HECHO, que es lo que la regla dice. Quien lo provoque da
igual.

**2. «Cuando contesta su alta» se convierte en «Cuando te conteste» + cuál.** El
catálogo del §3.2 daba por hecho que el alta es una `client_actions`, y **no lo
es**: el alta es el asistente del portal, que escribe en `clients`. Lo que sí
vive en `client_actions` es todo lo que le mandas —un cuestionario libre, una
analítica, un vídeo—.

Así que el disparador se acota por FORMULARIO y no por momento: «Cuando te
conteste · Alta general», «Cuando te conteste · cualquier cosa que le pidas». Es
una línea del catálogo en vez de tres, se compara texto contra texto
(`client_actions.form_id`) y **la base no necesita saber qué es un formulario**.

Y solo salta con lo que él ENTREGA (`tipo` `form` o `pide`). Un vídeo abierto
también pasa por `marcar_accion` —comparte columna y función— pero eso es algo
que le mandas tú; hacer que «cuando te conteste» saltara ahí sería mentirle al
verbo.

### 13.3 Lo que NO hay que calcular en la base, y por eso esto cabe

Todo el criterio difícil de `loQueToca` —las semanas ISO, el horizonte de 35
días, la cadencia contada desde el alta de cada uno— es del **motor 1**, porque el
motor 1 tiene que ADIVINAR cuándo toca. En el motor 2 el disparo ya ha pasado: su
día es el día del hecho y su `ocurrencia` es el id del hecho. Lo que queda es
recorrer los pasos y escribir sus filas, que es una forma y no un juicio.

Las tres escrituras del §6.2 tampoco necesitan la danza del navegador: van en la
misma transacción, así que si la fila no se escribe el apunte no existe. **No hay
apuntes a medias que barrer**, y el índice único sigue siendo quien impide el
doble disparo.

### 13.4 Lo que no puede pasar, y cómo se impide

| Riesgo | Lo que lo corta |
|---|---|
| Repartir el pasado de golpe (§12.4) | Dos puertas: nada anterior al `created_at` de la regla, y nada de hace más de **14 días**. Sin la segunda, cargar tres meses de pesajes serían noventa disparos. |
| Que el bucle se muerda la cola | `AFTER UPDATE` y solo UPDATE: lo que este motor escribe son INSERT con `submitted_at` vacío. La puerta al bucle está cerrada **por estructura**, no por una comprobación que alguien pueda quitar. |
| Que una regla rota impida entregar | Cada automatización va en su propio bloque —una subtransacción— y hay una red alrededor de todo. El que está delante es el cliente: no puede quedarse sin poder entregar su check-in porque una regla del entrenador esté mal escrita. |
| Que restaurar una copia vuelva a repartirlo todo | En `restore.mjs`, `coach_automations` y `automation_runs` suben **antes de `anthropometry`**: con el libro puesto, cada pesaje restaurado ya tiene su apunte y el índice único lo rechaza en silencio. |

### 13.5 Una avería de la tanda 2, cazada de paso

**El «⊕» ofrecía formularios que no se pueden mandar.** El paso listaba
`coachFormularios` entero, y un alta o un check-in no viajan como acción suelta:
sus preguntas no viven en `elementos`, así que `filasDeEnvio` congelaba
`elementos: []` y al cliente le llegaba **un cuestionario en blanco**. No daba
ningún error; la lista lo decía en voz baja —«0 preguntas»— sin que eso impidiera
nada. «Mandar algo» ya filtraba bien de su cosecha: el criterio se ha sacado al
dominio (`formulariosMandables`) y ahora lo comparten las dos bocas y la base.

### 13.6 Las pruebas

`supabase/tests/automatizaciones-motor2.test.js` (9, contra base real y con la
clave anónima): que dispara, que el desfase se cuenta desde el hecho, que la
casilla tuya sale privada, que corregir lo contestado no vuelve a mandar, que
acota por formulario, que un vídeo abierto no cuenta, que un pesaje de hace tres
meses no dispara y uno de hoy sí, que volver a guardar el historial no repite, y
que una automatización rota no impide entregar.

Más 5 de dominio sobre la frontera entre los dos motores, y la comprobación que
de verdad cierra la tanda: **con la sesión del CLIENTE**, su rol y RLS puesta,
contestar escribe la fila del entrenador. Que es la razón entera de que esto viva
en la base.

### 13.7 Lo que queda

- **La tanda 4, el latido.** `worker.mjs` ya está desplegado; lo que cambia ese
  día es quién llama, no lo que se hace.
- **Los disparadores que faltan del §3.2** —acepta la invitación, entrega su
  check-in, termina de entrenar, le entra un cobro— son ahora una línea cada uno:
  el motor está escrito y lo único que piden es su disparador de tabla. No entran
  aquí porque el encargo nombraba dos.
- **El riesgo que esta tanda añade y hay que decir en voz alta:** la forma de una
  fila de `client_actions` está ahora escrita en dos sitios —`filasDeEnvio` y la
  0117—. Lo pinado por los CHECK de la propia tabla es poco y estable, pero un
  verbo nuevo hay que darlo de alta en los dos. Está anotado en las dos puntas.

---

## 14. Lo construido · tanda 4 (11 sep 2026)

**El latido.** El motor 3, que es el último de los tres y el único que no cuelga
de nada.

### 14.1 La frase de esta tanda

*Los otros dos motores esperan a un hecho. Aquí lo que dispara es una AUSENCIA, y
una ausencia no escribe ninguna fila.* No hay a qué colgar un disparador: quien
no entrena no deja rastro. La única forma de enterarse es que alguien lo mire, y
mirarlo todos los días a la misma hora es el latido de las 07:00 — que llevaba
desplegado desde agosto y solo servía para empujar el bot de la radiografía.

Lo que cambia este día, tal como decía el §13.7, es **quién llama**.

### 14.2 Las piezas

| Pieza | Qué es |
|---|---|
| `domain/automatizaciones.js` | El disparador `silencio` (motor 3), el catálogo `SILENCIOS` —entrenar · pesarse · contestarte—, `MIN_SILENCIO` / `MAX_SILENCIO` / `DIAS_SILENCIO`, su saneado, su nombre y su hilo. |
| `0118_el_latido.sql` | `app_ultimo_de()` y `correr_el_latido()`. Sin tablas nuevas. |
| `functions/latido` | La puerta: comprueba `LATIDO_CRON_SECRET` y llama a la función con la clave de servicio. Cuatro líneas y ni un criterio dentro. |
| `worker.mjs` | Dos llamadas en `scheduled()` en vez de una, cada una con su secreto y su `catch`. |
| `CarrilAutomatizaciones.jsx` | El disparador se lee como una frase: «Cuando **lleve** `[10 días]` **sin** `[entrenar]`». |
| `config.toml` | `[functions.latido] verify_jwt = false`, por lo mismo que el empujón del bot: detrás de un cron no hay usuario. |

### 14.3 La decisión de la tanda: la ocurrencia de una ausencia

Es la que evita el fallo entero de este motor, y cabe en una línea de texto.

La `ocurrencia` de la 0116 dice «qué vez es». En el motor 2 es el id del hecho y
con eso basta. Aquí no hay hecho, y lo primero que se le ocurre a cualquiera —la
fecha de hoy— sería lo peor posible: **quien lleva veinte días sin entrenar
recibiría el mismo recado veinte mañanas seguidas.**

Así que la ocurrencia es **el silencio**, y un silencio se nombra por dónde
empieza:

```
sin:entrenar:2026-08-01     ←  «la racha que arranca el día que entrenó por última vez»
```

Mientras siga callado la clave no cambia y el índice único de la 0116 rebota el
segundo intento. El día que entrene, la referencia se mueve sola; y si vuelve a
desaparecer, eso es **otro** silencio con su propia clave y su propio aviso.

Una sola cadena de texto convierte «avísame si lleva diez días sin entrenar» en
«avísame una vez por cada vez que se calle». Sin contadores y sin estado nuevo.

### 14.4 Los tres cambios que le hice al plan, con su porqué

1. **El latido llama a `app_correr_una_automatizacion`, no al motor 2.**
   `correr_automatizaciones_del_cliente` corre TODAS las del disparador de golpe
   porque su unidad de trabajo es un hecho: pasó algo, que corra lo que escuche.
   Aquí la unidad es otra —una regla concreta, con SU umbral y SU «sin qué», para
   una persona concreta—, y dos silencios distintos del mismo protocolo
   («10 días sin entrenar», «30 sin pesarse») se habrían mandado lo del otro.
   Lo que sí se comparte es el núcleo, que es donde vive todo lo que puede
   equivocarse: recorrer los pasos, comprobar que están completos, pedir vez en
   el libro y escribir la fila.

2. **Sin rastro, la referencia es el ALTA.** Quien nunca ha entrenado no tiene
   última sesión. Contar desde que empezó contigo es lo que hace que el que no
   arranca —que es justo el que hay que atender— no se quede fuera para siempre.
   Y quien no tiene ni alta se queda fuera hasta que la tenga, igual que en
   `disparosDe`: ponerle «hoy» sería inventarle un comienzo.

3. **El §12.4 NO se aplica aquí, y es deliberado.** Para el motor 1 se decidió
   que escribir una regla no la ejecuta hacia atrás. Un silencio no es pasado:
   **es un estado presente**. Quien lleva tres meses sin pesarse lo lleva hoy, y
   es exactamente la persona por la que se escribe la regla. La consecuencia hay
   que conocerla y está en el §14.7.

### 14.5 Y el `GRANT`, que volvió a morder

`REVOKE ALL … FROM public` se lo quita **también a `service_role`**: en PostgreSQL
el `EXECUTE` de una función lo concede `PUBLIC` por defecto y no hay ningún
privilegio propio del rol de servicio debajo. Sin el `GRANT EXECUTE … TO
service_role` el latido contesta `42501` todas las mañanas y el único sitio donde
se vería es el registro del worker.

Es el 403 invisible de siempre, esta vez en una función y no en una tabla. Lo
cazó la prueba en el primer intento, que es exactamente para lo que están.

### 14.6 Las pruebas

`supabase/tests/automatizaciones-motor3.test.js`, siete contra la base local:

1. Sin una sola sesión, la racha se cuenta desde su alta —y lo que sale lleva la
   fecha de HOY, no la del día en que se cumplió el plazo—.
2. El latido del día siguiente **no vuelve a mandar lo mismo**. Es el fallo
   entero de este motor.
3. Si entrena y se vuelve a callar, **se avisa otra vez**: otra racha, otra
   clave. Sin esto la regla valdría una sola vez en la vida.
4. Mientras entrene, no pasa nada.
5. Dos silencios del mismo protocolo no se mandan lo del otro.
6. A quien está en pausa no se le manda nada.
7. **Un entrenador no puede hacer latir la base entera**: `42501`.

Más cinco de dominio en `src/domain/automatizaciones.test.js`: que el navegador
no lo reparte, que el valor se sanea con su suelo y su techo, que cambiar de
disparador suelta lo que guardó, cómo se llama y qué dice su hilo.

### 14.7 Lo que queda, y lo que hay que decidir

- **La decisión que espera veredicto.** La primera mañana después de encender un
  silencio puede salir un aviso por cada cliente que ya esté callado. Es **una
  vez por persona y por racha**, no un goteo, y es el comportamiento que creo
  correcto —esa gente lo está hoy—. Si prefieres lo contrario, es una línea en
  `correr_el_latido()`: comparar la racha contra el `created_at` de la regla.
- **El despliegue no es automático.** `LATIDO_CRON_SECRET` en los secretos de
  Supabase **y** en los del worker, y `npx supabase functions deploy latido`. Sin
  eso el latido no reparte y solo se ve en `npx wrangler tail`. Está en
  `docs/despliegue.md`.
- **Las fotos no entran** aunque `THRESHOLDS.noPhotos` exista: la cartera avisa a
  los 45 días porque es un dato tuyo, y aquí lo que se decide es mandarle algo a
  una persona. El día que se pida, es una línea del catálogo.
- **Los cuatro disparadores del motor 2 que faltan** —acepta la invitación,
  entrega su check-in, termina de entrenar, le entra un cobro— siguen siendo una
  línea cada uno, como decía el §13.7.
