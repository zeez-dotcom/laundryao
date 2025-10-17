import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    // Only enable Replit Cartographer if explicitly requested
    ...(process.env.ENABLE_REPLIT_CARTOGRAPHER === 'true'
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) => m.cartographer()),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
      "leaflet/dist/leaflet.css": path.resolve(
        import.meta.dirname,
        "node_modules/leaflet/dist/leaflet.css",
      ),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port: parseInt(process.env.PORT ?? process.env.VITE_PORT ?? "5000", 10),
    // If someone runs Vite standalone (e.g., on 5173), proxy API calls to the Express server
    proxy: {
      "/api": {
        target: process.env.VITE_API_URL || "http://localhost:5000",
        changeOrigin: true,
        secure: false,
      },
      // Optional: static uploads
      "/uploads": {
        target: process.env.VITE_API_URL || "http://localhost:5000",
        changeOrigin: true,
        secure: false,
      },
      // Health endpoint to verify API connectivity from Vite dev
      "/health": {
        target: process.env.VITE_API_URL || "http://localhost:5000",
        changeOrigin: true,
        secure: false,
      },
    },
    fs: {
      strict: true,
      deny: [],
      allow: [".well-known"],
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./client/test/setup.ts"],
    alias: {
      "react-leaflet": path.resolve(
        import.meta.dirname,
        "client/test/mocks/react-leaflet.ts",
      ),
      leaflet: path.resolve(
        import.meta.dirname,
        "client/test/mocks/leaflet.ts",
      ),
      "leaflet/dist/leaflet.css": path.resolve(
        import.meta.dirname,
        "client/test/mocks/leaflet.css",
      ),
    },
  },
});
