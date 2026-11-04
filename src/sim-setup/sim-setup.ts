// Dev only: sets up a run folder for a simulated user (#66). simulated-users/README.md
// says how a run is set up and started.
//
// npm run sim-setup -- <bot user> <trip> <persona> <site>
//
// Example: npm run sim-setup -- claude-code-sonnet san-francisco easygoing local. The
// site is local (npm run dev) or live. The folder is ~/tmp/road-trip-sims/<bot user>-
// <trip>-<persona>. It stops if that folder is already there.
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { SimSetupError, setUpRun, SITES } from "./run-folder.js";

const USAGE = `Usage: npm run sim-setup -- <bot user> <trip> <persona> <${Object.keys(SITES).join(" | ")}>`;

function simSetup(): void {
  const { positionals } = parseArgs({ allowPositionals: true });
  const [botUser, trip, persona, site] = positionals;
  if (
    positionals.length !== 4 ||
    botUser === undefined ||
    trip === undefined ||
    persona === undefined ||
    site === undefined
  ) {
    throw new SimSetupError(USAGE);
  }
  const repoDir = fileURLToPath(new URL("../..", import.meta.url));
  const runDir = setUpRun(
    { botUser, trip, persona, site },
    {
      simulatedUsersDir: join(repoDir, "simulated-users"),
      simsDir: join(homedir(), "tmp", "road-trip-sims"),
      repoDir,
    },
  );
  console.log(`Run folder: ${runDir}`);
}

try {
  simSetup();
} catch (error) {
  if (!(error instanceof SimSetupError)) {
    throw error;
  }
  console.error(error.message);
  process.exitCode = 1;
}
