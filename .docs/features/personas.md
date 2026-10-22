# Personas — who looks, what they see, what they may change

> Spec 2026-10-22, from Robert's morning over Census and Move It: *"what we have built so far
> is a lot of overlap … we need to focus on the Personas that will need to see/interact with
> Census, MoveIT, and Atlas."* Position taken in conversation the same day; his answers to the
> mapping questions are folded in (§3, §12). Status: **P-1 and P-2 built 2026-10-22** on branch
> `personas` (§10, §13); `/personas` is the shell, the views are P-3. His typed notes
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
| P-3+ | The views themselves, from §5 and his notes. | Per view. |

## 11. API

| Endpoint | Answers |
|---|---|
| `GET /api/personas/members` | Every member: identifier, name, Windows identity, grants (role, application). |
| `GET /api/personas/members/{identifier}` | One member's access: `estate` (holds a role on Census), `estateRoles`, `estateFeatures`, `features` (the union), and `applications` — each with its own roles and its features (estate roles' plus its own). 404 for an unknown member. |

Both 404 when `MoveIt:ConnectionString` is absent (the Demo profile), as Move It does.

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
