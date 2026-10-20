import { describe, expect, it } from "vitest";

import { reviewResultSchema } from "./review-result.schema.js";

const FINDING = {
  file: "src/a.ts",
  line: 3,
  label: "F2",
  finding: "It breaks.",
  labelReason: "Why.",
};

// The output of claude -p, from its JSON text, since its snake_case names can't be
// object keys here.
function parse(json: string) {
  return reviewResultSchema.safeParse(JSON.parse(json));
}

function withFindings(isError: boolean, findings: unknown[]): string {
  const output = JSON.stringify({ findings });
  return `{"is_error": ${String(isError)}, "structured_output": ${output}}`;
}

describe("reviewResultSchema", () => {
  it("reads the findings from the structured output", () => {
    expect(parse(withFindings(false, [FINDING])).data).toEqual([FINDING]);
  });

  it("refuses a run that failed, so a failed review doesn't look clean", () => {
    expect(parse(withFindings(true, [])).success).toBe(false);
  });

  it("refuses a run with no structured output", () => {
    const json = '{"is_error": false, "result": "No findings."}';
    expect(parse(json).success).toBe(false);
  });

  it("refuses a label that isn't in the rubric", () => {
    const json = withFindings(false, [{ ...FINDING, label: "F8" }]);
    expect(parse(json).success).toBe(false);
  });
});
