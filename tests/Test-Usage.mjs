// Usage's arithmetic (usage.md §4): deltas, durations, rates, unused pages, the opening scope, the days.
//   node tests/Test-Usage.mjs
import { applicationsOf, daysOf, delta, duration, notUsed, rate, scopeOf } from '../Census.Web/wwwroot/js/usage/usage-model.mjs';
import { periodOf } from '../Census.Web/wwwroot/js/personas/period.mjs';

let passed = 0, failed = 0;
const assert = (name, condition, actual = '') => {
    if (condition) { passed++; console.log(`  PASS  ${name}`); }
    else { failed++; console.log(`  FAIL  ${name}  [actual: ${actual}]`); }
};

assert('a count rose by 4', delta(23, 19).text === '+4' && delta(23, 19).up === true, JSON.stringify(delta(23, 19)));
assert('a share fell 3%', delta(97, 100, { percent: true }).text === '−3%' && delta(97, 100, { percent: true }).up === false);
assert('nothing before: new, and no comparison with nothing', delta(5, 0, { percent: true }).text === 'new' && delta(5, null).text === '');
assert('durations: 45s, 2m 05s, 1h 30m, none', duration(45) === '45s' && duration(125) === '2m 05s' && duration(5400) === '1h 30m' && duration(null) === '–');
assert('rates: 12%, <1%, 0%, nothing to divide', rate(12, 100) === '12%' && rate(1, 400) === '<1%' && rate(0, 9) === '0%' && rate(3, 0) === '–');
assert('not used this period: in the last, not in this', notUsed([{ page: 'A', views: 3 }, { page: 'B', views: 1 }], [{ page: 'A', views: 9 }]).map((p) => p.page).join() === 'B');

const apps = applicationsOf([
    { application: 'WidgetCore', stage: 'DEV', requests: 580 }, { application: 'WidgetCore', stage: 'PROD', requests: 1005 },
    { application: 'Ledger', stage: 'PROD', requests: 600 }, { application: 'Tool', stage: 'DEV', requests: 50 },
]);
assert('applications busiest first, stages busiest first', apps.map((a) => a.application).join() === 'WidgetCore,Ledger,Tool' && apps[0].stages[0].stage === 'PROD');
assert('opens on the busiest application, PROD', JSON.stringify(scopeOf(apps)) === '{"application":"WidgetCore","stage":"PROD"}', JSON.stringify(scopeOf(apps)));
assert('the address wins when the window has it', scopeOf(apps, { application: 'Ledger', stage: 'PROD' }).application === 'Ledger');
assert('every stage when asked ("")', scopeOf(apps, { application: 'WidgetCore', stage: '' }).stage === null);
assert('no PROD: every stage', scopeOf(apps, { application: 'Tool' }).stage === null);
assert('an application not in the window falls back to the busiest', scopeOf(apps, { application: 'Gone' }).application === 'WidgetCore');

const october = periodOf(new Date('2026-10-15T12:00:00'), 'month');
const days = daysOf(october, [{ day: '2026-10-02', people: 3, sessions: 4 }]);
assert('the month has 31 days, a quiet day is zero', days.length === 31 && days[1].people === 3 && days[0].people === 0, days.length);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
