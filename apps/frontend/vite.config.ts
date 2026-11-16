import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendPort = env.VITE_BACKEND_PORT || process.env.VITE_BACKEND_PORT || '3002';
  const backendTarget = env.VITE_API_TARGET || process.env.VITE_API_TARGET || `http://localhost:${backendPort}`;
  const frontendPort = Number(env.PORT || process.env.PORT || 3003);

  return {
    plugins: [react()],

    server: {
      port: frontendPort,
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
        },
        '/docs': {
          target: backendTarget,
          changeOrigin: true,
        },
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
};
});
