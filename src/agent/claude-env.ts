import { tmpdir } from "node:os";
import { join } from "node:path";

import { ENV_NAMES } from "../config/env.schema.js";

// Where Claude Code keeps its own files: its config, and each session's transcript as
// scratch (persistence design, section 6). A resume reads the transcript from Postgres,
// never from here, so nothing reads or cleans this folder. Under the system temp folder,
// it stays out of a developer's own ~/.claude.
export const CLAUDE_CONFIG_FOLDER = join(tmpdir(), "road-trip-agent-claude");
const CLAUDE_CONFIG_DIR_NAME = "CLAUDE_CONFIG_DIR";

// The environment for the Claude Code process that the Agent SDK starts. The SDK
// replaces that process's environment with this one, so it starts from ours.
//
// Every ANTHROPIC_ variable is left out. An ANTHROPIC_API_KEY would win over the plan's
// token and bill an API account instead (systems design section 8). A shell that has
// one set, such as a developer's, must not change which account the app uses.
export function claudeProcessEnv(
  source: Readonly<Record<string, string | undefined>>,
  oauthToken: string,
): Record<string, string | undefined> {
  const kept = Object.entries(source).filter(
    ([name]) => !name.startsWith("ANTHROPIC_"),
  );
  return Object.fromEntries([
    ...kept,
    [ENV_NAMES.claudeCodeOauthToken, oauthToken],
    [CLAUDE_CONFIG_DIR_NAME, CLAUDE_CONFIG_FOLDER],
  ]);
}
