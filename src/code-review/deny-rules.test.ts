import { describe, expect, it } from "vitest";

import { denyRules } from "./deny-rules.js";

const files = (pattern: string) =>
  pattern === "tsconfig*.json" ? ["tsconfig.json", "tsconfig.web.json"] : [];

describe("denyRules", () => {
  it("drops the leading slash, and keeps a folder rule as it is", () => {
    expect(
      denyRules(["Edit(/lefthook.yml)", "Edit(/.claude/hooks/**)"], files),
    ).toEqual(["Edit(lefthook.yml)", "Edit(.claude/hooks/**)"]);
  });

  it("adds the files a wildcard in a file name matches, since the sandbox skips that rule", () => {
    expect(denyRules(["Edit(/tsconfig*.json)"], files)).toEqual([
      "Edit(tsconfig*.json)",
      "Edit(tsconfig.json)",
      "Edit(tsconfig.web.json)",
    ]);
  });

  it("refuses a rule it can't turn into a deny rule", () => {
    expect(() => denyRules(["Bash(rm:*)"], files)).toThrow("Bash(rm:*)");
  });
});
