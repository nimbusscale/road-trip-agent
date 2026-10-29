import type { WeatherLabel } from "../domain/weather-label.js";
import type { ChangeContext } from "../persistence/trip-writer.js";
import { workerWriteReply } from "./candidate-tools.js";
import { stayName } from "./spot-names.js";
import { strictTool, type StrictToolDefinition } from "./strict-tool.js";
import { stayIn } from "./trip-items.js";
import type { TripSession } from "./trip-session.js";
import {
  SET_STAY_WEATHER_INPUT,
  type SetStayWeatherInput,
} from "./worker-input.schema.js";

// The tool the weather worker saves a stay's weather and clothing text with (tool design
// 2.1). The weather worker's result is built from these replies, one line per stay
// (technical spec 6.5).

export const SET_STAY_WEATHER_DESCRIPTION =
  "Saves a stay's weather and clothing text, in place of any it had. The tool labels it a forecast or seasonal averages itself, from the stay's dates, the same way look_up_stay_weather picks which to give. It records the stay's town, dates, and activities with the text, so the app can tell when the text no longer fits.";

export function setStayWeatherTool(session: TripSession): StrictToolDefinition {
  return strictTool(
    "set_stay_weather",
    SET_STAY_WEATHER_DESCRIPTION,
    SET_STAY_WEATHER_INPUT,
    (input) =>
      workerWriteReply(session, (context) => setStayWeather(input, context)),
  );
}

// Such as "Saved the weather and clothing text for Stay 2, Torrey (stay_…), from seasonal
// averages."
function setStayWeather(
  input: SetStayWeatherInput,
  context: ChangeContext,
): string[] {
  const itinerary = context.trip.itinerary;
  const stay = stayIn(itinerary, input.stayId);
  const text = context.services.stays.setWeatherText(
    itinerary,
    stay,
    input.guidance,
  );
  const positions = { itinerary, calendar: context.calendar };
  return [
    `Saved the weather and clothing text for ${stayName(positions, stay)}, from ${LABEL_TEXT[text.label]}.`,
  ];
}

const LABEL_TEXT: Record<WeatherLabel, string> = {
  forecast: "a forecast",
  seasonalAverages: "seasonal averages",
};
