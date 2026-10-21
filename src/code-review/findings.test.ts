import { describe, expect, it } from "vitest";

import {
  commentBody,
  countLine,
  kindOf,
  notPostedList,
  postedFindings,
} from "./findings.js";
import { type Finding, LABELS } from "./review-result.schema.js";

function finding(label: Finding["label"], line = 10): Finding {
  return {
    file: "src/a.ts",
    line,
    label,
    finding: `Finding ${label}.`,
    labelReason: `Reason ${label}.`,
  };
}

describe("kindOf", () => {
  it("marks each label in the rubric as its kind", () => {
    const kinds = (kind: string) =>
      LABELS.filter((label) => kindOf(label) === kind);
    expect(kinds("Check")).toEqual(["V1"]);
    expect(kinds("Not posted")).toEqual(["D1", "D2", "D3"]);
    expect(kinds("Fix")).toEqual(["F1", "F2", "F3", "F4", "F5", "F6", "F7"]);
    expect(kinds("Note")).toEqual([
      "NF2",
      "NF3",
      "NF4",
      "NF5",
      "N1",
      "N2",
      "N3",
      "N4",
      "N5",
      "N6",
    ]);
  });
});

describe("postedFindings", () => {
  it("leaves out the D labels, and puts fixes first, then checks, then notes", () => {
    const posted = postedFindings([
      finding("N1"),
      finding("D3"),
      finding("V1"),
      finding("F2"),
    ]);
    expect(posted.map((f) => f.label)).toEqual(["F2", "V1", "N1"]);
  });
});

describe("commentBody", () => {
  it("starts with the kind and label, then gives the finding and the reason", () => {
    expect(commentBody(finding("NF2"))).toBe(
      "**Note (NF2)**\n\nFinding NF2.\n\n**Why NF2:** Reason NF2.",
    );
  });
});

describe("notPostedList", () => {
  it("lists only the D labels, with where each is and why", () => {
    const list = notPostedList([finding("D3", 157), finding("F2")]);
    expect(list).toBe(
      "- `src/a.ts:157`, D3: Reason D3.\n  - The finding: Finding D3.\n",
    );
  });

  it("says so when every finding was posted", () => {
    expect(notPostedList([finding("F2")])).toBe("None.\n");
  });
});

describe("countLine", () => {
  it("counts each kind, including the ones with none", () => {
    expect(countLine([finding("F1"), finding("F7"), finding("D1")])).toBe(
      "Fix: 2. Check: 0. Note: 0. Not posted: 1.",
    );
  });
});
