// The calendar's release hues (move-it.md §21.2): busiest release first, ties by first day,
// the palette's length is the cap, unnamed builds and the overflow read neutral.
//   node tests/Test-ReleaseHues.mjs
import { assignReleaseHues, hueOf, NEUTRAL_HUE } from '../Census.Web/wwwroot/js/moveit/release-hues.mjs';

let passed = 0, failed = 0;
const assert = (name, condition, actual = '') => {
    if (condition) { passed++; console.log(`  PASS  ${name}`); }
    else { failed++; console.log(`  FAIL  ${name}  [actual: ${actual}]`); }
};

const e = (ReleaseId, day, Release = `R${ReleaseId}`) => ({ ReleaseId, Release, ApplicationId: 1, day });
const entries = [
    e(1, '2026-08-03'), e(1, '2026-08-10'), e(1, '2026-08-24'),      // three days
    e(2, '2026-08-05'), e(2, '2026-08-06'),                          // two days
    e(3, '2026-08-01'), e(3, '2026-08-31'),                          // two days, earlier first day
    e(4, '2026-08-20'),                                              // one day
    { ReleaseId: null, Release: null, ApplicationId: 1, day: '2026-08-02' }, // an unnamed build
];
const palette = ['#aaa', '#bbb', '#ccc'];
const assigned = assignReleaseHues(entries, palette);

console.log('Release hues');
assert('busiest release takes the first hue', assigned[0].releaseId === 1 && assigned[0].hue === '#aaa', JSON.stringify(assigned[0]));
assert('a tie on entries goes to the earlier first day', assigned[1].releaseId === 3 && assigned[2].releaseId === 2, assigned.map((r) => r.releaseId).join(','));
assert('the palette is the cap; the rest have no hue', assigned[3].releaseId === 4 && assigned[3].hue === null);
assert('an unnamed build is not a release', assigned.length === 4, assigned.length);
assert('hueOf reads neutral past the palette and for no release', hueOf(assigned, 4) === NEUTRAL_HUE && hueOf(assigned, null) === NEUTRAL_HUE);
assert('hueOf reads the assigned hue', hueOf(assigned, 2) === '#ccc', hueOf(assigned, 2));
assert('the default palette holds eight hues', assignReleaseHues(entries).filter((r) => r.hue).length === 4);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
