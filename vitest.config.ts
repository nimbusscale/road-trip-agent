import { defineConfig } from "vitest/config";

// Keep this file even with nothing set. Without it, Vitest reads vite.config.ts,
// whose root is web/, and misses the tests in src/.
export default defineConfig({});
