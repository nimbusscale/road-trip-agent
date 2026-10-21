import { z } from "zod";

// The look_up_stay_weather tool's input (tool design, section 2.5). Each input says only
// how to pass its value. Which place to give is in the weather worker's instructions
// (tool design, section 4).
export const LOOK_UP_STAY_WEATHER_INPUT = z.strictObject({
  stayId: z.string().describe("A stay ID, such as stay_k7m2x9qa."),
  placeId: z.string().describe("A place ID, such as place_k7m2x9qa."),
});
