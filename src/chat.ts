// Dev only: chat with the coordinator in the terminal, against the local database. Each
// tool call and its reply are printed too, so a turn can be traced. Ctrl-D ends it.
//
// npm run chat                          a new trip, for the dev user
// npm run chat -- --user <uuid>         a new trip, for another user
// npm run chat -- --trip <trip ID>      a new session on a trip
// npm run chat -- --resume <session ID> resumes a session
import { createInterface, type Interface } from "node:readline";
import { parseArgs } from "node:util";

import { coordinatorAccessFor } from "./agent/coordinator-access.js";
import {
  ChatClosedError,
  CoordinatorTurns,
} from "./agent/coordinator-turns.js";
import {
  type Conversation,
  type CoordinatorGiven,
  sdkTurnRunner,
} from "./agent/coordinator.js";
import type { TurnEvent } from "./agent/turn-event.js";
import { ConfigError } from "./config/config-error.js";
import { parseEnv } from "./config/env.js";
import { loadSettings, SETTINGS_PATH } from "./config/settings.js";
import { createPool } from "./db/connection.js";
import type { Connectable, Queryable } from "./persistence/queryable.js";
import { sessionAccessFor } from "./persistence/session-access.js";
import { appCommit } from "./tracing/app-commit.js";
import { startTracing } from "./tracing/phoenix.js";

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
  // Each turn starts with the model and tools. They're shown once.
  initShown: boolean;
}

async function chat(): Promise<void> {
  const { values: args } = parseArgs({ options: ARGS });
  const env = parseEnv(process.env);
  const settings = loadSettings(SETTINGS_PATH);
  const commit = appCommit(env.appCommit);
  const pool = createPool(env);
  const tracing = startTracing(env);
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
    const given = coordinatorAccessFor({
      env,
      pool,
      settings,
      processEnv: process.env,
    });
    const turns = new CoordinatorTurns({
      coordinator: given,
      runTurn: sdkTurnRunner(commit),
      now: () => new Date(),
    });
    const { conversation, firstText } = await start(
      args,
      given,
      pool,
      terminal,
    );
    if (firstText === null) {
      turns.markResumed(conversation.session.id);
    }
    for await (const text of userTexts(firstText, terminal)) {
      const turn = await turns.begin(conversation, text);
      for await (const event of turn.events()) {
        printEvent(event, terminal);
      }
    }
  } finally {
    readline.close();
    await pool.end();
    await tracing.shutdown();
  }
}

// Resumes the session, or starts one with the first message, which gives its title.
async function start(
  args: Args,
  given: CoordinatorGiven,
  pool: Connectable & Queryable,
  terminal: Terminal,
): Promise<{ conversation: Conversation; firstText: string | null }> {
  const sessions = sessionAccessFor(pool);
  if (args.resume !== undefined) {
    const session = await sessions.reader.get(args.resume);
    if (session === undefined) {
      throw new ConfigError(`There's no session ${args.resume}.`);
    }
    const trip = await given.trip.reader.read(session.tripId);
    printStart(session.tripId, session.id, "Resumed");
    showPrompt(terminal);
    return {
      conversation: { session, userId: trip.owner.id },
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
  const session = await sessions.writer.start(trip.id, firstText);
  printStart(trip.id, session.id, "Started");
  return { conversation: { session, userId: trip.owner.id }, firstText };
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

function printEvent(event: TurnEvent, terminal: Terminal): void {
  switch (event.kind) {
    case "traced":
      console.log(`  [trace] turn span ${event.spanId}`);
      break;
    case "started":
      printStarted(event, terminal);
      break;
    case "thinking":
      console.log(
        `  [thinking] ${event.text.replaceAll("\n", "\n             ")}`,
      );
      break;
    case "text":
      console.log(`\n${event.text}\n`);
      break;
    case "toolCall":
      console.log(`  [tool] ${event.name} ${JSON.stringify(event.input)}`);
      break;
    case "toolReply": {
      const label = event.isError ? "error" : "reply";
      console.log(
        `  [${label}] ${event.text.replaceAll("\n", "\n          ")}`,
      );
      break;
    }
    case "system":
      console.log(`  [system] ${event.subtype} ${JSON.stringify(event.data)}`);
      break;
    case "ended":
      printEnded(event, terminal);
      break;
  }
}

function printStarted(
  event: Extract<TurnEvent, { kind: "started" }>,
  terminal: Terminal,
): void {
  if (!terminal.initShown) {
    console.log(`Model: ${event.model}`);
    console.log(`Tools: ${event.tools.join(", ")}`);
    terminal.initShown = true;
  }
}

function printEnded(
  event: Extract<TurnEvent, { kind: "ended" }>,
  terminal: Terminal,
): void {
  if (event.failure !== null) {
    console.error(`The turn failed: ${event.failure}`);
  }
  const seconds = String(Math.round(event.durationMs / 1000));
  const tokens =
    event.usage === null
      ? ""
      : `, ${String(event.usage.inputTokens)} input tokens, ${String(event.usage.outputTokens)} output tokens`;
  console.log(`(The turn took ${seconds} s${tokens}.)`);
  showPrompt(terminal);
}

try {
  await chat();
} catch (error) {
  if (!(error instanceof ConfigError || error instanceof ChatClosedError)) {
    throw error;
  }
  console.error(error.message);
  process.exitCode = 1;
}
