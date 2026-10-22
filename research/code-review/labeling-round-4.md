# Round 4: the F3, N3, and F7 changes

> **This is a research document, not a design document.** It's the summary of labeling round 4 in [#75](https://github.com/nimbusscale/road-trip-agent/issues/75), kept as evidence for the rubric changes in [#81](https://github.com/nimbusscale/road-trip-agent/pull/81). Claude wrote it for Joe, so "my call" is Claude's and "you" is Joe. The findings behind item IDs such as 34-1 were on Joe's machine and aren't kept.

The changes mostly worked. 7 of the 8 target items landed where the change aims. No item moved up from N to F. The one miss is 33-1. Both labelers read the new N3 wording as covering a call that the design says shouldn't fail at all.

## Target items

| Item | Round 3 (a/b) | Round 4 (a/b) | Aim | Landed |
|---|---|---|---|---|
| 34-1 | F3 / F3 | N3 / N3 | N | yes |
| 30-2 | NF3 / NF3 | N3 / N3 | N | yes |
| 30x-11 | F7 / F7 | N2 / N2 | N | yes |
| 31-1 | F7 / F7 | F7 / F7 | F | yes |
| 33-10 | F7 / F7 | F7 / F7 | F | yes |
| 34-11 | F7 / F7 | F7 / F7 | F | yes |
| 33-1 | F3 / F2 | N3 / N3 | F | no |
| 35-4 | F3 / F3 | F3 / NF3 | F or N | yes |

On 34-1, 30-2, and 30x-11, both labelers quoted the new example as the reason for their label.

## Agreement by category, 34 items

- Round 3: 32 agree, 2 split.
- Round 4: 30 agree, 4 split.

None of the four splits comes from the F3, N3, or F7 wording. Three are about whether a D label or V1 fits. The fourth, 35-4, is about normal use.

## Moved up from N to F

None.

## The round 4 splits

| Item | Labeler a | Labeler b | Round 3 (a/b) | My call | Why |
|---|---|---|---|---|---|
| 30-9 | NF3 | V1 | NF3 / NF3 | NF3 | The code comment and both saved Google answers show the address shape the code expects. b's V1 rests on an address shape it made up. |
| 35-3 | D2 | N3 | N3 / N3 | N3 | The design's "You agreed to 5." is a "such as" example, not settled wording, so D2 isn't clear. The text is unclear, not false. |
| 35-4 | F3 | NF3 | F3 / F3 | F3 | The design's own example has stargazing at 1 a.m., so a visit after midnight is normal use. A wrong day is false text. You accepted either. |
| 44r4-3 | D2 | N3 | N3 / D2 | D2 | Technical spec 5.2 and 8 say the coordinator learns the limits from its instructions and the error. The finding wants another way. The labelers swapped labels from round 3. |

## 33-1, and a gap in the rubric

33-1 is `removeStops` given the same stop twice. It removes the stop, then refuses the second copy with "These stops aren't on the day."

My call is F2. The design lists when `removeStops` is refused: "the whole call, when a stop isn't in the itinerary." A duplicate is in the itinerary, so the design doesn't refuse this call, but the code does. The rubric names the same ID twice as normal use. The wrong error text is N3, but F2 comes first in the table.

Both labelers considered F2 and dropped it because refusing a duplicate is "reasonable." Then they took N3 from the new wording. The new F3 text says "The agent knows the call failed, so it judges what to do next." That reads as if the failure itself is fine. The rubric doesn't say this case covers only the message.

Current text (F3 rule):

> **F3: text a road trip agent reads says something false, in normal use.** The road trip agents are the app's own agents, such as the coordinator and its workers, not the agents that build or review the code. The text is tool descriptions, input schemas, what tools return, and error messages. An agent acts on them, so false text leads to wrong actions. The test is whether an agent that believes the text would do the wrong thing. For example, a tool description promises something the tool doesn't do. False text is a specific claim an agent could act on as a real answer. That covers a wrong time, day, or place. An error message that gives the wrong reason for a failure is N3, not F3. For example, "access denied" when the input was the problem, or "a response the app doesn't understand" when the service timed out. The agent knows the call failed, so it judges what to do next, such as trying again or asking the user.

Suggested text:

> **F3: text a road trip agent reads says something false, in normal use.** The road trip agents are the app's own agents, such as the coordinator and its workers, not the agents that build or review the code. The text is tool descriptions, input schemas, what tools return, and error messages. An agent acts on them, so false text leads to wrong actions. The test is whether an agent that believes the text would do the wrong thing. For example, a tool description promises something the tool doesn't do. False text is a specific claim an agent could act on as a real answer. That covers a wrong time, day, or place. An error message that gives the wrong reason for a failure is N3, not F3. For example, "access denied" when the input was the problem, or "a response the app doesn't understand" when the service timed out. The agent knows the call failed, so it judges what to do next, such as trying again or asking the user. ***This covers only the message. When the call shouldn't fail at all, such as a refusal the design doesn't list, the failure is F2.***

## Run details

Rubric at d04db3b. Claude Code 2.1.304, the same as round 3. 20 runs, none failed. The longest run took 132 seconds. The cost was $10.39 at API prices.
