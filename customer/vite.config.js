import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("firebase") || id.includes("@firebase")) return "firebase";
          if (id.includes("socket.io") || id.includes("engine.io")) return "realtime";
          if (id.includes("gsap")) return "motion";
          if (id.includes("react") || id.includes("lucide-react")) return "interface";
          return "vendor";
        }
      }
    }
  }
});
