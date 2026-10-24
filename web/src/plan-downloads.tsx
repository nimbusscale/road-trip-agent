import { useState } from "react";

import { downloadFile, messageOf } from "./api-client";

// The trip brief and the itinerary as a JSON file, in either form: readable, with
// place names, or as stored, with place IDs and the places they link to.
export function PlanDownloads({ tripId }: { tripId: string }) {
  const [error, setError] = useState<string | null>(null);

  function download(form: "readable" | "stored"): void {
    setError(null);
    void downloadFile(
      `/api/trips/${tripId}/plan/${form}`,
      `${tripId}-${form}.json`,
    ).catch((failure: unknown) => {
      setError(messageOf(failure));
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          download("readable");
        }}
      >
        Download plan
      </button>
      <button
        type="button"
        onClick={() => {
          download("stored");
        }}
      >
        Download plan as stored
      </button>
      {error === null ? null : <span role="alert">{error}</span>}
    </>
  );
}
