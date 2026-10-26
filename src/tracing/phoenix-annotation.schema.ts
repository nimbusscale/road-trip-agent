import { z } from "zod";

import type { RatingRequest } from "../shared/rating.schema.js";

// A rating, with the user who made it.
export interface Rating extends RatingRequest {
  userId: string;
}

// The body of Phoenix's POST /v1/span_annotations and /v1/session_annotations, in
// Phoenix 20.26's own field names. Phoenix keeps one annotation for each name and
// identifier, so the user's ID as the identifier makes a new rating replace that user's
// earlier one (systems design section 10).
interface AnnotationData {
  name: "rating";
  annotator_kind: "HUMAN";
  identifier: string;
  result: { label: "up" | "down"; score: number; explanation?: string };
}

export interface AnnotationsBody {
  data: (AnnotationData & ({ span_id: string } | { session_id: string }))[];
}

export function spanAnnotationsBody(
  spanId: string,
  rating: Rating,
): AnnotationsBody {
  return { data: [{ span_id: spanId, ...annotationOf(rating) }] };
}

export function sessionAnnotationsBody(
  agentSessionId: string,
  rating: Rating,
): AnnotationsBody {
  return { data: [{ session_id: agentSessionId, ...annotationOf(rating) }] };
}

function annotationOf({ rating, note, userId }: Rating): AnnotationData {
  return {
    name: "rating",
    annotator_kind: "HUMAN",
    identifier: userId,
    result: {
      label: rating,
      score: rating === "up" ? 1 : 0,
      ...(note === "" ? {} : { explanation: note }),
    },
  };
}

// The query that asks Phoenix for one session's rating by one user.
export function sessionRatingQuery(
  agentSessionId: string,
  userId: string,
): string {
  return new URLSearchParams({
    session_ids: agentSessionId,
    identifier: userId,
    include_annotation_names: "rating",
  }).toString();
}

// Phoenix's reply to GET /v1/projects/<project>/session_annotations, filtered to one
// session's rating by one user, so it holds at most one. Its fields that aren't used
// are left out. A label other than up or down, such as from a rating made in Phoenix's
// own UI under the same name and identifier, counts as no rating.
export const sessionRatingReplySchema = z
  .object({
    data: z.array(
      z.object({
        result: z
          .object({
            label: z.string().nullable(),
            explanation: z.string().nullable(),
          })
          .nullable(),
      }),
    ),
  })
  .transform(({ data }): RatingRequest | null => {
    const result = data[0]?.result;
    if (result?.label !== "up" && result?.label !== "down") {
      return null;
    }
    return { rating: result.label, note: result.explanation ?? "" };
  });
