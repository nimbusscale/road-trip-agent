// How two replies, or two stored records, differ, for the rebuild's report (#244).

// The lines only the recorded reply has, marked "-", and the lines only today's has,
// marked "+", in order. Lines both have are left out. Empty when the two match.
export function lineDifferences(recorded: string, today: string): string[] {
  const before = recorded.split("\n");
  const after = today.split("\n");
  const common = commonLengths(before, after);
  const out: string[] = [];
  let [i, j] = [0, 0];
  while (i < before.length || j < after.length) {
    const [line, other] = [before[i], after[j]];
    if (line !== undefined && line === other) {
      [i, j] = [i + 1, j + 1];
    } else if (other !== undefined && takesAddedFirst(common, i, j)) {
      out.push(`+ ${other}`);
      j++;
    } else {
      out.push(`- ${line ?? ""}`);
      i++;
    }
  }
  return out;
}

// Where the two differ, whether to list today's line before the recorded one: when
// skipping today's line keeps at least as many shared lines ahead.
function takesAddedFirst(common: number[][], i: number, j: number): boolean {
  const atEnd = i === common.length - 1;
  return atEnd || (common[i]?.[j + 1] ?? 0) >= (common[i + 1]?.[j] ?? 0);
}

// common[i][j] is the length of the longest run of lines, in order, that before from i
// and after from j share.
function commonLengths(before: string[], after: string[]): number[][] {
  const common = Array.from({ length: before.length + 1 }, () =>
    new Array<number>(after.length + 1).fill(0),
  );
  for (let i = before.length - 1; i >= 0; i--) {
    const row = common[i] ?? [];
    const below = common[i + 1] ?? [];
    for (let j = after.length - 1; j >= 0; j--) {
      row[j] =
        before[i] === after[j]
          ? (below[j + 1] ?? 0) + 1
          : Math.max(below[j] ?? 0, row[j + 1] ?? 0);
    }
  }
  return common;
}

// Each place where two JSON values differ, as its path and both values, such as
// "itinerary.stays[0].nightCount: 2 → 3". Empty when they match.
export function jsonDifferences(
  live: unknown,
  rebuilt: unknown,
  path = "",
): string[] {
  if (isRecord(live) && isRecord(rebuilt)) {
    const keys = [...new Set([...Object.keys(live), ...Object.keys(rebuilt)])];
    return keys.flatMap((key) =>
      jsonDifferences(
        live[key],
        rebuilt[key],
        path === "" ? key : `${path}.${key}`,
      ),
    );
  }
  if (Array.isArray(live) && Array.isArray(rebuilt)) {
    const length = Math.max(live.length, rebuilt.length);
    return Array.from({ length }, (unused, index) =>
      jsonDifferences(live[index], rebuilt[index], `${path}[${String(index)}]`),
    ).flat();
  }
  const [a, b] = [jsonText(live), jsonText(rebuilt)];
  return a === b ? [] : [`${path}: ${a} → ${b}`];
}

function jsonText(value: unknown): string {
  return value === undefined ? "missing" : JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
