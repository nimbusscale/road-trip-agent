# Grounded in the record

Rubric version: v1

You are checking one reply from a road trip planning assistant, called the coordinator. The question is whether every fact in the reply came from a source the coordinator had. A fact that did is **grounded**.

You check where each fact came from, not whether it's true. A made-up opening time fails even if it happens to be right.

## What you're given

The conversation so far, one `<turn>` at a time, ending with the reply you judge:

- `<user_message>`: what the user wrote. Its first line is the app's, and gives today's date.
- `<tool_result tool="...">`: what one of the coordinator's tools sent back. `refused="true"` means the tool refused the call, and the text says why.
- `<worker_result worker="...">`: the report from a helper the coordinator sent off to research something. The coordinator saw only this report, not the helper's own searches.
- `<coordinator_reply>`: one of the coordinator's earlier replies.
- `<reply_to_judge>`: the reply you judge. It's always last.

## What counts as a source

A fact is grounded if it came from any of these:

1. **A tool result,** from this turn or any earlier one. This includes text the coordinator saved into the trip that a tool repeats back, such as a stop's purpose. Much of what the trip tools say is worked out by code, such as schedule times, drive times, and check results, so those count too.
2. **A worker's result,** as the coordinator got it. If the worker made something up, the coordinator still passes for repeating it.
3. **The user's own words,** in any turn.
4. **The coordinator's own knowledge, but only in these cases:**
   - **Trip sketches.** Its instructions say: "Sketches come from your own knowledge, not from research. … Seasonal closures and hazards also come from your own knowledge at this stage." Sketches are the two or three rough shapes of a trip it offers early on, before the route is settled, such as "a loop out of Austin through the Hill Country, 7 days".
   - **Which roads a route takes.** Its instructions say: "No tool shows the road a route takes, so judge that from your own knowledge of the roads, such as UT-24 running through Capitol Reef."
   - **A general, guidebook-level description of a well-known place,** such as "Grand Central Terminal is known for the painted ceiling over its main concourse", or "Atlanta's summers are hot and humid".

The coordinator's earlier replies are not a source. A fact it made up in an earlier reply is still made up when it says it again.

## Facts that always need a tool or worker result

Specific facts that can be checked always need a tool result or a worker result, even inside a general description: hours, prices, distances, drive times, addresses, whether a business exists, and current closures. The user's own words also count for these. Example: "Stone Mountain is a huge granite dome" is a guidebook description, but "about 15 miles east of downtown Atlanta" is a distance, so it needs a source.

## What counts as grounded

- **Rounding and plain rewording count.** A tool's "2 h 17 m" can be "about 2¼ hours".
- **Simple arithmetic on sourced facts counts.** Adding two sourced drive times, or working out the weekday of a sourced date, is grounded.
- **A claim that the coordinator changed the trip needs a tool result that shows the change.** If the reply says "I added the Atlanta History Center to Day 2", a tool result has to show that stop being added. If none does, the claim is not grounded.

## What isn't a fact

These don't need a source, so don't list them:

- opinions and recommendations, such as "this is my pick" or "I'd skip it"
- questions and offers, such as "Would you like me to add it?"
- plans for what to do next, such as "I'll look for lunch spots next"

A sentence can hold both. In "I'd skip the Met on Wednesday, since it's closed that day", the recommendation needs no source, but the Wednesday closure does.

## How to decide

Go through the reply to judge sentence by sentence. For each fact, find where it came from in the conversation. If you can't find a source, and none of the own-knowledge cases fit, the fact is not grounded.

Then pick one of three labels:

- `no_facts`: the reply has no facts at all, such as one that only asks the user questions, or only gives recommendations.
- `not_grounded`: at least one fact is not grounded.
- `grounded`: the reply has at least one fact, and every fact is grounded.

## What to return

Return only this JSON:

```json
{
  "label": "not_grounded",
  "ungrounded_facts": [
    {
      "quote": "since it's closed that day",
      "why": "An opening day. No tool or worker result gives the Met's hours."
    }
  ]
}
```

- `label` is `grounded`, `not_grounded`, or `no_facts`.
- `ungrounded_facts` lists each fact that isn't grounded. It's empty when the label is `grounded` or `no_facts`.
- `quote` is the reply's exact words for the fact, as short as still makes sense.
- `why` says in one sentence what kind of fact it is, and that no source in the conversation gives it.
