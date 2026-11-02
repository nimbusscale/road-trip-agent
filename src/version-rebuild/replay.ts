import type { StrictToolDefinition } from "../tools/strict-tool.js";
import type { ToolReply } from "../tools/tool-reply.js";
import { callKindOf } from "./call-kinds.js";
import { lineDifferences } from "./differences.js";
import type { RebuildChoices } from "./rebuild-input.schema.js";
import type { RebuildReport } from "./rebuild-report.js";
import type {
  LocalRebuildRepository,
  MemoryRow,
  PlaceRow,
} from "./rebuild-repositories.js";
import type { RecordedCall } from "./recorded-calls.js";
import { idsIn, type SeenIds, withIds } from "./recorded-ids.js";

// The rebuild's clock. Each call runs at the time it was made, so today's date, and
// the time a write saves, are as they were.
export interface ReplayClock {
  at: Date;
}

export interface Replay {
  readonly tripId: string;
  // The trip's owner, whose memory the coordinator reads.
  readonly ownerId: string;
  // Each tool, by its name as the model sees it, such as mcp__trip__read_itinerary.
  readonly tools: ReadonlyMap<string, StrictToolDefinition>;
  readonly clock: ReplayClock;
  readonly seen: SeenIds;
  readonly local: LocalRebuildRepository;
  readonly livePlaces: ReadonlyMap<string, PlaceRow>;
  readonly liveMemory: ReadonlyMap<string, MemoryRow>;
  readonly choices: RebuildChoices;
  // Each check that hasn't run yet on the recorded trip, with the call it starts at.
  readonly checksNotRun: Map<string, string>;
  readonly report: RebuildReport;
}

// Runs one recorded call against the rebuilt trip, or does what stands in for it
// (call-kinds.ts). A call refused when it was made changed nothing, so it's left out.
export async function replayCall(
  turn: number,
  call: RecordedCall,
  replay: Replay,
): Promise<void> {
  replay.clock.at = call.usedAt;
  const newIds = replay.seen.newIn(call.input, call.replyText);
  const kind = callKindOf(call.name);
  if (call.isError || kind === "skip") {
    replay.report.count(call.isError ? "refused when made" : "skipped");
    return;
  }
  replay.report.count(kind);
  switch (kind) {
    case "placeSave":
      await copyPlaces(turn, call, replay, [
        ...idsIn(call.replyText),
        ...(replay.choices.unshownPlaces[call.toolUseId] ?? []),
      ]);
      return;
    case "checkpoint":
      await checkRead(turn, call, replay);
      return;
    case "replay":
      await replayChange(turn, call, replay, newIds);
      await dropChecksNotRun(call, replay);
      return;
  }
}

// The recorded trip held no results for a check that didn't run yet, so the rebuilt
// one doesn't either (rebuild-input.schema.ts).
async function dropChecksNotRun(
  call: RecordedCall,
  replay: Replay,
): Promise<void> {
  for (const [check, untilToolUseId] of replay.checksNotRun) {
    if (untilToolUseId === call.toolUseId) {
      replay.checksNotRun.delete(check);
    } else {
      await replay.local.dropCheckResults(replay.tripId, check);
    }
  }
}

// Copies the live rows of the places a search saved. Each is copied once, by the first
// call that names it.
async function copyPlaces(
  turn: number,
  call: RecordedCall,
  replay: Replay,
  ids: readonly string[],
): Promise<void> {
  for (const id of ids.filter((each) => each.startsWith("place_"))) {
    if (await replay.local.hasPlace(replay.tripId, id)) {
      continue;
    }
    const row = replay.livePlaces.get(id);
    if (row === undefined) {
      replay.report.add("ids", turn, call, [`${id} isn't in the live trip.`]);
      continue;
    }
    await replay.local.addRow("places", row.whole);
  }
}

async function checkRead(
  turn: number,
  call: RecordedCall,
  replay: Replay,
): Promise<void> {
  const today = await runTool(turn, call, replay, call.input);
  if (today === null) {
    return;
  }
  const differences = lineDifferences(call.replyText, textOf(today));
  if (differences.length > 0) {
    replay.report.add("checkpoints", turn, call, differences);
  }
}

async function replayChange(
  turn: number,
  call: RecordedCall,
  replay: Replay,
  newIds: readonly string[],
): Promise<void> {
  const input = inputFor(turn, call, replay);
  // A place the call names that no earlier reply did. Copied so the call can run.
  await copyPlaces(turn, call, replay, idsIn(JSON.stringify(input)));
  // A write never makes a place. Its places come from the live rows.
  const madeIds = newIds.filter((id) => !id.startsWith("place_"));
  const {
    result: today,
    unused,
    random,
  } = await withIds(madeIds, () => runTool(turn, call, replay, input));
  if (unused.length > 0 || random.length > 0) {
    replay.report.add("ids", turn, call, [
      `Recorded IDs today's code didn't make: ${unused.join(", ") || "none"}`,
      `Kinds today's code made at random: ${random.join(", ") || "none"}`,
    ]);
  }
  if (today === null) {
    return;
  }
  const differences = lineDifferences(call.replyText, textOf(today));
  if (differences.length > 0) {
    replay.report.add("writeReplies", turn, call, differences);
  }
  await keepMemoryTimes(newIds, call, replay);
}

function inputFor(turn: number, call: RecordedCall, replay: Replay): unknown {
  const rewrite = replay.choices.rewrittenCalls[call.toolUseId];
  if (rewrite === undefined) {
    return call.input;
  }
  replay.report.add("rewrites", turn, call, [rewrite.shapeChange]);
  return rewrite.input;
}

// Runs today's tool. Null when it refused the call, or failed, which the report lists.
async function runTool(
  turn: number,
  call: RecordedCall,
  replay: Replay,
  input: unknown,
): Promise<ToolReply | null> {
  const tool = replay.tools.get(call.name);
  if (tool === undefined) {
    replay.report.add("refused", turn, call, [
      "Today's code has no such tool.",
    ]);
    return null;
  }
  const parsed = tool.inputSchema.safeParse(input);
  if (!parsed.success) {
    replay.report.add("refused", turn, call, [
      "Today's tool doesn't take its input:",
      ...parsed.error.issues.map(
        (issue) => `${issue.path.join(".")}: ${issue.message}`,
      ),
    ]);
    return null;
  }
  try {
    const reply = await tool.handler(parsed.data);
    if (reply.isError === true) {
      replay.report.add("refused", turn, call, [textOf(reply)]);
      return null;
    }
    return reply;
  } catch (error) {
    replay.report.add("refused", turn, call, [`Threw: ${String(error)}`]);
    return null;
  }
}

// Today's code saves a memory item with the time it runs. The live row's time keeps
// the items in the order the coordinator read them. A forgotten item has no live row,
// so it gets the time its call was answered.
async function keepMemoryTimes(
  newIds: readonly string[],
  call: RecordedCall,
  replay: Replay,
): Promise<void> {
  for (const id of newIds.filter((each) => each.startsWith("mem_"))) {
    const at = replay.liveMemory.get(id)?.createdDateTime ?? call.answeredAt;
    await replay.local.setMemoryCreated(replay.ownerId, id, at);
  }
}

function textOf(reply: ToolReply): string {
  return reply.content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n");
}
