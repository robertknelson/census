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

/// Identical section + kind + text across machines on the day is one event (§5). Groups in
/// GROUPS order, only the ones with events; events most machines first, then by text.
export function collapse(machines) {
    const byKey = new Map();
    for (const m of machines) {
        for (const e of m.entries ?? []) {
            const key = `${e.section}\u0000${e.kind}\u0000${e.text}`;
            if (!byKey.has(key)) byKey.set(key, { section: e.section, kind: e.kind, text: e.text, machines: [] });
            byKey.get(key).machines.push(m.machine);
        }
    }
    const events = [...byKey.values()].sort((a, b) => b.machines.length - a.machines.length || a.text.localeCompare(b.text));
    return [...GROUPS, OTHER]
        .map((g) => ({ ...g, events: events.filter((e) => groupOf(e.section).id === g.id) }))
        .filter((g) => g.events.length > 0)
        .map((g) => ({ ...g, machineCount: new Set(g.events.flatMap((e) => e.machines)).size }));
}
