import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // There's no code yet, so there are no tests. Remove this once the first test exists,
    // so a broken test path fails the check instead of passing quietly.
    passWithNoTests: true,
  },
});
