# svertik: plan

Borrador vivo. Aquí se apunta lo decidido y lo pendiente antes de construir.

## Idea

Edición **no destructiva** de SVG, al modo de Cinema 4D: un SVG de partida que nunca se toca y una pila de modificadores (efectos) que se recalcula en tiempo real. Lo que sale se puede exportar como:

1. **SVG plano:** el resultado congelado.
2. **Configuración (JSON):** el SVG de origen, la pila y los parámetros.
3. **Código:** un fragmento JS que carga el runtime con esa configuración y aplica los efectos en vivo en cualquier web.

Como el motor solo necesita parámetros, animar (fase 2) consiste en cambiarlos en el tiempo.

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Modelo | **Pila lineal** sobre un solo objeto (el SVG importado) en la v1. El modelo de datos interno se prepara para un árbol (escena → objetos → modificadores) y así pasar a árbol tipo C4D sin rehacerlo. |
| Entrada | Formas y trazados: `path`, `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`, grupos y transformaciones; relleno y trazo planos. Texto, máscaras, clips y degradados complejos pasan sin deformar. |
| Efectos v1 | Desplazar (mover), esferizar, doblar, torcer, onda, ruido/jitter y agrietar. |
| Interfaz | Svelte 5 + Vite, en inglés (nombres de efectos incluidos). Documentación en español. |
| Componentes | Propios, con Storybook, sobre primitivas sin estilo de **Bits UI** (confirmado). Tweakpane solo para depurar o en las demos. |
| Orden | Motor primero, con una demo que se vea desde el principio (`apps/demos`, cadena sobre un rectángulo). |
| Agrietar | Con librería de recorte de polígonos (`polygon-clipping` o `clipper2-js`) en vez de escribirlo a mano. |
| Design system | En Penpot (archivo «Design System»), a través de su MCP; los tokens pasan a variables CSS de `packages/ui`. Tema **oscuro** de herramienta, **todo en JetBrains Mono**, acento **turquesa VERTIK** (#09fdd1, como relleno), densidad **compacta** (filas de 24 px, texto de 11 px), radio 0. Tokens en dos conjuntos: `primitives` y `theme/dark` (semánticos: surface, rule, text, accent, signal). |
| Motor | TypeScript, sin dependencias salvo que alguna compense (ver «Pendiente»). |
| No es otro Illustrator | La identidad es la pila de efectos no destructiva, la animación y el runtime para la web. De escena, solo lo mínimo al servicio de los efectos (primitivas, texto como forma, grupos, pivote, colocar). Nada de pluma, edición de nodos, dibujo a mano ni maquetación: para eso, Illustrator o Inkscape, y se importa el SVG. |
| Alcance | **Solo lo que el estándar SVG puede expresar.** Si SVG no lo tiene (posición del trazo dentro/fuera, varias páginas…), no se añade. |
| Repo | Público, `scorcoles/svertik`, demos en GitHub Pages, como los experimentos del Lab. |

## Arquitectura

### Monorepo (pnpm workspaces)

```
packages/engine   motor y runtime (TS). Vitest + snapshots de SVG.
packages/ui       componentes Svelte 5 + Storybook. Tokens de Penpot.
apps/editor       el editor. Playwright para los flujos clave.
apps/demos        páginas que solo usan el runtime con un JSON exportado.
```

### Motor

```
SVG ──importar──▶ Geometría ──modificador 1──▶ … ──modificador n──▶ Geometría ──render──▶ DOM en vivo / SVG plano
```

- **Importar:** las formas se convierten en trazados de curvas cúbicas, con las transformaciones aplicadas y el estilo de cada forma conservado.
- **Geometría interna:** formas con sus subtrazados (anillos cerrados o abiertos) de curvas cúbicas, y su estilo.
- **Modificador:** una función pura `(geometría, parámetros, contexto) → geometría` y un **esquema de parámetros**:
  - tipo: número, ángulo, punto, color, enum, booleano o semilla;
  - rango, paso y unidad;
  - si se puede animar.

  El esquema genera la interfaz (como el Gestor de Atributos), valida el JSON y, en la fase 2, define las pistas animables.
- **Tipos:**
  - **deformadores**, que mueven puntos: desplazar, esferizar, doblar, torcer, onda y ruido. Antes de deformar se subdivide hasta una tolerancia para que las curvas se doblen bien.
  - **generadores**, que cambian la topología: agrietar, al estilo de Voronoi Fracture, con número de trozos, semilla y separación.
- **Caché por etapas:** al cambiar un parámetro, se recalcula desde ese modificador hacia abajo.
- **Determinista:** todo lo aleatorio sale de una semilla, así que el mismo JSON da el mismo SVG.
- **Runtime:** modificadores separables uno a uno, para que el código exportado cargue solo los que use.
- **JSON con versión** (`"version": 1`), para poder migrar escenas antiguas.

### Editor (v1)

- Visor: el lienzo con el resultado en vivo y, opcionalmente, el original en fantasma o en modo wire.
- Lista: el objeto y su pila de modificadores, que se pueden reordenar, activar/desactivar y borrar. Se inspira en el Gestor de Objetos de C4D.
- Atributos: los parámetros del modificador seleccionado, con números que se arrastran como en C4D.
- Importar SVG (soltar archivo o pegar) y exportar en SVG, JSON y código.
- Deshacer y rehacer.
- Estado en la URL (escena comprimida), como iksynth.

## Fases

1. ~~**Motor mínimo:** importar, geometría, render y desplazar, con tests.~~
2. ~~**Deformadores:** subdivisión, esferizar, doblar, torcer, onda y ruido.~~
3. ~~**Agrietar.**~~ (líneas de grieta)
4. ~~**Design system en Penpot y `packages/ui` con Storybook.**~~ (primera tanda)
5. ~~**Editor v1:** lista, atributos, visor, importar y exportar.~~ (`apps/editor`, `pnpm editor`)
6. **Publicación:** repo público, Pages y página en vertik.net.

**Después:**
- animación con línea de tiempo, fotogramas clave y easing;
- primitivas y varios objetos (árbol tipo C4D);

## Pendiente de decidir

- **Salida de los deformadores:** curvas subdivididas tal cual (SVG más pesado) o reajustar curvas al final (más limpio, más trabajo). En la v1 van tal cual, con la resolución como parámetro de la escena.

## Hecho

- 2026-11-09: monorepo (pnpm), motor con importación, render (SVG plano y en vivo), caché por pasos y seis modificadores: transform, spherize, twist, bend, wave y noise, con tests (Vitest). Demo `chain`.
- 2026-11-09: design system en Penpot (tokens, fundamentos, componentes con variantes). `packages/ui`: Svelte 5 + Bits UI + Storybook 10, `tokens.css` generado desde `tokens/penpot.json` (`pnpm tokens`), componentes Button, NumberField (arrastre tipo C4D), Slider, Checkbox, Select, Tabs, Panel, ParamRow y StackItem. Historia `Editor/Live`: pila + atributos generados del esquema del motor + lienzo en vivo.
- 2026-11-09: iconos de 16 px (Penpot y código), crack, pantallas del editor en Penpot (default, menú «+», vacío) y `apps/editor`: barra con efectos, lienzo (Original/Wire), pila con árbol y arrastre, atributos por esquema, deshacer/rehacer, escena en la URL, exportar SVG/JSON/código.
- 2026-11-10: escena v2 (varios objetos y grupos con pila propia; el primero de la lista, delante), primitivas (barra vertical, dibujar arrastrando), 19 efectos en 4 grupos (Deform, Generate, Effect, Style) con dado (R), Step con efectos colgados, panel de código (JSON, JS con `onFrame` en un worker, SVG), zoom y tiradores en el lienzo con encuadre fijo, ojo, lápiz y desagrupar en la pila.

- 2026-11-10: nombre del documento editable en la barra (con deshacer); casilla y color en la misma fila (Fill, Stroke: `ParamList` en `packages/ui`); primitivas en gris neutro (#d9d9d9) en vez del turquesa del acento; color del lienzo en la fila View (solo para ver: no entra en el SVG, sí en la URL y el historial); Step se pliega.
- 2026-11-10: al dibujar una primitiva se ve la forma real (con su estilo y un contorno de acento), no un rectángulo; doble clic en la herramienta la pone en el centro de lo que se ve.
- 2026-11-10: recuadro de selección con esquinas para escalar y zona exterior para rotar (⇧ = 15°) y rótulo junto al puntero. Actuadores de efecto (`apps/editor/src/gizmos.ts`): Spherize (esfera de alambre y radio), Twist (círculo, arco del ángulo y su punta), Rotate 3D (anillos X/Y/Z con los colores de C4D, arrastrables) y Wave (la onda y su amplitud). Tenues en reposo; encendidos al pasar, arrastrar o cambiar valores en el panel.
- 2026-11-10: selección múltiple (⇧ + clic en lienzo o pila, ⌘ en la pila); arrastrar mueve toda la selección; ⌘G agrupa los seleccionados; Supr los borra. Barra «Arrange» arriba del lienzo: alinear (6), distribuir (2), voltear (2). Voltear también en Transform (flipX/flipY en la colocación del motor). Efecto Mirror (generador): eje, posición y «Original: keep/transform», con actuador. Unión y extremo del trazo en primitivas y en Paint.
- 2026-11-10: Boolean (generador; con `polygon-clipping`): unir, restar («Minus Front»: al de atrás se le quitan los de delante), intersectar y excluir, entre los hijos de un grupo o las copias de un Clone; las curvas se aproximan con tramos rectos. Efectos que usan otro objeto: parámetro de tipo `node` (desplegable con los objetos de la escena) y `ctx.target(id)`, que da la geometría del otro objeto en las coordenadas de la pila; el documento se evalúa en dos pasadas si alguien lo pide (esos nodos no van a caché). Clone en modo `object` (contorno, vértices o interior con semilla) y Path Wrap (enrolla el dibujo en el trazado más largo de otro objeto, estirado o a su longitud). En el panel, con un `mode`, solo se ve el grupo del modo activo.
- 2026-11-10: Gradient (efecto de estilo: lineal con ángulo o radial, relleno o trazo; `Shape.gradients` → `<defs>` en el SVG y en el lienzo), Clone lineal con «Even gaps», aviso de rendimiento (ms en el pie del lienzo; rojo pasado 50 ms), muestras en el selector de color (blanco, grises, negro y colores del documento), candado en parejas (ancho/alto; separación de Clone) y centro de transformación (`pivot` en la colocación; tirador en el lienzo con ⇧ para ajustar; al moverlo se compensa la posición para que el objeto no salte).
- 2026-11-10: Mosaic (generador): recorta el dibujo en teselas rect, triangle, hexagon o circle sobre columnas × filas, con separación X/Y en px (enlazable) y la red girada (`angle`); cada tesela es un elemento (Step, Color, Boolean). Solo superficies: las líneas abiertas se pierden. El recorte común vive en `packages/engine/src/clip.ts`. Rotate 3D: actuador fijo en la esquina del lienzo, como bola de rastreo (dentro inclina X/Y, borde azul gira Z).
- 2026-11-10: copiar, cortar, pegar (⌘C/⌘X/⌘V) y duplicar (⌘D): objetos con sus pilas o un efecto suelto; por el portapapeles del sistema (JSON con la marca `svertik`, vale entre pestañas); ids nuevos, cada pegado 16 px más allá; si el nombre existe, «Name copy», «Name copy 2»…; un SVG de fuera sigue entrando como objeto.
- 2026-11-10: Boolean con varios objetos seleccionados los agrupa y se aplica de una vez; modos de Boolean como botones con icono (iconos con relleno tenue opcional, `iconFills`, solo para estos cuatro: pendiente de pasar a Penpot); ⇧ durante un arrastre fija el eje (objetos: el del documento; tiradores de efecto: X o Y del punto).
- 2026-11-10: barra Arrange con los cuatro modos de Boolean (agrupan y aplican; sobre un grupo, cambian el modo). Damage (generador; referencia: el triángulo de «Yomi no Tsugai»): grietas que entran desde el borde (rumbo recto con quiebros secos, más anchas al nacer), desconchones en el borde y motas cerca de bordes y grietas, todo recortado como agujeros; semilla y `growth`.
- 2026-11-10: Damage con bordes orgánicos: cada agujero pasa por un desplazamiento fractal del punto medio (`Roughness`), así que a lo grande no quedan facetas rectas. Icono del peón rehecho (cabeza, collarín, flancos rectos y peana).
- 2026-11-10: Crack con modos lines/cut/shatter (shatter parte el objeto y separa los trozos; cada trozo, un elemento). Damage: trozos como elementos y grietas pasantes (`Through`). Glitch: bloques y barrido solo recortan lo que tocan (de 19 s a 0,26 s en el peor caso). Dado alrededor de los valores de partida (reparto en triángulo, 30 % del rango); botón «a cero». Flecha de seleccionar (V); tirador de punto más visible; color del lienzo como preferencia; botón de redibujar (↻). Arrastrar efectos entre objetos (⇧ = copiar). Gradient radial con centro, radio y foco, y color de paso. Efectos nuevos: Morph (de un objeto a otro, `amount`; con `steps`, la secuencia de pasos intermedios, cada uno un elemento, como Fusión en Illustrator) y Explosion (efector: aparta cada elemento de un centro, con giro y encogimiento).
- 2026-11-10: primitiva Text (opentype.js): una pieza por letra (Step letra a letra), kerning, tracking, varias líneas, alineación. Fuentes: registro en el motor (`registerFont`; el texto se rehace al llegar una). El editor trae JetBrains Mono normal y negrita y, en Chrome/Edge, «System fonts…» (API de fuentes locales, con permiso; cada fuente se lee al usarla). Fuente que falta: se dibuja con JetBrains Mono y el panel lo avisa. Importar un SVG con `<text>` avisa de que conviene trazarlo antes. Siguiente paso posible: fuentes de Google vía Fontsource (catálogo y .ttf con CORS por jsDelivr, comprobado). El peón, siempre la última primitiva.
- 2026-11-10: modos de fusión (`mix-blend-mode`, los 16 de CSS Compositing) en Display de cada objeto o grupo; el render los escribe en `style`, porque en SVG son CSS y no atributos. En un grupo se aplican a cada hijo; el del hijo manda.
- 2026-11-10: selector de color propio (`ColorPicker`: cuadro saturación/brillo, barra de tono y hex) con la paleta debajo, también para el color del lienzo (`ColorField compact`); el pie del lienzo, con fondo de panel para leerse sobre cualquier color de lienzo.
- 2026-11-10: Glitch (generador, solo geometría): franjas desplazadas (cuántas, qué parte se corre y cuánto), bloques recortados que aparecen desplazados dejando su hueco, separación en dos colores detrás, rayas que se escapan y líneas de barrido; cada franja es un elemento. Fractal con `Fit` (por defecto): el resultado cabe en la caja del dibujo original.
- 2026-11-10: Roughen (deformador): organic (rasgado fractal, con semilla) o koch (1–4 iteraciones; altura del pico, negativa = hacia dentro). Fractal (generador, IFS): sierpinski, carpet, tree (todos los niveles) y spiral; tope de 4 096 copias (baja la profundidad solo). El rasgado común está en `paths.ts` (`tearPolyline`).
- 2026-11-10: primitiva Pawn (peón de ajedrez, 120 × 200, con curvas): la forma de prueba de svertik, como la tetera en 3D. Icono `pawn` (pendiente de Penpot, con los de booleanos).
- 2026-11-10: más actuadores: Bend (eje doblado y su extremo), Ripple (anillos y longitud de onda), Taper (contorno y cantidad), Shear (paralelogramo y dos tiradores), Perspective y Envelope (cuadrilátero y malla), Cylinder (cilindro y wrap), Transform (aro que se arrastra para mover; tirador que gira y escala) y Clone (radio y ángulo de inicio, separación, desplazamiento).

## Siguiente

Orden propuesto (con las notas del usuario del 2026-11-10; el detalle, en «Ideas apuntadas»):

1. ~~**Arreglos rápidos de interfaz:** nombre del documento editable, muestras de color de Style alineadas, color de las primitivas distinto del acento, color del lienzo, plegar Step.~~
2. ~~**Primitivas:** al crearla, ver la forma real; doble clic en la herramienta = primitiva en el centro del lienzo.~~
3. ~~**Recuadro de selección útil:** escalar y rotar desde él; actuadores y wire del efecto seleccionado.~~ Actuadores para todos los deformadores salvo Noise y Melt (no tienen forma que dibujar), y para Clone.
4. ~~**Objetos:** alinear, distribuir, reflejar (horizontal/vertical).~~
5. ~~**Entre objetos** (librería de recorte): Boolean, Clone sobre otro objeto, deformador guiado por otro objeto (Path Wrap).~~
6. **Con esa librería:** Glitch y cara trasera de Cylinder. ~~Mosaic~~.
7. **Fase 2, animación:** línea de tiempo, fotogramas clave y easing. Después, composiciones y reescalado de tiempo.
   - **Interacciones** (después de la línea de tiempo, sobre su interpolación): panel «Interactions» por objeto con disparador (hover, clic/toque, entrar en pantalla, posición del puntero) y acción (llevar parámetros a otro valor con duración y easing, encender/apagar un efecto, nueva semilla, reproducir un tramo de la línea de tiempo). Modo Preview en el editor; el código exportado las incluye. Segunda capa a mano: `on('click', 'Pawn', …)` en el panel de código.
   - **Seguir al puntero** (al final): enlazar un parámetro a la posición del ratón (p. ej. el centro de Spherize). Ojo al rendimiento con efectos pesados (aviso de ms) y en móvil (sin hover: elegir qué hace el toque).
8. Publicar: repo en GitHub, Pages y página en vertik.net.
9. Penpot va por detrás: barra de primitivas y lápiz en las pantallas del editor.
10. Al final: pantallas estrechas.

## Ideas apuntadas

**Interfaz**
- Icono de enlazar/desenlazar en los pares de valores (escala X/Y, tamaño, etc.).
- Aviso de rendimiento cuando el recálculo vaya lento (ms por fotograma en el pie; aviso pasado un umbral).
- Plegar Step (y en general, los efectos con hijos).
- Selector de color con muestras rápidas: blanco, negro, varios grises y los colores que ya se usan en el documento.
- Más adelante: paletas de color (guardar, cargar y aplicar paletas).

**Efectos**
- Degradado (lineal/radial) como efecto de Style.
- Reflejo horizontal/vertical.
- Repetición lineal con escala: botón para repartir los huecos de forma uniforme según el tamaño de cada copia, no por sus centros.
- Trazo: esquinas y extremos (`stroke-linejoin`, `stroke-linecap`) ya están en el panel (primitivas y Paint); falta `stroke-miterlimit`. La posición del trazo (dentro/fuera) queda fuera: SVG no la tiene.

**Objetos y escena**
- **Bake** (más adelante): como «Current State to Object» de C4D. Crea un objeto nuevo (un grupo, una pieza por elemento) con el resultado ya como trazados normales y oculta el original con su pila intacta. Aplanar es una decisión explícita, sin perder nada.
- Alinear y distribuir objetos.
- Booleanos.
- Deformador basado en objetos (un trazado que guía la deformación).
- **Composición:** objeto que anida primitivas, SVG y animaciones; se entra para editarlo y animarlo por dentro, y fuera se ve como un solo objeto con su propia pila. Se renderizará como un `<g>` propio con `isolation: isolate`: su modo de fusión y su opacidad se aplican al bloque entero (hoy, en los grupos, se aplican a cada hijo).
- Modificador de tiempo para composiciones (una de 10 s pasa a 5 o 20 s).
- Huesos (rigging) para deformar un objeto.

**Exportar a PDF (más adelante):** con modal de tamaño (A4, Letter…, margen, orientación). Descartado de momento: jsPDF + svg2pdf no entienden los modos de fusión y la impresión del navegador varía entre navegadores; exportar distinto de lo que se ve frustra. Volver a mirarlo si aparece una vía fiable.

**Filtros SVG (más adelante):** Glow y otros efectos de render (`<filter>`: desenfoque, sombras…). Son estándar SVG, pero el usuario prefiere decidir antes cómo encajan; de momento, solo geometría.

**Fase 3:** rejilla de fondo y ajuste a la rejilla (después de la animación).

**Fase mil:** plugins; un lenguaje tipo p5.js como alternativa a los objetos.

**Al final del todo:** web de documentación.
