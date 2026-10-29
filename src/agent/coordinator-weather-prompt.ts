import { WEATHER_OUT_OF_DATE_START } from "../domain/stay-checks.js";
import { WORKER_BRIEF_HEADING } from "./worker-instructions.js";
import { WORKER_TYPE } from "./worker-types.js";

// The coordinator's instructions on the weather worker, in a file of their own so
// coordinator-prompt.ts stays a readable length: the "The weather worker" section, and
// the end of the "Worker briefs" section.

// Technical spec 4.2 and 5.2: when the weather worker runs, and runs again. The domain
// model's 4.1 says what marks a stay's weather out of date.
export const COORDINATOR_WEATHER_WORKER = `## The weather worker

The weather worker (agent type ${WORKER_TYPE.weatherWorker}) writes each stay's weather and clothing text, from a forecast when every one of the stay's dates is within 7 days, and from seasonal averages otherwise. Its advice is tied to the stay's activities, so it runs once the plan is mostly picked. The user reads the text in the itinerary.

- The first run: once the user has made most of the fill's selections, send one weather worker for every stay. A stop with no place picked yet is covered by its purpose.
- Running it again: code tells you when a stay's weather needs writing again. A write gives a note for the stay that starts "${WEATHER_OUT_OF_DATE_START}", such as "${WEATHER_OUT_OF_DATE_START} Torrey's text no longer matches its place, dates, or activities.", and a read marks its text out of date. That happens when the stay's town or activities change, when a forecast's dates change, or when seasonal averages' dates move by more than a week. A new stay gets the note too, once other stays have weather. At the end of a turn, once no change is still being discussed, send one weather worker for the stays with the note. Example: adding a Big Sur night and then removing it gives the note and then clears it, so there's nothing to run. You don't need to ask the user first, or raise the note.
- Don't run it again after a change that gave no note. Example: moving the trip by a day or two leaves seasonal averages as they are, since the days around the new dates are as typical as the old.
- A forecast isn't refreshed as it ages. Send the weather worker again when the user asks for a new one.
- When it's done, tell the user in a sentence that each stay's weather and clothing advice is in the itinerary. Raise its problems as for any worker.
- When it couldn't look up the weather for an activity's place, always tell the user, and offer to run it again for that stay later.`;

// Technical spec 5.3: the weather worker's worker brief has only the one heading.
export const WEATHER_WORKER_BRIEF = `The weather worker's worker brief is the one exception to these headings. It has only the ${WORKER_BRIEF_HEADING.fill} heading, with one stay ID per line. Unlike the leg scout's, it doesn't keep the other headings with "none" under them. Example:

\`\`\`
${WORKER_BRIEF_HEADING.fill}
- stay_k7m2x9qa
- stay_p3w8n4rt
\`\`\``;
