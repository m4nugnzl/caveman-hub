# Coachway · Anatomía de la landing (coachway.io)

Orden real de secciones extraído del HTML de producción (ids literales).
Cada sección lleva `data-reveal` (fade-up/fade-in por IntersectionObserver) y
un eyebrow-píldora que la etiqueta.

## Secuencia completa

| # | id | Qué es |
|---|----|--------|
| 1 | (hero, `bg-calm-green-70`) | H1: «The new efficient platform every online coach is talking about.» + subclaim del 50 % de tiempo ahorrado + 2 CTAs (Start free trial / Book a free demo) + «14-day free trial · Cancel anytime · 5.0 on Capterra» + 6 banderas |
| 2 | `cw-marquee` | Banda deslizante: 100+ coaches reales con foto, bandera y seguidores (202K, 64K, 58K…) |
| 3 | `cw-ppr` | **El Power Panel real**: «This is the actual screen you would work from» — reconstrucción animada del panel de 3 columnas |
| 4–5 | `cw-featuretabs` (+ versión móvil) | «Everything you need in one place»: 8 tabs (Workout builder, Meal planner, Client progress, Payments, Leads, Check-in & forms, Automations, Client app), cada uno con pantalla demo + enlace «Explore …» |
| 6 | `coachway-platform` | «Every part of coaching, on one screen.» — 8 pantallas interactivas (Inbox, Clients, Nutrition, Workouts, Check-ins, Automations, Leads, Forms) con una línea de venta cada una |
| 7 | `coachway-languages` | «You write it once. Aino still reads Finnish.» — teléfono que cambia de idioma (æ, ø, å, ä, ö) |
| 8 | `coachway-mealbuilder` | «A full meal plan for their goal, in under a minute.» — vídeo del producto real montando un plan |
| 9 | `cw-mealcorner` | «Place a recipe and the macros settle on target» — desayuno con 3 recetas y macros que aterrizan |
| 10 | `cw-nutri` | «Nutrition that bends to the client, not the other way round» — los 4 modos de registro (buscar, código de barras, foto, receta) y los 3 niveles de control del coach |
| 11 | `cw-clientapp` | «They open the app and the day's food is waiting» — pantallas de la app cliente (Today, pasos, Push day, player de vídeo, progreso, medidas, chat, check-in) |
| 12 | `cw-checkin` | «Read a client's whole week in one glance» — check-in completo de una clienta ficticia (Jane Hansen: ratings, respuestas, −1 kg, 75→71→70) |
| 13 | `cw-spotlight` | «Why coaches switch — and stay»: ~12 testimonios con nombre, país y seguidores |
| 14 | `cw-videos` | 5 vídeo-testimonios (0:54–1:52) |
| 15 | `cw-bento` | «Everything, in one place» — bento grid con micro-animaciones por tarjeta (su sección más trabajada: 71KB de CSS) |
| 16 | `cw-support` | «Replies in minutes, seven days a week» — soporte humano como feature |
| 17 | `cw-tpstrip` | «What coaches actually wrote» — reseñas Trustpilot citadas |
| 18 | `cw-cases` | «Real results from real coaches» — casos de estudio (Rene Macapili, Frederik Aagaard, Edda…) con cifras |
| 19 | `cw-team` | «A team with a combined 10+ years of experience» — cara del equipo |
| 20 | `cw-news` | Newsletter «Every Friday — Free» |
| 21 | `cw-articles` | «Long reads for coaches who want their week back» — puente al blog |
| 22 | `cw-close` | Cierre: «See what Coachway can do for your coaching business» + CTA final |

## Lo que hace funcionar esta landing

1. **Enseña el producto de verdad, 12 veces, antes de pedir nada.** Ninguna
   ilustración abstracta: reconstrucciones HTML animadas y vídeo real con la
   nota «the screen in the film is the live product, not a mockup».
2. **Prueba social en 5 formatos**: marquee de caras con seguidores, citas,
   vídeos, reseñas Trustpilot/Capterra, casos de estudio con cifras (150 %
   ingresos, 2×LTV). El número de seguidores de cada coach hace de moneda de
   credibilidad para el público objetivo.
3. **Una historia con protagonista ficticio**: Aino (Finlandia), Jane Hansen
   (check-in). Datos realistas, no lorem ipsum.
4. **Un solo CTA** repetido, siempre con el desactivador de riesgo al lado.
5. **Ritmo visual**: papel → tarjeta → bloque oscuro ancla → papel. Los
   eyebrows verdes marcan el compás.
6. Honestidad táctica: página de demo que promete ser «honesta sobre dónde
   encaja y dónde no»; en /es/ admiten que la app no está en español.

## Páginas de feature (plantilla común)

Todas siguen el mismo esqueleto: hero con claim del dolor → «In short» (resumen
en 2 líneas) → 5–9 sub-secciones con imagen slider + titular + microcopy →
checklist «All features» → 3 tarjetas «Keep exploring» (cross-links) → FAQ (3
preguntas, respuestas con postura) → 3 artículos del blog → CTA final con el
origen («built on knowledge from working with 150 online coaches over 6+
years»). CTA ~14 veces por página.

## Herramientas de conversión

- **Efficiency calculator**: nº clientes + workflows + tarifa/hora → horas y
  euros ahorrados al mes. «At this size, small bits of friction start eating
  whole afternoons.»
- **Coach income calculator**.
- **Coaching templates**: generadores de PAR-Q, contratos, bios, scripts
  copy-paste — lead magnets sin registro.
- **Ebooks** (7) y **masterclass replay** con registro.
- Book-a-demo: walkthrough de 15 min, «no commitment, no pressure».
