// The curate pages' form engine (personas.md §6.3.1): stored rows onto fields, and a form's strings
// back to what the API takes — empty is null, ints are numbers, a local date-time is its moment.
//   node tests/Test-Curate.mjs
import { renderForm, toLocalInput, toPayload } from '../Census.Web/wwwroot/js/curate/record-form.mjs';
import { eventFields, itemFields, releaseFields, rowValues } from '../Census.Web/wwwroot/js/curate/curate-fields.mjs';

let passed = 0, failed = 0;
const assert = (name, condition, actual = '') => {
    if (condition) { passed++; console.log(`  PASS  ${name}`); }
    else { failed++; console.log(`  FAIL  ${name}  [actual: ${actual}]`); }
};

const ctx = {
    lists: { 'release-kinds': ['featureset', 'hotfix'], 'work-item-kinds': ['feature', 'fix'], 'event-kinds': ['approved', 'hold'], stages: ['DEV', 'VAL', 'PROD'], 'link-kinds': ['depends-on'] },
    applications: [{ applicationId: 1, name: 'One' }, { applicationId: 5, name: 'Five' }],
    releaseOptions: [{ value: 7, label: 'One · Sprint' }],
    itemOptions: [],
};

const values = rowValues({ ReleaseId: 7, ApplicationId: 1, Name: 'Sprint', Kind: 'hotfix', TargetDate: '2026-11-30T00:00:00', Note: null });
assert('a stored row maps onto the fields', values.applicationId === 1 && values.name === 'Sprint' && values.targetDate.startsWith('2026-11-30'));
const html = renderForm(releaseFields(ctx), values, { key: 'release:7', canDelete: true });
assert('the form draws the stored values', html.includes('value="Sprint"') && html.includes('value="2026-11-30"') && html.includes('<option value="hotfix" selected>') && html.includes('<option value="1" selected>'));
assert('  with a delete when asked, and the record key', html.includes('data-delete') && html.includes('data-record="release:7"'));
assert('a required select offers no empty choice; an optional one does', !renderForm(releaseFields(ctx)).includes('<select name="kind" required><option value="">') && renderForm(itemFields(ctx)).includes('none — heard of, not scheduled'));

const body = toPayload(releaseFields(ctx), { name: '  Sprint 9 ', applicationId: '5', kind: 'featureset', targetDate: '', note: '' });
assert('trimmed text, an int as a number, empty as null', body.name === 'Sprint 9' && body.applicationId === 5 && body.targetDate === null && body.note === null, JSON.stringify(body));
const item = toPayload(itemFields(ctx), { title: 'T', kind: 'fix', applicationId: '1', releaseId: '', foundInStage: '', removedAt: '' });
assert('an item with no release sends releaseId null (the notebook)', item.releaseId === null && item.foundInStage === null && item.removedAt === null, JSON.stringify(item));
const ev = toPayload(eventFields(ctx), { kind: 'approved', releaseId: '7', stage: 'PROD', build: '', at: '2026-10-22T09:30', by: 'robert', note: '' });
assert('a local date-time goes as its moment in ISO', ev.at === new Date('2026-10-22T09:30').toISOString() && ev.releaseId === 7, ev.at);
assert('a stored moment comes back as the reader\'s local input value', toLocalInput(new Date(2026, 9, 22, 9, 30).toISOString()) === '2026-10-22T09:30', toLocalInput(new Date(2026, 9, 22, 9, 30).toISOString()));
assert('escaping holds in values', renderForm(releaseFields(ctx), { name: '<b>"x"</b>' }).includes('value="&lt;b&gt;&quot;x&quot;&lt;/b&gt;"'));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
