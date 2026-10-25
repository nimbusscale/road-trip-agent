import { z } from "zod";

// A block of one model call that a trace shows: its thinking, its text, or a tool call
// it asked for. Other blocks, such as a redacted thinking block, are left out.
export type CallBlock =
  | { type: "thinking"; text: string }
  | { type: "text"; text: string }
  | { type: "toolUse"; id: string; name: string; input: unknown };

export interface CallTokens {
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
}

const callBlockSchema = z
  .discriminatedUnion("type", [
    z.object({ type: z.literal("thinking"), thinking: z.string() }),
    z.object({ type: z.literal("text"), text: z.string() }),
    z.object({
      type: z.literal("tool_use"),
      id: z.string(),
      name: z.string(),
      input: z.unknown(),
    }),
  ])
  .transform((block): CallBlock => {
    switch (block.type) {
      case "thinking":
        return { type: "thinking", text: block.thinking };
      case "text":
        return block;
      case "tool_use":
        return {
          type: "toolUse",
          id: block.id,
          name: block.name,
          input: block.input,
        };
    }
  });

// A line of a worker's transcript, from getSubagentMessages(). The SDK types its
// message as unknown, and leaves out when it was written.
export const workerTranscriptLineSchema = z.looseObject({
  type: z.string(),
  timestamp: z.iso.datetime(),
  message: z.unknown(),
});

// The message on one of a worker's assistant lines: one block of one model call. Each
// line carries the call's ID and its tokens.
export const workerCallLineSchema = z
  .object({
    id: z.string(),
    model: z.string(),
    usage: z.object({
      input_tokens: z.number(),
      cache_read_input_tokens: z.number().nullish(),
      cache_creation_input_tokens: z.number().nullish(),
      output_tokens: z.number(),
    }),
    content: z.array(z.unknown()),
  })
  .transform(({ id, model, usage, content }) => ({
    id,
    model,
    tokens: {
      input: usage.input_tokens,
      cacheRead: usage.cache_read_input_tokens ?? 0,
      cacheWrite: usage.cache_creation_input_tokens ?? 0,
      output: usage.output_tokens,
    } satisfies CallTokens,
    blocks: content.flatMap((item) => {
      const block = callBlockSchema.safeParse(item);
      return block.success ? [block.data] : [];
    }),
  }));

export type WorkerCallLine = z.infer<typeof workerCallLineSchema>;
