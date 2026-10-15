import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  // The repo's .env, for the VITE_ variables the front end reads.
  envDir: "..",
  plugins: [react()],
  build: {
    outDir: "../dist/web",
    emptyOutDir: true,
  },
  server: {
    // The same split as Caddy in production (systems design section 6).
    proxy: { "/api": "http://127.0.0.1:3000" },
  },
});
