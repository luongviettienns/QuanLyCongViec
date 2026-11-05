import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  server: {
    proxy: {
      '/tasks': 'http://localhost:3000',
      '/categories': 'http://localhost:3000',
      '/auth': 'http://localhost:3000',
    },
  },

  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/@ant-design/icons')) {
            return 'vendor-icons';
          }
          if (id.includes('node_modules/antd/')) {
            return 'vendor-antd';
          }
          if (id.includes('node_modules/@dnd-kit/')) {
            return 'vendor-dnd';
          }
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
});
