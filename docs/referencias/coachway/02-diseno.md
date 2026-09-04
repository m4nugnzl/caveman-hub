# Coachway · Sistema de diseño (extraído del CSS de producción)

Fuente: `coachway.io/_astro/global.*.css` + 12 hojas de componente, descargadas
el 4 sep 2026. Esto no es interpretación: son sus tokens literales.

## 1. La idea estética en una frase

**Verde bosque profundo sobre papel cálido, con una serif itálica como acento.**
Ni SaaS azul genérico ni dark-mode con neón: parece papelería cara de club de
campo nórdico. Cero degradados púrpura, cero glassmorphism gratuito. El toque
premium sale de: tinta verde muy oscura, superficies crema/salvia, una itálica
editorial (Newsreader) para las palabras con carga emocional, y sombras
teñidas del propio verde.

## 2. Paleta (tokens literales)

```css
/* Tintas */
--cw-ink-heading: #113627;   /* verde bosque casi negro — titulares */
--cw-ink-body:    #41564b;   /* verde grisáceo — cuerpo */
--cw-ink-muted:   #656565;   /* gris — secundario */
--cw-ink-inverse: #f2efe6;   /* crema — texto sobre oscuro */

/* Acentos */
--cw-accent-light: #1f553f;  /* verde acción (tema claro) */
--cw-accent-dark:  #f5ce8f;  /* dorado suave (sobre fondos oscuros) */
--cw-eyebrow-ink:  #33745a;  /* verde medio para antetítulos */
--cw-eyebrow-bg:   #33745a1a; /* píldora del eyebrow al 10% */
--cw-eyebrow-border: #33745a33;

/* Superficies (papel cálido, del marco al lienzo) */
--cw-surf-frame:   #e4e7d5;  /* marco exterior salvia */
--cw-surf-well:    #e9ecdf;  /* hueco/pozo */
--cw-surf-tint:    #eef0e8;  /* tinte suave */
--cw-surf-content: #f7f6f2;  /* lienzo principal (papel) */
--cw-surf-card:    #fff;     /* tarjeta */
--cw-surf-anchor:  #113627;  /* bloques ancla oscuros */
--cw-surf-dark-grad: linear-gradient(180deg, #0d2b1f, #113627);

/* Estado (solo para juicio, nunca chrome) */
--cw-status-alert: #dc2626;  --cw-status-warn: #f0b429;
--cw-status-coral: #ef8b7a;  --cw-status-chip: #fff8e8;

/* Hairlines: la tinta al ~12% en vez de gris */
--cw-hairline: #1136271f;    --cw-hairline-dark: #e4e7d521;
```

Observa: **los bordes y sombras se tiñen con la tinta de marca** (#113627 con
alpha), nunca con negro puro. Eso cohesiona todo.

## 3. Tipografía

- **Sans**: DM Sans, self-hosted, solo 3 pesos (400/500/600).
- **Acento**: **Newsreader itálica 400–500** (`--cw-accent-font`) — la usan
  para la palabra emotiva dentro de titulares. Es su firma tipográfica.
- Escala: display `clamp(2.5rem, 5.2vw, 3.75rem)`; h2 `clamp(1.875, 3.4vw,
  2.625rem)`; h3 1.375; h4 1; body 1; small .875; min .75; eyebrow .8125.
- **Titulares en peso 500, no bold**, con tracking muy apretado: display
  −0.05em, h2 −0.04em, h3 −0.02em. Interlínea 1.12 titulares / 1.55 cuerpo.
- Eyebrow (antetítulo): mayúsculas 13px, tracking +0.08em, dentro de una
  píldora verde al 10 % con borde al 20 %, alto fijo 2rem. **Cada sección de la
  landing lleva uno** («The Power Panel», «Meal planning», «Check-ins»…) — es
  el hilo estructural.

## 4. Geometría y espacio

```css
--cw-r-card: 24px; --cw-r-panel: 16px; --cw-r-ctl: 12px;
--cw-r-chip: 8px;  --cw-r-pill: 999px;
--cw-sh-1: 0 1px 2px #11261c0f;
--cw-sh-2: 0 1px 2px #11261c0d, 0 10px 26px -22px #11261c80;
--cw-sh-3: 0 24px 60px -30px #0d2b1f73;
--cw-w-content: 79rem;           /* ancho máximo generoso */
--cw-x-frame: .5rem;             /* ¡marco de 8px alrededor de la página! */
--cw-section-y: 1.95rem → 3.25rem (desktop);
--cw-y-hug: .5/.75rem; --cw-y-flow: 1.25/2rem; --cw-y-breath: 2.5/4rem;
--cw-tap-min: 2.75rem;           /* mínimo táctil 44px */
```

Patrón distintivo: **la página vive dentro de un marco**. Un borde de ~8px de
color salvia (#e4e7d5) rodea el lienzo papel (#f7f6f2); las secciones
importantes son tarjetas redondeadas (24px) dentro de ese marco. Da sensación
de objeto físico, no de web infinita.

Jerarquía de superficie en 5 pasos: frame → well → tint → content → card.
La profundidad se hace con **color de superficie**, casi sin sombras (las tres
sombras son sutilísimas y teñidas).

## 5. Animación (así se mueve la landing)

Mecánica real:
- **Reveal por scroll**: cada `<section>` lleva `data-reveal="fade-up"` o
  `"fade-in"`, disparado con IntersectionObserver. Nada de librerías de scroll:
  IO + clases CSS.
- **Coreografías por sección**: decenas de `@keyframes` propios con prefijo por
  componente (`bd*` para el bento, `cwp-*` para plataforma, `cwlang-pop`,
  `sp-draw`, `path-draw`, `digit-in`, `logo-in`, `compass-settle`…). Cuando la
  sección entra, sus piezas internas entran **escalonadas** con `backwards` y
  delays (0 / .16s / .26s / .38s / .52s…): filas que aparecen (`bdRowIn`),
  chips que saltan (`bdPop`, `bdChip`), gráficas que se dibujan (`bdDraw`,
  `bdGrow`, `bdFill`), un check que se traza (`cwp-checkdraw`), brillos que
  pasan (`bdSheen`), puntos que pulsan (`cwp-dotpulse`).
- **Easings con carácter**:
  - `--bd-ease: cubic-bezier(.2,.7,.2,1)` — salida suave estándar.
  - `--bd-spring: cubic-bezier(.18,1.32,.34,1)` — **rebote** (overshoot 1.32)
    para chips/pops. El rebote es lo que hace que parezca «vivo».
  - También `cubic-bezier(.16,1,.3,1)` (expo-out) repetida 10 veces.
- Duraciones: transiciones de hover .15–.3s; entradas .5–1.5s.
- **Lottie** embebido (player completo en su bundle) para animaciones vectoriales.
- Un **marquee** (banda deslizante de coaches) tras el hero.
- `prefers-reduced-motion` respetado en las 13 hojas (`transition:none!important`).

La filosofía: **el producto se demuestra animándose**. Las secciones no llevan
capturas estáticas: llevan reconstrucciones en HTML/CSS del propio producto
(mini-UI falsas con datos realistas) que se auto-animan al entrar en viewport,
y vídeos del producto real («The screen in the film is the live product, not a
mockup»).

## 6. Patrones de layout recurrentes

1. **Bento** (`cw-bento`, su CSS más pesado: 71KB): rejilla de tarjetas
   desiguales, cada una con su micro-animación, resumiendo la plataforma.
2. **Tabs de features** con panel demo grande (desktop) / carrusel swipeable
   (móvil) — 8 features, cada tab pinta una pantalla del producto.
3. **Corner sections**: tarjeta grande con una esquina de UI del producto
   asomando (MealPlanCorner, ClientAppCorner, CheckInCorner).
4. **Bloques ancla oscuros**: secciones puntuales con el gradiente
   #0d2b1f→#113627 y texto crema + dorado, para romper el ritmo del papel.
5. Teléfono enmarcado con la app del cliente al lado del copy (LanguageShowcase:
   el móvil cambia de idioma delante de ti).
6. Strip de Trustpilot/Capterra con reseñas reales citadas.

## 7. Voz y microcopy

- Frases cortas, segunda persona, cero jerga: «Drag recipes in. Move them
  around. Done.» / «Save the bangers. Reuse them forever.»
- El titular vende **el momento vivido**, no la feature: «They open the app and
  the day's food is waiting» / «You write it once. Aino still reads Finnish»
  (usan un nombre propio de cliente ficticio).
- Dolor explícito del rival sin nombrarlo: «Tired of waiting for your platform
  to release YOUR money?».
- Números concretos siempre (1.100+, 3.900+, 2–3 min, 32 s).
- Emojis con cuentagotas (✨ 🔥 👀) solo en titulares de sección.
- CTA único repetido ~14 veces por página: «Start 14-day free trial», con el
  desactivador de riesgo al lado: «No charge today — cancel anytime under
  Billing».
