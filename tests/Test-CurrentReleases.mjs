// The "current" rule (move-it.md §19.1 and §28.2): on the way, recently live, or the newest
// live release of its application; superseded and abandoned releases are not current.
//   node tests/Test-CurrentReleases.mjs
import { classifyReleases, currentReleases } from '../Census.Web/wwwroot/js/moveit/release-panel.mjs';
import { buildLanes } from '../Census.Web/wwwroot/js/moveit/lanes.mjs';

let passed = 0, failed = 0;
const assert = (name, condition, actual = '') => {
    if (condition) { passed++; console.log(`  PASS  ${name}`); }
    else { failed++; console.log(`  FAIL  ${name}  [actual: ${actual}]`); }
};

const stages = [{ Stage: 'DEV', Sort: 1 }, { Stage: 'UAT', Sort: 2 }, { Stage: 'PROD', Sort: 3 }];
const lanes = buildLanes(stages);
const now = Date.parse('2026-10-16T12:00:00Z');
const DAY = 86_400_000;
const ago = (d) => new Date(now - d * DAY).toISOString();
const rel = (id, app, stage, since) => ({ ReleaseId: id, ApplicationId: app, Name: `R${id}`, HighestStage: stage, Since: since });
const item = (release, status) => ({ ReleaseId: release, Status: status });

// App 1: R1 live 60 days ago (superseded), R2 live 30 days ago (what is in PROD), R3 in UAT.
// App 2: R4 live 5 days ago (recent), R5 live 40 days ago (superseded), R6 abandoned.
// App 3: R7 live 90 days ago, its only release (in PROD).
const releases = [
    rel(1, 1, 'PROD', ago(60)), rel(2, 1, 'PROD', ago(30)), rel(3, 1, 'UAT', ago(3)),
    rel(4, 2, 'PROD', ago(5)), rel(5, 2, 'PROD', ago(40)), rel(6, 2, 'abandoned', ago(10)),
    rel(7, 3, 'PROD', ago(90)),
];
const items = [item(1, 'PROD'), item(2, 'PROD'), item(3, 'UAT'), item(4, 'PROD'), item(5, 'PROD'), item(7, 'PROD')];
const cards = classifyReleases({ lanes, items, releases, now, shippedDays: 14 });
const current = currentReleases(cards);
const ids = [...current].map((c) => c.release.ReleaseId).sort((a, b) => a - b);

console.log('The current rule');
assert('on the way is current (R3)', current.has(cards[2]));
assert('the newest live of an application is current however old (R2, R7)', current.has(cards[1]) && current.has(cards[6]));
assert('a superseded live release is not current (R1, R5)', !current.has(cards[0]) && !current.has(cards[4]));
assert('recently live is current (R4)', current.has(cards[3]));
assert('abandoned is never current (R6)', !current.has(cards[5]));
assert('the set is exactly R2, R3, R4, R7', ids.join(',') === '2,3,4,7', ids.join(','));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
