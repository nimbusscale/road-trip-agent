import { z } from "zod";

// An exact model ID, never a short name such as "opus", which moves to newer models on
// its own.
const modelId = z.string().regex(/^claude-/, {
  error: "must be an exact model ID, such as claude-opus-5-5",
});

// A named effort level, as the Agent SDK takes it. A number, which an agent definition
// also takes, isn't allowed, since the query's options take only the names.
const effortLevel = z.enum(["low", "medium", "high", "xhigh", "max"]);

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
    defaultComfortableDrivingHours: z.number().positive(),
    mealVisitMinutes: z.int().positive(),
    checkInVisitMinutes: z.int().positive(),
    maximumMemoryItems: z.int().positive(),
    maximumMemoryItemCharacters: z.int().positive(),
    coordinatorModel: modelId,
    coordinatorEffort: effortLevel,
    stayResearcherModel: modelId,
    stayResearcherEffort: effortLevel,
    legScoutModel: modelId,
    legScoutEffort: effortLevel,
    weatherWorkerModel: modelId,
    weatherWorkerEffort: effortLevel,
  })
  .refine(
    (settings) =>
      settings.recommendedDailyDrivingHours <=
      settings.maximumDailyDrivingHours,
    {
      error: "can't be more than maximumDailyDrivingHours",
      path: ["recommendedDailyDrivingHours"],
    },
  )
  // A new trip's brief starts with it, so it has to fit the brief's own limit.
  .refine(
    (settings) =>
      settings.defaultComfortableDrivingHours <=
      settings.maximumDailyDrivingHours,
    {
      error: "can't be more than maximumDailyDrivingHours",
      path: ["defaultComfortableDrivingHours"],
    },
  );

export type Settings = z.infer<typeof settingsSchema>;
