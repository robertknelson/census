// Pins the layered register's lines (layered-view.md §10.3) — pure functions, so they run
// under node with no app: edges sharing two ends share one line; the loudest verdict and
// crossing win it; a line leaves the side of the card that faces the other end; a same-plane
// line is straight, a cross-plane line is routed under the bands and touches no plane.
//   node tests/Test-LayeredLines.mjs
import { pairEdges, loudest, port, linePath, laneY } from '../Census.Web/wwwroot/js/atlas/layered-lines.mjs';

let passed = 0, failed = 0;
const assert = (name, condition, actual = '') => {
    if (condition) { passed++; console.log(`  PASS  ${name}`); }
    else { failed++; console.log(`  FAIL  ${name}  [actual: ${actual}]`); }
};

console.log('Pairs');
const inst = { a: { plane: 0 }, b: { plane: 0 }, c: { plane: 2 } };
const edges = [
    { sourceId: 'a', targetId: 'b', verdict: 'unresolved', kind: 'sql' },
    { sourceId: 'a', targetId: 'c', verdict: 'confirmed', crossing: 'down', accepted: true },
    { sourceId: 'a', targetId: 'b', verdict: 'confirmed', kind: 'sql' },
    { sourceId: 'b', targetId: 'a', verdict: 'confirmed' },
    { sourceId: 'a', targetId: 'c', verdict: 'confirmed', crossing: 'down', crossingBasis: 'derived' },
    { sourceId: 'a', targetId: 'zz', verdict: 'confirmed' },
];
const pairs = pairEdges(edges, (e) => inst[e.sourceId] && inst[e.targetId] ? [inst[e.sourceId], inst[e.targetId]] : null);
assert('three pairs: a→b, a→c, b→a; the edge to an undrawn end is dropped', pairs.length === 3, pairs.length);
assert('a→b carries edges 0 and 2 in order', pairs[0].indexes.join(',') === '0,2', pairs[0].indexes.join(','));
assert('b→a is its own pair, not folded into a→b', pairs.some((p) => p.sourceId === 'b' && p.targetId === 'a'));

console.log('Loudest');
assert('confirmed beats unresolved on a→b', loudest(pairs[0].edges).verdict === 'confirmed');
assert('an unaccepted crossing beats an accepted one on a→c', loudest(pairs[1].edges).crossing === edges[4]);
assert('no crossing on b→a', loudest(pairs[2].edges).crossing === null);

console.log('Ports');
const size = { w: 168, h: 56 };
const c = { x: 500, y: 300 };
assert('a target below leaves the bottom centre', JSON.stringify(port(c, size, { x: 700, y: 420 })) === JSON.stringify({ x: 500, y: 328 }));
assert('a target above leaves the top centre', JSON.stringify(port(c, size, { x: 300, y: 100 })) === JSON.stringify({ x: 500, y: 272 }));
assert('a target level and to the right leaves the right edge', JSON.stringify(port(c, size, { x: 900, y: 310 })) === JSON.stringify({ x: 584, y: 300 }));
assert('a target level and to the left leaves the left edge', JSON.stringify(port(c, size, { x: 100, y: 300 })) === JSON.stringify({ x: 416, y: 300 }));

console.log('Paths');
const a = { plane: 0, centre: { x: 500, y: 300 } };
const b = { plane: 0, centre: { x: 700, y: 420 } };
const same = linePath(a, b, size, 999);
assert('same plane: straight, bottom of a to top of b', same.d === 'M 500 328 L 700 392' && !same.routed, same.d);
assert('  the pill sits at the midpoint', same.mid.x === 600 && same.mid.y === 360);
const far = { plane: 2, centre: { x: 1500, y: 300 } };
const routed = linePath(a, far, size, 600);
assert('different planes: routed — down, along the lane, up to the target\'s bottom edge', routed.routed && routed.d === 'M 500 328 V 590 Q 500 600 510 600 H 1490 Q 1500 600 1500 590 V 328', routed.d);
assert('  the pill sits on the lane halfway across', routed.mid.x === 1000 && routed.mid.y === 600);
const back = linePath(far, a, size, 600);
assert('  the route reads the same from the other side, corners turned the other way', back.d === 'M 1500 328 V 590 Q 1500 600 1490 600 H 510 Q 500 600 500 590 V 328', back.d);

console.log('Lanes');
assert('the first lane is half a lane below the bands, the next a lane lower', laneY(800, 28, 0) === 814 && laneY(800, 28, 1) === 842);

console.log('');
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
