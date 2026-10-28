import type {
  ShownOption,
  ShownOptionCard,
} from "../../src/shared/itinerary.schema";
import type { MessageRequest } from "../../src/shared/session.schema";
import { GoogleMapsCredit } from "./credits";

// How the cards' buttons reach the coordinator: each sends a message in the user's
// words, with the card's IDs for the app's line (technical spec 7.2).
export interface CardActions {
  send: (message: MessageRequest) => void;
  // A turn is running, so a message would be refused.
  busy: boolean;
}

// The stop or stay a card is for, and how the user's message names it, such as "the
// lodging in Moab".
export interface CardHolder {
  id: string;
  label: string;
}

interface OptionCardProps {
  card: ShownOptionCard;
  holder: CardHolder;
  actions: CardActions;
}

// The newest set of one stop or stay, with Select on each option, and the card's
// actions under them (functional spec 7.5). "Higher tier" and "Lower tier" show only
// where the view allows them.
export function OptionCard({ card, holder, actions }: OptionCardProps) {
  function ask(text: string, placeId: string | null): void {
    actions.send({ text, optionCard: { holderId: holder.id, placeId } });
  }

  return (
    <div className="option-card">
      <ol className="options">
        {card.options.map((option) => (
          <OptionItem
            key={option.place.id}
            option={option}
            busy={actions.busy}
            onSelect={() => {
              ask(
                `Select ${option.place.name} for ${holder.label}.`,
                option.place.id,
              );
            }}
          />
        ))}
      </ol>
      <CardActionsRow
        card={card}
        label={holder.label}
        busy={actions.busy}
        ask={ask}
      />
      <GoogleMapsCredit />
    </div>
  );
}

interface CardActionsRowProps {
  card: ShownOptionCard;
  label: string;
  busy: boolean;
  ask: (text: string, placeId: string | null) => void;
}

// "Higher tier" and "Lower tier" are requests for the worker, such as "something nicer
// than these". Nothing is saved (technical spec section 9).
function CardActionsRow({ card, label, busy, ask }: CardActionsRowProps) {
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
  return (
    <p className="card-actions">
      {asks
        .filter((each) => each.shown)
        .map((each) => (
          <CardButton
            key={each.label}
            label={each.label}
            busy={busy}
            onClick={() => {
              ask(`Show me ${each.text} for ${label}.`, null);
            }}
          />
        ))}
    </p>
  );
}

interface OptionItemProps {
  option: ShownOption;
  busy: boolean;
  onSelect: () => void;
}

// Google's facts come first, on a line of their own. Ours, from the worker or the
// user, are set apart under them (Google design 2.2).
function OptionItem({ option, busy, onSelect }: OptionItemProps) {
  const facts = [option.type, option.location, option.rating].filter(
    (fact) => fact !== null,
  );
  return (
    <li>
      <p className="google-facts">
        <strong>{option.place.name}</strong>
        {facts.map((fact) => ` · ${fact}`).join("")}
      </p>
      <div className="our-notes">
        <OurFacts option={option} />
        <p>Why: {option.rationale}</p>
        {option.notes === null ? null : <p>Notes: {option.notes}</p>}
        <p>
          {option.sourceLink === null ? (
            "You named this place. "
          ) : (
            <>
              <a href={option.sourceLink} target="_blank" rel="noreferrer">
                Source
              </a>{" "}
            </>
          )}
          <CardButton label="Select" busy={busy} onClick={onSelect} />
        </p>
      </div>
    </li>
  );
}

// The tier, and for an attraction its visit time, and for a stop along the leg its
// detour. A worker's visit time is an estimate, and its detour is a rough figure from
// when the place was offered (domain model 3.9).
function OurFacts({ option }: { option: ShownOption }) {
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
  return <p>{text.charAt(0).toUpperCase() + text.slice(1)}.</p>;
}

interface CardButtonProps {
  label: string;
  busy: boolean;
  onClick: () => void;
}

function CardButton({ label, busy, onClick }: CardButtonProps) {
  return (
    <button type="button" disabled={busy} onClick={onClick}>
      {label}
    </button>
  );
}
