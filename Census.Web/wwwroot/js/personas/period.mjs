// The period view's arithmetic (personas.md §5): which period a day falls in at a grain, the
// one before and after, and what happened inside it for a set of applications. Pure, so it is
// tested in node (tests/Test-Period.mjs). Days are the reader's local days.
//
// Fiscal year and quarter start from fiscalStart (1-12, a setting, open item P5); a fiscal year
// is named by the calendar year it ends in. Weeks start on Monday.

// Days read yyyy-MM-dd on the reader's calendar (his Move It note 8, carried here). A date-only
// value (a target date) is that day, never midnight UTC slipping back a day.
export function isoDay(value) {
    const text = String(value);
    if (/^\d{4}-\d{2}-\d{2}(T00:00:00)?$/.test(text)) return text.slice(0, 10);
    const d = value instanceof Date ? value : new Date(text);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const GRAINS = ['year', 'quarter', 'month', 'week'];

export function grainOf(feature) {
    const grain = feature?.startsWith('view.') ? feature.slice(5) : null;
    return GRAINS.includes(grain) ? grain : null;
}

function fyName(start, fiscalStart) {
    const endYear = fiscalStart === 1 ? start.getFullYear() : start.getFullYear() + 1;
    return fiscalStart === 1 ? `${endYear}` : `FY${endYear}`;
}

function fyStartOf(day, fiscalStart) {
    const y = day.getMonth() + 1 >= fiscalStart ? day.getFullYear() : day.getFullYear() - 1;
    return new Date(y, fiscalStart - 1, 1);
}

export function periodOf(day, grain, fiscalStart = 1) {
    const d = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    let start, end, label;
    if (grain === 'year') {
        start = fyStartOf(d, fiscalStart);
        end = new Date(start.getFullYear() + 1, start.getMonth(), 1);
        label = fiscalStart === 1 ? `${start.getFullYear()}` : fyName(start, fiscalStart);
    } else if (grain === 'quarter') {
        const fy = fyStartOf(d, fiscalStart);
        const q = Math.floor(((d.getMonth() - fy.getMonth() + 12) % 12) / 3);
        start = new Date(fy.getFullYear(), fy.getMonth() + q * 3, 1);
        end = new Date(start.getFullYear(), start.getMonth() + 3, 1);
        label = `Q${q + 1} ${fyName(fy, fiscalStart)}`;
    } else if (grain === 'month') {
        start = new Date(d.getFullYear(), d.getMonth(), 1);
        end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        label = `${LONG[start.getMonth()]} ${start.getFullYear()}`;
    } else {
        start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
        end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
        label = `Week of ${isoDay(start)}`;
    }
    return { grain, start, end, label };
}

export function shiftPeriod(period, n, fiscalStart = 1) {
    let p = period;
    for (let i = 0; i < Math.abs(n); i++) {
        const probe = n > 0 ? p.end : new Date(p.start.getFullYear(), p.start.getMonth(), p.start.getDate() - 1);
        p = periodOf(probe, p.grain, fiscalStart);
    }
    return p;
}

export function contains(period, at) {
    const t = at instanceof Date ? at : new Date(at);
    return t >= period.start && t < period.end;
}

export function spanText(period) {
    const last = new Date(period.end.getFullYear(), period.end.getMonth(), period.end.getDate() - 1);
    return `${isoDay(period.start)} – ${isoDay(last)}`;
}

function counts(calendar, period, inScope) {
    const rows = calendar.filter((r) => r.ApplicationId != null && inScope(r.ApplicationId) && contains(period, r.At));
    const arrived = rows.filter((r) => r.Kind === 'arrived');
    return {
        moves: arrived.length,
        prodMoves: arrived.filter((r) => r.Stage === 'PROD').length,
        claimed: arrived.filter((r) => r.ReleaseId != null).length,
        rollbacks: rows.filter((r) => r.Kind === 'returned').length,
        approvals: rows.filter((r) => r.Kind === 'event' && r.EventKind === 'approved').length,
        arrived,
    };
}

// What happened in the period, for the applications in scope. releases is question 02, leads
// is 09, calendar is Move It's calendar rows. Shipped means a release's first arrival at PROD
// fell in the period; one that has left PROD since says so (rolledBack).
export function summarize({ releases, leads, calendar, period, applicationIds, now = new Date(), fiscalStart = 1 }) {
    const scope = new Set(applicationIds);
    const inScope = (id) => scope.has(id);
    const previous = shiftPeriod(period, -1, fiscalStart);
    const next = shiftPeriod(period, 1, fiscalStart);
    const status = new Map(releases.map((r) => [r.ReleaseId, r]));

    const shippedIn = (p) => leads.filter((l) => inScope(l.ApplicationId) && l.FirstProd && contains(p, l.FirstProd));
    const shipped = shippedIn(period)
        .map((l) => ({
            releaseId: l.ReleaseId, applicationId: l.ApplicationId, name: l.Name, kind: l.Kind,
            at: l.FirstProd, days: l.DaysEndToEnd, approvedAt: l.ApprovedAt ?? null, rolledBack: status.get(l.ReleaseId)?.HighestStage !== 'PROD',
        }))
        .sort((a, b) => String(a.at).localeCompare(String(b.at)));

    const here = counts(calendar, period, inScope);
    const before = counts(calendar, previous, inScope);

    const byApp = new Map();
    for (const r of here.arrived) {
        const a = byApp.get(r.ApplicationId) ?? { applicationId: r.ApplicationId, moves: 0, prodMoves: 0 };
        a.moves++;
        if (r.Stage === 'PROD') a.prodMoves++;
        byApp.set(r.ApplicationId, a);
    }

    const day = (v) => String(v).slice(0, 10);
    const live = (r) => r.HighestStage === 'PROD' || r.HighestStage === 'abandoned';
    const due = releases
        .filter((r) => inScope(r.ApplicationId) && r.TargetDate && !live(r))
        .filter((r) => { const t = new Date(`${day(r.TargetDate)}T00:00:00`); return t >= period.start && t < next.end; })
        .sort((a, b) => day(a.TargetDate).localeCompare(day(b.TargetDate)));

    const current = contains(period, now);
    const stuck = current
        ? releases.filter((r) => inScope(r.ApplicationId) && !live(r) && (r.OnHold === 1 || r.PastTarget === 1))
        : null;

    return {
        period, previous, next, current,
        shipped,
        tiles: {
            shipped: { now: shipped.length, before: shippedIn(previous).length },
            moves: { now: here.moves, before: before.moves },
            prodMoves: { now: here.prodMoves, before: before.prodMoves },
            rollbacks: { now: here.rollbacks, before: before.rollbacks },
            approvals: { now: here.approvals, before: before.approvals },
        },
        claimed: here.claimed,
        byApp: [...byApp.values()].sort((a, b) => b.moves - a.moves || a.applicationId - b.applicationId),
        due,
        stuck,
    };
}
