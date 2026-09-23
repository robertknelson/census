# Traffic — where the files are between the websites and the mainframe

> Discovery note, 2026-09-22. **Unratified.** Brainstorm session, expansion
> not narrowing; nothing here is a spec and no build is authorized. Seeded by
> a conversation about the seam between the distributed estate and the
> mainframe, and shaped against Move It (`move-it.md`), whose pattern this
> note follows deliberately: the same question with the nouns swapped. Parent
> docs: `value-proposition.md` (why), `system-graph-principles.md` (observe →
> human-tag → view), `declared-entities.md` (the mainframe as a declared
> external entity), `move-it.md` §5 and §15 (the inbox prompts entry; History
> as the entrant's page). Working name is Robert's word, *traffic*, until this
> note argues for another (see §8, the name collision).

## 1. The question

Work on the websites produces files for the mainframe — control files, data
files — sent by FTP or dropped where the mainframe looks. The mainframe
processes them and drops output where the websites fetch it. Nobody can
easily say, for last night or right now: did the files go, were they taken,
did the output come back, was it fetched, and which of the recurring
exchanges is late or stuck. Today that answer lives in emails and in whoever
happens to know. Everyone on both sides of the wall wants it, which makes it
the same kind of question Move It answers and the first one where the answer
serves a reader outside the distributed estate.

**Not an integration.** Nothing in this note runs on, reads from, or asks
anything of the mainframe. The mainframe's interior is dark and is drawn
that way. If the other side ever wants its interior to go solid, that is one
ping of theirs to send, and their choice.

## 2. What moves

**The unit that moves is the handoff, not the file.** A handoff is one
recurring exchange: an application sends its inputs, the mainframe takes
them, output returns, the application fetches it. Each occurrence is a *run*
with a few timestamps. Files are a run's evidence at a stamp, as builds are a
release's evidence at a stage.

**Four stamps per run, all at one place.**

| Stamp | Nature | Source |
|---|---|---|
| Arrived — inputs landed on the DMZ from the distributed side | observed | transfer log / folder |
| Taken — inputs left the DMZ to the mainframe side | observed | transfer log / folder |
| Returned — output landed on the DMZ from the mainframe side | observed | transfer log / folder |
| Fetched — output left the DMZ to the distributed side | observed | transfer log / folder |

Two dark intervals sit between them: inside the mainframe (taken → returned)
and inside the application (fetched → next arrival). Both are drawn dashed,
exactly as Team A's asserted positions are in Division. *Taken at 02:14* is
what the page says; *processed by the mainframe* is a reading of it and the
page never makes it.

Late and stuck are derived from a handoff's own history, the way Division
derives client sign-off from events: a run whose next stamp is overdue
against what this handoff usually takes.

## 3. The join: the transfer event, verbatim

What crosses from observed to named is the transfer event: a timestamp, an
account, a source address, a path, a direction, a byte count, and the file
name **as an opaque string, never parsed for meaning**. Direction is observed
from who connected and which way the bytes went, not inferred from a folder's
name.

Pairing an input with its output is the human step. Observation groups
transfers by account, path and direction; a person names the handoff, says
which application it belongs to (the registry's system, so it joins Atlas),
and pins the input pattern to the output pattern with the usual turnaround.
Only after a person has pinned a pattern does the view apply it. This is the
systems-registry discipline again, and the 2025 failure again if skipped:
file names are pure convention, and convention-sniffing is dead on arrival
(`no-inference-from-naming`).

## 4. Where the pieces live (direction, not decision)

**The DMZ is the customs post.** Every crossing in either direction passes
through it, both sides touch it, and neither side wrote the evidence. That
last point is the political fact: when the other side asks whether
distributed delivered last night, the answer comes from a log neither team
produced. Move It's evidence is the tracking site's own pings, which a
skeptic can call self-reporting; border logs are neutral.

**The evidence is the transfer log, not the folders.** A folder listing shows
state and misses anything that came and went between looks; a nightly census
would miss a file dropped at one and taken by three. A transfer log is the
complete history with exact times, so a sweep hourly or nightly loses nothing
as long as it runs before the log rolls. Folder snapshots become
corroboration, as health pings corroborate Move It's ledger. Which log
depends on what runs on the DMZ, and this is the fact that decides the
collector entirely:

| What runs there | Evidence | Quality |
|---|---|---|
| IIS FTP | W3C log per site: command, user, path, bytes, status, time | good; complete; rolls daily |
| Windows share | NTFS file auditing to the security log, or nothing | exact if auditing is on; otherwise folder snapshots only |
| Managed file-transfer product | its own audit database | best; also the name-collision risk in §8 |
| Connect:Direct or similar | its statistics log | good, but usually bypasses the DMZ (§8) |

**Census's part.** The DMZ boxes are machines in the estate, so the collector
already inventories them; if IIS FTP is there, the site and its log path are
one collector item away from being in the snapshot (the collector captures
IIS sites today, not FTP sites: a gap to note, not to close here). The
registry supplies the application for the join, the same way it supplies the
system for a build. The mainframe itself is one **declared external entity**
(`declared-entities.md`), and every named handoff is an edge to it, dashed
past the DMZ, so the other side of the wall appears in Atlas without anyone
observing it.

**Where the manual pieces live.** The Move It answer, until argued otherwise:
in the Census module, next to History, as the second thing Census writes.
Holding, and no more:

- Handoff: application, name, direction pair (input pattern → output pattern),
  usual turnaround.
- Run: derived, never entered. A run is what the stamps make of the transfers
  that match a handoff.
- Note: free text on a run, for the one line a person knows and the log does
  not ("re-sent by hand at 09:10").

No states on a run. Its state is the last stamp it has. **The rule that keeps
it small: it records what crossed, not what anyone intended to send.** The
moment it holds schedules, owners and escalation paths it is a job scheduler
by another name.

## 5. The inbox prompts entry

Nobody opens a form unprompted. The sweep already sees "account X put a file
at path P at 01:52, no handoff matches." That is the inbox, drawn in place on
the traffic History, and the entrant names it, as an unnamed build is named
today. Resolutions include "noise, ignore" for a path that is not a handoff
(a test upload, a stray). Everything found is either explained or
known-unexplained; the size of the unexplained pile is the health metric, as
in the triage workbench.

## 6. Constraints that shaped the above

- **HARD CONSTRAINT: no real data here, of any kind** (`move-it.md` §6). No
  real transfer logs, no real paths, no real account names. Every evidence
  branch that depends on real behaviour gets a fixture per possible behaviour
  (a log line per direction, a rolled log, a re-sent file), and the fixtures
  are the coverage. Every question needing real answers is a `.sql` or a
  script Robert runs on the real side and reports back from memory.
- **No integration with the mainframe.** Robert's ruling at the outset. No
  collector there, no read of its logs, no assumption about what it does with
  an input beyond what the DMZ shows (delete, rename, move, acknowledgement
  file — each is a fixture, §8).
- **The DMZ may be walled off.** DMZ boxes are commonly unreachable by WinRM
  from the control machine, and commonly owned by whoever owns the network. A
  read-only share of the log folder is a smaller ask than remoting or an
  agent, and Census is read-only by principle, which is the argument.
- **Robert is the sole entrant** for the foreseeable future, as with Move It.
  Entry is per handoff, once, plus the occasional note. Per-run entry would
  die in the field; runs are derived.
- **Logs roll.** The sweep cadence is bound by the shortest retention on any
  DMZ, not by how often anyone wants to look.
- **Not every exchange crosses the DMZ.** Direct shares, Connect:Direct, MQ.
  Those handoffs exist and must appear as *declared, unobserved*, the way an
  attributed build nobody has seen appears in question 05. The board must
  never look complete when it is not.

## 7. From Move It — keep and drop

**Keep, with the nouns swapped:** History as the entrant's page (the sweep's
ledger newest first, unnamed transfers as the inbox, name-it in place); the
registry join to the application; a lane board with a lane per stamp and a
count of late and stuck; a run page as level 3 (its transfers, its notes);
Division gaining one strip for the handoffs that crossed and the ones that
did not; the honesty rules (dark drawn dashed, unobserved never impersonating
observed, coverage itself measured). Stages, if the DMZs are per stage (§8).

**Drop, for this seam:** the release and work-item vocabulary (nothing here
has contents to name); the manifest loader (nothing to import); approval
events (no client sign-off on a nightly file). **Never add:** parsing of
control files for meaning; inferring the consuming job from a name; a
collector on the mainframe; schedules and owners (§4's rule).

## 8. Open items

1. **How many DMZs and why.** Per stage (DEV, VAL/UAT, PROD) gives Move It's
   stages for free and lets a handoff be watched in VAL before it matters in
   PROD. Per direction or per partner is a different model. Decides §2.
2. **What runs on them.** IIS FTP, a share, a managed transfer product, or a
   mix. Decides the collector entirely (§4's table). If it is Progress
   MOVEit, the module name *Move It* collides in every conversation with the
   network owners; decide the name before it hardens.
3. **Reachability.** Can the control machine sweep the DMZ logs directly, or
   is a read-only share of the log folder the ask, and of whom.
4. **What the mainframe does with an input on pickup.** Delete, rename, move,
   or write an acknowledgement. This is what *taken* means and how much to
   trust it; one fixture per behaviour.
5. **Do the applications already log their sends and fetches** to the
   tracking site's Messages. If so, the tracking site is half the collector
   again, and a second, self-reported source to corroborate the border.
6. **Retention on each DMZ log**, which bounds the sweep cadence (§6).
7. **The exchanges that bypass the DMZ**, enumerated once, so the declared,
   unobserved set is honest on day one.
8. **Pairing rules.** Whether a handoff's input and output are always one to
   one, or whether one input fans out, or several inputs make one output.
   The registry shape follows.
9. **Where the manual pieces live** (§4's draft: the Census module, next to
   History). Ratify or move.
10. **The name.** *Traffic* is the working word. Alternatives heard and set
    aside for now: *Handoff*, *Crossing*.

## Appendix A — questions the data could answer

Compiled in the session; the value proposition (`value-proposition.md`) in
list form for this seam.

**The governance reader, and the reader on the other side of the wall**
- Did last night's exchanges all complete? Which did not, and at which stamp
  did they stop?
- What is on the DMZ right now, waiting, and for how long?
- What did distributed deliver this week? What did the mainframe return?
- Which handoff is late against its own usual turnaround?
- Which exchanges exist at all, and which of them can we not see?

**The architect**
- Turnaround per handoff, per direction, per stage, over time: ours (inside
  the application) versus theirs (inside the mainframe), the same split as
  Move It's "done, waiting on the client".
- Volume per handoff: files and bytes per run, drift over months.
- Which applications touch the mainframe at all, and through which paths:
  the seam drawn, not described.
- Coverage: how much of the known traffic crosses an observed DMZ.

**Triage / process health**
- The unexplained pile: transfers matching no handoff, and how it trends.
- Re-sends: the same input arriving twice in one run.
- A handoff that stopped: expected by its history, absent for N days.

**The developer**
- Did my file go? Was it taken? Is the output back yet?
- What did the DMZ see for my application in the last hour?

**What none of the sketched data answers**
- Anything about what happened inside the mainframe, by design.
- Whether the output is correct, only that it came back.
- Why a run is late, only that it is, and at which stamp.
