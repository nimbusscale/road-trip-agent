import type { RecordedCall } from "./recorded-calls.js";

// What the rebuild found (#244), for Claude to sort: each checkpoint's differences, each
// call today's code handled differently, and how the rebuilt trip ends up against the
// live one. It quotes the trip, so it's written outside the repo.

const SECTIONS = [
  "checkpoints",
  "writeReplies",
  "refused",
  "rewrites",
  "ids",
  "final",
] as const;

type Section = (typeof SECTIONS)[number];

const TITLES: Record<Section, string> = {
  checkpoints: "Checkpoints that differ",
  writeReplies:
    "Write replies that differ (for tracing a checkpoint's difference)",
  refused: "Calls today's code refused or failed on",
  rewrites: "Calls rewritten into today's shape",
  ids: "IDs that didn't line up",
  final: "The rebuilt trip against the live trip now",
};

interface Entry {
  readonly heading: string;
  readonly lines: readonly string[];
}

export class RebuildReport {
  readonly #entries = new Map<Section, Entry[]>();
  readonly #counts = new Map<string, number>();

  count(what: string): void {
    this.#counts.set(what, (this.#counts.get(what) ?? 0) + 1);
  }

  add(
    section: Section,
    turn: number | null,
    call: RecordedCall | null,
    lines: readonly string[],
  ): void {
    const heading = [
      turn === null ? null : `Turn ${String(turn)}`,
      call === null ? null : callLabel(call),
    ]
      .filter((part) => part !== null)
      .join(", ");
    const entries = this.#entries.get(section) ?? [];
    entries.push({ heading, lines });
    this.#entries.set(section, entries);
  }

  // Counts only, with no content from the trip.
  summary(): string[] {
    const counts = [...this.#counts].map(
      ([what, count]) => `${what}: ${String(count)}`,
    );
    const sections = SECTIONS.map(
      (section) =>
        `${TITLES[section]}: ${String(this.#entries.get(section)?.length ?? 0)}`,
    );
    return [...counts, ...sections];
  }

  text(): string {
    const parts = ["# Trip versions rebuild", "", ...this.summary(), ""];
    for (const section of SECTIONS) {
      parts.push(`## ${TITLES[section]}`, "");
      for (const entry of this.#entries.get(section) ?? []) {
        parts.push(
          `### ${entry.heading}`,
          "",
          "```",
          ...entry.lines,
          "```",
          "",
        );
      }
    }
    return parts.join("\n");
  }
}

function callLabel(call: RecordedCall): string {
  const tool = call.name.split("__").at(-1) ?? call.name;
  const agent = call.agent === "" ? "coordinator" : call.agent;
  return `${tool} by ${agent} at ${call.usedAt.toISOString()} (${call.toolUseId})`;
}
