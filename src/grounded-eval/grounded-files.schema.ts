import { z } from "zod";

// The evaluator's sample file, evals/grounded/sample.json (#282). It's written once,
// and read back by each later step, so a change to the corpus can't change which turns
// were labeled.
export const sampleFileSchema = z.object({
  seed: z.string(),
  corpusSessions: z.number(),
  corpusTurns: z.number(),
  turns: z.array(
    z.object({
      set: z.number(),
      sessionId: z.string(),
      spanId: z.string(),
    }),
  ),
});

export type SampleFile = z.infer<typeof sampleFileSchema>;

// The Phoenix address, through the SSH tunnel (DEVELOPMENT.md section 2), from
// PHOENIX_URL.
export function phoenixUrlOf(
  source: Readonly<Record<string, string | undefined>>,
): string {
  return z
    .url({ error: "PHOENIX_URL must be an address" })
    .parse(source.PHOENIX_URL);
}
