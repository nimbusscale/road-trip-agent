import { execFileSync } from "node:child_process";

import { ConfigError } from "../config/config-error.js";

// Runs git with the arguments, and returns what it printed. Tests pass a fake.
export type RunGit = (args: readonly string[]) => string;

const runGit: RunGit = (args) =>
  execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

// The commit of the code that runs each turn, for its trace (systems design section
// 10). The view files at that commit show what each agent was given. On the server, the
// deploy builds it into the app image as APP_COMMIT. Locally, git gives it when the app
// starts, with -dirty when there are uncommitted changes, so the trace says the view
// files at that commit may not match.
export function appCommit(
  fromEnv: string | undefined,
  git: RunGit = runGit,
): string {
  if (fromEnv !== undefined) {
    return fromEnv;
  }
  try {
    const commit = git(["rev-parse", "HEAD"]).trim();
    const changed = git(["status", "--porcelain"]).trim() !== "";
    return changed ? `${commit}-dirty` : commit;
  } catch (error) {
    throw new ConfigError(
      `APP_COMMIT is missing, and git couldn't give the commit: ${String(error)}`,
    );
  }
}
