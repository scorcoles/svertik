# TODO

- Revisar el parámetro `gradientTransform` del efecto Gradient: está oculto temporalmente en el editor; decidir su UX y cómo documentar su sintaxis y coordenadas.

## Moduladores de tiempo

Aplicables a posición, rotación, escala, opacidad y parámetros animables de otros efectos. Deben ser reproducibles al saltar entre instantes, con semilla cuando intervenga el azar.

Primera tanda: **Vibration, Oscillator, Shake y Pulse**, compartiendo la lógica de señales temporales.

- [x] **Wiggle / Vibration**: variación aleatoria suave con amplitud, frecuencia, fase y semilla, por elemento o para todo el objeto.
- [x] **Oscillate / Oscillator**: ondas seno, triangular, cuadrada y diente de sierra, con amplitud, frecuencia y fase.
- [x] **Pulse**: golpes repetidos con ataque y caída regulables.
- [x] **Shake**: sacudida puntual que pierde fuerza, como una cámara después de un impacto.
- [ ] **Spring**: seguimiento con muelle, rebote y amortiguación.
- [ ] **Inertia / Follow**: seguimiento de un valor con retraso y suavidad.
- [ ] **Flicker**: parpadeos irregulares, desde una vela hasta un fluorescente.
- [ ] **Random Walk**: deriva aleatoria continua, sin saltos entre valores.
- [ ] **Wind / Turbulence**: movimiento orgánico con ráfagas y varias escalas de ruido.
- [ ] **Orbit**: movimiento circular o elíptico, con fase y orientación.
- [x] **Steps / Stop Motion** (Playback FPS en Composiciones): actualización del movimiento a intervalos, como animación a pocos FPS.
- [x] **Time Remap / Time Warp** (claves, señales de reloj y reproducción): acelerar, frenar, congelar, invertir o hacer ping-pong sobre una animación.
- [ ] **Echo / Trail**: copias de estados anteriores con separación temporal y desvanecimiento; revisar lo que ya cubre Trace.
- [ ] **Sequencer**: alternar valores siguiendo un patrón rítmico.
- [ ] **Envelope**: entrada, mantenimiento y salida para modular o disparar otros efectos.

## Composiciones

- [x] Escenas anidadas, como composiciones de After Effects: desde la escena contenedora se tratan como una caja negra y se pueden abrir para editar sus objetos.
- [x] Reloj local por composición, con duración propia. La contenedora controla inicio, offset, velocidad, reproducción inversa, bucle y remapeo temporal.
- [x] Aplicar Oscillate, Wiggle, Pulse y Shake al reloj de una composición, además de a efectos geométricos.
- [x] Marcadores de timeline editables, saltos desde los controles de tiempo y reutilización como offset local.
- [x] Resolver keyframes, expresiones, partículas y física con el mismo tiempo local, también al recorrer la animación hacia atrás o exportar.
- [x] Crear composiciones vacías, desde una selección o importando proyectos/JSON; edición por niveles con navegación, guardado íntegro y deshacer.
- [ ] Ejecutar interacciones de los objetos internos desde la escena contenedora (se conservan y funcionan al abrir la composición).
- [ ] Recorte opcional del resultado al documento de la composición.
- [x] Aplicar posición, escala, rotación, opacidad y efectos al resultado completo de una composición.
- [x] IDs y referencias aislados por composición; validación de ciclos y límite de 32 niveles. Cachés de geometría y efectos conservadas durante la evaluación.
