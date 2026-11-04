import { type IncomingMessage, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

import { createClient } from "@supabase/supabase-js";
import type { ZodType } from "zod";

import { ChatEventParser } from "../shared/chat-event-parser.js";
import { errorResponseSchema } from "../shared/error.schema.js";
import type { ChatEvent, MessageRequest } from "../shared/session.schema.js";
import type { LiveChatEnv } from "./live-chat-env.schema.js";

// A refusal, a failed sign-in, or a mistake in the command. The client prints the
// message and exits.
export class LiveChatError extends Error {
  override name = "LiveChatError";
}

// The app's API, as the browser calls it (systems design section 4). Tests pass a fake.
export interface SiteApi {
  get<T>(path: string, schema: ZodType<T>): Promise<T>;
  // A POST with no body, such as opening a session.
  post<T>(path: string, schema: ZodType<T>): Promise<T>;
  // Sends a message, and hands over each event of the reply as it arrives.
  send(path: string, message: MessageRequest): AsyncIterable<ChatEvent>;
}

export interface SignedIn {
  userId: string;
  email: string;
  token: string;
}

// Supabase's password sign-in, as the sign-in page does (systems design section 3).
// Each command is its own process, so the session isn't kept or renewed.
export async function signIn(env: LiveChatEnv): Promise<SignedIn> {
  const supabase = createClient(env.supabaseUrl, env.supabasePublishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const { data, error } = await supabase.auth.signInWithPassword({
    email: env.email,
    password: env.password,
  });
  if (error !== null) {
    throw new LiveChatError(`Sign-in failed: ${error.message}`);
  }
  return {
    userId: data.user.id,
    email: data.user.email ?? env.email,
    token: data.session.access_token,
  };
}

// Calls the site's API with the signed-in user's token.
export class HttpSiteApi implements SiteApi {
  readonly #site: string;
  readonly #token: string;

  constructor(site: string, token: string) {
    this.#site = site;
    this.#token = token;
  }

  async get<T>(path: string, schema: ZodType<T>): Promise<T> {
    return this.#json(path, schema, "GET");
  }

  async post<T>(path: string, schema: ZodType<T>): Promise<T> {
    return this.#json(path, schema, "POST");
  }

  async *send(path: string, message: MessageRequest): AsyncIterable<ChatEvent> {
    const response = await this.#postForStream(path, JSON.stringify(message));
    if (response.statusCode !== 200) {
      throw new LiveChatError(
        errorMessageOf(await textOf(response), response.statusCode),
      );
    }
    const parser = new ChatEventParser();
    const decoder = new TextDecoder();
    for await (const chunk of chunksUntilClosed(response)) {
      if (chunk instanceof Uint8Array) {
        yield* parser.push(decoder.decode(chunk, { stream: true }));
      }
    }
  }

  async #json<T>(
    path: string,
    schema: ZodType<T>,
    method: "GET" | "POST",
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.#site}${path}`, {
        method,
        headers: new Headers([["Authorization", `Bearer ${this.#token}`]]),
      });
    } catch (error) {
      throw this.#unreachable(error);
    }
    const text = await response.text();
    if (!response.ok) {
      throw new LiveChatError(errorMessageOf(text, response.status));
    }
    return schema.parse(JSON.parse(text));
  }

  // Node's fetch stops reading a reply after 5 minutes with no data, and a turn can be
  // quiet that long while a worker runs. A plain request waits as long as the stream
  // stays open, as the browser does.
  #postForStream(path: string, body: string): Promise<IncomingMessage> {
    const url = new URL(`${this.#site}${path}`);
    const request = url.protocol === "https:" ? httpsRequest : httpRequest;
    return new Promise((resolve, reject) => {
      const outgoing = request(url, { method: "POST" });
      outgoing.setHeader("Authorization", `Bearer ${this.#token}`);
      outgoing.setHeader("Content-Type", "application/json");
      outgoing.on("response", resolve);
      outgoing.on("error", (error) => {
        reject(this.#unreachable(error));
      });
      outgoing.end(body);
    });
  }

  // Such as when npm run dev isn't running.
  #unreachable(error: unknown): LiveChatError {
    const cause = error instanceof Error ? error.cause : undefined;
    const reason = cause instanceof Error ? cause : error;
    return new LiveChatError(
      `Couldn't reach ${this.#site}: ${reason instanceof Error ? reason.message : String(reason)}`,
    );
  }
}

// A reply's chunks until its connection closes. A connection dropped partway through,
// such as by a restart or a network blip, ends the chunks as a clean close does, so
// the turn is printed as cut off.
async function* chunksUntilClosed(
  response: IncomingMessage,
): AsyncIterable<unknown> {
  const chunks: AsyncIterable<unknown> = response;
  try {
    yield* chunks;
  } catch {
    return;
  }
}

async function textOf(response: IncomingMessage): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  const chunks: AsyncIterable<unknown> = response;
  for await (const chunk of chunks) {
    if (chunk instanceof Uint8Array) {
      text += decoder.decode(chunk, { stream: true });
    }
  }
  return text;
}

// The API's own message, or the status for a reply that isn't our error shape, such
// as a proxy's error page.
function errorMessageOf(text: string, status: number | undefined): string {
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    // Not JSON, so it isn't our error shape.
  }
  const result = errorResponseSchema.safeParse(body);
  return result.success
    ? result.data.error
    : `The site replied with status ${String(status)}.`;
}
