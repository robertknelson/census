# Toggling Between the Two UXs

Both UIs ship in `Census.Web`, side by side, reading the same data and the same engines.
Nothing needs building or configuring to switch — they are two URLs on one running app.

| UX | URL | Front end | Landing view |
|---|---|---|---|
| v1 (classic CRUD) | `/` | `wwwroot/js/census/*`, `wwwroot/css/site.css` | `Views/Home/Index.cshtml` |
| v2 (Estate) | `/estate` | `wwwroot/js/estate/*`, `wwwroot/css/estate.css` | `Views/Home/Estate.cshtml` |

## Day-to-day toggling

Browse to the other URL. That's it. Both are always live; neither disables the other.

## Making v2 the default landing page

Swap the routes in `Controllers/HomeController.cs`:

```csharp
// current: Index() serves v1 at "/", Estate() serves v2 at "/estate"
public IActionResult Index() { return View(); }

[HttpGet("/estate")]
public IActionResult Estate() { return View(); }
```

To land on the Estate at `/` instead, move the attribute so v1 gets the named route and
Estate takes the default:

```csharp
[HttpGet("/classic")]
public IActionResult Index() { return View(); }     // v1 moves to /classic

public IActionResult Estate() { return View(); }    // conventional route still maps /Home/Estate
```

…and add `[HttpGet("/")]` to `Estate()` (or point the default route's action at it in
`Program.cs`: `pattern: "{controller=Home}/{action=Estate}/{id?}"`). One-line choice of
which view owns `/`.

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
