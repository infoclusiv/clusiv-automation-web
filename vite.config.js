import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = fileURLToPath(new URL('.', import.meta.url));

export const targets = {
  background: resolve(ROOT_DIR, 'src/background/index.js'),
  content: resolve(ROOT_DIR, 'src/content/index.js'),
  sidepanel: resolve(ROOT_DIR, 'src/sidepanel/index.js')
};

function getOutputFormat(target) {
  return target === 'content' ? 'iife' : 'es';
}

export function createViteConfig({ target, mode = 'production' }) {
  if (!targets[target]) {
    throw new Error(`Unknown build target: ${target}`);
  }

  return {
    publicDir: false,
    build: {
      outDir: resolve(ROOT_DIR, 'dist'),
      emptyOutDir: false,
      minify: mode === 'production',
      sourcemap: mode !== 'production' ? 'inline' : false,
      rollupOptions: {
        input: targets[target],
        output: {
          entryFileNames: `${target}.js`,
          format: getOutputFormat(target),
          inlineDynamicImports: true
        }
      }
    }
  };
}

export default createViteConfig({ target: 'sidepanel' });