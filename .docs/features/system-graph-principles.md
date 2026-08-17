# System graph — principles and value proposition

> Written 2026-08-17, independently of the concept notes in `system-graph.md`, at Robert's
> request: think through the principles from scratch and state what we are trying to do.
> Robert ratified this understanding the same day ("i think you fully understand").
> This document is the *why*; `system-graph.md` holds the working concepts and decisions.

## The gap

Census today answers **"what exists?"** It produces mechanically trustworthy facts — this
database, this IIS app, this connection string, on this box, on this date. But those facts
are anonymous infrastructure. Every question that matters operationally — *what breaks if
this box dies? where does prod really run? which environments secretly share hardware?* —
is asked in terms of **business systems and their copies**, and census has no idea those
exist. `MyDB_DEV` is a fact; "the dev copy of MyWeb's database" is meaning, and meaning is
not in the payload.

## The move

What we are building is **the seam between fact and meaning, done honestly.** The 2025
attempt manufactured meaning from names — and the failure was not the ten percent it got
wrong, it was that nothing could say *which* ten percent, so the whole graph was
untrustworthy. The correction is not better inference; it is **no inference**. A human
asserts the meaning once, explicitly, and the system stores *who said what, onto which
observed thing*. Every answer is then traceable to either a measurement or a named
assertion — never a guess.

**Trust is the product; the graph is just its shape.**

## The value, in delivery order

1. **Consequence answers you can defend.** "DEVSQLBOX down → MyWeb dev *and* val" —
   derived from observed edges plus human tags, expressed in system/stage language, with
   provenance behind every hop. Shared infrastructure is hidden coupling between
   environments; today nothing surfaces it.
2. **The unexplained pile as the health metric.** Census keeps observing; the human keeps
   classifying; the estate is healthy when everything found is either explained or
   *known*-unexplained. That turns inventory into accountability — and it is why the
   day-to-day screen is the triage workbench, not the graph. The graph is the payoff;
   classification is the job.
3. **Cheap ongoing truth.** Diagrams rot the day they are drawn. Here the facts refresh
   nightly for free, and only the assertions — which change rarely — need a human. When
   observation and assertion drift apart (a tagged database vanishes, a new one appears
   untagged), the drift is *surfaced*, never silently patched. Silently following a change
   would be inference by another door.

Each of these is useful before the next exists, which sets the build order: **tags with
provenance first, drift/triage second, blast radius third.** The graph is the third
deliverable, not the first.

## In one sentence

We are turning a machine inventory into a defensible model of the systems the machines
serve — by letting observation and human assertion each do only what they are each
trustworthy at, and never letting either impersonate the other.
