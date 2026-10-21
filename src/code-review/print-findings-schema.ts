// Prints the JSON Schema of the reviewer's answer. The "Code review" workflow passes it
// to claude -p as --json-schema, so the answer has the shape the posting step reads.
//
// tsx src/code-review/print-findings-schema.ts
import { findingsJsonSchema } from "./review-result.schema.js";

console.log(findingsJsonSchema());
