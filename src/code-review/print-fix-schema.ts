// Prints the JSON Schema of the fixer's answer. The fix job passes it to claude -p as
// --json-schema, so the answer has the shape post-fix.ts reads.
//
// node --import tsx src/code-review/print-fix-schema.ts
import { fixAnswerJsonSchema } from "./fix-answer.schema.js";

console.log(fixAnswerJsonSchema());
