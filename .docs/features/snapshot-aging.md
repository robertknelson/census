# Snapshot Aging — compression and rotation, not deletion

Status: **spec — open items undecided, not yet built.**

## 1. Purpose

Daily runs times a growing fleet accumulate files without bound: at 1,000 machines and
50–100KB per envelope, roughly 10–35GB and ~365,000 snapshot files per year, plus a run log
that grows by ~365,000 lines. Disk is cheap; the costs that actually arrive are directory
enumeration on the read path and one forever-growing jsonl.

This feature ages data in place — gzip for old snapshots, yearly segments for the run log.
It deliberately does **not** delete anything: retention/thinning is a policy decision and is
parked as an open item (§7). `plan.md` already names the mechanism ("aging gzips files older
than N days in place; the reader opens `.json.gz` transparently"); this spec is that line
made concrete.

## 2. Invariants (binding)

- **Absence is signal.** A missing snapshot file means "not collected that day." Aging must
  never make a file disappear — it may only change its encoding. This is also why
  write-only-on-change dedup was rejected (ratified 2026-08-14): it would overload absence
  with "or unchanged."
- **Every file independently parseable.** A gzipped snapshot is the same envelope in a
  different encoding; no index, sidecar, or manifest is required to read it.
- **The run log is append-only.** Rotation adds new files; it never rewrites or moves lines
  already written (the read-modify-rewrite design already burned us once — see
  `Repair-CensusRunLog.ps1`).
- **The demo tree is exempt.** `output-demo/` is committed, hand-curated fixture data;
  the aging pass never touches it (it runs only against the collector's `-CensusRoot`).

## 3. Snapshot aging — the collector's write flow

A pass at the end of `Invoke-Census.ps1`, after all machines are collected:

1. Cutoff = today (UTC) minus `-AgeAfterDays`.
2. For every machine directory, every `*-census-YYYYMMDD.json` whose **filename date** is
   older than the cutoff: write `<name>.json.gz`, verify it round-trips (decompress,
   byte-compare), then delete the `.json`.
3. A date is judged by the filename, never by mtime — mtimes lie after restores and copies,
   and the filename date is already the identity everywhere else in the system.

Idempotent and crash-safe by ordering: the original is deleted only after the `.gz` is
verified. If the pass dies in between, both files exist; the reader prefers the `.json`
(§4) and the next night's pass re-verifies and finishes the job. Re-running is a no-op for
already-aged files.

The pass is part of the nightly run rather than a separate scheduled task: one identity,
one schedule, one log to check, and it cannot race a collection because it runs after them
inside the same process.

## 4. The reader — `CensusStore`

Touch points, all in `CensusStore`:

- `CensusFileNamePattern` / `GetSnapshotRefs` accept `.json` and `.json.gz` as one series;
  a `MachineSnapshotRef`'s date comes from the filename either way.
- `ReadSnapshot` opens `.gz` through a `GZipStream` — the same envelope comes out.
- If both encodings exist for the same machine-date (interrupted aging), the `.json` wins
  and the `.gz` is ignored — the uncompressed file is the one whose write was known-complete.

Nothing above `CensusStore` changes: diff, compare, findings, baselines, and the as-of
views are already funneled through it.

## 5. Run-log rotation

- The collector appends to `_runs/run-log-<yyyy>.jsonl` (year of the run's UTC date).
  Year boundaries are natural, human-guessable, and never require rewriting an open file —
  a new year simply starts a new segment.
- The reader (`GetRunLog`) concatenates the legacy `_runs/run-log.jsonl` (if present) plus
  every `run-log-*.jsonl`, in that order. The existing per-line skip-and-count tolerance
  applies per segment. No migration of the legacy file — it is history, and history does
  not get rewritten.
- All segments stay on the read path. At ~200 bytes/machine/day this is a few tens of MB
  per year at 1,000 machines, read once per request (per the 2026-08-14 read-amplification
  fix); dropping closed years from the read path is a thinning decision (§7), not an aging
  one.

## 6. What the fixtures must cover

Per the standing rule (no live estate reachable from the dev box — fixtures are the
coverage), building this requires:

- One aged snapshot in the demo tree: a `.json.gz` day for a machine that also has newer
  `.json` days, proving refs, dossier, and diff read across the encoding boundary.
- One interrupted-aging pair (same date, both `.json` and `.json.gz`) proving the reader
  prefers the `.json` and does not double-count the date.
- A `run-log-2026.jsonl` segment alongside the legacy `run-log.jsonl`, proving
  concatenation and ordering.

(The demo-tree exemption in §2 applies to the *aging pass*; these fixtures are hand-placed,
as all demo data is.)

## 7. Open items

| Item | What's needed to resolve |
|---|---|
| `-AgeAfterDays` default | How far back does day-granular raw JSON get opened in practice? Straw man: 30. Robert sets it. |
| Retention/thinning (option (c) of the 2026-08-14 scaling discussion) | Beyond some horizon, keep only month-end snapshots (~30:1 file-count cut). Policy: what history do compliance questions actually need? Deliberately **out of scope** for this feature — aging must land and be trusted first. |
| Compressing closed run-log year segments | Cheap, but the reader then needs `.gz`-aware jsonl reading too. Defer until a closed year exists. |
| Database ingestion (option (e)) | Parked with an explicit trigger: findings/estate reads exceeding ~1s at real fleet size after (a)+(b) are in. Not before. |

## 8. Ratified decisions log

| Date | Decision |
|---|---|
| 2026-08-14 | Scaling approach: fix read amplification now (done, `c4aaf95`), aging+rotation next, thinning parked as policy, dedup rejected (breaks absence-is-signal), DB parked behind a measured trigger |
