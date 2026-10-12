# Design walk-throughs

These are past design reviews, kept for history. Each one is a snapshot of the design on the date it ran. The design changed after every run, so much of what these files say no longer matches. Don't treat a finding here as a current problem.

- The current design is in `design/`.
- Anything still open from these runs is in `research/domain-model-notes.md`.

## What a walk-through was

A subagent walked the two example trips in technical spec section 3.1 through the design on paper, step by step: San Francisco to Los Angeles, and Grand Junction to Salt Lake City through Moab. It worked only from `design/`, played both the user and the agents, and made up tool replies. Wherever the docs were silent or contradicted each other, it logged a finding. Then we went through the findings together and changed the design docs.

Each findings file has three sections: the findings, the properties and rules the walk relied on, and a step log. Most findings also have a "Post-review analysis" and a "Settled" line saying how they were decided.

## The runs

| Run | Date | Findings | What it mainly found |
|---|---|---|---|
| 1 | 2026-10-11 | 18, plus sub-items | Holes in the first full design: where waypoints go, what a stop holds, approvals on legs and stops, and the four-hour time blocks |
| 2 | 2026-10-11 | 19, plus sub-items | Time blocks were too abstract and were replaced by a schedule worked out in code. Also check results, weather, and rejecting places |
| 3 | 2026-10-11 | 16, plus sub-items | The schedule while stops are still empty, rejections and moving stops, and what goes in worker briefs |
| 4 | 2026-10-12 | 21 | Moving stops when stays change, free time, and five re-raised decisions that needed clearer wording |
| 5 | 2026-10-12 | 22, plus one added in review | Locking a trip once it starts, the schedule's edge cases, stops near the start or end place, and new sessions |
| 6 | 2026-10-12 | 12, plus two added in review | Mostly wording fixes and small gaps. A sign the design had settled enough to write the domain model |

Only the prompt for run 6 was kept (`prompt-6.md`). Earlier prompts were close to it, with fewer planted changes.
