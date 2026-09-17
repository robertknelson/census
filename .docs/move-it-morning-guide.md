# Move It — morning guide: implement and test in the real environment

> **Run 2026-09-17.** The report, from memory, is `move-it.md` §12.1. One correction learned
> that morning: the real `core.SelectItem` already held `Stage` rows and 003's MERGE updated
> them, so the "no existing row changes" promise below did not hold. 003 is insert-only now
> (open item 14).
>
> Written 2026-09-14 for the next morning. Everything referenced is committed on `main`
> (`1db75bc`). Design and reasoning: `.docs/features/move-it.md`. Decisions made without you:
> `.docs/calls-made-for-you.md`. Tick the boxes; anything that surprises you goes in the
> report-back section at the end.

Ground rules for the day:

- **Nothing here touches an existing AppTrak table's shape or rows.** The DDL adds one table
  to `health`, a new `moveit` schema, and 17 lookup rows in `core.SelectItem`. The backfill
  only reads `HealthReport`. Every question is read-only.
- **Never run `seed/` against the real database.** It deletes rows marked demo and inserts
  fabricated ones. The runner for the real side is the questions runner, not the demo runner.
- **Run everything with `sqlcmd -I`** (or `SET QUOTED_IDENTIFIER ON`). `HealthReport` has
  indexes that refuse writes without it. The scripts set it themselves; the flag is belt
  and braces.
- Replace `REALSERVER` below with the real instance name.

---

## Part A — five-minute local sanity check (before leaving the house)

Confirms the tooling works where it was built.

- [ ] `cd C:\github\ai\census\apptrak`
- [ ] `.\Invoke-AppTrakDemo.ps1` — expect `moveit.Deployment: 39 inserted` and the row-count
      table ending in `core.SelectItem (moveit groupings)|17`.
- [ ] `.\Invoke-AppTrakQuestions.ps1 -Only 01` — expect 16 rows; Sprint 42 items at PROD,
      Sprint 43 at DEV, item 303 `with the devs`, item 801 `no evidence`.

If either fails, stop; nothing downstream is trustworthy.

---

## Part B — read-only reconnaissance on the real database (open item 1)

No writes. This answers the questions the fixtures could only guess at.

- [ ] Run the history query and keep all three result sets:

      ```
      sqlcmd -S REALSERVER -d AppTrak -E -I -W -s "|" -i sql\history-deployment-episodes.sql -o C:\temp\moveit-history.txt
      ```

- [ ] **Result A (episodes).** Look at one app you know well. Does each row read as a
      deployment you remember? Note anything odd: an episode of a few minutes (flapping?), a
      `Machine` you did not expect, a `ReportedStage` that differs from `RegisteredStage`.
- [ ] **Result B (rollback variant).** Any rows at all means the pipeline stamps a fresh
      `Deploymentat` on a redeploy (fixture variant A). Empty means either no build has ever
      redeployed, or `Deploymentat` is baked at build time (variant B). Both are handled;
      write down which.
- [ ] **Result C (coverage).** For endpoints with `WithoutBlock > 0`: what does
      `HealthReport.Deploymentat` hold on those rows? The seed assumed `0001-01-01`. Also:
      is `HealthReport.Stage` the registration's stage or the payload's? Check one endpoint
      whose two differ, if any exist. (Both are calls in `calls-made-for-you.md`; confirm
      or correct.)
- [ ] Quick size check, so the backfill's cost is known before running it:

      ```sql
      SELECT COUNT(*) AS Pings, MIN(StartAt) AS Oldest, COUNT(DISTINCT EndpointId) AS Endpoints
      FROM health.HealthReport WHERE Build IS NOT NULL;
      ```

---

## Part C — create the tables and backfill the ledger

Additive and idempotent; safe to re-run if interrupted.

- [ ] Take whatever backup you would take before any schema change. The DDL is additive, but
      the habit is the point.
- [ ] DDL and lookups, in order:

      ```
      sqlcmd -S REALSERVER -d AppTrak -E -I -b -i sql\001-create-deployment.sql
      sqlcmd -S REALSERVER -d AppTrak -E -I -b -i sql\002-create-moveit-schema.sql
      sqlcmd -S REALSERVER -d AppTrak -E -I -b -i sql\003-lookups.sql
      ```

- [ ] Confirm: `SELECT Grouping, COUNT(*) FROM core.SelectItem WHERE Grouping IN
      ('Stage','ReleaseKind','WorkItemKind','LinkKind','EventKind') GROUP BY Grouping;`
      expect Stage 4, ReleaseKind 2, WorkItemKind 2, LinkKind 2, EventKind 7.
- [ ] **If the real stage names are not exactly `DEV`, `VAL`, `UAT`, `PROD`** (case is
      ignored, spelling is not), fix the `Stage` rows in `003-lookups.sql` to match what
      `HealthEndpoint.Stage` actually holds, re-run 003, and note it for the report. Every
      question joins on those names.
- [ ] Backfill:

      ```
      sqlcmd -S REALSERVER -d AppTrak -E -I -b -i sql\backfill-deployment.sql
      ```

      It prints `moveit.Deployment: N inserted, N back-pointers refreshed`. On a large
      history this is one pass over `HealthReport` with a window function; minutes, not hours.
- [ ] Sanity, same checks the fixtures passed:

      ```sql
      -- one row per real deployment episode, roughly; compare against Result A
      SELECT EndpointId, COUNT(*) FROM moveit.Deployment GROUP BY EndpointId ORDER BY 1;
      -- every non-first row points at the row it superseded
      SELECT COUNT(*) AS Broken FROM moveit.Deployment d
      LEFT JOIN moveit.Deployment p ON p.Id = d.PreviousId
      WHERE d.PreviousId IS NOT NULL AND (p.SupersededAt <> d.DetectedAt OR p.EndpointId <> d.EndpointId);
      -- exactly one current row per endpoint that ever reported a block
      SELECT EndpointId, COUNT(*) FROM moveit.Deployment WHERE SupersededAt IS NULL GROUP BY EndpointId HAVING COUNT(*) <> 1;
      ```

      Expect `Broken = 0` and the third query empty.
- [ ] Run the backfill a second time. Expect `0 inserted, 0 back-pointers refreshed`.

---

## Part D — the first real board

`moveit` is empty, so anything about releases and work items is empty by design. Five
questions work from `health` alone and are useful today:

- [ ] `.\Invoke-AppTrakQuestions.ps1 -Server REALSERVER -Only 05` — the inbox. Every
      build at VAL/PROD is unattributed, so this is the full backlog of manifests to write.
      Count it. That number is the size of the backfill-by-hand job (open item 2).
- [ ] `-Only 06` — registration vs payload stage. **Anything here is a real finding today**:
      a release variable on the wrong slot or a friendly URL on the wrong box.
- [ ] `-Only 07` — servers disagreeing. Expect empty (one server per stage). If not empty,
      a partial deploy is happening or two endpoints are registered for one stage.
- [ ] `-Only 08` — rollbacks the ledger found in history, with the variant named. Compare
      against memory.
- [ ] `-Only 11` — regime coverage. The `pinged, no block` rows are the rollout tracker for
      the health regime; that list should shrink over the next three months.
- [ ] Run the full set once (`.\Invoke-AppTrakQuestions.ps1 -Server REALSERVER`) to confirm
      all twelve execute clean on real data. Empty results for 01–04, 09, 10, 12 are correct.

---

## Part E — the live processor change (your code, not in this repo)

The backfill is the rule; the processor implements the same rule at the moment a report
arrives. From `sql/backfill-deployment.sql`'s header:

1. Only a successful ping with content and a non-null `Build` counts. A failed ping, empty
   body, or a payload with no deployment block does nothing — no insert, no supersede.
2. Load the endpoint's most recent `moveit.Deployment` row (`SupersededAt IS NULL`).
3. Compare the whole tuple: `Build`, `BuildId`, `SourceVersion`, `Deploymentat`, `Machine`,
   `Branch`. Null-safe on the nullable ones.
4. Any difference, or no previous row: insert a new row with `DetectedAt = StartAt` of the
   report, `HealthReportId = the report's Id`, `PreviousId = the previous row's Id`, and set
   `SupersededAt = DetectedAt` on the previous row. Also write `Project` from the payload —
   the only field the backfill cannot supply.
5. No difference: do nothing.

Where to hook: immediately after the `HealthReport` row is inserted, in the same unit of
work if that is cheap; otherwise the same batch the fact-table slicer runs in.

- [ ] Implement.
- [ ] **The two-producer test**, which needs no deployment to happen: let the processor run
      live for a day, then run `backfill-deployment.sql` again. It must report
      `0 inserted`. If it inserts anything, the processor and the rule disagree; the rows it
      inserted show exactly where.

---

## Part F — first manual entries (optional, if there is time)

Pick one app you know, and its most recent release.

- [ ] `INSERT moveit.Release (ApplicationId, Name, Kind, TargetDate, CreatedBy)`; kind
      `featureset` or `hotfix`.
- [ ] One `moveit.WorkItem` per feature or fix you remember, `IncludedInBuild` = the build
      it first appeared in (copy the string from `moveit.Deployment`, verbatim).
- [ ] `moveit.ReleaseBuild` for the build that was promoted.
- [ ] `moveit.ReleaseEvent` kind `approved` with the build and the meeting date, if there was
      one.
- [ ] `-Only 01` and `-Only 02`. The release should show at the stage you know it is at. If
      it does not, the location rule has met something the fixtures did not; capture the
      rows from 01 and from `moveit.Deployment` for that app and bring them back.

---

## Report back — what to bring to the next session

Paste or summarize; all of it becomes open-item resolutions in `move-it.md`.

1. The three history result sets, or the `moveit-history.txt` file.
2. Rollback variant: A, B, or "no redeploy has ever happened".
3. What `Deploymentat` holds when there is no block; whether `HealthReport.Stage` is the
   registration's or the payload's.
4. Real stage names, if they differed from the lookups.
5. Backfill: rows inserted, minutes taken, `Broken` count, second-run result.
6. Anything in 06, 07, 08 that was news.
7. The inbox count from 05 — the manual backfill's size.
8. Whether the processor change shipped, and the two-producer result if it has run a day.
9. Open items 9, 10, 11 if you learned anything: repo read access, where the Application
   registry lives, whether AppTrak's repo is in reach.

If something broke: the exact `Msg` line from sqlcmd, the file, and what the database showed.
