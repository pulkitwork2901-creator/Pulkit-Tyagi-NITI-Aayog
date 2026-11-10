import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// BASE_PATH=./ (set by the deploy workflow) makes every asset path relative,
// so the built site works at any URL, including after a repository rename.
// Two pages: index.html (E&F-II Economic Monitor) and reform.html (Reform Evidence Board).
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH || '/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        reform: resolve(import.meta.dirname, 'reform.html'),
      },
    },
  },
});
