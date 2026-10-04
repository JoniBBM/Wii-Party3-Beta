import { defineConfig } from 'tsup';

// Ein einziges ESM-Bundle inkl. @insel/shared; native Module bleiben extern.
export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  noExternal: ['@insel/shared'],
  external: ['better-sqlite3', 'sharp'],
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
});
