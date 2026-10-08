// Pins the layered placement (layered-view.md §2) — a pure function, so it runs under node
// with no app: slots align by canonical name across planes, planes follow the server's
// order with unstaged last and empty planes dropped, downstream services take the side
// strip, untagged applications the unplaced row, web/spa apps draw a browser glyph.
//   node tests/Test-LayeredPlacement.mjs
import { place, ROWS, UNSTAGED } from '../Census.Web/wwwroot/js/atlas/layered-placement.mjs';

let passed = 0, failed = 0;
const assert = (name, condition, actual = '') => {
    if (condition) { passed++; console.log(`  PASS  ${name}`); }
    else { failed++; console.log(`  FAIL  ${name}  [actual: ${actual}]`); }
};

const app = (id, name, machine, stages, layer, extra = {}) => ({
    id, kind: 'application', name, machine, member: true, unclassified: false, offSystem: false,
    serves: [{ system: 'MyWeb', stages, canonicalName: 'MyWeb', ...(layer ? { layer } : {}) }], ...extra,
});
const db = (id, name, machine, stages, canonicalName) => ({
    id, kind: 'database', name, machine, member: true, unclassified: false, offSystem: false,
    serves: [{ system: 'MyWeb', stages, canonicalName }],
});
const graph = {
    system: 'MyWeb',
    stages: ['dev', 'prod'],
    nodes: [
        app('a-dev', 'myweb.dev/', 'DEVWEB', ['dev'], 'web'),
        app('a-prod', 'myweb/', 'PRODWEB', ['prod'], 'web'),
        app('a-spa', 'legacy/', 'WEB02', ['prod'], 'spa', { serves: [{ system: 'MyWeb', stages: ['prod'], layer: 'spa' }] }),
        app('a-untagged', 'other/', 'WEB03', ['prod'], null, { serves: [{ system: 'MyWeb', stages: ['prod'] }] }),
        app('a-odd', 'worker/', 'WEB03', ['prod'], 'batch', { serves: [{ system: 'MyWeb', stages: ['prod'], layer: 'batch' }] }),
        db('d-dev', 'MyDB_DEV', 'DEVSQL', ['dev'], 'MyDB'),
        db('d-prod', 'MyDB', 'PRODSQL', ['prod'], 'MyDB'),
        db('d-both', 'Shared', 'PRODSQL', ['dev', 'prod'], 'Shared'),
        // a downstream service of another system, staged qa — a plane the members never named
        { id: 'peer', kind: 'application', name: 'billing/api', machine: 'WEB01', member: false, offSystem: true, unclassified: false,
          serves: [{ system: 'BillingSvc', stages: ['qa'], layer: 'api' }] },
        // an unclassified neighbour: no stage anywhere
        { id: 'stray', kind: 'database', name: 'Stray', machine: 'SQL09', member: false, offSystem: false, unclassified: true, serves: [] },
    ],
    edges: [
        { sourceId: 'a-dev', targetId: 'd-dev' },
        { sourceId: 'a-dev', targetId: 'd-both' },
        { sourceId: 'a-prod', targetId: 'd-dev', crossing: 'down' },
        { sourceId: 'a-prod', targetId: 'stray' },
    ],
};

const p = place(graph);
const inst = (id, plane) => p.instances.find((i) => i.nodeId === id && (plane === undefined || i.stage === plane));

console.log('Planes');
assert('server order first, then the neighbour\'s qa, then unstaged; nothing empty', p.planes.map((x) => x.stage).join(','), p.planes.map((x) => x.stage).join(','));
assert('  = dev,prod,qa,(unstaged)', p.planes.map((x) => x.stage).join(',') === `dev,prod,qa,${UNSTAGED}`);

console.log('Rows');
assert('web app in the server row with a browser glyph', inst('a-dev').row === 'server' && inst('a-dev').browser === true);
assert('spa app draws the glyph and says its calls are unobserved', inst('a-spa').browser === true && inst('a-spa').unobservedCalls === true);
assert('untagged application is unplaced', inst('a-untagged').row === 'unplaced', inst('a-untagged').row);
assert('an unfamiliar layer value lands in server, value kept', inst('a-odd').row === 'server' && inst('a-odd').layer === 'batch');
assert('databases are data, by kind', inst('d-dev').row === 'data' && inst('d-prod').row === 'data');
assert('the unplaced row is listed only because something is in it', p.rows.join(',') === ROWS.join(','), p.rows.join(','));

console.log('Slots — the same column on every plane');
assert('MyDB_DEV on dev and MyDB on prod share a slot by canonical name', inst('d-dev').slot === inst('d-prod').slot, `${inst('d-dev').slot} vs ${inst('d-prod').slot}`);
assert('Shared (dev+prod) stands on both planes, same slot', inst('d-both', 'dev') && inst('d-both', 'prod') && inst('d-both', 'dev').slot === inst('d-both', 'prod').slot);
assert('the web app keeps one slot across dev and prod', inst('a-dev').slot === inst('a-prod').slot);

console.log('The side strip');
assert('a downstream service sits in the side strip on its own stage\'s plane', inst('peer').region === 'side' && inst('peer').stage === 'qa' && inst('peer').row === 'server');
assert('an unstaged neighbour sits on the unstaged plane', inst('stray').stage === UNSTAGED && inst('stray').region === 'side');

console.log('Edge endpoints');
const shared = p.endpoints(graph.edges[1]);
assert('an edge to a two-plane target lands on the shared plane', shared[0].stage === 'dev' && shared[1].stage === 'dev');
const crossing = p.endpoints(graph.edges[2]);
assert('a crossing spans planes: prod caller to dev target', crossing[0].stage === 'prod' && crossing[1].stage === 'dev');

console.log('');
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
