import { describe, expect, it } from "vitest";

import { claudeProcessEnv } from "./claude-env.js";

// Built from pairs, since variable names such as PATH aren't camelCase.
function envOf(
  pairs: readonly (readonly [string, string])[],
): Record<string, string> {
  return Object.fromEntries(pairs);
}

const TOKEN = ["CLAUDE_CODE_OAUTH_TOKEN", "plan-token"] as const;

describe("claudeProcessEnv", () => {
  it("keeps the variables Claude Code needs, such as PATH and HOME", () => {
    const source = envOf([
      ["PATH", "/usr/bin"],
      ["HOME", "/home/node"],
    ]);
    expect(claudeProcessEnv(source, "plan-token")).toEqual(
      envOf([["PATH", "/usr/bin"], ["HOME", "/home/node"], TOKEN]),
    );
  });

  it("leaves out an API key, so the plan's token is used", () => {
    const source = envOf([
      ["ANTHROPIC_API_KEY", "api-key"],
      ["ANTHROPIC_BASE_URL", "https://example.com"],
    ]);
    expect(claudeProcessEnv(source, "plan-token")).toEqual(envOf([TOKEN]));
  });

  it("uses the given token over one already in the environment", () => {
    const source = envOf([["CLAUDE_CODE_OAUTH_TOKEN", "old-token"]]);
    expect(claudeProcessEnv(source, "plan-token")).toEqual(envOf([TOKEN]));
  });
});
