import type {
  ItineraryResponse,
  ShownOption,
  ShownOptionCard,
} from "../shared/itinerary.schema.js";
import {
  askMessage,
  cardAsks,
  type CardHolder,
  googleFacts,
  ourFactsText,
  selectMessage,
  stayCardHolder,
  stopCardHolder,
} from "../shared/option-card-text.js";
import type { MessageRequest } from "../shared/session.schema.js";
import { LiveChatError } from "./site-api.js";

// The option cards open in the itinerary (functional spec 7.5), named for the terminal,
// since it has no buttons to click. A card is named by its stop's or stay's ID, which
// doesn't change when another card closes, so a simulated user that clicks from an old
// list of cards can't hit the wrong one (#66). Its options are numbered in the order the
// card shows them, and that changes only when the card's own options do.
export interface OpenCard {
  holder: CardHolder;
  card: ShownOptionCard;
}

// Each stay's lodging, then each day's stops, as the view lists them.
export function openCardsOf(view: ItineraryResponse): OpenCard[] {
  const stays = view.stays.flatMap((stay) =>
    stay.lodging.card === null
      ? []
      : [{ holder: stayCardHolder(stay), card: stay.lodging.card }],
  );
  const stops = view.days.flatMap((day) =>
    day.schedule.flatMap(({ stop }) =>
      stop?.choice.card == null
        ? []
        : [
            {
              holder: stopCardHolder(stop, day.number),
              card: stop.choice.card,
            },
          ],
    ),
  );
  return [...stays, ...stops];
}

export function cardCountText(count: number): string {
  if (count === 0) {
    return "No option cards are open.";
  }
  return count === 1
    ? "1 option card is open."
    : `${String(count)} option cards are open.`;
}

export function cardsText(cards: readonly OpenCard[]): string {
  if (cards.length === 0) {
    return cardCountText(0);
  }
  return cards.map(cardText).join("\n\n");
}

function cardText({ holder, card }: OpenCard): string {
  const buttons = ["Select", ...cardAsks(card).map((ask) => ask.label)];
  return [
    `Option card ${holder.id}: ${holder.label}`,
    ...card.options.flatMap(optionLines),
    `  Buttons: ${buttons.join(", ")}`,
    "  Google Maps",
  ].join("\n");
}

// Google's facts first, then ours, as the card sets them apart (Google design 2.2).
function optionLines(option: ShownOption, index: number): string[] {
  const heading = [option.place.name, ...googleFacts(option)].join(" · ");
  const ours = ourFactsText(option);
  return [
    `  ${String(index + 1)}. ${heading}`,
    ...(ours === null ? [] : [`     ${ours}`]),
    `     Why: ${option.rationale}`,
    ...(option.notes === null ? [] : [`     Notes: ${option.notes}`]),
    option.sourceLink === null
      ? "     You named this place."
      : `     Source: ${option.sourceLink}`,
  ];
}

// Select on an option, as its button sends it.
export function selectRequest(
  cards: readonly OpenCard[],
  cardId: string,
  optionNumber: number,
): MessageRequest {
  const { holder, card } = cardNamed(cards, cardId);
  const option = card.options[optionNumber - 1];
  if (option === undefined) {
    throw new LiveChatError(
      `Option card ${cardId} has no option ${String(optionNumber)}. Its options are 1 to ${String(card.options.length)}.`,
    );
  }
  return selectMessage(option, holder);
}

// More options, Higher tier, or Lower tier, as its button sends it. A button the card
// doesn't show is refused, as the page offers no way to click it.
export function askRequest(
  cards: readonly OpenCard[],
  cardId: string,
  label: string,
): MessageRequest {
  const { holder, card } = cardNamed(cards, cardId);
  const ask = cardAsks(card).find((each) => each.label === label);
  if (ask === undefined) {
    throw new LiveChatError(`Option card ${cardId} has no ${label} button.`);
  }
  return askMessage(ask, holder);
}

// A card that has closed since the user last looked is refused, never swapped for
// another.
function cardNamed(cards: readonly OpenCard[], id: string): OpenCard {
  const card = cards.find((each) => each.holder.id === id);
  if (card === undefined) {
    throw new LiveChatError(
      cards.length === 0
        ? `Option card ${id} isn't open. No option cards are open.`
        : `Option card ${id} isn't open. The open cards are ${cards.map((each) => each.holder.id).join(", ")}.`,
    );
  }
  return card;
}
