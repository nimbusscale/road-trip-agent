// Spike for #182: a worker's brief, result, and tools in Agent SDK 0.3.301.
import { execSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";

import {
  type AgentDefinition,
  createSdkMcpServer,
  type HookCallbackMatcher,
  type HookEvent,
  type Options,
  query,
  type SDKMessage,
  type SDKUserMessage,
  type SessionKey,
  type SessionStore,
  type SessionStoreEntry,
  tool,
} from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { createServer } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const { values: args } = parseArgs({
  options: {
    message: { type: "string" },
    session: { type: "string" },
    resume: { type: "boolean", default: false },
    "bg-env": { type: "boolean", default: false },
    "def-bg-false": { type: "boolean", default: false },
    "no-builtin": { type: "boolean", default: false },
    "deny-fork": { type: "boolean", default: false },
    "no-hooks": { type: "boolean", default: false },
    "worker-knows-report": { type: "boolean", default: false },
    shape: { type: "string", default: "object" },
    "crash-after-add": { type: "boolean", default: false },
    "drop-unfinished": { type: "boolean", default: false },
    "worker-tools-list": { type: "string", default: "own" },
    "coordinator-tools": { type: "string", default: "agent" },
    proxy: { type: "boolean", default: true },
    label: { type: "string", default: "run" },
    wait: { type: "string", default: "3" },
    "worker-server": { type: "string", default: "ref" },
    "worker-skips-report": { type: "boolean", default: false },
    guard: { type: "boolean", default: false },
    strict: { type: "boolean", default: true },
  },
});

const HERE = new URL(".", import.meta.url).pathname;
const RUN_LOG = `${HERE}runs/${args.label}.jsonl`;
mkdirSync(`${HERE}runs`, { recursive: true });

function log(line: string): void {
  console.log(line);
  appendFileSync(`${HERE}runs/${args.label}.txt`, line + "\n");
}

// ---- Sign-in, the same way as the app's claudeProcessEnv() ----

function oauthToken(): string {
  const env = readFileSync(`${HERE}../.env`, "utf8");
  const match = /^CLAUDE_CODE_OAUTH_TOKEN=(.*)$/m.exec(env);
  if (!match?.[1]) throw new Error("No CLAUDE_CODE_OAUTH_TOKEN in .env");
  return match[1].trim().replace(/^['"]|['"]$/g, "");
}

function processEnv(): Record<string, string | undefined> {
  const kept = Object.entries(process.env).filter(
    ([name]) => !name.startsWith("ANTHROPIC_") && !name.startsWith("CLAUDE"),
  );
  const env: Record<string, string | undefined> = {
    ...Object.fromEntries(kept),
    CLAUDE_CODE_OAUTH_TOKEN: oauthToken(),
    CLAUDE_CONFIG_DIR: "/tmp/worker-spike-claude",
  };
  if (args.proxy) env.ANTHROPIC_BASE_URL = "http://127.0.0.1:8899";
  if (args["bg-env"]) env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS = "1";
  if (args["no-builtin"]) env.CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS = "1";
  return env;
}

// ---- A session store that keeps each transcript line in a file ----

const STORE_DIR = `${HERE}store`;

function storeFile(key: SessionKey | { sessionId: string; subpath?: string }): string {
  const name = (key.subpath ?? "main").replaceAll("/", "__");
  return `${STORE_DIR}/${key.sessionId}/${name}.jsonl`;
}

// The lines a cut-off worker leaves unfinished: an assistant tool_use with no
// tool_result after it.
function dropUnfinished(entries: SessionStoreEntry[]): SessionStoreEntry[] {
  const answered = new Set<string>();
  for (const entry of entries) {
    const content = (entry as { message?: { content?: unknown } }).message?.content;
    if (Array.isArray(content)) {
      for (const block of content as { type?: string; tool_use_id?: string }[]) {
        if (block.type === "tool_result" && block.tool_use_id) answered.add(block.tool_use_id);
      }
    }
  }
  return entries.filter((entry) => {
    const e = entry as { type?: string; message?: { content?: unknown } };
    if (e.type !== "assistant" || !Array.isArray(e.message?.content)) return true;
    const uses = (e.message.content as { type?: string; id?: string }[]).filter(
      (b) => b.type === "tool_use",
    );
    const unfinished = uses.some((b) => b.id && !answered.has(b.id));
    if (unfinished) log(`[store] dropping unfinished line ${JSON.stringify(entry).slice(0, 300)}`);
    return !unfinished;
  });
}

const fileStore: SessionStore = {
  async append(key, entries) {
    const file = storeFile(key);
    mkdirSync(file.slice(0, file.lastIndexOf("/")), { recursive: true });
    for (const entry of entries) appendFileSync(file, JSON.stringify(entry) + "\n");
  },
  async load(key) {
    const file = storeFile(key);
    if (!existsSync(file)) return null;
    const entries = readFileSync(file, "utf8")
      .split("\n")
      .filter((l) => l !== "")
      .map((l) => JSON.parse(l) as SessionStoreEntry);
    const kept = args["drop-unfinished"] ? dropUnfinished(entries) : entries;
    log(`[store] load ${key.subpath ?? "main"}: ${entries.length} lines, handed back ${kept.length}`);
    return kept;
  },
  async listSubkeys(key) {
    const dir = `${STORE_DIR}/${key.sessionId}`;
    if (!existsSync(dir)) return [];
    const keys = readdirSync(dir)
      .filter((f) => f !== "main.jsonl")
      .map((f) => f.replace(/\.jsonl$/, "").replaceAll("__", "/"));
    log(`[store] listSubkeys: ${JSON.stringify(keys)}`);
    return keys;
  },
};

// ---- Fake trip facts ----

const STAYS: Record<string, unknown> = {
  "stay-moab": {
    stayId: "stay-moab",
    town: "Moab, UT",
    checkIn: "2027-04-12",
    nights: 2,
    stops: [
      { stopId: "stop-moab-d1-dinner", day: 1, purpose: "dinner", setTime: null, tier: "mid-range" },
      { stopId: "stop-moab-d2-lunch", day: 2, purpose: "lunch", setTime: null, tier: "value" },
    ],
    otherStopsThatDay: [{ day: 1, name: "Arches National Park", time: "14:00-18:00" }],
    candidatesAlreadyOffered: [],
  },
  "stay-torrey": {
    stayId: "stay-torrey",
    town: "Torrey, UT",
    checkIn: "2027-04-14",
    nights: 1,
    stops: [{ stopId: "stop-torrey-d3-dinner", day: 3, purpose: "dinner", setTime: "19:00", tier: "mid-range" }],
    otherStopsThatDay: [{ day: 3, name: "Capitol Reef", time: "10:00-16:00" }],
    candidatesAlreadyOffered: [],
  },
};

// ---- What code records from each worker's tool calls, by agent_id ----

interface WorkerCalls {
  candidates: { stopId: string; items: { name: string; tier: string }[] }[];
  result?: { problems: string[]; questions: string[] };
}
const byAgent = new Map<string, WorkerCalls>();
function callsOf(agentId: string): WorkerCalls {
  let calls = byAgent.get(agentId);
  if (!calls) byAgent.set(agentId, (calls = { candidates: [] }));
  return calls;
}

// ---- The worker's tools ----

const textResult = (text: string) => ({ content: [{ type: "text" as const, text }] });

let crashArmed = args["crash-after-add"];
function crashSoon(): void {
  if (!crashArmed) return;
  crashArmed = false;
  setTimeout(() => {
    log("[crash] killing Claude Code and this process");
    try {
      execSync(`pkill -KILL -P ${process.pid}`);
    } catch {
      // No child.
    }
    process.kill(process.pid, "SIGKILL");
  }, 1500);
}

function workerServer() {
  return createSdkMcpServer({
    name: "worker",
    tools: [
      tool(
        "read_brief_facts",
        "Reads the facts for the stay in your brief: its dates and nights, each stop's purpose, set time, and tier, the day's other stops, and the candidates already offered.",
        { stay_id: z.string().describe("The stay's ID, from your brief.") },
        async ({ stay_id }) => {
          const stay = STAYS[stay_id];
          return stay
            ? textResult(JSON.stringify(stay, null, 2))
            : { ...textResult(`No stay ${stay_id}.`), isError: true };
        },
      ),
      tool(
        "add_stop_candidates",
        "Adds one to three candidates to a stop. Each has a name and its tier.",
        {
          stop_id: z.string(),
          items: z
            .array(z.object({ name: z.string(), tier: z.enum(["value", "mid-range", "posh"]) }))
            .min(1)
            .max(3),
        },
        async ({ stop_id, items }) => {
          crashSoon();
          return textResult(`Added ${items.length} candidates to ${stop_id}.`);
        },
      ),
      tool(
        "report_result",
        "Ends your work. Give the problems you found and your questions for the user, each as a short sentence. Give empty lists when there are none.",
        { problems: z.array(z.string()), questions: z.array(z.string()) },
        async () => textResult("Result recorded. You're done."),
      ),
    ],
  });
}

function coordinatorServer() {
  return createSdkMcpServer({
    name: "trip",
    tools: [
      tool("read_itinerary", "Reads the trip's itinerary.", {}, async () =>
        textResult(
          "Day 1: Moab stay (stay-moab), dinner stop stop-moab-d1-dinner. Day 2: lunch stop stop-moab-d2-lunch. Day 3: Torrey stay (stay-torrey), dinner stop stop-torrey-d3-dinner.",
        ),
      ),
    ],
  });
}

// ---- The worker's definition ----

const WORKER_PROMPT = [
  "You research one stay for a road trip. Your brief names a stay ID and what to look for.",
  "First call read_brief_facts with the stay ID. Then, for each meal stop, add three restaurant candidates with add_stop_candidates. Make up plausible names; there's no search tool in this test.",
  args["worker-knows-report"]
    ? "When you're done, call report_result with any problems and questions."
    : args["worker-skips-report"]
      ? "When you're done, reply with a short summary. Don't call report_result unless you're told to."
      : "When you're done, reply with a short summary.",
].join("\n");

function workerTools(): string[] | undefined {
  const own = [
    "mcp__worker__read_brief_facts",
    "mcp__worker__add_stop_candidates",
    "mcp__worker__report_result",
  ];
  switch (args["worker-tools-list"]) {
    case "own":
      return own;
    case "own+coordinator":
      return [...own, "mcp__trip__read_itinerary"];
    case "none":
      return undefined;
    default:
      throw new Error("bad --worker-tools-list");
  }
}

function stayResearcher(): AgentDefinition {
  return {
    description: "Fills one stay's meal stops with candidates. Give it the stay ID and what the user wants.",
    prompt: WORKER_PROMPT,
    model: "claude-haiku-5-5",
    tools: workerTools(),
    mcpServers:
      args["worker-server"] === "inline"
        ? [{ worker: workerServer() }]
        : args["worker-server"] === "http"
          ? [{ worker: { type: "http", url: "http://127.0.0.1:8898/mcp" } }]
          : ["worker"],
    ...(args["def-bg-false"] ? { background: false } : {}),
  };
}

const COORDINATOR_PROMPT = [
  "You plan road trips. This is a test harness: there's no user to ask, so do what the message says.",
  "To fill a stay's meal stops with candidates, start one stay-researcher per stay with the Agent tool. In its prompt, give the stay ID and what to look for. It reads the dates and stops itself.",
  "When the workers are done, tell the user, in a few lines, what each one added and any problems or questions.",
].join("\n");

// ---- Hooks ----

function resultFor(agentId: string): string {
  const calls = callsOf(agentId);
  const lines = calls.candidates.flatMap((c) =>
    c.items.map((item) => `- ${c.stopId}: ${item.name} (${item.tier})`),
  );
  return [
    `Worker ${agentId} is done.`,
    "Candidates added:",
    ...(lines.length > 0 ? lines : ["- none"]),
    `Problems: ${calls.result?.problems.join(" ") || "none"}`,
    `Questions: ${calls.result?.questions.join(" ") || "none"}`,
  ].join("\n");
}

function replacedOutput(response: unknown, text: string): unknown {
  switch (args.shape) {
    case "object":
      return { ...(response as object), content: [{ type: "text", text }] };
    case "string":
      return text;
    case "blocks":
      return [{ type: "text", text }];
    default:
      throw new Error("bad --shape");
  }
}

const MAX_SEND_BACKS = 2;
const sendBacks = new Map<string, number>();

const hooks: Partial<Record<HookEvent, HookCallbackMatcher[]>> = {
  PreToolUse: [
    {
      matcher: "mcp__worker__.*",
      hooks: [
        async (input) => {
          if (input.hook_event_name !== "PreToolUse") return {};
          log(`[hook] PreToolUse ${input.tool_name} agent_id=${input.agent_id ?? "(none)"}`);
          if (!args.guard || input.agent_id !== undefined) return {};
          return {
            hookSpecificOutput: {
              hookEventName: "PreToolUse",
              permissionDecision: "deny",
              permissionDecisionReason: "Only a worker can call this tool.",
            },
          };
        },
      ],
    },
  ],
  PostToolUse: [
    {
      matcher: "mcp__worker__.*",
      hooks: [
        async (input) => {
          if (input.hook_event_name !== "PostToolUse") return {};
          const agentId = input.agent_id ?? "(coordinator)";
          log(`[hook] PostToolUse ${input.tool_name} agent_id=${agentId} tool_use_id=${input.tool_use_id}`);
          const calls = callsOf(agentId);
          const toolInput = input.tool_input as Record<string, unknown>;
          if (input.tool_name === "mcp__worker__add_stop_candidates") {
            calls.candidates.push({
              stopId: toolInput.stop_id as string,
              items: toolInput.items as { name: string; tier: string }[],
            });
          }
          if (input.tool_name === "mcp__worker__report_result") {
            calls.result = toolInput as WorkerCalls["result"];
          }
          return {};
        },
      ],
    },
    {
      matcher: "Agent",
      hooks: [
        async (input) => {
          if (input.hook_event_name !== "PostToolUse") return {};
          const response = input.tool_response as { agentId?: string; status?: string };
          log(
            `[hook] PostToolUse Agent tool_use_id=${input.tool_use_id} status=${response.status} agentId=${response.agentId}`,
          );
          log(`[hook] Agent tool_response keys: ${Object.keys(response).join(", ")}`);
          appendFileSync(RUN_LOG, JSON.stringify({ agentToolResponse: response }) + "\n");
          if (response.status !== "completed" || !response.agentId) return {};
          const text = resultFor(response.agentId);
          return {
            hookSpecificOutput: {
              hookEventName: "PostToolUse",
              updatedToolOutput: replacedOutput(response, text),
            },
          };
        },
      ],
    },
  ],
  SubagentStart: [
    {
      hooks: [
        async (input) => {
          if (input.hook_event_name === "SubagentStart")
            log(`[hook] SubagentStart agent_id=${input.agent_id} agent_type=${input.agent_type}`);
          return {};
        },
      ],
    },
  ],
  SubagentStop: [
    {
      hooks: [
        async (input) => {
          if (input.hook_event_name !== "SubagentStop") return {};
          const reported = callsOf(input.agent_id).result !== undefined;
          log(
            `[hook] SubagentStop agent_id=${input.agent_id} stop_hook_active=${input.stop_hook_active} reported=${reported} last=${JSON.stringify(input.last_assistant_message?.slice(0, 120))}`,
          );
          if (reported || input.agent_type !== "stay-researcher") return {};
          const sentBack = sendBacks.get(input.agent_id) ?? 0;
          if (sentBack >= MAX_SEND_BACKS) {
            log(`[hook] SubagentStop letting ${input.agent_id} stop after ${sentBack} sends back`);
            return {};
          }
          sendBacks.set(input.agent_id, sentBack + 1);
          return {
            decision: "block",
            reason:
              "You haven't called report_result. Call it now, with any problems and questions, to end your work.",
          };
        },
      ],
    },
  ],
};

// ---- The run ----

function options(sessionId: string): Options {
  const coordinatorTools =
    args["coordinator-tools"] === "agent"
      ? ["Agent"]
      : args["coordinator-tools"] === "agent+trip"
        ? ["Agent", "mcp__trip__read_itinerary"]
        : [];
  return {
    model: "claude-opus-5-5",
    systemPrompt: COORDINATOR_PROMPT,
    env: processEnv(),
    settingSources: [],
    strictMcpConfig: args.strict,
    tools: coordinatorTools,
    mcpServers: {
      trip: coordinatorServer(),
      ...(["inline", "http"].includes(args["worker-server"]) ? {} : { worker: workerServer() }),
    },
    agents: { "stay-researcher": stayResearcher() },
    allowedTools: ["Agent", "mcp__trip", "mcp__worker"],
    disallowedTools: [
      ...(args["deny-fork"] ? ["Agent(fork)"] : []),
      ...(args["worker-server"] === "ref-deny" ? ["mcp__worker"] : []),
    ],
    permissionMode: "dontAsk",
    ...(args["no-hooks"] ? {} : { hooks }),
    sessionStore: fileStore,
    sessionStoreFlush: "eager",
    ...(args.resume ? { resume: sessionId } : { sessionId }),
    stderr: (data) => appendFileSync(`${HERE}runs/${args.label}.stderr`, data),
  };
}

function summarize(message: SDKMessage): string | undefined {
  const who =
    "parent_tool_use_id" in message && message.parent_tool_use_id
      ? `worker(${message.parent_tool_use_id.slice(-6)})`
      : "coordinator";
  if (message.type === "system") {
    if (message.subtype === "init")
      return `[init] tools=${JSON.stringify(message.tools)} agents=${JSON.stringify(message.agents)}`;
    return `[system ${message.subtype}] ${JSON.stringify(message).slice(0, 300)}`;
  }
  if (message.type === "assistant") {
    return message.message.content
      .map((block) => {
        if (block.type === "text") return `[${who} text] ${block.text}`;
        if (block.type === "tool_use") return `[${who} tool_use ${block.id.slice(-6)}] ${block.name} ${JSON.stringify(block.input)}`;
        return `[${who} ${block.type}]`;
      })
      .join("\n");
  }
  if (message.type === "user") {
    const content = message.message.content;
    if (typeof content === "string") return `[${who} user] ${content.slice(0, 400)}`;
    return content
      .map((block) => {
        if (block.type === "tool_result") {
          const text =
            typeof block.content === "string"
              ? block.content
              : JSON.stringify(block.content);
          return `[${who} tool_result ${block.tool_use_id.slice(-6)}] ${text}`;
        }
        if (block.type === "text") return `[${who} user text] ${block.text.slice(0, 400)}`;
        return `[${who} user ${block.type}]`;
      })
      .join("\n");
  }
  if (message.type === "result") {
    return `[result ${message.subtype}] ${"result" in message ? message.result : ""} turns=${message.num_turns} cost=${message.total_cost_usd}`;
  }
  return undefined;
}

// The worker's tools over HTTP, stateless: a new server and transport per request.
function serveWorkerToolsOverHttp(): void {
  createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : undefined;
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    const server = workerServer().instance;
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
    res.on("close", () => void server.close());
  }).listen(8898, "127.0.0.1");
}

async function main(): Promise<void> {
  if (args["worker-server"] === "http") serveWorkerToolsOverHttp();
  const sessionId = args.session ?? randomUUID();
  log(`=== ${args.label}: session ${sessionId} args=${JSON.stringify(args)}`);
  writeFileSync(`${HERE}runs/${args.label}.session`, sessionId);
  const turnEnded = Promise.withResolvers<undefined>();
  async function* prompt(): AsyncGenerator<SDKUserMessage> {
    yield {
      type: "user",
      message: { role: "user", content: args.message ?? "Fill the stops for the Moab stay." },
      parent_tool_use_id: null,
    } as SDKUserMessage;
    await turnEnded.promise;
  }
  const started = Date.now();
  const q = query({ prompt: prompt(), options: options(sessionId) });
  let results = 0;
  // A second result in the same query() call means the SDK started a turn on its own.
  // Wait a bit after the first result to see whether one comes.
  let idle: NodeJS.Timeout | undefined;
  for await (const message of q) {
    appendFileSync(RUN_LOG, JSON.stringify(message) + "\n");
    const line = summarize(message);
    if (line) log(`${((Date.now() - started) / 1000).toFixed(1)}s ${line}`);
    if (message.type === "system" && message.subtype === "init") {
      const agents = await q.supportedAgents();
      log(`[supportedAgents] ${JSON.stringify(agents.map((a) => a.name))}`);
    }
    if (message.type === "result") {
      results += 1;
      clearTimeout(idle);
      idle = setTimeout(() => turnEnded.resolve(undefined), Number(args.wait) * 1000);
    }
  }
  log(`=== done: ${results} result message(s), ${((Date.now() - started) / 1000).toFixed(1)}s`);
  log(`[byAgent] ${JSON.stringify([...byAgent.keys()])}`);
}

await main();
process.exit(0);
