import { existsSync } from 'node:fs';
import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

import { createViteConfig, targets } from '../vite.config.js';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const distDir = resolve(rootDir, 'dist');
const publicDir = resolve(rootDir, 'public');

const args = process.argv.slice(2);
const modeIndex = args.indexOf('--mode');
const mode = modeIndex !== -1 && args[modeIndex + 1]
  ? args[modeIndex + 1]
  : 'production';

async function prepareDistDirectory() {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  if (existsSync(publicDir)) {
    await cp(publicDir, distDir, { recursive: true });
  }
}

async function runBuild() {
  await prepareDistDirectory();

  for (const target of Object.keys(targets)) {
    await build(createViteConfig({ target, mode }));
  }
}

runBuild().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});