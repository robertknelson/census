// The persona UX's one nav declaration (personas.md §6): every item names the feature that
// shows it. A member's nav is this list trimmed to their features; a group left empty goes.
// Provisional, like the catalog it mirrors (config/features.json); the views reshape both.

export const NAV = [
    {
        group: 'See',
        items: [
            { feature: 'view.tracker', label: 'Tracker', hint: 'Every release on its line, from the developers to live' },
            { feature: 'view.year', label: 'Year', hint: 'The fiscal year at a glance' },
            { feature: 'view.quarter', label: 'Quarter', hint: 'This quarter against the last' },
            { feature: 'view.month', label: 'Month', hint: 'The month, day by day' },
            { feature: 'view.week', label: 'Week', hint: 'This week' },
        ],
    },
    {
        group: 'Drill into',
        items: [
            { feature: 'drill.deployments', label: 'Deployments', hint: 'What landed where, and when' },
            { feature: 'drill.builds', label: 'Builds', hint: 'Builds and the releases that claim them' },
        ],
    },
    {
        group: 'Curate',
        items: [
            { feature: 'curate.queue', label: 'Needs you', hint: 'Gaps waiting on a human word' },
            { feature: 'curate.associations', label: 'Associations', hint: 'Build claims, and links between items' },
            { feature: 'curate.releases', label: 'Releases', hint: 'A release and everything under it' },
            { feature: 'curate.feature-sets', label: 'Features & fixes', hint: 'Every feature and fix, in a release or not' },
            { feature: 'curate.events', label: 'Events', hint: 'Approvals, holds, notes' },
        ],
    },
    {
        // The existing pages, each owned by the personas that read it (personas.md §8). They are
        // links out: those pages are not trimmed to the member's applications. Census classic has
        // no owner, so no item.
        group: 'Elsewhere in Census',
        items: [
            { feature: 'surface.moveit', label: 'Move It', hint: 'Releases and features, every application', href: '/moveit/division' },
            { feature: 'surface.atlas', label: 'Atlas', hint: 'How the systems connect', href: '/atlas' },
            { feature: 'surface.estate', label: 'Estate', hint: 'Machines, software, hosting, certificates', href: '/estate' },
            { feature: 'surface.day', label: 'Day', hint: 'What changed on the machines, and did it matter', href: '/day' },
        ],
    },
    {
        // The shared log tables, every application's (log-explorer-and-trace.md): their own full-width pages.
        group: 'Troubleshoot',
        items: [
            { feature: 'view.log-explorer', label: 'Log Explorer', hint: 'Requests, exceptions and messages, every application', href: '/logs' },
        ],
    },
];

export function trimNav(nav, features) {
    const on = new Set(features);
    return nav
        .map((g) => ({ ...g, items: g.items.filter((i) => on.has(i.feature)) }))
        .filter((g) => g.items.length > 0);
}

export function navItem(nav, feature) {
    for (const g of nav) {
        const item = g.items.find((i) => i.feature === feature);
        if (item) return { ...item, group: g.group };
    }
    return null;
}

// The applications on which a feature is on for this member (§4: each at its own depth).
export function applicationsFor(access, feature) {
    return access.applications.filter((a) => a.features.includes(feature));
}
