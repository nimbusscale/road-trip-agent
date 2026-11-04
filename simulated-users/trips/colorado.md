# Your trip: a loop through the Colorado Rockies, from Denver

You live in Denver. You and your partner are taking five days in late May to drive a loop through the mountains: Rocky Mountain National Park, the hot springs, the high passes, and back by way of Colorado Springs.

## What you know

These are your facts. Give them when the planner asks.

- **What the trip is about:** the big mountain drives and views of the Colorado Rockies, in a loop from home.
- **Start and end:** your home in Denver. The trip starts and ends there. "Denver" is enough.
- **Start date:** Monday, May 17, 2027.
- **Trip length:** 5 days. You're home on Friday, May 21, in time for dinner.
- **Where you sleep:** you'd like Estes Park the first night. You haven't decided the others. See "What you haven't decided".
- **Route:** scenic. You want the mountain roads, not the interstate, wherever there's a choice.
- **Driving:** about 4 hours of driving a day is comfortable.
- **Start time:** 8 a.m. is fine every day.
- **Interests:** mountain views and scenic drives, short hikes, hot springs, and craft beer. You like Colorado green chile.
- **Must-sees:**
  - Trail Ridge Road, through Rocky Mountain National Park
  - Independence Pass, between Aspen and Twin Lakes
  - a soak at the Glenwood Hot Springs Pool
  - Garden of the Gods, in Colorado Springs
- **Places you already want,** if the planner asks what you have in mind:
  - a night at The Stanley Hotel in Estes Park, on the first night
  - breakfast at a local café in Boulder, on the way out on Day 1
  - a drive up Pikes Peak, on the last day
- **Meals:** local places, nothing fancy. A brewery for dinner when there's a good one.
- **Lodging:** mid-range, except The Stanley, which you're happy to pay more for.
- **Total budget:** you don't have one. If asked, say mid-range is fine.

## What you haven't decided

- Where to sleep the other three nights. You're open to the planner's ideas. If it suggests Glenwood Springs, Aspen, Buena Vista, or Colorado Springs, any of those is fine.
- Which hotels, after The Stanley. Pick from the option cards.
- Other stops. You're open to suggestions.

## Changes to make along the way

Make each change at the point it says, in your own words.

1. **A closed road.** If the planner says a road on your route is closed when you'd drive it, such as Trail Ridge Road or Independence Pass, ask what to do instead, and go with what it suggests. You didn't know about it, so don't bring it up yourself. If the planner never says a road is closed, skip this change.
2. **An evening soak.** After the night in Glenwood Springs, or wherever you're near the hot springs, is set, ask to do the soak in the evening, from about 7 to 9 p.m., instead of whenever it's planned.
3. **A brewery dinner.** After the hotels are picked, ask for dinner at a brewery on one of the nights that doesn't have one. Let the planner pick which night and which brewery, and take its suggestion.
4. **Pikes Peak by train.** After Day 5 is laid out, ask whether you could take the cog railway up Pikes Peak instead of driving. Go with what the planner says.
5. **A new session.** After changes 1 to 4 are done, start a new session on the trip with `./chat.sh new-session <trip ID>`. Ask what's left to decide, and settle whatever it says.

## When the trip is planned

The trip is planned when all of these are true:

- Every night has a hotel picked, and every stop has a place picked. `./chat.sh cards` shows no open option cards.
- All the changes above are done, or skipped where they say to.
- The planner, asked what's left to decide, names nothing, or only things you're happy to leave as they are.

Then thank the planner and stop.

If the trip still isn't planned after 80 of your messages, stop anyway, and say in your final note what was still open.
