import { z } from "zod";

// The parts of the Agent SDK's transcript lines that the trip versions rebuild reads
// (#244): each tool call, with the reply it got, and when. The SDK doesn't document the
// lines' shape, so anything else on a line is let through untouched.

export interface RecordedUse {
  id: string;
  name: string;
  input: unknown;
}

export interface RecordedResult {
  toolUseId: string;
  text: string;
  isError: boolean;
}

export const timedLineSchema = z
  .looseObject({ timestamp: z.iso.datetime() })
  .transform((line) => ({ at: new Date(line.timestamp) }));

// A line whose message holds a list of blocks: an assistant line's text and tool calls,
// or a user line's tool results. A user's own message holds a string instead.
export const blockLineSchema = z
  .looseObject({
    timestamp: z.iso.datetime(),
    message: z.looseObject({ content: z.array(z.unknown()) }),
  })
  .transform((line) => ({
    at: new Date(line.timestamp),
    blocks: line.message.content,
  }));

export const toolUseBlockSchema = z
  .looseObject({
    type: z.literal("tool_use"),
    id: z.string(),
    name: z.string(),
    input: z.unknown(),
  })
  .transform(({ id, name, input }): RecordedUse => ({ id, name, input }));

const textPartSchema = z.looseObject({ type: z.string(), text: z.unknown() });

export const toolResultBlockSchema = z
  .looseObject({
    type: z.literal("tool_result"),
    tool_use_id: z.string(),
    content: z.union([z.string(), z.array(textPartSchema)]).optional(),
    is_error: z.boolean().optional(),
  })
  .transform((block): RecordedResult => ({
    toolUseId: block.tool_use_id,
    text: replyTextOf(block.content),
    isError: block.is_error === true,
  }));

function replyTextOf(
  content: string | z.infer<typeof textPartSchema>[] | undefined,
): string {
  if (content === undefined || typeof content === "string") {
    return content ?? "";
  }
  return content
    .flatMap((part) =>
      part.type === "text" && typeof part.text === "string" ? [part.text] : [],
    )
    .join("\n");
}
