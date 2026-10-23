// Dev only: chat with the coordinator in the terminal, against the local database. Each
// tool call and its reply are printed too, so a turn can be traced. Ctrl-D ends it.
//
// npm run chat                          a new trip, for the dev user
// npm run chat -- --user <uuid>         a new trip, for another user
// npm run chat -- --trip <trip ID>      a new session on a trip
// npm run chat -- --resume <session ID> resumes a session
import { createInterface, type Interface } from "node:readline";
import { parseArgs } from "node:util";

import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

import { claudeProcessEnv } from "./agent/claude-env.js";
import {
  type Conversation,
  type CoordinatorGiven,
  converse,
  coordinatorOptions,
} from "./agent/coordinator.js";
import { ConfigError } from "./config/config-error.js";
import { parseEnv } from "./config/env.js";
import { loadSettings, SETTINGS_PATH } from "./config/settings.js";
import { createPool } from "./db/connection.js";
import type { Connectable, Queryable } from "./persistence/queryable.js";
import { SessionReader } from "./persistence/session-reader.js";
import { SessionRepository } from "./persistence/session-repository.js";
import { SessionWriter } from "./persistence/session-writer.js";
import { TranscriptAdapter } from "./persistence/transcript-adapter.js";
import { TranscriptRepository } from "./persistence/transcript-repository.js";
import { memoryAccessFor } from "./tools/memory-server.js";
import { tripAccessFor } from "./tools/trip-access.js";

// Users live in Supabase. Locally, any UUID will do, and memory is kept under it.
const DEV_USER_ID = "00000000-0000-4000-8000-000000000001";

const ARGS = {
  user: { type: "string" },
  trip: { type: "string" },
  resume: { type: "string" },
} as const;

type Args = ReturnType<typeof parseArgs<{ options: typeof ARGS }>>["values"];

interface Terminal {
  readline: Interface;
  lines: AsyncIterator<string>;
  // A piped input isn't shown as it's typed, so each message is printed.
  echo: boolean;
  // The SDK sends its init message at the start of every turn. It's shown once.
  initShown: boolean;
}

async function chat(): Promise<void> {
  const { values: args } = parseArgs({ options: ARGS });
  const env = parseEnv(process.env);
  const settings = loadSettings(SETTINGS_PATH);
  const pool = createPool(env);
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const terminal: Terminal = {
    readline,
    lines: readline[Symbol.asyncIterator](),
    echo: !process.stdin.isTTY,
    initShown: false,
  };
  try {
    const given: CoordinatorGiven = {
      settings,
      processEnv: claudeProcessEnv(process.env, env.claudeCodeOauthToken),
      trip: tripAccessFor({ env, pool, settings }),
      memory: memoryAccessFor({ pool, settings }),
      transcripts: new TranscriptAdapter({
        pool,
        makeStore: (connection) => new TranscriptRepository(connection),
      }),
    };
    const { conversation, firstText } = await start(
      args,
      given,
      pool,
      terminal,
    );
    for await (const message of converse({
      options: coordinatorOptions(given, conversation),
      conversation,
      userTexts: userTexts(firstText, terminal),
      tripReader: given.trip.reader,
      now: () => new Date(),
    })) {
      printMessage(message, terminal);
    }
  } finally {
    readline.close();
    await pool.end();
  }
}

// Resumes the session, or starts one with the first message, which gives its title.
async function start(
  args: Args,
  given: CoordinatorGiven,
  pool: Connectable & Queryable,
  terminal: Terminal,
): Promise<{ conversation: Conversation; firstText: string | null }> {
  const makeStore = (connection: Queryable): SessionRepository =>
    new SessionRepository(connection);
  if (args.resume !== undefined) {
    const session = await new SessionReader({ pool, makeStore }).get(
      args.resume,
    );
    if (session === undefined) {
      throw new ConfigError(`There's no session ${args.resume}.`);
    }
    const trip = await given.trip.reader.read(session.tripId);
    printStart(session.tripId, session.id, "Resumed");
    showPrompt(terminal);
    return {
      conversation: { session, userId: trip.owner.id, resumed: true },
      firstText: null,
    };
  }
  const trip =
    args.trip === undefined
      ? await given.trip.writer.startTrip({ id: args.user ?? DEV_USER_ID })
      : await given.trip.reader.read(args.trip);
  showPrompt(terminal);
  const firstText = await nextText(terminal);
  if (firstText === null) {
    throw new ConfigError("No first message, so no session was started.");
  }
  const session = await new SessionWriter({ pool, makeStore }).start(
    trip.id,
    firstText,
  );
  printStart(trip.id, session.id, "Started");
  return {
    conversation: { session, userId: trip.owner.id, resumed: false },
    firstText,
  };
}

// Only in a terminal. A piped input can end, and close the readline, while a turn
// is still running.
function showPrompt(terminal: Terminal): void {
  if (!terminal.echo) {
    terminal.readline.prompt();
  }
}

function printStart(tripId: string, sessionId: string, verb: string): void {
  console.log(`${verb} session ${sessionId} on trip ${tripId}.`);
  console.log(`Resume it with: npm run chat -- --resume ${sessionId}`);
}

async function* userTexts(
  firstText: string | null,
  terminal: Terminal,
): AsyncGenerator<string> {
  if (firstText !== null) {
    yield firstText;
  }
  for (let text = await nextText(terminal); text !== null;) {
    yield text;
    text = await nextText(terminal);
  }
}

// The next line that isn't blank, or null at the end of the input.
async function nextText(terminal: Terminal): Promise<string | null> {
  for (;;) {
    const line = await terminal.lines.next();
    if (line.done === true) {
      return null;
    }
    const text = line.value.trim();
    if (text !== "") {
      if (terminal.echo) {
        console.log(`> ${text}`);
      }
      return text;
    }
    showPrompt(terminal);
  }
}

function printMessage(message: SDKMessage, terminal: Terminal): void {
  if (message.type === "system" && message.subtype === "init") {
    if (!terminal.initShown) {
      console.log(`Model: ${message.model}`);
      console.log(`Tools: ${message.tools.join(", ")}`);
      terminal.initShown = true;
    }
  } else if (message.type === "assistant") {
    printReplyAndToolCalls(message.message.content);
  } else if (message.type === "user") {
    printToolReplies(message.message.content);
  } else if (message.type === "result") {
    if (message.subtype !== "success") {
      console.error(`The turn failed: ${message.subtype}`);
    }
    const seconds = Math.round(message.duration_ms / 1000);
    console.log(`(The turn took ${String(seconds)} s.)`);
    showPrompt(terminal);
  }
}

type AssistantContent = Extract<
  SDKMessage,
  { type: "assistant" }
>["message"]["content"];

function printReplyAndToolCalls(content: AssistantContent): void {
  for (const block of content) {
    if (block.type === "text") {
      console.log(`\n${block.text}\n`);
    } else if (block.type === "tool_use") {
      console.log(`  [tool] ${block.name} ${JSON.stringify(block.input)}`);
    }
  }
}

type UserContent = Extract<SDKMessage, { type: "user" }>["message"]["content"];

function printToolReplies(content: UserContent): void {
  if (typeof content === "string") {
    return;
  }
  for (const block of content) {
    if (block.type !== "tool_result") {
      continue;
    }
    const parts =
      typeof block.content === "string"
        ? [block.content]
        : (block.content ?? []);
    const text = parts
      .map((part) =>
        typeof part === "string" ? part : part.type === "text" ? part.text : "",
      )
      .join("\n");
    const label = block.is_error === true ? "error" : "reply";
    console.log(`  [${label}] ${text.replaceAll("\n", "\n          ")}`);
  }
}

try {
  await chat();
} catch (error) {
  if (!(error instanceof ConfigError)) {
    throw error;
  }
  console.error(error.message);
  process.exitCode = 1;
}
