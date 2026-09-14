# Calls made for you

Non-pivotal decisions made without stopping, per the collaboration contract ("make your
best guess and proceed, period"). Newest first. Each entry: the question, the options, the
call, the reason. Reverse any of them by saying so.

## 2026-09-14 — Move It question queries

**Shared derivation copied into each question file, not views.** Six of the twelve
questions need the same location derivation (stage sequence, observed+asserted
deployments, build order by first-seen, holds, at-stage). Options: views in a `moveit`
schema; one file with all questions; copy the CTE block. Call: copy the block. Reason:
AppTrak has no views or procs anywhere, and rule 9 wants one file per question so a wrong
answer is fixed in one place without touching a table. The duplication is the cost; if
the block changes, it changes in six files — grep for `holds AS (`. Revisit if the board
needs them as views.

**The location rule was wrong and is now refined (rule 5).** Rule 4's "within the build's
own release" lost Sprint 42 from PROD the moment the hotfix replaced its build. Call: at
stage S iff a holding build was ever deployed at S and the build there now is not older
(first-seen) than it. Reason: carries work forward through later builds and drops it on
rollback with no lineage table; reverts stay explicit. Recorded in the spec.

**`contains` renamed `holds`.** `CONTAINS` is a T-SQL keyword. Cosmetic.

**Fixture additions to exercise empty answers.** Ready-to-approve, PROD-without-approval,
deployed-before-approval and skipped-a-stage all returned nothing from the original seed.
Call: two Team A releases at UAT (one ready, one blocked), release 4's approval removed,
the hotfix left as deployed-before-approval, two other approvals moved a day earlier so
the same-day timing is deliberate rather than accidental. Reason: fixtures are the
coverage; an empty result proves nothing.

**"Release started" = earliest of attributed builds and work items' first builds.** Lead
time and hotfix interleave first used attributed builds only, which said Sprint 43 began
on day 45 when its first work landed in DEV on day 30. Call: union both. Reason: the
sprint's real start is when its first work item hit DEV.

**Team A's app has no name anywhere.** Regime coverage shows NULL for application 4.
Call: leave it. Reason: the Application registry is open item 10; inventing a name column
in moveit would be a second registry.

## 2026-09-14 — Move It AppTrak artifacts

**Where the AppTrak SQL and seed live while AppTrak's repo is out of reach.**
Options: a folder here; wait for the repo; the scratchpad. Call: `apptrak/` at this repo's
root (`sql/`, `seed/`, runner). Reason: it has to be versioned and portable today; the
spec already says these move to AppTrak's repo when it is in reach (open item 11), and a
top-level folder makes that move a cut-and-paste.

**`ReleaseEvent.By` vs `CreatedBy`.** The ratified DDL had only `By`, described as "who
recorded it". Call: `[By]` = who did the act (approver, tester); `CreatedBy` = who recorded
the row, matching every other `moveit` table. Reason: the two are different people the
moment anyone but Robert approves anything, and the seed needed a demo marker that does not
overwrite the approver's name. Also `By` is a reserved word and is bracketed. Spec updated.

**Deploymentat when the payload has no deployment block.** `HealthReport.Deploymentat` is
NOT NULL, so half the real apps must be writing *something*. Unknown what. Call: the seed
writes `0001-01-01T00:00:00+00:00`. Reason: it is the type's minimum, cannot be mistaken
for a real deploy, and the backfill never reads it (rows with `Build IS NULL` are excluded
before the comparison). Confirm against real data with query C in
`history-deployment-episodes.sql`.

**Is `HealthReport.Stage` the registration's stage or the payload's?** Unknown without the
processor code. Call: the seed treats it as the payload's claim (endpoint 22 is registered
VAL and reports PROD), and `health.Deployment.ReportedStage` copies it. Reason: if it is
actually the registration's stage, the four-voice finding loses one voice but nothing else
changes; if it is the payload's, the fixture is right. Either way the registration stage is
reachable via `EndpointId`.

**Ping cadence in the seed.** Options: 10 minutes (real) or coarser to keep rows down.
Call: 10 minutes, 70 days, 13 endpoints, 131,040 rows; a setting at the top of the seed.
Reason: the backfill's cost profile should be tested at the real density, and SQL Server
handles it in seconds locally.

**Stage vocabularies for the two teams in the seed.** Call: Team B = DEV, VAL, PROD; Team A
= DEV, UAT, PROD; four stages org-wide, VAL and UAT peers at the same `Sort`. Reason:
matches what Robert described; the per-app stage list is whatever endpoints exist.

**ApplicationIds in the seed.** No Application registry exists in the database (open item
10). Call: plain integers 1-5 with the names carried on the endpoint and payload rows.
Reason: nothing else to reference; the registry's shape is unknown.

**Which app carries which rollback variant.** Call: WidgetCore PROD gets variant A (fresh
Deploymentat on redeploy), Reporting PROD gets variant B (original Deploymentat). Reason:
both must exist in the fixtures because real behaviour is unknown (hard constraint); the
rule catches both, and query B in the history file tells us which one is real.

**Seed marker columns.** Call: `HealthEndpoint.Tags = 'demo'`, `HealthReport.SessionId =
'demo-seed'`, `moveit.*.CreatedBy = 'demo-seed'`; fixed ids via `IDENTITY_INSERT`.
Reason: idempotent re-runs need a clean delete, and deterministic ids make the fixtures
citable in queries and docs.

**`SET QUOTED_IDENTIFIER ON` everywhere.** `HealthReport` refused a DELETE under sqlcmd's
default (off). Call: set it at the top of the seed and the backfill, and pass `-I` in the
runner. Reason: belt and braces; the real environment may run these from a different tool.
