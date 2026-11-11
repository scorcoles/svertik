# TODO top

Lo que más estorbó al montar la demo «Reel» (`apps/editor/src/demo.ts`, `reelProject`) solo con primitivas, pilas y claves. Por orden de importancia.

## ~~1. Los efectores sobre un Clone miden sobre una sola copia~~ · hecho

Clone, Mirror y Fractal reencuadran (`reframe` en `ModifierDef`): los efectos de debajo miden sus fracciones sobre la caja de lo que generan. `NodeInfo.refs` guarda la caja de cada efecto y el editor dibuja con ella sus tiradores y actuadores. Los filtros miden sobre la caja del final de la pila. El reel ya no necesita el grupo.

## ~~2. Validar la escena~~ · hecho

`validateScene` en el motor (`packages/engine/src/validate.ts`). Errores (no se usa la escena): estructura, tipos de efecto o de primitiva desconocidos. Avisos (se usa, pero algo se ignoraría): parámetros que el esquema no conoce, parámetros `node` que no apuntan a nada, pistas con objeto, efecto o parámetro inexistente, ids repetidos e interacciones sin destino. El panel de código enseña el primer aviso en su pie (todos al pasar el ratón); abrir un proyecto y la página Play los sacan por consola. Un test comprueba que las demos no dan ninguno.

## ~~3. Repetir un movimiento~~ · hecho

Las pistas tienen `repeat` (cuántas veces; 0, sin parar) y `every` (segundos entre el comienzo de una vuelta y la siguiente; sin él, seguidas). Entre vueltas se queda el último valor. En la línea de tiempo, con una clave seleccionada, la barra muestra Repeat y every; las vueltas se dibujan como rombos tenues y la pista lleva un ↻. Las ráfagas del reel ya no rebobinan con claves `hold`.

## ~~4. Curvas de salida~~ · hecho

`expo-in`, `back-in`, `elastic-in` y `bounce-in`: las *out* al revés. Salen en el menú de curvas y en Stagger. La salida del rótulo del reel usa `back-in` (toma impulso antes de irse). Las *in-out* se dejan para cuando hagan falta.

## ~~5. Encender y apagar un efecto en el tiempo~~ · hecho

Una pista `on: 'modifier'` puede animar `enabled` (true / false; salta en cada clave). En el panel de atributos, la fila «On» lleva su rombo; con la pista creada, el ojo de la fila del efecto pone una clave. Apagado, un filtro no se emite: el RGB Split del reel solo existe mientras parpadea.

## ~~6. Mezcla de colores~~ · hecho, en OKLCH (no en OKLab)

OKLab no lo arreglaba: de turquesa a coral, su punto medio es un beige (`#c8bd98`), aún más apagado que en RGB (`#84b498`). En OKLCH, con el tono por el camino corto, sale un amarillo vivo (`#d7bf00`). `mixColor` mezcla ahora en OKLCH: si un extremo es gris, usa el tono del otro, y lo que se sale de sRGB se ajusta bajando el croma. Afecta a Tint, Paint, Morph, Color (gradient) y las claves de color. Entre negro y blanco, el medio es `#636363` (el centro perceptivo, como `color-mix(in oklch)` en CSS). Los degradados del efecto Gradient los interpola el navegador, en sRGB: SVG no permite otra cosa.

## ~~7. Ancla del texto~~ · hecho

Parámetro `anchor` del texto: `ink` (por defecto, como antes: el centro de la tinta), `left`, `center` o `right` (el borde o el centro del bloque según el avance de las letras, a media altura de las líneas según la fuente). Lo hace posible `Geometry.origin`: el punto del origen de un nodo que va en su posición (sin él, el centro de su caja). El pie del reel usa `center`.

## ~~8. Trim dentro de Stagger~~ · hecho

Start, End y Offset de Trim admiten peso, con End neutro en 1 (el trazo entero). Dentro de Stagger, Range o Field, con End a 0, las líneas se dibujan una detrás de otra. Dentro de Step también crecen copia a copia.

## Comprobado: escala 0 con efectos que miran otro objeto

Un nodo con Morph sobre otro objeto, puesto a escala 0, obliga a invertir una matriz singular. No falla: `invert` (`packages/engine/src/matrix.ts`) evita la división por cero, no salen NaN y el resultado es correcto a escala 0, 0,5 y 1. Si acaso, añadir un test que lo fije.

## ~~9. Paletas en el selector de color~~ · hecho

Un menú de paletas dentro del selector de color (`ColorPicker`): elegir una paleta y usar sus muestras, además de las del documento. Guardar las propias (las del documento, como paleta nueva), cargarlas y aplicar una paleta a la escena (cambiar sus colores por los de la paleta). Ver «paletas de color» en `docs/PLAN.md`.

## Siguiente

La lista está hecha. Queda el test de la escala 0 (arriba) si se quiere fijar.
