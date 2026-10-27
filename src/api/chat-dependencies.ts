import type { CoordinatorTurns } from "../agent/coordinator-turns.js";
import type { CalendarSettings } from "../domain/calendar.js";
import type { MemoryReader } from "../persistence/memory-reader.js";
import type { MemoryWriter } from "../persistence/memory-writer.js";
import type { SessionReader } from "../persistence/session-reader.js";
import type { SessionWriter } from "../persistence/session-writer.js";
import type { TranscriptAdapter } from "../persistence/transcript-adapter.js";
import type { TripReader } from "../persistence/trip-reader.js";
import type { TripWriter } from "../persistence/trip-writer.js";

// What the chat's routes are given. The app makes each once, when it starts.
export interface ChatDependencies {
  trips: { reader: TripReader; writer: TripWriter };
  sessions: { reader: SessionReader; writer: SessionWriter };
  memory: { reader: MemoryReader; writer: MemoryWriter };
  turns: CoordinatorTurns;
  transcripts: TranscriptAdapter;
  // For the calendar that works out the itinerary view's schedules.
  settings: CalendarSettings;
  now: () => Date;
}
