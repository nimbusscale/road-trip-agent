import { describe, expect, it } from "vitest";

import { newId } from "../ids/new-id.js";
import { SeenIds, withIds } from "./recorded-ids.js";

describe("SeenIds", () => {
  it("counts an ID as new only in the first reply that names it, and never when the call's input names it", () => {
    const seen = new SeenIds();

    const first = seen.newIn(
      { dayId: "day_aaaaaaaa" },
      "Added Day 1 (day_aaaaaaaa), Stop 1 (stop_bbbbbbbb).",
    );
    const second = seen.newIn(
      {},
      "Stop 1 (stop_bbbbbbbb), Stop 2 (stop_cccccccc).",
    );

    expect([first, second]).toEqual([["stop_bbbbbbbb"], ["stop_cccccccc"]]);
  });
});

describe("withIds", () => {
  it("hands out each kind's IDs in order, and says which were left and which kinds had none", async () => {
    const { result, unused, random } = await withIds(
      ["stay_aaaaaaaa", "day_bbbbbbbb", "day_cccccccc", "mem_dddddddd"],
      () =>
        Promise.resolve([
          newId("day"),
          newId("stay"),
          newId("day"),
          newId("stop"),
        ]),
    );

    expect(result.slice(0, 3)).toEqual([
      "day_bbbbbbbb",
      "stay_aaaaaaaa",
      "day_cccccccc",
    ]);
    expect(unused).toEqual(["mem_dddddddd"]);
    expect(random).toEqual(["stop"]);
  });

  it("leaves newId() random again once the work is done, even when it throws", async () => {
    await expect(
      withIds(["stop_aaaaaaaa"], () => Promise.reject(new Error("refused"))),
    ).rejects.toThrow("refused");

    expect(newId("stop")).not.toBe("stop_aaaaaaaa");
  });
});
