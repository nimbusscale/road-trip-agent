import { useState } from "react";

import {
  type RatingRequest,
  sessionRatingResponseSchema,
} from "../../src/shared/rating.schema";
import { callApiForChange, messageOf } from "./api-client";
import { useApi } from "./use-api";

type Thumb = RatingRequest["rating"];

const THUMBS: readonly Thumb[] = ["up", "down"];

// The session's thumbs start with the user's last rating of it, and its note. A turn's
// have none to start with, since only turns the page streamed have them (functional
// spec 10.1).
export function SessionRating({ sessionId }: { sessionId: string }) {
  const path = `/api/sessions/${sessionId}/rating`;
  const loaded = useApi(path, sessionRatingResponseSchema);
  if (loaded.status === "loading") {
    return null;
  }
  return (
    <Rating
      path={path}
      startsAs={loaded.status === "loaded" ? loaded.data.rating : null}
    />
  );
}

interface RatingProps {
  path: string;
  startsAs: RatingRequest | null;
}

// A thumbs up and down for a turn or a session. Either opens a box for a note, and the
// rating is saved with it. A new rating replaces the last (functional spec 10.1).
export function Rating({ path, startsAs }: RatingProps) {
  const [saved, setSaved] = useState(startsAs);
  const [draft, setDraft] = useState<RatingRequest | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function save(request: RatingRequest): void {
    setSaving(true);
    setError(null);
    void callApiForChange(path, { method: "PUT", body: request })
      .then(
        () => {
          setSaved(request);
          setDraft(null);
        },
        (failure: unknown) => {
          setError(messageOf(failure));
        },
      )
      .finally(() => {
        setSaving(false);
      });
  }

  return (
    <span className="rating">
      {THUMBS.map((thumb) => (
        <ThumbButton
          key={thumb}
          thumb={thumb}
          chosen={(draft ?? saved)?.rating === thumb}
          onChoose={() => {
            setDraft({ rating: thumb, note: (draft ?? saved)?.note ?? "" });
          }}
        />
      ))}
      {draft === null ? null : (
        <NoteForm
          draft={draft}
          saving={saving}
          onChange={setDraft}
          onSave={save}
          onCancel={() => {
            setDraft(null);
            setError(null);
          }}
        />
      )}
      {error === null ? null : <span role="alert">{error}</span>}
    </span>
  );
}

interface ThumbButtonProps {
  thumb: Thumb;
  chosen: boolean;
  onChoose: () => void;
}

function ThumbButton({ thumb, chosen, onChoose }: ThumbButtonProps) {
  return (
    <button
      type="button"
      aria-label={thumb === "up" ? "Thumbs up" : "Thumbs down"}
      aria-pressed={chosen}
      onClick={onChoose}
    >
      {thumb === "up" ? "👍" : "👎"}
    </button>
  );
}

interface NoteFormProps {
  draft: RatingRequest;
  saving: boolean;
  onChange: (draft: RatingRequest) => void;
  onSave: (draft: RatingRequest) => void;
  onCancel: () => void;
}

function NoteForm({
  draft,
  saving,
  onChange,
  onSave,
  onCancel,
}: NoteFormProps) {
  return (
    <span className="rating-note">
      <textarea
        aria-label="Note"
        placeholder="A note, if you like"
        rows={2}
        value={draft.note}
        onChange={(event) => {
          onChange({ ...draft, note: event.target.value });
        }}
      />
      <button
        type="button"
        disabled={saving}
        onClick={() => {
          onSave(draft);
        }}
      >
        Save rating
      </button>{" "}
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
    </span>
  );
}
