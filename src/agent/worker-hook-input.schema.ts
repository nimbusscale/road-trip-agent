import { z } from "zod";

import { REPORT_RESULT_INPUT } from "../tools/report-result-input.schema.js";

// What the worker hooks read from the Agent SDK's hook inputs (technical spec 6.5). Each
// schema checks only the parts the hooks read. It's a schema file so it can use the
// SDK's snake_case names.

// A tool's reply, as the text the agent read. The SDK gives an MCP tool's reply as its
// list of content blocks. Our tools reply with text only.
export const toolReplyTextSchema = z
  .array(z.object({ type: z.literal("text"), text: z.string() }))
  .transform((blocks) => blocks.map((block) => block.text).join("\n"));

// The IDs a worker read with read_worker_brief_facts.
export const readIdsSchema = z
  .looseObject({ stopOrStayIds: z.array(z.string()) })
  .transform((input) => input.stopOrStayIds);

// The stop or stay a candidate tool or set_stay_weather filled.
export const filledStopIdSchema = z
  .looseObject({ stopId: z.string() })
  .transform((input) => input.stopId);

export const filledStayIdSchema = z
  .looseObject({ stayId: z.string() })
  .transform((input) => input.stayId);

// The tool's own schema. A call that the hook sees has already passed it.
export const reportSchema = REPORT_RESULT_INPUT;

// The Agent tool's input. Only the agent type asked for is read.
export const agentInputSchema = z
  .looseObject({ subagent_type: z.string() })
  .transform((input) => input.subagent_type);

// Any Agent tool output, such as a background worker's "async_launched", for its status.
export const agentStatusSchema = z
  .looseObject({ status: z.string() })
  .transform((output) => output.status);

// The Agent tool's output once the worker is done (AgentOutput in the SDK's
// sdk-tools.d.ts). Every other field is kept, since the hook hands back the whole object
// with only its content replaced. A string in its place is ignored, with no error.
export const completedAgentOutputSchema = z.looseObject({
  status: z.literal("completed"),
  agentId: z.string(),
});
