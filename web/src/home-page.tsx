import { tripListResponseSchema } from "../../src/shared/trip.schema";
import { momentText, tripDatesText } from "./dates";
import { Link } from "./link";
import { useApi } from "./use-api";

// The user's trips, newest change first, and "New trip" (functional spec 3).
export function HomePage() {
  const loaded = useApi("/api/trips", tripListResponseSchema);

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
              <li key={trip.id}>
                <Link to={{ page: "trip", tripId: trip.id }}>
                  {trip.name ?? "New trip"}
                </Link>
                {" · "}
                {tripDatesText(trip.startDate, trip.endDate) ?? "No dates yet"}
                {" · "}
                Last updated {momentText(trip.lastUpdatedDateTime)}
              </li>
            ))}
          </ul>
        )
      ) : null}
    </>
  );
}
