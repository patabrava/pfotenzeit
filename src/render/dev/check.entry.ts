/** Node entry for the renderer checks when vitest is unavailable. Built by vite.check.config.ts. */
import './renderer.check';
import { runAll } from './miniTest';

runAll().then((code) => {
  process.exitCode = code;
});
