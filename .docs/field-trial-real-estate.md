# Field trial — first real-data contact for the system-graph arc

> Written 2026-08-17 for Robert to run against actual infrastructure. Purpose:
> exercise collection → Estate → tags → Triage → blast radius against real
> machines, and come back with the specific observations listed here. Every
> section ends with **Report back** — that is the feedback the next session
> needs. Notes can be terse; a bullet per item is plenty. Where something
> breaks, the raw error + the offending payload fragment beats any description.
>
> Standing context: this is also the **first live test of remote collection**
> (the collector has only ever run against the local box) and the third round
> of "real data finds a gap the fixtures never covered" — the first two both
> broke something on day one. Treat this as a live-fire exercise, not a
> checklist to rush.

## 0. Before anything — safety and setup

- `output/` is gitignored now; real snapshots stay local. `config/*.json` is
  NOT ignored — `entity-tags.json`, `assets.json`, `baselines.json` will carry
  real names once you tag. Decide before you start whether real machine/db
  names may be committed, and if not, keep those changes uncommitted.
- Copy `config/entity-tags.json` somewhere before bulk-tagging — every Triage
  apply rewrites the whole file, and there is no history (last writer wins,
  by ratified design). A stray apply is recoverable only from your copy.
- Every write endpoint is unauthenticated (standing open item). Run the web
  app bound to localhost only, as it is by default.

**Report back:** nothing — just do it.

## 1. Collection — the never-tested path

Run `Invoke-Census.ps1` against the real fleet, **by hand, watching it**, one
machine first, then the rest. This is the first WinRM run against real remote
targets from anywhere.

Considerations while you watch:

- The scheduled-task environment is Windows PowerShell 5.1 — if you hand-run
  under pwsh 7, note that the 5.1 pass is still unproven for these targets.
- Watch a machine with a named SQL instance and one with multiple instances,
  if you have them — the demo is nearly all default-instance.
- Watch what the SQL connection does under the real service account: the
  collector needs VIEW ANY DEFINITION to see all databases, and a silently
  filtered list is rendered as a permission failure, not an empty list —
  check that it actually does.

**Report back:**
1. Fleet size attempted / succeeded / failed, and for each failure the run-log
   line (`output/_runs/run-log-2026.jsonl`) plus the on-screen error.
2. Any collector crash or partial category: the category `status`/`reason`
   values that appear, verbatim.
3. Which PowerShell ran it (5.1 or 7), and whether the scheduled 5.1 task was
   also exercised.
4. Rough collection time per machine and total — sets expectations for
   scheduling.

## 2. Estate first render — does real data survive the readers?

Open the app on the real profile (`start-census.bat real` or
`ASPNETCORE_ENVIRONMENT` unset). Walk: canvas → a few dossiers → Hosting →
Findings. This is where the last two real-data breaks surfaced
(deserialization and diff crashes).

**Report back:**
1. Any error panel, blank section, or console error (F12) — with the machine
   and section it happened in. If a payload broke a reader, attach the
   snapshot JSON fragment around the offending entity.
2. Page-load feel with the real fleet: canvas, a dossier, Hosting, Triage.
   Anything that takes more than ~2s, say so and say which. (The canvas
   evaluates tags per machine per request, and Triage re-reads every latest
   snapshot per request — real fleet size is where that design gets tested.)
3. Fleet shape: how many machines, roughly how many user databases and IIS
   apps fleet-wide (the Triage chip's number is exactly this — just quote it).

## 3. Edges and the host index — how much does census actually see?

Open **Hosting → dependencies** before tagging anything. This is raw observed
reality, and the blast-radius answer can never be better than it.

Considerations:

- Real connection strings name hosts as short names, FQDNs, IPs, DNS aliases
  (CNAMEs), availability-group listeners, or `host,port`. The index joins only
  on names a machine *itself* claims (netbios/fqdn/ipv4) — a CNAME or listener
  will show as **unobserved** by design. The question is how much of your
  estate that costs.
- `contradicted` on a real edge means census proves the target absent — each
  one is either config drift (interesting!) or a resolution bug (report it).

**Report back:**
1. Counts by corroboration: confirmed / unobserved / contradicted — the
   numbers next to the dependencies list, or just eyeball proportions.
2. For a handful of `unobserved` edges: what kind of name was in the
   connection string (CNAME? listener? IP? port syntax?) — this decides what
   the deferred alias work must actually handle, with data instead of guesses.
3. Any `contradicted` edge you believe is actually live — that would be a
   resolution bug and I want the edge + the target machine's instance list.
4. Edge kinds census missed entirely: apps you *know* talk to a database but
   show no edge (config format the parser doesn't read? which file/format?).

## 4. Tagging the real estate — does the model fit reality?

Work Triage on the real pile. Tag what you know; leave what you don't — the
point is the fit of the model, not finishing.

Considerations while tagging — these are the design bets being tested:

- **Does `system` × `stage` describe your estate?** Things that resist —
  shared infrastructure DBs, vendor products, a reporting warehouse fed by
  five systems, utilities — how did you end up tagging them (multi-system?
  one axis only? a made-up system name like `SHARED`?), and did it feel like
  modeling or like forcing?
- **Stage vocabulary**: what set did you end with? Free-form was ratified —
  did it stay clean, or did near-duplicates creep in (`prod`/`production`)?
- **The bulk gesture**: was select-instance + apply enough, or did you want
  something it doesn't have ("select everything matching this filter across
  machines", "copy tags from that entity", per-column sort)? Name the missing
  gesture concretely if one hurt.
- **Nesting pressure** (parked open item): did you hit real cases wanting
  "SUB_SYSTEM is part of BIG_SYSTEM" — and how many double-assertions did it
  cost you? A number decides whether `partOf` gets built.
- **Machine facets vs rollups** (parked §8.4): with entities tagged, is the
  hand-set machine `stage` facet in assets.json now pure redundancy for you,
  or still carrying meaning the rollup doesn't?

**Report back:**
1. The pile before and after (Triage chip numbers), and roughly how long the
   tagging session took — the bulk-gesture verdict in one line.
2. Your final stage vocabulary and the count of distinct systems.
3. The awkward cases, each in a line: entity → how you tagged it → why it felt
   wrong (if it did).
4. Rulings you want to make now on: nesting (build `partOf`? with the count
   from above), machine-facet retirement, controlled stage vocabulary vs
   free-form.
5. Anything Triage got *wrong* (row missing from the pile, wrong resolution,
   unknown where you expected observed, case-sensitivity surprises with real
   names — collations differ).

## 5. Blast radius — the truth test

Pick 2–3 machines whose failure story you already know cold (your DEVSQLBOX
equivalent — the shared box — plus a prod DB server). Ask each for its blast
radius **before thinking**, then compare against your mental model.

The discrepancies are the entire value of this section:

- **Missing dependents** = edges census didn't see (feeds §3.4) or names it
  couldn't resolve (feeds §3.2).
- **Surprise dependents** = either census teaching you something true (the
  win condition) or a resolution error (report the edge).
- **Unclassified leakage** into the answer = the §4 pile, quantified where it
  hurts.
- Do the *unknown* lines (unreachable instances, failed categories) match
  what you know census can't reach?

**Report back:**
1. Per machine tested: "the answer matched my model except …" — the excepts
   are everything.
2. At least one screenshot of a real blast-radius answer (redact names if
   needed) — layout readability at real scale (many deployments, long edge
   lists) is untested.
3. Verdict on the headline question: would you trust this answer enough to
   show it to someone else during an incident? If not, what's the one thing
   that stops you?

## 6. Grab-bag — friction log

Anything not covered above: UI papercuts, wording that reads wrong, a chip
color that misleads, findings noise that drowned signal, something the demo
made obvious that reality made confusing. One line each, unfiltered.

## The package to send back

- The §1–§6 **Report back** answers (bullets are fine).
- `output/_runs/run-log-2026.jsonl` lines for failures.
- Any broken payload fragments + the exact error text.
- Your `config/entity-tags.json` after tagging (or a redacted shape of it).
- Corroboration proportions + example unobserved-edge hostname *kinds*.
- Screenshots: one real blast radius, the Triage queue at real scale.

With that, the next session can: fix whatever broke, size the alias work with
real name-kind data, rule on the three parked tagging questions with real
counts, and know whether blast radius earned trust or needs another pass.
