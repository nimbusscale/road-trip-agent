import { z } from "zod";

// The input of report_result, the tool every worker ends with (tool design 2.6). Both
// lists are required, so the worker never has to decide whether to pass one. Each input
// says only how to pass its items. What a problem and a question are goes in the
// workers' instructions (tool design, section 4).
export const REPORT_RESULT_INPUT = z.strictObject({
  problems: z
    .array(z.string())
    .describe(
      'Short sentences, such as "Gifford Homestead is closed on Wednesdays, and Day 4 is a Wednesday." [] when there are none.',
    ),
  questionsForUser: z
    .array(z.string())
    .describe(
      'Short sentences, such as "Should the Day 2 lunch be a picnic, since the day is all hiking?" [] when there are none.',
    ),
});

export type ReportResultInput = z.infer<typeof REPORT_RESULT_INPUT>;
