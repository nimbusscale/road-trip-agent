# Saving evaluation: calibration labels (#209)

Joe's labels for sets 1 and 2, one line for each save in the turn. The failure types are in `decisions.md`. Set 1's labels are taken from Joe's free notes, written before the types existed. A label marked **(check)** is Claude's reading where the notes say nothing, waiting for Joe's call.

A refused call saved nothing, so it isn't labeled (decision 8).

## Set 1

**Item 1** · span `21571dea611b65f4` · Olympic Peninsula, turn 10
- add_memory_item mem_2tsnydza (trip): **F1**. Dinner at 6:30 p.m. each night, and leaving afternoons free, in one item.

**Item 2** · span `2870d8f5317f11a7` · Grand Junction to Salt Lake City, turn 30
- update_trip_brief (tripLengthInDays): fine.
- update_memory_item mem_y8yskyyh (trip): **F2**. "Now Wednesday night, October 13" says when the stargazing is (decision 2).

**Item 3** · span `b7ff6807ccc1bc8d` · Olympic Peninsula, turn 1
- update_trip_brief: fine. Fish and chips, the Port Townsend breakfast, and the park lodge are each in two trip brief items, which passes, and the ferry the user named can be a must-see (decision 6).
- add_memory_item mem_937uf5kr (trip): fine. The arrival date is what the user asked for (decision 2).
- add_memory_item mem_6u7usug4 (trip): fine. It names the ferry as part of the whole route plan (decision 6).

**Item 4** · span `2b2f3b957db47f44` · Florida, turn 8
- add_memory_item mem_sn5v5h3g (trip): **F1**. Three hotel choices in one item (decision 3).
- update_memory_item mem_makeytbn (trip), refused for length: not labeled.
- add_memory_item mem_85ru752z (trip): fine. Not a rejection, since the user only said it wasn't for them.
- update_memory_item mem_makeytbn (trip): **F1, F2**. The snorkel plan and the Dry Tortugas morning in one item, and "coffee at Cuban Coffee Queen" is in the itinerary (decision 4).

**Item 5** · span `0c2867c2dbd0a68e` · Route 66, turn 3
- update_trip_brief (tripLengthInDays): fine.
- add_memory_item mem_hqays9gk (trip): fine. It gives the reason, and leaves the day open.
- add_memory_item mem_3vhk9k97 (trip): **F4**. The Wigwam Motel night is a must-see, and is only in memory.

**Item 6** · span `54f1eb281e66224a` · Southern Utah, turn 3
- update_trip_brief: fine.

**Item 7** · span `e8ff5e9c4d6022a6` · Bar Harbor, turn 3
- add_memory_item mem_a3qynjxh (trip): fine.
- add_memory_item mem_3cntqap8 (trip): **F1**. The Portland dinner, the whale watch, and where they sleep mattering less, in one item.

**Item 8** · span `a524f4d65cf4c50d` · Bar Harbor, turn 12
- add_memory_item mem_6kfv9ybm (trip): fine. The itinerary can't say they'll take a rideshare and walk to dinner.

**Item 9** · span `557ea2a79f840f66` · Southern Utah, turn 4
- update_trip_brief (routePreference): fine.
- add_memory_item mem_ng52y7j6 (trip): **F3**. "Scenic preferred" repeats the route preference.

**Item 10** · span `ad9f7394eff95a80` · five-day trip, turn 8
- add_memory_item mem_af8q24ty (trip): **F2, F4**. Hotel or quick breakfasts being fine belongs in the meal preferences, and the Boulder café is in the itinerary.

## Set 2

**Item 1** · span `39d32f7cb8cf8d58` · Florida, turn 15
- update_trip_brief (mealPreferencesText): fine.
- update_memory_item mem_fhnbyya3 (trip): **F1, F2, F3**. Several notes in one item, Foxtail Coffee is in the itinerary, and "too much Cuban food" repeats the meal preferences the same turn changed.

**Item 2** · span `172d6164cd2432e2` · Route 66, turn 6
- add_memory_item mem_p6u4j4wb (user): fine. The user said "I always like dropping the bags first".
- add_memory_item mem_4gawx4hy (trip): **F1, F2, F3**. Several notes in one item, "Cozy Dog around 3" is the itinerary's (and already wrong), and "keep 8:30 starts" repeats the usual start time. The flight date passes, and "they aren't early birds" passes as the reason for Day 1's start.

**Item 3** · span `82aeeec52e039f23` · Utah, turn 19
- update_trip_brief (tripLengthInDays): fine.

**Item 4** · span `772393ced8a29db1` · Florida, turn 2
- update_trip_brief: fine. "I'm a huge foodie person" and "the Miami food scene" are each in two trip brief items, which passes (decision 6).
- add_memory_item mem_m8txatba (trip): **F1**. "Skipped St. Augustine on purpose" is a separate choice from the route plan.
- add_memory_item mem_3zb2ht9y (trip): **F1, F6**. Four notes in one item, and "early-morning person" is a habit for user memory.

**Item 5** · span `b9e01abc9362b54f` · Boston to the Hamptons, turn 8
- update_trip_brief: fine.

**Item 6** · span `1ad14f5d464fd514` · Grand Junction to Salt Lake City, turn 15
- add_memory_item mem_2m5ezyhn (trip): **F2**. It says the day is a rest day, which the itinerary holds, and gives no reason.

**Item 7** · span `d166ae54f4b36d18` · Bar Harbor, turn 4
- update_trip_brief (lodgingPreferencesText): fine.

**Item 8** · span `4fbac99ee7ebe9be` · Florida, turn 3
- update_trip_brief: **F5**. "Maybe the Hemingway house" is in the must-sees. Its copy in the interests is fine (decision 6).
- add_memory_item mem_smbe2mrx (user): fine.
- add_memory_item mem_nz4fa8fk (trip): fine. The user agreed to the January 31 date (decision 2).

**Item 9** · span `122a298ff08f51f3` · San Francisco to Los Angeles, turn 1
- update_trip_brief (focus): fine.
- add_memory_item mem_b7cr8aph (trip): fine.

**Item 10** · span `ae7339647f5362b1` · San Francisco to Los Angeles, turn 3
- update_trip_brief: fine.
