// Turns the ask rules in .claude/settings.json into deny rules for the fixer in CI, where
// Claude Code ignores that file and no one is there to ask (code review design section
// 4.6). Claude Code's sandbox then makes each denied file read-only for the fixer's
// commands too. Two things differ from the ask rules, both found in testing with Claude
// Code 2.1.308:
//
// - The leading "/" is dropped. In an inline --settings string, "/eslint.config.mjs"
//   matches nothing.
// - A wildcard in a file name is expanded into the files it matches, since the sandbox
//   skips that rule. The rule stays too, so the Edit and Write tools can't make a new
//   file that matches it. A rule for a whole folder, such as ".claude/hooks/**", works as
//   it is.
export function denyRules(
  askRules: readonly string[],
  matchingFiles: (pattern: string) => readonly string[],
): string[] {
  return askRules.flatMap((rule) => {
    const path = /^Edit\(\/(.+)\)$/.exec(rule)?.[1];
    if (path === undefined) {
      throw new Error(
        `The ask rule ${rule} isn't an Edit rule from the repo root, so it can't be turned into a deny rule.`,
      );
    }
    const fileName = path.split("/").at(-1) ?? "";
    const expanded =
      fileName !== "**" && fileName.includes("*") ? matchingFiles(path) : [];
    return [path, ...expanded].map((p) => `Edit(${p})`);
  });
}
