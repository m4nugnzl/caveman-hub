# Modelo de equipo: un coach con varios entrenadores

> **Estado: implementado en la aplicación, pendiente de migración.**
>
> El código ya está: pestaña **Equipo**, eje de entrenador en la cartera, reparto
> de clientes y roles. Mientras `supabase/migrations/0006_teams.sql` no se
> ejecute, la aplicación funciona **exactamente como antes** —un entrenador con
> sus clientes— y la pestaña Equipo avisa de que falta la migración.
>
> Aplicar 0006 se puede hacer sin ventana de mantenimiento: el backfill deja a
> cada entrenador actual como dueño de su propio equipo, con sus clientes
> asignados a él.

---

## 1. El problema, en una frase

Hoy `clients.coach_id` significa dos cosas a la vez:

- **de quién es el cliente** (de qué negocio, quién factura, quién manda), y
- **quién lo lleva** (qué entrenador le programa y le contesta).

Con un entrenador solo, las dos coinciden y no pasa nada. En cuanto hay un
equipo, dejan de coincidir y una única columna no puede representar las dos.
Todo lo demás del sistema —las políticas de RLS, las consultas, la cartera— está
construido sobre esa columna, así que separarla es la decisión de fondo.

## 2. El modelo propuesto

Tres conceptos, ni uno más:

```
team           el negocio. Es el dueño de los clientes y de las bibliotecas.
team_member    una persona dentro de un equipo, con un rol.
client.assigned_to  el entrenador responsable de ese cliente.
```

```
                    ┌────────────┐
                    │   teams    │  id, name, owner_id
                    └─────┬──────┘
                    ┌─────┴───────────────────────┐
                    │                             │
          ┌─────────▼─────────┐        ┌──────────▼──────────┐
          │   team_members    │        │      clients        │
          │ team_id           │        │ team_id  ← dueño    │
          │ profile_id        │◄───────┤ assigned_to ← quien │
          │ role              │        │              lo lleva│
          └───────────────────┘        └─────────────────────┘
```

### Roles dentro de un equipo

| Rol | Ve | Puede |
|---|---|---|
| `owner` | todos los clientes del equipo | todo, incluido invitar y expulsar miembros |
| `admin` | todos los clientes del equipo | gestionar clientes y programar; no toca miembros |
| `trainer` | **solo los que tiene asignados** | programar, medir y hablar con los suyos |
| `viewer` | todos, en solo lectura | nada — para un nutricionista o un becario que observa |

Cuatro roles y no dos porque los tres primeros son papeles reales de un equipo
pequeño: el dueño, alguien que le ayuda a gestionar, y los entrenadores de a pie.
`viewer` cubre el caso del colaborador externo sin darle escritura.

### Por qué el equipo y no directamente «entrenador jefe»

Colgar todo de un `head_coach_id` en `profiles` parece más simple, pero deja
fuera dos cosas que van a hacer falta:

1. **La suscripción y la facturación son del equipo**, no de una persona. Si el
   dueño se va o cambia de cuenta, el negocio no debería desaparecer.
2. **Las bibliotecas de ejercicios y alimentos son del equipo.** Hoy son de
   `coach_id`, así que en un equipo de cuatro habría cuatro bibliotecas
   divergentes y cada uno escribiría «Press banca» a su manera. Compartirlas es
   uno de los motivos por los que un equipo querría esta herramienta.

## 3. Qué cambia en la base de datos

```sql
teams          (id, name, owner_id, created_at)
team_members   (team_id, profile_id, role, created_at)   PK (team_id, profile_id)
clients        + team_id uuid       -- dueño
               + assigned_to uuid   -- entrenador responsable
exercises      + team_id            -- biblioteca compartida
foods          + team_id
```

`clients.coach_id` **se conserva** durante la transición: el backfill lo copia a
`assigned_to` y deriva `team_id`, de modo que se puede desplegar el esquema sin
romper nada y retirar la columna más adelante, cuando ninguna consulta la use.

### El detalle que rompe todo si se hace mal: recursión en RLS

Las políticas nuevas necesitan preguntar «¿este usuario pertenece al equipo dueño
de este cliente?», lo que implica consultar `team_members` desde una política de
`clients`. Si `team_members` tiene a su vez una política que consulta `clients`,
Postgres entra en **recursión infinita** y toda consulta falla con
`infinite recursion detected in policy`. Es el error clásico de este modelo en
Supabase.

Las dos reglas para evitarlo:

1. Las funciones auxiliares (`can_access_client`, `my_team_ids`) van como
   **`SECURITY DEFINER`** con `SET search_path = public`, para que salten RLS al
   consultar las tablas de pertenencia.
2. Las políticas de `team_members` **nunca** consultan `clients`. Se resuelven
   contra `team_members` y `teams` y nada más.

Las funciones actuales (`is_my_client`, `is_me`, de `0002_rls_hardening.sql`) son
`SECURITY INVOKER` y funcionan porque la política de `clients` no depende de
ninguna otra tabla con RLS. Ese equilibrio se rompe al meter equipos.

> **Consecuencia práctica: no ejecutes `0002` todavía.** Sus políticas se
> reescriben enteras aquí. Aplicarlo ahora significa hacer el mismo trabajo dos
> veces, y con el riesgo de quedarte a medias entre dos modelos.

## 4. Qué cambia en la aplicación

### El cambio de mentalidad: que el filtro lo haga RLS

Hoy la carga inicial hace:

```js
supabase.from('clients').select('*').eq('coach_id', user.id)
```

Con equipos, quién ve a quién depende del rol, y replicar esa lógica en el
cliente sería duplicar la regla de autorización en un sitio donde no se puede
confiar en ella. La consulta pasa a ser:

```js
supabase.from('clients').select('*')     // RLS decide qué filas devuelve
```

Es menos código **y** más seguro: la regla vive en un solo sitio, la base de
datos, que es el único límite real.

### Impacto pantalla por pantalla

| Pieza | Qué cambia |
|---|---|
| Cartera | Gana el eje «entrenador». Para un `trainer` se ve igual que hoy; para el `owner`, se agrupa o se filtra por entrenador y aparecen las cifras del equipo. |
| Clientes & Pagos | Al dar de alta se elige a quién se le asigna. |
| Bibliotecas | Pasan a ser del equipo: lo que escribe uno lo autocompleta el resto. |
| Nueva pantalla: Equipo | Miembros, roles, invitaciones y reasignación de clientes. Es la única pantalla nueva que hace falta. |
| Resto de módulos | **Sin cambios.** Todos trabajan sobre `activeClient`, y quién puede ser `activeClient` ya lo decide RLS. |

Que solo haga falta una pantalla nueva no es casualidad: es la señal de que el
modelo encaja con la arquitectura que ya hay.

## 5. Estado de la implementación

| Pieza | Estado |
|---|---|
| Esquema, backfill y RLS (`0006`) | Escrito. **Pendiente de ejecutar.** |
| Carga sin `.eq('coach_id', …)` | Hecho. Idéntico resultado con y sin equipos. |
| `clients.assignedTo` en el mapeador | Hecho. Sin equipos cae en `coach_id`, que significaba lo mismo. |
| Pantalla **Equipo** | Hecha: miembros, roles, invitación por email, reparto de clientes. |
| Eje de entrenador en la **Cartera** | Hecho. Aparece solo si el equipo tiene más de una persona. |
| `addClient` rellena `team_id` y `assigned_to` | Hecho, solo cuando hay equipo. |

Lo que queda para más adelante, cuando haga falta:

- **Retirar `clients.coach_id`.** Sigue escribiéndose porque es `NOT NULL`. Va en
  una migración propia, cuando ninguna consulta lo use.
- **Bibliotecas por equipo.** `0006` añade `team_id` a `exercises` y `foods` y
  cambia sus políticas, pero la aplicación sigue consultándolas por `coach_id`.
  Funciona igual; compartirlas de verdad es un cambio de dos líneas en la carga.
- **Cifras agregadas del equipo** para el dueño (quién tiene la cartera más
  desatendida, reparto de carga en el tiempo).

### La invitación, y por qué no puede ser un INSERT

Para añadir a alguien hay que localizar su perfil por email, y la política de
`profiles` no permite buscar a quien todavía no comparte equipo contigo —que es
justo el caso de una invitación—. Lo resuelve la función `invite_team_member`
(`SECURITY DEFINER`), que hace la búsqueda sin abrir la tabla.

Consecuencia de producto: **la persona tiene que haberse registrado antes**. Si no
existe la cuenta, la pantalla lo dice ahí mismo en lugar de dejar una invitación
colgada esperando a nadie. Un flujo de invitación por email para cuentas que aún
no existen necesita una tabla `invitations` y envío de correo; es una fase aparte.

## 6. Lo que esta propuesta deja fuera a propósito

- **Permisos por módulo** (que un nutricionista vea la dieta pero no la rutina).
  Es una matriz de permisos, mucho más complejo, y no hay evidencia todavía de
  que haga falta. `viewer` cubre el 90 % del caso.
- **Que un cliente tenga dos entrenadores a la vez.** Un responsable por cliente
  mantiene claro a quién le toca actuar, que es justamente lo que la cartera
  intenta responder. Si algún día hace falta, `client_trainers` es una tabla
  puente y el modelo lo admite sin rehacerlo.
- **Traspaso de clientes entre equipos.** Es una operación excepcional; se
  resuelve con SQL cuando ocurra.
