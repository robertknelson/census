// The three log models Log Explorer reads (log-explorer-and-trace.md §4; Application and Stage lead, the tables hold
// every application's rows), their fields, and the defaults for which fields are facets and columns.
// kind: text | number | date | bool | list | json. pivot: the drawer offers "everything with this value" on it.

export const DATE_BUCKETS = [
    { key: 'yyyy-mm-dd', label: 'Day' },
    { key: 'yyyy-mm', label: 'Month' },
    { key: 'hh', label: 'Hour of day' },
    { key: 'dd:hh', label: 'Day and hour' }
];

const f = (field, header, o = {}) => ({
    field,
    header,
    kind: o.kind ?? 'text',
    facet: o.facet ?? false,
    column: o.column ?? false,
    sortable: o.sortable ?? true,
    pivot: o.pivot ?? false
});

export const MODELS = {
    'api-request': {
        label: 'ApiRequest',
        noun: 'requests',
        fields: [
            f('application', 'Application', { facet: true, column: true }),
            f('stage', 'Stage', { facet: true }),
            f('startAt', 'Start', { kind: 'date', facet: true, column: true }),
            f('elapsed', 'ms', { kind: 'number', column: true }),
            f('httpStatus', 'Status', { kind: 'number', facet: true, column: true }),
            f('httpMethod', 'Method', { facet: true, column: true }),
            f('path', 'Path', { facet: true, column: true }),
            f('identifier', 'Identifier', { facet: true, column: true, pivot: true }),
            f('controllerName', 'Controller', { facet: true }),
            f('controllerMethod', 'Action', { facet: true }),
            f('hasError', 'Error', { kind: 'bool', facet: true }),
            f('machine', 'Machine', { facet: true }),
            f('host', 'Host', { facet: true }),
            f('scheme', 'Scheme', { facet: true }),
            f('queryString', 'Query', { sortable: false }),
            f('correlationId', 'Correlation', { sortable: false, pivot: true }),
            f('sessionId', 'Session', { sortable: false, pivot: true }),
            f('browser', 'Browser'),
            f('platform', 'Platform'),
            f('userAgent', 'User agent', { sortable: false }),
            f('roles', 'Roles', { kind: 'list', sortable: false }),
            f('hasContent', 'Body stored', { kind: 'bool' }),
            f('requestBody', 'Body', { kind: 'json', sortable: false }),
            f('isPassThrough', 'Pass-through', { kind: 'bool' }),
            f('stopAt', 'Stop', { kind: 'date' }),
            f('id', 'Id', { kind: 'number' })
        ]
    },
    'exception-event': {
        label: 'Exception',
        noun: 'exceptions',
        fields: [
            f('application', 'Application', { facet: true, column: true }),
            f('stage', 'Stage', { facet: true }),
            f('startAt', 'Start', { kind: 'date', facet: true, column: true }),
            f('level', 'Level', { facet: true, column: true }),
            f('message', 'Message', { column: true, sortable: false }),
            f('sourceContext', 'Source', { facet: true, column: true }),
            f('actionName', 'Action', { facet: true }),
            f('path', 'Path', { facet: true, column: true }),
            f('tags', 'Tags', { kind: 'list', facet: true, sortable: false }),
            f('machine', 'Machine', { facet: true }),
            f('correlationId', 'Correlation', { sortable: false, pivot: true }),
            f('sessionId', 'Session', { sortable: false, pivot: true }),
            f('data', 'Data', { kind: 'json', sortable: false }),
            f('id', 'Id', { kind: 'number' })
        ]
    },
    'message': {
        label: 'Message',
        noun: 'messages',
        fields: [
            f('application', 'Application', { facet: true, column: true }),
            f('stage', 'Stage', { facet: true }),
            f('startAt', 'Start', { kind: 'date', facet: true, column: true }),
            f('level', 'Level', { facet: true, column: true }),
            f('message', 'Message', { column: true, sortable: false }),
            f('sourceContext', 'Source', { facet: true, column: true }),
            f('actionName', 'Action', { facet: true }),
            f('path', 'Path', { facet: true }),
            f('tags', 'Tags', { kind: 'list', facet: true, sortable: false }),
            f('machine', 'Machine', { facet: true }),
            f('correlationId', 'Correlation', { sortable: false, pivot: true }),
            f('sessionId', 'Session', { sortable: false, pivot: true }),
            f('data', 'Data', { kind: 'json', sortable: false }),
            f('id', 'Id', { kind: 'number' })
        ]
    }
};

export const MODEL_KEYS = Object.keys(MODELS);

// Settings (support-tooling.md S3): a request this slow is drawn bold and is what "Slow today" finds.
export const SLOW_MS = 2000;

// The row cues on a request: a write, a refusal (a 4xx other than the sign-in 401), slow, a body stored.
export function requestCues(row) {
    const status = Number(row.httpStatus);
    return {
        write: ['POST', 'PUT', 'PATCH', 'DELETE'].includes(row.httpMethod),
        refused: status >= 400 && status < 500 && status !== 401,
        slow: Number(row.elapsed) >= SLOW_MS,
        // The body itself, not HasContent: rows before the 2026-10-20 logging fix say HasContent but kept no body.
        body: row.requestBody !== null && row.requestBody !== undefined && row.requestBody !== ''
    };
}

export const pascal = field => field.charAt(0).toUpperCase() + field.slice(1);

export function defaultFields(model) {
    return MODELS[model].fields.map(field => ({ ...field }));
}

// The server-side field names a facet selection is sent as: "HttpStatus-in=200,404".
export function facetParam(field, isIn) {
    return `${pascal(field)}-${isIn ? 'in' : 'nin'}`;
}
