import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  server: {
    proxy: {
      '/tasks': 'http://localhost:3000',
      '/categories': 'http://localhost:3000',
      '/teams': 'http://localhost:3000',
      '/auth': 'http://localhost:3000',
      '/notifications': 'http://localhost:3000',
    },
  },

  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (/[\\/](react|react-dom|scheduler)[\\/]/.test(id)) {
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
