import { createClient } from "@arizeai/phoenix-client";
import { logSpanAnnotations } from "@arizeai/phoenix-client/spans";

import type { LabelAnswer } from "./label-answer.schema.js";

const ANNOTATION_NAME = "grounded";

// Who made a label: a labeler, Joe, or the judge (#282).
export interface Annotator {
  identifier: string;
  kind: "LLM" | "HUMAN";
}

// Saves each turn's label as its `grounded` annotation. Phoenix keeps one for each name
// and identifier on a span, so saving again replaces only this annotator's own.
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
      name: ANNOTATION_NAME,
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
