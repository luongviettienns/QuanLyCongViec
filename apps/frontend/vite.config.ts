import type { IncomingMessage } from 'http';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function isSpaNavigation(req: IncomingMessage): boolean {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return false;
  }

  // 1. Authenticated API calls from frontend fetch/axios include the Authorization header
  if (req.headers.authorization) {
    return false;
  }

  // 2. Explicit AJAX calls
  if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
    return false;
  }

  // 3. Server-Sent Events (SSE) realtime streams
  const accept = req.headers.accept || '';
  if (accept.includes('text/event-stream')) {
    return false;
  }

  // 4. Browser document navigation signals (address bar, link click, page reload)
  const secFetchDest = req.headers['sec-fetch-dest'];
  const secFetchMode = req.headers['sec-fetch-mode'];
  if (secFetchDest === 'document' || secFetchMode === 'navigate') {
    return true;
  }

  // 5. Standard browser HTML accept
  if (accept.includes('text/html')) {
    return true;
  }

  // 6. Any other direct browser request to these shared SPA paths without Bearer token
  // should serve the SPA rather than leaking a raw 401 Unauthorized API error
  return true;
}

const apiProxy = {
  target: 'http://localhost:3000',
  changeOrigin: true,
  bypass(req: IncomingMessage) {
    if (isSpaNavigation(req)) {
      return '/index.html';
    }
  },
};

export default defineConfig({
  plugins: [react()],

  server: {
    proxy: {
      '/tasks': apiProxy,
      '/categories': apiProxy,
      '/teams': apiProxy,
      '/auth': apiProxy,
      '/notifications': apiProxy,
      '/realtime': apiProxy,
    },
  },

  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (/[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/.test(id)) {
              return 'vendor-react';
            }
            if (id.includes('chart.js') || id.includes('react-chartjs-2')) {
              return 'vendor-charts';
            }
            if (id.includes('@ant-design/icons')) {
              return 'vendor-icons';
            }
            if (id.includes('antd') || id.includes('@rc-component') || id.includes('rc-')) {
              return 'vendor-antd';
            }
            if (id.includes('@dnd-kit')) {
              return 'vendor-dnd';
            }
          }
        },
      },
    },
  },
});
