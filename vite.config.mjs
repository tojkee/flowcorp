import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // itch.io serves HTML5 games from a nested subdirectory, not the domain root,
  // so the build must emit relative asset URLs (./assets/...) instead of
  // root-absolute ones (/assets/...). Without this the script/CSS/PNGs 404.
  base: "./",
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react()],
});
