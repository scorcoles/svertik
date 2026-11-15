---
name: svertik editor
description: Editor SVG no destructivo con pila de efectos y timeline; una consola nocturna de dibujo técnico.
colors:
  accent-fill: "#09FDD1"
  accent-on: "#00211B"
  accent-selection: "#0F2A26"
  signal-error: "#FF6B5E"
  signal-warning: "#FFD166"
  timeline-playhead: "#EDEDED"
  surface-field: "#0B0B0B"
  surface-app: "#141414"
  surface-panel: "#1B1B1B"
  surface-hover: "#232323"
  surface-raised: "#2E2E2E"
  rule-default: "#2E2E2E"
  rule-strong: "#3D3D3D"
  text-primary: "#EDEDED"
  text-secondary: "#A8A8A8"
  text-muted: "#8C8C8C"
  text-disabled: "#5A5A5A"
  gizmo-x: "#FF5C5C"
  gizmo-y: "#6BDC6B"
  gizmo-z: "#5C8CFF"
typography:
  title:
    fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.3
    fontFeature: "tnum"
  body-strong:
    fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.3
  label:
    fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "10px"
    fontWeight: 400
    lineHeight: 1.3
  badge:
    fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "9px"
    fontWeight: 400
    letterSpacing: "0.08em"
rounded:
  none: "0px"
spacing:
  "2": "2px"
  "4": "4px"
  "6": "6px"
  "8": "8px"
  "12": "12px"
  "16": "16px"
  "24": "24px"
  "32": "32px"
components:
  button:
    backgroundColor: "{colors.surface-panel}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.none}"
    padding: "0 12px"
    height: "24px"
  button-hover:
    backgroundColor: "{colors.surface-hover}"
  button-primary:
    backgroundColor: "{colors.accent-fill}"
    textColor: "{colors.accent-on}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.none}"
    padding: "0 12px"
    height: "24px"
  button-pressed:
    backgroundColor: "{colors.accent-selection}"
    textColor: "{colors.accent-fill}"
  icon-button:
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.none}"
    size: "24px"
  icon-button-active:
    backgroundColor: "{colors.accent-selection}"
    textColor: "{colors.accent-fill}"
  number-field:
    backgroundColor: "{colors.surface-field}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "0 6px"
    height: "20px"
  select:
    backgroundColor: "{colors.surface-field}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.none}"
    padding: "0 6px"
    height: "20px"
  segment:
    backgroundColor: "{colors.surface-field}"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.none}"
    padding: "0 8px"
    height: "18px"
  segment-on:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.accent-fill}"
  tab:
    backgroundColor: "{colors.surface-field}"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.none}"
    padding: "0 12px"
    height: "24px"
  tab-active:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text-primary}"
  stack-item:
    backgroundColor: "{colors.surface-panel}"
    textColor: "{colors.text-primary}"
    typography: "{typography.body}"
    padding: "0 8px"
    height: "24px"
  stack-item-selected:
    backgroundColor: "{colors.accent-selection}"
  panel:
    backgroundColor: "{colors.surface-panel}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.none}"
---

# Design System: svertik editor

<!-- Fuente normativa de los tokens: packages/ui/tokens/penpot.json, que se edita a mano (ya no se sincroniza con Penpot) → packages/ui/src/lib/tokens.css (generado con `pnpm tokens`, no se edita a mano). Este documento los describe; si discrepan, mandan los tokens. -->

## Overview

**Creative North Star: "La Consola Nocturna"**

El editor es una sala de control a oscuras: monoespaciado, numérico y tabular, como un programa de CAD de los que corrían en MS-DOS. Todo se lee como un instrumento: filas de altura fija, cifras alineadas, reglas de un píxel y ni una curva. La interfaz es aparato. Lo que brilla es la obra en el lienzo y un único trazo de fósforo turquesa que señala lo activo.

La densidad es alta a propósito. Es una herramienta de autor para sesiones largas, donde cada parámetro tiene que estar a la vista y a un arrastre. La jerarquía no viene de tamaños grandes ni de color, sino del peso (regular o negrita), del paso de gris (primario, secundario, apagado) y de la posición en la retícula. La profundidad se construye con capas de grafito, nunca con sombras.

El sistema rechaza expresamente las esquinas redondeadas y el estilo SaaS; las sombras, el cristal y los degradados; y la iconografía decorativa. Solo tiene tema oscuro (`color-scheme: dark`).

**Key Characteristics:**
- Una sola familia monoespaciada (JetBrains Mono) para toda la interfaz, a 11 px, con cifras tabulares.
- Radio cero en todo, salvo los tiradores circulares del lienzo.
- Reglas de 1 px y filas de 24 px como unidad de ritmo.
- Grafito en capas para la profundidad; turquesa solo para lo activo, lo seleccionado y el foco.
- Controles numéricos que se arrastran (scrub) como en un programa de CAD.

## Colors

Grafito neutro sin tinte y un solo trazo de fósforo turquesa; el resto de colores solo aparece como señal funcional.

### Primary
- **Trazo de Fósforo** (accent-fill): la marca de lo activo. Botón primario, foco (`outline` de 1 px), borde del campo mientras se arrastra, segmento y pestaña activos, barra de 2 px de la fila seleccionada, rango del slider, palabras clave en el panel de código y migas de pan pulsables.
- **Tinta sobre Fósforo** (accent-on): texto sobre el turquesa, en el botón primario y en la selección de texto.
- **Halo de Fósforo** (accent-selection): fondo de lo seleccionado o pulsado (fila de la pila, botón activo, icono expandido). Es un turquesa casi negro que se lee como «encendido» sin gritar.

### Neutral
- **Grafito Profundo** (surface-field): el hueco de los campos de entrada. Es más oscuro que el panel, como una ranura.
- **Grafito** (surface-app): fondo general de la aplicación.
- **Grafito de Panel** (surface-panel): paneles, filas de la pila y botones en reposo.
- **Grafito de Paso** (surface-hover): respuesta al pasar el puntero.
- **Grafito Elevado** (surface-raised): menús desplegables, segmento y pestaña activos. También sirve de regla por defecto (rule-default), con el mismo valor.
- **Regla Marcada** (rule-strong): bordes de botón, campo al pasar el puntero, pista del slider y borde de los menús.
- **Niebla** (text-primary): texto principal y valores.
- **Ceniza** (text-secondary): títulos de sección, iconos en reposo y texto de apoyo.
- **Humo** (text-muted): unidades, metadatos, chevrons, opciones inactivas, textos vacíos y la barra de estado. Pasa AA sobre el panel y el paso del puntero, pero no sobre el grafito elevado: en los menús, las cabeceras usan ceniza.
- **Carbón** (text-disabled): solo controles desactivados de verdad. No sirve como «gris discreto» para texto informativo: no llega a AA (2,5:1).

### Señales funcionales
- **Error** (signal-error): borde del campo con valor no válido y papelera al pasar el puntero. Nunca es decorativo.
- **Ejes del gizmo** (gizmo-x, gizmo-y, gizmo-z): rojo, verde y azul en las guías de transformación del lienzo, por convención de CAD/3D. No salen del lienzo.
- **Aviso** (signal-warning): avisos de diagnóstico, exportación y fuentes, y el botón de depuración cuando hay avisos.
- **Cabeza de reproducción** (timeline-playhead): la línea del tiempo actual en el timeline, en niebla. No usa el rojo de error, que se leería como alarma.
- **Superposiciones sobre la obra**: el lienzo y el modo Play usan negro o blanco semitransparente (rgba) para tiradores, guías y velos encima del dibujo. No son tokens a propósito: tienen que leerse sobre cualquier color de la obra, no sobre el grafito.

### Named Rules
**The One Phosphor Rule.** El turquesa marca solo lo activo, lo seleccionado, lo enfocado o lo pulsable. Nunca es decoración, fondo de zona ni color de marca. Si nada en pantalla está activo, casi no debería verse turquesa.

**The Signal-Only Rule.** Cualquier color que no sea grafito ni fósforo tiene que significar algo (error, aviso, eje). Un color sin función no entra.

## Typography

**Display Font:** no hay; la interfaz no usa tamaños de titular.
**Body Font:** JetBrains Mono (con ui-monospace, SFMono-Regular, Menlo, monospace)
**Label/Mono Font:** la misma; todo es monoespaciado.

**Character:** Un solo tipo de terminal para todo, como una consola de CAD. Las cifras tabulares (`font-variant-numeric: tabular-nums`) mantienen quietos los valores mientras se arrastran.

### Hierarchy
- **Title** (700, 12px, 1.3): títulos de diálogo, menú principal y avisos flotantes.
- **Body** (400, 11px, 1.3): todo el texto de la interfaz, valores y filas. Es la base de `:root`.
- **Body Strong** (700, 11px): botones, títulos de panel y sección, y filas de objeto en la pila (frente a las de efecto).
- **Label** (400, 10px): unidades, prefijos, metadatos y chevrons.
- **Badge** (400, 9px, 0.08em, mayúsculas): insignias discretas como «alpha», con borde de 1 px y sin relleno.

### Named Rules
**The Weight-Not-Size Rule.** La jerarquía se hace con peso y paso de gris, no subiendo de tamaño. El rango útil es de 9 a 12 px. El token de 14 px existe, pero el editor no lo usa.

## Layout

Retícula de aplicación a pantalla completa (`100dvh`): barra superior, área principal y barra de estado. El área principal tiene tres columnas: un raíl de modificadores a la izquierda, el área de trabajo flexible (lienzo, timeline y paneles maximizables) y un inspector fijo de 300 px a la derecha. Un panel se puede maximizar y ocupar toda el área.

La unidad de ritmo es la fila de 24 px (`--sv-size-row`): cabeceras de panel y sección, filas de la pila, botones y pestañas. Los campos miden 20 px y los segmentos 18 px, así que encajan dentro de una fila. El espaciado sigue la escala 2, 4, 6, 8, 12, 16, 24 y 32 px, y la mayoría de los rellenos están entre 4 y 12 px. La pila se sangra 12 px por nivel de profundidad.

Es solo para escritorio. Existe un punto de corte a 760 px que apila el inspector bajo el área de trabajo como red de seguridad, pero no es una versión para móvil (ver PRODUCT.md).

### Named Rules
**The Row Rule.** Todo control interactivo cabe en una fila de 24 px. Lo que no cabe se replantea; no se hace más alto.

## Elevation & Depth

Plano. La profundidad se construye con capas de grafito: el hueco del campo (más oscuro), el fondo de la aplicación, el panel, el paso del puntero y el elemento elevado (más claro). Los menús desplegables se separan con un grafito más claro y una regla marcada de 1 px, no con sombra.

Excepciones observadas que son funcionales y no decorativas: un anillo de 1 px negro semitransparente que separa los tiradores del lienzo de cualquier fondo, un anillo de 2 px de halo de fósforo para lo seleccionado en el lienzo. La tarjeta del estado vacío es plana, con regla de 1 px y sin sombra. También es excepción el cristal (`backdrop-filter: blur`) de los controles que flotan sobre la obra: los botones «← Back» y «Finish pen» del lienzo y dos controles del modo Play. Mantienen legible el control sobre cualquier dibujo; no se usa en paneles ni menús.

### Named Rules
**The Graphite Layers Rule.** Si algo tiene que destacar, se aclara un paso de grafito o se le pone una regla de 1 px. No se le añade sombra, desenfoque ni degradado.

## Shapes

Geometría cuadrada sin excepción en la interfaz: radio 0 (`--sv-radius-none`) en botones, campos, menús, pestañas, paneles y casillas. Los bordes son reglas de 1 px. La casilla dibuja su marca con trazo de 1,5 px y remates cuadrados.

La única forma redonda son los tiradores y el pivote del lienzo (círculos), porque son objetos de manipulación sobre la obra, no interfaz. Las cruces de 1 px que los atraviesan mantienen el lenguaje de dibujo técnico.

## Components

### Buttons
Interruptores de consola: cuadrados, compactos y en negrita.
- **Shape:** sin redondeo (0px), 24 px de alto y regla marcada de 1 px.
- **Default:** grafito de panel con texto niebla en negrita; al pasar el puntero, grafito de paso.
- **Primary:** relleno de fósforo con tinta sobre fósforo. Al pasar el puntero, un 10 % más de brillo (`filter: brightness(1.1)`).
- **Pressed (toggle):** halo de fósforo de fondo, borde y texto en fósforo.
- **Icon button:** 24 × 24 px, sin fondo y en ceniza. Al pasar el puntero se pone en niebla sobre grafito de paso; activo o expandido, en fósforo sobre halo.
- **Disabled:** opacidad del 40 % (35 % en los de icono).

### Inputs / Fields
Ranuras de lectura: más oscuras que el panel, con valor tabular.
- **Style:** grafito profundo, regla de 1 px por defecto y 20 px de alto. La unidad o el prefijo van en humo a 10 px.
- **Scrub:** arrastrar en horizontal cambia el valor (cursor `ew-resize`). Mientras se arrastra, el borde se pone en fósforo.
- **Edit / Focus:** al editar, el borde se pone en ceniza. Con foco de teclado, contorno de fósforo de 1 px separado 1 px.
- **Error / Disabled:** borde de error en rojo señal; desactivado al 40 % de opacidad.
- **Select:** el mismo hueco que el campo, con chevron en humo. El menú desplegable usa grafito elevado y regla marcada, el elemento resaltado grafito de paso y el seleccionado texto en fósforo.

### Segmented / Tabs
- **Segmented:** segmentos de 18 px en hueco de campo dentro de una regla de 1 px. El activo se marca en fósforo sobre grafito elevado.
- **Tabs:** pestañas de fila completa (24 px) que reparten el ancho. La activa va en niebla sobre grafito elevado; las demás, en humo sobre hueco de campo.

### Panels / Sections
- **Panel:** grafito de panel, regla de 1 px y cabecera de 24 px con título en negrita a 11 px y metadato en humo a 10 px.
- **Section:** cabecera plegable de 24 px con chevron en humo y título en ceniza negrita, que pasa a niebla al pasar el puntero.

### Slider
Pista de 2 px en regla marcada, rango en fósforo y un tirador rectangular de 6 × 12 px en niebla, sin redondeo.

### Stack Item (componente distintivo)
La fila de la pila de modificadores, el corazón del editor.
- 24 px de alto, sangría de 12 px por nivel y los objetos en negrita frente a los efectos en regular.
- **Seleccionada:** fondo de halo de fósforo, barra de fósforo de 2 px en el borde izquierdo e icono en fósforo.
- **Acciones bajo demanda:** el ojo, la papelera y el interruptor aparecen solo al pasar el puntero o con foco. El ojo tachado y el candado activo se quedan visibles porque informan de un estado. La papelera se pone en rojo señal al pasar el puntero.
- **Renombrar:** campo en línea en hueco de campo con borde de fósforo.

### Canvas gizmos
Guías de transformación sobre la obra: líneas de 1 px, tiradores circulares con cruz de 1 px y anillo oscuro de separación, y ejes en rojo, verde y azul por convención.

## Do's and Don'ts

### Do:
- **Do** usar los tokens `--sv-*` de `packages/ui`. Un valor nuevo se da de alta en `packages/ui/tokens/penpot.json` y se regenera con `pnpm tokens`, no se escribe en el componente.
- **Do** reservar el Trazo de Fósforo para lo activo, seleccionado, enfocado o pulsable (The One Phosphor Rule).
- **Do** construir la jerarquía con peso (400/700) y paso de gris (niebla, ceniza, humo, carbón) dentro de 9–12 px.
- **Do** encajar cada control en la fila de 24 px y separar con reglas de 1 px.
- **Do** mostrar las acciones secundarias de una fila solo al pasar el puntero o con foco, y dejar visibles las que informan de un estado (oculto, bloqueado).
- **Do** dar a cada elemento interactivo un foco visible: contorno de fósforo de 1 px separado 1 px.

### Don't:
- **Don't** redondear esquinas ni usar botones en píldora, tarjetas suaves o la estética de dashboard SaaS.
- **Don't** usar sombras decorativas, cristal (backdrop-filter), brillos de neón ni degradados en la interfaz (salvo los controles que flotan sobre la obra; ver Elevation & Depth).
- **Don't** añadir iconografía decorativa: ilustraciones, emojis o iconos de colores. Los iconos son de línea: monocromos, de 16 px, con trazo de 1 px, remates cuadrados y esquinas en inglete. Heredan el color del texto (`currentColor`) y solo admiten un relleno interior al 40 %.
- **Don't** introducir una segunda familia tipográfica ni tamaños de titular en la interfaz del editor.
- **Don't** usar color sin función (The Signal-Only Rule): ni rojo, ni verde, ni azul fuera de error, aviso y ejes del gizmo.
