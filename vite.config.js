import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    target: 'es2022',
    // Three.js сам по себе весит ~700 КБ — это нормально, не шумим в логах
    chunkSizeWarningLimit: 1200,
  },
});
