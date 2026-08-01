# Estate — Host-App Import Manifest

> What to lift, verbatim, to embed the Census estate UX in the host app. The host owns
> auth, navigation, and outer chrome (census-web-v2-ux.md §5.5 / open items); the estate
> is a self-contained page + API surface underneath it. The v1 UI (`/`, `wwwroot/js/census/`,
> `wwwroot/css/site.css`, the v1-only controllers) is NOT needed — do not lift it.

## 1. The page

| Piece | Path | Notes |
|---|---|---|
| Landing view | `Views/Home/Estate.cshtml` | just the root div + module import; retitle/reroute freely |
| Controller action | `HomeController.Estate()` | one action, `[HttpGet("/estate")]` — move the route wherever the host wants |

## 2. Front end (all of it, no libraries)

| Piece | Path |
|---|---|
| Stylesheet + theme tokens | `wwwroot/css/estate.css` |
| Page controller (singleton) | `wwwroot/js/estate/estate-page.mjs` |
| API client | `wwwroot/js/estate/estate-api.mjs` |
| Machine glyphs (SVG) | `wwwroot/js/estate/machine-glyphs.mjs` |
| Full-depth dossier | `wwwroot/js/estate/machine-dossier.mjs` |
| Day-over-day history | `wwwroot/js/estate/machine-history.mjs` |
| Assignment editor | `wwwroot/js/estate/assignment-editor.mjs` |
| Findings queue | `wwwroot/js/estate/findings-queue.mjs` |
| Blacklist editor | `wwwroot/js/estate/blacklist-editor.mjs` |
| Certificate renewals | `wwwroot/js/estate/certificates-panel.mjs` |

Theming: every color/spacing/type decision derives from the `:root` custom properties at
the top of `estate.css`. Override those variables in host CSS to retheme; no rule edits
needed. Fonts are system stacks (Segoe UI + Cascadia/Consolas) — no webfont assets.

State: owner/stage/class selection lives in the URL hash (`#owners=…&stages=…&classes=…`).
If the host uses hash routing itself, this is the one integration seam to reconcile.

## 3. API surface (controllers + everything they pull in)

Controllers (`Controllers/Api/`):

- `CanvasController.cs` — GET `/api/canvas` (the substrate: owners, machines, findings)
- `AssetsController.cs` — PUT `/api/assets/{machine}` (assignment editing)
- `BlacklistController.cs` — GET/PUT `/api/blacklist` (rule editing)
- `CompareController.cs` — GET `/api/compare` (multi-select comparison)
- `MachinesController.cs` — GET `dates` / `snapshots/{date}` / `diff` (dossier + history).
  Its `GET /api/machines` list endpoint is v1-only; harmless to keep, fine to trim.
- `CertificatesController.cs` — GET `/api/certificates` (renewal panel + header glance)
- NOT needed: `ComplianceController`, `CoverageController`, `FindingsController` (the
  estate computes its queue from `/api/canvas`; lift `FindingsController` only if the
  host wants a raw findings feed).

Services (`Services/`): `CensusStore`, `AssetsStore`, `BlacklistEvaluator`,
`FindingsEngine`, `CompareEngine`, `DiffEngine`, `MachineClassifier`, `SeverityRanking`.

Models: `Models/Census/*`, `Models/Assets/*`, `Models/Blacklist/*`, and from
`Models/Api/`: `CanvasDto`, `FindingDto`, `CompareResultDto`, `SnapshotDetailDto`,
`SnapshotDiffDto`, `CertificateRadarEntryDto`. (`MachineSummaryDto`,
`ComplianceSummaryDto`, `MachineCoverageDto` are v1-only.)

Options + DI: `Options/CensusOptions.cs`; registration lines from `Program.cs`:

```csharp
builder.Services.Configure<CensusOptions>(builder.Configuration.GetSection(CensusOptions.SectionName));
builder.Services.AddSingleton<CensusStore>();
builder.Services.AddSingleton<BlacklistEvaluator>();
builder.Services.AddSingleton<AssetsStore>();
builder.Services.AddSingleton<FindingsEngine>();
// plus AddControllersWithViews / MapControllers, which the host will already have
```

## 4. Configuration + data

`appsettings.json` section (paths resolved against content root):

```json
"Census": {
  "RootPath": "../output",
  "MachinesConfigPath": "../config/machines.json",
  "BlacklistConfigPath": "../config/blacklist.json",
  "AssetsConfigPath": "../config/assets.json"
}
```

Point these at the real collector output tree and the three operator-owned config files.
The app writes to `blacklist.json` and `assets.json` (pretty-printed, relaxed escaping —
both stay hand-editable); it never writes into `output/`.

## 5. Auth note

The two PUT endpoints (`/api/assets/{machine}`, `/api/blacklist`) are the entire write
surface. The host's auth wraps everything; if it distinguishes readers from editors,
gate those two.
