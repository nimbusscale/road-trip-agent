import { ID_PREFIXES } from "../ids/new-id.js";
import { type Positions, stayName, stopName } from "../tools/spot-names.js";
import { stopsOf } from "../tools/trip-items.js";
import type { WorkerRecord } from "./worker-calls.js";
import { WORKER_TYPE, type WorkerType } from "./worker-types.js";

// The result the coordinator sees in place of a worker's last message, built from the
// worker's recorded calls (technical spec 6.5). No free text from the worker is in it.

export const STOPPED_WITHOUT_REPORT =
  "The worker stopped without reporting its problems and questions.";

// Each part is a block of lines, with a blank line between blocks: each fill's reply,
// then what got nothing, then the problems and questions. `positions` reads the trip,
// to name what got nothing.
export async function workerResultText(
  record: WorkerRecord,
  agentType: WorkerType,
  positions: () => Promise<Positions>,
): Promise<string> {
  const unfilled = record.readIds.filter((id) => !record.filledIds.has(id));
  const blocks = [
    ...record.replies,
    ...(unfilled.length === 0
      ? []
      : [unfilledBlock(await positions(), unfilled, agentType)]),
    reportBlock(record),
  ];
  return blocks.join("\n\n");
}

// The stops and stays the worker read, but added no candidates to, or saved no weather
// for. The stop or stay is named as the tools name it, or by its ID alone if it's gone.
function unfilledBlock(
  positions: Positions,
  ids: readonly string[],
  agentType: WorkerType,
): string {
  const isWeather = agentType === WORKER_TYPE.weatherWorker;
  const nameOf = (id: string): string => {
    if (id.startsWith(ID_PREFIXES.stop)) {
      const stop = stopsOf(positions.itinerary).find((each) => each.id === id);
      return stop === undefined ? id : stopName(positions, stop);
    }
    const stay = positions.itinerary.stays.find((each) => each.id === id);
    if (stay === undefined) {
      return id;
    }
    const name = stayName(positions, stay);
    return isWeather ? name : `Lodging for ${name}`;
  };
  return [
    isWeather ? "No weather saved for:" : "No candidates added for:",
    ...ids.map((id) => `- ${nameOf(id)}`),
  ].join("\n");
}

function reportBlock(record: WorkerRecord): string {
  const report = record.report;
  if (report === null) {
    return STOPPED_WITHOUT_REPORT;
  }
  return [
    ...listLines("Problems:", report.problems),
    ...listLines("Questions for the user:", report.questionsForUser),
  ].join("\n");
}

// One line per item, or "none". An item that's only spaces doesn't count.
function listLines(label: string, items: readonly string[]): string[] {
  const kept = items.map((item) => item.trim()).filter((item) => item !== "");
  return kept.length === 0
    ? [`${label} none`]
    : [label, ...kept.map((item) => `- ${item}`)];
}
