-- The stage sequence as AppTrak holds it (move-it.md §10): the members of AppTrak's own
-- 'stage' list in core.SelectItem. Equal Sort means peers (VAL and UAT); the board draws
-- peers in one lane.
-- Read-only.

SELECT x.Identifier AS Stage, x.Display, x.Sort
FROM core.SelectItem x JOIN core.SelectItem y ON y.Id = x.MasterId
WHERE y.Identifier = 'stage' AND x.IsShow = 1
ORDER BY x.Sort, x.Id;
