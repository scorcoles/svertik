# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Personas con perfil técnico y apetito por la animación, que buscan herramientas fuera de lo habitual:

- motion graphers que quieren gráficos vectoriales animados para la web;
- desarrolladores front-end muy visuales;
- gente que quiere hacer intros y piezas cortas animadas;
- nostálgicos de Flash: les atrae una herramienta de autor vectorial, con timeline y efectos, que publica directamente en la web.

Abren el editor para construir una pieza (un logo, un título, una intro, un objeto generativo), animarla y llevársela a una web.

Audiencia secundaria: **agentes de IA**. El motor tiene documentación en Markdown para agentes (`AGENTS.md`, `docs/ENGINE_AND_EFFECTS.md`, `docs/SCENE_RECIPES.md`). Un flujo previsto es que la persona monte una escena en el editor (por ejemplo, sin animaciones) y le pida a un agente lo que quiere sobre ella. El editor y el JSON (`SceneV1`) son dos puertas al mismo documento.

## Product Purpose

svertik es un editor SVG no destructivo. Una geometría de partida (SVG importado, primitiva o texto convertido a contornos) pasa por una pila de efectos que el motor recalcula en vivo, sin tocar nunca el original. Se anima con un timeline y se lleva a cualquier web tal cual: como SVG plano, como proyecto JSON o como código del runtime/player que reproduce los efectos y la animación.

Es un proyecto propio y open source (licencia MIT, © VERTIK), en alfa (0.0.2). Pronto tendrá dominio propio: svertik.com.

## Positioning

- **No destructivo de verdad:** el documento guarda la fuente y la pila de modificadores, no el resultado. Todo se puede reordenar, ajustar o quitar en cualquier momento.
- **SVG estricto de punta a punta:** exporta SVG estándar. El player solo carga los efectos que usa la escena, así que lo que se diseña se publica sin pasar por vídeo ni canvas.
- **Diseñado también para agentes:** las escenas son JSON validable con un motor y una CLI sin interfaz, y la documentación está pensada para que un agente genere y edite escenas.
- **Herencia de Flash y After Effects:** herramienta de autor con timeline, keyframes, expresiones, composiciones anidadas con reloj propio y moduladores de tiempo, pero nativa del SVG y de la web.

## Operating Context

- Aplicación web solo para escritorio (Svelte 5 y Vite) con lienzo, panel de pila de efectos, inspector de atributos, timeline, panel de código, notas de escena y diagnósticos. La interfaz está en inglés.
- Flujo de proyecto: guardar y abrir proyectos `.json` (⌘S, ⇧⌘S, ⌘O o arrastrando el archivo), demos integradas en el menú «svertik» y exportación a SVG, PNG, MP4 (un ciclo) y código.
- Uso con atajos de teclado (zoom, encuadre, guardar…). Es una herramienta de sesiones largas de trabajo.
- Herramientas hermanas del mismo monorepo: `apps/player` (página de demo del bundle incrustable), `apps/demos`, `packages/ui` (componentes Svelte sobre Bits UI, tokens desde Penpot, Storybook) y la CLI `svertik` (render a SVG/PNG/frames, esquema de efectos).

## Capabilities and Constraints

- Más de 50 efectos (Deform, Generate, Effect por elemento, Style, Filters), utilidades (Instance, Effector, Follow Path, Connector, Tracer, Look At), primitivas, texto a contornos con fuentes de Fontsource, keyframes con curvas de easing, expresiones numéricas por fotograma, composiciones anidadas con reloj local y moduladores (Oscillate, Wiggle, Pulse, Shake).
- Terminología propia que la interfaz debe respetar: *stack* (pila de modificadores), *effector* (contenedor de efectos por elemento), *composition*, *scene notes*, *markers*.
- El orden de capas sigue a Figma o Illustrator: el primer objeto se dibuja delante.
- Pendiente según `TODO.md`: más moduladores (Spring, Flicker, Random Walk…), interacciones de composiciones desde la escena contenedora, recorte por documento y la UX del parámetro `gradientTransform`.
- **Solo escritorio.** Este editor está pensado para escritorio: su interfaz es demasiado compleja para móvil o tableta, y no hay que adaptarla a pantallas pequeñas. En el futuro, las versiones para móvil y tableta llevarán su propia IA (inteligencia artificial integrada) en lugar de reducir esta interfaz: el usuario pedirá lo que quiere en vez de manejar la pila de efectos a mano. Cómo será exactamente esa experiencia está por decidir; en ningún caso será una versión responsive de este editor. Lo que ya existe para móvil (pellizco para hacer zoom y exportación MP4 «Play» ajustada a la pantalla) sigue siendo válido, pero no convierte este editor en una superficie móvil.

## Brand Commitments

- **Nombre:** svertik, siempre en minúscula.
- **Identidad propia de svertik.** Es «un experimento de VERTIK» y se acredita así, pero su interfaz no está obligada a seguir el lenguaje visual de VERTIK («El plano de cotas»). El sistema visual del editor se decide y documenta aparte.
- **Valores heredados de VERTIK que aplican al producto:** solo la verdad (nada de usuarios, cifras ni testimonios inventados) y lo provisional nunca se disfraza de terminado (la alfa se declara como alfa).

## Evidence on Hand

- Documentación real: `README.md`, `AGENTS.md`, `docs/ENGINE_AND_EFFECTS.md`, `docs/SCENE_RECIPES.md` y referencias autogeneradas en `packages/engine/docs/reference/`.
- Demos reales: 8 proyectos `.json` en `apps/editor/public/demos/` (compositions-boom, cross-fill, gravity-circle, motion-crosses, particles, physics-tidal-orbit, rhythm-crosses, time-remap-boom).
- **No existen todavía:** usuarios públicos, testimonios, métricas de uso, prensa ni casos de estudio. Nada de eso debe inventarse.

## Product Principles

1. **El original nunca se toca.** Cualquier función nueva debe mantener la edición reversible y la pila legible.
2. **Lo que ves es SVG publicable.** Si algo no puede salir como SVG estándar o por el player, debe decirlo claramente.
3. **Dos puertas, un documento.** Lo que se hace en el editor tiene que tener sentido en el JSON de la escena, y al revés, para que personas y agentes trabajen sobre lo mismo.
4. **Herramienta de autor, no de plantillas.** Se dirige a quien quiere controlar parámetros, tiempo y estructura. La profundidad se ofrece; no se esconde ni se simplifica a costa del control.
5. **Honestidad de alfa.** Los límites y lo que falta se muestran como tales; nada se presenta como más terminado de lo que está.
