# VERTIK: recap conceptual

Extracto de qué es VERTIK y qué hay en el Lab, como contexto para svertik. No es documentación técnica: es el «de qué va esto».

---

## 1. Qué es VERTIK

**Una práctica independiente de diseño y desarrollo para la web, desde 2008.** Una sola persona que habla los dos idiomas, el de diseño y el de código, y se une a equipos (estudios, agencias, marcas, empresas tecnológicas) sin quitarles la dirección.

- **Promesa:** «Tus proyectos, hechos realidad». Convertir buenas ideas en proyectos reales.
- **Papel:** colaborador, no protagonista. Primera persona del singular, sin nombre propio y sin aparentar un equipo grande.
- **Personalidad:** precisa, curiosa y directa. Editorial antes que corporativa, experimental pero nunca oscura, segura sin hype.
- **Prueba:** mientras no hay portfolio, la prueba es el propio oficio. Cada detalle tiene que enseñar diseño y código pensados a la vez.
- **Solo la verdad:** nada inventado, ni clientes ni cifras ni testimonios. Lo provisional nunca se disfraza de terminado.

### Lenguaje visual: «El plano de cotas»

La web es un dibujo técnico: **tinta negra sobre papel blanco** y un **rotulador turquesa** (#09fdd1) que solo marca lo que importa, siempre como relleno y nunca como texto ni línea fina.

- Retícula suiza de dos mitades: la etiqueta a la izquierda y el contenido desde la línea media.
- Geometría cuadrada: reglas de 1 px, radio cero, sin sombras.
- Una sola familia tipográfica (Familjen Grotesk). La jerarquía sale del tamaño, el peso y la posición, no de la decoración.
- El color llega en bandas a todo el ancho (gris, turquesa, negro), nunca en tarjetas tintadas.
- **El símbolo (dos picos) está vivo:** va dentro del titular como si fuera una palabra, los picos se inclinan hacia el puntero y una silueta turquesa guarda la forma en reposo. Su geometría no es un dibujo fijo: es un polígono **paramétrico** (altura de cada pico, desplazamiento) con esquinas redondeadas por curvas. Es SVG generado desde datos.

**Lo que rechaza:** la web negra con degradados de neón y objetos 3D flotando, el carrete de efectos tipo Awwwards sin claridad comercial, el folleto corporativo con fotos de stock, las plantillas SaaS, el homenaje retro-tech recargado y los rediseños a partir de plantillas o kits.

---

## 2. El Lab: qué tienen en común los experimentos

Cada experimento es una **pieza interactiva pequeña y autónoma**: su propio repo público, una demo y una página en vertik.net. No son demos técnicas: son **objetos para tocar**, con carácter propio.

Rasgos que se repiten:

1. **Un sistema, no una imagen.** Casi todo es generativo o físico: partículas, fibras, cuerpos blandos, órbitas. La imagen sale de reglas y parámetros.
2. **El cuerpo del usuario como entrada.** Cursor, arrastre, pellizco, mantener pulsado, doble toque o inclinar el móvil. El gesto altera el sistema de forma **sutil** antes que espectacular.
3. **Modos = miradas sobre el mismo sistema.** El mismo motor con otra piel. Los nombres van en inglés y **wire** (gris y negro, el esquema desnudo) va siempre el último. Enseña la estructura por debajo del acabado.
4. **Sonido generado**, no grabado, y ligado al gesto.
5. **Regenerar y compartir:** doble toque para uno nuevo, semilla visible (#67), estado en la URL.
6. **Referencias sin copia:** parten de una portada, una lámina o una web que admira el autor y se alejan hasta tener voz propia. A veces se reconocen con un homenaje explícito y a veces se omiten a propósito.
7. **Pie común:** créditos sobrios y «← Prev · Next →» para pasar de un experimento a otro.

### Los experimentos

| Experimento | Concepto | Herramienta |
|---|---|---|
| **vertikis** | Criaturas blandas de colores, con cara, que caen, se empujan y se aplastan. Se arrastran, se inflan hasta reventar y se crean nuevas. Homenaje a la home de yugop.com (2005). Incluye un tutorial paso a paso y una versión corta en p5.js. | Canvas y JS, sin librerías |
| **vortik** | Remolino de fibras inspirado en una portada de disco (Dysnomia, Dawn of Midi). El cursor lo remueve, el pellizco lo hace girar como a una patinadora, tiene un latido periódico y sonido de grave, scratches y tics. | Three.js |
| **sunburst** | Un cartel plano: rayos metálicos en zigzag alrededor de un agujero, con brillo cepillado e irisado. La luz sigue al cursor y el agujero crece al mantener pulsado. | Three.js, cámara ortográfica |
| **gravity** | Una tela de puntos que cae anillo a anillo en un pozo. El cursor es una masa que la deforma un poco y el toque lanza una onda con impacto sonoro. Rigor geométrico: anillos iguales y puntos a intervalos exactos. | Three.js |
| **iksystem** | Carta estelar viva y generativa: sistemas, rutas, puntos de salto con nombres inventados y órbitas en movimiento. Cada carta es una semilla (#N) y Prev/Next pasa a la carta vecina. Cinco paletas. | p5.js con canvas 2D |
| **iksynth** | Sintetizador audiovisual: sinte, bajo ácido y caja, con un secuenciador de 16 pasos. La canción entera viaja en la URL. Tiene un modo «unit» que lo convierte en aparato físico (aluminio, pantallita, ruedas). | Tone.js y Three.js |
| **ikworld** | *En curso.* Un planeta 2D redondo que se recorre a pie con un diablillo propio. Al llegar al final vuelves al principio. Día y noche al caminar, luz que se cuela y capas con niebla. | Three.js, vista plana |

La familia **ik-** (iksystem, iksynth, ikworld) va formando un pequeño universo propio.

### Fuera del Lab

- **Portfolio** (/portfolio/&lt;web&gt;/): copias de webs de clientes en las que VERTIK hizo el desarrollo, con una barra fija y común que da el crédito del diseño a su autor. Es otra expresión del principio «colaborador, no protagonista».
