import { z } from "zod";

// One span from Phoenix's GET /v1/projects/<project>/spans, in Phoenix 20.26's field
// names. Only the fields the evaluator reads are kept (systems design section 10).
// The input and output are missing on a span that had none.
export const phoenixSpanSchema = z
  .object({
    name: z.string(),
    context: z.object({ trace_id: z.string(), span_id: z.string() }),
    parent_id: z.string().nullable(),
    span_kind: z.string(),
    start_time: z.string(),
    status_code: z.string(),
    attributes: z.object({
      "session.id": z.string().optional(),
      "input.value": z.string().optional(),
      "output.value": z.string().optional(),
    }),
  })
  .transform((span) => ({
    name: span.name,
    traceId: span.context.trace_id,
    spanId: span.context.span_id,
    parentId: span.parent_id,
    kind: span.span_kind,
    startTime: span.start_time,
    failed: span.status_code === "ERROR",
    sessionId: span.attributes["session.id"] ?? null,
    input: span.attributes["input.value"] ?? "",
    output: span.attributes["output.value"] ?? "",
  }));

export type PhoenixSpan = z.infer<typeof phoenixSpanSchema>;

export const phoenixSpanListSchema = z.array(phoenixSpanSchema);

// One session annotation from GET /v1/projects/<project>/session_annotations, with only
// the fields the evaluator reads.
export const sessionAnnotationSchema = z
  .object({ session_id: z.string(), name: z.string() })
  .transform((annotation) => ({
    sessionId: annotation.session_id,
    name: annotation.name,
  }));

// The worker's type, from an Agent call's input. It names the worker in the judge
// input. The rest of the input is the coordinator's own writing, so it's left out
// (#282).
export const agentInputSchema = z
  .object({ subagent_type: z.string() })
  .transform((input) => input.subagent_type);

export type SessionAnnotation = z.infer<typeof sessionAnnotationSchema>;

export const sessionAnnotationPageSchema = z
  .object({
    data: z.array(sessionAnnotationSchema),
    next_cursor: z.string().nullable(),
  })
  .transform((page) => ({
    annotations: page.data,
    nextCursor: page.next_cursor,
  }));

// Which session annotations to ask for: by identifier, or by session.
export interface SessionAnnotationFilter {
  identifier?: string;
  sessionIds?: string[];
  name: string;
}

// The options for the Phoenix client's GET of a project's session annotations, in
// Phoenix's own field names.
export function sessionAnnotationsRequest(
  project: string,
  filter: SessionAnnotationFilter,
  cursor: string | null,
) {
  return {
    params: {
      path: { project_identifier: project },
      query: {
        ...(filter.identifier === undefined
          ? {}
          : { identifier: [filter.identifier] }),
        ...(filter.sessionIds === undefined
          ? {}
          : { session_ids: filter.sessionIds }),
        include_annotation_names: [filter.name],
        limit: 1000,
        cursor,
      },
    },
  };
}
