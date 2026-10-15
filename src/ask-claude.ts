// Dev only: sends Claude one question through the Agent SDK and prints the reply. It
// checks that the plan's token works, locally and in the app container (phase 9).
//
// Locally: npm run ask-claude -- "your question"
// On the server: docker compose run --rm app node dist/app/ask-claude.js "your question"
import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";

import { claudeProcessEnv } from "./agent/claude-env.js";
import { ConfigError } from "./config/config-error.js";
import { parseEnv } from "./config/env.js";

const DEFAULT_QUESTION = "In one sentence, what is a road trip?";

async function ask(question: string): Promise<boolean> {
  const env = parseEnv(process.env);
  const messages = query({
    prompt: question,
    options: {
      env: claudeProcessEnv(process.env, env.claudeCodeOauthToken),
      // No settings files, no tools, and nothing saved: just the question and reply.
      settingSources: [],
      tools: [],
      persistSession: false,
    },
  });
  let succeeded = false;
  for await (const message of messages) {
    succeeded = printMessage(message) ?? succeeded;
  }
  return succeeded;
}

// Returns whether the turn succeeded, once the result arrives.
function printMessage(message: SDKMessage): boolean | undefined {
  if (message.type === "system" && message.subtype === "init") {
    // "none" means no API key: the request went to the plan.
    console.log(`API key source: ${message.apiKeySource}`);
    console.log(`Model: ${message.model}`);
    return undefined;
  }
  if (message.type !== "result") {
    return undefined;
  }
  if (message.subtype !== "success" || message.is_error) {
    console.error(`Claude didn't answer: ${message.subtype}`);
    return false;
  }
  console.log(`Reply: ${message.result}`);
  console.log(`Took ${String(message.duration_ms)} ms`);
  return true;
}

try {
  const succeeded = await ask(process.argv[2] ?? DEFAULT_QUESTION);
  process.exitCode = succeeded ? 0 : 1;
} catch (error) {
  if (!(error instanceof ConfigError)) {
    throw error;
  }
  console.error(error.message);
  process.exitCode = 1;
}
