# Toggling Between the Two UXs

Both UIs ship in `Census.Web`, side by side, reading the same data and the same engines.
Nothing needs building or configuring to switch — they are two URLs on one running app.

| UX | URL | Front end | Landing view |
|---|---|---|---|
| v2 (Estate) — **default** | `/` and `/estate` | `wwwroot/js/estate/*`, `wwwroot/css/estate.css` | `Views/Home/Estate.cshtml` |
| v1 (classic CRUD) | `/classic` | `wwwroot/js/census/*`, `wwwroot/css/site.css` | `Views/Home/Index.cshtml` |

**Changed 2026-08-07.** The Estate now owns `/`; v1 moved to `/classic`. Before this, `/`
served v1 and the Estate was only reachable at `/estate` — which reads as "the re-imagined
UX is missing" to anyone who browses to the root and takes what they see as the whole app.
Defaults are a claim about which UI is the real one, so the default was made to match.

**`/estate` still works.** `Estate()` carries both route attributes deliberately, so
existing bookmarks, the `demo` launch profile's `launchUrl`, and every doc that names
`/estate` keep resolving. Retiring that second route is a later, separate decision.

## Day-to-day toggling

**There is a switch in the bottom-right corner of every page.** It reads `v2 → Classic` on
the Estate and `v1 → Estate` on the classic UI, and it is the whole mechanism — click it to
land on the same view in the other UI. Browsing to the other URL directly works exactly as
well. Both are always live; neither disables the other.

It lives in `Views/Shared/_Layout.cshtml`, which both views use, with its CSS inline in the
same file. Inline deliberately: the switch belongs to neither UI — it is scaffolding for
comparing them — so it should vanish in the same edit that retires v1 rather than leave a
dangling rule in a stylesheet.

It carries no state across the jump. The two UIs navigate differently enough (a CRUD list
versus an estate canvas) that mapping "where you are" between them would be guesswork; the
switch answers "show me the other one", which is what a comparison needs.

## Which view owns `/`

It is the route attributes in `Controllers/HomeController.cs`, nothing else:

```csharp
[HttpGet("/classic")]
public IActionResult Index() { return View(); }      // v1

[HttpGet("/")]
[HttpGet("/estate")]
public IActionResult Estate() { return View(); }     // v2, owns the root
```

To put v1 back at `/`, swap which action carries `[HttpGet("/")]`. Note that an action with
any attribute route is no longer reachable through the conventional `{controller}/{action}`
pattern in `Program.cs` — so `/Home/Index` does not serve v1 anymore; `/classic` does.

## Retiring v1 entirely (e.g., at host-app import time)

Delete, in this order — nothing else references them:

1. `Views/Home/Index.cshtml`
2. `wwwroot/js/census/` (whole folder) and `wwwroot/css/site.css`
3. The `Index()` action in `HomeController`
4. v1-only API controllers: `ComplianceController`, `CoverageController`,
   `FindingsController`* (see note)
5. v1-only DTOs: `MachineSummaryDto`, `ComplianceSummaryDto`, `MachineCoverageDto`

Keep everything else — the Estate depends on `MachinesController` (dates/snapshots/diff),
`CanvasController`, `AssetsController`, `BlacklistController`, `CompareController`,
`CertificatesController`, `ChangesController`, `ExportController`, `SoftwareController`,
and all Services/Models beyond the three DTOs above.

\* `FindingsController` (`GET /api/findings`) is unused by both UIs (the Estate computes
its queue from `/api/canvas`) — keep it only if something external wants a raw findings
feed.

## Demo vs real data (orthogonal to the UX choice)

Either UX shows whichever data tree the environment selects: Development/Production read
the real tree (`output/`, `config/machines.json`, `config/assets.json`); the `demo`
launch profile (`ASPNETCORE_ENVIRONMENT=Demo`) reads `output-demo/` and the `*.demo.json`
configs. See `.docs/host-import-manifest.md` §4.
