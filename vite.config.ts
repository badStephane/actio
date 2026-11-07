import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const host = process.env.TAURI_DEV_HOST;

// https://vitejs.dev/config/
export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: 'ws', host, port: 1421 }
      : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    // Tailwind 4 exige Chrome 111 / Safari 16.4 (@layer, @property, color-mix) : WebView2 sous
    // Windows, WKWebView de macOS 13.3+ (bundle.macOS.minimumSystemVersion) et la démo web.
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome111' : 'safari16.4',
    // Vite 8 : minification par Oxc (esbuild n'est plus embarqué).
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
}));
