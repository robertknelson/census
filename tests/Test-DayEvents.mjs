// Pins the day page's projection (day-view.md §4–§6) — pure functions, so they run under node
// with no app: the headline counts every status; identical rows across machines collapse to
// one event with the machines behind it; events fold into the four groups in a fixed order,
// empty groups are not drawn, an unknown section lands in Other.
//   node tests/Test-DayEvents.mjs
import { headline, collapse, groupOf, GROUPS, STATUS_ORDER } from '../Census.Web/wwwroot/js/day/day-events.mjs';

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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
