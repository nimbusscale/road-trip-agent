import type { ZodType } from "zod";

import { ChatEventParser } from "../../src/shared/chat-event-parser";
import { errorResponseSchema } from "../../src/shared/error.schema";
import type { ChatEvent } from "../../src/shared/session.schema";
import { type ApiRequest, fetchApi } from "./fetch-api";

// A refusal or failure, with a message to show the user.
export class ApiError extends Error {
  override name = "ApiError";
}

export const FAILED = "Something went wrong. Reload the page to try again.";

// A refusal's own message, or the fallback for a failed connection.
export function messageOf(error: unknown, fallback = FAILED): string {
  return error instanceof ApiError ? error.message : fallback;
}

// Calls the API, and parses its reply with the schema.
export async function callApi<T>(
  path: string,
  schema: ZodType<T>,
  request: ApiRequest = {},
): Promise<T> {
  const response = await fetchApi(path, request);
  if (!response.ok) {
    throw new ApiError(await errorMessageOf(response));
  }
  const body: unknown = await response.json();
  return schema.parse(body);
}

// Calls the API for a change whose reply has no body, such as deleting a trip.
export async function callApiForChange(
  path: string,
  request: ApiRequest,
): Promise<void> {
  const response = await fetchApi(path, request);
  if (!response.ok) {
    throw new ApiError(await errorMessageOf(response));
  }
}

// Saves the reply as a file on the user's computer, under the name given. The browser
// can't follow a plain link to the API, since each call carries the sign-in token.
export async function downloadFile(
  path: string,
  fileName: string,
): Promise<void> {
  const response = await fetchApi(path);
  if (!response.ok) {
    throw new ApiError(await errorMessageOf(response));
  }
  const address = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = address;
  link.download = fileName;
  link.click();
  // After the click has started the download, which some browsers do a moment later.
  setTimeout(() => {
    URL.revokeObjectURL(address);
  }, 0);
}

// Sends a message, and hands over each event of the reply as it arrives (systems
// design section 4). Resolves once the reply's stream ends.
export async function sendMessage(
  path: string,
  text: string,
  onEvent: (event: ChatEvent) => void,
): Promise<void> {
  const response = await fetchApi(path, { method: "POST", body: { text } });
  if (!response.ok) {
    throw new ApiError(await errorMessageOf(response));
  }
  if (response.body === null) {
    throw new ApiError("The reply had no body.");
  }
  const parser = new ChatEventParser();
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    const chunk = decoder.decode(read.value, { stream: true });
    for (const event of parser.push(chunk)) {
      onEvent(event);
    }
  }
}

// A reply that isn't our error shape, such as a proxy's error page, gets a general
// message.
async function errorMessageOf(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  const result = errorResponseSchema.safeParse(body);
  return result.success ? result.data.error : "Something went wrong.";
}
