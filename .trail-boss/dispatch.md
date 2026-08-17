---
# ── the app reads exactly these; everything else is yours ──
summary: "Started the system graph — tag what census finds, then see what breaks when a server goes down. One decision needed."
resume: "cd Census.Web; $env:ASPNETCORE_ENVIRONMENT='Demo'; dotnet run   # then http://localhost:5199"
health: green
links:
  - { label: "GitHub", url: "https://github.com/robertknelson/census" }
phase_suggestion: planning
ignite: start-census.bat
#
# ignite runs blind from the repo root in cmd.exe (`wt -d <dir> cmd /k <command>`),
# so it is a .bat, not PowerShell. Defaults to the DEMO fleet: this repo's real
# output\ tree holds one stale entry, so the real profile renders a near-empty
# estate and a board click would look broken. `start-census.bat real` for the
# real tree.
#
# WHAT THE OWNER WANTS KEPT VISIBLE (asked and answered 2026-08-17):
#   1. the latest feature added
#   2. what's next, if anything
#   3. any alarming issues outstanding
#   ...and in plain English. Keep the three headings below; keep the jargon out.
---

## The latest feature added

**Nothing new in the app itself this session** — it was groundwork. The last
things users can actually see were **approved baselines** (Aug 12: mark a
machine's software as the approved set, then flag every machine that has extra
software or is missing something required) and **snapshot ageing** (Aug 14:
old snapshots get compressed automatically so the folder stops growing forever).

What this session added instead:

- **A fake five-server estate to build against.** Three web servers and two
  database servers, set up as dev / validation / production. The point is one
  detail: the dev database server also does double duty as the validation
  database server. So if that one box dies, two environments go down at once —
  and nothing in the app currently makes that obvious. That is the problem the
  next chunk of work exists to solve.
- **Deliberately messy names in that test data.** Robert tried building
  something like this in late 2025 by guessing which database belonged to which
  website from their names. It worked for most of the estate and then fell apart
  on the ones that didn't follow the pattern. So the test data now includes the
  exact mess that broke it, permanently — which means nobody can accidentally
  write name-guessing code again and have it look like it works.
- **A tidy-up of project settings** to match how Robert writes C# everywhere
  else. Confirmed safe: every page and data feed in the app returns byte-for-byte
  identical results before and after.

## What's next

**One decision from Robert, and it unblocks everything else.**

The goal is to let a person tag the things census finds — "this database belongs
to System A, and it's the dev copy" — and then get a picture showing what depends
on what, so you can answer *if this goes down, what breaks?*

The snag: census can only see websites and SQL databases on Windows machines it
can log into. Take a realistic large system — a web API, a web front end, phone
apps, a desktop app, fifteen back-end services (five of them run by outside
vendors), a handful of databases. **Census can never see about a third of that.**
Not "hasn't collected it yet" — can never.

So the question is how far census should go:

1. **Stay honest and narrow** — census only ever shows what it actually found,
   and the full picture gets assembled somewhere else.
2. **Go all in** — census also lets you type in the things it can't see, and
   becomes the one place the whole picture lives.
3. **Somewhere between** — you tag and organise what census found, and the
   invisible third stays out of it.

There was an earlier decision (Aug 7) that census should *not* become the
everything-picture, for good reasons. Option 2 reverses it. That is Robert's call
to make deliberately, not something to drift into.

**The thinking is all written down** in `.docs/features/system-graph.md` — it
opens by pointing at exactly this question. After that's answered, the build is:
tagging, then the screen where you do the tagging, then the picture.

## Anything alarming

- **The remote login has still never actually been tested.** Census is built to
  reach out to other machines and collect from them, but every run so far has
  been against the one local box. The first real attempt at logging into another
  machine with a saved credential is genuinely untested, and it should be run by
  hand, watching it, before anything scheduled depends on it. This has been true
  for a while and hasn't bitten yet — but it is the one thing that could fail on
  first contact with the real world.
- **There's no real data here to test against.** Everything is verified against
  invented test data. Twice now, real data has arrived and immediately crashed
  something the test data never covered. Both were fixed the same day, but the
  pattern is clear: real data keeps finding gaps, so treat first contact with any
  new real payload as a live-fire event.
- **The `output` folder isn't excluded from version control.** Robert has started
  putting live working data in it and hand-editing the tagging file alongside.
  Right now that means real working files are one careless commit away from being
  checked in. Worth deciding whether that folder should be ignored.

Nothing is broken. The build is clean and the app runs.
