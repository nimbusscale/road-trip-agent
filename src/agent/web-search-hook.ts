import type { HookCallback } from "@anthropic-ai/claude-agent-sdk";

import { webSearchDomainsSchema } from "./worker-hook-input.schema.js";
import { WORKER_TYPE } from "./worker-types.js";

// The leg scout searches the web on Atlas Obscura only, and this hook enforces it, not
// only its instructions (tool design, section 4). allowedTools covers the whole session,
// so it can't refuse WebSearch to one agent and allow it to another (technical spec 6.5).

export const ATLAS_OBSCURA_DOMAIN = "atlasobscura.com";

export const ATLAS_OBSCURA_ONLY_TEXT = `A leg scout can search the web on Atlas Obscura only. Search again with allowed_domains set to ["${ATLAS_OBSCURA_DOMAIN}"].`;

// For the PreToolUse matcher on WebSearch. A search by any other agent is left alone.
export const legScoutWebSearchHook: HookCallback = (input) => {
  if (
    input.hook_event_name !== "PreToolUse" ||
    input.agent_type !== WORKER_TYPE.legScout ||
    isAtlasObscuraOnly(input.tool_input)
  ) {
    return Promise.resolve({});
  }
  return Promise.resolve({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: ATLAS_OBSCURA_ONLY_TEXT,
    },
  });
};

// An input that isn't the shape WebSearch takes counts as no limit, so it's refused too.
function isAtlasObscuraOnly(toolInput: unknown): boolean {
  const parsed = webSearchDomainsSchema.safeParse(toolInput);
  return (
    parsed.success &&
    parsed.data.length > 0 &&
    parsed.data.every((domain) => domain === ATLAS_OBSCURA_DOMAIN)
  );
}
