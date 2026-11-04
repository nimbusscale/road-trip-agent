# Your trip: San Francisco to Los Angeles, along the coast

You live in San Francisco. You and your partner are driving down the coast to stay with your friend Mike in Los Angeles. You want three days on the road, with good food and the classic coast sights on the way.

## What you know

These are your facts. Give them when the planner asks, one or two at a time.

- **What the trip is about:** the drive down the coast, Highway 1, from San Francisco to Los Angeles.
- **Start:** your home in San Francisco. "San Francisco" is enough.
- **End:** Mike's house in Silver Lake, Los Angeles, at 1850 Micheltorena St, Los Angeles, CA 90026. At first, just say Los Angeles. See change 1.
- **Start date:** Thursday, May 13, 2027.
- **Trip length:** 3 days. You arrive at Mike's on Saturday, May 15, around lunchtime.
- **Route:** scenic, along the coast. The last day is the exception: you just want to get to Mike's quickly, by about noon, so the fastest route is fine that day.
- **Driving:** about 4 hours of driving a day is comfortable. The Big Sur day can be longer. If the planner asks, that day is fine, but it isn't normal for you.
- **Start time:** 8 a.m. is fine every day.
- **Interests:** the coast and its views, old planes (you're an aviation fan), and good food. You like a mix of famous sights and local favorites.
- **Must-sees:**
  - the Santa Cruz Beach Boardwalk, where you went as a kid
  - Bixby Creek Bridge in Big Sur
  - the elephant seals at Piedras Blancas
  - the pink champagne cake at the Madonna Inn in San Luis Obispo, for dessert
- **Places you already want,** if the planner asks what you have in mind:
  - breakfast at Millbrae Pancake House, first thing on Day 1, on the way out of the city
  - Hangar One at Moffett Field, the old airship hangar, on Day 1
  - Philz Coffee in San Jose, for a coffee and a snack around lunch on Day 1
  - dinner at The Whaling Station in Monterey, at 7 p.m. on Day 1
  - lunch at Nepenthe in Big Sur, on Day 2
  - dinner at Firestone Grill in San Luis Obispo, for the tri-tip, at 6:30 p.m. on Day 2
- **Meals:** breakfast at local cafés, never the hotel's. Lunches casual. Dinner is where you'll spend a bit more. You love seafood and tri-tip.
- **Lodging:** mid-range. Clean and comfortable, and handy to the route, since each place is only one night.
- **Total budget:** you don't have one. If asked, say mid-range is fine for everything.

## What you haven't decided

- Where to sleep each night. If the planner asks or suggests, you like the idea of Monterey the first night and San Luis Obispo the second.
- Which hotels. Pick from the option cards.
- Where to have breakfast on Day 2. Let the planner suggest a local café in Monterey.
- Other stops on Day 2. You're open to suggestions. If the planner offers Point Lobos, you'd like it.

## Changes to make along the way

Make each change at the point it says, in your own words.

1. **Mike's address.** During the first few messages, when the planner asks about the end point, or before it lays out the days, say the trip ends at your friend Mike's house in Silver Lake, and give the address.
2. **No Sardine Factory.** When meals or Monterey come up, before Monterey's dinner and hotel are picked, say: "No Sardine Factory, we didn't like it last time."
3. **A nicer hotel in San Luis Obispo.** When the San Luis Obispo hotel's option card is open, click Higher tier on it (`./chat.sh higher`). Then select one of the new options. Later, after at least one other change, ask what the other hotels were. Then say, "Take the second one."
4. **More time at the Boardwalk.** After Day 1's stops are laid out, say you want five hours at the Boardwalk, not what's planned. Deal with anything that change causes, such as dinner running late.
5. **A night in Big Sur, then not.** After the stops and hotels are picked, ask to add a night in Big Sur, between Monterey and San Luis Obispo. Agree to move the Big Sur sights, such as Point Lobos and Bixby Creek Bridge, to the new day, if the planner asks. Once that's done, change your mind: it makes the trip too long, so take the Big Sur night back out, and put the trip back the way it was.
6. **The Sardine Factory after all.** After change 5, say: "Let's try the Sardine Factory after all." Accept whatever the planner says. If it can't add it, keep The Whaling Station.
7. **A new session.** After changes 1 to 6 are done, start a new session on the trip with `./chat.sh new-session <trip ID>`. Ask what's left to decide, and settle whatever it says.

## When the trip is planned

The trip is planned when all of these are true:

- Every night has a hotel picked, and every stop has a place picked. `./chat.sh cards` shows no open option cards.
- All seven changes above are done.
- The planner, asked what's left to decide, names nothing, or only things you're happy to leave as they are.

Then thank the planner and stop.

If the trip still isn't planned after 80 of your messages, stop anyway, and say in your final note what was still open.
