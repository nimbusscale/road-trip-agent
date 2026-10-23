import { useEffect, useState } from "react";
import type { ZodType } from "zod";

import { callApi, messageOf } from "./api-client";

export type Loaded<T> =
  | { status: "loading" }
  | { status: "loaded"; data: T }
  | { status: "failed"; message: string };

// Reads from the API when the page opens. Each page is made again when its path
// changes, so the path stays the same for the page's life.
export function useApi<T>(path: string, schema: ZodType<T>): Loaded<T> {
  const [loaded, setLoaded] = useState<Loaded<T>>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    void callApi(path, schema, { signal: controller.signal }).then(
      (data) => {
        setLoaded({ status: "loaded", data });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setLoaded({ status: "failed", message: messageOf(error) });
        }
      },
    );
    return () => {
      controller.abort();
    };
  }, [path, schema]);

  return loaded;
}
