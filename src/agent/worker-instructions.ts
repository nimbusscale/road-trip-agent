// Instruction text that more than one agent's prompt includes, written once (tool design,
// section 4). The leg scout (#61) and the weather worker (#64) include these word for word.

// The worker brief's headings, in order (technical spec 5.3). The coordinator writes a
// worker brief under them, and each worker's instructions say what each one holds, so
// every worker brief reads the same way in a trace.
export const WORKER_BRIEF_HEADING = {
  fill: "Fill:",
  when: "When:",
  lodging: "Lodging preferences:",
  meals: "Meal preferences:",
  interests: "Interests and must-sees:",
  avoid: "Avoid:",
  request: "Request:",
} as const;

// What each candidate field means. The candidate tools' input descriptions give only the
// format (tool design, section 4). Settled on 2026-10-28, in #60. The tiers are
// functional spec 7.1's, with the names the tools take.
export const CANDIDATE_FIELDS = `## What each candidate field means

- howFound and sourceLink go together. "google" goes with the place's Google Maps link, the first link on its "Links:" line in the search result. "webSearch" goes with the web page's link, when a web page led you to the place and you then looked it up with find_place. When a place turned up both ways, give the web page, since it tells the user more than a map pin.
- rationale: one or two sentences on why this place fits this stop or stay, tied to the user's words in the worker brief, such as "Walkable to the barbecue spots." Don't repeat what the option card already shows the user: the rating, the price level, or the tier. Never name the trip's dates or nights.
- notes: practical things to know before going, such as "closed Mondays", "reservations advised", or "cash only". Give "" when there are none. A clash with the trip's dates, such as "closed Wednesdays, and Day 4 is a Wednesday", isn't a note. Report it as a problem.
- visitTimeInMinutes: your estimate of the time spent at the place, not the drive there, sized to what the user cares about. A keen hiker at the Windows Section in Arches might get 90, and someone who wants a quick look 30. The day's schedule is built from it, so a realistic time is better than a short one.
- tier: what the place is like, whatever the worker brief asked for. Judge it from the place's description, reviews, and listing:
  - value: simple and clean. A budget chain motel, such as a Super 8, or a basic independent motel. For food, counter service, a diner, or a food truck.
  - midRange: comfortable, with more service. A mainstream chain hotel, such as a Hampton Inn or a Courtyard, or a well-reviewed independent inn. For food, a typical sit-down restaurant.
  - upscale: a boutique hotel, a resort, or a top-rated inn or B&B. For food, a chef-driven restaurant where a reservation is wise.

  For a restaurant, the price level is a guide, not a rule: $ usually means value, $$ midRange, and $$$ or more upscale. When it's missing, or disagrees with what the place is like, the description decides. Hotels have no price level, so judge them from their summaries and reviews.`;

// What a problem and a question are, for report_result (tool design 2.6). Settled on
// 2026-10-28, in #60.
export const PROBLEMS_AND_QUESTIONS = `## Problems and questions

You end your work with report_result, which takes your problems and your questions for the user. The coordinator reads them, and decides what to tell the user. You can't ask the user anything yourself.

- A problem is something the coordinator should know that it can't tell from what you saved. Examples: "Gifford Homestead is closed on Wednesdays, and Day 4 is a Wednesday." "Only two places in Torrey fit a quiet B&B, so the Torrey lodging has two candidates." "Nothing upscale in Torrey, so the lodging candidates are the closest I found, both midRange."
- A question needs the user's decision. Ask one only when you can't do an item well without the answer. Example: "Should the Day 2 lunch be a picnic, since the day is all hiking?"
- Write each one as a short sentence. Name stops and stays as the tools do, such as "Day 2, Stop 4" or "Stay 1, Moab".
- Don't list what you added or saved, or say that all went well. Code gives the coordinator what you saved. When there's nothing to report, give empty lists.`;
