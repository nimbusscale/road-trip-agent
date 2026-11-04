import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type RunPlaces, setUpRun } from "./run-folder.js";

// A password with characters a shell would otherwise read: a quote, $, and *.
const PASSWORD = "it's $HOME*x";

let root: string;
let places: RunPlaces;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "sim-setup-"));
  places = {
    simulatedUsersDir: join(root, "simulated-users"),
    simsDir: join(root, "sims"),
    repoDir: join(root, "repo"),
  };
  mkdirSync(join(places.simulatedUsersDir, "trips"), { recursive: true });
  mkdirSync(join(places.simulatedUsersDir, "personas"));
  mkdirSync(join(places.simsDir, "accounts"), { recursive: true });
  writeFileSync(join(places.simulatedUsersDir, "instructions.md"), "Do this.");
  writeFileSync(join(places.simulatedUsersDir, "trips", "moab.md"), "Moab.");
  writeFileSync(join(places.simulatedUsersDir, "trips", "sf.md"), "SF.");
  writeFileSync(join(places.simulatedUsersDir, "personas", "curt.md"), "Curt.");
  writeFileSync(
    join(places.simsDir, "accounts", "codex-gpt.env"),
    `LIVE_CHAT_EMAIL=codex-gpt@example.com\nLIVE_CHAT_PASSWORD="${PASSWORD}"\n`,
  );
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const CHOICE = {
  botUser: "codex-gpt",
  trip: "moab",
  persona: "curt",
  site: "live",
};

describe("setUpRun", () => {
  it("makes a folder with only the run's files, whose account the shell reads back", () => {
    const runDir = setUpRun(CHOICE, places);

    expect(runDir).toBe(join(places.simsDir, "codex-gpt-moab-curt"));
    expect(readdirSync(runDir).sort()).toEqual([
      "account.env",
      "chat.sh",
      "instructions.md",
      "persona.md",
      "trip.md",
    ]);
    expect(readFileSync(join(runDir, "trip.md"), "utf8")).toBe("Moab.");
    const read = execFileSync(
      "sh",
      [
        "-c",
        '. ./account.env; printf "%s\\n" "$LIVE_CHAT_SITE" "$LIVE_CHAT_EMAIL" "$LIVE_CHAT_PASSWORD"',
      ],
      { cwd: runDir, encoding: "utf8" },
    );
    expect(read.split("\n").slice(0, 3)).toEqual([
      "https://roadtrip.jjk3.com",
      "codex-gpt@example.com",
      PASSWORD,
    ]);
  });

  it("stops when the run folder is already there, and leaves its files alone", () => {
    const runDir = setUpRun(CHOICE, places);
    writeFileSync(join(runDir, "trip.md"), "An old run's notes.");

    expect(() => setUpRun(CHOICE, places)).toThrow("is already there");
    expect(readFileSync(join(runDir, "trip.md"), "utf8")).toBe(
      "An old run's notes.",
    );
  });

  it("names the trips there are when the trip isn't one", () => {
    expect(() => setUpRun({ ...CHOICE, trip: "denver" }, places)).toThrow(
      'There\'s no trip file named "denver". Use one of: moab, sf.',
    );
    expect(readdirSync(places.simsDir)).toEqual(["accounts"]);
  });
});
