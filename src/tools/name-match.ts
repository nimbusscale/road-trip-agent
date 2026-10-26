// How find_in_trip ranks the trip's places against the text the user said: by trigram
// similarity, written here with no package (tool design 2.1). It handles typos, such
// as "Desert Rose" for "Desert Pearl Inn", and partial names, such as "Cliffrose" for
// "Cliffrose Springdale, Curio Collection by Hilton". It matches spelling, not meaning,
// so it's not vector search.

const TRIGRAM_LENGTH = 3;

// Each item ranked by how close its name is to the text, best first, as many as
// `count`. There's no cutoff: the closest ones come back however far off they are, and
// the agent judges. The score is the share of the text's trigrams found in the name, so
// a short partial name isn't ranked low against a long full name. Ties go to the share
// of both strings' trigrams together, then to the order the items are given in.
export function closestByName<T>(
  text: string,
  items: readonly T[],
  nameOf: (item: T) => string,
  count: number,
): T[] {
  const wanted = trigramsOf(text);
  const scored = items.map((item) => ({
    item,
    ...scoresOf(wanted, trigramsOf(nameOf(item))),
  }));
  // The sort is stable, so items with the same scores keep their order.
  scored.sort(
    (one, other) =>
      other.textShare - one.textShare || other.bothShare - one.bothShare,
  );
  return scored.slice(0, count).map(({ item }) => item);
}

// True when the text has a letter or digit to match on.
export function hasNameToMatch(text: string): boolean {
  return trigramsOf(text).size > 0;
}

// Lowercased, with apostrophes taken out, so "Milt's" matches "Milts", and any other
// punctuation turned into a space, so "Pearl,Inn" matches "Pearl Inn". Then a leading
// "the" is taken out.
function normalizedName(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/^the /u, "");
}

// The overlapping three-letter pieces of each word, such as "des", "ese", and "ser".
// Each word gets two spaces before it and one after, as Postgres's pg_trgm does. So a
// word's start counts for more, and a word of one or two letters still has pieces.
function trigramsOf(text: string): Set<string> {
  const pieces = new Set<string>();
  const words = normalizedName(text)
    .split(" ")
    .filter((word) => word !== "");
  for (const word of words) {
    const padded = `  ${word} `;
    for (let start = 0; start + TRIGRAM_LENGTH <= padded.length; start++) {
      pieces.add(padded.slice(start, start + TRIGRAM_LENGTH));
    }
  }
  return pieces;
}

function scoresOf(
  wanted: ReadonlySet<string>,
  name: ReadonlySet<string>,
): { textShare: number; bothShare: number } {
  const shared = [...wanted].filter((piece) => name.has(piece)).length;
  const together = wanted.size + name.size - shared;
  return {
    textShare: wanted.size === 0 ? 0 : shared / wanted.size,
    bothShare: together === 0 ? 0 : shared / together,
  };
}
