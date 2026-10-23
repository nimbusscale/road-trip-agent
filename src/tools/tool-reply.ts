import type { SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";

import { RuleError } from "../domain/rule-error.js";
import { GooglePlacesError } from "../google/places-client.js";
import { GoogleRoutesError } from "../google/routes-client.js";
import { GoogleWeatherError } from "../google/weather-client.js";
import { OpenMeteoError } from "../open-meteo/archive-client.js";
import { TripBusyError } from "../persistence/trip-errors.js";

// The MCP result a tool's handler returns. Taken from the Agent SDK, which doesn't
// export the type by name.
export type ToolReply = Awaited<ReturnType<SdkMcpToolDefinition["handler"]>>;

// What a tool hands back to the agent: text, never a full record (technical spec 7.2).
export function textReply(lines: readonly string[]): ToolReply {
  return { content: [{ type: "text", text: lines.join("\n") }] };
}

// Runs a writing tool's work, and turns an error the agent can act on into a message it
// can read (tool design, section 4): a broken rule, a busy trip, or a failed Google
// call. Any other error is a bug, so it's thrown, and the Agent SDK reports it as a
// failed call.
export function writeReplyOrReadableError(
  work: () => Promise<ToolReply>,
): Promise<ToolReply> {
  return replyOrReadableError(work, writeErrorText);
}

// The same for a tool that only reads the trip, so nothing in it could have changed: a
// broken rule, such as a bad ID, or a failed call to Google or Open-Meteo.
export function readReplyOrReadableError(
  work: () => Promise<ToolReply>,
): Promise<ToolReply> {
  return replyOrReadableError(work, (error) => error.message);
}

async function replyOrReadableError(
  work: () => Promise<ToolReply>,
  textOf: (error: Error) => string,
): Promise<ToolReply> {
  try {
    return await work();
  } catch (error) {
    if (!isReadable(error)) {
      throw error;
    }
    return {
      content: [{ type: "text", text: textOf(error) }],
      isError: true,
    };
  }
}

function isReadable(error: unknown): error is Error {
  return (
    error instanceof RuleError ||
    error instanceof TripBusyError ||
    error instanceof GooglePlacesError ||
    error instanceof GoogleRoutesError ||
    error instanceof GoogleWeatherError ||
    error instanceof OpenMeteoError
  );
}

// A write runs in one transaction, so any refusal saved nothing (technical spec 5.2).
// The busy error already says so.
function writeErrorText(error: Error): string {
  return error instanceof TripBusyError
    ? error.message
    : `Nothing was changed. ${error.message}`;
}
