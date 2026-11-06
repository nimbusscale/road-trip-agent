import type { CorpusSession } from "./corpus-turn.js";
import { turnsUpTo } from "./judge-input.js";

const DATA_PLACEHOLDER = "/*REVIEW_DATA*/";

// The review page for one set (#282, step 5): each turn's judge input, laid out for a
// person to read, from the same turns the judge input is built from. It shows no labels,
// and only reads. The data goes in a JSON script tag, with each < written as < so
// no text in it can close the tag.
export function reviewPageOf(
  template: string,
  set: number,
  items: { session: CorpusSession; spanId: string }[],
): string {
  const data = {
    set,
    turns: items.map(({ session, spanId }) => {
      const turns = turnsUpTo(session, spanId);
      return {
        spanId,
        conversation: turns.map((turn, index) => ({
          number: index + 1,
          judged: index === turns.length - 1,
          ...turn,
        })),
      };
    }),
  };
  const json = JSON.stringify(data).replaceAll("<", "\\u003c");
  return template.replace(DATA_PLACEHOLDER, () => json);
}
