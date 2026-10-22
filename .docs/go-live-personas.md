# Going live with the `personas` branch — what to run on the real AppTrak

Everything to bring the real server up to the `personas` branch (2026-10-22): the persona UX at
`/personas`, the Tracker, the period views, Needs you, the curate pages, the membership page,
feature access, and your Move It notes. Run it once, in order, in SSMS against the **real
AppTrak** database (the one `MoveIt:ConnectionString` names). Every script is safe to run
twice. **Never run anything under `apptrak/seed/` there, or `Invoke-AppTrakDemo.ps1`** — those
are the fabricated demo rows.

Paths are from the repository root.

## 0. Before you start — three looks, nothing changed

```sql
-- a. The membership schema is in this database (Move It now names applications from it).
SELECT TOP 5 Id, Identifier, Name FROM membership.Application ORDER BY Id;

-- b. The member-types list, and the exact Identifier of the Executive role you added.
SELECT x.Id, x.Identifier, x.Display
FROM core.SelectItem x JOIN core.SelectItem h ON h.Id = x.MasterId AND h.MasterId = -1
WHERE h.Identifier = 'member-types' ORDER BY x.Sort, x.Identifier;

-- c. Census itself is registered as an application (roles held on it are estate-wide).
SELECT Id, Identifier, Name FROM membership.Application WHERE Identifier = 'census';
```

- **a** returns rows → carry on. An error means `membership` is in another database; stop and
  tell me — every Move It page would fail.
- **b**: note the Executive row's `Identifier`. The grants in step 2 use `executive`; matching
  ignores case, so `Executive` is fine. Anything else (e.g. `exec`): see step 2's fix.
- **c** returns no row → step 5 registers it.

## 1. Feature access tables — `apptrak/sql/fm/001-fm-schema.sql`

Creates the `fm` schema: `fm.Feature`, `fm.FeatureRole`, `fm.FeatureAudit`, `fm.FeatureSnapshot`.

```sql
-- check
SELECT name FROM sys.tables WHERE schema_id = SCHEMA_ID('fm') ORDER BY name;   -- Feature, FeatureAudit, FeatureRole
```

## 2. Census's features and first grants — `apptrak/sql/fm/002-census-features.sql`

Inserts the 16 features and their role grants. Insert-only: a feature that exists is left alone,
so re-running never undoes a change made on the Feature access page.

```sql
-- check: 16 features, 69 grants
SELECT (SELECT COUNT(*) FROM fm.Feature WHERE IsVoided = 0) AS Features, (SELECT COUNT(*) FROM fm.FeatureRole) AS Grants;
```

Only if step 0b showed the Executive role under an identifier other than `executive`:

```sql
UPDATE fm.FeatureRole SET RoleName = '<the identifier from 0b>' WHERE RoleName = 'executive';
```

## 3. The curate pages' history — `apptrak/sql/edit/001-edit-audit.sql`

Creates `moveit.EditAudit`, where every correction made on the curate pages keeps the row before
and after. In Move It's own schema.

```sql
-- check
SELECT OBJECT_ID('moveit.EditAudit') AS EditAudit;   -- not NULL
```

## 4. The membership page's history — `apptrak/sql/membership/001-membership-audit.sql`

Creates `membership.MembershipAudit`, where every change made on the membership page keeps the
row before and after. **This one is new DDL in your membership schema** (open item P13 in
`personas.md`): run it if you are happy for it to live there. Without it, every save on the
membership page fails.

```sql
-- check
SELECT OBJECT_ID('membership.MembershipAudit') AS MembershipAudit;   -- not NULL
```

## 5. Register Census, and make yourself its system-administrator

Without this no one is estate-wide, and no one is offered *Administer → Membership* or *Feature
access*. Fill in your own details; skip any statement whose row already exists.

```sql
DECLARE @website int = (SELECT x.Id FROM core.SelectItem x JOIN core.SelectItem h ON h.Id = x.MasterId
                        WHERE h.MasterId = -1 AND h.Identifier = 'application-types' AND x.Identifier = 'website');

-- Census as an application (skip if step 0c found it)
IF NOT EXISTS (SELECT 1 FROM membership.Application WHERE Identifier = 'census')
    INSERT membership.Application (Identifier, Name, Tags, Disposition, ApplicationTypeId)
    VALUES ('census', 'Census', '', 'current', @website);

-- you as a member (skip if you are already in membership.Member)
IF NOT EXISTS (SELECT 1 FROM membership.Member WHERE WindowsIdentity = '<DOMAIN\you>')
    INSERT membership.Member (Identifier, WindowsIdentity, FirstName, LastName, Email, CreatedAt)
    VALUES ('<your identifier>', '<DOMAIN\you>', '<First>', '<Last>', '<email>', SYSDATETIMEOFFSET());

-- system-administrator on Census
INSERT membership.MemberApplicationRole (MemberId, ApplicationId, RoleId)
SELECT m.Id, a.Id, r.Id
FROM membership.Member m, membership.Application a,
     core.SelectItem r JOIN core.SelectItem h ON h.Id = r.MasterId AND h.MasterId = -1 AND h.Identifier = 'member-types'
WHERE m.WindowsIdentity = '<DOMAIN\you>' AND a.Identifier = 'census' AND r.Identifier = 'system-administrator'
  AND NOT EXISTS (SELECT 1 FROM membership.MemberApplicationRole g WHERE g.MemberId = m.Id AND g.ApplicationId = a.Id AND g.RoleId = r.Id);
```

```sql
-- check: you, system-administrator, census
SELECT m.Identifier, r.Identifier AS Role, a.Identifier AS Application
FROM membership.MemberApplicationRole g
JOIN membership.Member m ON m.Id = g.MemberId
JOIN membership.Application a ON a.Id = g.ApplicationId
JOIN core.SelectItem r ON r.Id = g.RoleId
WHERE a.Identifier = 'census';
```

Everyone else you can add from the membership page itself once step 6 is up.

## 6. Deploy and look

1. Pull the `personas` branch on the server, build, restart Census. Nothing to change in
   `appsettings.json`: it already says the fiscal year starts in October
   (`Personas:FiscalYearStartMonth` = 10) and Census's identifier is `census`
   (`Personas:EstateApplication`).
2. Open `/personas`, choose yourself in *View as*.

What to look for:

- [ ] You land on **Tracker** (Division, trimmed to your applications), *estate-wide* in the top bar.
- [ ] **Year** reads **FY2027** (2026-10-01 – 2027-09-30).
- [ ] **Administer → Membership** opens on its landing page; *Needs a word* names the gaps.
- [ ] **Administer → Feature access** shows the 16 features against your roles.
- [ ] **Curate → Releases** lists your releases; open one — fields, items, builds, events across the screen.
- [ ] Move It's own pages (`/moveit/division`): real application names, releases folded, *due* under PROD.

## If something goes wrong

- **Every Move It page fails after the deploy** → step 0a: `membership.Application` is not where
  Census reads. Tell me; the fix is in `apptrak/sql/board/applications.sql`.
- **A save on the membership page fails** → step 4 was skipped.
- **A correction on a curate page fails** → step 3 was skipped.
- **No *Administer* in the nav** → step 5: you need system-administrator held on `census`.
- **A persona sees nothing** → they hold no role in `membership.MemberApplicationRole`, or their
  role has no grants in Feature access.

Nothing here touches `health.*` or `moveit.Deployment`; the existing Move It tables only gain
the audit table beside them.
