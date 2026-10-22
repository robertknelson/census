// The period view's arithmetic (personas.md §5): periods at each grain, fiscal years named by
// the year they end in, stepping across boundaries, and what counts as shipped, moved, due and
// stuck for the applications in scope.
//   node tests/Test-Period.mjs
import { grainOf, periodOf, shiftPeriod, spanText, summarize } from '../Census.Web/wwwroot/js/personas/period.mjs';

let passed = 0, failed = 0;
const assert = (name, condition, actual = '') => {
    if (condition) { passed++; console.log(`  PASS  ${name}`); }
    else { failed++; console.log(`  FAIL  ${name}  [actual: ${actual}]`); }
};
const day = (s) => new Date(`${s}T12:00:00`);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const span = (p) => `${iso(p.start)}..${iso(p.end)}`;

assert('grainOf reads view.* only', grainOf('view.quarter') === 'quarter' && grainOf('drill.builds') === null && grainOf('view.decade') === null);

let p = periodOf(day('2026-10-22'), 'year', 1);
assert('calendar year', p.label === '2026' && span(p) === '2026-01-01..2027-01-01', `${p.label} ${span(p)}`);
p = periodOf(day('2026-10-22'), 'year', 10);
assert('fiscal year from October is named by the year it ends in', p.label === 'FY27' && span(p) === '2026-10-01..2027-10-01', `${p.label} ${span(p)}`);
p = periodOf(day('2026-09-30'), 'year', 10);
assert('  the day before it is FY26', p.label === 'FY26' && span(p) === '2025-10-01..2026-10-01', `${p.label} ${span(p)}`);
p = periodOf(day('2026-10-22'), 'quarter', 10);
assert('fiscal Q1 starts the fiscal year', p.label === 'Q1 FY27' && span(p) === '2026-10-01..2027-01-01', `${p.label} ${span(p)}`);
p = periodOf(day('2026-08-15'), 'quarter', 1);
assert('calendar Q3', p.label === 'Q3 2026' && span(p) === '2026-07-01..2026-10-01', `${p.label} ${span(p)}`);
p = periodOf(day('2026-10-22'), 'month');
assert('month', p.label === 'October 2026' && span(p) === '2026-10-01..2026-11-01', `${p.label} ${span(p)}`);
p = periodOf(day('2026-10-22'), 'week');
assert('a week starts on Monday', p.label === 'Week of 2026-10-19' && span(p) === '2026-10-19..2026-10-26', `${p.label} ${span(p)}`);
p = periodOf(day('2026-11-01'), 'week');
assert('  a Sunday belongs to the week before', iso(p.start) === '2026-10-26', iso(p.start));

const q = periodOf(day('2026-08-15'), 'quarter', 1);
assert('stepping back a quarter', shiftPeriod(q, -1).label === 'Q2 2026');
assert('stepping forward across the year', shiftPeriod(q, 2).label === 'Q1 2027', shiftPeriod(q, 2).label);
assert('stepping weeks across a month end', iso(shiftPeriod(periodOf(day('2026-10-28'), 'week'), 1).start) === '2026-11-02');
assert('the span reads as yyyy-MM-dd days', spanText(periodOf(day('2026-08-15'), 'month')) === '2026-08-01 – 2026-08-31', spanText(periodOf(day('2026-08-15'), 'month')));

// Two applications in scope (1, 2); 3 is not.
const releases = [
    { ReleaseId: 1, ApplicationId: 1, Name: 'A', HighestStage: 'PROD', OnHold: 0, PastTarget: 0, TargetDate: '2026-08-07T00:00:00' },
    { ReleaseId: 2, ApplicationId: 1, Name: 'B', HighestStage: 'DEV', OnHold: 1, HoldReason: 'rolled back', PastTarget: 1, TargetDate: '2026-09-01T00:00:00' },
    { ReleaseId: 3, ApplicationId: 2, Name: 'C', HighestStage: 'UAT', OnHold: 0, PastTarget: 0, TargetDate: '2026-11-20T00:00:00' },
    { ReleaseId: 4, ApplicationId: 3, Name: 'D', HighestStage: 'VAL', OnHold: 1, PastTarget: 1, TargetDate: '2026-10-10T00:00:00' },
];
const leads = [
    { ReleaseId: 1, ApplicationId: 1, Name: 'A', Kind: 'featureset', FirstProd: '2026-08-05T00:00:00+00:00', DaysEndToEnd: 30, ApprovedAt: '2026-08-03T15:00:00+00:00' },
    { ReleaseId: 2, ApplicationId: 1, Name: 'B', Kind: 'featureset', FirstProd: '2026-08-30T00:00:00+00:00', DaysEndToEnd: 25 },
    { ReleaseId: 5, ApplicationId: 1, Name: 'E', Kind: 'hotfix', FirstProd: '2026-07-10T00:00:00+00:00', DaysEndToEnd: 1 },
    { ReleaseId: 4, ApplicationId: 3, Name: 'D', Kind: 'featureset', FirstProd: '2026-08-12T00:00:00+00:00', DaysEndToEnd: 9 },
];
const cal = (Kind, At, ApplicationId, extra = {}) => ({ Kind, At, ApplicationId, ...extra });
const calendar = [
    cal('arrived', '2026-08-03T00:00:00+00:00', 1, { Stage: 'DEV', ReleaseId: 1 }),
    cal('arrived', '2026-08-05T00:00:00+00:00', 1, { Stage: 'PROD', ReleaseId: 1 }),
    cal('arrived', '2026-08-06T00:00:00+00:00', 1, { Stage: 'DEV', ReleaseId: null }),
    cal('arrived', '2026-08-20T00:00:00+00:00', 2, { Stage: 'UAT', ReleaseId: 3 }),
    cal('returned', '2026-08-31T00:00:00+00:00', 1, { Stage: 'PROD' }),
    cal('event', '2026-08-03T15:00:00+00:00', 1, { EventKind: 'approved' }),
    cal('event', '2026-08-04T15:00:00+00:00', 1, { EventKind: 'hold' }),
    cal('arrived', '2026-07-02T00:00:00+00:00', 1, { Stage: 'DEV', ReleaseId: 1 }),
    cal('arrived', '2026-08-09T00:00:00+00:00', 3, { Stage: 'DEV', ReleaseId: 4 }),
    cal('recorded-through', '2026-09-14T00:00:00+00:00', null),
];
const august = periodOf(day('2026-08-15'), 'month');
const s = summarize({ releases, leads, calendar, period: august, applicationIds: [1, 2], now: day('2026-08-20') });
assert('shipped: first arrival at PROD inside the month, in scope only', s.shipped.map((r) => r.name).join() === 'A,B', s.shipped.map((r) => r.name).join());
assert('  shipped rows carry their approval, or none', s.shipped[0].approvedAt === '2026-08-03T15:00:00+00:00' && s.shipped[1].approvedAt === null);
assert('  one that left PROD since says so', s.shipped.find((r) => r.name === 'B').rolledBack && !s.shipped.find((r) => r.name === 'A').rolledBack);
assert('  against July: 1 (the hotfix)', s.tiles.shipped.before === 1, s.tiles.shipped.before);
assert('moves count arrivals in scope; out-of-scope and other months left out', s.tiles.moves.now === 4 && s.tiles.moves.before === 1, `${s.tiles.moves.now}/${s.tiles.moves.before}`);
assert('  to production, rollbacks and approvals counted apart', s.tiles.prodMoves.now === 1 && s.tiles.rollbacks.now === 1 && s.tiles.approvals.now === 1);
assert('  claimed: 3 of 4 belong to a release', s.claimed === 3, s.claimed);
assert('where the change landed: busiest first', s.byApp.map((a) => `${a.applicationId}:${a.moves}/${a.prodMoves}`).join() === '1:3/1,2:1/0', s.byApp.map((a) => `${a.applicationId}:${a.moves}`).join());
assert('due this month and next: not live, target inside, in scope', s.due.map((r) => r.Name).join() === 'B', s.due.map((r) => r.Name).join());
assert('stuck shows in the period holding today: on hold or past target, in scope', s.current && s.stuck.map((r) => r.Name).join() === 'B', s.stuck?.map((r) => r.Name).join());
const later = summarize({ releases, leads, calendar, period: august, applicationIds: [1, 2], now: day('2026-10-22') });
assert('  and not in a past period', !later.current && later.stuck === null);
const oct = summarize({ releases, leads, calendar, period: periodOf(day('2026-10-22'), 'month'), applicationIds: [1, 2], now: day('2026-10-22') });
assert('an empty month: nothing shipped, nothing moved; C due next month', oct.shipped.length === 0 && oct.tiles.moves.now === 0 && oct.due.map((r) => r.Name).join() === 'C', oct.due.map((r) => r.Name).join());

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
