import { describe, expect, it } from "vitest";

import { ConfigError } from "../config/config-error.js";
import { appCommit, type RunGit } from "./app-commit.js";

const COMMIT = "6b0dbee1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7";

function fakeGit(status: string): RunGit {
  return (args) => (args[0] === "rev-parse" ? `${COMMIT}\n` : status);
}

describe("appCommit", () => {
  it("is the commit the image was built from, on the server", () => {
    const failingGit: RunGit = () => {
      throw new Error("git: not found");
    };
    expect(appCommit(COMMIT, failingGit)).toBe(COMMIT);
  });

  it("asks git locally", () => {
    expect(appCommit(undefined, fakeGit(""))).toBe(COMMIT);
  });

  it("adds -dirty when there are uncommitted changes, including new files", () => {
    expect(appCommit(undefined, fakeGit("?? src/agent/new-file.ts\n"))).toBe(
      `${COMMIT}-dirty`,
    );
  });

  it("stops the app when git can't give the commit", () => {
    const failingGit: RunGit = () => {
      throw new Error("fatal: not a git repository");
    };
    expect(() => appCommit(undefined, failingGit)).toThrow(ConfigError);
  });
});
