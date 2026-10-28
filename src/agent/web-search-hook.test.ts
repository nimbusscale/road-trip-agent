import { describe, expect, it } from "vitest";

import { ATLAS_OBSCURA_ONLY_TEXT } from "./web-search-hook.js";
import { LEG_SCOUT, RESEARCHER, webSearchHook } from "./worker-hooks.fake.js";

// The PreToolUse hook on WebSearch, from the hooks a turn's options get, fed the hook
// inputs the Agent SDK sends (tool design, section 4).

const QUERY = "Big Sur California unusual places";

const DENIED = {
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: ATLAS_OBSCURA_ONLY_TEXT,
  },
};

describe("limiting a leg scout's web search to Atlas Obscura", () => {
  it("denies a leg scout's search with no domain limit", async () => {
    const webSearch = await webSearchHook();
    expect(await webSearch(LEG_SCOUT, QUERY, undefined)).toEqual(DENIED);
    expect(await webSearch(LEG_SCOUT, QUERY, [])).toEqual(DENIED);
  });

  it("denies a leg scout's search that lets in any other domain", async () => {
    const webSearch = await webSearchHook();
    expect(
      await webSearch(LEG_SCOUT, QUERY, [
        "atlasobscura.com",
        "tripadvisor.com",
      ]),
    ).toEqual(DENIED);
    expect(await webSearch(LEG_SCOUT, QUERY, ["notatlasobscura.com"])).toEqual(
      DENIED,
    );
  });

  it("lets a leg scout's search limited to atlasobscura.com run", async () => {
    const webSearch = await webSearchHook();
    expect(await webSearch(LEG_SCOUT, QUERY, ["atlasobscura.com"])).toEqual({});
  });

  it("leaves the stay researcher's searches alone", async () => {
    const webSearch = await webSearchHook();
    expect(
      await webSearch(
        RESEARCHER,
        "must-see things to do in Moab Utah",
        undefined,
      ),
    ).toEqual({});
  });
});
