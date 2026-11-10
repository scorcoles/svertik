#!/usr/bin/env node
// Arranca la herramienta: el motor está en TypeScript, así que se carga con tsx.
import { register } from 'tsx/esm/api';
register();
await import('../src/cli.ts');
