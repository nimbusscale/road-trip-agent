import { z } from "zod";

// The memory tools' inputs (tool design, section 2.2). Each input says only how to pass
// its value. What user and trip memory are for is in the coordinator's instructions
// (tool design, section 4).

export const MEMORIES = ["user", "trip"] as const;

export type Memory = (typeof MEMORIES)[number];

const ITEM_ID = z.string().describe("A memory item ID, such as mem_k7m2x9qa.");

// The maximum length is a setting, so it's in the description, not in the schema. The
// writer refuses longer text with an error the agent can read, which a schema failure
// isn't (persistence design, section 8.8).
function itemText(maximumCharacters: number): z.ZodString {
  return z
    .string()
    .describe(`Plain text, at most ${String(maximumCharacters)} characters.`);
}

export const READ_MEMORY_INPUT = z.strictObject({});

export function addMemoryItemInput(maximumCharacters: number) {
  return z.strictObject({
    memory: z.enum(MEMORIES),
    text: itemText(maximumCharacters),
  });
}

export function updateMemoryItemInput(maximumCharacters: number) {
  return z.strictObject({
    itemId: ITEM_ID,
    text: itemText(maximumCharacters),
  });
}

export const FORGET_MEMORY_ITEM_INPUT = z.strictObject({ itemId: ITEM_ID });
