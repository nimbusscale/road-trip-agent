import { homedir } from "node:os";
import { join } from "node:path";

import type { JudgeSpec } from "../grounded-eval/judge-prompt.js";
import type { LabelingTask } from "../grounded-eval/labeling.js";
import {
  type SavingAnswer,
  savingAnswerJsonSchema,
  savingAnswerSchema,
} from "./saving-answer.schema.js";

// Outside the repo, as the grounded evaluator's files are, so a labeler's harness
// started there doesn't load the repo's CLAUDE.md (#282, step 4).
export const EVALS_DIR = join(homedir(), "tmp", "road-trip-evals", "saving");

// The saving evaluation's labeling (#209). Labels stay in these local files through the
// pilot, since the batch may be relabeled. They go to Phoenix with the golden set.
export const SAVING_LABELING: LabelingTask<SavingAnswer> = {
  evalsDir: EVALS_DIR,
  inputHeading: "The turn",
  answerJsonSchema: savingAnswerJsonSchema(),
  parseAnswer: (answer) => savingAnswerSchema.parse(answer),
};

// The saving evaluation's judge (#209), on Haiku through the API. It reads the
// labelers' prompt.
export const SAVING_JUDGE: JudgeSpec<SavingAnswer> = {
  promptName: "saving-judge",
  description:
    "The saving evaluator's judge (#209). Pushed from evals/saving/rubric.md.",
  rubricPath: join("evals", "saving", "rubric.md"),
  slot: "{{turn}}",
  labeling: SAVING_LABELING,
};
