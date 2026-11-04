import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";

import { LIVE_CHAT_ENV_NAMES } from "../live-chat/live-chat-env.schema.js";
import {
  type Account,
  ACCOUNT_NAMES,
  accountSchema,
} from "./account.schema.js";

// Makes the run folder for one simulated user's run (#66): one bot user, on one trip,
// with one persona, against one site. The harness starts there, so the folder holds only
// what the run needs. The trip and persona files are copied in under plain names, so
// nothing in the folder hints at the trips and personas it isn't playing.

export class SimSetupError extends Error {
  override name = "SimSetupError";
}

export const SITES: Record<string, string> = {
  local: "http://localhost:5173",
  live: "https://roadtrip.jjk3.com",
};

export interface RunChoice {
  botUser: string;
  trip: string;
  persona: string;
  site: string;
}

export interface RunPlaces {
  // The repo's simulated-users/ folder.
  simulatedUsersDir: string;
  // ~/tmp/road-trip-sims, which holds accounts/ and the run folders.
  simsDir: string;
  // Where chat.sh runs npm run live-chat.
  repoDir: string;
}

// A name becomes part of a path, so it's kept to the form of a file name.
const NAME_PATTERN = /^[a-z0-9][a-z0-9.-]*$/;

// Returns the run folder's path.
export function setUpRun(choice: RunChoice, places: RunPlaces): string {
  const site = siteAddress(choice.site);
  const tripFile = namedFile(join(places.simulatedUsersDir, "trips"), {
    kind: "trip",
    name: choice.trip,
  });
  const personaFile = namedFile(join(places.simulatedUsersDir, "personas"), {
    kind: "persona",
    name: choice.persona,
  });
  const account = readAccount(places.simsDir, checkedName(choice.botUser));
  const runDir = join(
    places.simsDir,
    `${choice.botUser}-${choice.trip}-${choice.persona}`,
  );
  // An old run's files must never mix with a new one's, so an existing folder stops it.
  if (existsSync(runDir)) {
    throw new SimSetupError(
      `${runDir} is already there. Remove it, or pick another trip or persona.`,
    );
  }
  mkdirSync(runDir);
  copyFileSync(
    join(places.simulatedUsersDir, "instructions.md"),
    join(runDir, "instructions.md"),
  );
  copyFileSync(tripFile, join(runDir, "trip.md"));
  copyFileSync(personaFile, join(runDir, "persona.md"));
  writeFileSync(join(runDir, "account.env"), accountEnvText(account, site), {
    mode: 0o600,
  });
  writeFileSync(join(runDir, "chat.sh"), chatScript(places.repoDir));
  chmodSync(join(runDir, "chat.sh"), 0o755);
  return runDir;
}

function siteAddress(site: string): string {
  // Only the sites' own keys, since every object also has keys such as "constructor".
  const address = Object.hasOwn(SITES, site) ? SITES[site] : undefined;
  if (address === undefined) {
    throw new SimSetupError(
      `"${site}" isn't a site. Use one of: ${Object.keys(SITES).join(", ")}.`,
    );
  }
  return address;
}

function checkedName(name: string): string {
  if (!NAME_PATTERN.test(name)) {
    throw new SimSetupError(
      `"${name}" isn't a name. Use lowercase letters, digits, dots, and dashes.`,
    );
  }
  return name;
}

// A trip or persona file, by its name without .md.
function namedFile(
  dir: string,
  { kind, name }: { kind: string; name: string },
): string {
  const file = join(dir, `${checkedName(name)}.md`);
  if (!existsSync(file)) {
    const names = readdirSync(dir)
      .filter((each) => each.endsWith(".md"))
      .map((each) => each.slice(0, -".md".length));
    throw new SimSetupError(
      `There's no ${kind} file named "${name}". Use one of: ${names.join(", ")}.`,
    );
  }
  return file;
}

function readAccount(simsDir: string, botUser: string): Account {
  const file = join(simsDir, "accounts", `${botUser}.env`);
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    throw new SimSetupError(
      `Can't read ${file}. simulated-users/README.md says how to add a bot user.`,
      { cause: error },
    );
  }
  const values = parseEnv(text);
  const result = accountSchema.safeParse({
    email: values[ACCOUNT_NAMES.email],
    password: values[ACCOUNT_NAMES.password],
  });
  if (result.success) {
    return result.data;
  }
  // Names each bad value, never the value itself, since one is a password.
  const problems = result.error.issues
    .map((issue) => {
      const key = issue.path[0] === "email" ? "email" : "password";
      return `- ${ACCOUNT_NAMES[key]} ${issue.message}`;
    })
    .join("\n");
  throw new SimSetupError(`${file} isn't valid:\n${problems}`);
}

// chat.sh reads it with the shell, so each value is quoted, and a password can hold
// any character.
function accountEnvText(account: Account, site: string): string {
  return [
    `${LIVE_CHAT_ENV_NAMES.site}=${shellQuoted(site)}`,
    `${ACCOUNT_NAMES.email}=${shellQuoted(account.email)}`,
    `${ACCOUNT_NAMES.password}=${shellQuoted(account.password)}`,
    "",
  ].join("\n");
}

function shellQuoted(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

// Values exported in the shell win over the repo's .env, which tsx loads with
// --env-file, so the bot user's values are the ones used. A harness can run several
// commands at once, but a person clicks one thing at a time, and each can change the
// trip. So a command refuses to start while another one in the run is still going. It
// locks chat.sh itself, and the lock goes when the command exits, however it ends.
export const BUSY_MESSAGE =
  "Another ./chat.sh command is still running. Wait for its output, then run this one again.";

function chatScript(repoDir: string): string {
  return [
    "#!/bin/sh",
    "# Runs npm run live-chat in the repo, as this run's bot user, on this run's site.",
    "# Usage: ./chat.sh <action> [arguments], with a message on standard input.",
    "set -e",
    'exec 9<"$0"',
    "if ! flock -n 9; then",
    `  echo ${shellQuoted(BUSY_MESSAGE)} >&2`,
    "  exit 1",
    "fi",
    'run_dir=$(cd "$(dirname "$0")" && pwd)',
    "set -a",
    '. "$run_dir/account.env"',
    "set +a",
    `cd ${shellQuoted(repoDir)}`,
    'exec npm run --silent live-chat -- "$@"',
    "",
  ].join("\n");
}
