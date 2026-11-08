import { createClient } from "@arizeai/phoenix-client";
import { logSpanAnnotations } from "@arizeai/phoenix-client/spans";

import type { LabelAnswer } from "./label-answer.schema.js";

// Who made a label (#282). The labelers and Joe save under `grounded`. The judge saves
// under its own name, since Phoenix's project page sums up annotations by name only,
// and would mix the judge's labels with theirs.
export interface Annotator {
  name: "grounded" | "grounded-haiku";
  identifier: string;
  kind: "LLM" | "HUMAN";
}

export const JUDGE_ANNOTATOR: Annotator = {
  name: "grounded-haiku",
  identifier: "haiku-5.5",
  kind: "LLM",
};

// Saves each turn's label as an annotation under the annotator's name. Phoenix keeps
// one for each name and identifier on a span, so saving again replaces only this
// annotator's own.
export async function saveAnnotations(
  phoenixUrl: string,
  annotator: Annotator,
  answers: Map<string, LabelAnswer>,
  rubricVersion: string,
): Promise<void> {
  const client = createClient({ options: { baseUrl: phoenixUrl } });
  await logSpanAnnotations({
    client,
    sync: true,
    spanAnnotations: [...answers].map(([spanId, answer]) => ({
      spanId,
      name: annotator.name,
      annotatorKind: annotator.kind,
      identifier: annotator.identifier,
      label: answer.label,
      ...scoreOf(answer),
      ...explanationOf(answer),
      metadata: { rubric: rubricVersion, facts: answer.facts },
    })),
  });
}

// A reply with no facts has no score, so Phoenix's average leaves it out (#282).
function scoreOf(answer: LabelAnswer): { score?: number } {
  if (answer.label === "no_facts") {
    return {};
  }
  return { score: answer.label === "grounded" ? 1 : 0 };
}

// One line for each fact that isn't grounded: its quote, then why. Every fact, with its
// source, is in the metadata.
function explanationOf(answer: LabelAnswer): { explanation?: string } {
  const lines = answer.facts
    .filter((fact) => !fact.grounded)
    .map((fact) => `"${fact.quote}": ${fact.why}`);
  return lines.length === 0 ? {} : { explanation: lines.join("\n") };
}
