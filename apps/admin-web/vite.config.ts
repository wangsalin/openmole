import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/auth': 'http://localhost:3000',
      '/admin': 'http://localhost:3000',
      '/tenant': 'http://localhost:3000',
      '/open': 'http://localhost:3000',
      '/payment': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
    },
  },
});
