---
# ── the app reads exactly these; everything else is yours ──
summary: "Getting the census onto a second machine is documented end to end — runbook plus the missing Task Scheduler step"
resume: "start-census.bat — or open .docs/credential-setup-runbook.html in a browser for the credential setup"
health: green
links:
  - { label: "GitHub", url: "https://github.com/robertknelson/census" }
  - { label: "Credential setup runbook", url: "https://claude.ai/code/artifact/7b9ba51c-5c67-44d7-9795-11f1f19865b4" }
phase_suggestion: execution
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

Not a feature this time — the instructions for a job he'd already started and
got stuck on.

He went to set the census up to reach other machines under a nightly scheduled
job, and hit a wall on a question that had no answer: **where do the username
and password go?** They don't. There is no username or password field anywhere
in the machine list. A "bucket" names a *file*, and one command both asks for
the credential and encrypts it, in a single step. Nothing in the old
documentation ever said that plainly, so it read like a missing feature rather
than the design.

Two things now cover it:

- **A step-by-step walkthrough**, `.docs/credential-setup-runbook.html` — open
  it in a browser. It's written for the real case: five groups of machines,
  five different logins. It leads with the one distinction that trips everyone
  up — **one** account creates all five encrypted files, while **five
  different** logins live inside them — then walks eight steps in the order
  they have to happen, with a table to fill in first and every command ready
  to copy. There's a checklist that remembers where you left off.
- **The reference document gained the missing chapter**: how the nightly job
  itself gets registered, and why it has to be set up *before* the encrypted
  files are made. The setup script protects you from the classic disaster —
  files created by the wrong account, which look perfect and then fail at 3am
  across every machine at once — but it can only do that by checking against
  the registered job. No job registered, no protection.

While writing it, two gaps in that protection turned up and are now written
down: it stays silent if the job runs as the built-in SYSTEM account, and it
only compares the short part of an account name, so two accounts with the same
name in different domains pass the check and fail later.

## What's next

Nothing owed. The field trial continues at his pace. When the census does reach
a second machine, the runbook is the thing to follow — and the first run should
be watched by hand rather than left to the schedule.

## Anything alarming

- **The remote login has still never actually been tested.** One machine, one
  account here, so the part that reaches out and logs into another machine has
  never run for real. That remains the single biggest unknown in the project,
  and the runbook says so plainly rather than burying it.
- **The runbook page was checked for structure, not appearance.** The published
  version renders correctly; the copy in the repo couldn't be opened in a
  browser from here to confirm it looks the same. Worth thirty seconds of his
  eyes.
- **Demo-verified only, as always** — real data has drawn blood on first
  contact every time.

Nothing is broken. Build clean, all pushed, working tree clean.
