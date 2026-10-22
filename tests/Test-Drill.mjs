// The drill-downs' selection (personas.md §5.3): deployments in the period and scope, newest
// first, grouped by day, rollbacks kept; builds first seen in the period, stages in stage order,
// claims named from the releases.
//   node tests/Test-Drill.mjs
import { buildsIn, deploymentsIn } from '../Census.Web/wwwroot/js/personas/drill.mjs';
import { periodOf } from '../Census.Web/wwwroot/js/personas/period.mjs';

let passed = 0, failed = 0;
const assert = (name, condition, actual = '') => {
    if (condition) { passed++; console.log(`  PASS  ${name}`); }
    else { failed++; console.log(`  FAIL  ${name}  [actual: ${actual}]`); }
};

const august = periodOf(new Date('2026-08-15T12:00:00'), 'month');
const calendar = [
    { Kind: 'arrived', At: '2026-08-03T12:00:00', ApplicationId: 1, Stage: 'DEV', Build: 'a' },
    { Kind: 'arrived', At: '2026-08-03T14:00:00', ApplicationId: 2, Stage: 'VAL', Build: 'b', ReleaseId: 4, Release: 'R4' },
    { Kind: 'returned', At: '2026-08-27T12:00:00', ApplicationId: 1, Stage: 'PROD', Build: 'a', ReplacedBuild: 'c' },
    { Kind: 'event', At: '2026-08-10T12:00:00', ApplicationId: 1, EventKind: 'approved' },
    { Kind: 'arrived', At: '2026-07-31T12:00:00', ApplicationId: 1, Stage: 'DEV', Build: 'z' },
    { Kind: 'arrived', At: '2026-08-05T12:00:00', ApplicationId: 3, Stage: 'DEV', Build: 'x' },
];
const days = deploymentsIn(calendar, august, [1, 2]);
assert('two days, newest first', days.map((d) => d.day).join() === '2026-08-27,2026-08-03', days.map((d) => d.day).join());
assert('  the rollback is kept', days[0].rows[0].Kind === 'returned');
assert('  the 3rd holds both arrivals; events, other months and other applications left out', days[1].rows.length === 2 && days.flatMap((d) => d.rows).every((r) => r.Kind !== 'event' && r.ApplicationId !== 3));

const seen = [
    { ApplicationId: 1, Build: 'a', FirstSeen: '2026-08-03T12:00:00', LastSeen: '2026-08-27T12:00:00', IsCurrent: 1, Stages: 'PROD, DEV', ClaimedByIds: '7,9' },
    { ApplicationId: 1, Build: 'z', FirstSeen: '2026-07-31T12:00:00', IsCurrent: 0, Stages: 'DEV', ClaimedByIds: null },
    { ApplicationId: 2, Build: 'b', FirstSeen: '2026-08-20T12:00:00', IsCurrent: 0, Stages: 'VAL', ClaimedByIds: null },
    { ApplicationId: 3, Build: 'x', FirstSeen: '2026-08-05T12:00:00', IsCurrent: 0, Stages: 'DEV', ClaimedByIds: null },
];
const order = new Map([['DEV', 10], ['VAL', 20], ['PROD', 30]]);
const builds = buildsIn(seen, august, [1, 2], order, [{ ReleaseId: 7, Name: 'Sprint, with a comma' }, { ReleaseId: 9, Name: 'Hotfix' }]);
assert('builds first seen in August, in scope, newest first', builds.map((b) => b.build).join() === 'b,a', builds.map((b) => b.build).join());
assert('  stages read in stage order', builds[1].stages.join() === 'DEV,PROD', builds[1].stages.join());
assert('  claims named by id, a comma in a name does no harm', builds[1].claims.map((c) => c.name).join('|') === 'Sprint, with a comma|Hotfix');
assert('  an unclaimed build has no claims', builds[0].claims.length === 0);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
