// Pins the board's lane classification (move-it.md §27, §29): a shipped item folds out of the
// top lane after shippedDays — except each application's most recently shipped item, which
// stays so the lane reads as the current state. Pure, so it runs under node with no app:
//   node tests/Test-BoardLanes.mjs
import { classifyItems } from '../Census.Web/wwwroot/js/moveit/board-panel.mjs';
import { buildLanes } from '../Census.Web/wwwroot/js/moveit/lanes.mjs';

let passed = 0, failed = 0;
const assert = (name, condition, actual = '') => {
    if (condition) { passed++; console.log(`  PASS  ${name}`); }
    else { failed++; console.log(`  FAIL  ${name}  [actual: ${actual}]`); }
};

const DAY = 86_400_000;
const now = Date.parse('2026-10-09T12:00:00Z');
const ago = (d) => new Date(now - d * DAY).toISOString();
const lanes = buildLanes([{ Stage: 'DEV', Sort: 10 }, { Stage: 'VAL', Sort: 20 }, { Stage: 'PROD', Sort: 30 }]);
const items = [
    { WorkItemId: 1, ApplicationId: 1, Status: 'PROD', Since: ago(60) },
    { WorkItemId: 2, ApplicationId: 1, Status: 'PROD', Since: ago(40) },
    { WorkItemId: 3, ApplicationId: 1, Status: 'PROD', Since: ago(20) },
    { WorkItemId: 4, ApplicationId: 1, Status: 'VAL', Since: ago(3) },
    { WorkItemId: 5, ApplicationId: 2, Status: 'PROD', Since: ago(90) },
    { WorkItemId: 6, ApplicationId: 3, Status: 'PROD', Since: ago(2) },
    { WorkItemId: 7, ApplicationId: 3, Status: 'PROD', Since: ago(30) },
    { WorkItemId: 8, ApplicationId: 1, Status: 'removed', Since: ago(1) },
];
const c = classifyItems({ lanes, items, now, shippedDays: 14 });
const by = (id) => c.find((x) => x.item.WorkItemId === id);

assert('removed items are not classified', !by(8));
assert('app 1: the latest shipped (20 days) stays in PROD though past the window', by(3).shipped && !by(3).folded);
assert('app 1: the two older shipped items fold', by(1).folded && by(2).folded);
assert('app 1: an item at VAL is neither shipped nor folded', !by(4).shipped && !by(4).folded);
assert('app 2: a lone shipped item 90 days old still stays', !by(5).folded);
assert('app 3: within the window nothing folds, the older one is the only fold candidate', !by(6).folded && by(7).folded);

const one = classifyItems({ lanes: buildLanes([{ Stage: 'PROD', Sort: 30 }]), items: items.slice(0, 1), now, shippedDays: 14 });
assert('with one stage lane there is no top: nothing is shipped', !one[0].shipped && !one[0].folded);

console.log('');
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
