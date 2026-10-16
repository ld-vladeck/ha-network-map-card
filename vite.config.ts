import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: './src/network-map-card.ts',
      name: 'NetworkMapCard',
      fileName: () => 'network-map-card.js',
      formats: ['es'],
    },
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
  },
});

