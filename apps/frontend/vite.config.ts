import type { IncomingMessage } from 'http';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

function isHtmlDocumentNavigation(req: IncomingMessage): boolean {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return false;
  }

  const accept = req.headers.accept || '';

  // 1. Explicit JSON or SSE requests are API calls and must NEVER bypass to HTML
  if (accept.includes('application/json') || accept.includes('text/event-stream')) {
    return false;
  }

  // 2. Explicit AJAX calls
  if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
    return false;
  }

  // 3. Browser document navigation signals (address bar navigation, link click, tab reload)
  const secFetchDest = req.headers['sec-fetch-dest'];
  const secFetchMode = req.headers['sec-fetch-mode'];
  if (secFetchDest === 'document' || secFetchMode === 'navigate') {
    return true;
  }

  // 4. Standard HTML Accept header from browsers
  if (accept.includes('text/html')) {
    return true;
  }

  // 5. Default: NOT an HTML document navigation -> forward to backend API
  return false;
}

const legacyApiProxy = {
  target: 'http://localhost:3000',
  changeOrigin: true,
  bypass(req: IncomingMessage) {
    if (isHtmlDocumentNavigation(req)) {
      return '/index.html';
    }
  },
};

export default defineConfig({
  plugins: [react()],

  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/tasks': legacyApiProxy,
      '/categories': legacyApiProxy,
      '/teams': legacyApiProxy,
      '/auth': legacyApiProxy,
      '/notifications': legacyApiProxy,
      '/realtime': legacyApiProxy,
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
