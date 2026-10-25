// Spike (#136): prints what getSubagentMessages() gives for one worker, read from the
// session store in Postgres.
//
// npm run spike:subagent -- <agent session ID> <agent ID>
import { getSubagentMessages } from "@anthropic-ai/claude-agent-sdk";

import { parseEnv } from "../config/env.js";
import { createPool } from "../db/connection.js";
import { TranscriptAdapter } from "../persistence/transcript-adapter.js";
import { TranscriptRepository } from "../persistence/transcript-repository.js";

const [sessionId, agentId] = process.argv.slice(2);
if (sessionId === undefined || agentId === undefined) {
  throw new Error("Give the agent session ID and the agent ID.");
}
const pool = createPool(parseEnv(process.env));
try {
  const sessionStore = new TranscriptAdapter({
    pool,
    makeStore: (connection) => new TranscriptRepository(connection),
  });
  const messages = await getSubagentMessages(sessionId, agentId, {
    sessionStore,
  });
  console.log(JSON.stringify(messages));
} finally {
  await pool.end();
}
