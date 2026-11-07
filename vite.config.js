import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// BASE_PATH=./ (set by the deploy workflow) makes every asset path relative,
// so the built site works at any URL, including after a repository rename.
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH || '/',
});
