# Baselines — a plain-English primer

> Operator's reference. The full spec, with every ratified decision and its reasoning, is
> `.docs/features/approved-baseline.md`. This file is the short version of *what it means
> and how to think about it*.

## The one-sentence version

The blacklist catches software you already knew was bad; a baseline catches software
nobody ever approved.

## Blacklist vs. baseline

The **blacklist** is a wanted poster: "if you ever see Wireshark, tell me." It can only
catch software somebody already thought to name. A machine carrying some random thing
nobody has heard of sails right past it — the blacklist has no opinion on things it
wasn't told about.

The **baseline** flips the question. You point at a machine you trust and say
"everything on this machine, right now, is fine — this is the approved set." That's the
**bless** gesture. From then on, every machine the baseline covers is compared against
the approved list, and anything *extra* it carries — anything unblessed — becomes a
finding: `N unapproved items`.

| | Question it answers | What it misses |
|---|---|---|
| Blacklist | "Is anything here we *know* is bad?" | Everything nobody named |
| Baseline | "Is anything here nobody *approved*?" | Nothing extra — that's the point |

## The vocabulary

- A **baseline** is the artifact (`config/baselines.json`).
- **Bless** is the verb — copying a trusted machine's software set into a baseline.
- A machine is **within scope** of a baseline when its `appliesTo` selector matches.
- An installed item no matching baseline approves is a **deviation**.

## Behaviors you'll bump into

**Blessing takes a copy, not a live link.** The approved set is the software as it was
*at the moment of blessing*. Installing something on the golden machine later does not
silently widen approval for everyone in scope — widening is a deliberate re-bless, and
it shows up as a diff in `baselines.json`. That diff is the audit trail.

**Scopes stack.** `appliesTo` can cover the whole fleet (`{}`), a facet combination like
prod web servers (`{ "class": ["WebServer"], "stage": ["prod"] }`), or one named machine
(`{ "machine": ["WEB03"] }`). A machine's approved set is the **union** of every active
baseline that matches it. That's how "fleet common set, plus web-server additions, plus
one special allowance for this box" composes — no inheritance, no precedence rules.

**An exemption is just a tiny baseline.** "Yes, WEB03 is allowed to have Wireshark" is a
one-machine baseline with one entry and a note. The **"Approve here"** button on a
deviation row does exactly this — it appends the item to a `<machine>-exemptions`
baseline, and it requires a note so the justification travels with the approval.

**Versions never matter.** A baseline approves *identities* — "Edge is allowed," not
"Edge 128.0.2739.42 is allowed." Pinning versions would turn every routine patch into a
deviation and make the stream worthless by day two. If a specific version is bad, that's
a blacklist rule with a version constraint — a different tool for a different assertion.

**`required` is the third layer.** *Approved* means "allowed to be here"; ticking
`required: true` on an entry upgrades it to "must be here." That's how "which machines
are missing the AV agent" gets answered. Absence of a required item is its own finding
(`missing-required-software`, high) — higher severity than unapproved, because a
required item is something a human deliberately marked. Blessing never sets the flag;
only the checkbox does.

**Findings roll up per machine.** One `unapproved-software` finding per machine with the
count, not one finding per app — the first real machine deviates on dozens of items, and
a per-app fan-out would drown the stream. The full item lists live in the machine
dossier.

## Reading "no deviations" honestly

A machine matched by **no** baseline produces **no findings at all** — baselines are
opt-in per scope, and an unblessed fleet shouldn't indict every laptop. Which means "no
deviations" only means "everything is approved" once coverage is real. The panel's
**"N of M machines are within a baseline's scope"** line is there so a quiet stream
can't lie by omission.

Related: a required entry that matches nothing shows as **"found on 0 of N"** beside the
entry in the panel — that's a config smell (probably a typo'd name), surfaced next to
the checkbox that caused it, not a finding about the estate.

## Rollout order

**Bless a fleet-wide common baseline first** (`appliesTo: {}`), then add narrower
per-class baselines. The bulk of any Windows machine's install list is the same
everywhere; the fleet baseline absorbs that noise once, and the per-class baselines that
follow describe only what actually distinguishes a web server from a database server —
which is small enough to read.
