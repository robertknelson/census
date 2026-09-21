-- The stage sequence as AppTrak holds it (move-it.md §10): the members of AppTrak's own
-- 'stages' list in core.SelectItem. Equal Sort means peers (VAL and UAT); the board draws
-- peers in one lane.
-- Only stages seen: a registered health endpoint or a recorded event names it. AppTrak's
-- list carries stages nobody deploys to; an empty lane for each is noise, and an unused
-- stage above PROD or between VAL and PROD would move the questions' "PROD" and "pre-PROD".
-- Every question's stg CTE applies the same filter.
-- Read-only.

SELECT x.Identifier AS Stage, x.Display, x.Sort
FROM core.SelectItem x JOIN core.SelectItem y ON y.Id = x.MasterId
WHERE y.Identifier = 'stages' AND x.IsShow = 1
  AND (EXISTS (SELECT 1 FROM health.HealthEndpoint he WHERE he.Stage = x.Identifier)
       OR EXISTS (SELECT 1 FROM moveit.ReleaseEvent re WHERE re.Stage = x.Identifier))
ORDER BY x.Sort, x.Id;
