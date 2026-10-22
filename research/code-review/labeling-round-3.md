# Round 3 labeling, by category

> **This is a research document, not a design document.** It's the summary of labeling round 3 in [#75](https://github.com/nimbusscale/road-trip-agent/issues/75), kept as evidence for the rubric changes in [#81](https://github.com/nimbusscale/road-trip-agent/pull/81). Claude wrote it for Joe, so "my call" is Claude's. The files it names, such as `round-3/notes.json`, and the findings behind item IDs such as 30-12, were on Joe's machine and aren't kept.

Rubric: section 3.1 at ca69da5. Same items, model, and Claude Code version (2.1.304) as round 2. All 20 runs finished. Cost about $25 at API prices.

## The numbers

- **The labelers agree on the category for 167 of 178 items, up from 163.** 12 items newly agree, 8 newly split, and 3 are still split. That leaves 11 splits.
- **On the 11 splits, my call goes with labeler a on 7 and labeler b on 4.**
- **Of the 167 agreed items, I'd move 6 to another category.** The other 161 fit the new rules.

## My calls

Each table has the items one rule decides. "Labeler a" and "Labeler b" are their round 3 labels. "My call" is where I think the item belongs.

**D2: does the design speak to the point itself?**

| Item | Labeler a | Labeler b | My call | Why |
|---|---|---|---|---|
| 30-12 | D2 | NF2 | D2 | Domain model 3.10 refuses an empty name, with no exception for a place that already has one |
| 30x-20 | D2 | NF2 | D2 | Domain model 3.10's rule is exactly "only a place's one and only period can have no closing" |
| 31-13 | D2 | N1 | D2 | Persistence 8.8 says to load the trip with `TripRepository.load()`, which loads places |
| 35-2 | D2 | NF2 | D2 | Domain model 4.1 says times past the next day are left empty, and 4.8 says the checks then give nothing |
| 44r4-3 | N3 | D2 | D2 | Technical spec 5.2 says the coordinator learns the limit from the refusal and sends it again |
| 34-14 | NF4 | NF4 | D2 | Domain model 3.8 says a leg is compared on its four routed places, which is what the finding wants changed |
| 35-22 | NF2 | NF2 | D2 | Technical spec 8's skip rule names the daily driving check |
| 32-16 | NF2 | D2 | NF2 | Two lines in domain model 4.1 give different answers for this case |
| 31-15 | D2 | NF4 | NF4 | The D2 argument rests only on the general three-layer rule |

**D1: can the failure happen with the code as it stands?**

| Item | Labeler a | Labeler b | My call | Why |
|---|---|---|---|---|
| 34-15 | NF2 | D1 | NF2 | Only the way an unwritten tool will call it keeps the leg current |
| 31-22 | D1 | NF4 | NF4 | Nothing saves a trip today, but `TripWriter` is written and gets judged as if called. Then a save can land in the deploy gap |

**D3: does the issue name the work?**

| Item | Labeler a | Labeler b | My call | Why |
|---|---|---|---|---|
| K2 | D3 | D3 | F1 | Phase 15 asks for the work. Phase 16 names only the goal ("turned back into links on load"), not loading the places |
| 44r4-2 | D3 | N3 | N3 | Phase 22 names the missing changed results, not these extra repeated lines |

**F3: is the text false?**

| Item | Labeler a | Labeler b | My call | Why |
|---|---|---|---|---|
| 30-2 | NF3 | NF3 | F3 | The same bug as 34-1, which both labeled F3. A Google timeout counts as normal use |
| 35-4 | F3 | F3 | N3 | The next sentence says "1:00 a.m. the next day", so the date isn't false. Both labelers quoted only the first sentence |

**F7 and F6**

| Item | Labeler a | Labeler b | My call | Why |
|---|---|---|---|---|
| 30x-11 | F7 | F7 | N2 | The test checks the whole round trip, and misses only the private name |
| K6 | N6 | F6 | N6 | Persistence section 5 and line 159 already say where the lock is checked |

## Gaps in the rubric

### F7 doesn't cover a test that can't see one part of what it checks

For 30x-11, both labelers read `toEqual` missing the private name as F7. The change adds the sentence after the N2 sentence.

**Now:**

> **F7: a test is wrong.** It can't catch a break in the very thing it targets. For example, it checks only that a list isn't empty, so a list with the wrong items passes. Or it fails when the code is right, such as a test that reads the real clock and breaks on a set date. A test that checks the real thing but misses a case or a path is N2, a missing test. A wrong test gives false confidence, which is worse than having no test.

**Suggested:**

> **F7: a test is wrong.** It can't catch a break in the very thing it targets. For example, it checks only that a list isn't empty, so a list with the wrong items passes. Or it fails when the code is right, such as a test that reads the real clock and breaks on a set date. A test that checks the real thing but misses a case or a path is N2, a missing test. So is a test that checks the real thing but can't see one part of it, such as one field of an object. A wrong test gives false confidence, which is worse than having no test.

The full notes are in `round-3/notes.json`, and the counts are in `round-3/compare.json`.
