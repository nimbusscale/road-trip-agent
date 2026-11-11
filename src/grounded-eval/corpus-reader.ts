import { createClient } from "@arizeai/phoenix-client";
import { getSpans, type GetSpansParams } from "@arizeai/phoenix-client/spans";

import {
  type CorpusSession,
  corpusSessionOf,
  type CorpusTurn,
} from "./corpus-turn.js";
import {
  type PhoenixSpan,
  phoenixSpanListSchema,
  type SessionAnnotation,
  type SessionAnnotationFilter,
  sessionAnnotationPageSchema,
  sessionAnnotationsRequest,
} from "./phoenix-span.schema.js";

// The corpus is the live site's sessions, so it's always this project, even from a
// machine whose own traces go to road-trip-agent-local (systems design section 10).
export const CORPUS_PROJECT = "road-trip-agent";

type PhoenixClient = ReturnType<typeof createClient>;

// Phoenix's largest page of spans, and a batch of traces small enough for the query
// string.
const PAGE_SIZE = 1000;
const TRACES_PER_REQUEST = 20;

// The corpus (#282): the sessions with a session annotation named corpus, with
// identifier corpus, minus any with a not_for_evaluation annotation. Sorted by
// session ID, so a seeded pick over them is repeatable.
export async function readCorpus(phoenixUrl: string): Promise<CorpusSession[]> {
  const client = createClient({ options: { baseUrl: phoenixUrl } });
  const corpusIds = await corpusSessionIds(client);
  const leftOut = await sessionsNamed(client, corpusIds, "not_for_evaluation");
  const sessionIds = corpusIds.filter((id) => !leftOut.has(id)).sort();
  const sessions: CorpusSession[] = [];
  for (const sessionId of sessionIds) {
    sessions.push(
      corpusSessionOf(sessionId, await sessionSpans(client, sessionId)),
    );
  }
  return sessions;
}

async function corpusSessionIds(client: PhoenixClient): Promise<string[]> {
  const annotations = await sessionAnnotations(client, {
    identifier: "corpus",
    name: "corpus",
  });
  return [...new Set(annotations.map((annotation) => annotation.sessionId))];
}

async function sessionsNamed(
  client: PhoenixClient,
  sessionIds: string[],
  name: string,
): Promise<Set<string>> {
  const annotations = await sessionAnnotations(client, { sessionIds, name });
  return new Set(annotations.map((annotation) => annotation.sessionId));
}

async function sessionAnnotations(
  client: PhoenixClient,
  filter: SessionAnnotationFilter,
): Promise<SessionAnnotation[]> {
  const found: SessionAnnotation[] = [];
  let cursor: string | null = null;
  do {
    const { data, error } = await client.GET(
      "/v1/projects/{project_identifier}/session_annotations",
      sessionAnnotationsRequest(CORPUS_PROJECT, filter, cursor),
    );
    if (error !== undefined) {
      throw new Error(
        `Phoenix refused the annotation query: ${JSON.stringify(error)}`,
      );
    }
    const page = sessionAnnotationPageSchema.parse(data);
    found.push(...page.annotations);
    cursor = page.nextCursor;
  } while (cursor !== null);
  return found;
}

// The session's coordinator.turn spans, and every span in their traces.
async function sessionSpans(
  client: PhoenixClient,
  sessionId: string,
): Promise<PhoenixSpan[]> {
  const turns = await allSpans({
    client,
    project: { projectName: CORPUS_PROJECT },
    name: "coordinator.turn",
    attributes: { "session.id": sessionId },
  });
  const traceIds = turns.map((turn) => turn.traceId);
  const spans: PhoenixSpan[] = [];
  for (let start = 0; start < traceIds.length; start += TRACES_PER_REQUEST) {
    spans.push(
      ...(await allSpans({
        client,
        project: { projectName: CORPUS_PROJECT },
        traceIds: traceIds.slice(start, start + TRACES_PER_REQUEST),
      })),
    );
  }
  return spans;
}

// One coordinator.turn span in a project, with the spans in its trace, built as a
// corpus turn is. Null when Phoenix doesn't have the turn's span yet, such as just
// after it was sent: Phoenix saves spans a moment after they arrive.
export async function traceTurnOf(
  phoenixUrl: string,
  projectName: string,
  spanId: string,
): Promise<CorpusTurn | null> {
  const client = createClient({ options: { baseUrl: phoenixUrl } });
  const project = { projectName };
  const [turn] = await allSpans({ client, project, spanIds: [spanId] });
  if (turn === undefined) {
    return null;
  }
  const spans = await allSpans({ client, project, traceIds: [turn.traceId] });
  const session = corpusSessionOf(turn.sessionId ?? "", spans);
  return session.turns.find((t) => t.spanId === spanId) ?? null;
}

async function allSpans(params: GetSpansParams): Promise<PhoenixSpan[]> {
  const spans: PhoenixSpan[] = [];
  let cursor: string | null = null;
  do {
    const page = await getSpans({ ...params, limit: PAGE_SIZE, cursor });
    spans.push(...phoenixSpanListSchema.parse(page.spans));
    cursor = page.nextCursor;
  } while (cursor !== null);
  return spans;
}
