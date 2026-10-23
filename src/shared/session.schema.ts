import { z } from "zod";

// The shapes of the chat's requests and replies (systems design section 4). The front
// end parses the replies with these schemas.

// A message the user sends. It starts a trip, or a session, or goes on one.
export const messageRequestSchema = z.object({
  text: z.string().trim().min(1, { error: "A message can't be empty." }),
});

export type MessageRequest = z.infer<typeof messageRequestSchema>;

// Between the parts of one reply, such as text before and after a tool call. A resumed
// session joins them as the browser did while the reply streamed in.
export const REPLY_PART_SEPARATOR = "\n\n";

export const shownMessageSchema = z.object({
  role: z.enum(["user", "coordinator"]),
  text: z.string(),
});

export type ShownMessage = z.infer<typeof shownMessageSchema>;

// A resumed session: its conversation so far. While a turn is still running, such as
// after the tab was closed partway through a reply, the browser asks again until it
// ends.
export const sessionResponseSchema = z.object({
  sessionId: z.string(),
  tripId: z.string(),
  messages: z.array(shownMessageSchema),
  turnRunning: z.boolean(),
});

export type SessionResponse = z.infer<typeof sessionResponseSchema>;

// The events of a reply, sent with Server-Sent Events. Each event's data is JSON. Most
// are for the chat's raw view (functional spec 10.1): every event but "session" and
// "text", in the order they happened.
export const chatEventSchemas = {
  // First, when the message started a trip or a session.
  session: z.object({ tripId: z.string(), sessionId: z.string() }),
  // The model, and the tools it was given, such as mcp__trip__update_trip_brief.
  started: z.object({ model: z.string(), tools: z.array(z.string()) }),
  // The message the model got, with the app's lines added (technical spec 5.2).
  message: z.object({ text: z.string() }),
  // A summary of the model's thinking.
  thinking: z.object({ text: z.string() }),
  // A part of the coordinator's reply.
  text: z.object({ text: z.string() }),
  // A tool the coordinator called, with its full name and input.
  toolCall: z.object({ name: z.string(), input: z.unknown() }),
  toolReply: z.object({ text: z.string(), isError: z.boolean() }),
  // Any other system message from the Agent SDK, such as a retry.
  system: z.object({
    subtype: z.string(),
    data: z.record(z.string(), z.unknown()),
  }),
  // The turn ended. `failure` says why it failed, or is null when it succeeded.
  // `usage` is null when it failed before the Agent SDK's result.
  ended: z.object({
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
};

export type ChatEventName = keyof typeof chatEventSchemas;

function eventSchema<Name extends ChatEventName>(name: Name) {
  return z.object({ name: z.literal(name), data: chatEventSchemas[name] });
}

export const chatEventSchema = z.discriminatedUnion("name", [
  eventSchema("session"),
  eventSchema("started"),
  eventSchema("message"),
  eventSchema("thinking"),
  eventSchema("text"),
  eventSchema("toolCall"),
  eventSchema("toolReply"),
  eventSchema("system"),
  eventSchema("ended"),
]);

export type ChatEvent = z.infer<typeof chatEventSchema>;
