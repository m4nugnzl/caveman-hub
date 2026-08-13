# Copias de seguridad

> Qué hay, qué no cubre cada cosa, y **cómo se restaura**. Lo último es la parte
> que se salta todo el mundo y la única que decide si la copia servía de algo.
>
> Fecha: agosto de 2026.

---

## 1. Las tres capas, y qué protege cada una

| Capa | Qué salva | Qué NO salva |
|---|---|---|
| **Copias de Supabase** | El proyecto entero, si tu plan las incluye | No sirven para «devuélveme el programa de Marta como estaba el martes»: restaurar la base completa tira el trabajo de los otros diecinueve clientes |
| **Ajustes → Copia de seguridad** (en la aplicación) | Un volcado que el entrenador se lleva | Ni automática, ni con fotos, ni restaurable sola |
| **`npm run backup`** (este documento) | Filas, cuentas y **archivos**, programable y verificable | Contraseñas y tokens de integraciones, a propósito |

Las tres son complementarias. La de Supabase es la única que restaura *en un
clic* y depende de que pagues por ella; la del script es la única que puedes
verificar tú y guardar donde quieras.

**Por qué hace falta una propia**: el modelo de datos concentra el trabajo de un
año de cada cliente en unas pocas filas JSONB que se reescriben enteras en cada
guardado (`auditoria.md` 1.4). Un `UPDATE` mal hecho se lleva doce meses sin dejar
rastro y sin que nada avise.

---

## 2. Ponerlo en marcha

En `.env.backup` (en la raíz, ya está en `.gitignore`) solo va una línea:

```
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

La URL no hace falta repetirla: se toma de `VITE_SUPABASE_URL` de tu `.env`, que
es el mismo proyecto. Un segundo sitio donde ponerla es un segundo sitio donde
puede quedarse vieja. Si algún día haces la copia de otro proyecto, define
`SUPABASE_URL` y manda esa.

La clave está en *Dashboard → Settings → **API Keys***, donde conviven dos
generaciones:

| Pestaña | Clave | ¿Sirve? |
|---|---|---|
| API keys | `sb_secret_…` | **Sí, la recomendada** |
| API keys | `sb_publishable_…` | No: es la que sustituye a la anon |
| Legacy API keys | `service_role` (`eyJ…`) | Sí, pero las JWT quedan obsoletas a finales de 2026 |

Mejor **crear una secret key propia** que reutilizar la `service_role`: se revoca
sola el día que este script deje de usarse, sin tocar nada más del proyecto.

> ⚠️ Esa clave **salta todas las políticas de seguridad**. No es la `anon key` y no
> puede acabar en el navegador ni en el repositorio. Si te equivocas de clave, el
> script se para y te lo dice: con la `anon key` la copia saldría vacía y sin
> ningún error, que es el peor fallo posible en una copia.

```bash
npm run backup                    # completa, en ./copias/<fecha>
npm run backup -- --sin-fotos     # solo filas: segundos en vez de minutos
npm run backup -- --salida D:/copias-caveman
```

Cada copia es una carpeta con `datos/` (un JSON por tabla), `fotos/` (el bucket
tal cual), `manifest.json` y un `LEEME.txt` para quien la encuentre dentro de tres
años.

---

## 3. Verificarla — esto no es opcional

Una copia que nadie ha comprobado no es una copia: es la creencia de tener una.

```bash
npm run backup -- --verificar ./copias/2026-08-13T09-00-00
```

Vuelve a leer cada archivo, recalcula su huella y la compara con el manifiesto, y
comprueba que cada tabla tiene las filas que dice tener. Si algo falta o ha
cambiado, lo enumera y **termina con error**, que es lo que permite que una tarea
programada avise en lugar de fallar en silencio.

---

## 4. Programarla

El script termina con código de salida distinto de cero si algo ha ido mal, así
que el programador de tareas puede avisarte.

**Windows — Programador de tareas**

Crea una tarea básica diaria que ejecute:

```
cmd /c cd /d C:\ruta\al\proyecto && npm run backup -- --sin-fotos
```

y otra **semanal** sin `--sin-fotos`. El reparto no es capricho: las filas pesan
unos megas y las fotos, gigas. Diario lo barato, semanal lo caro.

**Linux / macOS — cron**

```cron
0 3 * * *  cd /ruta/al/proyecto && npm run backup -- --sin-fotos
0 4 * * 0  cd /ruta/al/proyecto && npm run backup
```

**Dónde guardarlas.** Contienen datos de salud de personas concretas y fotos de
sus cuerpos. Cifradas y fuera del ordenador donde trabajas: un disco externo
cifrado, o un almacenamiento en la nube con cifrado del lado del cliente. No en
una carpeta compartida del gimnasio ni por correo.

**Cuánto conservarlas.** Ninguna más allá de lo que haga falta. Un esquema
razonable: las siete últimas diarias, las cuatro últimas semanales, y borrar el
resto. Guardar años de fotos de alguien que se dio de baja hace dos es exactamente
lo que el RGPD llama conservar sin finalidad.

---

## 5. Restaurar

El orden importa: las claves foráneas hacen que cargar una tabla antes que su
padre falle.

### 5.1 El esquema

Está en el repositorio, no en la copia. En un proyecto nuevo de Supabase:

1. `supabase/schema.sql`
2. las migraciones de `supabase/migrations/` **en orden numérico** (ver
   `supabase/README.md`: no todas son obligatorias, pero las que uses tienen que
   ir en orden)
3. crear el bucket privado `client-media`

### 5.2 Las cuentas

`datos/_auth_users.json` tiene el padrón: identificador, email y fecha de alta.
**Las contraseñas no se pueden exportar**, así que las cuentas se crean de nuevo
—con el mismo `id`, usando la API de administración— y cada persona entra con «he
olvidado mi contraseña».

Conservar el `id` es lo que importa: `profiles.id`, `clients.client_profile_id` y
media docena de columnas más apuntan a él. Con identificadores nuevos, los datos
restaurados no le pertenecen a nadie.

### 5.3 Los datos

Este orden respeta las dependencias:

```
profiles → teams → team_members → clients → todo lo demás
```

`clients` va después de `teams` y de `profiles` porque referencia a los dos. El
resto de tablas cuelgan de `clients` y entre ellas da igual el orden.

Cada archivo de `datos/` es un array JSON de filas tal como salieron de la base,
así que se cargan con un `INSERT` por tabla o con la API de Supabase usando la
`service_role key`.

### 5.4 Los archivos

`fotos/` reproduce la estructura del bucket (`<clientId>/photos/<semana>/…`). Se
suben conservando esas rutas: `progress_photos.photo_url` guarda **la ruta**, no
una URL, así que cualquier cambio de estructura deja las fotos huérfanas.

### 5.5 Lo que hay que rehacer a mano

- **Los tokens de las integraciones** (Notion, Stripe): se vuelven a pegar desde
  Ajustes → Integraciones. No están en la copia a propósito: guardarlos convertiría
  cada copia en un llavero de credenciales vivas repartido por discos externos.
- **El webhook de Stripe**, que apunta a un identificador de integración que habrá
  cambiado.

---

## 6. Lo que sigue sin estar resuelto

- **Nadie ha hecho una restauración completa todavía.** El procedimiento está
  escrito y es correcto sobre el papel; hasta que no se pruebe en un proyecto de
  usar y tirar, no se sabe cuánto tarda ni qué se ha olvidado. Es lo primero que
  haría antes del primer cliente de pago.
- **No hay cifrado en el propio script.** Lo delega en dónde guardes la carpeta.
- **No hay rotación automática.** Borrar las copias viejas es manual.
