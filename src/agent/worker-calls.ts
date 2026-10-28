import type { z } from "zod";

import type { ReportResultInput } from "../tools/report-result-input.schema.js";
import { TRIP_SERVER_NAME } from "../tools/trip-server.js";
import {
  REPORT_RESULT_NAME,
  WORKER_SERVER_NAME,
} from "../tools/worker-server.js";
import {
  filledStayIdSchema,
  filledStopIdSchema,
  readIdsSchema,
  reportSchema,
  toolReplyTextSchema,
} from "./worker-hook-input.schema.js";

// What the hooks record from each worker's calls that succeed, under its agent_id, for
// the result code builds (technical spec 6.5). Kept in memory for one turn.

const READ_FACTS = `mcp__${TRIP_SERVER_NAME}__read_worker_brief_facts`;
const REPORT_RESULT = `mcp__${WORKER_SERVER_NAME}__${REPORT_RESULT_NAME}`;

// The tools that fill a stop or stay, each with how to find which one in its input.
// set_stay_weather comes with the weather worker (#64), and takes the stay's ID as stayId,
// as add_lodging_candidates does.
const FILLS: Readonly<Record<string, z.ZodType<string>>> = {
  [`mcp__${TRIP_SERVER_NAME}__add_lodging_candidates`]: filledStayIdSchema,
  [`mcp__${TRIP_SERVER_NAME}__add_stop_candidates`]: filledStopIdSchema,
  [`mcp__${TRIP_SERVER_NAME}__set_stay_weather`]: filledStayIdSchema,
};

// The tools whose calls are recorded, as the model sees their names.
export const RECORDED_TOOLS: readonly string[] = [
  READ_FACTS,
  ...Object.keys(FILLS),
  REPORT_RESULT,
];

// One worker's recorded calls.
export interface WorkerRecord {
  // The stop and stay IDs it read, in the order read, each once.
  readonly readIds: readonly string[];
  // Each fill's reply, as the tool gave it, in the order of the calls.
  readonly replies: readonly string[];
  readonly filledIds: ReadonlySet<string>;
  // The last report_result call's input, or null when it never called it.
  readonly report: ReportResultInput | null;
}

interface MutableRecord {
  readIds: string[];
  replies: string[];
  filledIds: Set<string>;
  report: ReportResultInput | null;
}

export class WorkerCalls {
  readonly #byAgent = new Map<string, MutableRecord>();

  // A tool input or reply that doesn't parse throws, for the hook to report.
  record(
    agentId: string,
    toolName: string,
    toolInput: unknown,
    toolResponse: unknown,
  ): void {
    const record = this.#recordOf(agentId);
    if (toolName === READ_FACTS) {
      const ids = readIdsSchema.parse(toolInput);
      record.readIds.push(...ids.filter((id) => !record.readIds.includes(id)));
      return;
    }
    if (toolName === REPORT_RESULT) {
      // A second call replaces the first (tool design 2.6).
      record.report = reportSchema.parse(toolInput);
      return;
    }
    const filledId = FILLS[toolName];
    if (filledId !== undefined) {
      record.filledIds.add(filledId.parse(toolInput));
      record.replies.push(toolReplyTextSchema.parse(toolResponse));
    }
  }

  of(agentId: string): WorkerRecord {
    return this.#recordOf(agentId);
  }

  hasReported(agentId: string): boolean {
    return this.#recordOf(agentId).report !== null;
  }

  #recordOf(agentId: string): MutableRecord {
    let record = this.#byAgent.get(agentId);
    if (record === undefined) {
      record = { readIds: [], replies: [], filledIds: new Set(), report: null };
      this.#byAgent.set(agentId, record);
    }
    return record;
  }
}
