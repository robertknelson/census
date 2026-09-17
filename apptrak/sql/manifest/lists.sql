-- The five core.SelectItem lists a manifest's kinds and stages are checked against
-- before anything is written. Read-only.
SELECT y.Identifier AS List, x.Identifier AS Member
FROM core.SelectItem x JOIN core.SelectItem y ON y.Id = x.MasterId
WHERE y.Identifier IN ('stages', 'release-kinds', 'work-item-kinds', 'link-kinds', 'event-kinds')
  AND x.IsShow = 1;
