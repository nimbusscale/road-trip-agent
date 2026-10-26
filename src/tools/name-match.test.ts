import { describe, expect, it } from "vitest";

import { closestByName } from "./name-match.js";

// How the names are made ready before scoring (tool design 2.1). Each case puts first a
// name that ties with the right one when the rule is broken, since ties keep the order
// given.
function best(text: string, names: readonly string[]): string | undefined {
  return closestByName(text, names, (name) => name, 1)[0];
}

describe("closestByName", () => {
  it("drops an apostrophe, so it doesn't split a word", () => {
    expect(best("Milts", ["Milt S", "Milt's"])).toBe("Milt's");
  });

  it("reads other punctuation as a space, so it doesn't join two words", () => {
    expect(best("Desert Pearl", ["Desertpearl", "Desert-Pearl"])).toBe(
      "Desert-Pearl",
    );
  });

  it('takes out a leading "the", so it doesn\'t count toward a match', () => {
    expect(best("The Pearl", ["The Pear Tree", "Pearl"])).toBe("Pearl");
  });

  it("matches a name of one or two letters", () => {
    expect(best("Oz", ["Zion", "Oz"])).toBe("Oz");
  });
});
