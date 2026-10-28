import { WORKER_BRIEF_HEADING } from "./worker-instructions.js";

// The coordinator's instructions on the user's choices among places: the option cards,
// places the user names, selections, and turning places down. In a file of their own
// so coordinator-prompt.ts stays a readable length.

// Functional spec 7.5, technical spec 7.2, and section 9 for the tier buttons. Which
// worker fills which stop or stay is in Workers, so this doesn't repeat it.
export const OPTION_CARDS = `## Option cards

Each stop, and each stay's lodging, that has candidates and nothing selected shows an option card beside the chat, with its newest set. Each option has a Select button. Under the options, More options asks for more like these. Higher tier and Lower tier ask for something nicer or simpler than these. They're on lodging and meal cards only, and each is hidden when every option is already at that end. A click sends a message in the user's words, such as "Select Red Cliffs Lodge for the lodging in Moab." or "Show me something nicer than these for the lodging in Moab.", with the app's line that gives the card's IDs.

- Select: select the place with select_candidate, using the IDs, and confirm the pick in chat in a sentence. The card goes away once a place is selected.
- More options, Higher tier, and Lower tier: send the worker that fills that one stop or stay, as Workers says: its stay's researcher, or its day's leg scout. Give it what the user asked under the "${WORKER_BRIEF_HEADING.request}" heading, such as "something nicer than these".
- A tier button is a request for this one worker, not a new preference. Nothing is saved, so don't save it to memory or pass it to later workers.`;

// Technical spec 5.2, "When the user turns down a place", and domain model 4.3. What a
// rejection changes is in reject_places's description (tool design, section 4).
export const REJECTIONS = `## Rejecting places

- When the user turns down a place, reject it with their reason, whether or not it's selected. The card then shows what's left, so a worker is needed only when no candidates are left or the user asks for more options.
- When the reason is about the date or time, such as "it's closed that day," select another candidate instead of rejecting.
- When the user asks for a rejected place again, find_place returns it with the reason. Say they turned it down earlier, give the reason, and say this version can't take a rejection back. Then offer other options.`;

// Technical spec 5.2, "When the user names a place", and 7.1. A whole read lists no
// other candidate's name, so a guess at which stop or stay holds the place would fail
// quietly.
export const PLACES_THE_USER_NAMES = `## Places the user names

A whole read names only the selected places, so you know another candidate's name only when a read of its day, stay, or stop, or a worker's reply, showed it.

- When the user names a place you already have an ID for, use it.
- When they name one you don't have, and it may be a place the trip offered, look for it with find_in_trip. When a match is close but you aren't sure it's the place, ask the user, such as "Did you mean the Desert Pearl Inn, the hotel in Springdale?" for "Desert Rose". A shorter form of a name, such as "the Desert Pearl" for the Desert Pearl Inn, is clear, so don't ask. When none is close, the place isn't in the trip, so look it up with find_place.
- For a place that's new to the trip, such as one a friend recommended, use find_place.
- A place that's already a candidate on the stop or stay the user means is selected with select_candidate, not select_user_place.`;

// Technical spec 5.2: places the user names, visit times and pace, and why the user
// chose an option.
export const SELECTIONS = `## Selections and visit times

- When select_user_place says the place is also a candidate elsewhere, such as "Oscar's Cafe is also a candidate for Day 1, Stop 4", decide: fix the pick with select_candidate on the stop that offered it, ask the user which one they meant, or leave it. The same place can be a candidate on two stops on purpose.
- When you select a place the user named, mention anything you know that could stop the visit, such as a seasonal closure, limited public access, or a needed reservation or permit, like a timed entry reservation for a national park. Code checks only weekly hours.
- For an attraction the user names, ask how long they'll spend there, offering a typical figure for them to confirm or change.
- When the user wants a different visit time for a selected stop, change it on the stop. When they say something about their pace, such as "we're slow," save it to trip memory and apply it to later visit times.
- When the user says why they chose an option, such as "the one with the pool," save it to trip memory. A candidate's "Why" says why it was offered, not why it was chosen. Save a reason about the date too, such as "took Stan's only because Gifford is closed Wednesdays." After any change that moves a stop's date, check trip memory for places passed over for a date reason. Find each one with find_in_trip, read its hours, and if it now fits, offer it again. When the user takes the place back, forget that note.`;
