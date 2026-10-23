# Usage — how people use an application, from its click streams

Status: **proposal, 2026-10-23, nothing built.** Asked by Robert the same day: "think about how a user would want
to analyze click streams, sessions for an application, and come up with a proposal on how to construct the UX."
It follows open item T5 in `log-explorer-and-trace.md`. It reads the same log tables (`[apptrak].[ApiRequest]`,
`[Session]`, `[Exception]`) and writes nothing.

## 1. Where it sits

| Page | Grain | Question |
|---|---|---|
| Log Explorer | rows | What exactly was logged? |
| Trace | one identifier, one session | What happened to this person? |
| **Usage** (this) | one application, a period, every session | How is this application used, and where does it hurt? |

All three join up. Every number in Usage opens the sessions behind it. A session opens in Trace, and a row opens in
Log Explorer. **Aggregate → examples → one session** is the spine of the design: a pattern you can't open is
only a claim.

## 2. Who asks, and what

From the personas (`personas.md` §4). Usage takes the persona UX's scoping: a member sees Usage for the
applications they hold a role on.

| Persona | Their questions |
|---|---|
| Product / App Owner | Who uses it, and is that growing? Which pages and features are used, and which are not? Where do people give up? |
| Tech Lead | Which pages are slow or failing, for how many people? Did the last release change how it is used? |
| Sys Admin | Is anyone stuck in a loop? Are there sessions that end on an error? (Trace takes it from there.) |
| Executive | Adoption only: active people per week across their applications. |

## 3. What the tables can answer (and what they cannot)

A session is an ordered list of **page loads** (a GET outside `/api/`, T2), each with the API calls made under it.

- **Page identity** is the controller and action the app recorded (`ControllerName.ControllerMethod`), not
  the path. `/orders/123` and `/orders/456` are one page, and nothing is guessed from URLs (no inference from naming).
  When an app records no controller, the path stands as it is. Aliasing pages by hand is a later option (U4).
- **Time on a page** is the gap to the next page load in the session. The last page in a session has no
  measured time, so it is shown as "last page", not as zero.
- **Where people came from:** `Session.Referer` / `RefererPath`. A referer that is another application in the
  estate is a link between systems that was observed, not declared.
- **Cannot see:** clicks that call nothing, changes made only in the browser, and which browser tab a request
  came from. Two tabs in one session interleave their pages, so a transition between them is noise. A transition
  with less than a second between page loads is marked, not trusted.
- **Left out:** the sign-in handshake (anonymous 401), as in Trace.

## 4. The page: `/usage`

One application, one stage (PROD by default), and a period. The period uses the persona UX's grains
(week, month or quarter, with ‹ › and the fiscal year).
Six sections stack on one long page, with a sticky section bar. The page is dense, per his Log Explorer ruling.

```
┌ Usage · WidgetCore ▾ · PROD ▾ · ‹ October 2026 › · week | month | quarter ─────────────────────────────┐
│ [Overview] [Pages] [Paths] [Friction] [When] [People]                                                  │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ OVERVIEW  people 23 (+4)   sessions 412 (−3%)   median session 11 min   pages/session 5.2              │
│           sessions ending on an error 2.4% (▲ from 0.9%)          ▁▂▃▅▆▅▇ people per day               │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ PAGES   page                      views  people  median time  exits  errors  slow   ▸ opens a drawer  │
│         Orders.Detail             1,204    21       2m 10s     12%    0.4%    3%                       │
│         Orders.Index                 980    23       0m 40s      9%     –      –                       │
│         Settings.Index                12     2       0m 15s     58%     –      –   ← rarely used       │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ PATHS   from [Orders.Index ▾]   depth 3                                                                │
│         Orders.Index ──62%── Orders.Detail ──48%── Orders.Detail (next) ──…                            │
│                      ──21%── Quotes.Index  ──70%── Quotes.Detail                                       │
│                      ──11%── (session ends)                                                            │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ FRICTION  ranked signals, each with its sessions:                                                      │
│   • 9 sessions ended within 2 min of a 500 on Orders.Save                          [9 sessions]        │
│   • Quotes.Rate refused (409) 31 times for 6 people                                 [31 requests]      │
│   • 4 people loaded Orders.Detail ≥ 5 times in a minute (a loop?)                   [4 sessions]       │
│   • Reports.Index p90 4.8 s                                                        [slowest 20]        │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ WHEN    weekday × hour heatmap of page loads (the browser's hours)                                     │
├────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ PEOPLE  identifier  sessions  days active  pages  last seen  errors   → Trace                          │
└────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 4.1 Overview

Five figures, each with the previous period beside it (delta, not a second chart), and one sparkline of people per
day. The figures: people, sessions, median session length, pages per session, and the share of sessions ending on
an error. Clicking a figure scrolls to the section that explains it.

### 4.2 Pages

One row per page, sortable. Columns: views, people, median time on page, exit rate, error rate (500s and logged
errors in the page's group), slow share (calls ≥ `SlowMs`). A row opens a **page drawer** with:
- **Came from / went to:** the top five pages each side, with their shares, including "entered here" and
  "session ended".
- **Used for:** the API calls made on the page (controller and action), with counts and their own error and refusal
  rates. This answers which features of a page are used.
- **Who:** the people using it most.
- **Examples:** five recent sessions that include it, each opening in Trace at that page.

Pages seen in an earlier period and not in this one are listed at the bottom as **not used this period**.

### 4.3 Paths

**A next-step tree, not a Sankey.** Pick a starting page (default: the most common entry page). Each level shows
what came next, as shares, to a depth of 3 (selectable 2–5), with branches under 5% folded into "other". Clicking
a branch shows the sessions that took it. It is read left to right as an indented tree with bar widths.

Why not a Sankey: with dozens of pages it becomes a hairball, and it hides the session ends that matter most.
A tree from one chosen page answers the question people actually ask ("after the order list, where do they go?")
and stays legible.

The reverse tree is the same control flipped: **leading to** a page, which answers "how do people reach Checkout?".

### 4.4 Friction

Ranked signals, each a sentence with a count and a button that opens its sessions or requests. The first set:

| Signal | Rule |
|---|---|
| Ended on an error | The session's last request is within 2 minutes of a 500 or a logged error. |
| Refused repeatedly | One action refused (4xx except 401) ≥ 3 times for one person in a session. |
| Loop | The same page loaded ≥ 5 times in a minute by one person. |
| Retry | The same write (method and path) sent twice within 10 seconds. |
| Slow page | A page's p90 ≥ `SlowMs`. |
| Dead end | A page whose exit rate is far above the application's median (≥ 3×) with ≥ 20 views. |

The rules and thresholds are settings. A signal is a pointer to sessions, never a verdict.

### 4.5 When

A weekday × hour heatmap of page loads in the browser's hours. A cell opens the sessions active then. It answers
when to deploy and when people work.

### 4.6 People

Identifiers with their sessions, active days, pages, errors and last-seen date, sortable. A row opens Trace for
that identifier in the period. A role filter (the logged `Roles` column) answers "how do underwriters use it
compared with agents?"; the roles are what the app logged, nothing inferred.

## 5. Ways in

- Persona nav: **See → Usage** for Product/App Owner, Tech Lead and Sys Admin. It is scoped to their applications,
  so a member on one application lands straight on it.
- Executive: the Overview figures only, one row per application, inside the period view they already have (U5).
- Trace's day header and a Census application page: **Usage of this application**.

## 6. Computing it

The tables only grow, and Usage reads a month of one application at a time.

- **Index:** `(Application, StartAt)` on `ApiRequest`, including SessionId, Identifier, HttpMethod, HttpStatus,
  Elapsed, ControllerName and ControllerMethod. It goes in `001-log-indexes.sql` beside the others, under the same
  Standard-edition warning.
- **Per section, one script** in `apptrak/sql/logs/usage-*.sql`. Each orders a session's page loads with `LEAD()`
  over `(SessionId ORDER BY StartAt)` for transitions and time on page. Paths are built in the browser from a
  bounded list of page sequences (sessions in the period, newest first, capped, with the cap stated on the page).
- **No new tables in v1** (R1). If a quarter gets slow on real volume, a nightly roll-up per application, day
  and page is the fix. That is a new table, so it needs your ruling (U3).

## 7. Slices

| Slice | Contents |
|---|---|
| U-1 | Overview + Pages (with drawer) + People; the index; demo seed given stable page names. |
| U-2 | Paths (next-step tree, both directions). |
| U-3 | Friction (the six signals) + When. |
| U-4 | Persona nav and scoping; the Executive's figures; links from Trace and application pages. |

## 8. Open items

| # | Question | Recommendation | Needed |
|---|---|---|---|
| U1 | **Name:** Usage, Adoption, or Click streams? | **Usage**: the persona's word, and it covers more than clicks. | His word. |
| U2 | **Who sees it?** | Product/App Owner, Tech Lead, Sys Admin, scoped to their applications; Executive gets the figures only. | His word. |
| U3 | **A roll-up table** if live queries are slow at quarter scale. | Not now. Measure on real volume first; this would be the first exception to R1. | Real volume. |
| U4 | **Page names:** controller and action as recorded, or human aliases ("Order detail")? | Recorded first; aliases later as a small declared mapping (observe → tag), never guessed. | His look at the real page list. |
| U5 | **Executive adoption figures** in the period view, or only on Usage? | In the period view: it is where the Executive already looks. | His word. |
| U6 | **Cross-application journeys** (a session's referer is another app in the estate). | Show them in Pages as "came from WidgetPortal"; a map of the links between apps belongs to Atlas later. | His word. |
| U7 | **Staff and test identifiers**: exclude them from the figures? | A declared list per application, shown as excluded, never hidden silently. | Which identifiers. |
