
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Avoid 8080 (often IIS/proxy) — hitting the wrong listener shows ERR_CONNECTION_RESET.
    // strictPort: fail fast if busy so the URL always matches the terminal (no silent port bump).
    port: 5191,
    strictPort: true,
    host: true,
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: './index.html'
      }
    }
  }
});
