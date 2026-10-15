// Pins the day page's projection (day-view.md §4–§6) — pure functions, so they run under node
// with no app: the headline counts every status; identical rows across machines collapse to
// one event with the machines behind it; events fold into the four groups in a fixed order,
// empty groups are not drawn, an unknown section lands in Other.
//   node tests/Test-DayEvents.mjs
import { headline, collapse, groupOf, isDrift, meanings, GROUPS, STATUS_ORDER } from '../Census.Web/wwwroot/js/day/day-events.mjs';

let passed = 0, failed = 0;
const assert = (name, condition, actual = '') => {
    if (condition) { passed++; console.log(`  PASS  ${name}`); }
    else { failed++; console.log(`  FAIL  ${name}  [actual: ${actual}]`); }
};

const kb = { section: 'apps', kind: 'added', text: 'KB5031234' };
const cert = { section: 'certificates', kind: 'removed', text: 'CN=old.example.com' };
const site = { section: 'iisSites', kind: 'added', text: 'yourweb.example.com' };
const machines = [
    { machine: 'WEB01', status: 'changed', entries: [kb, site] },
    { machine: 'WEB02', status: 'changed', entries: [kb] },
    { machine: 'SQL01', status: 'changed', entries: [kb, cert, { section: 'mystery', kind: 'changed', text: 'x' }] },
    { machine: 'SQL02', status: 'quiet', entries: [] },
    { machine: 'LOGBOX', status: 'not-collected' },
    { machine: 'NEWBOX', status: 'first-seen' },
];

console.log('Headline');
const h = headline(machines);
assert('every status is a key, in order', Object.keys(h).join(',') === STATUS_ORDER.join(','), Object.keys(h).join(','));
assert('three changed, one quiet, one first seen, one not collected, none collected once',
    h.changed.length === 3 && h.quiet.length === 1 && h['first-seen'].length === 1 && h['not-collected'].length === 1 && h['collected-once'].length === 0,
    JSON.stringify(Object.fromEntries(Object.entries(h).map(([k, v]) => [k, v.length]))));
assert('the lists name the machines', h.quiet[0] === 'SQL02' && h['not-collected'][0] === 'LOGBOX');

console.log('Groups');
assert('four groups, deployments first', GROUPS.length === 4 && GROUPS[0].id === 'deployments');
assert('installed software is platform', groupOf('apps').id === 'platform');
assert('IIS and .NET are deployments', groupOf('iisApplications').id === 'deployments' && groupOf('dotnetSdks').id === 'deployments');
assert('certificates are security, SQL is data', groupOf('certificates').id === 'security' && groupOf('sqlDatabases').id === 'data');
assert('an unknown section is other', groupOf('mystery').id === 'other');

console.log('Collapse');
const groups = collapse(machines);
assert('groups in fixed order, only those with events: deployments, platform, security, other',
    groups.map((g) => g.id).join(',') === 'deployments,platform,security,other', groups.map((g) => g.id).join(','));
const platform = groups.find((g) => g.id === 'platform');
assert('the same patch on three machines is one event', platform.events.length === 1 && platform.events[0].machines.length === 3, JSON.stringify(platform.events));
assert('the event keeps section, kind and text', platform.events[0].section === 'apps' && platform.events[0].kind === 'added' && platform.events[0].text === 'KB5031234');
assert('the event names its machines in feed order', platform.events[0].machines.join(',') === 'WEB01,WEB02,SQL01', platform.events[0].machines.join(','));
assert('a group counts distinct machines', platform.machineCount === 3 && groups.find((g) => g.id === 'deployments').machineCount === 1);

const many = [
    { machine: 'A', status: 'changed', entries: [{ section: 'os', kind: 'changed', text: 'os.build: 1 → 2' }, { section: 'drives', kind: 'added', text: 'E:' }] },
    { machine: 'B', status: 'changed', entries: [{ section: 'drives', kind: 'added', text: 'E:' }] },
    { machine: 'C', status: 'changed', entries: [{ section: 'drives', kind: 'added', text: 'D:' }] },
];
const order = collapse(many)[0].events.map((e) => e.text);
assert('most machines first, then by text', order.join('|') === 'E:|D:|os.build: 1 → 2', order.join('|'));
assert('the same text under a different kind is a different event',
    collapse([{ machine: 'A', status: 'changed', entries: [{ section: 'drives', kind: 'added', text: 'E:' }, { section: 'drives', kind: 'removed', text: 'E:' }] }])[0].events.length === 2);
assert('quiet and uncollected machines contribute nothing', collapse([{ machine: 'Q', status: 'quiet', entries: [] }, { machine: 'N', status: 'not-collected' }]).length === 0);

console.log('Drive drift');
const c = (pf) => ({ section: 'drives', kind: 'changed', text: `C: System: percentFree ${pf}` });
const d = { section: 'drives', kind: 'changed', text: 'D: Data: percentFree 80.1 → 79.9' };
const sick = { section: 'drives', kind: 'changed', text: 'C: System: percentFree 45.0 → 42.0, healthStatus Healthy → Warning' };
assert('a free-space-only change is drift', isDrift(c('45.0 → 42.0')) && isDrift({ section: 'drives', kind: 'changed', text: 'E: : percentFree  → 12.0' }));
assert('a health change, an added drive, another section are not', !isDrift(sick) && !isDrift({ section: 'drives', kind: 'added', text: 'E:' }) && !isDrift({ section: 'os', kind: 'changed', text: 'x: percentFree 1 → 2' }));
const drifted = collapse([
    { machine: 'WEB01', status: 'changed', entries: [c('45.0 → 42.0'), d] },
    { machine: 'WEB02', status: 'changed', entries: [c('50.0 → 49.5')] },
    { machine: 'SQL01', status: 'changed', entries: [sick] },
])[0].events;
const fold = drifted.find((e) => e.folded);
assert('drift folds to one Platform event counting drives and machines once each',
    drifted.length === 2 && fold.drives === 3 && fold.machines.join(',') === 'WEB01,WEB02' && fold.section === 'drives' && fold.kind === 'changed', JSON.stringify(drifted));
assert('the fold says what it is', fold.text === 'free space drifted on 3 drives', fold.text);
assert('the health change keeps its own row', drifted.some((e) => !e.folded && e.text === sick.text && e.machines.join(',') === 'SQL01'));
assert('one drive, singular', collapse([{ machine: 'A', status: 'changed', entries: [d] }])[0].events[0].text === 'free space drifted on 1 drive');
assert('no drift, no fold', !collapse(machines).flatMap((g) => g.events).some((e) => e.folded));

console.log('What it means');
const F = (kind, severity, machine, title) => ({ key: `${kind}|${machine.toLowerCase()}|${title}`, kind, severity, machine, title, detail: `about ${machine}` });
const findings = {
    before: '2026-07-30', asOf: '2026-07-31',
    born: [F('pending-reboot', 'low', 'WEB02', 'Pending reboot'), F('certificate-expiring', 'high', 'WEB01', 'CN=a expires in 15d'), F('pending-reboot', 'low', 'APPSRV01', 'Pending reboot')],
    cleared: [F('behind-fleet-patch', 'medium', 'LOGBOX', 'Behind fleet patch level (1.2)'), F('behind-fleet-patch', 'medium', 'WEB01', 'Behind fleet patch level (1.2)'), F('never-collected', 'high', 'APPSRV01', 'Never successfully collected')],
};
const all = meanings(findings, ['WEB01', 'WEB02', 'APPSRV01', 'LOGBOX']);
assert('severity first, born before cleared, then most machines',
    all.map((r) => `${r.state}:${r.kind}`).join(',') === 'born:certificate-expiring,cleared:never-collected,cleared:behind-fleet-patch,born:pending-reboot', all.map((r) => `${r.state}:${r.kind}`).join(','));
assert('the same finding on several machines is one row', all.find((r) => r.kind === 'behind-fleet-patch').machines.join(',') === 'LOGBOX,WEB01' && all.find((r) => r.kind === 'pending-reboot').machines.length === 2);
assert('a row keeps severity, title and detail', all[0].severity === 'high' && all[0].title === 'CN=a expires in 15d' && all[0].detail === 'about WEB01');
const scoped = meanings(findings, ['web01']);
assert('the machine scope applies, case-blind', scoped.length === 2 && scoped.every((r) => r.machines.join(',') === 'WEB01'), JSON.stringify(scoped.map((r) => r.kind)));
assert('no findings, no rows', meanings(null, ['WEB01']).length === 0 && meanings({ born: [], cleared: [] }, ['WEB01']).length === 0);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
