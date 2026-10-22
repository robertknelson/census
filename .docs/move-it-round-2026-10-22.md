# Move It — your morning's notes, 2026-10-22

Thirteen notes from your walk through Division and Releases, on branch `moveit-notes` (off
`main`, apart from the persona work). Each line: what you said, what was done.

## Division

| # | Note | Done |
|---|---|---|
| 1 | A release with no features: its PROD node wraps into the first column and shifts the row | The "No features or fixes recorded" line was one cell in a grid of six, so every cell after it slid one column. It now spans the row. Checked with an empty release added for the look, every release expanded; the one after it lines up. The original misalignment was not reproduced on screen before the fix — the cause was read from the code. |
| 2 | Features collapsed by default | Every release opens folded; the ▸ opens it. |
| 3 | A PROD node should have a due date, or "live since" | A release not yet live shows *due Nov 15* (or *was due Sep 1* when late, *no due date* when it has none) under its PROD step. A live one already said *live since*. |
| 4 | "Application {id}" for apps without health endpoints | Names now come from the application registry, `membership.Application.Name` (see 10). |
| 5 | "Pings watch 3 of 5" — plain English | The button reads **Tracked automatically: 3 of 5**. Opened: "3 of 5 applications report their own deployments: Census asks each one's health endpoint every few minutes and sees a new build arrive", then which ones move only when someone records it by hand, and which are not visible. |
| 6 | "Client sign-off" → "Signoff" | The step, the header's *waiting on signoff*, the *went live with no signoff recorded* flag, and the Releases pill *Live, no signoff*. |
| 7 | A details view for a single application | **New page, `/moveit/application/{id}`** — reached by clicking an application's name on Division. Division's step lines for its every release (no rail, no scope choice), then **Every release**: kind, where it is, target, approved on, live since, all yyyy-MM-dd. |

## Releases

| # | Note | Done |
|---|---|---|
| 8 | What does *Pieces* mean? TARGET as yyyy-MM-dd | *Pieces* is **Where its items are** — a bar with one segment per stage holding any of its items, as wide as how many; the header and the bar both say so on hover. TARGET is yyyy-MM-dd. |
| 9 | An APPROVED ON column | Added after Target, yyyy-MM-dd, sortable. |
| 10 | Application column shows the identifier; use `membership.Application.Name` | `board/applications.sql` names from the registry first, then the name the application reports, then the id. Every Move It page uses it. |
| 11 | "Built, not seen" → "Built, not deployed"? | **"Built, not yet seen deployed"** (the pushback you read): "not deployed" would claim what Census cannot know. Everywhere the words appear: the stage label, Features' pill and flag, the board's card. |
| 12 | KIND vs CONTENTS? | *Kind* is what the release was declared as (feature set or hotfix); *Contents*, now **What's in it**, is worked out from its items. Both say so on hover. The pair is how a hotfix carrying a feature shows. |
| 13 | Cells centred are hard to read; left-justify cells | Every register cell here is already left-justified (Releases, Features, the new application page). **Which table did you see centred?** — possibly an older build on the real server; this round brings it to the current one. |

## Your step on the real server

**One thing to check first:** `board/applications.sql` now reads `membership.Application`. It
must be in the same AppTrak database Census reads (you said it is). If it is not, every Move It
page fails to load, because every page asks for the applications.

```sql
SELECT TOP 5 Id, Identifier, Name FROM membership.Application ORDER BY Id;
```

Nothing to run otherwise: no schema change, no data change. Pull, restart, look.

## What to look for after

1. [ ] Division: every application by its registry name, no "Application 4".
2. [ ] Division: releases folded; a not-yet-live release says *due …* under PROD.
3. [ ] Division header: *Tracked automatically: n of m*, and the step reads *Signoff*.
4. [ ] Click an application's name → its own page, with *Every release* under the lines.
5. [ ] Releases: *What's in it*, *Where its items are*, Target and *Approved on* as yyyy-MM-dd.
6. [ ] A release with nothing in it, expanded on Division: the release below it lines up.
7. [ ] Note 13: point at the centred table if you still see one.

## Cost noticed

Releases is one column wider (*Approved on*); at 1500px it now scrolls sideways to reach Builds
and Flags. Say if a column should give way.

## Verification

`tests/Test-MoveItQuestions.ps1` after a full rebuild: **33 passed**. `Test-CurrentReleases`,
`Test-BoardLanes`, `Test-ReleaseHues`: 6, 7, 7 passed. Screenshots before and after (headless
Edge) of Division folded and fully expanded, the WidgetCore application page, Releases and
Features. The empty release used for note 1 was a temporary row, gone with the rebuild.
