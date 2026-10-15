import { RuleError } from "./rule-error.js";

// A time of day, with no date (domain model section 1, the `time` type), such as a
// trip brief's usualStartTime. For now it's text, "HH:MM" on a 24-hour clock, such as
// "08:00" or "13:00". Code outside this file makes one only with timeOfDayFrom(), and
// stores one only with textOf(), so it can become a type of its own here.
export type TimeOfDay = string;

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const EIGHT_A_M: TimeOfDay = "08:00";

// `what` names the property for the agent, such as "The trip brief's usualStartTime".
export function timeOfDayFrom(text: string, what: string): TimeOfDay {
  if (!HH_MM.test(text)) {
    throw new RuleError(
      `${what} has to be a time of day as HH:MM on a 24-hour clock, such as 08:00 or 13:00. It was given "${text}".`,
    );
  }
  return text;
}

export function textOf(time: TimeOfDay): string {
  return time;
}
