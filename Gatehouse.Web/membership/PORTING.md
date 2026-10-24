# Porting Membership

Port after command/query, identity and Feature Management. Spec: `docs/gatehouse.md` §7, §9b and §11; the
original is Census's membership page.

## What the live app already has

AppTrak's `membership` tables (`Application`, `Member`, `MemberApplicationRole`, `ApplicationRole`, `ApplicationStage`,
`ApplicationService`) and `core.SelectItem`'s lists. No page that edits them.

## Copy

| Files | What |
|---|---|
| `data/` | `MembershipSqlCommandInitializer` (keys `…membership.*`), `MembershipRequests` (the boundary checks, every reason at once) |
| `sql/` | Census's membership scripts (writes end in `FOR JSON`; `application-delete.sql` counts Census's Move It and health tables only where they exist) and the welcome's and requests' scripts |
| `api/MembershipController.cs` | The Membership page's API, behind `admin.membership` |
| `api/WelcomeController.cs` | The visitor welcome's API, behind the fixed `Visitor` policy |
| `views/Membership.cshtml`, `views/Welcome.cshtml` | The two pages |
| `MembershipPageControllers.cs` | The two pages' controllers |
| `controllers/PagesController.cs`: the first line of `HomeController.Index` | A visitor goes to `/welcome`; copy that line into the live Home action |
| `wwwroot/js/membership/`, `wwwroot/css/membership.css` | The page and welcome modules, with their two helpers beside them |

`membership.css` takes Gatehouse's colours from `site.css`: `--gh-wash`, `--gh-paper`, `--gh-rule`, `--gh-ink`,
`--gh-ink-soft`, `--gh-accent`, `--gh-font`, `--gh-code`. Define those eight in the live app's stylesheet (mapped to its
own colours), or replace them in `membership.css`. The sidebar count's `.gh-count` rule is in `site.css`.

## Program.cs

```csharp
builder.Services.AddTransient<ISqlCommandInitializer, MembershipSqlCommandInitializer>();
```

The `Visitor` policy comes with Feature Management's registrations, and the `member` claim with identity.

## The sidebar

Two items in `Navigation.Groups`: Welcome (`Policy: FeatureAccessPolicies.Visitor`) and Membership (`Feature:
Features.AdminMembership`, `CountKey: "membership.requests-pending-count"` for the count of waiting requests). A visitor
sees Welcome alone; `NavigationFilter` already does that.

## SQL to run (on AppTrak, the `default` connection)

1. `sql/ddl/001-membership-audit.sql`: `membership.MembershipAudit`, every write's before and after. Census's go-live
   may have made it already; the script is idempotent.
2. `sql/ddl/002-membership-request.sql`: `membership.MembershipRequest` (V1, ratified 2026-10-24).
3. The live app's own row in `membership.Application`, its identifier the one in `Identity:Application`, and its first
   system-administrator's grant on it. `setup/seed-gatehouse-membership.sql` is the example (local; it takes the
   identifier as a variable so no account name is written down).
4. The feature `admin.membership`, granted to `system-administrator` (Feature Management's step 2).

**Check `core.SelectItem` in the live AppTrak has the lists the page reads:** `member-types` (the roles),
`application-types`, `stages` and `service-types`, each under a header row with `MasterId = -1`.

## Check after porting

- Signed in as an administrator: the Membership page's overview, its lists, an application's page and a member's page.
- Grant yourself a role on the live app: it reaches Home within `Identity:SessionMinutes`; revoke it.
- From a Windows account with no member row: `/` goes to the welcome; ask to join; the request shows on the Requests
  tab with the sidebar count; approve it (with a role and one application); after `SessionMinutes` that account is a
  member with that one grant, and `/welcome` refuses it.
- The audit: every one of those writes is in the overview's recent changes, by its actor.
- Port `MembershipEndToEndTests` and `WelcomeEndToEndTests` only against a local AppTrak: they create and delete rows.
