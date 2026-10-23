// The persona nav (personas.md §6): one declaration, trimmed to a member's features; a group
// left empty goes; each item is shown for the applications where its feature is on (§4).
//   node tests/Test-PersonaNav.mjs
import { NAV, applicationsFor, navItem, trimNav } from '../Census.Web/wwwroot/js/personas/persona-nav.mjs';
import { readFileSync } from 'node:fs';

let passed = 0, failed = 0;
const assert = (name, condition, actual = '') => {
    if (condition) { passed++; console.log(`  PASS  ${name}`); }
    else { failed++; console.log(`  FAIL  ${name}  [actual: ${actual}]`); }
};
const labels = (nav) => nav.map((g) => `${g.group}:${g.items.map((i) => i.label).join('/')}`).join(' | ');

// The catalog is the fm seed's feature list (apptrak/sql/fm/002-census-features.sql).
const seed = readFileSync(new URL('../apptrak/sql/fm/002-census-features.sql', import.meta.url), 'utf8');
const block = seed.slice(seed.indexOf('INSERT @features VALUES'), seed.indexOf('DECLARE @grants'));
const catalog = [...block.matchAll(/^\s*\('([a-z0-9.-]+)',/gm)].map((m) => m[1]);
const declared = NAV.flatMap((g) => g.items.map((i) => i.feature));
assert('the seed lists its features', catalog.length > 0, catalog.length);
assert('every nav item names a feature in the fm seed', declared.every((f) => catalog.includes(f)), declared.filter((f) => !catalog.includes(f)).join(','));
assert('every feature in the catalog has a nav item', catalog.every((f) => declared.includes(f)), catalog.filter((f) => !declared.includes(f)).join(','));

const exec = trimNav(NAV, ['view.year', 'view.quarter', 'view.month', 'view.week']);
assert('the Executive keeps See only; Drill into and Curate go', labels(exec) === 'See:Year/Quarter/Month/Week', labels(exec));
const lead = trimNav(NAV, ['view.quarter', 'view.month', 'view.week', 'drill.deployments', 'drill.builds']);
assert('the Tech Lead: no Year, Drill into kept', labels(lead) === 'See:Quarter/Month/Week | Drill into:Deployments/Builds', labels(lead));
const exec2 = trimNav(NAV, ['view.year', 'surface.moveit']);
assert('a link out is its own group, kept like any item', labels(exec2) === 'See:Year | Elsewhere in Census:Move It', labels(exec2));
const OUT = ['Elsewhere in Census', 'Troubleshoot'];
assert('  links out carry an href; views do not', NAV.every((g) => g.items.every((i) => OUT.includes(g.group) === Boolean(i.href))));
assert('the Sys Admin Log Explorer is a link out to /logs', navItem(trimNav(NAV, ['view.log-explorer']), 'view.log-explorer')?.href === '/logs');
assert('nothing granted, no groups', trimNav(NAV, []).length === 0);
assert('an unknown feature shows nothing', trimNav(NAV, ['no.such']).length === 0);

assert('navItem finds an item kept in the trimmed nav, with its group', navItem(lead, 'drill.builds')?.group === 'Drill into');
assert('navItem does not find one trimmed away', navItem(lead, 'view.year') === null);

const max = { applications: [
    { name: 'MortgageGateway', features: ['view.year', 'view.quarter', 'view.month', 'view.week'] },
    { name: 'Reporting', features: ['view.quarter', 'view.month', 'view.week', 'drill.deployments', 'drill.builds'] },
] };
assert('the mixed member: Year shows MortgageGateway only', applicationsFor(max, 'view.year').map((a) => a.name).join() === 'MortgageGateway');
assert('  Deployments shows Reporting only', applicationsFor(max, 'drill.deployments').map((a) => a.name).join() === 'Reporting');
assert('  Quarter shows both', applicationsFor(max, 'view.quarter').length === 2);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
