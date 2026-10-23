import { z } from "zod";

// The transcript lines the browser shows when a session is resumed: the user's own
// messages, and the coordinator's text. A line is one the Agent SDK wrote (persistence
// design, section 6), so only the parts read here are checked. Every other line, such
// as a tool call, a tool's reply, or the SDK's own markers, fails to parse and isn't
// shown.

const notMarked = z.literal(false).optional();

// A tool's reply is a user line too, but its content is a list, not text. The SDK marks
// the lines it writes itself, such as a summary of an earlier conversation.
const userLineSchema = z
  .object({
    type: z.literal("user"),
    isSidechain: notMarked,
    isMeta: notMarked,
    isCompactSummary: notMarked,
    message: z.object({ content: z.string() }),
  })
  .transform((line) => ({ role: "user" as const, text: line.message.content }));

const assistantLineSchema = z
  .object({
    type: z.literal("assistant"),
    isSidechain: notMarked,
    message: z.object({
      content: z.array(z.looseObject({ type: z.string(), text: z.unknown() })),
    }),
  })
  .transform((line) => ({
    role: "coordinator" as const,
    text: line.message.content
      .flatMap((block) =>
        block.type === "text" && typeof block.text === "string"
          ? [block.text]
          : [],
      )
      .join("\n\n"),
  }));

export const shownLineSchema = z.union([userLineSchema, assistantLineSchema]);
