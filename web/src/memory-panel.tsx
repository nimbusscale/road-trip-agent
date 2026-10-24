import { type Dispatch, type SetStateAction, useEffect, useState } from "react";

import {
  type MemoryResponse,
  memoryResponseSchema,
  type ShownMemoryItem,
} from "../../src/shared/memory.schema";
import { callApi, callApiForChange, messageOf } from "./api-client";
import type { Loaded } from "./use-api";

interface MemoryPanelProps {
  sessionId: string;
  // Read again when a turn ends, since the coordinator may have changed memory.
  busy: boolean;
}

// User memory and this trip's memory, each item with "Forget" (functional spec 10.5).
export function MemoryPanel({ sessionId, busy }: MemoryPanelProps) {
  const path = `/api/sessions/${sessionId}/memory`;
  const [loaded, setLoaded] = useMemory(path, busy);
  const [error, setError] = useState<string | null>(null);

  function forget(item: ShownMemoryItem): void {
    if (!window.confirm(`Forget this?\n\n${item.text}`)) {
      return;
    }
    setError(null);
    void callApiForChange(`${path}/${item.id}`, { method: "DELETE" }).then(
      () => {
        setLoaded((before) => withoutItem(before, item.id));
      },
      (failure: unknown) => {
        setError(messageOf(failure));
      },
    );
  }

  return (
    <section className="memory boxed">
      {loaded.status === "loading" ? <p>Loading memory…</p> : null}
      {loaded.status === "failed" ? <p role="alert">{loaded.message}</p> : null}
      {loaded.status === "loaded" ? (
        <>
          <MemoryList
            title="User memory"
            items={loaded.data.userMemory}
            onForget={forget}
          />
          <MemoryList
            title="Trip memory"
            items={loaded.data.tripMemory}
            onForget={forget}
          />
        </>
      ) : null}
      {error === null ? null : <p role="alert">{error}</p>}
    </section>
  );
}

// Reads memory when the panel opens, and again whenever a turn ends.
function useMemory(
  path: string,
  busy: boolean,
): [Loaded<MemoryResponse>, Dispatch<SetStateAction<Loaded<MemoryResponse>>>] {
  const [loaded, setLoaded] = useState<Loaded<MemoryResponse>>({
    status: "loading",
  });

  useEffect(() => {
    if (busy) {
      return undefined;
    }
    const controller = new AbortController();
    void callApi(path, memoryResponseSchema, {
      signal: controller.signal,
    }).then(
      (data) => {
        setLoaded({ status: "loaded", data });
      },
      (failure: unknown) => {
        if (!controller.signal.aborted) {
          setLoaded({ status: "failed", message: messageOf(failure) });
        }
      },
    );
    return () => {
      controller.abort();
    };
  }, [path, busy]);

  return [loaded, setLoaded];
}

interface MemoryListProps {
  title: string;
  items: readonly ShownMemoryItem[];
  onForget: (item: ShownMemoryItem) => void;
}

function MemoryList({ title, items, onForget }: MemoryListProps) {
  return (
    <>
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p>Nothing yet.</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              {item.text}{" "}
              <button
                type="button"
                onClick={() => {
                  onForget(item);
                }}
              >
                Forget
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function withoutItem(
  loaded: Loaded<MemoryResponse>,
  itemId: string,
): Loaded<MemoryResponse> {
  if (loaded.status !== "loaded") {
    return loaded;
  }
  const kept = (items: readonly ShownMemoryItem[]) =>
    items.filter((item) => item.id !== itemId);
  return {
    status: "loaded",
    data: {
      userMemory: kept(loaded.data.userMemory),
      tripMemory: kept(loaded.data.tripMemory),
    },
  };
}
