import { zValidator } from "@hono/zod-validator";

import type { ErrorResponse } from "../shared/error.schema.js";
import { messageRequestSchema } from "../shared/session.schema.js";

// Checks a message request's body (DEVELOPMENT.md section 4). A refused body gets the
// schema's messages, written for the user.
export const messageBody = zValidator(
  "json",
  messageRequestSchema,
  (result, context) => {
    if (result.success) {
      return undefined;
    }
    const body: ErrorResponse = {
      error: result.error.issues.map((issue) => issue.message).join(" "),
    };
    return context.json(body, 400);
  },
);
