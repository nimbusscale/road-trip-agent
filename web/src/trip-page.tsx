import { useState } from "react";

import { tripPageResponseSchema } from "../../src/shared/trip.schema";
import { callApiForChange, messageOf } from "./api-client";
import { momentText, tripDatesText } from "./dates";
import { ItineraryView } from "./itinerary-view";
import { Link } from "./link";
import { navigate } from "./route";
import { useApi } from "./use-api";

// A trip's sessions, each with resume, "start a new session", and "Delete trip"
// (functional spec 10.1). Once the trip has started, its chat is closed, and the
// itinerary under them is where the plan can still be read.
export function TripPage({ tripId }: { tripId: string }) {
  const loaded = useApi(`/api/trips/${tripId}`, tripPageResponseSchema);

  if (loaded.status === "loading") {
    return <p>Loading…</p>;
  }
  if (loaded.status === "failed") {
    return <p role="alert">{loaded.message}</p>;
  }
  const { trip, chatClosed, sessions } = loaded.data;
  return (
    <>
      <p>
        <Link to={{ page: "home" }}>Your trips</Link>
      </p>
      <h2>{trip.name ?? "New trip"}</h2>
      <p>{tripDatesText(trip.startDate, trip.endDate) ?? "No dates yet"}</p>
      {chatClosed ? (
        <p>The trip has started, so its chat is closed.</p>
      ) : (
        <p>
          <Link to={{ page: "newSession", tripId }}>Start a new session</Link>
        </p>
      )}
      <h3>Sessions</h3>
      <ul>
        {sessions.map((session) => (
          <li key={session.id}>
            {momentText(session.createdDateTime)} · {session.title}
            {chatClosed ? null : (
              <>
                {" · "}
                <Link to={{ page: "session", sessionId: session.id }}>
                  Resume
                </Link>
              </>
            )}
          </li>
        ))}
      </ul>
      <DeleteTrip tripId={tripId} />
      <ItineraryView tripId={tripId} busy={false} />
    </>
  );
}

// Asks first, since a deleted trip can't come back. Then goes to the home screen.
function DeleteTrip({ tripId }: { tripId: string }) {
  const [error, setError] = useState<string | null>(null);

  function deleteTrip(): void {
    const question =
      "Delete this trip? Its itinerary, sessions, and trip memory go with it, and can't be brought back. User memory stays.";
    if (!window.confirm(question)) {
      return;
    }
    setError(null);
    void callApiForChange(`/api/trips/${tripId}`, { method: "DELETE" }).then(
      () => {
        navigate({ page: "home" });
      },
      (failure: unknown) => {
        setError(messageOf(failure));
      },
    );
  }

  return (
    <p>
      <button type="button" onClick={deleteTrip}>
        Delete trip
      </button>
      {error === null ? null : <span role="alert"> {error}</span>}
    </p>
  );
}
