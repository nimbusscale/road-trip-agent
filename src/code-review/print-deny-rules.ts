// Prints the fixer's deny rules for the config files, as --settings JSON (deny-rules.ts).
// The fix job adds them to the sandbox settings. Run it from the repo root.
//
// node --import tsx src/code-review/print-deny-rules.ts
import { globSync, readFileSync } from "node:fs";

import { askRulesSchema } from "./claude-settings.schema.js";
import { denyRules } from "./deny-rules.js";

const askRules = askRulesSchema.parse(
  JSON.parse(readFileSync(".claude/settings.json", "utf8")),
);
const deny = denyRules(askRules, (pattern) => globSync(pattern).sort());

console.log(JSON.stringify({ permissions: { deny } }));
