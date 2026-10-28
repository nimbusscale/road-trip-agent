import { describe, expect, it } from "vitest";

import { CLAUDE_CONFIG_FOLDER, claudeProcessEnv } from "./claude-env.js";

// Built from pairs, since variable names such as PATH aren't camelCase.
function envOf(
  pairs: readonly (readonly [string, string])[],
): Record<string, string> {
  return Object.fromEntries(pairs);
}

const TOKEN = ["CLAUDE_CODE_OAUTH_TOKEN", "plan-token"] as const;
const CONFIG = ["CLAUDE_CONFIG_DIR", CLAUDE_CONFIG_FOLDER] as const;
const FOREGROUND = ["CLAUDE_CODE_DISABLE_BACKGROUND_TASKS", "1"] as const;
const OUR_WORKERS = ["CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS", "1"] as const;

describe("claudeProcessEnv", () => {
  it("keeps the variables Claude Code needs, such as PATH and HOME", () => {
    const source = envOf([
      ["PATH", "/usr/bin"],
      ["HOME", "/home/node"],
    ]);
    expect(claudeProcessEnv(source, "plan-token")).toEqual(
      envOf([
        ["PATH", "/usr/bin"],
        ["HOME", "/home/node"],
        TOKEN,
        CONFIG,
        FOREGROUND,
        OUR_WORKERS,
      ]),
    );
  });

  it("leaves out an API key, so the plan's token is used", () => {
    const source = envOf([
      ["ANTHROPIC_API_KEY", "api-key"],
      ["ANTHROPIC_BASE_URL", "https://example.com"],
    ]);
    expect(claudeProcessEnv(source, "plan-token")).toEqual(
      envOf([TOKEN, CONFIG, FOREGROUND, OUR_WORKERS]),
    );
  });

  it("uses the given token over one already in the environment", () => {
    const source = envOf([["CLAUDE_CODE_OAUTH_TOKEN", "old-token"]]);
    expect(claudeProcessEnv(source, "plan-token")).toEqual(
      envOf([TOKEN, CONFIG, FOREGROUND, OUR_WORKERS]),
    );
  });

  it("keeps every worker in the foreground, and offers only our workers, even when the shell says otherwise", () => {
    const source = envOf([
      ["CLAUDE_CODE_DISABLE_BACKGROUND_TASKS", "0"],
      ["CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS", "0"],
    ]);
    expect(claudeProcessEnv(source, "plan-token")).toEqual(
      envOf([TOKEN, CONFIG, FOREGROUND, OUR_WORKERS]),
    );
  });

  it("keeps Claude Code's files out of a developer's own ~/.claude", () => {
    const source = envOf([["CLAUDE_CONFIG_DIR", "/home/joe/.claude"]]);
    expect(claudeProcessEnv(source, "plan-token")).toEqual(
      envOf([TOKEN, CONFIG, FOREGROUND, OUR_WORKERS]),
    );
  });
});
