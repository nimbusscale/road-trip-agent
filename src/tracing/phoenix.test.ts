import { afterEach, describe, expect, it, vi } from "vitest";

import { isPhoenixReachable } from "./phoenix.js";

const PHOENIX_URL = "http://127.0.0.1:6006";

// fetch is faked, so the check makes no outside call (DEVELOPMENT.md section 5).
function fakeFetch(answer: () => Promise<Response>) {
  const fetch = vi.fn<typeof globalThis.fetch>(answer);
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isPhoenixReachable", () => {
  it("asks Phoenix's health check", async () => {
    const fetch = fakeFetch(() =>
      Promise.resolve(new Response("OK", { status: 200 })),
    );
    expect(await isPhoenixReachable(PHOENIX_URL)).toBe(true);
    expect(fetch.mock.calls[0]?.[0]).toBe("http://127.0.0.1:6006/healthz");
  });

  it("is false when Phoenix answers with an error", async () => {
    fakeFetch(() => Promise.resolve(new Response("", { status: 503 })));
    expect(await isPhoenixReachable(PHOENIX_URL)).toBe(false);
  });

  it("is false when nothing answers, such as when the tunnel is down", async () => {
    fakeFetch(() => Promise.reject(new TypeError("fetch failed")));
    expect(await isPhoenixReachable(PHOENIX_URL)).toBe(false);
  });
});
