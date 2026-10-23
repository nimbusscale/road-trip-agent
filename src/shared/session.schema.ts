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

// The events of a reply, sent with Server-Sent Events. Each event's data is JSON.
export const chatEventSchemas = {
  // First, when the message started a trip or a session.
  session: z.object({ tripId: z.string(), sessionId: z.string() }),
  // A part of the coordinator's reply.
  text: z.object({ text: z.string() }),
  // A tool the coordinator called, such as update_trip_brief.
  tool: z.object({ name: z.string() }),
  // The turn ended.
  ended: z.object({ succeeded: z.boolean() }),
};

export type ChatEventName = keyof typeof chatEventSchemas;

export type ChatEvent = {
  [Name in ChatEventName]: {
    name: Name;
    data: z.infer<(typeof chatEventSchemas)[Name]>;
  };
}[ChatEventName];
