// Move It's navigation (move-it.md §19): one tab bar across its pages. Division is the
// executive's page and comes first; History is the entrant's; Calendar (§21) puts
// all of it on dates.
const TABS = [
    { id: 'division', label: 'Division', href: '/moveit/division' },
    { id: 'week', label: 'The week', href: '/moveit/week' },
    { id: 'board', label: 'Where is it', href: '/moveit' },
    { id: 'history', label: 'History', href: '/moveit/history' },
    { id: 'calendar', label: 'Calendar', href: '/moveit/calendar' },
];

// The pages ride in one thin line across the top of every page (§26): navigation, not a
// control of the view below it.
export function renderTabs(active) {
    return `<header class="mi-uber"><nav class="mi-tabs" aria-label="Move It">${TABS.map((t) =>
        `<a class="mi-tab ${t.id === active ? 'is-active' : ''}" href="${t.href}"${t.id === active ? ' aria-current="page"' : ''}>${t.label}</a>`).join('')}</nav></header>`;
}
