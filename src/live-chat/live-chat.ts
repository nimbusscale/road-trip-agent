// Chats with the app through its API, as the browser does, from a terminal (#251). It
// runs no agent: the site's server runs the coordinator, so the session's data is in
// that site's database, and its traces are in that site's Phoenix project. A simulated
// user's harness runs one shell command at a time, so each action is one command that
// exits when it's done. A message is read from standard input.
//
// npm run live-chat -- whoami
// npm run live-chat -- start < message.txt                  a new trip
// npm run live-chat -- new-session <trip ID> < message.txt  a new session on a trip
// npm run live-chat -- send <session ID> < message.txt
// npm run live-chat -- open <session ID>                    an old session, as a resume
// npm run live-chat -- itinerary <session ID>
// npm run live-chat -- cards <session ID>                   the open option cards
// npm run live-chat -- select <session ID> <card> <option>
// npm run live-chat -- more <session ID> <card>             More options
// npm run live-chat -- higher <session ID> <card>           Higher tier
// npm run live-chat -- lower <session ID> <card>            Lower tier
//
// It signs in as LIVE_CHAT_EMAIL, with LIVE_CHAT_PASSWORD, to LIVE_CHAT_SITE, such as
// http://localhost:5173 with npm run dev, or https://roadtrip.jjk3.com.
import { text as readAll } from "node:stream/consumers";
import { parseArgs } from "node:util";

import type { z } from "zod";

import {
  LIVE_CHAT_ENV_NAMES,
  type LiveChatEnv,
  liveChatEnvSchema,
} from "./live-chat-env.schema.js";
import {
  askOnCard,
  openSession,
  type Print,
  printCards,
  printItinerary,
  selectOption,
  sendMessage,
  startSession,
  startTrip,
} from "./live-chat-actions.js";
import {
  HttpSiteApi,
  LiveChatError,
  signIn,
  type SiteApi,
} from "./site-api.js";

interface Action {
  // The names of its arguments, for the usage line.
  args: string[];
  // Whether it reads a message from standard input.
  readsMessage: boolean;
  run: (api: SiteApi, given: Given) => Promise<boolean>;
}

interface Given {
  args: string[];
  message: string;
  print: Print;
}

const ACTIONS: Record<string, Action> = {
  start: {
    args: [],
    readsMessage: true,
    run: (api, { message, print }) => startTrip(api, print, message),
  },
  "new-session": {
    args: ["trip ID"],
    readsMessage: true,
    run: (api, { args, message, print }) =>
      startSession(api, print, arg(args, 0), message),
  },
  send: {
    args: ["session ID"],
    readsMessage: true,
    run: (api, { args, message, print }) =>
      sendMessage(api, print, arg(args, 0), message),
  },
  open: {
    args: ["session ID"],
    readsMessage: false,
    run: (api, { args, print }) => openSession(api, print, arg(args, 0)),
  },
  itinerary: {
    args: ["session ID"],
    readsMessage: false,
    run: async (api, { args, print }) => {
      await printItinerary(api, print, arg(args, 0));
      return true;
    },
  },
  cards: {
    args: ["session ID"],
    readsMessage: false,
    run: async (api, { args, print }) => {
      await printCards(api, print, arg(args, 0));
      return true;
    },
  },
  select: {
    args: ["session ID", "card", "option"],
    readsMessage: false,
    run: (api, { args, print }) =>
      selectOption(api, print, arg(args, 0), {
        card: numberArg(args, 1),
        option: numberArg(args, 2),
      }),
  },
  more: cardAskAction("More options"),
  higher: cardAskAction("Higher tier"),
  lower: cardAskAction("Lower tier"),
};

function cardAskAction(label: string): Action {
  return {
    args: ["session ID", "card"],
    readsMessage: false,
    run: (api, { args, print }) =>
      askOnCard(api, print, arg(args, 0), {
        card: numberArg(args, 1),
        label,
      }),
  };
}

const USAGE = [
  "Usage: npm run live-chat -- <action> [arguments]",
  "  whoami",
  ...Object.entries(ACTIONS).map(
    ([name, action]) =>
      `  ${[name, ...action.args.map((each) => `<${each}>`)].join(" ")}${action.readsMessage ? " < message" : ""}`,
  ),
].join("\n");

async function liveChat(): Promise<boolean> {
  const { positionals } = parseArgs({ allowPositionals: true });
  const [name = "", ...args] = positionals;
  const action = ACTIONS[name];
  if (name !== "whoami" && action?.args.length !== args.length) {
    throw new LiveChatError(USAGE);
  }
  const env = parseEnv(process.env);
  const message = action?.readsMessage === true ? await readMessage() : "";
  const signedIn = await signIn(env);
  // whoami, the one name with no action: for listing each bot user's ID (#66).
  if (action === undefined) {
    console.log(`User ID: ${signedIn.userId}`);
    console.log(`Email: ${signedIn.email}`);
    return true;
  }
  const api = new HttpSiteApi(env.site, signedIn.token);
  return action.run(api, { args, message, print: console.log });
}

// Checked when the command starts (DEVELOPMENT.md section 4). The message names each
// bad variable, never its value.
function parseEnv(
  source: Readonly<Record<string, string | undefined>>,
): LiveChatEnv {
  const result = liveChatEnvSchema.safeParse(
    Object.fromEntries(
      Object.entries(LIVE_CHAT_ENV_NAMES).map(([key, envName]) => [
        key,
        source[envName],
      ]),
    ),
  );
  if (result.success) {
    return result.data;
  }
  const problems = result.error.issues.map(describeIssue).join("\n");
  throw new LiveChatError(`The environment isn't valid:\n${problems}`);
}

function describeIssue(issue: z.core.$ZodIssue): string {
  const entry = Object.entries(LIVE_CHAT_ENV_NAMES).find(
    ([key]) => key === issue.path[0],
  );
  return `- ${entry?.[1] ?? "An environment variable"} ${issue.message}`;
}

// The whole of standard input, so a message can be more than one line, and needs no
// shell quoting.
async function readMessage(): Promise<string> {
  const message = (await readAll(process.stdin)).trim();
  if (message === "") {
    throw new LiveChatError(
      "No message. Send it on standard input, such as: npm run live-chat -- send <session ID> < message.txt",
    );
  }
  return message;
}

function arg(args: readonly string[], index: number): string {
  return args[index] ?? "";
}

function numberArg(args: readonly string[], index: number): number {
  const text = arg(args, index);
  if (!/^[1-9]\d*$/.test(text)) {
    throw new LiveChatError(`"${text}" isn't a card or option number.`);
  }
  return Number(text);
}

try {
  if (!(await liveChat())) {
    process.exitCode = 1;
  }
} catch (error) {
  if (!(error instanceof LiveChatError)) {
    throw error;
  }
  console.error(error.message);
  process.exitCode = 1;
}
