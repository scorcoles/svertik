#!/usr/bin/env node
// Starts the tool: the engine is TypeScript, so it is loaded with tsx.
import { register } from 'tsx/esm/api';
register();
await import('../src/cli.ts');
