import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiProxy = env.VITE_VERCEL_DEV_API_ORIGIN?.trim();

  return {
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  optimizeDeps: {
    // Avoid stale pre-bundle hashes (504 Outdated Optimize Dep) after dep changes / restarts.
    include: ['react-helmet-async'],
  },
  server: {
    // Avoid 8080 (often IIS/proxy) — hitting the wrong listener shows ERR_CONNECTION_RESET.
    // strictPort: fail fast if busy so the URL always matches the terminal (no silent port bump).
    port: 5191,
    strictPort: true,
    host: true,
    ...(apiProxy
      ? {
          proxy: {
            '/api': { target: apiProxy, changeOrigin: true },
          },
        }
      : {}),
  },
  build: {
    outDir: 'dist',
    /** Default 500 kB; app bundles KaTeX, PDF.js, charts, etc. — avoids noisy Vercel/Vite chunk warnings. */
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: {
        main: './index.html'
      }
    }
  }
  };
});
