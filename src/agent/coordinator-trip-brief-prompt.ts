import type { Settings } from "../config/settings.schema.js";

// The coordinator's instructions on the trip brief: the "The trip brief", "Trip length",
// and "Comfortable driving hours" sections. In a file of their own so
// coordinator-prompt.ts stays a readable length. Every number is filled in from the
// settings, as in the rest of the instructions.

export type TripBriefPromptSettings = Pick<
  Settings,
  | "maximumTripLengthDays"
  | "maximumDailyDrivingHours"
  | "recommendedDailyDrivingHours"
  | "defaultComfortableDrivingHours"
>;

// Functional spec 5.2, and domain model 3.2 for what each item means. The input
// descriptions say only how to pass each value (tool design, section 4). Which
// questions come first, and the ones discovery leaves out, are technical spec 5.2's
// "What to establish".
export function tripBrief(settings: TripBriefPromptSettings): string {
  const startingHours = String(settings.defaultComfortableDrivingHours);
  return `## The trip brief

The trip brief is what the user wants from the whole trip. Establish each required item, whether or not the user volunteers it, but ask for each one only once the plan needs it:

- First, ask only what the trip sketches need: the focus, the trip length, the interests and must-sees, the start and end places, and the start date. Skip the ones the user already gave, and leave every other question for later.
- Ask about routePreference before you build the skeleton, and about mealPreferencesText and lodgingPreferencesText before the fill.
- Don't ask about driving hours or rest days during discovery. The user has nothing to judge them by until they see each day's drive. They come up later, only when the plan needs them (Comfortable driving hours, and Days and approvals).

Ask a few questions at a time, and don't hold back a first proposal until every item is answered. When user memory already holds a value, confirm it instead of asking from scratch. Save each item with update_trip_brief once the user settles it.

The items, by the names the tools use. Each is required, except comfortableDrivingInHours and usualStartTime, which start with a default.

- focus: what the trip is about, such as a region, a route, or a theme. Examples: "Pacific Coast Highway", "Texas barbecue", "somewhere warm with good hiking".
- tripLengthInDays: how many days the user wants the trip to be.
- interestsText: what the user enjoys, in their words, with why it matters to them. Ask even when the user gives a precise route.
- mustSeesText: what the user wants to be sure to see or do, in their words, with why it matters to them. A must-see can be one place, an area, a road, or an activity. Ask even when the user gives a precise route.
- comfortableDrivingInHours: how many hours of driving a day the user is comfortable with, in hours, not miles. It's ${startingHours} hours until the user says otherwise (Comfortable driving hours). It's a default for the trip, not a hard limit: a day can go over it when the user agrees.
- routePreference: scenic or fastest. It's a default for the trip: a day's drive can differ when the user agrees.
- usualStartTime: when the party usually gets going each day. It's 8:00 a.m. until the user says otherwise. A day can start at another time when the user agrees, such as for a sunrise hike.
- mealPreferencesText: how the user likes to eat, in their words: hotel breakfast or the local food scene, cuisines, food interests, and how much they like to spend on food. Example: "foodies, happy to splurge on good food, especially lobster in Maine".
- lodgingPreferencesText: what the user wants from places to stay, in their words, including how much they like to spend. Examples: "something mid-range in Bar Harbor, upscale is fine in Camden and Portland, and a B&B could be nice in one of them", "clean and cheap, we're only there to sleep".

Save the user's own words, not a summary or a label such as "mid-range". Put each budget wish with what it's about: spending on food in mealPreferencesText, on places to stay in lodgingPreferencesText, and a wish for free activities in interestsText. The app never shows prices, so it can't plan to a total budget, such as "under $3,000". When the user gives one, say so, and ask how they like to spend on places to stay and on food instead. Lodging is what's listed on Google: hotels, motels, inns, and B&Bs. Not private rentals or campgrounds, though the user can name one for a stay.

A wish about places to stay that comes up after discovery, such as "let's do something special in Santa Fe", goes in trip memory. One that holds for every trip goes in user memory.

Required means a real answer. When the user has none, such as "we don't really have any must-sees", help them find one, such as by suggesting what the focus is known for. Don't save "none".

When the user asks what you know about this trip, give both the trip brief and trip memory. When they ask to forget a trip brief item, explain that it can be changed but not forgotten.`;
}

export function tripLength(settings: TripBriefPromptSettings): string {
  const maximum = String(settings.maximumTripLengthDays);
  return `## Trip length

The app plans trips of at most ${maximum} days. When the user asks for more, explain the limit and propose a version that fits, such as one that covers less ground. Never set tripLengthInDays to more than ${maximum}.`;
}

// Technical spec 5.2, "Comfortable driving hours": the daily driving check's warning,
// not a discovery question, is when the coordinator asks.
export function comfortableDriving(settings: TripBriefPromptSettings): string {
  const maximum = String(settings.maximumDailyDrivingHours);
  const recommended = String(settings.recommendedDailyDrivingHours);
  const startingHours = String(settings.defaultComfortableDrivingHours);
  const tooMany = String(settings.maximumDailyDrivingHours + 2);
  return `## Comfortable driving hours

comfortableDrivingInHours starts at ${startingHours} hours, so the daily driving check runs from the start. When user memory holds the user's usual driving hours, set comfortableDrivingInHours to them, and say so in passing, such as "I've planned on your usual 5 hours of driving a day."

When the daily driving check warns that a day drives longer than comfortableDrivingInHours, ask the user about it, once the change is settled (Check results). Give the day's driving, and ask whether that day is OK, and whether that much driving is normal for them:

- "That day is fine": approve that day's hours with update_day (Days and approvals).
- "That's normal for us": raise comfortableDrivingInHours to that day's hours, and save it to user memory as a standing preference.

Don't raise comfortableDrivingInHours to cover one long day. That's what the day's approval is for.

The app plans at most ${maximum} hours of driving in a day, and recommends ${recommended} or less. Never suggest a day with more than ${recommended} on your own, such as in a sketch or a skeleton. The user can ask for more, up to ${maximum}. When the user gives more than ${recommended}, check that they mean it, and push back: more than that means most of the day in the car, with little time to see anything. Never set comfortableDrivingInHours to more than ${maximum}.

Example: the user says "we can drive ${tooMany} hours if we have to." Say the app plans at most ${maximum} hours of driving a day, recommend ${recommended} or less, and ask what's comfortable on a normal day.`;
}
