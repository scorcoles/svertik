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
| Componentes | Propios, con Storybook, sobre primitivas sin estilo de **Bits UI** (accesibilidad y comportamiento). Tweakpane solo para depurar o en las demos. |
| Design system | En Penpot, a través de su MCP; los tokens pasan a variables CSS de `packages/ui`. |
| Motor | TypeScript, sin dependencias salvo que alguna compense (ver «Pendiente»). |
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

1. **Motor mínimo:** importar, geometría, render y desplazar, con tests. Una demo que aplique un JSON.
2. **Deformadores:** subdivisión, esferizar, doblar, torcer, onda y ruido.
3. **Agrietar.**
4. **Design system en Penpot y `packages/ui` con Storybook.**
5. **Editor v1:** lista, atributos, visor, importar y exportar.
6. **Publicación:** repo público, Pages y página en vertik.net.

**Después:**
- animación con línea de tiempo, fotogramas clave y easing;
- primitivas y varios objetos (árbol tipo C4D);
- edición directa con el cursor («Illustrator lite»).

## Pendiente de decidir

- **Recortar polígonos para agrietar:** a mano (las celdas Voronoi son convexas, pero las formas con agujeros complican el recorte) o con una librería pequeña (`polygon-clipping`, `clipper2-js`).
- **Salida de los deformadores:** curvas subdivididas tal cual (SVG más pesado) o reajustar curvas al final (más limpio, más trabajo). Propuesta: tal cual en la v1, con la tolerancia como parámetro.
- **Penpot:** si ya tienes el MCP configurado y si el design system se hace antes del editor o en paralelo.
- **Orden de trabajo:** motor primero y la interfaz después (propuesta), o los dos a la vez.
