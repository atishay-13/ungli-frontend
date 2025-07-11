// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
// import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080, // Ensure this matches your frontend's desired port
  },
  plugins: [
    react(),
    // mode === 'development' && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      'react': path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      // ⭐ ADD THIS NEW ALIAS FOR KEEN-SLIDER'S ES MODULE ⭐
      'keen-slider/react': path.resolve(__dirname, 'node_modules/keen-slider/react.es.js'),
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-refresh'],
    exclude: ['keen-slider/react'], // Keep this exclusion as it helps
  },
}));