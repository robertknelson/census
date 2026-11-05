# Decisions

Pivotal and load-bearing decisions, newest first. Non-pivotal calls made under GO live in
`calls-made-for-you.md`. Spec: `features/census-on-apptrak.md`.

## D-004 — Product owners see their own releases and features, nobody else's
- **2026-11-05 · pivotal · accepted · ruled**

His words: "The end goal will be eventually for product owners to be able to add their own releases and features
and when they come into the app they will be able to see their own but nobody else is. So far I've been building
this for my view as the Creator the sis admin. But we need to move beyond that and become more sophisticated."

Move It stops being a single-administrator tool. Reads and writes of releases, work items, builds, events and links
are scoped on the server. How "their own" is decided (by the applications a person holds a role on, or by who
created the record) is open item CA-1 in the spec.

## D-003 — A reset that wipes everything not obtained by observation
- **2026-11-05 · load-bearing · accepted · ruled**

His words: "this is not in production yet and I want to be able to have a [single] call at a soft delete or a soft
reset … while we're building to user interface, I want to be able to wipe out all the added information that was
not obtained via observation. This way I can start from scratch, see what the real user workflow is and we can
adapt much better real usage." ("Michelle call" is taken as dictation for "single call".)

Observation stays. Assertions go, in one call. "Soft" means the wipe can be undone (spec §5). Allowed only while a
setting says so, which is never in production.

## D-002 — Develop against AppTrak; roles, membership and FM synchronized through core.SelectItem
- **2026-11-05 · load-bearing · accepted · ruled**

His words: "we need to do this development against the back end apptrack database. And the reason is simple. The
core.select item table contains the actual roles that we are trying to mesh with. And I want those rolls and the
membership schema and the FM schema to all synchronize."

The one list of roles is `core.SelectItem` `member-types`. `membership.MemberApplicationRole` and `fm.FeatureRole`
both name roles from it, and nothing else defines a role.

Supersedes, for Census's assertion layer, the "files stay truth" ruling of `features/move-it.md` (around line 176)
and its 2026-09-14 "publish, don't move" addendum. Trigger 1 of that ruling (a second person editing assertions)
has fired by D-004. The rejected option there, "moving Census's JSON into the tracking site's database", is now
taken, for the reason that ruling named as its trigger.

## D-001 — Census moves to the command/query handler paradigm
- **2026-11-05 · load-bearing · accepted · ruled**

His words: "I absolutely think we must move to the query command handler paradigm."

Context: the dream "is becoming closer to an Enterprise solution"; Gatehouse already proved the paradigm here (its
`command-query/` folder); FM2280 is the more advanced home for feature access, and he will change it for other
reasons ("I thought about importing gatehouse into My app. However, I think that the fm2280 project is a little more
advanced").
