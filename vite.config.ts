import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  base: '/',
  build: { target: 'es2022', sourcemap: false, assetsInlineLimit: 0 },
  test: { include: ['tests/**/*.test.ts'] },
});
