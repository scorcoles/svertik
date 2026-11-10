import '@svertik/ui/base.css';
import { mount } from 'svelte';
import App from './App.svelte';

mount(App, { target: document.getElementById('app')! });

// Fuera la pantalla de carga (con un fundido corto).
const boot = document.getElementById('boot');
if (boot) {
  boot.style.opacity = '0';
  setTimeout(() => boot.remove(), 220);
}
