import { useState } from "react";

import {
  type TripSummary,
  tripListResponseSchema,
} from "../../src/shared/trip.schema";
import { callApiForChange, messageOf } from "./api-client";
import { momentText, tripDatesText } from "./dates";
import { HealthStatus } from "./health-status";
import { Link } from "./link";
import { useApiAfterEachTurn } from "./use-api";

// The user's trips, newest change first, each with "Delete trip", and "New trip"
// (functional spec 3 and 10.1). Under them, whether turn traces reach Phoenix.
export function HomePage() {
  const [loaded, setLoaded] = useApiAfterEachTurn(
    "/api/trips",
    tripListResponseSchema,
    false,
  );

  function removeFromList(tripId: string): void {
    setLoaded((current) =>
      current.status === "loaded"
        ? {
            status: "loaded",
            data: {
              trips: current.data.trips.filter((trip) => trip.id !== tripId),
            },
          }
        : current,
    );
  }

  return (
    <>
      <h2>Your trips</h2>
      <p>
        <Link to={{ page: "newTrip" }}>New trip</Link>
      </p>
      {loaded.status === "loading" ? <p>Loading…</p> : null}
      {loaded.status === "failed" ? <p role="alert">{loaded.message}</p> : null}
      {loaded.status === "loaded" ? (
        loaded.data.trips.length === 0 ? (
          <p>No trips yet.</p>
        ) : (
          <ul>
            {loaded.data.trips.map((trip) => (
              <TripItem key={trip.id} trip={trip} onDeleted={removeFromList} />
            ))}
          </ul>
        )
      ) : null}
      <HealthStatus />
    </>
  );
}

// Asks first, since a deleted trip can't come back.
function TripItem({
  trip,
  onDeleted,
}: {
  trip: TripSummary;
  onDeleted: (tripId: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const name = trip.name ?? "New trip";

  function deleteTrip(): void {
    const question = `Delete "${name}"? Its itinerary, sessions, and trip memory go with it, and can't be brought back. User memory stays.`;
    if (!window.confirm(question)) {
      return;
    }
    setError(null);
    void callApiForChange(`/api/trips/${trip.id}`, { method: "DELETE" }).then(
      () => {
        onDeleted(trip.id);
      },
      (failure: unknown) => {
        setError(messageOf(failure));
      },
    );
  }

  return (
    <li>
      <Link to={{ page: "trip", tripId: trip.id }}>{name}</Link>
      {" · "}
      {tripDatesText(trip.startDate, trip.endDate) ?? "No dates yet"}
      {" · "}
      Last updated {momentText(trip.lastUpdatedDateTime)}{" "}
      <button type="button" onClick={deleteTrip}>
        Delete trip
      </button>
      {error === null ? null : <span role="alert"> {error}</span>}
    </li>
  );
}
