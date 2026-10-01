---
trail_boss_contract: 8
---
<!-- trail-boss agent contract v8 — app-generated, regenerated on enlist / `tb refit`. Do not hand-edit; the report you own is dispatch.md. -->

# Trail Boss agent contract

This repo is enlisted in Trail Boss (ideation → project visibility). The
`.trail-boss/` folder is its source of truth. If you are an AI session
working in this repo, follow these rules **before ending your session**:

1. **Update `next_step`** in `project.md` to the honest single re-entry
   move — the one thing a returning human (or agent) should do first.
2. **Append a dated note** under `## notes` in `project.md` — newest
   first, `### YYYY-MM-DD` heading — summarizing what changed this session.
3. **File a field report, in two tiers**, in `dispatch.md` (yours to
   rewrite freely):
   - `summary:` is **tier 1 — one distilled headline line** for the glance.
     The board shows it verbatim and never truncates, so *you* keep it terse.
   - the **body** below the frontmatter is **tier 2 — the same update in
     full**: blockers, milestones, decisions, detail. This is the drill-in.
   - also refresh `resume:` (the command that gets things running) and
     `health:` (`green` | `yellow` | `red` | `unknown` — build/test state).
4. **You may recommend a phase, never set one.** When the lifecycle has
   visibly moved (e.g. the work has landed), write `phase_suggestion:` in
   `dispatch.md` (`discovery`|`planning`|`execution`|`monitoring`|`closure`).
   That is a recommendation the human ratifies on the board — it **never**
   changes `phase` in `project.md`.
5. **Validate before you leave: run `tb check`.** It re-reads both files
   exactly as the board will. A `project.md` that does not parse shows as a
   broken card; a dispatch that does not parse drops this project's report off
   the board. The check is the safety net under the syntax rules below — a
   *break* means fix it now; a *hole* is a nudge (a Windows path in double
   quotes, or a headline that has stopped being terse).
6. **This is the project's voice on the owner's board.** Anything this
   project exposes in `dispatch.md` becomes visible at the next scan.
   Exposure is invited and entirely this project's choice: Trail Boss only
   ever reads; it never reaches in.
7. **Ask the human what to keep visible.** Once per project — or whenever it
   is unclear — ask the developer what this dispatch should stay updated with
   (build health, a deploy URL, open blockers, a metric they watch). Record
   the answer as a comment in `dispatch.md` and keep those fields fresh.
8. **Never touch** `id`, `schema`, or `created` in `project.md` —
   they are minted and immutable.
9. **Never change `phase`** in `project.md` unless the human explicitly
   decides it (recommend via `phase_suggestion` instead — rule 4).
10. **You MAY set `standing`** in `project.md` — the one authored field this
    contract invites you to write. It is the *portfolio disposition* (where this
    project sits across the owner's whole range), not project truth, so it is
    shared between you and the human, last-edit-wins, no ratify:
    `underway` (actively on it) | `parked` (deliberately set aside) |
    `blocked` (can't proceed — waiting on something) | `review` (needs a
    rethink). Set it when the fact is yours to report — e.g. `blocked` when
    you hit a wall this session. Leave it blank if unsure; the human owns it too.
11. **You MAY expose an `ignite` command** in `dispatch.md` — the one thing
    that lets Trail Boss *start* this project from the board. It is **opt-in and
    consent-by-declaration**: set it only if you want external ignition. You
    decide entirely what it does (`npm run dev`, `.trail-boss/boot.bat`,
    `docker compose up`, …); Trail Boss runs it **blind**, from this folder,
    and never interprets it. Leave it unset and there is no ignition. Unlike
    `resume` (a human-readable hint), `ignite` is *executed* — so it must be a
    real, safe-to-run command.
12. **Preserve unknown fields** everywhere in these files: read what you
    know, keep the rest byte-for-byte.

## File syntax — get this wrong and the project vanishes from the board

Both files open with YAML frontmatter. A single malformed line fails
the WHOLE file's parse, and the project silently drops off the owner's
board until a human repairs it. The rules that prevent that:

**Quote any value containing `:`, `#`, or starting with a special
character** (`[`, `{`, `>`, `|`, `*`, `&`, `!`, `"`). Escape inner
double quotes.

```yaml
# BROKEN — the ': ' mid-sentence reads as a second key:
next_step: Run the review — two parts: UX pass and security pass

# CORRECT:
next_step: "Run the review — two parts: UX pass and security pass"
```

**Windows paths go in single quotes.** Inside "double quotes" a backslash
starts an escape: `\d` breaks the whole file, and `\t` or `\n` silently turn
into a tab or a newline — the value is wrong and nothing warns you.

```yaml
# BROKEN, or silently WRONG:
next_step: "open C:\data\thing"

# CORRECT (inside single quotes, write a literal ' as ''):
next_step: 'open C:\data\thing'
```

**Keep frontmatter values on one line.** Long is fine; multiline block
scalars are not worth the risk here.

**`links` entries** are strings or `{ label, url }` maps — quote
labels containing `:` (URLs after `url:` need quotes too, since they
contain `://`):

```yaml
links:
  - { label: "PR #13 (Mod 2 -> dev)", url: "https://github.com/org/repo/pull/13" }
```

**Notes in `project.md`** live under `## notes` in the BODY (below
the frontmatter), newest first:

```markdown
## notes

### 2026-07-08
- what changed this session, one or more bullets
```

**The dispatch body** (below its frontmatter) is free markdown —
headings, bullets, bold all render on the owner's board. No rules
beyond the frontmatter's.

**After writing, run `tb check`** — it re-reads exactly what
the scan will and names any break (a value that needs quoting, a
mistyped floor field) before it costs you the board. That one command
is the difference between reporting in and disappearing.
