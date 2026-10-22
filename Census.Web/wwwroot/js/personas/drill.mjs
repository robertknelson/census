import { contains } from './period.mjs';

// The drill-downs' selection (personas.md §5.3), pure so it is tested in node
// (tests/Test-Drill.mjs). Deployments are the calendar's observed rows — a build arriving at a
// stage, an older build put back — for the period and the applications in scope, newest first,
// grouped by the reader's day. Builds are those first seen in the period, newest first, with the
// releases that claim them.

const localDay = (at) => {
    const d = new Date(at);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function deploymentsIn(calendar, period, applicationIds) {
    const scope = new Set(applicationIds);
    const rows = calendar
        .filter((r) => (r.Kind === 'arrived' || r.Kind === 'returned') && scope.has(r.ApplicationId) && contains(period, r.At))
        .sort((a, b) => Date.parse(b.At) - Date.parse(a.At) || a.ApplicationId - b.ApplicationId);
    const days = [];
    for (const r of rows) {
        const day = localDay(r.At);
        if (days.at(-1)?.day !== day) days.push({ day, rows: [] });
        days.at(-1).rows.push(r);
    }
    return days;
}

// stageOrder: stage name -> sort, so "PROD, VAL" reads "VAL, PROD". releases: 02's rows, for the
// names of the claiming releases by id.
export function buildsIn(buildsSeen, period, applicationIds, stageOrder, releases) {
    const scope = new Set(applicationIds);
    const names = new Map(releases.map((r) => [r.ReleaseId, r.Name]));
    return buildsSeen
        .filter((b) => scope.has(b.ApplicationId) && contains(period, b.FirstSeen))
        .sort((a, b) => Date.parse(b.FirstSeen) - Date.parse(a.FirstSeen) || a.ApplicationId - b.ApplicationId)
        .map((b) => ({
            applicationId: b.ApplicationId,
            build: b.Build,
            firstSeen: b.FirstSeen,
            lastSeen: b.LastSeen,
            current: b.IsCurrent === 1,
            stages: String(b.Stages ?? '').split(',').map((s) => s.trim()).filter(Boolean)
                .sort((x, y) => (stageOrder.get(x) ?? 999) - (stageOrder.get(y) ?? 999)),
            claims: String(b.ClaimedByIds ?? '').split(',').filter(Boolean).map(Number)
                .map((id) => ({ releaseId: id, name: names.get(id) ?? `Release ${id}` })),
        }));
}
