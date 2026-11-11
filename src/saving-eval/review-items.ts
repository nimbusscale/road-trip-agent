import type { Pool } from "pg";

import { loadSettings, SETTINGS_PATH } from "../config/settings.js";
import type { CorpusSession } from "../grounded-eval/corpus-turn.js";
import { RecordedSessionRepository } from "../turn-run/turn-run-repositories.js";
import type { ReviewItem } from "./review-page.js";
import type { SaveTurn } from "./save-turns.js";
import { turnBeforeOf } from "./turn-before.js";

// Each turn with its recorded session and what the trip held when it started, from the
// turn's trip version in the live database (#209).
export async function reviewItemsOf(
  turns: readonly SaveTurn[],
  sessions: ReadonlyMap<string, CorpusSession>,
  livePool: Pool,
): Promise<ReviewItem[]> {
  const live = new RecordedSessionRepository(livePool);
  const settings = loadSettings(SETTINGS_PATH);
  const items: ReviewItem[] = [];
  for (const turn of turns) {
    const session = sessions.get(turn.sessionId);
    const index =
      session?.turns.findIndex((recorded) => recorded.spanId === turn.spanId) ??
      -1;
    const recorded = session?.turns[index];
    if (session === undefined || recorded === undefined) {
      throw new Error(`Turn ${turn.spanId} isn't in the corpus.`);
    }
    const before = await turnBeforeOf(live, settings, {
      agentSessionId: turn.sessionId,
      spanPosition: index + 1,
      message: recorded.userMessage,
    });
    items.push({ turn, session, before });
  }
  return items;
}
