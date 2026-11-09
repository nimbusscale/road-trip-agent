import {
  chooseNewIdsWith,
  ID_CHARACTERS,
  ID_PREFIXES,
  ID_RANDOM_LENGTH,
  type IdKind,
} from "../ids/new-id.js";

const KIND_OF_PREFIX = new Map<string, string>(
  Object.entries(ID_PREFIXES).map(([kind, prefix]) => [prefix, kind]),
);

const ID_PATTERN = new RegExp(
  `\\b(${Object.values(ID_PREFIXES).join("|")})[${ID_CHARACTERS}]{${String(ID_RANDOM_LENGTH)}}\\b`,
  "g",
);

// Every ID in the text, each once, in the order they first appear.
export function idsIn(text: string): string[] {
  return [...new Set(text.match(ID_PATTERN) ?? [])];
}

// The IDs a recorded call gave new items: in its reply, and never seen before, in an
// earlier call or in its own input. Each is kept, so a later call doesn't count it.
export class SeenIds {
  readonly #seen = new Set<string>();

  see(text: string): void {
    for (const id of idsIn(text)) {
      this.#seen.add(id);
    }
  }

  newIn(input: unknown, replyText: string): string[] {
    this.see(JSON.stringify(input));
    const fresh = idsIn(replyText).filter((id) => !this.#seen.has(id));
    this.see(replyText);
    return fresh;
  }
}

export interface WithIds<T> {
  readonly result: T;
  // Recorded IDs today's code never asked for.
  readonly unused: readonly string[];
  // The kinds of the IDs today's code made with no recorded one left, so random.
  readonly random: readonly IdKind[];
}

// Runs the work with newId() handing out the given IDs: each kind's in the order given,
// which is the order a reply names them. Today's code makes a stay before its days,
// and a call's stops in order, as its reply lists them.
export async function withIds<T>(
  ids: readonly string[],
  work: () => Promise<T>,
): Promise<WithIds<T>> {
  const waiting = [...ids];
  const random: IdKind[] = [];
  const result = await chooseNewIdsWith((kind) => {
    const index = waiting.findIndex((id) => kindOf(id) === kind);
    if (index === -1) {
      random.push(kind);
      return undefined;
    }
    return waiting.splice(index, 1)[0];
  }, work);
  return { result, unused: waiting, random };
}

function kindOf(id: string): string | undefined {
  return KIND_OF_PREFIX.get(id.slice(0, id.indexOf("_") + 1));
}
