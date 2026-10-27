// A logging proxy for the Messages API, so the spike can see exactly which tools each
// model call offers. It logs request bodies only, never headers, so the token stays out.
import { appendFileSync } from "node:fs";
import { createServer } from "node:http";

const LOG = new URL("./proxy-log.jsonl", import.meta.url).pathname;
const UPSTREAM = "https://api.anthropic.com";

createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = Buffer.concat(chunks);
  if (req.url?.startsWith("/v1/messages") && body.length > 0) {
    try {
      const parsed = JSON.parse(body.toString("utf8")) as {
        model?: string;
        tools?: { name: string; description?: string }[];
        system?: unknown;
        messages?: unknown[];
      };
      appendFileSync(
        LOG,
        JSON.stringify({
          at: new Date().toISOString(),
          url: req.url,
          model: parsed.model,
          tools: parsed.tools?.map((t) => t.name),
          agentToolDescription: parsed.tools?.find((t) => t.name === "Agent")
            ?.description,
          agentToolInputs: Object.keys(
            ((parsed.tools?.find((t) => t.name === "Agent") as { input_schema?: { properties?: object } } | undefined)
              ?.input_schema?.properties) ?? {},
          ),
          system: parsed.system,
          messages: parsed.messages,
        }) + "\n",
      );
    } catch {
      // Not JSON; forward it anyway.
    }
  }
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (["host", "content-length", "connection", "accept-encoding"].includes(name)) continue;
    if (typeof value === "string") headers.set(name, value);
    else if (Array.isArray(value)) headers.set(name, value.join(", "));
  }
  const upstream = await fetch(UPSTREAM + (req.url ?? "/"), {
    method: req.method,
    headers,
    body: ["GET", "HEAD"].includes(req.method ?? "GET") ? undefined : body,
  });
  const outHeaders: Record<string, string> = {};
  upstream.headers.forEach((value, name) => {
    if (!["content-encoding", "content-length", "transfer-encoding", "connection"].includes(name))
      outHeaders[name] = value;
  });
  res.writeHead(upstream.status, outHeaders);
  if (upstream.body) {
    for await (const chunk of upstream.body) res.write(chunk);
  }
  res.end();
}).listen(8899, "127.0.0.1", () => console.log("proxy on 127.0.0.1:8899"));
