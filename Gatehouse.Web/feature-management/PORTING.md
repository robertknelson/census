# Porting Feature Management

Port after command/query and identity. Spec: `docs/gatehouse.md` §6; FM2280 is the original (unchanged).

## What the live app already has

A sidebar partial (`_SidebarNavPartial.cshtml`) and no feature management. Nothing here replaces anything live.

## Copy

| Files | What |
|---|---|
| `evaluation/` | FM2280's evaluation: the SQL definition provider and its cache (`FeatureDefinitionStore`), claims targeting, the disabled-feature handler (403), the gate scanner |
| `data/` | The fm reads and writes as command/query keys (`…feature.*`), `FeatureQueryHandler` / `FeatureCommandHandler` on the `fm` connection, `Payload` (the API's checks) |
| `sql/` | FM2280's scripts, each ending in a real `FOR JSON` (command/query's PORTING.md, "Scripts") |
| `api/FeatureAccessController.cs` | FM2280's admin API, same routes and answers, behind the fixed admin policy |
| `views/FeatureAccess.cshtml`, `FeatureAccessPageController.cs` | The admin page (FM2280's module as it is) and its controller, behind the same fixed policy as the API |
| `FeatureManagementSetup.cs` | The registrations, the policies (`FeatureAccessAdmin`, `SignedIn`, `Visitor`), the role catalog |
| `Navigation.cs` | The one sidebar declaration, the feature names (`Features`), `NavigationFilter` |
| `wwwroot/js/feature-access/`, `wwwroot/css/feature-access.css` | FM2280's page module and its design system; **Logs' modules import its `utils/dom.mjs`, `utils/time.mjs` and `components/toast-stack.mjs`, and Logs' styles need `feature-access.css`** |

Packages: `Microsoft.FeatureManagement.AspNetCore` 4.2.1.

## Program.cs

```csharp
builder.Services.Configure<FeatureAccessOptions>(builder.Configuration.GetSection(FeatureAccessOptions.SectionName));
var featureAccess = builder.Configuration.GetSection(FeatureAccessOptions.SectionName).Get<FeatureAccessOptions>() ?? new FeatureAccessOptions();
builder.Services.AddGatehouseFeatureManagement(featureAccess.AdminRole);
```

## Settings

```json
"ConnectionStrings": { "fm": "<the database that holds the live app's fm schema; often the default one>" },
"FeatureAccess": { "AdminRole": "system-administrator", "DefinitionCacheDuration": "00:01:00" }
```

## SQL to run

1. `sql/ddl/001-fm-schema.sql` on the `fm` database (FM2280's, idempotent). **`fm` serves one application (G-R9)**: if
   another app already uses an `fm` schema in that database, give the live app its own database or schema.
2. The live app's features and first grants. `setup/seed-gatehouse-features.sql` is the example: insert-only, so a grant
   revoked later stays revoked. Name features without an application prefix (`logs.explorer`).

## The sidebar

**Recommended: the declaration.** Move the live sidebar's links into `Navigation.Groups` (label, route, feature or
policy), and make `_SidebarNavPartial.cshtml` the loop in `Views/Shared/_SidebarNavPartial.cshtml`, which shows an item
only when `NavigationFilter` lets the signed-in user open it. The gate test can then check that every item names the
gate of its page.

The alternative, an `@if (await FeatureManager.IsEnabledAsync(...))` around each live link, works, but nothing then checks
the link and its page agree.

## Gates (both halves)

- Every controller or action behind a sidebar item carries `[FeatureGate(Features.X)]` with the item's feature; every
  other endpoint carries a named policy. The fallback policy (signed in) stays.
- The Feature access page and API carry the fixed `FeatureAccessAdmin` policy, never a feature (FM2280 D7), so a feature
  switched off cannot lock everyone out.
- Port `Gatehouse.Tests/GateTests.cs` into the live tests: it fails on an action with neither a feature nor a named
  policy, on `[AllowAnonymous]`, on a sidebar item whose page carries another gate, and on a feature-gated admin API.
  Expect it to fail on the live app's existing ungated actions at first; gate them or name their policy.

## Check after porting

- The Feature access page lists the features; the gate scan names no gate without a feature.
- Switching a feature off hides its sidebar item and answers 403 on its page, without a restart; on again, back.
- Signed in with a role the feature is not granted to: no item, 403.
