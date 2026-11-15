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
- [ ] **Steps / Stop Motion**: actualización del movimiento a intervalos, como animación a pocos FPS.
- [ ] **Time Warp**: acelerar, frenar, congelar, invertir o hacer ping-pong sobre una animación.
- [ ] **Echo / Trail**: copias de estados anteriores con separación temporal y desvanecimiento; revisar lo que ya cubre Trace.
- [ ] **Sequencer**: alternar valores siguiendo un patrón rítmico.
- [ ] **Envelope**: entrada, mantenimiento y salida para modular o disparar otros efectos.

## Composiciones

- [ ] Escenas anidadas, como composiciones de After Effects: desde la escena contenedora se tratan como una caja negra y se pueden abrir para editar sus objetos.
- [ ] Reloj local por composición, con duración propia. La contenedora controla inicio, offset, velocidad, reproducción inversa, bucle y remapeo temporal.
- [ ] Aplicar los moduladores de tiempo al reloj de una composición, además de a parámetros individuales.
- [ ] Resolver keyframes, expresiones, partículas y física con el mismo tiempo local, también al recorrer la animación hacia atrás o exportar.
- [ ] Aplicar posición, escala, rotación, opacidad y efectos al resultado completo de una composición.
- [ ] Definir el alcance de IDs y referencias entre escenas, impedir ciclos de anidación y reutilizar resultados cuando se evalúe el mismo tiempo local.
