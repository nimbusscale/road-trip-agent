import {
  type AccountInfo,
  query,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";

import { sdkUserMessage } from "../agent/sdk-user-message.schema.js";

// Spike (#132): which credential the coordinator's Claude Code process signs in with,
// given the same environment the coordinator gets. JUDGE_API_KEY is in the eval's
// environment, so it reaches that process too. This shows it doesn't change the account.
export interface PlanCheck {
  // From the SDK's init message. "none" means no API key: the plan's OAuth token.
  apiKeySource: string;
  account: AccountInfo;
  // Names only, never values.
  anthropicVariables: string[];
  judgeKeyPassed: boolean;
}

export async function checkPlanToken(
  processEnv: Record<string, string | undefined>,
  model: string,
): Promise<PlanCheck> {
  const done = Promise.withResolvers<undefined>();
  async function* prompt(): AsyncGenerator<SDKUserMessage> {
    yield sdkUserMessage("Reply with the word OK.");
    await done.promise;
  }
  const run = query({
    prompt: prompt(),
    options: {
      model,
      env: processEnv,
      settingSources: [],
      strictMcpConfig: true,
      tools: [],
      permissionMode: "dontAsk",
      persistSession: false,
    },
  });
  let apiKeySource = "(no init message)";
  let account: AccountInfo = {};
  try {
    for await (const message of run) {
      if (message.type === "system" && message.subtype === "init") {
        apiKeySource = message.apiKeySource;
        account = await run.accountInfo();
      }
      if (message.type === "result") {
        break;
      }
    }
    return {
      apiKeySource,
      account,
      anthropicVariables: Object.keys(processEnv).filter((name) =>
        name.startsWith("ANTHROPIC_"),
      ),
      judgeKeyPassed: processEnv.JUDGE_API_KEY !== undefined,
    };
  } finally {
    done.resolve(undefined);
    run.close();
  }
}
