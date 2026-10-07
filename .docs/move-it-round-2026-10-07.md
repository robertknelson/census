# Move It — the stage list's order, 2026-10-07

What the real server showed on the first look (move-it.md §27): every stage lane merged
into one, *prod / val / uat / dev*, and a release in PROD since Aug 20 flagged **late** with
*48 days here*. The cause is one `Sort` value on all four rows of AppTrak's `stages` list.

## Your step — once, in SSMS, against the real AppTrak

```sql
-- look
SELECT x.Id, x.Identifier, x.Display, x.Sort, x.IsShow
FROM core.SelectItem x JOIN core.SelectItem y ON y.Id = x.MasterId
WHERE y.Identifier = 'stages' ORDER BY x.Sort, x.Id;

-- set the sequence: DEV below VAL and UAT (peers), PROD on top
UPDATE x SET x.Sort = v.Sort
FROM core.SelectItem x
JOIN core.SelectItem y ON y.Id = x.MasterId AND y.Identifier = 'stages'
JOIN (VALUES ('dev', 10), ('val', 20), ('uat', 20), ('prod', 30)) v (Identifier, Sort)
  ON v.Identifier = x.Identifier;
```

`Identifier` matches case-insensitively. Rows for stages nothing deploys to can keep any
value; the board never sees them. Reload the board; no restart.

## What to look for after

1. [ ] The red line above the board is gone and there are four stage columns: dev, then
       val / uat, then prod.
2. [ ] The Aug 20 release's chips sit in the prod column and read *shipped Aug 20*, or, since
       that is past 14 days, they are listed under the application as *Shipped: …*. **Late is
       gone.**
3. [ ] A chip in val / uat says *N days in val* or *in uat*, not *here*.
4. [ ] The header's *to PROD, 7d* is a number you believe.
5. [ ] Division and the Calendar: do the stage names now read dev, val, uat, prod in that
       order everywhere?

Bring back anything that still reads wrong, with the chip's title and its detail panel.
