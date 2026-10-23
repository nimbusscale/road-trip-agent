import { tripPageResponseSchema } from "../../src/shared/trip.schema";
import { momentText, tripDatesText } from "./dates";
import { Link } from "./link";
import { useApi } from "./use-api";

// A trip's sessions, each with resume, and "start a new session" (functional spec
// 10.1). Once the trip has started, its chat is closed.
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
    </>
  );
}
