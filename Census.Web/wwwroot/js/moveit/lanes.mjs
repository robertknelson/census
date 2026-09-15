// The board's columns, derived from the stage sequence (board/stages.sql). Stages that
// share a Sort are peers (VAL and UAT) and share one lane. Two lanes sit before the first
// stage for the statuses 01-where-is-everything.sql gives an item that is nowhere yet.

export const WITH_DEVS = 'with the devs';
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
        { id: WITH_DEVS, label: 'With the developers', stages: [] },
        { id: NOT_SEEN, label: 'Built, not seen', stages: [] },
        ...stageLanes,
    ];
}

export function laneFor(status, lanes) {
    if (status === 'with the devs') return WITH_DEVS;
    if (status === 'not deployed' || status === 'no evidence') return NOT_SEEN;
    return lanes.find((l) => l.stages.includes(status))?.id ?? NOT_SEEN;
}
