import { configDefaults, defineConfig } from "vitest/config";

// Keep this file even with nothing set. Without it, Vitest reads vite.config.ts,
// whose root is web/, and misses the tests in src/.
export default defineConfig({
  test: {
    // Worker agents' worktrees live under .claude/worktrees/. Their tests belong to
    // other branches, so a check in this checkout leaves them out.
    exclude: [...configDefaults.exclude, ".claude/**"],
  },
});
