import { zValidator } from "@hono/zod-validator";
import type { Context } from "hono";

import type { ErrorResponse } from "../shared/error.schema.js";
import { messageRequestSchema } from "../shared/session.schema.js";

// Checks a message request's body (DEVELOPMENT.md section 4).
export const messageBody = zValidator("json", messageRequestSchema, refused);

// A refused request gets the schema's messages, written for the user.
export function refused(
  result:
    | { success: true }
    | { success: false; error: { issues: readonly { message: string }[] } },
  context: Context,
): Response | undefined {
  if (result.success) {
    return undefined;
  }
  const body: ErrorResponse = {
    error: result.error.issues.map((issue) => issue.message).join(" "),
  };
  return context.json(body, 400);
}
