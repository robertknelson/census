// Census's tests/Test-Membership.mjs, ported (gatehouse.md §9, G-2): members folded from grant rows, the gaps the
// landing page names, and audit rows in words. Rows are camel-cased, as the command/query handlers send them.
//   node Gatehouse.Tests/js/membership-model.test.mjs
import { describeAudit, findGaps, groupMembers } from '../../Gatehouse.Web/wwwroot/js/membership/membership-model.mjs';

let passed = 0, failed = 0;
const assert = (name, condition, actual = '') => {
    if (condition) { passed++; console.log(`  PASS  ${name}`); }
    else { failed++; console.log(`  FAIL  ${name}  [actual: ${actual}]`); }
};

const row = (memberId, identifier, applicationId = null, applicationName = null, role = null) =>
    ({ memberId, identifier, windowsIdentity: `D\\${identifier}`, firstName: identifier, lastName: 'X', email: null, applicationId, applicationName, role, roleId: role ? 1 : null });
const members = groupMembers([
    row(1, 'sam', 100, 'Gatehouse', 'system-administrator'),
    row(2, 'paula', 1, 'One', 'product-owner'),
    row(2, 'paula', 2, 'Two', 'technical-lead'),
    row(3, 'nova'),
]);
assert('one member per id, grants folded', members.length === 3 && members[1].grants.length === 2, members.map((m) => m.grants.length).join());
assert('  a member with no grant has an empty list, not a null grant', members[2].grants.length === 0);
assert('  the name is first and last', members[1].name === 'paula X', members[1].name);

const app = (applicationId, identifier, name, disposition = 'current') => ({ applicationId, identifier, name, disposition });
const applications = [app(100, 'gatehouse', 'Gatehouse'), app(1, 'one', 'One'), app(2, 'two', 'Two'), app(3, 'three', 'Three'), app(4, 'old', 'Old', 'retired')];
const gaps = findGaps({ applications, members, application: 'gatehouse' });
assert('this application registered and administered: no gap about it', !gaps.hereMissing && !gaps.hereNobody);
assert('a member with no role is named', gaps.noRoles.map((m) => m.identifier).join() === 'nova');
assert('an application nobody holds a role on is named; a retired one is not', gaps.nobodyOn.map((a) => a.identifier).join() === 'three', gaps.nobodyOn.map((a) => a.identifier).join());
assert('an application with holders but no owner is named', gaps.noOwner.map((a) => a.identifier).join() === 'two', gaps.noOwner.map((a) => a.identifier).join());
assert('this application is never an ownerless one', !gaps.noOwner.some((a) => a.identifier === 'gatehouse') && !gaps.nobodyOn.some((a) => a.identifier === 'gatehouse'));
const unregistered = findGaps({ applications: applications.slice(1), members, application: 'gatehouse' });
assert('this application not registered: said', unregistered.hereMissing);
const noAdmin = findGaps({ applications, members: members.slice(1), application: 'gatehouse' });
assert('registered with no system-administrator: said', !noAdmin.hereMissing && noAdmin.hereNobody);
assert('  the identifier matches whatever its case', !findGaps({ applications, members, application: 'GateHouse' }).hereMissing);

const grant = { entity: 'grant', action: 'granted', newValue: JSON.stringify({ Member: 'sam', Application: 'one', Role: 'technical-lead' }) };
assert('a grant in words', describeAudit(grant) === 'Granted technical-lead to sam on one', describeAudit(grant));
const created = { entity: 'application', action: 'created', entityKey: '7', newValue: JSON.stringify({ Identifier: 'seven', Name: 'Seven' }) };
assert('a creation in words', describeAudit(created) === 'Created application seven', describeAudit(created));
const updated = { entity: 'member', action: 'updated', entityKey: '9', previousValue: JSON.stringify({ Identifier: 'tess', FirstName: 'Tess' }), newValue: JSON.stringify({ Identifier: 'tess', FirstName: 'Tessa' }) };
assert('an update names only what changed', describeAudit(updated) === 'Updated member tess: FirstName "Tess" → "Tessa"', describeAudit(updated));
const gone = { entity: 'member', action: 'deleted', entityKey: '9', previousValue: JSON.stringify({ Identifier: 'tess' }) };
assert('a delete in words', describeAudit(gone) === 'Deleted member tess', describeAudit(gone));
const part = { entity: 'application-stage', action: 'created', entityKey: '3:42', newValue: JSON.stringify({ ApplicationId: 3, StageId: 42, Name: 'Val' }) };
assert('an application part in words', describeAudit(part) === 'Added stage 42 named Val on application 3', describeAudit(part));

const asked = { entity: 'request', action: 'requested', entityKey: '5', newValue: JSON.stringify({ Identifier: 'vera', FirstName: 'Vera', LastName: 'Visitor' }) };
assert('a request to join in words', describeAudit(asked) === 'Vera Visitor (vera) asked to join', describeAudit(asked));
const declined = { entity: 'request', action: 'declined', entityKey: '5', newValue: JSON.stringify({ Identifier: 'vera', DecisionNote: 'Ask your manager.' }) };
assert('  declined, with its note', describeAudit(declined) === "Declined vera's request to join: Ask your manager.", describeAudit(declined));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
