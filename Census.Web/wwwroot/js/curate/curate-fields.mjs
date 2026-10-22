// The field lists of the curate editors (personas.md §6.3.1), one per asserted row, each built from
// the page's context: the applications in scope, the releases and items there, AppTrak's lists. A
// field's name is the API's (camelCase); a stored row's PascalCase columns map onto them (rowValues).

const list = (ctx, name) => (ctx.lists[name] ?? []).map((v) => ({ value: v, label: v }));

export function rowValues(row) {
    return Object.fromEntries(Object.entries(row ?? {}).map(([k, v]) => [k[0].toLowerCase() + k.slice(1), v]));
}

export function releaseFields(ctx) {
    return [
        { name: 'name', label: 'Name', type: 'text', required: true },
        { name: 'applicationId', label: 'Application', type: 'select', int: true, required: true, options: ctx.applications.map((a) => ({ value: a.applicationId, label: a.name })) },
        { name: 'kind', label: 'Kind', type: 'select', required: true, options: list(ctx, 'release-kinds') },
        { name: 'targetDate', label: 'Target date', type: 'date' },
        { name: 'note', label: 'Note', type: 'textarea' },
    ];
}

export function itemFields(ctx) {
    return [
        { name: 'title', label: 'Title', type: 'text', required: true, wide: true },
        { name: 'kind', label: 'Kind', type: 'select', required: true, options: list(ctx, 'work-item-kinds') },
        { name: 'applicationId', label: 'Application', type: 'select', int: true, required: true, options: ctx.applications.map((a) => ({ value: a.applicationId, label: a.name })) },
        { name: 'releaseId', label: 'Release', type: 'select', int: true, blank: 'none — heard of, not scheduled', options: ctx.releaseOptions },
        { name: 'includedInBuild', label: 'In build', type: 'text' },
        { name: 'builtBy', label: 'Built by', type: 'text' },
        { name: 'externalRef', label: 'External ref', type: 'text' },
        { name: 'foundInStage', label: 'Found in stage', type: 'select', blank: '—', options: list(ctx, 'stages') },
        { name: 'description', label: 'Description', type: 'textarea' },
        { name: 'removedAt', label: 'Removed at', type: 'datetime' },
        { name: 'removedNote', label: 'Why removed', type: 'text' },
    ];
}

export function buildFields(ctx) {
    return [
        { name: 'build', label: 'Build', type: 'text', required: true },
        { name: 'releaseId', label: 'Claimed by release', type: 'select', int: true, required: true, options: ctx.releaseOptions },
        { name: 'note', label: 'Note', type: 'text', wide: true },
    ];
}

export function eventFields(ctx) {
    return [
        { name: 'kind', label: 'Event', type: 'select', required: true, options: list(ctx, 'event-kinds') },
        { name: 'releaseId', label: 'Release', type: 'select', int: true, required: true, options: ctx.releaseOptions },
        { name: 'stage', label: 'Stage', type: 'select', blank: '—', options: list(ctx, 'stages') },
        { name: 'build', label: 'Build', type: 'text' },
        { name: 'at', label: 'When', type: 'datetime', required: true },
        { name: 'by', label: 'By whom', type: 'text', required: true },
        { name: 'note', label: 'Note', type: 'textarea' },
    ];
}

export function linkFields(ctx) {
    return [
        { name: 'workItemId', label: 'This item', type: 'select', int: true, required: true, options: ctx.itemOptions },
        { name: 'kind', label: 'Link', type: 'select', required: true, options: list(ctx, 'link-kinds') },
        { name: 'linkedWorkItemId', label: 'That item', type: 'select', int: true, required: true, options: ctx.itemOptions },
        { name: 'note', label: 'Note', type: 'text', wide: true },
    ];
}
