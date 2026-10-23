// Trace's model (log-explorer-and-trace.md §5): a session grouped by page load (a GET outside /api/),
// errors matched to their request by correlation, idle gaps, refusals; the month grid and its totals.
//   node tests/Test-Trace.mjs
import { buildTimeline, buildMonthGrid, monthTotals, isPage, isRefused, copyPayload } from '../Census.Web/wwwroot/js/trace/trace-model.mjs';

let passed = 0, failed = 0;
const assert = (name, condition, actual = '') => {
    if (condition) { passed++; console.log(`  PASS  ${name}`); }
    else { failed++; console.log(`  FAIL  ${name}  [actual: ${actual}]`); }
};

const at = (m) => `2026-10-23T09:${String(m).padStart(2, '0')}:00-04:00`;
const trace = {
    sessionId: 's1',
    totalRequests: 6,
    requests: [
        { at: at(0), method: 'GET', path: '/api/lookups', status: 200, correlationId: 'c0' },
        { at: at(1), method: 'GET', path: '/orders', status: 200, correlationId: 'c1' },
        { at: at(2), method: 'POST', path: '/api/orders/7', status: 500, hasError: true, correlationId: 'c2', body: { id: 7 } },
        { at: at(3), method: 'PUT', path: '/api/orders/7', status: 409, correlationId: 'c3' },
        { at: at(20), method: 'GET', path: '/reports', status: 200, correlationId: 'c4' },
        { at: at(21), method: 'GET', path: '/api/reports/list', status: 200, correlationId: 'c5' },
    ],
    exceptions: [{ at: at(2), message: 'boom', correlationId: 'c2' }],
    messages: [{ at: at(3), level: 'Warning', message: 'Refused: 409', correlationId: 'c3' }],
};
const { groups, counts } = buildTimeline(trace);
assert('a GET outside /api/ is a page; an API GET is not', isPage(trace.requests[1]) && !isPage(trace.requests[0]));
assert('three groups: before the first page, /orders, /reports', groups.length === 3 && groups[0].page === null && groups[1].page.item.path === '/orders' && groups[2].page.item.path === '/reports', groups.map((g) => g.page?.item.path ?? '-').join());
assert('  /orders holds its POST, PUT, the error and the message', groups[1].lines.length === 4, groups[1].lines.length);
assert('  the POST carries its error by correlation', groups[1].lines.find((l) => l.item.correlationId === 'c2' && l.kind === 'request').item.errors === 1);
assert('  17 minutes idle before /reports', groups[2].page.idleBefore === 17, groups[2].page.idleBefore);
assert('counts: 2 pages, 6 requests, 2 writes, 1 failed, 1 refused, 1 error',
    counts.pages === 2 && counts.requests === 6 && counts.writes === 2 && counts.failed === 1 && counts.refused === 1 && counts.errors === 1, JSON.stringify(counts));
assert('a 401 is the handshake, not a refusal', !isRefused({ status: 401 }) && isRefused({ status: 403 }));
const copied = JSON.parse(copyPayload({ ...trace, identifier: 'aturner', requests: [...trace.requests].reverse() }));
assert('the copy reads oldest first, with its identifier', copied.requests[0].correlationId === 'c0' && copied.identifier === 'aturner');

const days = [
    { day: '2026-10-01', requests: 40, writes: 4, failedRequests: 1, errors: 1, sessions: 2 },
    { day: '2026-10-23', requests: 10, writes: 0, failedRequests: 0, errors: 0, sessions: 1 },
];
const weeks = buildMonthGrid(2026, 10, days, '2026-10-23');
const cells = weeks.flat();
assert('October 2026 starts on a Thursday: four days before it are out', cells.slice(0, 4).every((c) => !c.inMonth) && cells[4].day === '2026-10-01', cells[4]?.day);
assert('  weeks of seven, ending with the month', weeks.every((w) => w.length === 7) && cells.filter((c) => c.inMonth).length === 31);
assert('  the busiest day is the darkest step, a quarter of it one step', cells[4].level === 4 && cells.find((c) => c.day === '2026-10-23').level === 1);
assert('  the picked day is marked', cells.find((c) => c.day === '2026-10-23').selected);
assert('  errors are failed requests plus logged errors', cells[4].errors === 2);
const totals = monthTotals(days);
assert('the month: 2 days active, 50 requests, 4 writes, 2 errors', totals.daysActive === 2 && totals.requests === 50 && totals.writes === 4 && totals.errors === 2, JSON.stringify(totals));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
