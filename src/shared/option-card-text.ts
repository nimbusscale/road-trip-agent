import type {
  ShownOption,
  ShownOptionCard,
  ShownStay,
  ShownStop,
} from "./itinerary.schema.js";
import { STOP_KIND_TEXT } from "./itinerary-text.js";
import type { MessageRequest } from "./session.schema.js";

// An option card's text and the messages its buttons send (functional spec 7.5). The
// web page and npm run live-chat both use it, so a click and the terminal client send
// the coordinator the same words.

// The stop or stay a card is for, and how the user's message names it, such as "the
// lodging in Moab".
export interface CardHolder {
  id: string;
  label: string;
}

export function stayCardHolder(stay: ShownStay): CardHolder {
  return { id: stay.id, label: `the lodging in ${stay.place.name}` };
}

export function stopCardHolder(stop: ShownStop, dayNumber: number): CardHolder {
  return {
    id: stop.id,
    label: `the ${STOP_KIND_TEXT[stop.kind].toLowerCase()} "${stop.purpose}" on Day ${String(dayNumber)}`,
  };
}

// Each sends a message in the user's words, with the card's IDs for the app's line
// (technical spec 7.2).
export function selectMessage(
  option: ShownOption,
  holder: CardHolder,
): MessageRequest {
  return {
    text: `Select ${option.place.name} for ${holder.label}.`,
    optionCard: { holderId: holder.id, placeId: option.place.id },
  };
}

export interface CardAsk {
  label: string;
  text: string;
}

// "Higher tier" and "Lower tier" are requests for the worker, such as "something nicer
// than these". Nothing is saved (technical spec section 9). They show only where the
// view allows them.
export function cardAsks(card: ShownOptionCard): CardAsk[] {
  const asks = [
    { label: "More options", text: "more options like these", shown: true },
    {
      label: "Higher tier",
      text: "something nicer than these",
      shown: card.higherTier,
    },
    {
      label: "Lower tier",
      text: "something simpler than these",
      shown: card.lowerTier,
    },
  ];
  return asks
    .filter((each) => each.shown)
    .map(({ label, text }) => ({ label, text }));
}

export function askMessage(ask: CardAsk, holder: CardHolder): MessageRequest {
  return {
    text: `Show me ${ask.text} for ${holder.label}.`,
    optionCard: { holderId: holder.id, placeId: null },
  };
}

// Google's facts, after the place's name (Google design 2.2).
export function googleFacts(option: ShownOption): string[] {
  return [option.type, option.location, option.rating].filter(
    (fact) => fact !== null,
  );
}

// Ours: the tier, and for an attraction its visit time, and for a stop along the leg
// its detour. A worker's visit time is an estimate, and its detour is a rough figure
// from when the place was offered (domain model 3.9). Null when there are none.
export function ourFactsText(option: ShownOption): string | null {
  const facts = [
    option.tier,
    option.visitTime === null
      ? null
      : option.namedByUser
        ? `${option.visitTime} there`
        : `about ${option.visitTime} there, an estimate`,
    option.detourTime === null
      ? null
      : `adds ${option.detourTime} of driving, as of when it was offered`,
  ].filter((fact) => fact !== null);
  if (facts.length === 0) {
    return null;
  }
  const text = facts.join(", ");
  return `${text.charAt(0).toUpperCase() + text.slice(1)}.`;
}
