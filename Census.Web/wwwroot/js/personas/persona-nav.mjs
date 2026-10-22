// The persona UX's one nav declaration (personas.md §6): every item names the feature that
// shows it. A member's nav is this list trimmed to their features; a group left empty goes.
// Provisional, like the catalog it mirrors (config/features.json); the views reshape both.

export const NAV = [
    {
        group: 'See',
        items: [
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
            { feature: 'curate.associations', label: 'Associations', hint: 'Correct what is linked to what' },
            { feature: 'curate.releases', label: 'Releases', hint: 'Add and edit releases' },
            { feature: 'curate.feature-sets', label: 'Feature sets', hint: 'What a release carries' },
            { feature: 'curate.events', label: 'Events', hint: 'Approvals, holds, notes' },
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
