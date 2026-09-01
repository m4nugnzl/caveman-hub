# CAVEMAN HUB — CLAUDE CODE PROJECT INSTRUCTIONS

## 1. PROJECT IDENTITY

Caveman Hub is a software ecosystem for managing training, coaching, clients,
workouts, nutrition, anthropometry, progress and training analysis.

The project is being developed as a long-term product, not as a disposable
prototype.

The primary objective is to build a maintainable, scalable and coherent
application while preserving a high-quality user experience.

Do not make architectural changes casually.

---

# 2. CURRENT STACK

Before making assumptions, inspect the actual repository and package.json.

Current known technologies include:

- React
- Next.js
- JavaScript / JSX
- Tailwind CSS
- Supabase
- ESLint
- Git
- Node.js / npm

The repository may evolve.

NEVER assume a library or technology is available without checking the
repository first.

Before introducing a dependency:

1. Check whether an existing dependency already solves the problem.
2. Check package.json.
3. Prefer the existing project stack.
4. Explain why the new dependency is necessary.
5. Avoid unnecessary dependencies.

---

# 3. CORE DEVELOPMENT PRINCIPLES

Prioritize:

1. Correctness
2. Maintainability
3. Simplicity
4. Consistency
5. Reusability
6. Performance
7. User experience

Do not optimize prematurely.

Do not introduce abstractions without a real need.

Do not create duplicate implementations of the same concept.

Prefer small, composable and understandable components.

---

# 4. BEFORE MODIFYING CODE

For any non-trivial task:

1. Understand the relevant existing implementation.
2. Search the repository for related functionality.
3. Identify all affected files.
4. Understand dependencies between those files.
5. Determine whether an existing component, hook, utility or pattern can
   be reused.
6. Explain the implementation strategy when the task is architectural or
   potentially destructive.
7. Make the smallest coherent change necessary.

Do not rewrite working code simply because another implementation is
personally preferred.

Do not refactor unrelated code while implementing a feature.

---

# 5. CODEBASE CONSISTENCY

Follow existing project conventions.

Before creating a new:

- component
- hook
- utility
- context
- service
- data model
- API function
- styling pattern

search the repository for an existing equivalent.

Prefer extending an existing abstraction over creating a parallel one.

If the existing architecture is inconsistent, do not silently introduce
another pattern.

Flag the inconsistency and recommend a migration strategy.

---

# 6. COMPONENT DESIGN

Components should have a clear responsibility.

Avoid:

- huge monolithic components
- duplicated JSX
- duplicated business logic
- deeply nested conditional rendering
- unnecessary prop drilling
- unnecessary state
- components that mix unrelated responsibilities

Separate when appropriate:

- presentation
- business logic
- data fetching
- state management
- reusable utilities

However, do not split components purely for the sake of having smaller files.

The abstraction must provide real value.

---

# 7. UI / UX

The application should feel like one coherent product.

Prioritize:

- consistent spacing
- consistent typography
- consistent hierarchy
- consistent interaction patterns
- predictable states
- responsive layouts
- accessibility
- clear feedback
- loading states
- empty states
- error states

Do not introduce arbitrary UI patterns when an existing design pattern exists.

When modifying a component, inspect related components to maintain visual
consistency.

Avoid visual changes that solve one screen while making the rest of the
application inconsistent.

---

# 8. RESPONSIVE DESIGN

All new UI must consider:

- desktop
- tablet
- mobile

Do not treat responsive design as an afterthought.

Avoid hardcoded dimensions unless they are genuinely required.

Prefer the project's existing responsive and layout patterns.

---

# 9. DATA AND STATE

Understand where data originates before modifying state.

Distinguish between:

- server data
- local component state
- global state
- derived state
- persisted data

Do not duplicate the same source of truth.

Avoid storing derived values in state when they can safely be computed.

When modifying data flow, check all consumers of the affected data.

---

# 10. SUPABASE

Supabase is part of the current architecture.

Before modifying database-related code:

1. Understand the existing schema.
2. Check existing queries.
3. Check relationships.
4. Check authentication / authorization.
5. Check Row Level Security policies when relevant.
6. Avoid duplicating database logic.
7. Never expose secrets or service credentials to the client.

Never hardcode credentials.

Never commit secrets.

---

# 11. SECURITY

Never:

- expose secrets
- hardcode API keys
- expose service-role credentials to the client
- weaken authentication
- bypass authorization
- disable security mechanisms just to make a feature work

If a requested implementation creates a security concern, explain it before
implementing the change.

Treat user-controlled data as untrusted.

---

# 12. PERFORMANCE

Do not optimize blindly.

When performance is relevant:

1. Identify the actual bottleneck.
2. Measure or inspect evidence.
3. Fix the bottleneck.
4. Avoid premature optimization.

Pay particular attention to:

- unnecessary renders
- unnecessary data fetching
- duplicated requests
- large client-side computations
- unnecessary bundle size
- expensive list rendering

---

# 13. ERROR HANDLING

Do not silently swallow errors.

Errors should:

- be handled intentionally
- provide useful feedback
- preserve useful debugging information
- avoid exposing sensitive implementation details to users

Do not use empty catch blocks.

---

# 14. TESTING AND VALIDATION

After meaningful changes, validate the implementation.

Use the project's existing commands.

At minimum, when relevant:

- lint
- type checking
- tests
- production build

Do not claim that something works without checking it when it can be checked.

If a test or build cannot be run, explicitly state that.

---

# 15. GIT

Keep changes focused.

Do not:

- modify unrelated files
- delete files without justification
- rewrite Git history
- create commits unless explicitly requested
- push to remote repositories unless explicitly requested

Before major changes, inspect:

    git status

After changes, inspect:

    git diff

The final response should clearly state:

- what changed
- which files changed
- what was validated
- any remaining issues

---

# 16. DOCUMENTATION

The project contains important product and architectural documentation.

Before making significant architectural or product decisions:

1. Inspect the relevant documentation.
2. Respect existing decisions.
3. Identify conflicts between documentation and implementation.
4. Do not silently change the intended product behaviour.

If documentation and code disagree, report the discrepancy.

Do not automatically assume that the code is correct or that the
documentation is correct.

---

# 17. PROJECT ROADMAP

The project is being developed incrementally through defined milestones
and phases.

The existing project documentation should be treated as the source of
product intent.

Do not skip milestones or implement future functionality prematurely
unless explicitly requested.

When a task belongs to a future phase, mention it rather than silently
expanding scope.

---

# 18. WORKFLOW

For complex tasks use this workflow:

UNDERSTAND
↓
PLAN
↓
IMPLEMENT
↓
VALIDATE
↓
REVIEW

### UNDERSTAND

Inspect the relevant code and documentation.

### PLAN

Identify:

- files involved
- dependencies
- risks
- implementation strategy

### VALIDATE

Run appropriate checks.

### REVIEW

Inspect the resulting diff and check for regressions.

---

# 19. DO NOT GUESS

If information is missing:

- inspect the repository
- search the codebase
- inspect package.json
- inspect configuration
- inspect documentation

Do not invent APIs, files, components, database tables or dependencies.

If something genuinely cannot be determined, say so.

---

# 20. IMPORTANT BEHAVIOURAL RULE

Do not blindly follow the user's requested implementation if the existing
architecture indicates that it would create a serious technical problem.

Instead:

1. Explain the problem.
2. Explain the consequences.
3. Propose a better alternative.
4. Wait for confirmation when the change is significant.

For small, obvious improvements, proceed directly.

---

# 21. SCOPE CONTROL

Stay within the requested scope.

If implementing feature X reveals unrelated problems:

- mention them
- do not automatically fix them

unless they directly prevent feature X from working correctly.

---

# 22. FINAL RESPONSE FORMAT

After completing a task, report:

## Changes
- ...

## Files modified
- ...

## Validation
- ...

## Potential issues
- ...

## Next recommended step
- ...

Keep the final report concise but technically useful.

---

# 23. GOLDEN RULE

Understand the existing system before changing it.

Prefer coherent evolution over unnecessary rewriting.

Build for the long term.

When uncertain, inspect first.


# 24. DESIGN & CORE SKILLS

### UI/UX & Refactor (`ui-ux-pro-max` + `refactoring-ui`)
Reduce la carga cognitiva, establece jerarquías visuales claras y mantiene contraste accesible (WCAG AAA). Utiliza escalas de espaciado limpias (múltiples de 4px/8px) y tipografías legibles. Evita estéticas recargadas; prioriza interfaces pulidas, intuitivas y eficientes.

### Clean HTML (`design-html`)
Escribe maquetación HTML5 semántica y accesible. Minimiza el anidamiento innecesario de divs, utiliza etiquetas estructurales correctas e integra roles ARIA.

### Taste & Anti-Slop (`taste-skill`)
Elimina patrones genéricos de IA (degradados púrpura/azul trillados, bordes sin sentido o tarjetas repetitivas). Diseña con criterio editorial y acabados limpios.

### Security Check (`security-review`)
Garantiza la sanitización de entradas, previene fugas de memoria y evita exponer claves de API o credenciales de Supabase en el cliente.

---

# 25. CRITERIOS DE DISEÑO FRONTEND

Resumen de la skill `frontend-design` (plugin oficial `frontend-design@claude-plugins-official`).
Aplica a cualquier UI nueva o rediseño de una existente.

### 1. Anclar el diseño en el sujeto
Antes de diseñar, fijar el sujeto concreto, su audiencia y el único trabajo que hace
la pantalla. Las decisiones distintivas salen del mundo del propio producto (su
material, su vocabulario, sus artefactos), no de un catálogo de estilos genérico.
Diseñar siempre con contenido real, no con relleno.

### 2. Evitar los defaults de IA
Hay tres estéticas en las que converge el diseño generado por IA y que deben
evitarse salvo que el encargo las pida explícitamente:

1. Fondo crema (~#F4F1EA) + serif de alto contraste + acento terracota.
2. Fondo casi negro + un único acento verde ácido o bermellón.
3. Layout tipo periódico: filetes finos, `border-radius: 0`, columnas densas.

Son defaults, no decisiones. Cuando el encargo deja un eje libre, no se gasta esa
libertad en uno de ellos. Cuando el encargo sí fija una dirección, manda el encargo.

### 3. La tipografía lleva la personalidad
Emparejar de forma deliberada una fuente de display (usada con moderación) y una
de texto, más una utilitaria para datos o pies si hace falta. Escala tipográfica
clara, con pesos, anchos y espaciados intencionados. La tipografía es parte
memorable del diseño, no un vehículo neutro.

### 4. La estructura es información
Numeraciones, antetítulos, separadores y etiquetas deben codificar algo cierto del
contenido, no decorarlo. Los marcadores `01 / 02 / 03` solo valen si el contenido
es realmente una secuencia. Cuestionar cada recurso estructural antes de usarlo.

### 5. Movimiento deliberado
Decidir dónde —y si— la animación sirve al contenido: secuencia de carga, reveal
al hacer scroll, micro-interacciones de hover, atmósfera ambiental. Un momento
orquestado rinde más que efectos dispersos; el exceso de animación es precisamente
lo que delata un diseño generado.

### 6. Un solo elemento firma
Concentrar la audacia en un único elemento memorable y mantener todo lo demás
callado y disciplinado. Recortar cualquier adorno que no sirva al encargo.
La complejidad debe ir a la altura de la visión: lo maximalista exige ejecución
elaborada; lo minimalista exige precisión en espaciado, tipo y detalle.

### 7. Proceso en dos pasadas
Primero un plan compacto de tokens antes de escribir código:

- **Color** — la paleta como 4–6 valores hex con nombre.
- **Tipo** — las familias para 2+ roles (display, texto, utilitaria).
- **Layout** — concepto en una frase, comparando alternativas con wireframes ASCII.
- **Firma** — el único elemento por el que se recordará la pantalla.

Después, revisar el plan contra el encargo: si alguna parte es lo que saldría para
cualquier pantalla parecida, se revisa y se explica qué cambió y por qué. Solo
entonces se escribe el código, derivando cada color y cada decisión tipográfica
del plan revisado. Iterar en el razonamiento; enseñar al usuario solo lo que ya
tiene confianza de que le va a gustar.

### 8. Suelo de calidad, sin anunciarlo
Responsive hasta móvil, foco de teclado visible, `prefers-reduced-motion`
respetado. Autocrítica durante la construcción, con capturas si el entorno lo
permite. Regla de Chanel: antes de salir, quitarse un accesorio.

### 9. CSS: cuidado con la especificidad
Es fácil generar clases que se anulan entre sí (un selector por tipo como
`.section` contra uno por elemento como `.cta`). Ocurre sobre todo con paddings
y márgenes entre secciones.

### 10. El texto es material de diseño
Las palabras están para hacer la interfaz más fácil de entender y de usar:

- Escribir desde el lado del usuario. Nombrar las cosas por lo que la persona
  controla y reconoce, nunca por cómo está construido el sistema.
- Voz activa. Un control dice qué pasa al usarlo: «Guardar cambios», no «Enviar».
- Una acción conserva su nombre en todo el flujo: el botón «Publicar» produce un
  aviso «Publicado». El vocabulario de la interfaz es la señalización del producto.
- Errores y estados vacíos son dirección, no ambiente: explican qué pasó y cómo
  arreglarlo, sin disculparse y sin vaguedad. Una pantalla vacía es una invitación.
- Registro conversacional: verbos llanos, mayúscula solo inicial, sin relleno.
  Cada elemento hace exactamente un trabajo; nada duplica funciones en silencio.
