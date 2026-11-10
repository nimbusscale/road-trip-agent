import { homedir } from "node:os";
import { join } from "node:path";

import {
  type LabelAnswer,
  labelAnswerJsonSchema,
  labelAnswerSchema,
} from "./label-answer.schema.js";
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
