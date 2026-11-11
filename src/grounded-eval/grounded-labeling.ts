import { homedir } from "node:os";
import { join } from "node:path";

import {
  type LabelAnswer,
  labelAnswerJsonSchema,
  labelAnswerSchema,
} from "./label-answer.schema.js";
import type { JudgeSpec } from "./judge-prompt.js";
import { inputsDirOf, type LabelingTask } from "./labeling.js";

export const EVALS_DIR = join(homedir(), "tmp", "road-trip-evals", "grounded");
export const INPUTS_DIR = inputsDirOf(EVALS_DIR);

// The grounded evaluator's labeling (#282). Its labelers and its judge read the same
// prompt.
export const GROUNDED_LABELING: LabelingTask<LabelAnswer> = {
  evalsDir: EVALS_DIR,
  inputHeading: "The conversation",
  answerJsonSchema: labelAnswerJsonSchema(),
  parseAnswer: (answer) => labelAnswerSchema.parse(answer),
};

// The grounded evaluator's judge (#282). Its slot name is the one the pushed prompt
// versions already hold.
export const GROUNDED_JUDGE: JudgeSpec<LabelAnswer> = {
  promptName: "grounded-judge",
  description:
    "The grounded evaluator's judge (#282). Pushed from evals/grounded/rubric.md.",
  rubricPath: join("evals", "grounded", "rubric.md"),
  slot: "{{conversation}}",
  labeling: GROUNDED_LABELING,
};
