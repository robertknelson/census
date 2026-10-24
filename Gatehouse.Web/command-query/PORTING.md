# Porting command/query

Port this first: every other component runs on it. Spec: `docs/gatehouse.md` §4.

## What the live app already has

xf-dashboard's pattern: `IParameters`, `IJsonQueryHandler`, `IJsonCommandHandler`, `ISqlCommandInitializer`,
`IInitializerLocator`, `SqlCommandInitializerContainer`, `Response<T>`, `SqlScript.Load`, and initializers registered
one by one. Gatehouse kept those signatures, so the components' initializers fit the live app's interfaces as they are.

## What the live app's handlers may lack

The components need four things from the handlers. xf-dashboard's handlers lack them (its open item 27; xf-dashboard
itself is unchanged). **Check the live app's `JsonQueryHandler` and `JsonCommandHandler` for each:**

| Need | Used by | xf-dashboard's handler |
|---|---|---|
| `QueryAsync` / `ExecuteAsync` really run | every controller here (they await them) | `QueryAsync` throws `NotImplementedException` |
| Rows kept on the async path | Membership's lists, Log Explorer's search and facets | the async read drops every row of a plain query |
| A long `FOR JSON` read whole | Trace's session and day, every Usage section, often 2,000+ characters | `ExecuteScalar` returns only the first ~2,033 characters, then the JSON fails to parse |
| `THROW 50400 / 50404 / 50409` and unique-key (2601/2627) and foreign-key (547) errors set 400 / 404 / 409 | every write script (taken identifier, stale row version, decided request) | every SQL error is the same failure |

**Recommended: port `JsonHandlers.cs` beside the live handlers, not over them.** Register Gatehouse's as concrete
classes and give the components those, so nothing that runs today changes:

- `FeatureQueryHandler`, `FeatureCommandHandler` and `LogsQueryHandler` already derive from Gatehouse's handlers.
- `MembershipController`, `WelcomeController`, `MembershipAuthProvider`, `MemberTypesRoleCatalog` and `NavigationFilter`
  ask for `IJsonQueryHandler` / `IJsonCommandHandler`. Change those constructor types to the ported concrete handler
  classes, or register the ported classes under the interfaces if the live handlers are replaced outright.

## Copy

| File | Note |
|---|---|
| `JsonHandlers.cs` | Rename the namespace to the live one. `ConnectionKey` picks the connection string by name (`default`, `fm`, `logs`) |
| `SqlScript.cs` | Only if the live app's `SqlScript.Load` cannot find a script by its path (see below) |
| `Initializers.cs` | The `CommandQuery(name, action)` and `TryParseQueryCommand` extensions and `ToCamelCase`, if the live app lacks them |
| `Abstractions.cs`, `Parameters.cs`, `Response.cs` | Not needed when the live app has its own; compare `Parameters.TryGet` (Gatehouse's: one rule, case-insensitive keys, blank is absent) |

## The command keys

A key is `domain.name.action`. Gatehouse's domain is `gatehouse`; the live app's base `SqlCommandInitializer` names its
own (xf-dashboard's: `dashboard`). The components' initializers add their keys as `$"{Domain}.membership.members"`, and
their controllers build them with `parameters.CommandQuery("membership", "members")`, which reads
`SqlCommandInitializer.DomainName`. In the live app, either:

- add a `DomainName` constant to its `SqlCommandInitializer` and use `Initializers.cs`'s extension; or
- replace each `CommandQuery(name, action)` with `AddParam("key", $"dashboard.{name}.{action}")`.

The container refuses two initializers claiming one key at start-up. Check the live app has no `feature`, `membership`,
`identity` or `logs` keys of its own.

## Scripts

Gatehouse embeds every `.sql` by its path (`membership/sql/members.sql`, see `Gatehouse.Web.csproj`) and loads it with
`SqlScript.Load(path)`. xf-dashboard lists each script in the `.csproj` and names it in `TSql` constants
(`SqlScript.Load(TSql.Dashboard.AnnouncementsList)`). In the live app, either:

- keep each component's `sql/` folder, add the `<EmbeddedResource Include="…\**\*.sql" LogicalName=…>` line, and copy
  `SqlScript.cs`; or
- move the scripts into the live `sqlscripts/` and change each `SqlScript.Load("membership/sql/x.sql")` to the live form.
  **Check for name clashes first:** xf-dashboard already has `feature-list.sql`, `feature-get.sql` and others; Gatehouse's
  are different scripts (each ends in a real `FOR JSON`).

The result shape is still chosen from the script's text, as in the live app (open item G3): `FOR JSON` anywhere means one
JSON document; `OUTPUT` or `SCOPE_IDENTITY` in a command means rows. Every Gatehouse write ends in
`SELECT … AS [key] FOR JSON PATH, WITHOUT_ARRAY_WRAPPER` for that reason. A script edited later must keep that ending.

## Check after porting

- The `CommandQueryTests` (key parsing, parameters, two initializers on one key) pass against the ported classes.
- Membership's member list answers rows through `QueryAsync`; a Trace session longer than 2,000 characters parses.
- A taken identifier on the Membership page answers 409 with the script's words, not 500.
