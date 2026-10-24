import { z } from "zod";

// Spike (#132): the shapes the memory scorers read, from Phoenix and from the judge.

export const conversationSchema = z.object({
  userId: z.string(),
  tripId: z.string(),
  turns: z.array(
    z.object({
      user: z.string(),
      reply: z.string(),
      failure: z.string().nullable(),
    }),
  ),
});

export const expectedSchema = z.object({
  items: z.array(
    z.object({
      statement: z.string(),
      memory: z.enum(["user", "trip"]),
      pattern: z.string(),
    }),
  ),
});

export const inputSchema = z.object({ userMemory: z.array(z.string()) });

export const verdictSchema = z.object({
  criteria: z.array(
    z.object({
      name: z.enum(["faithful", "told", "nothing-extra"]),
      passed: z.boolean(),
      reason: z.string(),
    }),
  ),
});

// The task's whole output, for the summary the eval prints.
export const conversationRecordSchema = z.object({
  userId: z.string(),
  tripId: z.string(),
  sessionId: z.string(),
  turns: z.array(
    z.object({
      user: z.string(),
      reply: z.string(),
      toolCalls: z.array(z.object({ name: z.string(), input: z.unknown() })),
      failure: z.string().nullable(),
      durationMs: z.number(),
      usage: z
        .object({
          modelCalls: z.number(),
          inputTokens: z.number(),
          cachedInputTokens: z.number(),
          outputTokens: z.number(),
        })
        .nullable(),
    }),
  ),
});
