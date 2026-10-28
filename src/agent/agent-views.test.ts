import type {
  AgentDefinition,
  McpServerConfig,
  Options,
} from "@anthropic-ai/claude-agent-sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";

import { loadSettings, SETTINGS_PATH } from "../config/settings.js";
import { coordinatorOptions } from "./coordinator.js";
import { conversation, coordinatorGiven } from "./coordinator.fake.js";
import { WORKER_TYPE } from "./worker-types.js";

// What each agent sees on every turn: its system prompt, then each tool in its
// definition, with its name, description, and input JSON Schema, and the numbers filled
// in from the real settings.json. A PR's diff of an agent's view file is the change to what its model
// sees. `npm run agent-views` rewrites the files (DEVELOPMENT.md sections 2 and 5).

function options(): Options {
  return coordinatorOptions(
    coordinatorGiven(loadSettings(SETTINGS_PATH)),
    conversation(),
    false,
  );
}

describe("agent views", () => {
  it("matches the coordinator's view file", async () => {
    const given = options();
    if (typeof given.systemPrompt !== "string") {
      throw new Error("The coordinator's system prompt isn't plain text.");
    }
    const definition = definitionOf(given, "coordinator");
    const tools = toolsSent(definition, await toolsOf(given.mcpServers ?? {}));
    await expect(
      view(
        {
          name: "coordinator",
          definition,
          systemPrompt: given.systemPrompt,
        },
        tools,
        workerTypes(given),
      ),
    ).toMatchFileSnapshot("coordinator.view.md");
  });

  // A worker gets its definition's prompt, and the tools its definition lists.
  it("matches the stay researcher's view file", async () => {
    const given = options();
    const definition = definitionOf(given, WORKER_TYPE.stayResearcher);
    const tools = toolsSent(definition, await toolsOf(given.mcpServers ?? {}));
    await expect(
      view(
        {
          name: "stay researcher",
          definition,
          systemPrompt: definition.prompt,
        },
        tools,
        [],
      ),
    ).toMatchFileSnapshot("stay-researcher.view.md");
  });
});

function definitionOf(given: Options, agentType: string): AgentDefinition {
  const definition = given.agents?.[agentType];
  if (definition === undefined) {
    throw new Error(`There's no agent definition for ${agentType}.`);
  }
  return definition;
}

// The worker types the coordinator's Agent entry names, such as
// Agent(stay-researcher), each with its description and tools, as the coordinator is
// told about them: one line each, after its first message (research section 2.9).
function workerTypes(given: Options): string[] {
  const entry = definitionOf(given, "coordinator").tools?.find((name) =>
    name.startsWith("Agent("),
  );
  if (entry === undefined) {
    return [];
  }
  return entry
    .slice("Agent(".length, -1)
    .split(",")
    .map((agentType) => {
      const definition = definitionOf(given, agentType.trim());
      const tools = (definition.tools ?? []).join(", ");
      return `- ${agentType.trim()}: ${definition.description} (Tools: ${tools})`;
    });
}

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

// The agent's name in the heading, its definition, and the system prompt it gets.
interface ViewAgent {
  name: string;
  definition: AgentDefinition;
  systemPrompt: string;
}

// Fenced with four backticks, so a prompt or description can hold three. The model and
// effort come from the agent's definition. The coordinator's query options have the
// same ones (technical spec 6.5).
function view(
  agent: ViewAgent,
  tools: ViewTool[],
  workerTypeLines: string[],
): string {
  const { model, effort } = agent.definition;
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
    `# What the ${agent.name} sees`,
    "Written by `npm run agent-views`, with the real settings.json. Don't edit it by hand.",
    `Model: \`${model ?? "not set"}\`. Effort: \`${String(effort ?? "not set")}\`.`,
    "## System prompt",
    `\`\`\`\`text\n${agent.systemPrompt}\n\`\`\`\``,
    "## Tools",
    ...toolSections,
    ...(workerTypeLines.length === 0
      ? []
      : [
          "## Worker types",
          "The agent types the Agent tool offers.",
          `\`\`\`\`text\n${workerTypeLines.join("\n")}\n\`\`\`\``,
        ]),
  ]
    .join("\n\n")
    .concat("\n");
}
