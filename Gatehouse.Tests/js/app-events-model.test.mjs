// The unit-of-work arithmetic (gatehouse.md §12.6): each step under its cause, each gap named waiting or working, the
// totals, and the status by the same rule as works.sql.
//   node Gatehouse.Tests/js/app-events-model.test.mjs
import { buildWork, duration, gapKind, statusOf } from '../../Gatehouse.Web/wwwroot/js/app-events/app-events-model.mjs';

let passed = 0, failed = 0;
const assert = (name, condition, actual = '') => {
    if (condition) { passed++; console.log(`  PASS  ${name}`); }
    else { failed++; console.log(`  FAIL  ${name}  [actual: ${actual}]`); }
};

const at = (minutes) => new Date(Date.UTC(2026, 9, 20, 9, 0, 0) + minutes * 60_000).toISOString();
const e = (uid, parentUid, application, activity, minutes, lagMinutes = 0) =>
    ({ uid, parentUid, application, activity, startAt: at(minutes), createdAt: at(minutes + lagMinutes) });
const events = [
    e('a', null, 'Portal', 'created', 0),
    e('b', 'a', 'Portal', 'handed-off', 0.1),
    e('c', 'b', 'Ledger', 'received', 20.1),
    e('d', 'c', 'Ledger', 'started', 21.1),
    e('f', 'd', 'Ledger', 'completed', 31.1, 90),
    e('g', 'f', 'Portal', 'completed', 32.1),
];
const w = buildWork(events);
assert('steps under their causes', w.steps.map((s) => s.depth).join() === '0,1,2,3,4,5', w.steps.map((s) => s.depth).join());
assert('a hand-off to its receipt is waiting', w.steps[2].gapKind === 'waiting' && w.waitingSeconds === 1200, `${w.steps[2].gapKind} ${w.waitingSeconds}`);
assert('started to completed is working', w.steps[4].gapKind === 'working' && w.workingSeconds === 600, `${w.steps[4].gapKind} ${w.workingSeconds}`);
assert('the total is first step to last', w.totalSeconds === 1926, w.totalSeconds);
assert('a late arrival is measured', w.steps[4].lagSeconds === 5400, w.steps[4].lagSeconds);
assert('completed by its creator: completed', w.status === 'completed', w.status);
assert('the systems it crossed, in order', w.applications.join() === 'Portal,Ledger', w.applications.join());

assert('a failure anywhere: failed', statusOf([...events.slice(0, 4), e('x', 'd', 'Ledger', 'failed', 25)]) === 'failed');
assert('completed by another system only: still running', statusOf(events.slice(0, 5)) === 'running', statusOf(events.slice(0, 5)));
const later = (hours) => ({ stuckHours: 4, now: Date.parse(at(0)) + hours * 3_600_000 });
assert('a hand-off older than the setting: stuck', statusOf(events.slice(0, 2), later(5)) === 'stuck', statusOf(events.slice(0, 2), later(5)));
assert('  younger: still running', statusOf(events.slice(0, 2), later(1)) === 'running', statusOf(events.slice(0, 2), later(1)));
assert('a cause outside the unit is marked', buildWork([e('z', 'missing', 'Portal', 'received', 0)]).steps[0].orphan === true);
assert('the first step has no gap', w.steps[0].gapKind === null && w.steps[0].gapSeconds === null);
assert('gap kinds otherwise "after"', gapKind({ activity: 'created' }, { activity: 'handed-off' }) === 'after');
assert('durations read as people say them', [duration(42), duration(125), duration(3 * 3600 + 120), duration(3 * 86400 + 7200)].join('|') === '42s|2m 05s|3h 02m|3d 2h',
    [duration(42), duration(125), duration(3 * 3600 + 120), duration(3 * 86400 + 7200)].join('|'));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
