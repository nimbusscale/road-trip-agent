# Saving evaluation: decisions from labeling (#209)

The failure types found so far, and each decision Joe settled while reading the notes, with the turn that raised it. The rubric is written from these. A later decision that changes an earlier one strikes the earlier one out, and never renumbers it. A failure type is never renumbered either.

## Failure types

Each save in a turn is checked against every type: an add, an update (decision 4), and an update_trip_brief call. A save that fails none is fine. The examples are from set 1.

- **F1. Several notes in one memory item.** It holds more than one choice, wish, open item, or habit (decision 3). Example: dinner at 6:30 p.m. each night, plus leaving afternoons free (item 1).
- **F2. Memory repeats the itinerary.** It says what the itinerary holds, such as a stop, a rest day, or when something happens, and adds no reason or hard limit. A date passes only when it stays true if the plan moves (decision 2). Examples: "day X is a rest day" (item 2, mem_2m5ezyhn), "coffee at Cuban Coffee Queen" (item 4, mem_makeytbn), the landing and flight times (item 4, mem_nz4fa8fk and mem_enycekty), the Boulder café breakfast (item 10, mem_af8q24ty), the stargazing night's date (item 2, mem_y8yskyyh). Passes: "one day off in Albuquerque, to wander the neon on Central Avenue" (item 5, mem_hqays9gk), since it gives the reason and leaves the day open.
- **F3. Trip memory repeats the trip brief or user memory.** A trip memory item, or a part of one, says what a trip brief item or user memory already holds, and adds nothing to it. A repeat that's a needed part of a note that adds something passes, such as the ferry in the route plan (decision 6). One trip brief item repeating another is fine, and so is a habit in both user memory and the trip brief (decisions 1 and 6). It's judged against the trip brief as it stood when the save was made, so the Bar Harbor alumni event item (item 7, mem_xdwvj5e6) passes (decision 7). Examples: "scenic preferred" repeating the route preference (item 9, mem_ng52y7j6), "keep 8:30 starts" when the usual start time is 8:30 a.m. (set 2 item 2, mem_4gawx4hy). In that item, "they aren't early birds" passes: it's the reason given for Day 1's start, not a habit stated on its own, as "early morning person" is (F6).
- **F4. Saved to memory when it belongs in the trip brief.** What the user wants from the trip, such as a must-see or a meal preference, saved only to memory. Examples: the "must-sleep" item that should be a must-see (item 5, mem_3vhk9k97), hotel or quick breakfasts being fine on this trip, which belongs in the meal preferences (item 10, mem_af8q24ty).
- **F5. Saved to the trip brief when it belongs in memory or the itinerary.** A wish, or a plan choice, in a trip brief item. Examples: "maybe whale watching" in the must-sees, which is a wish for trip memory (item 7). From #209's Natick case, turn 3: "with a night in Buffalo" in the must-sees, a plan choice the itinerary holds as a stay, and the Berkshires night kept in the must-sees after the user said it's the first stop to cut, which makes it a wish (Joe, 2026-11-10). The must-see test from #209: leaving it out would make the trip a failure, once it's done. A wish is fine in the interests, such as "there's a Hemingway house, so maybe seeing that would be good" (set 2 item 8). Only its copy in the must-sees fails.
- **F6. Saved to the wrong memory.** A standing habit saved to trip memory, or a note for this trip only saved to user memory (decision 1). Example: "early morning person" in trip memory (item 4, mem_3zb2ht9y).

## 1. A standing habit can be in user memory and the trip brief, but not in trip memory

Settled 2026-11-10, in chat, from set 1 item 4 (the Florida trip, mem_3zb2ht9y).

User memory holds habits that apply to every trip. The trip brief holds what the user wants from this trip, and is filled in from user memory when a trip starts. So a habit in both is fine, such as "usually looking for coffee around 7" in the meal preferences, and "likes to eat dinner around 6 to 6:30" in user memory.

These fail:

- A standing habit saved to trip memory. "Early morning person" in mem_3zb2ht9y is about the user, not the trip, and user memory already has it.
- A note for this trip only saved to user memory, such as "wants one nice dinner in Portland".
- Trip memory that repeats the trip brief or user memory.

"Done for the day by 9 p.m. at the latest", in the same item, is fine in trip memory if it's for this trip only, and belongs in user memory if it's how the user always travels.

Out of scope: a habit that went only into the trip brief, and never into user memory. That's a missed save, and the evaluation doesn't grade what wasn't saved.

## 2. A date in memory has to stay true when the plan moves

Settled 2026-11-10, in chat, from set 1 items 1, 2, and 8.

A date can be in memory. The test: if the plan moved, would the item still be true? When it would, a new session can see the itinerary changed, and knows what to recheck. When it wouldn't, the item and the itinerary disagree, and a new session can't tell which is right. The itinerary holds when things happen, so a memory item doesn't say it again.

- Passes: "set the exact time from a tide table for August 19, 2027" (item 1, mem_f6rkbrp5). It says what the time was based on. If the tide pools move, that's still true, and it shows the time needs a new look.
- Passes: "plan to arrive there Friday afternoon, August 20" (item 1, mem_937uf5kr). It's what the user asked for. If the itinerary moves, the item still says what they want, and the two disagreeing is a real problem to raise with them.
- Passes: "agreed to fly home Sunday, January 31 (instead of Saturday) to fit a night at the Breakers in Palm Beach" (set 2 item 8, mem_nz4fa8fk). The user agreed to that date, so it's theirs, like the arrival date above.
- Passes: "Thursday, May 20: leave Natick around 10 a.m." (item 8, mem_3w2w5faq). The alumni event fixes that day, so it can't move. This matches the Bar Harbor dates case in #209.
- Fails: "the stargazing night in Torrey (now Wednesday night, October 13)" (item 2, mem_y8yskyyh). It says when the stargazing is, which is the itinerary's. If the night moves and the item isn't updated, the two disagree. Written to pass, it says what the moon check was based on, such as "checked the moon for Wednesday, October 13, the night stargazing was planned then".

## 3. One choice or wish per memory item

Settled 2026-11-10, in chat, from set 1 items 1 and 4.

Each memory item holds one thing: one choice, one wish, one open item, or one habit. Its reason and details stay with it.

Each of those can change or be forgotten on its own. When several share an item, changing one means rewriting the item, and the rewrite can squeeze the others to fit 300 characters and lose detail. Room isn't a reason to merge until memory is nearly full, since each memory holds 50 items.

- Fails: "Chose Sea Aire Oceanfront Inn in Cocoa Beach for the retro Right Stuff feel; the Titusville options felt too modern, so the Space Coast stay moved to Cocoa Beach. Chose Speakeasy Inn in Key West for its rum bar and character. Chose The Circle at the Breakers for the classic Breakers brunch." (item 4, added in the turn). It's three choices, so it should be three items. "The Titusville options felt too modern" stays with Sea Aire, since it's that choice's reason.
- Fails: dinner at 6:30 p.m. each night, and leaving afternoons free and relaxed, in one item (item 1, added in the turn).
- Fails: mem_3zb2ht9y (item 4), with four notes: done for the day by 9 p.m., an early morning person, not sure 2 nights in Miami is enough, and late January chosen to avoid crowds.
- The cost: mem_makeytbn (item 4) held the snorkel plan and the Dry Tortugas morning. An update in the turn trimmed it to fit, and "for flexibility" was lost. That was the user's reason for snorkeling from shore.

Why the app keeps memory as separate items, not one notebook per trip and per user: the user can forget a single item in the app (functional spec 10.5), an update can't damage the other items, and each save can be graded on its own. Joe kept this design on 2026-11-10, after weighing a notebook.

## 4. An update is graded like an add, and memory left stale isn't graded

Settled 2026-11-10, in chat, from set 1 items 4, 5, and 7.

An update is a save, so its new text is checked against every failure type, the same as an add's text. The text it replaced isn't graded, since an earlier turn wrote it. Example: the update to mem_makeytbn (item 4) wrote "coffee at Cuban Coffee Queen", a stop the itinerary already held, so it fails F2. It kept the snorkel plan and the Dry Tortugas morning in one item, so it fails F1 too.

An item left as it was after the plan absorbed it isn't graded, since nothing was saved. Examples: "Julia wants one nice dinner in Portland" once the dinner is planned (item 7, mem_3cntqap8), and where the trip ends once the itinerary shows it (item 5, mem_t8m6zzmt). Keeping memory up to date is a different behavior, in #288.

## ~~5. One trip brief item can repeat a general statement from another, but not a specific thing~~

Replaced by decision 6 on 2026-11-10.


Settled 2026-11-10, in chat, from set 1 item 1 and set 2 items 4, 5, and 8.

The user often says one thing that fits two trip brief items, and there's no clear line between some of them. "I'm a huge foodie person" fits the interests and the meal preferences, and so does "seafood sounds good". A general statement like that can be in both, and passes.

A specific thing in two trip brief items fails F3, since when the user changes their mind, one copy can be updated and the other missed.

- Fails: fish and chips in Astoria in both the must-sees and the meal preferences (set 1 item 1).
- Fails: "maybe the Hemingway house" in both the interests and the must-sees (set 2 item 8). The must-sees copy also fails F5.
- Passes: "I'm a huge foodie person" in both the interests and the meal preferences (set 2 item 4).

## 6. The trip brief's items can repeat each other, and what the user names can be a must-see

Settled 2026-11-10, in chat, from set 1 item 3 and set 2 items 4 and 8. It replaces decision 5.

What matters is that each thing goes to the right kind of place: the trip brief, trip memory, user memory, or the itinerary. Which trip brief item holds it matters much less. Many things fit two items, and even a person would have trouble putting them in one box. Requiring one would turn into chasing the right free text field. So one trip brief item repeating another never fails, general or specific.

- Passes: fish and chips in Astoria in both the must-sees and the meal preferences (set 1 item 3).
- Passes: breakfast in Port Townsend on the first day in both the must-sees and the meal preferences, and the night at a park lodge in both the must-sees and the lodging preferences (set 1 item 3). "We're happy to splurge on the park lodge" reads as definite, so it's a must-see too.
- Passes: "the Miami food scene is the thing I'm really most interested in" in both the must-sees and the meal preferences (set 2 item 4).
- Passes: "maybe the Hemingway house" in both the interests and the must-sees, as a repeat (set 2 item 8). The must-sees copy still fails F5, since a "maybe" isn't a must-see.

A route the user names, such as "starting with the Seattle–Bainbridge ferry rather than going through Tacoma" (set 1 item 3), can be a must-see. The user asked for it by name, and a named road is an anchor of the trip, as a must-see is. A plan choice the coordinator or the user makes about how the plan is built, such as "with a night in Buffalo" (#209's Natick case), still fails F5.

The route plan in trip memory (mem_6u7usug4) also names the ferry, and passes. It describes how the whole trip is routed, which the trip brief can't, and the ferry is a needed part of that.

## 7. The rubric's examples are made up, and trip memory is judged against the trip brief as it was when it was saved

Settled 2026-11-10, in chat.

The rubric's worked examples follow the patterns in this log, but use made-up trips, not quotes from the corpus. Sets 1 to 3 are the calibration set the labelers and the judge are checked against (set 3 since decision 9). If the rubric quoted those turns, a labeler could match Joe's labels by copying the rubric, and the check would show less than it seems. The real examples stay in this log and in `calibration.md`, which the labelers don't see.

Check 3 (F3) judges a trip memory save against the trip brief and user memory as they stood when the save was made, plus what earlier saves in the same turn set. Passes: the Bar Harbor alumni event item (mem_xdwvj5e6). It was saved in turn 1, and the event went into the must-sees in turn 2, so it repeated nothing when it was saved. What happens to it after that is memory going stale, which isn't graded (decision 4). A coordinator that copied each trip brief item into memory would still fail F3 each time, as "keep 8:30 starts" does.

## 8. The labelers see the user's words but not earlier tool calls, and a refused save isn't judged

Settled 2026-11-10, in chat, from Joe's review of the rubric.

The labelers and the judge get the trip as it stood before the turn, the earlier turns' user messages and replies, and the turn itself in full. The earlier turns' tool calls are left out, since the state before the turn already shows what they did. The user's words stay in, since the coordinator's text can hide a mistake. If the user says "maybe whale watching" and the must-sees get "whale watching", only the user's words show the wish. The earlier replies show what a short answer means, such as the user's "yes" when the Bar Harbor coordinator asked whether the dinner times hold for every trip.

A refused save saved nothing, so it isn't judged. The labelers and the judge don't see refused calls at all, saves or not, since none of them changed anything. When the coordinator tries again and the call goes through, that call is judged, so the same mistake isn't counted twice. Example: in set 1 item 4, the first update to mem_makeytbn was refused for length, and only the retry is labeled.

## 9. Set 3 joins the calibration set

Settled 2026-11-10, in chat, after the pilot labeling on rubric `34eee57`.

Opus and Sol labeled sets 1 to 3. Joe read every label on set 3, both labelers', and accepted the ones they agreed on. Where they split, he made the call. So set 3's labels are in `calibration.md` too, and the labelers are checked against Joe on all three sets.

## 10. F4 stays: a must-see saved only to memory fails, even early in a trip

Settled 2026-11-10, in chat, from set 3 item 2.

The Bar Harbor turn 1 item (mem_xdwvj5e6) saved the alumni event to trip memory while the must-sees were empty. The coordinator put the event in the must-sees in turn 2. Joe first wanted a memory save to pass whenever the trip brief didn't have the thing yet, since the coordinator may still be finding out what goes in the brief. That would leave nothing for F4 to check. He kept F4: without it, the coordinator could keep everything in memory and never fill the trip brief. So the item fails F4 in turn 1. Its dates still pass F2, as #209 says, and it still passes F3 (decision 7).

## 11. A road the user asked for by name belongs in the trip brief

Settled 2026-11-10, in chat, from set 1 item 9.

The user wrote "scenic, including highway 128 by dewey bridge on day 1." The coordinator saved the road only in the trip memory route note (mem_ng52y7j6). That fails F4. A named road can be a must-see (decision 6), so it's a must-see that's only in memory. The route note can still hold it. Check 4 now says so, since only check 5 said a named road counts. Any trip brief item can hold it, such as the focus, as decision 6 says. The first wording said the must-sees, and Sol then failed set 2 item 9, where Highway 1 is in the focus.

## 12. A planning rule in memory, and the part of a note that sets the scene, pass F2

Settled 2026-11-10, in chat, from set 1 item 1 and set 2 item 8.

"Dinner at 6:30 p.m. each night" (mem_2tsnydza) is a rule the plan is built from, not a copy of a stop. It stays true when the plan moves, and shows when the plan breaks it. So it passes F2, even when the itinerary's dinners are at 6:30. Only a note about one stop or one day fails.

"Flying home from Miami; agreed to fly home Sunday, January 31 (instead of Saturday) to fit a night at the Breakers" (mem_nz4fa8fk) is about the agreed date and its reason. "Flying home from Miami" repeats the itinerary's end place, but the rest of the note needs it. A part is judged on its own only when it's a separate note, as the coffee stop is next to the picnic open item in the rubric's Big Bend example.

## 13. The must-sees fail F5 on a fact, but not on a hedge the user settled

Settled 2026-11-10, in chat, from set 2 item 4.

"SpaceX is launching out of there now" was in the must-sees. The user had said "I know SpaceX is launching out of there now, so I don't know if that makes any big deal." It's a fact, not something to see or do, so it fails F5. Check 5 now names a fact as a third kind. Context that says why a must-see matters stays with it, such as Julia wanting to go back for a popover.

Key West and the Dry Tortugas pass. The user's "maybe even making it down to Key West" was about whether it would fit. Every plan the coordinator offered had 3 nights there, and the user picked one. A hedge about whether something fits stops being a wish once the user picks a plan that has it. "Maybe whale watching, if it's a thing at that time" (Bar Harbor) stays a wish, since no plan the user picked had one.

## 14. A fact and what it leads to are one thing, with or without a "so"

Settled 2026-11-10, in chat, from set 3 item 1.

"Staying with their friend Mike in Silver Lake at the end, and wants to be at Mike's by noon on Saturday, May 15. No lunch stop that day, and no other plane stops on the last day." (mem_5sud5c48) is one thing. The user said to skip the other plane stops because "we want to be at mikes by noon". The coordinator read "no lunch stop" from the same answer. Both would change with the arrival time. The test: if the first part changed, would the rest change with it?
