# Personas — who looks, what they see, what they may change

> Spec 2026-10-22, from Robert's morning over Census and Move It: *"what we have built so far
> is a lot of overlap … we need to focus on the Personas that will need to see/interact with
> Census, MoveIT, and Atlas."* Position taken in conversation the same day; his answers to the
> mapping questions are folded in (§3, §12). Status: **P-1 to P-4 built 2026-10-22** on branch `personas` (§10, §13):
> the shell, the period view (§5.1), Needs you with its actions (§5.2, §5.4), the drill-downs
> (§5.3), and links out to the existing pages (§8). The *Associations / Releases / Feature sets /
> Events* items are still placeholders. His typed notes
> from the morning are still to come and get sorted against this frame (§12, P1).

## 1. The question

Census classic, the Estate, Atlas and Move It's tabs overlap: several surfaces answer the same
question for nobody in particular. The re-imagining starts from who reads them. Each persona
has different interests; one of them maintains everything that is not pure observation.

## 2. Position

- **Two products, not four.** One family of read views turned by two dials, plus one curation
  surface. Personas are positions on the dials, not separate apps:
  - **grain**: fiscal year, quarter, month, week;
  - **scope**: every application, or a set of them.
  Designing four persona views would grow four things that drift.
- **Views are current.** No digests, no "since you last looked" push (his ruling).
- **Questions before views.** Each read view answers a named question a persona asks; a view
  that answers none is cut (§5).
- **Curation is driven by gaps.** The Sys Admin's home is a queue of what needs him (unlinked
  builds, releases with no feature set, missing approvals, suspect associations). Fixing happens
  where the wrongness shows, as the Atlas inspector's layer tag already does; no back-office
  editor. Observe → human-tag → view holds.
- **Curation coverage is visible.** A summary says how much of it is observed, curated and
  missing. Show the gap, never fill it.
- **Personas assign the overlap.** Every existing surface gets an owning persona (§8); one no
  persona claims is a candidate to cut or merge.
- **Side by side.** The persona UX is built as new routes in `Census.Web`, beside `/classic`
  and `/estate` (`ux-toggle.md`). Nothing existing changes.

## 3. The regime we plug into — AppTrak `membership`

The membership schema in AppTrak is the source of who holds which role (Robert, 2026-10-22:
"the correct schema to use"). The vital table:

| Table | Columns | Refers to |
|---|---|---|
| `membership.MemberApplicationRole` | MemberId, ApplicationId, RoleId | `membership.Member`, `membership.Application`, `core.SelectItem` (role) |
| `membership.Member` | Id, Identifier, WindowsIdentity, FirstName, LastName, Email | |
| `membership.Application` | Id, Identifier, Name, Tags, Disposition, ApplicationTypeId, Settings | |

Roles are the `core.SelectItem` list `member-types`, exactly: application-owner, product-owner,
business-stakeholder, application-administrator, system-administrator, technical-lead,
devops-lead, observer — plus **Executive**, added to the real database's list (not yet local).

`moveit.*.ApplicationId` is `membership.Application.Id` (confirmed). That closes `move-it.md`
open item 10: `membership.Application` is the application registry.

Census reads this schema; it never writes it. Membership is maintained where it lives.

## 4. Personas and their roles

**A role held on the Census application is estate-wide; a role held on any other application
is scoped to it.** Census is registered as a `membership.Application` like any other; its
members are its users. That gives the two cross-cutting personas a home without a new table.

| Persona | Role | Held on | Sees | May change |
|---|---|---|---|---|
| Sys Admin | system-administrator | Census | everything | everything not pure observation: associations, releases, feature sets in releases, events (approvals …) |
| Executive | executive | Census | all applications; fiscal year, quarter, month, week | nothing |
| Product / Application Owner | product-owner, application-owner | each of theirs | the Executive views, trimmed to their applications | nothing |
| Tech Lead | technical-lead, devops-lead | each of theirs | quarter, month, week; drill into deployments and builds | nothing |
| Application Administrator | application-administrator | each of theirs | the Tech Lead's views for those applications | curation for those applications only — delegated Sys Admin work (his "yes") |
| Viewer | observer | — | view only | nothing — **later** (his ruling: not yet used) |

A member may hold several roles across applications (product owner of A, tech lead on B); they
see the union, each application at the depth its role allows.

**The change-review persona** (someone who reads the approvals and events record after the
fact — compliance, a change board) is a real activity with no role yet. Parked (§12, P3).

## 5. The Executive's questions

To be written from his notes. The shape, as proposed in conversation:

- What shipped this period?
- What is stuck, and where?
- What is coming next period?
- Which applications carry the most change?
- How does this period compare with the last?

Period comparison likely matters more than any single period. The fiscal year's first month is
a setting.

### 5.1 The period view (P-3a, built before his notes — a draft for them to correct)

The four *See* items are one view at four grains: a fiscal year, a fiscal quarter, a calendar
month, a Monday-start week. `‹ ›` step a period; *This …* returns to today's. The period rides in
the URL as `on=` (any day inside it). Every number is for the applications on which that grain's
feature is on for the member (§4) — Max's *Year* is MortgageGateway, his *Quarter* both.

| Part | Answers | From |
|---|---|---|
| Tiles: Shipped, Moves, To production, Approvals, Rollbacks — each with the period before | *How does this period compare with the last?* | 09, calendar |
| Shipped — release, application, the day first live, days from first build; *left production since* when it is no longer in PROD | *What shipped?* | 09 (`FirstProd`), 02 |
| Where the change landed — builds arriving at any stage per application, busiest first; PROD arrivals beside | *Which applications carry the most change?* | calendar `arrived` |
| Due this period and next — releases not live with a target date in either, *past target* flagged | *What is coming?* | 02 |
| Stuck today — on hold (with the reason) or past target; only in the period holding today | *What is stuck, and where?* | 02 |
| A line under it all: how many of the period's moves belong to a release, and how many are not yet claimed | curation coverage (§2) | calendar |

Fiscal years are named by the year they end in (`FY27` starts 1 Oct 2026 when the setting is
10); with the default, January, they are plain calendar years. `Personas:FiscalYearStartMonth`.


**His Move It notes carried here (2026-10-22, `move-it-round-2026-10-22.md`).** Every day the
persona pages print is yyyy-MM-dd (periods too: *2026-08-01 – 2026-08-31*, *Week of
2026-10-19*); a shipped release says when it was approved, or *no approval recorded*; table cells
are left-justified, headers may centre; *signoff*, one word. Application names were already the
registry's.

### 5.2 Needs you (P-3b) — the curator's home

`curate.queue`: every gap waiting on a human word, for the applications the member curates
(Sam: all five; Ada: Your WebApp only). Nothing stored, nothing dismissed — a line goes when the
entry it asks for is made. History's own rules (`moveit/needs-a-word.mjs`, `findNeeds`) are used
as they are, so the queue and History's *Needs a word* never disagree; the queue adds what History
does not ask.

| Section | A line when | From |
|---|---|---|
| Builds nobody has named | a build seen past DEV that no release claims — one line per build | history (05's rule) |
| Releases waiting on a word | past target with no hold; at a stage longer than `MoveIt:StaleDays` with nothing recorded; live with no approval | `findNeeds` |
| Releases with nothing in them | 02 says `empty`, not abandoned | 02 |
| Heard about, still in no release | an item heard longer than `MoveIt:ComingDays` ago | `findNeeds` |
| Ahead of what it depends on | a *current* order violation | 03 |
| A stage that disagrees | an endpoint reporting a stage other than its registration | 06 |
| Ready for the client | 04: ready (record the approval) or blocked (by what) | 04 |

Each line links to the Move It page where it is fixed.

### 5.3 Deployments and Builds (P-3c) — the Tech Lead's drill-down

Same period steps as §5.1, with a choice of grain among those the member holds **on the
applications the drill-down covers** (Max drills Reporting only, as its tech lead, so no *Year*).
*Deployments*: every build arriving at a stage and every older build put back, newest first,
grouped by day — application, stage, build, and the release that claims it (linked) or
*unclaimed*; a rollback row says which build it replaced. *Builds*: each build first seen in the
period — first and last seen, the stages it reached in stage order, the releases that claim it
(named by id from 02) or *unclaimed*. From the calendar and `builds-seen`.

### 5.4 Settling a line in place (P-3d)

A queue line carries the action that settles it, shown only when the member holds that action's
feature on the line's application:

| Action | On | Writes (Move It's own endpoints) | Feature |
|---|---|---|---|
| Claim for a release | an unnamed build — pick one of its application's releases (not abandoned) | `claim-build` | `curate.associations` |
| Record the approval | live with no approval; ready for the client | `event` — `approved`, stage = the top stage | `curate.events` |
| Put on hold | past target with no hold; quiet too long | `event` — `hold`, the reason as the note (required) | `curate.events` |

The action opens a small form under its line; *By* is the member's identifier. On save the queue is
asked again, so a settled line simply goes. Information lines (order, stage, heard, empty, blocked)
carry no action — they are settled where they link.

## 6. Feature management — what is adopted now

The vocabulary of FM2280 (`C:\github\ai\fm2280\.docs\features\feature-access.md`), not its
machinery:

- **A feature is a view or an action**, named `^[a-z0-9]+([.-][a-z0-9]+)*$`. On for a member
  when its switch is on and the member holds one of its granted roles. Unknown names are off.
- **Role identifiers are the groups features are granted to** (FM2280 D2), as Targeting groups
  under Microsoft.FeatureManagement, read from JSON config — Census's storage is JSON config
  already, and the config provider is native. Moving to FM2280's SQL store later swaps the
  definition provider; consumers do not change.
- **Two questions, two answers, kept apart.**
  - *May this member use this view or action?* — features, from the member's role identifiers.
  - *Which applications does this member see?* — the ApplicationIds of their
    `MemberApplicationRole` rows; any role on Census means all of them.
  A per-application feature would grow the catalog by the estate; scope is never a feature.
- **The sidebar is trimmed by features.** One nav declaration where each item names its
  feature — not xf-dashboard's per-link `@if` blocks.
- **Edit affordances are features too** (`curate.*`), so they vanish for read personas.

**When the SQL store comes, it lives in AppTrak under the `fm` schema** — FM2280's name, not
xf-dashboard's `dashboard` (Robert, 2026-10-22).

**Not adopted now:** Windows authentication, the `fm` SQL schema and audit, the admin matrix,
`[FeatureGate]` on endpoints, the shell host (`fm2280/.docs/features/shell-host-adoption.md`).
Census has no identity today and this environment holds manufactured data only; a gate here
would guard nothing and only show as 403s during comparison. When the real environment needs
it: deny by default, and a test that every endpoint is gated from day one — xf-dashboard's
open item #8 is ~20 controllers that slipped through without one.

## 7. View as

A **member switcher** in the persona UX picks a `membership.Member` and renders the UX as that
member sees it — features and scope both. It is the comparison tool for this work and the
stand-in for identity until there is identity. In the real environment the same lookup runs
from `Member.WindowsIdentity`.

Locally the membership tables are empty: a **manufactured seed** gives one member per persona,
plus a mixed member (product owner on one application, tech lead on another), Census registered
as an application, and the Executive role.

**The shell (P-2), `/personas`.** Its own page (no `_Layout`, no v1/v2 switch), its own
`personas.css` and `wwwroot/js/personas/`. A dark top line carries *View as* (every member,
with their roles); the left nav is `persona-nav.mjs`'s one declaration trimmed to the member's
features. **Overview** names the member's grants (and *estate-wide* when a role is held on
Census) and draws an application × feature matrix — the comparison at a glance: each row the
role held there (or *via Census*), a dot where the feature is on. A nav item shows its feature,
the applications it is on for (the mixed member's *Year* is MortgageGateway only, *Deployments*
Reporting only), and a placeholder until P-3. A member with nothing granted gets a sentence,
not an empty frame. Member and item live in the URL (`?as=demo-max&at=drill.deployments`);
the last member is remembered per browser. An item the new member lacks falls back to
Overview. Under 720px the nav becomes wrapped rows above the page and the matrix scrolls
inside its card.

## 8. Existing surfaces by persona (first guess, for his notes to correct)

| Surface | Owner |
|---|---|
| Move It (Division, Features, Releases, Calendar, Release) | Executive, Product Owner, Tech Lead |
| Atlas | Tech Lead, Sys Admin |
| Estate (Changes, Software, Hosting, Certificates, Triage, editors) | Tech Lead, Sys Admin |
| Day | Tech Lead, Sys Admin |
| Census classic | — (candidate to retire) |

**Built (P-4).** The nav's last group, *Elsewhere in Census*, links out to Move It (Division),
Atlas, Estate and Day, each item behind a `surface.*` feature granted per the table above — Move
It to every reading role, the machine pages to technical-lead, devops-lead,
application-administrator and system-administrator. Classic has no feature and no item. The
links leave the persona UX: those pages show every application, not the member's (P10). The
overview's matrix leaves the links out; it is about views.

## 9. Not doing

- Digests or pushed summaries (views are current).
- Gating, authentication, SQL feature store (§6).
- Writing to `membership` from Census.
- Changing any existing route, page or module.

## 10. Slices

| Slice | Scope | Verified by |
|---|---|---|
| P-1 | Manufactured membership seed; Executive role locally; member → roles → features + scope, read from AppTrak; feature grants in JSON config. | A test per seeded member: features on/off and application scope as §4 says. |
| P-2 | Persona UX shell beside the existing routes: member switcher, feature-trimmed sidebar. | Screenshot per persona; a mixed member sees the union. |
| P-3a | The period view (§5.1) for the four *See* items. | `tests/Test-Period.mjs`; screenshots. |
| P-3b | Needs you (§5.2). | `tests/Test-NeedsQueue.mjs`; screenshots. |
| P-3c | Deployments and Builds (§5.3). | `tests/Test-Drill.mjs`; screenshots. |
| P-3d | Actions on queue lines (§5.4). | `tests/Test-NeedsQueue.mjs`; a claim clicked through in a browser. |
| P-4 | Links out to the existing pages (§8). | `tests/Test-PersonaNav.mjs`, `tests/Test-Personas.ps1`; screenshots. |
| next | Associations, Releases, Feature sets, Events as their own pages; §5.1 reshaped by his notes. | Per view. |

## 11. API

| Endpoint | Answers |
|---|---|
| `GET /api/personas/members` | Every member: identifier, name, Windows identity, grants (role, application). |
| `GET /api/personas/members/{identifier}` | One member's access: `estate` (holds a role on Census), `estateRoles`, `estateFeatures`, `features` (the union), and `applications` — each with its own roles and its features (estate roles' plus its own). 404 for an unknown member. |

| `GET /api/personas/lead-time` | Question 09 verbatim (the period view's *shipped*). |
| `GET /api/personas/order-violations` | Question 03 verbatim (Needs you). |
| `GET /api/personas/stage-mismatch` | Question 06 verbatim (Needs you). |

All 404 when `MoveIt:ConnectionString` is absent (the Demo profile), as Move It does. The views
otherwise read Move It's own read endpoints, and the actions post to Move It's own writes; Move
It's controller is untouched.

**Pieces.** `apptrak/sql/membership/members.sql` and `applications.sql` (read-only, run by
`MoveItQuestions`); `Services/MemberAccess.cs`; `Controllers/Api/PersonasController.cs`;
`Options/PersonasOptions.cs` (`Personas:EstateApplication`, `Personas:FeaturesConfigPath`);
`config/features.json` in Microsoft's feature-flag schema, `Microsoft.Targeting` filters whose
groups are role identifiers, matched case-insensitively; package Microsoft.FeatureManagement
4.2.1 (FM2280's version, so code ports). A member is addressed by `Identifier`, never by `Id`.

**The provisional catalog** (`config/features.json`), to be reshaped by the views:

| Feature | Granted to |
|---|---|
| `view.year` | executive, product-owner, application-owner, system-administrator |
| `view.quarter`, `view.month`, `view.week` | those, plus technical-lead, devops-lead, application-administrator |
| `drill.deployments`, `drill.builds` | technical-lead, devops-lead, application-administrator, system-administrator |
| `curate.queue`, `curate.associations`, `curate.releases`, `curate.feature-sets`, `curate.events` | application-administrator, system-administrator |

| `surface.moveit` | every reading role: executive, product-owner, application-owner, technical-lead, devops-lead, application-administrator, system-administrator |
| `surface.atlas`, `surface.estate`, `surface.day` | technical-lead, devops-lead, application-administrator, system-administrator |

observer is granted nothing (§4: later). system-administrator is granted each feature by name;
it is not a superset (FM2280's rule).

## 12. Open items

| # | Question | Needed to resolve |
|---|---|---|
| P1 | His notes from the 2026-10-22 morning — sort each against §2, §4 and §8. | His notes. |
| P2 | The Executive role's exact `Identifier` in the real `core.SelectItem` (assumed `executive`). | Robert, from the real database. |
| P3 | The change-review persona: which role, if any; is it the Executive asking a different question? | Robert. |
| P4 | The Executive's questions (§5). | His notes. |
| P5 | Fiscal year's first month. | A setting; the value from Robert. |
| P6 | Census's own `membership.Application` row in the real database: does it exist, and its Identifier (assumed `census`, a setting). | Robert, from the real database. |
| P8 | An application with no health regime (MortgageGateway in the fixtures) has *asserted* deployments only. They count as **shipped** (09 takes asserted PROD) but not as **moves**, which are observed arrivals — so its row is missing from *Where the change landed*. Count asserted moves too, marked, or leave the bar as "what we saw"? | Robert. |
| P9 | A claim made from Needs you is recorded with Move It's configured *By* (`demo-board` locally), not the member: Move It's claim path takes its By from config. Events do carry the member. Pass the member through the claim path too? It changes Move It's write. | Robert. |
| P10 | The links out (§8) open pages that show every application; a Product Owner following *Move It* leaves their scope. Scope those pages by member, or leave them as the wide view? | Robert. |
| P11 | A rollback on an application with two PROD servers shows as two rows on the same day in *Deployments* (one per endpoint; the calendar has no machine). Fold them, or add the machine? | Robert. |
| P7 | The local applications 2 and 3 are hand-made rows (My WebApp, Your WebApp) while Move It's fixtures call them WidgetPortal and LedgerService. The seed leaves them alone. Should it own them? | Robert's word. |

## 13. Verification log

**2026-10-22, P-1.** `tests/Test-Personas.ps1` against Census.Web on the Development profile
(5292), membership reseeded: **18 passed, 0 failed** — Sys Admin and Executive estate-wide over
the five applications (Census not among them); Product Owner and Tech Lead scoped to two each at
their depth; Application Administrator curating one; the mixed member at product-owner depth on
one application and tech-lead depth on the other, union member-wide; observer and the role-less
member with no features; unknown member 404. `tests/Test-MoveItQuestions.ps1` after the full
rebuild (which now runs the membership seed): **33 passed, 0 failed**. Demo profile boots;
the persona API is 404 there.

**2026-10-22, P-2.** `node tests/Test-PersonaNav.mjs`: **11 passed** — every nav item names a
catalog feature and every catalog feature has an item; Executive keeps *See* only, Tech Lead
loses *Year* and keeps *Drill into*; nothing granted leaves no groups; the mixed member's items
each name the right applications. Headless Edge screenshots at 1400px of every seeded member
(Sam, Ellen, Paula, Terry, Ada, Max on Overview, *Year* and *Deployments*, Otto) agree with §4;
at 390px (inside a 390px frame — headless Edge will not size a window that narrow) Sam's and
Max's pages fit with no page scroll, the matrix scrolling in its card. The switcher's change
event and nav clicks were not clicked in a browser; each state was loaded by URL, which is the
same render path.

**2026-10-22, P-3a.** `node tests/Test-Period.mjs`: **24 passed** — calendar and fiscal years
(FY named by its end year, the day before it in the year before), fiscal Q1, months, Monday weeks
and a Sunday, stepping across a year and a month end; and the summary: shipped is first PROD
inside the period and in scope, *left production since*, the period before, moves/PROD/rollbacks/
approvals counted apart, claimed moves, busiest application first, due this and next, stuck only
in the period holding today, an empty month. Screenshots against the demo ledger: Ellen's Q3 2026
(7 shipped, 22 moves, 6 to PROD, 6 approvals, 3 rollbacks; 18 of 22 moves claimed), her Year; Max's
August (two applications, MortgageGateway's asserted ship counted, P8); Terry's Q4 2026, the
current quarter — empty, with Sprint 43 under *Stuck today* with its hold reason. At 390px
(framed) the tiles run two across and the columns stack. `‹ ›` were exercised by URL (`on=`),
not clicked.

**2026-10-22, P-3b to P-4.** `node tests/Test-NeedsQueue.mjs` **22 passed** (each section's
rule, scope, the per-build inbox and its claim choices, which lines offer which action, actions
by feature per application, and the exact request each action posts); `Test-Drill.mjs` **7**;
`Test-PersonaNav.mjs` **13** (the links-out group, href only there); `Test-Period.mjs` **24**;
`Test-Personas.ps1` **18** (expectations now include `surface.*`). Screenshots: Sam's queue (13
lines across the seven sections, actions on the settle-able ones), Ada's (one line, Your
WebApp, *Put on hold*), Terry's August deployments (10, the two-server rollback on 30 Aug), Max's
Q3 builds (Reporting only, grains without *Year*), Terry's overview with the four links out;
phone width for Sam's queue and Terry's deployments. **A claim was clicked through in headless
Edge** (a throwaway harness driving the page in a frame): *Claim for a release*, the form offered
the application's releases, *Claim*; the queue went from 13 lines to 12 and the build was gone;
`moveit.ReleaseBuild` held the new row (`CreatedBy demo-board`, P9). The demo database was rebuilt
afterwards (`Invoke-AppTrakDemo.ps1`), no board rows left. The approval and hold forms were not
clicked; their requests are pinned by the test. A slip on the way: a second `load()` method on the
page shadowed the first and blanked every screen; caught by the screenshots, renamed `loadSet`.
