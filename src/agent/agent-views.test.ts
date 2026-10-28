import type {
  AgentDefinition,
  McpServerConfig,
} from "@anthropic-ai/claude-agent-sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";

import { loadSettings, SETTINGS_PATH } from "../config/settings.js";
import { coordinatorOptions } from "./coordinator.js";
import { conversation, coordinatorGiven } from "./coordinator.fake.js";

// What each agent sees on every turn: its system prompt, then each tool in its
// definition, with its name, description, and input JSON Schema, and the numbers filled
// in from the real settings.json. A PR's diff of an agent's view file is the change to what its model
// sees. `npm run agent-views` rewrites the files (DEVELOPMENT.md sections 2 and 5).

describe("agent views", () => {
  it("matches the coordinator's view file", async () => {
    const options = coordinatorOptions(
      coordinatorGiven(loadSettings(SETTINGS_PATH)),
      conversation(),
      false,
    );
    if (typeof options.systemPrompt !== "string") {
      throw new Error("The coordinator's system prompt isn't plain text.");
    }
    const definition = options.agents?.coordinator;
    if (definition === undefined) {
      throw new Error("The coordinator has no agent definition.");
    }
    const tools = toolsSent(
      definition,
      await toolsOf(options.mcpServers ?? {}),
    );
    await expect(
      view("coordinator", options.systemPrompt, tools),
    ).toMatchFileSnapshot("coordinator.view.md");
  });
});

// Each tool as an MCP client lists it, so the JSON Schema is the one the SDK gets from
// the Zod schema. Names are given as the model sees them, such as
// mcp__trip__read_trip_brief.
async function toolsOf(
  servers: Record<string, McpServerConfig>,
): Promise<Tool[]> {
  const tools: Tool[] = [];
  for (const [serverName, server] of Object.entries(servers)) {
    if (server.type !== "sdk") {
      throw new Error(`The view can't list the tools of ${serverName}.`);
    }
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.instance.connect(serverSide);
    const client = new Client({ name: "agent-views", version: "1.0.0" });
    await client.connect(clientSide);
    const listed = await client.listTools();
    await client.close();
    for (const each of listed.tools) {
      tools.push({ ...each, name: `mcp__${serverName}__${each.name}` });
    }
  }
  return tools;
}

// The tools the definition lists, in its order: what the agent is sent (technical spec
// 6.5). A built-in tool, such as Agent, is on no server, so it has only its name
// (DEVELOPMENT.md section 5).
function toolsSent(definition: AgentDefinition, listed: Tool[]): ViewTool[] {
  return (definition.tools ?? []).map((name) => {
    const tool = listed.find((each) => each.name === name);
    if (tool !== undefined) {
      return tool;
    }
    if (name.startsWith("mcp__")) {
      throw new Error(`The definition lists ${name}, which no server has.`);
    }
    return { name };
  });
}

// A built-in tool is only a name. Claude Code writes its text.
type ViewTool = Tool | { name: string; inputSchema?: undefined };

// Fenced with four backticks, so a prompt or description can hold three.
function view(agent: string, systemPrompt: string, tools: ViewTool[]): string {
  const toolSections = tools.map((each) =>
    each.inputSchema === undefined
      ? `### ${each.name}`
      : [
          `### ${each.name}`,
          "Description:",
          `\`\`\`\`text\n${each.description ?? ""}\n\`\`\`\``,
          "Input schema:",
          `\`\`\`\`json\n${JSON.stringify(each.inputSchema, null, 2)}\n\`\`\`\``,
        ].join("\n\n"),
  );
  return [
    `# What the ${agent} sees`,
    "Written by `npm run agent-views`, with the real settings.json. Don't edit it by hand.",
    "## System prompt",
    `\`\`\`\`text\n${systemPrompt}\n\`\`\`\``,
    "## Tools",
    ...toolSections,
  ]
    .join("\n\n")
    .concat("\n");
}
