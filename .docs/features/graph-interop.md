# Census ↔ Dependency Graph — Interop Contract

> **Scope of this document:** what census owes the dependency-graph system, and what census
> must never do to it. It is written from the census side. The graph system is a separate work
> effort with its own model and its own roadmap; nothing here specifies its internals, and
> nothing here should be read as census making decisions on its behalf.
>
> **Status:** direction ratified 2026-08-07. The export mechanism (§5) and the mapping table
> (§3) are census-side commitments. Everything requiring the other effort's agreement is in
> §10, not assumed here.

---

## 1. The relationship — census informs, it does not govern

The graph system models database servers, databases, web servers, hosted applications, and the
dependencies between them, so that the blast radius of any one thing going down can be
answered. It is populated by hand today, which makes it accurate at the moment of entry and
progressively less accurate afterwards.

Census observes a subset of the same estate, nightly, from the machines themselves.

**Census supplies observations. The graph remains the model.** Census facts appear in the
graph as an overlay beside human-entered values — timestamped, attributed, and never
overwriting. Where they disagree, the disagreement is the output (§7).

### 1.1 Why the graph is not simply generated from census

Recorded so it is not re-opened later. Two independent reasons, either sufficient on its own:

1. **The graph contains machines census cannot reach.** Third-party hosts, machines in
   networks census has no credential for, appliances, and things that are on the diagram but
   not on the network. A generated model would either lose those nodes or require census to
   invent them. Both are worse than manual entry.
2. **Names do not match.** The graph's node names were typed by people, across years, from
   memory, tickets and diagrams. Census reports what the machine calls itself. These disagree
   routinely and there is no authority that can settle it mechanically.

A system that governs a model must be complete over that model. Census is structurally
incomplete **by design** — it observes what it can reach, and reports its reach honestly
(§5.3). That is the correct trade for an observer and the wrong one for a source of truth.

---

## 2. The shape: pull, overlay, never write

| | |
|---|---|
| **Direction** | The graph pulls from census. Census never calls the graph. |
| **Authority** | The graph owns node identity, node existence, and node deletion. Census owns nothing in the graph. |
| **Write access** | Census has none, at any tier, ever. See §9. |
| **Failure mode** | Census unavailable ⇒ the graph renders without an overlay and says so. It does not degrade, and it does not change. |

Census does not know that the graph exists. Nothing in the collector, the output tree, or
`Census.Web` carries a graph node ID, a graph URL, or graph-specific vocabulary. If a reader
of this repository can tell which downstream system consumes the export, the coupling has
already leaked.

---

## 3. The seam is one mapping table, owned by the graph

Exactly one artifact couples the two systems:

```
graphNodeId  ↔  censusMachineId  (+ who mapped it, when, and confidence)
```

- **The graph owns this table.** It lives in the graph system's storage, is curated by
  people, and is durable across census reruns.
- **`censusMachineId` is `identity.machineGuid`**, not the machine name. Names change; the
  folder name in the census tree is the *requested* name (see collector spec §4), which is a
  configuration value, not an identity.
- `requestedName` travels alongside as a human label so the mapping table is readable, but it
  is never the key.
- **Mappings are many-to-one in principle.** Two census machines mapping to one graph node is
  legitimate (a rebuild, a rename, a failover pair modelled as one logical server). One census
  machine mapping to two graph nodes is a modelling error worth surfacing, not a census
  concern.

> **This is the only place the two systems know about each other.** Any second point of
> coupling — a shared database, a census-side graph identifier, a synchronised name list —
> should be treated as a defect in this design, not an optimisation of it.

### 3.1 Duplicate machine GUIDs are now load-bearing

Collector spec §8.1 already records that a duplicate `machineGuid` or SMBIOS UUID across
machines is *a finding, not something to dedupe silently* — the classic cause is a VM cloned
without sysprep. That rule was previously a data-quality nicety. It is now the integrity
constraint under the mapping table: a duplicated GUID means two machines resolve to one
mapping row. Census must keep reporting the duplication rather than resolving it.

---

## 4. Identity: census emits every name, the graph decides which one it meant

The join is the whole problem. Census's contribution is **not better matching** — it is a
richer alias surface, so the graph's match becomes a lookup instead of a guess.

**Census must never perform the match.** The moment census decides which graph node a machine
corresponds to, census is governing.

### 4.1 The alias set

A new `aliases` collection on the `identity` collector (collector spec §8.1). Every entry
carries its `kind` and its `source`, because the alias kinds are not equally trustworthy and
the consumer needs to weight them:

| Kind | Source | Strength |
|---|---|---|
| `netbios` | `$env:COMPUTERNAME` | Strong — what the machine calls itself |
| `fqdn` | `Win32_ComputerSystem` Name + Domain | Strong |
| `machineGuid` | `HKLM\SOFTWARE\Microsoft\Cryptography` | Strong, survives rename — the mapping key |
| `smbiosUuid`, `biosSerial` | `Win32_ComputerSystemProduct`, `Win32_BIOS` | Strong, survives rename **and** reinstall |
| `sqlInstance` | Instance names from collector §8.8 | Strong — `HOST\INSTANCE` is very often the string in the graph |
| `bindingHostHeader` | IIS bindings, collector §8.6.2 | Medium — this is frequently the name people actually use |
| `certSan` | Certificate SANs, collector §8.7 | **Weak** — wildcard and shared certificates name machines that are not this one |
| `ipv4` | Listening addresses, collector §8.13 | Weak and volatile — DHCP churns |

Rules:

- **Derived, therefore last.** The alias set aggregates from `iis`, `certs`, `sqlserver` and
  `network`. It must run after them, and it must record which source collectors actually
  contributed, per collector spec §6.6 — an alias set assembled while the IIS collector was
  failing is *smaller*, and that must not read as aliases having been removed.
- **Diff key is (Kind, Value).**
- **IP aliases are volatile** (collector spec §6.3) and excluded from the hashed projection.
  Every other kind is stable and belongs in the hash.
- Census asserts these are names *this machine answers to*. It asserts nothing about whether
  any of them is the right one.

---

## 5. The export contract

### 5.1 A versioned endpoint, not the file tree

**The graph must not read `<CensusRoot>\<MACHINE>\<machine>-census-YYYYMMDD.json` directly.** That
layout is census's internal storage. A consumer bound to it freezes it permanently — no gzip
aging, no repartitioning, no schema evolution, none of which is finished.

`Census.Web` exposes a read-only, versioned JSON export instead. One controller, an explicit
contract, and the collector stays free to keep moving underneath it — which it is very much
still doing.

### 5.2 What the export carries

Per machine, per as-of date:

- **Identity** — `machineGuid`, `requestedName`, the alias set (§4.1).
- **Server facts** — OS, build/UBR, virtualization, CPU/RAM, roles.
- **Hosted applications** — the application-shaped IIS payload (collector spec §8.6.1): site,
  path, physical path, runtime, app-pool identity, authentication.
- **SQL instances and databases** — from collector §8.8.
- **Dependency edges** — collector §8.6.7, with the resolution asymmetry of §6 below.
- **Observation metadata** — `collectedUtc`, per-collector `status`, and which collectors
  degraded. A consumer must be able to distinguish *"census looked and there is nothing"* from
  *"census could not look"* without reading census's source.

### 5.3 As-of is part of the contract, not a convenience

The graph will need "what did census observe on the day of the incident," not only "what does
census observe now." The as-of capability already in `Census.Web` is the right shape; the
export must expose it rather than serving latest-only.

### 5.4 Coverage is exported as a first-class fact

The export includes the run manifest view: which machines were expected, reached, unreachable,
and when each was last successfully observed. **This is not diagnostics — it is what lets the
graph state its own confidence** (§8). An export that only carries successes silently implies
completeness census does not have.

---

## 6. Dependency edges: the source is resolved, the target is a claim

Census observes edges from the machine it is standing on. The asymmetry matters and must be
explicit in the payload:

| | |
|---|---|
| **Source** | Strongly resolved. Census is on the box; it knows the machine, the site, and the application. |
| **Target** | A **string read from a config file and normalized.** Nothing more. |

Consequences, all deliberate:

- **Unresolved targets are first class and are never dropped.** A connection string pointing at
  `SQLPROD07` is a valid, valuable edge even when census has no access to `SQLPROD07` and never
  will. The graph very likely has that node from manual entry — that edge is precisely the
  contribution census is making.
- **Census performs no DNS resolution and no reachability probe on an edge target.** It is
  network I/O per edge, it can hang, and split-horizon DNS means the answer depends on where
  you resolve from — which is the consumer's context, not census's. Recorded as a decision so
  it is not added later as an "improvement."
- **Host normalization is now a cross-system contract, not an internal nicety.** Collector spec
  §8.6.7 requires `.`, `(local)`, `localhost`, `127.0.0.1` and `(localdb)\…` to resolve to the
  collecting machine's own name. Skipped, every locally-referenced database in the estate
  collapses onto one fake shared node in the graph.
- **The normalization algorithm is versioned.** It is part of the collector's `version`
  contract (collector spec §6.5). Changing how a host string is normalized changes every edge
  key derived from it, which churns the consumer's matching — so it is a version bump, not a
  patch.

### 6.1 Census sees downstream; blast radius needs upstream

Census reads configuration, so it observes *what this application calls*. Blast radius needs
the inverse — *what calls this database*. That inversion is performed by the consumer across
every edge census contributes.

Which means: **estate coverage converts directly into upstream-edge completeness.** If census
observes 60% of the web tier, the graph can state that it knows at least 60% of what depends
on a given database — and say so, rather than presenting a partial answer as a complete one.

---

## 7. Drift — three classes, and the third is the valuable one

1. **Contradiction.** The graph says application X depends on database Y; census reads X's
   connection strings and Y is not among them. Or census finds an edge the graph has never
   recorded. Both directions are findings.
2. **Staleness.** A node last human-verified fourteen months ago against one census observed
   last night. Cheap to compute, immediately useful, and the easiest thing to ship first.
3. **Blind spots, in both directions.**
   - Graph nodes census has never observed — no mapping, or mapped but never reached.
   - Census observations matching no graph node at all.

   The second of these is the one nobody builds and the one worth the most: it is how the
   graph discovers things that exist in the estate but were never entered. **Unmatched census
   observations belong in a candidate queue for human review, not in a discard path.**

Class 3 measures the coverage of the coverage. Classes 1 and 2 are only trustworthy to the
extent class 3 is small and known.

---

## 8. Coverage is the confidence number

A blast-radius answer without a stated confidence is worse than no answer, because it will be
acted on. The graph can derive that confidence directly from §5.4 and §6.1:

> "At least six applications depend on this database. Four are confirmed by census as of last
> night. Two are human-entered and last verified in March. Three web servers in scope have
> never been observed."

Census's obligation here is narrow but firm: **export the gaps as prominently as the
findings.** Everything else is the graph's to render.

---

## 9. Invariants

Non-negotiable on the census side. Each of these, if broken, converts "informs" into
"governs":

1. **Census never writes to the graph.** No API call, no shared table, no file drop, no
   queue message. Pull only.
2. **Census never performs the identity match.** It emits aliases; the graph maps.
3. **Census never deletes anything and never causes a deletion.** A graph node with no census
   observation is `unobserved`, never `gone` — collector spec §6.2's "unknown is never absent"
   promoted from a field-level rule to a system-level one.
4. **Census carries no graph vocabulary.** No node IDs, no graph URLs, no graph-shaped
   entities in the collector or the output tree.
5. **The machine list is not derived from the graph.** `machines.json` is a credential and
   reachability concern (collector spec §5.2), not a topology one. The graph may *suggest*
   candidates for human review; it may not populate the list.
6. **No bidirectional sync, at any point, for any reason.**
7. **Redaction survives the export.** Collector spec §6.7 applies unchanged — parsed edges,
   never raw connection strings, never credentials. The export is a second place secrets could
   leak and gets the same rule, not a relaxed one.

---

## 10. Open items

Everything here needs the other work effort's input, or a decision census cannot make alone.

- **Who owns the mapping table's curation?** §3 puts it on the graph side. That needs the other
  effort's agreement, plus a decision on what happens to a mapping whose census machine
  disappears from `machines.json`.
- **Mapping bootstrap.** First population of the table is a bulk fuzzy-match exercise across
  the alias set. Whether that is a one-off script, an assisted review UI, or hand entry is the
  other effort's call — but the alias set (§4.1) is what makes any of them tractable, which is
  why it is being built now.
- **Export authentication and transport.** §5.1 commits to an endpoint; how it is secured, and
  whether the graph pulls over HTTP or from a scheduled extract, is undecided. **The census
  tree is tier-0 sensitive** (collector spec §10) and the export inherits that, so this is not
  a detail to settle late.
- **Pull cadence.** Census collects nightly. Whether the graph pulls on the same rhythm, on
  demand, or on view is the other effort's call.
- **Does the graph want raw census payloads or a projected view?** §5.2 assumes a projection.
  A consumer wanting the full envelope changes the contract's shape and its blast radius when
  the collector schema moves.
- **Alias-strength weighting.** §4.1 assigns strengths informally. Whether the graph wants a
  numeric weight, or would rather apply its own policy to the kinds, is theirs to decide.
- **Binding host → DNS.** Carried over from collector spec §10: whether http edge targets need
  a resolved address to survive CNAMEs and load-balancer VIPs. §6 says census does not resolve;
  if the graph cannot resolve either, this returns as a real gap.
- **Machines in the graph that census could reach but is not configured for.** Class-3 drift
  will surface these. There should be a route from "the graph knows about a machine census
  isn't collecting" to a `machines.json` addition — human-reviewed, per invariant 5.

---

## 11. Decisions

| | Decision |
|---|---|
| **GI-1** | Census informs, the graph governs. Census facts overlay human-entered values; they never overwrite and never delete. |
| **GI-2** | The graph is not generated from census — census cannot reach every node, and names do not match. Recorded so it is not re-opened. |
| **GI-3** | One seam: a mapping table owned by the graph, keyed on `identity.machineGuid`, never on a name. |
| **GI-4** | Census emits an alias set with kind and source; census never performs the match. |
| **GI-5** | The graph consumes a versioned `Census.Web` export, never the output file tree. As-of and coverage are part of that contract. |
| **GI-6** | Edge sources are resolved, edge targets are normalized name claims. No DNS resolution, no reachability probing, unresolved targets never dropped. |
| **GI-7** | Host normalization is versioned as part of the collector contract, because it determines edge keys in a consumer census does not control. |
| **GI-8** | Coverage and gaps are exported as first-class facts, so the consumer can state its own confidence. |
| **GI-9** | Pull only. Census never writes to the graph, carries no graph vocabulary, and its machine list is never derived from the graph. |
