# After the pull — 2026-10-09

What to run and where to look, in order. Nineteen commits since the last push: the notes
round (`round-2026-10-09.md`), the layered management register (`features/layered-view.md`
§10), and cross-cutting systems (`features/cross-cutting-systems.md`).

## 1. Build and start

```
git pull
cd Census.Web
dotnet build
```

Start it the way you always do (`start-census.bat real`, or the Development profile for the
Move It pages). Nothing new in `appsettings.json` is required; the new settings have
defaults (`MoveIt:DueSoonDays` 7, `Census:ChangesNightsMax` 120).

## 2. The tracking database — once, before anything else in Move It

The release page can now release a build claim, and that writes an event of a new kind,
`build-released`. The kind has to exist in `core.SelectItem` first. The lookups script is
insert-only and idempotent: it adds this one row and changes nothing that is there.

```
sqlcmd -S <server> -d AppTrak -E -b -I -i apptrak\sql\003-lookups.sql
```

Expect `core.SelectItem: 1 members inserted`. Skip this and the first *Release* click on a
build claim answers *Event kind 'build-released' is not in event-kinds.*

## 3. The item that reads "Built, not seen"

Open `apptrak\sql\questions\14-why-not-seen.sql`, set the id at the top:

```sql
DECLARE @WorkItemId int = <the item's id>;
```

Run it (SSMS or sqlcmd). Six result sets; read them top to bottom. The fourth has a
*Reading* column that says in words whether the item is carried forward at each stage and,
if not, why: the newer build at the stage is not claimed by the release (claim it on the
release page), or the current build is older (a rollback), or the item's build was never
seen for the app. The second set compares the build strings byte for byte; the fifth is the
typo finder. Bring back the rows or the answer.

## 4. AppTrak as a cross-cutting system

1. Atlas → **Registry**. Find AppTrak's card (register it if it is only *in use, not
   registered*).
2. **Edit** → tick **cross-cutting** → Save. Or, if the card already shows *called by n
   systems — cross-cutting?*, press **Mark**.
3. Open any site's tab. AppTrak's endpoints are now one capsule per stage, ×n inside.
   The toolbar has a **Services: Folded | Unfolded** switch; flip it and back.
4. Click a capsule: the inspector lists what is folded. A site logging to the wrong AppTrak
   stage still draws its red line into the wrong capsule.

## 5. The layered picture

1. Estate → Triage: give one system's applications a **canonical name** (the same name on
   its dev, val and prod sites) and a **layer** (web, spa or api). Canonical names are what
   line the stage columns up; without them each hostname takes its own column.
2. Atlas → that system's tab → **Layout: Layered** (or build a new tab and pick Layered).
3. What you should see: cards named in words, Browser / Server / Data bands across the
   page, one column per stage, AppTrak in a Services band once step 4 is done, red
   crossings routed under the bands.
4. Bring back what reads wrong — this is the picture meant for management.

## 6. The rest of the round, where to look

| Note | Where |
|---|---|
| 1 findings colour | Estate → a machine with a critical finding → the title is red |
| — Fleet changes window | Estate → Changes → **From** / **To** above the feed; empty is the old feed, *Latest two* clears |
| 2 History list | Estate → machine → History → **List** tab → Week / Month / All |
| 3, 4a Compare | Estate → select two machines → Compare → aspects, *Differing rows only*, **Day** |
| 5 day observed | Estate → machine → **Day observed** select above Identity & hardware |
| 9, 10 board | Move It → Where is it → Features and fixes: PROD keeps the latest shipped; chips say *arrived <date>* and *due* / *was due* |
| 13, 18, 19 release page | Move It → Releases → a release → *history (n)* under each build; *Seen for …, not claimed here* with **Claim**; **Release** / **Move to…** on a claim |
| 15, 16, 17 registers | Move It → Features / Releases: facet cells; Pieces before Highest stage |
| 21, 22 calendar | Move It → Calendar: Sun–Sat, **Full week | Weekdays**; click a day — arrivals read as sentences |

## 7. If something is slow

Two read paths were not timed on real data: History → List → **All** on a machine with
months of nights (the server stops at 120 pairs and says so), and a site graph after step 4
on an AppTrak with hundreds of endpoints. Both fail loud, not silent. Say which, and how
long.
