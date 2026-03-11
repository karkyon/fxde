import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@fxde/types': path.resolve(__dirname, '../../packages/types/src'),
      '@fxde/config': path.resolve(__dirname, '../../packages/config/src'),
      '@fxde/ui': path.resolve(__dirname, '../../packages/ui/src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
});