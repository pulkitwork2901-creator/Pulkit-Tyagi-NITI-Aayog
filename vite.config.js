import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// BASE_PATH lets the same build work at a GitHub Pages sub-path (/repo-name/).
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH || '/',
});
