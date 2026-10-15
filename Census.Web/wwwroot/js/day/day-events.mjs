// The day's projection of the change feed (day-view.md §4–§6) — pure functions, so they run
// under node with no app. The headline counts the machines by status; the events collapse
// identical rows across machines into one line with the machines behind it; the groups fold
// the diff sections into four headings a manager reads.

export const SECTION_TITLES = {
    os: 'Operating system',
    apps: 'Installed software',
    dotnetCoreRuntimes: '.NET runtimes',
    dotnetSdks: '.NET SDKs',
    certificates: 'Certificates',
    drives: 'Drives',
    sqlInstances: 'SQL Server',
    sqlDatabases: 'SQL databases',
    sqlDatabaseFiles: 'SQL database files',
    iisSites: 'IIS sites',
    iisAppPools: 'IIS app pools',
    iisApplications: 'IIS applications',
    iisDependencies: 'IIS dependencies',
    roles: 'Observed roles',
};

// Deployments first: they are the news. Installed software is Platform (calls-made-for-you
// 2026-10-14): on this estate an MSI is a patch or an agent far more often than a release.
export const GROUPS = [
    { id: 'deployments', title: 'Deployments', sub: 'what someone shipped', sections: ['iisSites', 'iisAppPools', 'iisApplications', 'iisDependencies', 'dotnetCoreRuntimes', 'dotnetSdks', 'roles'] },
    { id: 'platform', title: 'Platform', sub: 'what operations did to the box', sections: ['os', 'drives', 'apps'] },
    { id: 'security', title: 'Security', sub: 'certificates', sections: ['certificates'] },
    { id: 'data', title: 'Data', sub: 'SQL Server', sections: ['sqlInstances', 'sqlDatabases', 'sqlDatabaseFiles'] },
];

const OTHER = { id: 'other', title: 'Other', sub: 'sections the groups do not name', sections: [] };

export function groupOf(section) {
    return GROUPS.find((g) => g.sections.includes(section)) ?? OTHER;
}

export const STATUS_ORDER = ['changed', 'quiet', 'first-seen', 'collected-once', 'not-collected'];

export const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];

const severityRank = (s) => {
    const i = SEVERITY_ORDER.indexOf(s);
    return i === -1 ? SEVERITY_ORDER.length : i;
};

/// What it means (§5a): the findings born and cleared between the two days, for the machines
/// in scope, the same finding on several machines one row. Severity first, born before
/// cleared, then most machines, then title. Empty when nothing was born or cleared.
export function meanings(findings, machines) {
    if (!findings) return [];
    const inScope = new Set(machines.map((m) => m.toLowerCase()));
    const byKey = new Map();
    for (const [state, list] of [['born', findings.born], ['cleared', findings.cleared]]) {
        for (const f of list ?? []) {
            if (!inScope.has(f.machine.toLowerCase())) continue;
            const key = `${state}\u0000${f.kind}\u0000${f.title}`;
            if (!byKey.has(key)) byKey.set(key, { key, state, severity: f.severity, kind: f.kind, title: f.title, detail: f.detail, machines: [] });
            byKey.get(key).machines.push(f.machine);
        }
    }
    return [...byKey.values()].sort((a, b) =>
        severityRank(a.severity) - severityRank(b.severity)
        || (a.state === b.state ? 0 : a.state === 'born' ? -1 : 1)
        || b.machines.length - a.machines.length
        || a.title.localeCompare(b.title));
}

export const STATUS_TEXT = {
    changed: 'changed',
    quiet: 'quiet',
    'first-seen': 'first seen',
    'collected-once': 'collected once',
    'not-collected': 'not collected',
};

/// { status: [machine names] } for every status, in STATUS_ORDER, empty lists kept.
export function headline(machines) {
    const out = Object.fromEntries(STATUS_ORDER.map((s) => [s, []]));
    for (const m of machines) (out[m.status] ??= []).push(m.machine);
    return out;
}

// A drive whose only change is its free space: `C: System: percentFree 45.0 → 42.0`. Every
// box drifts a little every day, so on a fleet these rows bury the page (§5, his call
// 2026-10-15: fold). A drive that also changed health keeps its own row.
const DRIFT = /: percentFree [\d.]* → [\d.]*$/;
export const DRIFT_TEXT = (drives) => `free space drifted on ${drives} drive${drives === 1 ? '' : 's'}`;
export function isDrift(e) {
    return e.section === 'drives' && e.kind === 'changed' && DRIFT.test(e.text);
}

/// Identical section + kind + text across machines on the day is one event (§5). Drive
/// free-space drift is one event for the whole day, however many drives and machines. Groups
/// in GROUPS order, only the ones with events; events most machines first, then by text.
export function collapse(machines) {
    const byKey = new Map();
    const drift = { section: 'drives', kind: 'changed', folded: true, drives: 0, machines: [] };
    for (const m of machines) {
        for (const e of m.entries ?? []) {
            if (isDrift(e)) {
                drift.drives++;
                if (!drift.machines.includes(m.machine)) drift.machines.push(m.machine);
                continue;
            }
            const key = `${e.section}\u0000${e.kind}\u0000${e.text}`;
            if (!byKey.has(key)) byKey.set(key, { section: e.section, kind: e.kind, text: e.text, machines: [] });
            byKey.get(key).machines.push(m.machine);
        }
    }
    if (drift.drives > 0) {
        drift.text = DRIFT_TEXT(drift.drives);
        byKey.set('drift', drift);
    }
    const events = [...byKey.values()].sort((a, b) => b.machines.length - a.machines.length || a.text.localeCompare(b.text));
    return [...GROUPS, OTHER]
        .map((g) => ({ ...g, events: events.filter((e) => groupOf(e.section).id === g.id) }))
        .filter((g) => g.events.length > 0)
        .map((g) => ({ ...g, machineCount: new Set(g.events.flatMap((e) => e.machines)).size }));
}
