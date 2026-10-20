// Prints the JSON Schema of the reviewer's answer. The "Code review" workflow passes it
// to claude -p as --json-schema, so the answer has the shape the posting step reads.
//
// tsx src/code-review/print-findings-schema.ts
import { z } from "zod";

import { findingsSchema } from "./review-result.schema.js";

// Draft 07, since claude -p refuses Zod's default, draft 2020-12, as "not a valid JSON
// Schema" (Claude Code 2.1.304, tried 2026-10-20).
console.log(
  JSON.stringify(z.toJSONSchema(findingsSchema, { target: "draft-07" })),
);
