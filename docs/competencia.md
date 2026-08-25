# Efort Coach, punto por punto, y qué hacer con lo que enseña

> **Qué es esto:** un análisis del competidor más cercano que hay identificado
> —**Efort** / **Efort Coach**, de EFORT SYSTEMS S.L. (Barcelona)— y la lista de
> lo que de ahí se saca para Caveman Hub, ordenada por lo que mueve la aguja.
>
> Fecha: 25 de agosto de 2026.
>
> **Qué decide este documento:** nada por sí solo. Es una lectura del mercado
> (§1–§4) y una propuesta de prioridades (§5–§8). Las decisiones que toca están
> señaladas y hay que tomarlas de una en una, en la §9.
>
> **Qué NO toca:** la tesis del producto (`producto.md` §1), el lenguaje visual,
> `domain/`, RLS ni la tarifa de `monetizacion.md` §7.3. Al final se argumenta
> por qué el precio **no** es lo que hay que cambiar ahora.

---

## 0. Aviso sobre las fuentes, porque cambia cuánto se puede fiar uno

La sesión que escribió este documento **no pudo abrir `efortcoach.com`, las
fichas de App Store / Google Play ni Instagram**: el proxy de red las bloquea
(`EGRESS_BLOCKED`). Todo lo que sigue está reconstruido desde el contenido
indexado de sus propias páginas (`/`, `/product`, `/pricing`), las descripciones
de sus dos aplicaciones en las tiendas y la biografía de `@efortapp`.

Qué significa en la práctica:

| Nivel de confianza | Qué entra |
|---|---|
| **Alto** — texto propio de ellos, citado por varias fuentes | Nicho (powerlifting), dos aplicaciones, gratis para el atleta, chat, vídeo anclado a la serie, formularios de fin de semana y de bloque, competiciones, cobros, «+150.000 atletas», prueba de 10 días sin tarjeta, desde 9,99 $/mes |
| **Medio** — una sola fuente | 4,5 ★ con 120 valoraciones (App Store España), 1.259 seguidores / 79 publicaciones en `@efortapp`, «biblioteca de más de 100 ejercicios» |
| **Sin comprobar** | Los peldaños exactos de su tarifa (cuántos atletas por plan), su cifra real de entrenadores de pago, su equipo, su financiación |

**Nada de lo que sigue depende de un dato del tercer grupo.** Donde una
recomendación dependía de un número que no se pudo verificar, se dice.

---

## 1. Qué es Efort, en una frase suya y en una mía

La suya: *«All your powerlifting coaching in one platform»* — programación,
gestión de atletas, feedback en vídeo y competiciones, para que el entrenador se
dedique a los levantadores.

La mía: **Efort no es una aplicación, son dos, y la que importa es la gratuita.**

```
Efort (atleta)  ·  gratis, iOS + Android  ·  +150.000 atletas  ·  funciona SIN entrenador
      ▲
      │  el atleta ya está dentro; el entrenador viene detrás
      ▼
Efort Coach (entrenador)  ·  web (app.efortcoach.com) + iOS + Android  ·  desde 9,99 $/mes
```

Eso es toda su estrategia y conviene no pasarla por encima: **el producto de
pago no es su producto de captación.** El atleta se descarga un registro de
entrenamiento gratuito porque hace powerlifting, no porque tenga entrenador. Y
cuando un entrenador se plantea qué herramienta usar, la mitad de su cartera ya
la tiene instalada. Es distribución, no marketing.

---

## 2. Punto por punto: qué tiene cada uno

Leído con lo que hay en este repositorio a 25/08/2026 (`README.md`, `routes.jsx`,
`src/domain/`, las 81 migraciones y `monetizacion.md` §7.3).

### 2.1 Producto y alcance funcional

| Dimensión | Efort Coach | Caveman Hub |
|---|---|---|
| **Nicho** | Powerlifting. Explícito, en el titular | Sin nombrar. La portada dice «plataforma de gestión de clientes» y el producto es de hipertrofia / recomposición (15 grupos musculares, MEV/MRV, pliegues, fotos) |
| **Programación** | Bloques, plantillas, biblioteca de +100 ejercicios con modificadores | Microciclos, editor por serie (`kg · reps · rir`), calentamiento con vídeo, protocolo configurable |
| **Registro del cliente** | App nativa, offline presumible, biblioteca de ejercicios | Portal web (`/mi/…`), tabla de series pensada para el móvil, `log_session_set` operación a operación |
| **Vídeo de la serie** | **Sí, y anclado**: el atleta sube el vídeo desde la app y queda pegado al ejercicio y a la serie | **No.** Hay grabador de revisión (del entrenador) y enlaces de YouTube/Loom (`domain/video.js`). El cliente sube fotos, no vídeos de levantamiento |
| **Mensajería** | Chat en tiempo real dentro de la app | No hay. Hay revisión asíncrona con nota, campana de novedades y cuaderno de sesión |
| **Feedback estructurado** | Formularios automáticos de fin de semana y de fin de bloque | Check-in semanal + cuestionario configurable (0060) + feedback de sesión, todo dentro del protocolo del entrenador |
| **Competición / peaking** | Sí: calendario de competiciones y progresión de los tres básicos hacia el día de la competición | No, y no debería |
| **Nutrición** | **No aparece por ningún sitio** | Módulo completo: menús, opciones, equivalencias, macros por alimento/opción/día, catálogo, importación |
| **Antropometría y fotos** | No aparece | Pliegues, perímetros, % graso, series temporales, Photo Studio (encuadre, comparativas, anotación, exportación) |
| **Analítica** | Gráficas y comparación de métricas de ejercicio entre bloques | Volumen efectivo, tonelaje, MEV/MRV por grupo, adherencia, peso, widgets configurables (`domain/preferences.js`) |
| **Cobros del entrenador a sus clientes** | Seguimiento de pagos y recordatorios | Módulo de ingresos + conciliación con el Stripe del entrenador (0012/0013) + cobro a mano con rastro (0072) |
| **Importar lo que ya tiene** | No aparece | **Excel, TSV pegado y PDF**, rutina y dieta, en un solo diálogo, sin dependencias (`domain/xlsx.js`, `pdf.js`, `routineSheet.js`, `dietSheet.js`) |
| **Equipo / gimnasio** | «Escríbenos por Instagram» para funciones de equipo | Equipos, asientos, roles, tope por plan (0064) |
| **Multi-idioma** | Web en inglés y español; app en varios idiomas | Solo castellano, y es una decisión escrita (README) |

### 2.2 Empaquetado, precio y distribución

| Dimensión | Efort Coach | Caveman Hub |
|---|---|---|
| **Entrada del entrenador** | Prueba de **10 días**, atletas ilimitados, sin tarjeta | **Gratis permanente**, 3 clientes, sin tarjeta (0056) |
| **Primer plan de pago** | Desde **9,99 $/mes** | **39 €/mes** (10 clientes) |
| **Escalera** | Por número de atletas (peldaños no verificados) | Gratis · Solo 39 · Pro 79 · Equipo 149 + 19 €/asiento |
| **Coste para el cliente final** | 0 € | 0 € |
| **Presencia en tiendas** | Dos apps, iOS y Android | Ninguna. PWA instalable y completa (manifest, iconos, atajos, service worker) que el producto no ofrece instalar, y sin notificaciones push |
| **Prueba social** | «+150.000 atletas», 4,5 ★ / 120 valoraciones, testimonios de entrenadores | Capturas de una cuenta de demostración |
| **Canal** | La app gratuita del atleta. Instagram (`@efortapp`, ~1.259 seguidores) es soporte, no motor | Sin canal definido |

**El 9,99 $ contra el 39 € no es la comparación que parece**, y esto ya está
razonado en `monetizacion.md` §7.2: ahí dentro no hay nutrición, ni antropometría,
ni fotos, ni importación. Pero **el escaparate no lee notas al pie**. La
conclusión operativa no es bajar el precio (§8), es que la portada tiene que
hacer esa resta por el visitante.

### 2.3 Lo que no se ve desde fuera, y aquí sí

Esto no es una columna de una tabla comparativa porque el competidor no lo
publica y no se puede comparar de verdad. Pero existe y tiene valor:

- **RLS como única frontera de autorización**, con pruebas contra base de datos
  (`test:db`) y una radiografía que lee el catálogo de Postgres (0053–0055).
- **Datos del artículo 9 tratados como tales**: consentimiento versionado,
  exportación por persona, borrado completo, instrumentación propia sin
  `client_id` y sin terceros.
- **Copias de seguridad propias** y restauración ensayada (`docs/copias.md`).
- **81 migraciones** con el porqué escrito en la cabecera de cada una.

No vende una suscripción por sí solo. Sí decide una venta a un gimnasio con
asesoría jurídica, y sí evita el día que se rompe algo y no hay vuelta atrás.

---

## 3. Pros y contras, sin cortesías

### 3.1 Efort

**A favor:**

1. **Un nicho estrecho y dicho en voz alta.** «Powerlifting» filtra el 95 % del
   mercado y convierte al 5 % restante mucho mejor de lo que un genérico
   convierte a cualquiera. El entrenador de powerlifting lee ese titular y sabe
   que es para él.
2. **La app gratuita del atleta como canal de distribución.** Es lo mejor que
   tienen y no es una función: es que su producto de captación no cuesta soporte
   ni ventas.
3. **Vídeo anclado a la serie.** En fuerza, la técnica **es** el servicio. Que el
   vídeo llegue pegado al ejercicio y a la serie ahorra la parte más pesada del
   trabajo del entrenador: buscar de qué iba el vídeo que le acaban de mandar.
4. **Presencia en tiendas.** Notificaciones, icono en la pantalla de inicio,
   valoraciones públicas y una vía de descubrimiento que no cuesta dinero.
5. **Precio de entrada bajo y prueba sin tarjeta.** El «sí» inicial es barato.
6. **Absorben WhatsApp** con el chat y los vídeos. Aunque el chat en tiempo real
   sea una función cara y ruidosa, resuelve el sitio donde de verdad ocurre la
   relación hoy.

**En contra:**

1. **El nicho también es su techo.** Powerlifting es un mercado pequeño; el
   entrenador que además lleva pérdida de grasa y dieta —que son casi todos los
   que viven de esto— tiene que salirse de la herramienta.
2. **Sin nutrición.** Es la mitad del servicio de un entrenador online medio, y
   no está.
3. **Sin antropometría, sin fotos, sin comparativas.** Todo el seguimiento de
   composición corporal queda fuera.
4. **Sin importación.** Quien llega con su Excel lo vuelve a escribir. Es el
   peaje que más gente hace abandonar en el minuto cinco.
5. **9,99 $ es un precio de aplicación, no de software vertical.** Con esa
   entrada, el ingreso por cuenta obliga a mucho volumen, y eso presiona hacia
   más funciones y menos soporte.
6. **Instagram no es su fuerte** (~1.259 seguidores, 79 publicaciones). Su marca
   vive en la tienda de aplicaciones, no en redes. Copiarles la red social sería
   copiarles lo que peor les funciona.

### 3.2 Caveman Hub

**A favor:**

1. **El bucle está modelado de verdad** (`/c/:id/semana`, `domain/week.js`).
   Programar, ejecutar, entregar y contestar en una pantalla. Eso no es una
   función, es el producto, y la competencia lo tiene repartido.
2. **Nutrición dentro, entera, sin módulo aparte.** Es la diferencia más grande
   con Efort y con la mitad del mercado (`monetizacion.md` §7.2).
3. **Composición corporal en serio**: pliegues, perímetros, fotos, Photo Studio.
4. **Importar el plan de fuera.** Excel, TSV y PDF, probado contra siete ficheros
   reales de cinco entrenadores. **Esto es un arma comercial y hoy está
   escondida.**
5. **El protocolo**: el entrenador decide qué existe. Ninguna aplicación del
   mercado con este precio deja apagar módulos.
6. **Ingeniería y cumplimiento por encima de la categoría.**
7. **Gratis permanente con 3 clientes.** Estratégicamente es mejor que una prueba
   de 10 días, y el razonamiento de la 0056 es correcto.

**En contra —y esta es la lista que importa—:**

1. **No hay app —y la que hay, nadie sabe que puede instalarla.** La tesis de la
   portada es «tú lo montas aquí, él lo ve en su móvil», y lo que llega al cliente
   es un enlace pegado en WhatsApp. La PWA está montada (manifest, iconos,
   atajos, service worker) y **el producto no la ofrece en ningún momento**; sin
   push y sin tienda, para el cliente esto es una página web. Es la diferencia
   estructural más grande con Efort.
2. **No hay notificación de nada.** Ni correo transaccional (`monetizacion.md`
   §4.3), ni push. El bucle es semanal y depende de que alguien se acuerde.
3. **No hay vídeo del cliente.** Para cualquiera que entrene fuerza, falta lo
   único que no se puede sustituir por texto.
4. **La portada no dice para quién es.** «Plataforma de gestión de clientes» es
   lo que dice todo el mercado.
5. **Sin prueba social.** Ni una cifra, ni un testimonio, ni una valoración.
6. **Sin canal.** Efort tiene 150.000 atletas que le traen entrenadores; aquí no
   hay ningún mecanismo por el que llegue el segundo usuario.
7. **El embudo real, del 23/08/2026** (`informes/estado.json`): 20 registros → 4
   dieron de alta un cliente → 4 programaron → 4 dieron acceso al portal → **1
   revisó un check-in**. El portal ya está en el 72,7 % de los clientes (era
   13,3 % el día 16: el problema del acceso se arregló). **Lo que no ocurre es la
   segunda vuelta del bucle.**
8. **Dos críticos de seguridad abiertos** desde el 20/08 (`rls|videos`,
   `anon|videos`) que siguen ahí cinco días después.

---

## 4. La conclusión que sale de cruzar las dos listas

Hay una tentación evidente al leer esto: hacer la lista de funciones que Efort
tiene y aquí no, e implementarlas. **Sería el error.** Los números de arriba
dicen otra cosa.

> **De 20 personas que se registraron, 1 llegó a usar el producto una segunda
> semana.** Esa cifra no la mueve el chat, ni las competiciones, ni el precio.
> No hay ninguna función de Efort cuya ausencia explique ese 1 de 20.

Lo que Efort enseña no son funciones. Son **tres decisiones estructurales**:

1. **Decir para quién es** (nicho estrecho, en el titular).
2. **Que el cliente final tenga aplicación de verdad** (icono, push, tienda) —
   porque la mitad cliente es a la vez el producto y el canal.
3. **Que el producto de captación no sea el producto de pago.**

Y una cuarta que es suya y no se puede copiar: llevan años y 150.000 atletas de
ventaja en distribución.

---

## 5. Lo que hay que cambiar, por orden de lo que mueve

Ordenado por «euros o activación entre esfuerzo», no por lo bonito que queda.

### 5.1 Antes de nada: cerrar los dos críticos de seguridad

`informes/estado.json` los tiene marcados desde el 20/08: `rls|videos|critico` y
`anon|videos|critico`. Cinco días abiertos en una tabla que guarda vídeo de
clientes. **No es competencia, es higiene, y va antes que todo lo de abajo.**

### 5.2 Correo transaccional (ya decidido, sigue sin hacerse)

Está en `monetizacion.md` §4.3 y en `producto.md` §3 como la causa barata del
embudo. Sigue pendiente. Sin él no hay invitación automática, ni recordatorio de
check-in, ni aviso de «tu entrenador te ha contestado», ni recuperación de
contraseña fiable. **Es el requisito de todo lo demás de esta sección.**

### 5.3 El portal del cliente, instalable y con aviso

Este es el punto donde Efort saca la ventaja estructural, y **la mitad del camino
ya está andada sin que la portada lo cuente**: `public/manifest.webmanifest` está
completo (`display: standalone`, iconos, atajos a «Mi rutina» y «Mi check-in») y
`scripts/sw.mjs` genera un service worker real en cada build. Instalable ya es.

Lo que falta:

| Paso | Qué es | Coste | Qué gana |
|---|---|---|---|
| **a** | Que alguien lo instale: una pantalla en el alta del cliente que diga «añádelo a tu pantalla de inicio», con las dos instrucciones (iOS/Android) | Bajo — no hay nada que construir, solo que se sepa | Icono en el móvil del cliente |
| **b** | **Web Push** con VAPID: permiso, tabla de suscripciones, envío desde función edge, y el `push` en el service worker que ya existe | Medio, y **más barato de lo que parece porque el worker ya está** | «Toca sesión», «tu entrenador te ha contestado», «te falta el pesaje» |
| **c** | Envoltorio para tienda (Capacitor o similar) sobre el mismo código | Medio-alto, y recurrente (revisiones de Apple, cuenta de desarrollador) | Presencia en tienda, valoraciones, descubrimiento |

**a** y **b** son la prioridad. **c** es una decisión de negocio, no técnica: se
paga en mantenimiento para siempre y solo tiene sentido si la tienda va a ser un
canal de captación, que es la §7.

> ⚠️ **b** toca la CSP: hoy `connect-src` está limitado a Supabase
> (`public/_headers`) y el endpoint de push del navegador es del propio
> navegador, no de la página — el envío sale de la función edge, así que la CSP
> no debería estorbar, pero hay que comprobarlo antes de prometerlo. Con VAPID no
> entra ningún tercero, que es lo que exige la decisión de instrumentación propia
> del README. En iOS solo llegan las notificaciones si la aplicación está
> instalada: por eso **a** va antes que **b** y no al revés.

### 5.4 El vídeo de la serie

Es la única función de Efort que resuelve algo que aquí no está resuelto de
ninguna forma. Hoy: el cliente graba, manda por WhatsApp, el entrenador ve un
vídeo sin contexto y contesta en el chat. Fuera de la aplicación, fuera del
bucle, fuera del historial.

Lo que hace falta es lo mínimo, no un módulo:

- El cliente sube un vídeo **desde la serie que está registrando** (la ruta ya
  existe: `log_session_set` sabe ejercicio, serie y sesión).
- Aparece en «Su semana», en la sesión, junto a los kilos.
- El entrenador contesta con la nota que ya existe, o con el grabador que ya
  existe (`PhotoStudio/ReviewRecorder`).

La infraestructura está: bucket privado, cuota de almacenamiento por plan (0067),
grabador y visor. **Lo que falta es la subida del lado del cliente anclada a la
serie**, y es acotado.

### 5.5 La portada tiene que decir tres cosas que hoy no dice

Sin tocar el lenguaje visual, que está bien:

1. **Para quién es.** «Plataforma de gestión de clientes» no filtra a nadie. El
   producto es de **entrenador online de físico**: hipertrofia, recomposición,
   dieta y fotos. Decirlo cuesta una frase y multiplica la conversión de quien
   encaja. Es la lección de Efort, aplicada al nicho de aquí, que además es
   **mayor** que el suyo.
2. **Que te traes tu Excel.** La importación de rutina y dieta desde Excel, TSV y
   PDF es lo que quita el peaje de entrada, y está enterrada. Debería estar en el
   primer pliegue con su vídeo de diez segundos.
3. **La resta del precio.** «39 € con la nutrición dentro» contra «19 $ + 33 $ de
   plan de comidas + 24 $ de automatización». El razonamiento ya está escrito en
   `monetizacion.md` §7.2; falta enseñarlo.

### 5.6 La segunda semana

El embudo dice que el problema no es entrar: es volver. Cuatro entrenadores
programaron, uno revisó. Lo que empuja la segunda vuelta:

- **El recordatorio del cliente** (5.3b): sin aviso, un check-in semanal
  desaparece.
- **El aviso al entrenador** cuando llega un check-in — hoy tiene que entrar a
  mirar. La bandeja de «Hoy» es correcta, pero nadie abre una bandeja que no
  avisa.
- **Instrumentar la segunda semana como métrica norte.** Hoy `estado.json` mide
  el embudo de primera vez. Falta «entrenadores que cerraron dos semanas
  seguidas», que es la única cifra que predice que alguien va a pagar.

---

## 6. Los cambios radicales, que es lo que se pedía

Los tres de arriba son evolución. Estos cambian lo que es el producto. Van con su
argumento en contra, porque ninguno es obvio.

### 6.1 Nombrar el nicho y renunciar al resto

**Qué:** dejar de ser «gestión de clientes» y ser **el hub del entrenador online
de físico en castellano**. Portada, portal, ejemplos, catálogo y capturas.

**A favor:** es lo que ya es por dentro (15 grupos musculares, MEV/MRV, pliegues,
menús). El posicionamiento genérico es el único sitio donde el producto miente
sobre sí mismo. Y es justo la jugada de Efort, en un nicho más grande.

**En contra:** cierra la puerta al entrenador de fuerza, al de rendimiento y al
gimnasio. Con 20 registros no hay datos para saber quién estaba entrando.

**Recomendación:** hacerlo. Un genérico con 20 registros no tiene nada que
perder, y el nicho es lo único que hace que alguien reenvíe el enlace.

### 6.2 Que el lado cliente funcione sin entrenador

**Qué:** que un usuario pueda registrarse como **cliente sin entrenador**, usar
su semana, registrar entrenos, pesarse, subir fotos y ver su analítica, gratis. Y
que el día que contrata a un entrenador, este se enganche a la cuenta que ya
existe.

**A favor:** es literalmente la estrategia de Efort, y es la respuesta a «no hay
canal». Cada cliente satisfecho es un comercial ante su entrenador. Además
invierte el flujo de invitación, que hoy es el cuello de botella.

**En contra, y es serio:**
- **Contradice la tesis** de `producto.md` §1: «esto no es un sitio donde guardar
  rutinas, es un bucle entre dos personas». Un cliente solo es medio bucle.
- **El modelo de datos supone entrenador**: `clients` cuelga de un `coach`, RLS
  entera está construida sobre `is_my_client`. Un cliente huérfano es un caso
  nuevo en todas las políticas. **Esto no es una pantalla, es una migración de
  autorización.**
- Coste de soporte y almacenamiento de usuarios que no pagan nunca.
- El mercado de registro de entrenos gratuito está saturado (Strong, Hevy,
  FitNotes) y ahí no se gana por producto.

**Recomendación:** **no ahora.** Es la apuesta correcta si algún día hay
distribución que financiar, y es la peor de las inversiones con 20 registros.
Pero conviene **no cerrarse la puerta**: cada vez que se escriba una política
nueva, que asuma «cliente con entrenador» y no «cliente que es una fila del
entrenador». Anotado como riesgo arquitectónico, no como tarea.

### 6.3 Vender por el resultado, no por la función: el «informe de la semana»

**Qué:** que al cerrar la semana el producto genere **una pieza que el entrenador
le manda a su cliente** — resumen de lo hecho, comparativa de fotos, la curva de
peso, la respuesta del entrenador. Exportable como imagen o PDF, con la marca del
entrenador.

**A favor:** es la única función de esta lista que **se ve fuera de la
aplicación**. El entrenador se la manda al cliente, el cliente la publica, y su
entrenador aparece. Casi todo está construido: Photo Studio ya exporta,
`domain/week.js` ya reúne la semana, la analítica ya dibuja. Es composición.

**En contra:** es marketing dentro del producto, y puede acabar siendo un editor
de imágenes que nadie pidió. Hay que hacerlo de un solo botón y sin opciones.

**Recomendación:** hacerlo después de 5.3 y 5.4. Es la vía barata de distribución
que no exige montar un canal ni una app en tienda.

### 6.4 Marca blanca del portal

**Qué:** que el portal del cliente lleve el nombre y el logotipo del entrenador.

**A favor:** es el argumento clásico de venta al profesional que factura, encaja
con el plan Equipo y no toca el bucle. Media categoría lo cobra aparte.

**En contra:** obliga a separar «marca del producto» de «marca del entrenador» en
todo el CSS, y `tokens.css` está construido sobre la premisa de que el cromo no
tiene color de marca. Se puede hacer con logotipo y nombre solo, sin dejar elegir
colores. **Si se abre a colores, se rompe el lenguaje visual.**

**Recomendación:** versión mínima (logotipo + nombre + dominio propio en el
enlace) como palanca del plan Pro/Equipo. Sin paleta.

### 6.5 Lo que NO hay que copiarles

- **Chat en tiempo real.** WhatsApp ya ganó esa pelea. Construirlo es soporte
  permanente, notificaciones, moderación y expectativa de respuesta inmediata,
  para acabar segundo. La revisión asíncrona anclada a la semana es **mejor
  producto** y hay que defenderla, no cambiarla. Lo que sí hay que hacer es que
  se **entere** el que tiene que enterarse (5.3b).
- **Competiciones y peaking.** Es su nicho, no el de aquí.
- **Su precio.** Ver §8.
- **Su Instagram.** ~1.259 seguidores no es un canal que imitar.

---

## 7. El canal, que es el agujero de verdad

Efort tiene un mecanismo por el que llega el siguiente usuario. Aquí no hay
ninguno. Y sin eso, todo lo anterior mejora un producto que nadie encuentra.

Tres vías, y las tres son baratas comparadas con una app en tienda:

1. **El cliente como canal** (6.3): la pieza semanal exportable con la marca del
   entrenador.
2. **La importación como gancho de contenido**: «tráete tu Excel» es un problema
   real, buscado y sin resolver en el resto del mercado. Es un vídeo de treinta
   segundos que se reenvía solo entre entrenadores.
3. **Tres a cinco entrenadores como socios de diseño**, que ya está escrito en
   `monetizacion.md` §6.5 y sigue sin hacerse. Con 4 entrenadores activos, esto
   no es marketing: es la única fuente de información sobre por qué no vuelven.

**La 3 va primero, y es de esta semana.** No hace falta escribir una línea de
código: cuatro llamadas de veinte minutos a los cuatro que programaron algo.

---

## 8. Por qué el precio NO es lo que hay que cambiar

Es la conclusión más tentadora al ver 9,99 $ contra 39 €, y es la equivocada.

1. **No se está vendiendo lo mismo.** `monetizacion.md` §7.2 ya lo demuestra: la
   comparación honesta con el mercado es 19 + 33 + 24 $, no 19 $.
2. **Nadie ha rechazado el precio.** De 20 registros, 16 no llegaron a dar de alta
   un cliente. Eso no es una objeción de precio: es que no llegaron a ver el
   producto. **No hay señal de mercado sobre el precio, así que cambiarlo sería
   decidir a ciegas.**
3. **Bajar es fácil, subir no.** Ya está escrito en §7.3: lo que se respeta a
   quien ya estaba se arrastra durante años.
4. **El plan gratuito permanente ya hace el trabajo de la entrada barata.** Es la
   respuesta de este producto al 9,99 $, y es mejor: el que no paga se queda
   dentro con tres clientes en vez de irse a los diez días.

**Lo que sí hay que cambiar es el escaparate del precio, no el precio.** Es la
§5.5.3.

---

## 9. Orden propuesto, y las decisiones que hay que tomar

| # | Qué | Esfuerzo | Decisión previa |
|---|---|---|---|
| 1 | Cerrar los dos críticos de `videos` | Bajo | Ninguna |
| 2 | Cuatro llamadas a los cuatro entrenadores activos | Cero código | Ninguna |
| 3 | Correo transaccional (§4.3 de `monetizacion.md`) | Medio | Proveedor |
| 4 | Portada: nicho, importación y la resta del precio | Bajo | **§6.1** |
| 5 | PWA instalable + Web Push | Medio | **CSP y service worker** |
| 6 | Vídeo del cliente anclado a la serie | Medio | Cuota y caducidad |
| 7 | Métrica «dos semanas seguidas» en la radiografía | Bajo | Ninguna |
| 8 | La pieza semanal exportable (§6.3) | Medio | Ninguna |
| 9 | Marca blanca mínima (§6.4) | Medio | **Sin colores** |
| — | App en tienda, cliente autónomo | Alto | No ahora (§6.2, §5.3c) |

Las cinco preguntas que este documento **no** contesta y hay que contestar antes
de tocar código:

1. **¿Se nombra el nicho?** (§6.1) Es la que condiciona portada, catálogo y
   capturas.
2. **¿Web Push propio con VAPID, o se acepta un tercero?** Afecta a la CSP y a la
   política de privacidad.
3. **¿El vídeo del cliente se aloja o se enlaza?** Alojarlo cuesta egress y
   cuota; enlazarlo (YouTube/Loom) es lo que ya hace la 0040 y no vale para un
   vídeo de una serie.
4. **¿Cuánto dura un vídeo de serie en el bucket?** Sin caducidad, la cuota de
   Solo se come en semanas.
5. **¿Se acepta que la marca blanca no incluya color?** Si la respuesta es no, la
   función no se hace.

---

## 10. Fuentes

Consultadas el 25 de agosto de 2026, con la limitación de la §0 (páginas leídas
a través del índice de búsqueda, no directamente).

- Efort Coach — portada: <https://www.efortcoach.com/>
- Efort Coach — producto: <https://www.efortcoach.com/product>
- Efort Coach — precios: <https://www.efortcoach.com/pricing>
- Efort (atleta), App Store: <https://apps.apple.com/es/app/efort/id6448868299>
- Efort (atleta), Google Play: <https://play.google.com/store/apps/details?id=com.aleixplanasg.Efort>
- Efort Coach, App Store: <https://apps.apple.com/us/app/efort-coach/id6747997566>
- Efort Coach, Google Play: <https://play.google.com/store/apps/details?id=com.EfortCoach.EfortCoachApp>
- Instagram `@efortapp`: <https://www.instagram.com/efortapp/>
- YouTube: <https://www.youtube.com/@EfortApp>

Del lado de Caveman Hub, todo sale del propio repositorio: `README.md`,
`src/routes.jsx`, `src/domain/`, `public/manifest.webmanifest`, `scripts/sw.mjs`,
`public/_headers`, las 81 migraciones de `supabase/migrations/`, `docs/producto.md`,
`docs/monetizacion.md` y `informes/estado.json` (informe del 23/08/2026).
