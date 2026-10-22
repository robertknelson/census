// The membership page's arithmetic (personas.md §6.2): members folded from grant rows, the gaps the
// landing page names, and audit rows in words.
//   node tests/Test-Membership.mjs
import { describeAudit, findGaps, groupMembers } from '../Census.Web/wwwroot/js/membership/membership-model.mjs';

let passed = 0, failed = 0;
const assert = (name, condition, actual = '') => {
    if (condition) { passed++; console.log(`  PASS  ${name}`); }
    else { failed++; console.log(`  FAIL  ${name}  [actual: ${actual}]`); }
};

const row = (MemberId, Identifier, ApplicationId = null, ApplicationName = null, Role = null) =>
    ({ MemberId, Identifier, WindowsIdentity: `D\\${Identifier}`, FirstName: Identifier, LastName: 'X', Email: null, ApplicationId, ApplicationName, Role, RoleId: Role ? 1 : null });
const members = groupMembers([
    row(1, 'sam', 100, 'Census', 'system-administrator'),
    row(2, 'paula', 1, 'One', 'product-owner'),
    row(2, 'paula', 2, 'Two', 'technical-lead'),
    row(3, 'nova'),
]);
assert('one member per id, grants folded', members.length === 3 && members[1].grants.length === 2, members.map((m) => m.grants.length).join());
assert('  a member with no grant has an empty list, not a null grant', members[2].grants.length === 0);
assert('  the name is first and last', members[1].name === 'paula X', members[1].name);

const app = (ApplicationId, Identifier, Name, Disposition = 'current') => ({ ApplicationId, Identifier, Name, Disposition });
const applications = [app(100, 'census', 'Census'), app(1, 'one', 'One'), app(2, 'two', 'Two'), app(3, 'three', 'Three'), app(4, 'old', 'Old', 'retired')];
const gaps = findGaps({ applications, members, estate: 'census' });
assert('Census registered and administered: no estate gap', !gaps.estateMissing && !gaps.estateNobody);
assert('a member with no role is named', gaps.noRoles.map((m) => m.identifier).join() === 'nova');
assert('an application nobody holds a role on is named; a retired one is not', gaps.nobodyOn.map((a) => a.Identifier).join() === 'three', gaps.nobodyOn.map((a) => a.Identifier).join());
assert('an application with holders but no owner is named', gaps.noOwner.map((a) => a.Identifier).join() === 'two', gaps.noOwner.map((a) => a.Identifier).join());
assert('Census itself is never an ownerless application', !gaps.noOwner.some((a) => a.Identifier === 'census') && !gaps.nobodyOn.some((a) => a.Identifier === 'census'));
const noCensus = findGaps({ applications: applications.slice(1), members, estate: 'census' });
assert('Census not registered: said', noCensus.estateMissing);
const noAdmin = findGaps({ applications, members: members.slice(1), estate: 'census' });
assert('Census registered with no system-administrator: said', !noAdmin.estateMissing && noAdmin.estateNobody);

const grant = { Entity: 'grant', Action: 'granted', NewValue: JSON.stringify({ Member: 'sam', Application: 'one', Role: 'technical-lead' }) };
assert('a grant in words', describeAudit(grant) === 'Granted technical-lead to sam on one', describeAudit(grant));
const created = { Entity: 'application', Action: 'created', EntityKey: '7', NewValue: JSON.stringify({ Identifier: 'seven', Name: 'Seven' }) };
assert('a creation in words', describeAudit(created) === 'Created application seven', describeAudit(created));
const updated = { Entity: 'member', Action: 'updated', EntityKey: '9', PreviousValue: JSON.stringify({ Identifier: 'tess', FirstName: 'Tess' }), NewValue: JSON.stringify({ Identifier: 'tess', FirstName: 'Tessa' }) };
assert('an update names only what changed', describeAudit(updated) === 'Updated member tess: FirstName "Tess" → "Tessa"', describeAudit(updated));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
