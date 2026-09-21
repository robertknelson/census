# Move It — real-environment round, 2026-09-21

What changed since the last real run, what to do with it, and what to bring back. Design:
`features/move-it.md` §17–§19. Decisions made without you: `calls-made-for-you.md`. Nothing in
this round adds or alters a table; nothing needs `seed/`.

## What is in this round

| Change | Where | Real-side effect |
|---|---|---|
| Entry form keeps Name/Kind/Target on *Add another* | History | fixes your note 1 |
| **Delete release**, cascading (stabilization only) | release page, header | fixes note 2; deletes rows — see step 4 |
| `questions/13-feature-picture.sql` — one feature's whole picture as JSON | run in SSMS | note 3 |
| Stages filtered to those seen (a registered endpoint or an event names them) | every question, board lanes | note 4; may change 02/05/09/10/12 answers if your list has unused stages |
| **Division** tab — the executive's step lines | `/moveit/division` | new |
| Tab bar across the Move It pages | all | new |
| Board opens on features again; releases view at `?view=releases` | `/moveit` | — |

Two optional settings under `MoveIt` (defaults shown; leave them out to take the defaults):

```json
"ShippedDays": 14,
"StepCaptions": { "DEV": "developer testing", "VAL": "validation testing", "UAT": "user acceptance testing", "PROD": "live" }
```

## Steps

1. [ ] Get the code there as you did for §15/§16 and start the site. Open `/moveit/division`:
       it should load with the tab bar and the six numbers.
2. [ ] **Refresh the ledger first.** The processor has not shipped, so run
       `apptrak/sql/backfill-deployment.sql` (idempotent; it prints what it added). Note the
       row count and **how many minutes it took** (open item 15).
3. [ ] **Lanes.** On `/moveit`, note which stage lanes appear. Every stage your real list
       carries that no endpoint registers should be gone.
4. [ ] **Enter a few real releases on History** — three or four, from memory, recent first.
       On at least one release in VAL/UAT, record a `verified` event on its release page; on
       another, an `approved` event. Click *Add another* at least twice while filling one
       in (note 1). Create a throwaway release and **Delete** it (note 2); confirm it is gone
       from History.
5. [ ] **Division.** Look at it as an executive would. Specifically:
       - Does each release sit on the step you would put it on?
       - Does the release with `verified` show *waiting on the client*, and the one with
         `approved` show *signed off, going live*?
       - Is any release marked *went live with no client sign-off recorded*? Is that true?
       - Are the step captions the words your teams use?
       - Does it load fast enough? (Seconds, roughly.)
6. [ ] **Question 13.** Open `apptrak/sql/questions/13-feature-picture.sql` in SSMS, set
       `@WorkItemId` to one item you entered, run it, click the JSON. Then clear it and set
       `@Stage = N'DEV'`. Note the run time of the unfiltered run.
7. [ ] **Question 01 time.** Run `Invoke-AppTrakQuestions.ps1 -Only 01` (or 01 in SSMS) now
       that `moveit` has rows; note the seconds. Every page reads it.

## Bring back (from memory is fine)

1. Backfill: rows added, minutes.
2. Lanes left on the board; any stage you expected that vanished, or one that should have.
3. Notes 1 and 2 fixed on the real site? (yes/no)
4. Division: wrong steps, wrong words, wrong flags — anything an executive would misread.
5. Whether `verified` is a habit your teams can keep. If not, sign-off needs another source.
6. Seconds: Division load, 01, 13 unfiltered.
7. The 14-day "recently live" window: right, or a different number?
8. Your reaction. It decides the next round.
