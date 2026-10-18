import type { SdkMcpToolDefinition } from "@anthropic-ai/claude-agent-sdk";
import type { z } from "zod";

import type { ToolReply } from "./tool-reply.js";

// A tool whose input refuses any key it doesn't name. The Agent SDK's tool() takes only
// a plain list of fields, which it wraps in an object that drops unknown keys. So a
// misnamed item, such as tripLength, would vanish, and the tool would say it saved
// (tool design, section 4: the tool never guesses). Given a strict object, the SDK
// passes it on as it is: the model sees additionalProperties false, and a call with an
// unknown key is refused, naming it.
export interface StrictToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: z.ZodObject;
  readonly annotations?: NonNullable<SdkMcpToolDefinition["annotations"]>;
  readonly handler: (args: unknown) => Promise<ToolReply>;
}

export function strictTool<Schema extends z.ZodObject>(
  name: string,
  description: string,
  inputSchema: Schema,
  handler: (args: z.infer<Schema>) => Promise<ToolReply>,
): StrictToolDefinition {
  return {
    name,
    description,
    inputSchema,
    // The SDK has checked the input against the schema. Parsing again gives it its type.
    handler: (args) => handler(inputSchema.parse(args)),
  };
}
