import { z } from "zod";

// The settings in technical spec section 10. Each name of a measure ends in its unit.
export const settingsSchema = z
  .strictObject({
    lateAllowanceMinutes: z.int().nonnegative(),
    stopOrderMinimumSavingMinutes: z.int().nonnegative(),
    driveBufferPercent: z.number().nonnegative(),
    alongLegEndDistanceMiles: z.number().nonnegative(),
    // search_near sends it as the radius of Google's locationBias circle, which can be
    // at most 50,000 meters. 31 miles is 49,890 meters, and 32 would be over (Google
    // design 2.1).
    nearDistanceMiles: z.number().positive().max(31),
    maximumTripLengthDays: z.int().positive(),
    maximumDailyDrivingHours: z.number().positive().max(24),
    recommendedDailyDrivingHours: z.number().positive(),
    mealVisitMinutes: z.int().positive(),
    checkInVisitMinutes: z.int().positive(),
    maximumMemoryItems: z.int().positive(),
    maximumMemoryItemCharacters: z.int().positive(),
    // An exact model ID, never a short name such as "opus", which moves to newer models
    // on its own.
    coordinatorModel: z.string().regex(/^claude-/, {
      error: "must be an exact model ID, such as claude-opus-5-5",
    }),
  })
  .refine(
    (settings) =>
      settings.recommendedDailyDrivingHours <=
      settings.maximumDailyDrivingHours,
    {
      error: "can't be more than maximumDailyDrivingHours",
      path: ["recommendedDailyDrivingHours"],
    },
  );

export type Settings = z.infer<typeof settingsSchema>;
