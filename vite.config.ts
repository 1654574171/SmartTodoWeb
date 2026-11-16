import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // 本地开发时 /dav 也走同源代理，行为与 Netlify Functions 一致。
    proxy: {
      '/dav': {
        target: 'https://dav.jianguoyun.com',
        changeOrigin: true,
        secure: true,
        // 本地开发与线上代理行为一致：还原 POST + X-HTTP-Method-Override。
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            const url = new URL(req.url || '', 'http://localhost');
            const override = url.searchParams.get('__method') || proxyReq.getHeader('X-HTTP-Method-Override');
            if (override) {
              proxyReq.method = String(override);
              proxyReq.removeHeader('X-HTTP-Method-Override');
              url.searchParams.delete('__method');
              proxyReq.path = `${url.pathname}${url.search}`;
            }
          });
        },
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
  },
});
