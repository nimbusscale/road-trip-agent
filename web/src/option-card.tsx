import type {
  ShownOption,
  ShownOptionCard,
} from "../../src/shared/itinerary.schema";
import {
  askMessage,
  cardAsks,
  type CardHolder,
  googleFacts,
  ourFactsText,
  selectMessage,
} from "../../src/shared/option-card-text";
import type { MessageRequest } from "../../src/shared/session.schema";
import { GoogleMapsCredit } from "./credits";

// How the cards' buttons reach the coordinator: each sends a message in the user's
// words, with the card's IDs for the app's line (technical spec 7.2).
export interface CardActions {
  send: (message: MessageRequest) => void;
  // A turn is running, so a message would be refused.
  busy: boolean;
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
  return (
    <div className="option-card">
      <ol className="options">
        {card.options.map((option) => (
          <OptionItem
            key={option.place.id}
            option={option}
            busy={actions.busy}
            onSelect={() => {
              actions.send(selectMessage(option, holder));
            }}
          />
        ))}
      </ol>
      <CardActionsRow card={card} holder={holder} actions={actions} />
      <GoogleMapsCredit />
    </div>
  );
}

interface CardActionsRowProps {
  card: ShownOptionCard;
  holder: CardHolder;
  actions: CardActions;
}

function CardActionsRow({ card, holder, actions }: CardActionsRowProps) {
  return (
    <p className="card-actions">
      {cardAsks(card).map((ask) => (
        <CardButton
          key={ask.label}
          label={ask.label}
          busy={actions.busy}
          onClick={() => {
            actions.send(askMessage(ask, holder));
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
  const facts = googleFacts(option);
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

function OurFacts({ option }: { option: ShownOption }) {
  const text = ourFactsText(option);
  return text === null ? null : <p>{text}</p>;
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
