import type { IncomingMessage } from 'http';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiProxy = {
  target: 'http://localhost:3000',
  changeOrigin: true,
  bypass(req: IncomingMessage) {
    if (req.method === 'GET' && req.headers.accept?.includes('text/html')) {
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
