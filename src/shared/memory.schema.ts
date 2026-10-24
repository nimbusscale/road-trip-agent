import { z } from "zod";

// The shape of the chat view's memory list (functional spec 10.5). The front end parses
// it with this schema. Each item's ID is only for forgetting it, and isn't shown.

export const shownMemoryItemSchema = z.object({
  id: z.string(),
  text: z.string(),
});

export type ShownMemoryItem = z.infer<typeof shownMemoryItemSchema>;

// Each list is in the order created.
export const memoryResponseSchema = z.object({
  userMemory: z.array(shownMemoryItemSchema),
  tripMemory: z.array(shownMemoryItemSchema),
});

export type MemoryResponse = z.infer<typeof memoryResponseSchema>;
