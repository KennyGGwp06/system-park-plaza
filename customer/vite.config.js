import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 4173,
    proxy: {
      "/api": { target: "http://127.0.0.1:3000", changeOrigin: true },
      "/uploads": { target: "http://127.0.0.1:3000", changeOrigin: true }
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("firebase") || id.includes("@firebase")) return "firebase";
          return undefined;
        }
      }
    }
  }
});
