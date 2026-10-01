// Move It's navigation (move-it.md §19): one tab bar across its pages. Division is the
// executive's page and comes first; History is the entrant's; Calendar (§21) puts
// all of it on dates.
const TABS = [
    { id: 'division', label: 'Division', href: '/moveit/division' },
    { id: 'board', label: 'Where is it', href: '/moveit' },
    { id: 'history', label: 'History', href: '/moveit/history' },
    { id: 'calendar', label: 'Calendar', href: '/moveit/calendar' },
];

export function renderTabs(active) {
    return `<nav class="mi-tabs" aria-label="Move It">${TABS.map((t) =>
        `<a class="mi-tab ${t.id === active ? 'is-active' : ''}" href="${t.href}"${t.id === active ? ' aria-current="page"' : ''}>${t.label}</a>`).join('')}</nav>`;
}
