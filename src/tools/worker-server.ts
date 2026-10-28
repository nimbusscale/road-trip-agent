import {
  createSdkMcpServer,
  type McpSdkServerConfigWithInstance,
} from "@anthropic-ai/claude-agent-sdk";

import { REPORT_RESULT_INPUT } from "./report-result-input.schema.js";
import { strictTool, type StrictToolDefinition } from "./strict-tool.js";
import { textReply } from "./tool-reply.js";

// Part of every tool name the model sees, such as mcp__worker__report_result (tool
// design, section 1).
export const WORKER_SERVER_NAME = "worker";

export const REPORT_RESULT_NAME = "report_result";

export const REPORT_RESULT_DESCRIPTION =
  "Ends your work. Call it last, once your other calls are done, with your problems and your questions for the user. The coordinator gets what you added or saved from those calls, so don't repeat it here. A second call replaces the first.";

// The tool does nothing itself. A hook records its input, and code builds the result
// the coordinator sees from it (technical spec 6.5).
export function reportResultTool(): StrictToolDefinition {
  return strictTool(
    REPORT_RESULT_NAME,
    REPORT_RESULT_DESCRIPTION,
    REPORT_RESULT_INPUT,
    () => Promise.resolve(textReply(["Result recorded. You're done."])),
  );
}

// Made for each session, like the other servers. One server object can't be shared by
// two sessions running at once (tool design, section 4).
export function createWorkerServer(): McpSdkServerConfigWithInstance {
  return createSdkMcpServer({
    name: WORKER_SERVER_NAME,
    // Every worker ends with it, so it's never left for a tool search.
    alwaysLoad: true,
    tools: [reportResultTool()],
  });
}
