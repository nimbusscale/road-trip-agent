# Road Trip Planner: Agent Evaluations with Arize Phoenix (Spike)

> **This is a research document, not a design document.** It records what a spike found when it ran one agent evaluation with Arize Phoenix (#132), and what a second spike found when it traced workers (#136). It does not make design decisions. The build is #53.

The question: can self-hosted Phoenix trace the coordinator, and run an evaluation of it from start to finish, on the Agent SDK version the app uses and on the Claude Max plan? And what does one run take?

An **evaluation case** here is one scripted conversation with the coordinator, plus the scorers that grade it. A **run** is one time through the case. A Phoenix **experiment** runs a case one or more times and keeps each run's output and scores.

---

## 1. Method

- **The code** is on the [`spike/phoenix-evals`](https://github.com/nimbusscale/road-trip-agent/tree/spike/phoenix-evals) branch, which never gets a PR. It doesn't pass `npm run check`: three lint errors are left, one for function length and two for the Anthropic SDK's snake_case fields. Its commits skip the pre-commit hook for that reason. The app's 708 tests still pass on it.
- **Versions:** Phoenix image `arizephoenix/phoenix:20.26.0`, the newest release on 2026-10-24. `@anthropic-ai/claude-agent-sdk` 0.3.301, the app's. `@arizeai/phoenix-otel` 2.3.0, `@arizeai/openinference-instrumentation-claude-agent-sdk` 0.3.5, and `@arizeai/phoenix-client` 7.16.2, each the newest on 2026-10-24. The instrumentation was tried first, then replaced by spans from our own code (2.2), which use `@opentelemetry/api` 1.9.1 and `@arizeai/openinference-semantic-conventions` 2.15.0. Coordinator on `claude-opus-5-5`, judge on `claude-haiku-5-5`. The throwaway worker in 2.7 is on `claude-sonnet-5-5`.
- **The case** is the "user or trip memory" check from #48 (technical spec 3.1). A fresh user, with one user memory item added first, starts a new trip and sends three messages:
  1. "Hi! We're planning a road trip from Austin to Santa Fe in April, about 6 days."
  2. "One thing about us: we never eat at chains."
  3. "Also, skip I-35 this time."

  "We never eat at chains" should go to user memory, and "skip I-35 this time" to trip memory.
- **The commands:**

  ```sh
  docker compose --profile evals up -d phoenix
  npm run eval:memory                            # one run
  npm run eval:memory -- --repetitions 5         # five runs, in one experiment
  npm run eval:rejudge -- --experiment <ID> --times 4   # the judge again, on saved runs
  ```

- **Each case ran 5 times** (section 2.5), plus one run first to check the setup. The judge then ran 4 more times on the same 5 conversations, to tell its spread apart from the coordinator's.

---

## 2. Results

### 2.1 Phoenix in Docker Compose

Phoenix is a service in `compose.yaml`, under its own profile, so it starts only when asked:

```yaml
phoenix:
  profiles: ["evals"]
  image: arizephoenix/phoenix:20.26.0
  environment:
    PHOENIX_WORKING_DIR: /mnt/data
    PHOENIX_ENABLE_AUTH: "false"
    PHOENIX_TELEMETRY_ENABLED: "false"
  volumes:
    - phoenix-data:/mnt/data
  ports:
    - "127.0.0.1:6006:6006"
```

- **It listens only on this machine.** Port 6006 serves the web UI, the REST API, and traces sent over OTLP (OpenTelemetry's protocol for sending traces) over HTTP. The gRPC trace port, 4317, isn't published. `ss -ltn` showed `127.0.0.1:6006` and nothing on other addresses.
- **There's no sign-in.** `PHOENIX_ENABLE_AUTH` is off, which is Phoenix's default.
- **Its data is in its own volume, `phoenix-data`,** as a SQLite file, `phoenix.db`. It isn't in our Postgres. So traces stay out of the app's database and its nightly backup, and removing the volume removes all of Phoenix's data. Phoenix can use Postgres instead, with `PHOENIX_SQL_DATABASE_URL`, but nothing here needed it.
- **On the server it never starts,** since the server's `.env` sets `COMPOSE_PROFILES=production`, not `evals`.

### 2.2 Tracing a coordinator turn

The spike first traced turns with Phoenix's instrumentation for the Agent SDK. It left out the user's message and the thinking, and got the tokens wrong. So the spike replaced it with spans made by our own code, from the SDK's messages. The spike branch now has only the second.

#### Spans from our own code

**`runTurnWithSdk` passes each of the SDK's messages to a `TurnTrace`** (`src/agent/turn-trace.ts` on the spike branch, about 300 lines). It calls the SDK's own `query()`. `TurnTrace` makes a span for the turn, and under it, in order, a span for each model call and one for each tool call. Each model call is one pass of the agent loop: the model gets everything so far and decides what to do next. The turn ends with a call that writes text and asks for no tools. A turn from `npm run chat`:

```
AGENT  coordinator.turn          "I'd like to plan a short new england road trip, I want to start and end in boston…"
LLM      coordinator.model_call  thinking, then asks for find_place and update_trip_brief   470 output tokens
TOOL     mcp__places__find_place
TOOL     mcp__trip__update_trip_brief
LLM      coordinator.model_call  asks for update_itinerary                                    134 output tokens
TOOL     mcp__trip__update_itinerary
LLM      coordinator.model_call  thinking, then the reply                                     660 output tokens
```

- **The turn span** has the message the model got as its input, with the app's lines, and the reply as its output. Its `session.id` is the agent session ID, so Phoenix's Sessions view groups a chat's turns and shows its first message and last reply.
- **A model call span** has the call's output: its thinking, its text, and the tool calls it asked for. The thinking is an OpenInference content of type `reasoning`. The same output is also in `output.value` as JSON. The span has no input. What the call got is the turn's message, or the tool results before it.
- **A tool span** is our code running a tool the model asked for, with the tool's input and result. A refused call is marked as an error, with the tool's error text as its status message.

**Each model call's tokens come from the SDK's stream events.** The SDK sends each block of a call, such as its thinking or one tool call, as its own message with the call's ID. But each block carries the token counts from when the call started, such as 8 output tokens. With the SDK's `includePartialMessages` option on, the call's `message_delta` event gives its final count, and `message_start` gives when it started. For two chat turns, the calls added up to exactly what the terminal chat printed: 46,944 input and 1,476 output tokens, then 26,644 and 371.

**The tokens have to be on LLM spans.** Phoenix adds up tokens, and works out a price, only from LLM spans. With the counts on an AGENT span, it showed 0 for the trace and the session. With them on the model call spans, that chat's session showed 73,588 input and 1,847 output tokens, the two turns' sums, priced at $0.066.

**Thinking is part of a call's output tokens.** The API bills it as output, and there's no separate count. The billed thinking is longer than the summary the span shows.

**The times are close, not exact.** A model call's span runs from its `message_start` event to its last event. A tool's span runs from when the model's call for it arrives to when its result does. The SDK starts a tool as soon as the model finishes writing its call, so a tool can start before its model call ends.

**Not in the trace:** the system prompt, and the input each model call got.

**With no tracer provider set up, as in the app, the spans go nowhere.** The tracer is looked up for each span, since Phoenix's `register()`, and `runExperiment()` each time a task runs, replace the global provider (below).

#### First try: Phoenix's instrumentation

**The SDK was imported through the instrumented module.** The SDK is ESM only, so its exports can't be patched in place. `manuallyInstrument()` returns a patched copy of the module, and only `query()` calls through that copy make spans.

**The setup in Phoenix's docs made no spans at first.** The instrumentation keeps the tracer it gets when it's made. Phoenix's `register()` then throws away the global tracer provider object and makes a new one, so the kept tracer sends its spans nowhere. `runExperiment()` does the same each time a task runs. The fix was a small tracer that looks up the global provider each time a span starts (`GlobalTracer`). With it, spans reached Phoenix from both `npm run chat` and an experiment.

**Each turn was one trace,** with one AGENT span for the turn and one TOOL span under it for each tool call. Each MCP tool call showed its input and its result, and a refused call was marked as an error.

**The user's message didn't show.** The AGENT span's input was `{}`. The app sends its prompt to the SDK as a stream of messages, which the instrumentation can't read, and it only records a prompt given as plain text.

**The prompt token counts were wrong.** The AGENT span counted only input tokens that weren't read from or written to the prompt cache. For the same two turns, the terminal chat, which adds them in, printed these:

| Turn | `npm run chat` input tokens | AGENT span `llm.token_count.prompt` | Output tokens, both |
|---|---|---|---|
| 1 | 48,255 | 8 | 1,885 |
| 2 | 27,893 | 4 | 345 |

**The model calls and the thinking weren't in the trace.** The instrumentation makes only AGENT and TOOL spans. Its span did have the SDK's cost estimate (`llm.cost.total`). Each turn after the first resumes the session, and on those turns the cost is the session's total so far, not the turn's. For example, a turn with 201 output tokens showed $0.096.

### 2.3 One evaluation case from start to finish

`npm run eval:memory` does all of it in one process:

1. **Checks the plan token** (section 2.4).
2. **Makes the dataset,** `user-or-trip-memory`, with one example. Its input is the three messages and the user memory to add first. Its expected output is each statement, the memory it belongs in, and a pattern that finds it, such as `I-?35`. `createDataset()` updates a dataset of the same name, so a rerun doesn't make a second one.
3. **Runs the experiment** with `runExperiment()`. The task makes a fresh user UUID, so memory starts empty. It adds the user memory item through `MemoryWriter.add()`, not SQL (persistence design 8.8). Then it runs the conversation through the same code as `npm run chat`: `TripWriter.startTrip()`, `SessionWriter.start()`, `CoordinatorTurns`, and `runTurnWithSdk`. It returns the user and trip IDs, and each turn's reply, tool calls, time, and tokens. Runs go one at a time (`concurrency: 1`), so each one's use of the plan can be told apart.
4. **Scores each run** with two scorers (below).
5. **Prints a summary** of each run's scores and each turn's tokens. Phoenix shows each run's price. For the five runs in 2.5, which ran with the instrumentation, the summary also read the SDK's cost estimate from its spans. It took the highest of a run's three, since each is the session's total so far (2.2).

**The experiment shows up in Phoenix,** with links the client prints:

```
Links
  Dataset      http://127.0.0.1:6006/datasets/RGF0YXNldDox/examples
  Experiments  http://127.0.0.1:6006/datasets/RGF0YXNldDox/experiments
  Experiment   http://127.0.0.1:6006/datasets/RGF0YXNldDox/compare?experimentId=RXhwZXJpbWVudDoy
```

**Each run's trace holds the whole conversation.** The coordinator's spans land under the experiment's task span. The task span's input is the whole example, and each turn span's input is the message that turn sent. This is from one run on 2026-10-25, with our own spans (2.2). The five runs in 2.5 ran with the instrumentation.

```
CHAIN  Task: task
AGENT    coordinator.turn           turn 1
LLM        coordinator.model_call
TOOL       mcp__trip__read_trip_brief
TOOL       mcp__trip__read_itinerary
TOOL       mcp__memory__read_memory
LLM        coordinator.model_call
TOOL       mcp__places__find_place
...
AGENT    coordinator.turn           turn 2
LLM        coordinator.model_call
TOOL       mcp__memory__add_memory_item
LLM        coordinator.model_call
AGENT    coordinator.turn           turn 3
...
```

Phoenix put that run at 102,941 tokens, the same as the app's own count of 100,645 input and 2,296 output.

**The two scorers:**

- **`saved-scope` is code that reads what was saved from the database,** with `MemoryReader.read()`. For each statement, it checks that an item matching the pattern is in the right memory, and that none is in the other one. The item added before the conversation is left out. Its score is the share of the four checks passed.
- **`judge` is a model judge on `claude-haiku-5-5`,** called with the Anthropic SDK and structured output. It gets the conversation, the items saved during it, and the expected statements. It grades three things code can't:
  - **faithful:** each saved item keeps the user's meaning, with no rule the user didn't state.
  - **told:** the coordinator told the user where it saved each statement.
  - **nothing-extra:** nothing was saved that belongs in the trip's plan, or that the user didn't say.

  It answers each with passed or failed and a reason. Code works out the score as the share passed.

### 2.4 The judge's key and the plan token

**`JUDGE_API_KEY` was set in `.env` and worked** for every judge call, 28 in all. The judge passes it to the Anthropic SDK as `apiKey`, so the SDK never looks for `ANTHROPIC_API_KEY`. If the key is missing, or a call fails, such as when the key has expired, the judge returns no score and a label that says why (such as "no key"), and the code score still counts.

**The coordinator still runs on the plan token.** `JUDGE_API_KEY` reaches the Claude Code process along with the rest of the environment, since `claudeProcessEnv()` leaves out only `ANTHROPIC_` names. Before each experiment, the script starts one Claude Code process with the coordinator's environment and asks which credential it used:

```
Plan check: {"apiKeySource":"none","account":{"tokenSource":"CLAUDE_CODE_OAUTH_TOKEN","apiProvider":"firstParty"},"anthropicVariables":[],"judgeKeyPassed":true}
```

`apiKeySource: "none"` means no API key was used. The SDK's types say that's the value for a claude.ai sign-in or a bearer token. The token came from `CLAUDE_CODE_OAUTH_TOKEN`.

### 2.5 Five runs

| Run | Time | Model calls | Input tokens | Cached | Output tokens | SDK estimate | `saved-scope` | `judge` |
|---|---|---|---|---|---|---|---|---|
| 1 | 36 s | 13 | 101,090 | 97,815 | 2,435 | $0.095 | 1 | 0.67 |
| 2 | 38 s | 13 | 100,703 | 97,455 | 2,366 | $0.093 | 1 | 0.67 |
| 3 | 44 s | 13 | 100,632 | 97,450 | 2,262 | $0.090 | 1 | 0.67 |
| 4 | 29 s | 12 | 99,519 | 96,581 | 2,174 | $0.086 | 1 | 0.67 |
| 5 | 39 s | 13 | 100,208 | 97,196 | 2,069 | $0.085 | 1 | 1 |

"Cached" is the part of the input tokens read from the prompt cache. The SDK estimate is the SDK's `total_cost_usd` on the run's last turn, its price for the whole run at API rates.

**The coordinator barely changed from run to run.** Every run saved the chain rule to user memory and the I-35 request to trip memory, and nothing to the wrong one. The wording was close every time. For example, runs 2 and 5:

```
user: Never eats at chain restaurants. Suggest only independent, local places for meals.
trip: Avoid I-35 on this trip. Plan routes out of Austin that don't use it, and set waypoints if a leg would default onto it.

user: Never eats at chain restaurants. Suggest only local, independent places for meals.
trip: User asked to avoid I-35 on this trip. Route around it.
```

Most runs add an instruction to itself to the user's words, such as "Suggest only independent, local places for meals."

**The judge changed more than the coordinator did.** It failed runs 1 to 4, but not always for the same thing, and it gave the same wording different grades. "Suggest only independent, local places for meals" is in every run. In runs 2 and 4 the judge called it a rule the user never stated, and in runs 1, 3, and 5 it passed it. In run 3 it also read "I've saved the basics: the trip starts in Austin, ends in Santa Fe" as saving the trip's places to memory, though they went to the trip's plan.

**The judge alone, run again on the same five conversations,** four more times:

| Run | First score | Scores again | Criteria failed |
|---|---|---|---|
| 1 | 0.67 | 1, 0.33, 1, 0.33 | faithful, nothing-extra, or none |
| 2 | 0.67 | 0.67, 0.67, 0.67, 0.67 | faithful |
| 3 | 0.67 | 0.67, 0.67, 1, 1 | nothing-extra, or none |
| 4 | 0.67 | 0.67, 0.67, 0.67, 0.67 | first faithful, then nothing-extra |
| 5 | 1 | 1, 1, 1, 1 | none |

Three of the five conversations got the same score all five times. Two flipped between pass and fail on the same text. So a judge score from one run can't tell a change in the coordinator from the judge's own spread. The likely cause is that the rubric doesn't say whether a note the coordinator adds for itself, such as "route around it," counts as a rule the user didn't state.

### 2.6 What one run takes

**The coordinator:** about 100,000 input tokens, 97% of them read from the prompt cache, and 2,070 to 2,440 output tokens, over 12 or 13 model calls in 3 turns. A run takes 30 to 45 seconds. The five ran one after another in 3 minutes 19 seconds. The SDK prices one run at $0.085 to $0.095 at API rates. Phoenix works out its own price from the LLM spans' token counts (2.2). For one run that had both, it gave $0.081, and the SDK gave $0.091. The spike didn't look into the gap. For comparing one change against another, the gap matters less than that each is worked out the same way every time.

This runs on the Max plan, so the SDK's estimate isn't a bill. Systems design section 5 says the plan's monthly API credits and its subscription limits both cover the Agent SDK. Nothing the SDK returns says which one a run drew from, or what share of a limit it used. Comparing claude.ai's Settings > Usage page before and after a run would show it.

**The judge:** 2,000 to 2,250 input tokens and 300 to 1,200 output tokens per call, paid from the API credits on `JUDGE_API_KEY`. At Haiku 5.5's prices, $0.10 per million input tokens and $0.50 per million output, that's $0.0004 to $0.0008 a call. The output varies with how long it thinks. For the 27 calls on 2026-10-24, that's about $0.013. The Claude Console's cost report for 2026-10-24 fits: $0.01 of input and $0.01 of output on the judge's key, each rounded to the cent. It shows no Opus 5.5 use, which also confirms the coordinator ran on the plan.

**Phoenix** costs nothing to run. It's one more container on this machine.

### 2.7 Tracing workers

#136 added a throwaway worker on the spike branch, to find out what the SDK sends from a worker, and to trace it. A **worker** is a subagent the coordinator starts with its `Agent` tool (technical spec section 6). The commands are the same as in section 1, with `npm run chat`.

#### The throwaway worker

`coffee-finder` is in the coordinator's `agents` option. `Agent` is added to the coordinator's `tools` and `allowedTools`.

```ts
const COFFEE_FINDER = {
  description:
    "Finds two coffee shops near one place. Give it the place's name and town.",
  prompt:
    "Find two coffee shops near the place you're given, with find_place. Reply with each one's name and address, and nothing else.",
  tools: [`mcp__places__find_place`],
  model: "claude-sonnet-5-5",
};
```

- **The coordinator started it from a message alone.** Its instructions weren't changed. This message started one worker: "Before we plan anything: can you find me two coffee shops near the Ferry Building in San Francisco?" Adding "and two near Pike Place Market in Seattle" started two, from the same model call.
- **The SDK offers its built-in agent types too.** The transcript's list of agents had `claude`, `Explore`, `general-purpose`, and `Plan`, next to `coffee-finder`. The coordinator never picked one.
- **The SDK's init message calls the tool `Task`.** `npm run chat` printed `Tools: Task, mcp__memory__add_memory_item, …`. The model's calls use `Agent`.

#### Workers in the background

**The `Agent` tool runs a worker in the background unless the model says not to.** The description of its `run_in_background` input says "Agents run in the background by default." With one worker, the coordinator set it to `false` every time. With two, it left it out, and the SDK started both in the background:

- Each `Agent` call returned at once, with "Async agent launched successfully." The turn ended with "I've started two coffee searches."
- When each worker was done, the SDK started a new turn on its own, in the same `query()` call, to give the coordinator the result. So one user message got three result messages, and the chat printed three replies.

**`CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` makes every worker run in the foreground.** It goes in the Claude Code process's environment. With it, the same message ran both workers at the same time. The coordinator got both results in the same turn, which had one result message. The spike branch sets it in `coordinatorOptions()`, and everything below ran with it.

#### What the SDK sends from a worker

**Each of a worker's messages has `parent_tool_use_id` set,** to the ID of the coordinator's `Agent` call that started it. It also has `agent_id`, the worker's own ID. The coordinator's messages have `parent_tool_use_id: null`. The SDK's `task_started`, `task_progress`, and `task_notification` messages also have both IDs.

| From the worker | `forwardSubagentText` off, the default | `forwardSubagentText` on |
|---|---|---|
| Its prompt | Yes, as a user message | Yes |
| Its thinking | No | Yes |
| Its text | No | Yes |
| Its tool calls, with their inputs | Yes, a message for each | Yes |
| Its tool results | Yes | Yes |
| Its stream events | No | No |
| Each model call's final tokens | No | No |

That's with `includePartialMessages` on, as `TurnTrace` has it.

- **A worker's messages carry each call's token counts from the call's start,** as the coordinator's messages do (2.2). Examples are 24 and 28 output tokens. The final count comes in the call's `message_delta` stream event, and the SDK sends none of a worker's stream events. The input and cache counts are right, since they're known when a call starts. Only the output count is off.
- **With the flag off, a call that only writes text isn't in the stream at all.** Each worker's last call is one of these.
- **The `Agent` call's result has the worker's last call's tokens, not its total.** Its `tool_use_result` has `usage`, which matched the last call, and `totalTokens`, which is that call's input plus output. The `total_tokens` in `task_progress` and `task_notification` matched neither the last call nor the sum of the calls.

**The turn's result message leaves the workers out of `usage`, and counts them in `modelUsage`.** For the turn with two workers in the span tree below:

| From the result message | Input tokens | Output tokens |
|---|---|---|
| `usage` | 26,932 | 1,051 |
| `modelUsage`, `claude-opus-5-5`: the coordinator | 26,932 | 1,051 |
| `modelUsage`, `claude-sonnet-5-5`: the two workers | 9,701 | 909 |
| `modelUsage`, `claude-haiku-5-5`: the session's title | 1,230 | 724 |

- **`npm run chat` prints `usage`,** so the count it prints leaves the workers out.
- **`total_cost_usd` counts all three models.** On a resumed session, `modelUsage` is the session's total so far, like the cost (2.2).
- **The Haiku call is the SDK naming the session.** It's on a session's first turn, with or without a worker. It used about 1,200 input tokens, and 17 to 724 output tokens, in this spike's runs. The transcript gets an `ai-title` line, such as "Spring road trip planning". Claude Code's telemetry (below) labels the call `generate_session_title`. It isn't in the trace.

#### `getSubagentMessages()`

**`getSubagentMessages()` reads a worker's transcript from our session store in Postgres.** It takes the agent session ID, the worker's ID, and `{ sessionStore }`. The store already keeps each worker's transcript (persistence design, section 6). It returns the worker's prompt, its tool results, and a line for each block of each model call. A block's line has the call's message ID, model, stop reason, and token counts, and when it was written. It has the thinking and the text, with `forwardSubagentText` off.

**It can be read once the turn is over, not when the worker's result arrives.** When each `Agent` call's result reached the coordinator, the worker's transcript in the store had 3 lines: its prompt, its first call, and its tool result. Its last call wasn't there yet. Once the turn was over, each had all 5.

**Its output token counts are usually final, but not always.** A call that asks for tools has a line for each tool call. The SDK writes each line as soon as that tool call is complete, so it can start the tool. That can be before the call's final count arrives. In 1 of 4 turns with two workers, both lines of one call had 28 output tokens. That call asked for two `find_place` calls. By `modelUsage`, it used 175. That turn's worker spans came to 762 output tokens, and `modelUsage` to 909. In the other three turns, the worker spans matched `modelUsage` exactly.

**Claude Code's own telemetry has each call's final count.** With `CLAUDE_CODE_ENABLE_TELEMETRY=1` and an OTLP endpoint for logs, Claude Code sends a `claude_code.api_request` event for each model call. Each event has the model, the final input, cache, and output tokens, the cost, and a request ID. A worker's call has `query_source: agent:custom`, and the coordinator's has `sdk`. The event doesn't say which worker made the call. But each transcript line, and each assistant message in the stream, has the same request ID, so the two can be joined. In one turn with two workers, sent to a small local listener, the events' tokens matched `modelUsage` for each model. Phoenix takes traces, not logs, so using them needs a log receiver in our process, or a collector. The spike didn't build one.

#### Spans for workers

`TurnTrace` on the spike branch now traces workers:

- **It splits the SDK's messages by `parent_tool_use_id`.** The coordinator's messages make its spans as before. Without the split, a worker's tool call would end the coordinator's open model call span, and the worker's tool spans would go under the turn.
- **Each worker gets an AGENT span, under the `Agent` tool span that started it.** It's named for the worker, such as `coffee-finder.turn`. It starts when the coordinator's `Agent` call arrives, and ends when its result does. Its input is the worker's prompt, and its output is the result the coordinator got. It has `agent.name`, and the turn's `session.id`.
- **A worker's tool spans come from the stream,** under the worker's span, as they happen.
- **A worker's model call spans come from its transcript, once the turn is over.** `TurnTrace.end()` is now async. For each worker, it calls `getSubagentMessages()`, puts a call's lines together by message ID, and makes an LLM span for the call, under the worker's span. Each has the call's thinking, text, tool calls, and tokens, as the coordinator's do (2.2). A call's span starts when the line before it was written, its prompt or a tool result, and ends with its last line. OpenTelemetry takes a span's start and end times, so spans can be made after the fact.
- **`forwardSubagentText` stays off,** since the transcript has the thinking and the text.

The turn with two workers, from Phoenix's API. The times are seconds into the minute.

```
38.0–54.5  AGENT  coordinator.turn               "Before we plan anything: can you find me two coffee shops near…"
39.9–43.5  LLM      coordinator.model_call       thinking, text, read_trip_brief, read_itinerary,   12,422 in   525 out
                                                 read_memory, Agent, Agent
42.2       TOOL     mcp__trip__read_trip_brief
42.2       TOOL     mcp__trip__read_itinerary
42.2       TOOL     mcp__memory__read_memory
42.6–47.3  TOOL     Agent                        "Coffee near Ferry Building"
42.6–47.3  AGENT      coffee-finder.turn         "Find two coffee shops near the Ferry Building in San Francisco…"
42.6–44.4  LLM          coffee-finder.model_call find_place, find_place     2,017 in   175 out
43.8       TOOL         mcp__places__find_place
44.4       TOOL         mcp__places__find_place
44.8–47.3  LLM          coffee-finder.model_call text                       2,964 in   306 out
43.5–48.2  TOOL     Agent                        "Coffee near Pike Place"
43.5–48.2  AGENT      coffee-finder.turn         "Find two coffee shops near Pike Place Market in Seattle…"
43.5–45.3  LLM          coffee-finder.model_call find_place, find_place     2,016 in    28 out
44.8       TOOL         mcp__places__find_place
45.3       TOOL         mcp__places__find_place
45.6–48.1  LLM          coffee-finder.model_call text                       2,704 in   253 out
49.7–54.3  LLM      coordinator.model_call       thinking, text                                    14,510 in   526 out
```

- **The two workers ran at the same time,** and neither one's spans are under the other's. Each worker's spans are under its own `Agent` tool span.
- **The coordinator's model call spans hold only its own tokens.** They add up to 26,932 input and 1,051 output tokens, the result message's `usage`.
- **The trace's totals include the workers'.** Phoenix put the trace at 36,633 input and 1,813 output tokens. That's the coordinator's 26,932 plus the workers' 9,701 input, and the coordinator's 1,051 plus the workers' 762 output. The 762 is the low count from the transcript: `modelUsage` says 909.
- **The session's totals include them too.** In an earlier chat, a turn with two workers was followed by a turn with none. Phoenix's session showed 68,391 input and 2,169 output tokens. That's the sum of its two traces, 35,957 and 1,516, then 32,434 and 653. That first turn's worker spans matched `modelUsage` exactly.

#### A worker's thinking

**A worker's thinking shows in its model call spans.** In the turn above, the worker didn't think. In other turns it did, on some calls. To check that its thinking always comes through, the spike made the worker think on every call. A subagent has no thinking option, only `effort`. So the spike set the worker's `effort` to `"max"`. It also gave the worker a choice to make: "Pick the two closest to it, judging from their addresses. Reply with each one's name and address, and one line on why you picked it."

- **Each of the four model calls, two per worker, had a thinking block in its span.** An example, from the Ferry Building worker's last call: "Comparing locations, both Red Bay Coffee and Blue Bottle are right inside the Ferry Building, while Philz is several blocks away..."
- **The thinking is a summary,** as the coordinator's is (2.2). The call with the most thinking used 14,441 output tokens, and its summary is 8,428 characters.
- **The four calls' output tokens added up to `modelUsage` exactly:** 15,807.
- **Max effort is slow.** That one call thought for about 108 seconds, and the turn took 125 seconds. The spike set the worker back to its default effort and its first instructions.

---

## 3. What this means for #53

These are inputs for #53, not decisions:

- **Phoenix works for this app.** It traced the coordinator on the Agent SDK version the app uses, and ran a case as an experiment with both kinds of scorer, on the Max plan. Nothing here needed promptfoo.
- **Spans from our own code worked better than Phoenix's instrumentation** (2.2). The instrumentation needed the `GlobalTracer` fix to make any spans, showed the user's message as `{}`, counted the tokens wrong, and left out the model calls and the thinking. `TurnTrace` shows each turn's message, each model call's thinking, tool calls, and tokens, and each tool call, in order. It needs only `@opentelemetry/api`, the OpenInference names, and the SDK's stream events. `runTurnWithSdk` in `src/agent/coordinator.ts` is where it hooks in.
- **The tokens have to be on LLM spans,** or Phoenix doesn't count them or price them (2.2).
- **Workers can be traced, with spans from our own code (2.7).** The SDK sends no stream events from a worker, and by default none of its text or thinking. Its transcript in our session store has all of them. `TurnTrace` on `main` (#135) needs these changes:
  - Split the SDK's messages by `parent_tool_use_id`. Otherwise a worker's messages end up in the coordinator's spans.
  - Give each worker an AGENT span under the `Agent` tool span that started it, with its tool spans from the stream.
  - Make each worker's model call spans from `getSubagentMessages()`, with the session store, once the turn is over. Before then, the worker's last call isn't in the store yet. So `end()` becomes async, and `runTurnWithSdk` passes the trace its session store.
- **A worker's output tokens can be counted low.** Its transcript sometimes has a call's output count from the call's start, not its final count (2.7). In one turn, the workers' spans had 762 output tokens, and the SDK's `modelUsage` had 909. Claude Code's telemetry has exact counts, joined by request ID, but needs a log receiver. The other choice is to accept the low counts. `modelUsage` on the result message gives each model's exact total, but not each call's.
- **The `Agent` tool runs workers in the background by default** (2.7). Then a turn's workers finish in turns of their own, which the SDK starts in the same `query()` call. `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` keeps them in the coordinator's turn. #60 asks whether a worker may run in the background.
- **The result message's `usage` leaves the workers out** (2.7). Its `modelUsage` counts them, by model. So does Phoenix, from the LLM spans.
- **The SDK's cost estimate is the session's total so far,** on every turn after the first (2.2). So a run's cost is its last turn's, not the sum of its turns. Phoenix also works out a price from the LLM spans' token counts.
- **Installing `@arizeai/phoenix-client` fails without `--legacy-peer-deps`,** and an `overrides` entry in `package.json` fixes it. The client names `@anthropic-ai/sdk` `^0.35.0` as an optional peer. Below 1.0, npm reads that as 0.35.x only, and the app has 0.135.0, so npm refuses to install. The range looks stale: the client's own development uses `^0.111.0`. Only its prompt helpers use the Anthropic SDK, and the spike doesn't use them.

  The flag doesn't change which versions get installed. It only skips the check. But once the client is on `main`, every install would need it, including `npm ci` in CI, the deploy, and the image builds. This entry tells npm to give the client the app's own `@anthropic-ai/sdk`:

  ```json
  "overrides": {
    "@arizeai/phoenix-client": { "@anthropic-ai/sdk": "$@anthropic-ai/sdk" }
  }
  ```

  Tested in a scratch folder with only `@anthropic-ai/sdk` 0.135.0 and `@arizeai/phoenix-client` 7.16.2: without the entry, `npm install` failed with `ERESOLVE could not resolve`. With it, the install worked with no flag, the lock file had `@anthropic-ai/sdk` 0.135.0, and `npm ci --dry-run` showed no errors.
- **A model judge needs its spread measured before its scores mean anything.** One judge call per run flipped on two of five conversations (2.5). Options include a tighter rubric, more than one judge call per run, or keeping the judge for what code can't check and leaning on code scores. `npm run eval:rejudge` shows the spread without rerunning the coordinator.
- **The memory code checks scope well,** and it gave the same answer on every run.
- **Each run leaves a user, a trip, and memory rows in the local database.** That's fine for a local database, since each run uses a new user.
