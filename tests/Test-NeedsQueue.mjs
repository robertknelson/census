// The Needs you queue (personas.md §5.2): History's rules as they are, plus empty releases,
// current order violations, stage disagreements and releases ready for the client — each in
// scope only, each linking to where it is fixed.
//   node tests/Test-NeedsQueue.mjs
import { SECTIONS, actionsFor, buildQueue, requestFor } from '../Census.Web/wwwroot/js/personas/needs-queue.mjs';

let passed = 0, failed = 0;
const assert = (name, condition, actual = '') => {
    if (condition) { passed++; console.log(`  PASS  ${name}`); }
    else { failed++; console.log(`  FAIL  ${name}  [actual: ${actual}]`); }
};

const now = Date.parse('2026-10-22T12:00:00Z');
const ago = (d) => new Date(now - d * 86_400_000).toISOString();
const stages = [{ Stage: 'DEV', Sort: 10 }, { Stage: 'VAL', Sort: 20 }, { Stage: 'PROD', Sort: 30 }];
const applications = [{ ApplicationId: 1, Name: 'One' }, { ApplicationId: 2, Name: 'Two' }, { ApplicationId: 3, Name: 'Three' }];
const status = [
    { ReleaseId: 1, ApplicationId: 1, Name: 'Late', Kind: 'featureset', Composition: 'mixed', HighestStage: 'VAL', Since: ago(3), OnHold: 0, PastTarget: 1, TargetDate: '2026-10-01T00:00:00' },
    { ReleaseId: 2, ApplicationId: 1, Name: 'Shell', Kind: 'featureset', Composition: 'empty', HighestStage: 'no evidence', Since: null, OnHold: 0, PastTarget: 0 },
    { ReleaseId: 3, ApplicationId: 2, Name: 'Unsigned', Kind: 'featureset', Composition: 'features only', HighestStage: 'PROD', Since: ago(5), OnHold: 0, PastTarget: 0 },
    { ReleaseId: 4, ApplicationId: 3, Name: 'Elsewhere', Kind: 'featureset', Composition: 'empty', HighestStage: 'VAL', Since: ago(30), OnHold: 0, PastTarget: 1 },
    { ReleaseId: 5, ApplicationId: 1, Name: 'Dropped', Kind: 'featureset', Composition: 'empty', HighestStage: 'abandoned', Since: null, OnHold: 0, PastTarget: 0 },
];
const data = {
    stages, applications, status,
    items: [{ ApplicationId: 2, Title: 'Old idea', Status: 'no release', Since: ago(90) }],
    events: [],
    approvals: [{ Item: 'PROD without approval', ReleaseId: 3 }],
    history: [
        { ApplicationId: 1, Build: 'b1', Stage: 'VAL', ReleaseId: null },
        { ApplicationId: 1, Build: 'b2', Stage: 'DEV', ReleaseId: null },
        { ApplicationId: 3, Build: 'b3', Stage: 'PROD', ReleaseId: null },
    ],
    ready: [
        { ReleaseId: 1, ApplicationId: 1, Name: 'Late', AtStage: 'VAL', Ready: 1, Blockers: null },
        { ReleaseId: 6, ApplicationId: 2, Name: 'Blocked', AtStage: 'VAL', Ready: 0, Blockers: 'Fix X (nowhere)' },
    ],
    violations: [
        { Violation: 'current', DependentApp: 2, Dependent: 'Viewer', DependentStage: 'PROD', DependsOn: 'Trail', DependsOnStage: 'DEV', Note: 'reads the trail' },
        { Violation: 'historical', DependentApp: 2, Dependent: 'Dash', DependentStage: null, DependsOn: 'Rules', DependsOnStage: null },
    ],
    mismatches: [{ ApplicationId: 2, Identifier: 'two-val', RegisteredStage: 'VAL', ReportedStage: 'PROD', Machine: 'WEBVAL01' }],
};
const settings = { staleDays: 14, comingDays: 60 };

const queue = buildQueue(data, settings, [1, 2], now);
const section = (id) => queue.find((s) => s.id === id)?.lines ?? [];
const titles = (id) => section(id).map((l) => l.title).join(',');

assert('sections keep the declared order and drop empty ones', queue.map((s) => s.id).join() === SECTIONS.map((s) => s.id).filter((id) => queue.some((q) => q.id === id)).join());
assert('application 3 is out of scope: none of its lines', queue.every((s) => s.lines.every((l) => l.applicationId !== 3)));
assert('inbox: each unnamed build past DEV is its own line (the DEV build is not counted)', titles('inbox') === 'b1', titles('inbox'));
assert('  it can be claimed for a release of its application, not an abandoned one', section('inbox')[0].actions[0].kind === 'claim' && section('inbox')[0].actions[0].choices.map((c) => c.name).join() === 'Late,Shell', section('inbox')[0].actions[0].choices.map((c) => c.name).join());
assert('releases: Late past target with no hold; Unsigned live with no approval', titles('release') === 'Late,Unsigned', titles('release'));
assert('  each links to its release page', section('release').every((l) => /^\/moveit\/release\/\d+$/.test(l.href)));
assert('empty: Shell, not the abandoned one', titles('empty') === 'Shell', titles('empty'));
assert('heard, still in no release after 60 days', titles('item') === 'Old idea', titles('item'));
assert('order: the current violation only', titles('order') === 'Viewer' && section('order')[0].why.includes('Trail is at DEV'), section('order')[0]?.why);
assert('stage: registered VAL, reports PROD', titles('stage') === 'two-val' && section('stage')[0].why === 'registered VAL, reports PROD on WEBVAL01', section('stage')[0]?.why);
assert('approve: ready and blocked both shown, each saying which', titles('approve') === 'Late,Blocked' && section('approve')[1].why.includes('blocked by Fix X'), section('approve').map((l) => l.why).join(' | '));
assert('nothing in scope, nothing in the queue', buildQueue(data, settings, [], now).length === 0);

const late = section('release').find((l) => l.title === 'Late');
const unsigned = section('release').find((l) => l.title === 'Unsigned');
assert('past target with no hold offers a hold', late.actions.map((a) => a.kind).join() === 'hold', late.actions.map((a) => a.kind).join());
assert('live with no approval offers to record it, at the top stage', unsigned.actions[0].kind === 'approve' && unsigned.actions[0].stage === 'PROD');
assert('ready for the client offers the approval; blocked offers nothing', section('approve')[0].actions[0]?.kind === 'approve' && section('approve')[1].actions.length === 0);
assert('information lines offer nothing', ['order', 'stage', 'item'].every((id) => section(id).every((l) => l.actions.length === 0)));

const curator = { applications: [{ applicationId: 1, features: ['curate.events', 'curate.associations'] }, { applicationId: 2, features: ['curate.events'] }] };
const reader = { applications: [{ applicationId: 1, features: ['view.month'] }, { applicationId: 2, features: [] }] };
assert('a curator sees the actions their features allow, application by application', actionsFor(late, curator).length === 1 && actionsFor(section('inbox')[0], curator).length === 1);
assert('  events on Two but not associations: no claims there', actionsFor({ applicationId: 2, actions: [{ kind: 'claim', feature: 'curate.associations' }] }, curator).length === 0);
assert('a reader sees none', actionsFor(late, reader).length === 0 && actionsFor(unsigned, reader).length === 0);

const at = new Date('2026-10-22T14:00:00Z');
const claim = requestFor(section('inbox')[0].actions[0], { releaseId: '2' }, 'demo-sam', at);
assert('a claim posts claim-build with the build, the release and the member', claim.endpoint === 'claim-build' && claim.body.releaseId === 2 && claim.body.build === 'b1' && claim.body.by === 'demo-sam');
const approve = requestFor(unsigned.actions[0], { note: '' }, 'demo-sam', at);
assert('an approval posts an approved event at PROD, by the member, now', approve.endpoint === 'event' && approve.body.kind === 'approved' && approve.body.stage === 'PROD' && approve.body.by === 'demo-sam' && approve.body.at === at.toISOString() && approve.body.note === null);
const hold = requestFor(late.actions[0], { note: 'waiting on the vendor' }, 'demo-ada', at);
assert('a hold posts a hold event carrying the reason', hold.body.kind === 'hold' && hold.body.note === 'waiting on the vendor' && hold.body.releaseId === 1);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
