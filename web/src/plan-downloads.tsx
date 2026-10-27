import { useState } from "react";

import { downloadFile, messageOf } from "./api-client";

// The trip brief and the itinerary as a text file, as the coordinator reads them: the
// plan as a whole read gives it, or the full plan, with every candidate (functional
// spec 10.1).
const DOWNLOADS = [
  { label: "Download plan", path: "plan", fileName: "plan" },
  { label: "Download full plan", path: "plan/full", fileName: "full-plan" },
] as const;

export function PlanDownloads({ tripId }: { tripId: string }) {
  const [error, setError] = useState<string | null>(null);

  function download(path: string, fileName: string): void {
    setError(null);
    void downloadFile(
      `/api/trips/${tripId}/${path}`,
      `${tripId}-${fileName}.txt`,
    ).catch((failure: unknown) => {
      setError(messageOf(failure));
    });
  }

  return (
    <>
      {DOWNLOADS.map(({ label, path, fileName }) => (
        <button
          key={path}
          type="button"
          onClick={() => {
            download(path, fileName);
          }}
        >
          {label}
        </button>
      ))}
      {error === null ? null : <span role="alert">{error}</span>}
    </>
  );
}
