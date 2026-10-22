// The board's columns, derived from the stage sequence (board/stages.sql). Stages that
// share a Sort are peers (VAL and UAT) and share one lane. Two lanes sit before the first
// stage for the statuses 01-where-is-everything.sql gives an item that is nowhere yet:
// Coming (no release, or with the devs — move-it.md §20) and built, not seen.

export const COMING = 'coming';
export const NOT_SEEN = 'not seen';

export function buildLanes(stages) {
    const bySort = new Map();
    for (const s of stages) {
        if (!bySort.has(s.Sort)) bySort.set(s.Sort, []);
        bySort.get(s.Sort).push(s.Stage);
    }
    const stageLanes = [...bySort.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([sort, names]) => ({ id: `stage-${sort}`, label: names.join(' / '), stages: names }));
    return [
        { id: COMING, label: 'Coming', stages: [] },
        { id: NOT_SEEN, label: 'Built, not yet seen deployed', stages: [] },
        ...stageLanes,
    ];
}

// The stage lanes only: the two pre-stage lanes carry no stage names.
export function stageLanes(lanes) {
    return lanes.filter((l) => l.stages.length > 0);
}

// The top lane: the stage with the highest Sort, PROD in any list that is ordered. Meaningful
// only when the board has more than one stage lane; with one, "top" is just "the only one".
export function topLane(lanes) {
    const staged = stageLanes(lanes);
    return staged.length > 1 ? staged[staged.length - 1] : null;
}

// AppTrak's list gives every seen stage the same Sort: there is no sequence to draw, and
// every question that ranks stages (highest stage, pre-PROD, late) is guessing. The board
// says so instead of drawing one merged lane as if it meant something.
export function unorderedStages(stages) {
    return stages.length > 1 && new Set(stages.map((s) => s.Sort)).size === 1;
}

export function laneFor(status, lanes) {
    if (status === 'no release' || status === 'with the devs') return COMING;
    if (status === 'not deployed' || status === 'no evidence') return NOT_SEEN;
    return lanes.find((l) => l.stages.includes(status))?.id ?? NOT_SEEN;
}
