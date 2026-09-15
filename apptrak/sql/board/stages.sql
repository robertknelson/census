-- The stage sequence as AppTrak holds it (move-it.md §10): rows grouped 'Stage' in
-- core.SelectItem. Equal Sort means peers (VAL and UAT); the board draws peers in one lane.
-- Read-only.

SELECT Identifier AS Stage, Display, Sort
FROM core.SelectItem
WHERE Grouping = 'Stage'
ORDER BY Sort, Id;
