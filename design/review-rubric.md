# Road Trip Planner: Review Rubric

This is the rubric for code review findings. The reviewer labels each finding with it, and the label decides whether the finding is fixed. It describes kinds of findings, not real cases, so findings can be labeled with it without pointing to them. How findings are posted and handled is in the code review design.

## 1. The labels

**Each finding gets one label: the first one in the table that fits.** A finding whose label hangs on a fact no one can check from the repo gets V1, and waits for that check. A finding whose claim is false, that only disagrees with the design, or whose work is handed to another issue gets a D label, and isn't posted. A D label fits only when it clearly fits, since no one sees the finding again. When you're unsure, treat it as not fitting, and keep going down the table. A finding is fixed when its label is F1 to F7. That's "the bar." A finding that would meet a fix rule, but doesn't meet its condition, gets the matching NF label, and is a note. Other findings below the bar get an N label, and are notes too.

| Label | Kind | Rule |
|---|---|---|
| V1 | Check | The label depends on a fact the reviewer can't check from the repo, and that fact decides whether it's a fix |
| D1 | Not posted | The claim about the code is false |
| D2 | Not posted | The code does what the design asks, and the finding would have it done another way |
| D3 | Not posted | The PR puts off work, and hands it to another issue that names the work |
| F1 | Fix | The PR doesn't do what its task says |
| F2 | Fix | The app does the wrong thing, crashes, or hangs, in normal use |
| F3 | Fix | Text a road trip agent reads says something false, in normal use |
| F4 | Fix | Data is lost or corrupted, in normal use |
| F5 | Fix | A security hole within the project's threat model |
| F6 | Fix | A design doc is wrong, so an agent building from it would build the wrong thing |
| F7 | Fix | A test is wrong |
| NF2 | Note | The app does the wrong thing, crashes, or hangs, but not in normal use |
| NF3 | Note | Text a road trip agent reads says something false, but not in normal use |
| NF4 | Note | Data is lost or corrupted, but not in normal use |
| NF5 | Note | A security hole outside the threat model |
| N1 | Note | Cleaner code |
| N2 | Note | A missing test |
| N3 | Note | Text a road trip agent reads is unclear, or says something twice, or is an error message with the wrong reason for a failure |
| N4 | Note | Advice about code that isn't written yet |
| N5 | Note | A code comment is wrong |
| N6 | Note | A design doc is unclear, or doesn't match the code, in a way no builder would act on |

F1, F6, and F7 have no NF label. Normal use doesn't apply to them.

## 2. Check first

**V1: the label depends on a fact the reviewer can't check from the repo, and that fact decides whether the finding is a fix.** For example, how an outside service answers a request the code hasn't sent before. The finding says what to check and how, such as the call to make. It's posted, and the fix loop leaves it alone until Joe has it checked and relabeled. V1 applies only when all of these hold:

- The fact is outside the repo, and nothing in the repo shows it.
- Settling it takes a real call or run that the reviewer can't make. If running code locally would settle it, the reviewer runs it.
- The answer decides whether it's a fix. A finding that's a note either way gets its note label.

## 3. Not posted

- **D1: the claim about the code is false.** For example, the finding describes a failure that the code's own checks make impossible. The failure has to be impossible with the code as it stands. A claim that's true only for an unlikely input, such as a setting no one would choose, isn't false, and gets an NF label. Neither is one that only code not yet written would prevent.
- **D2: the code does what the design asks, and the finding would have it done another way.** The design was agreed when the doc was written, so the finding is about the design, not the PR. Two things rule D2 out:
  - **The design has to be settled on the point.** When another issue covers it, such as with an open question, D2 doesn't fit, and the finding gets the next label that fits.
  - **The design's choice has to work for the user.** Before labeling a finding D2, say what the user would see if the code ran as designed. If that's wrong behavior in normal use, the label is F6 instead.
  - **The design has to speak to the point itself.** A general rule, such as a coding rule for all outside data, doesn't settle the specific case the finding raises. When the design does speak to the point, D2 comes before the NF labels, even when the harm is outside normal use.
- **D3: the PR puts off work, and hands it to another issue that names the work.** A code comment where the work belongs names the issue, such as "#123". The issue is open, and isn't the PR's own issue. Its description names this work, not just work near it. Nothing that works now breaks without the work. The reviewer reads that issue to check. D3 applies whether or not the task asked for the work, since the issue tracks it either way.

  **When no issue tracks the work,** task work is F1, since the PR doesn't do what its task asks. A test the task's "Done when" asks for is task work. Other work, such as a cleanup, gets its usual label. A code comment that puts it off doesn't change that.

## 4. Normal use

**Normal use is a trip a real user could plan, or a failure the code is meant to handle.** An outside service that doesn't answer in time is a failure the code is meant to handle. So is a plausible mistake by a road trip agent: a slip models make in practice, such as a wrong input name or the same ID twice. Normal use doesn't cover an unlikely input, such as one the model has no reason to produce, a setting no one would choose, or timing so narrow that two things running at once have to line up in a particular order.

**Code that's written but not called yet is judged as if it were called** the way the design says it will be.

## 5. Fix rules

**F1: the PR doesn't do what its task says.** The task is the issue's "Do" and "Done when" items, which the PR description copies (DEVELOPMENT.md section 7). When a "Do" item points to a design section, what that section asks for is part of the task. Something the task asks for that's missing, or done another way, meets F1, even when nothing breaks yet. Work handed to another issue is D3 instead.

**F2: the app does the wrong thing, crashes, or hangs, in normal use.** "Wrong" means different from what the design docs and the task say. Where they say nothing, it means different from what a user would plainly expect.

**F3: text a road trip agent reads says something false, in normal use.** The road trip agents are the app's own agents, such as the coordinator and its workers, not the agents that build or review the code. The text is tool descriptions, input schemas, what tools return, and error messages. An agent acts on them, so false text leads to wrong actions. The test is whether an agent that believes the text would do the wrong thing. For example, a tool description promises something the tool doesn't do. False text is a specific claim an agent could act on as a real answer. That covers a wrong time, day, or place. An error message that gives the wrong reason for a failure is N3, not F3. For example, "access denied" when the input was the problem, or "a response the app doesn't understand" when the service timed out. The agent knows the call failed, so it judges what to do next, such as trying again or asking the user.

**F4: data is lost or corrupted, in normal use.** Data the app saves, such as a trip or a memory, is lost, changed when it shouldn't be, or saved in a form that can't be loaded again. Lost means the information is gone, such as deleted, overwritten, or dropped on save. Corrupted means what's saved is wrong, such as a link to a stop that no longer exists, so the app can't use it until the stored data is repaired. A load that fails on stored data that's fine is F2, not F4.

**F5: a security hole within the project's threat model.** CLAUDE.md sets it: scanning bots and worms, not a targeted attack. It also covers the real secrets, such as the Claude token and the Google keys.

**F6: a design doc is wrong, so an agent building from it would build the wrong thing.** The doc contradicts itself, doesn't match the code, or leaves a gap a builder would have to guess at. Agents build later work from the design docs, so a wrong doc leads to wrong code later. A design choice that causes wrong behavior in normal use meets F6 too. A doc problem that no builder would act on is N6.

**F7: a test is wrong.** It can't catch a break in the very thing it targets. For example, it checks only that a list isn't empty, so a list with the wrong items passes. Or it fails when the code is right, such as a test that reads the real clock and breaks on a set date. A test that checks the real thing but misses a case or a path is N2, a missing test. So is one that checks the result but leaves one piece of it out, such as a check that compares every field of a loaded object except its name. It still fails when any other field is wrong. A wrong test gives false confidence, which is worse than having no test.

## 6. Notes

**Notes are below the bar.** This is a learning project. The fixes are there to make the code do what it should, not to tidy it.

- **NF2 to NF4: like F2 to F4, but not in normal use.**
- **NF5: a security hole outside the threat model.** It's a note, so Joe sees it and decides (CLAUDE.md).
- **N1: cleaner code.** That covers duplication, structure, speed, and code that can never run.
- **N2: a missing test.** The exception is the test that comes with a fix (code review design section 3.4). A test that exists but is wrong is F7.
- **N3: text a road trip agent reads is unclear, or says something twice, or is an error message with the wrong reason for a failure.**
- **N4: advice about code that isn't written yet.**
- **N5: a code comment is wrong.** The code is right next to it, so it misleads less than a wrong design doc does.
- **N6: a design doc is unclear, or doesn't match the code, in a way no builder would act on.** For example, another doc, or the task, already says how to build it.
