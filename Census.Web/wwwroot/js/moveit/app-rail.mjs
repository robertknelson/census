import { appLabel, escapeHtml } from './format.mjs';

// The application rail (move-it.md §26): every application down the left at full height, a
// find box over them, collapsible to a strip. A click toggles an application in or out of
// the choice (§26.3: several at once); *All applications* clears it. The page's header line
// always names the choice, so a collapsed rail never hides a filter. The collapse and the
// chosen applications are remembered per browser and shared by every Move It page (§26.2) —
// a viewer convenience, so without storage the rail simply opens on All.

const COLLAPSED_KEY = 'moveit.rail.collapsed';
const APPS_KEY = 'moveit.rail.apps';

function readCollapsed() {
    try { return localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; }
}

function writeCollapsed(on) {
    try { localStorage.setItem(COLLAPSED_KEY, on ? '1' : '0'); } catch { /* not remembered */ }
}

export class AppRail {
    // onPick receives the chosen ApplicationIds as an array; empty means all.
    constructor(onPick) {
        this.chosen = [];
        this.onPick = (ids) => {
            this.chosen = ids;
            try { if (ids.length === 0) localStorage.removeItem(APPS_KEY); else localStorage.setItem(APPS_KEY, JSON.stringify(ids)); } catch { /* not remembered */ }
            onPick(ids);
        };
    }

    /// The applications another Move It page last chose, those that still exist here; else [].
    static remembered(applications) {
        let ids = [];
        try { ids = JSON.parse(localStorage.getItem(APPS_KEY) ?? '[]'); } catch { /* none */ }
        if (!Array.isArray(ids)) ids = [];
        return ids.filter((id) => applications.some((a) => a.ApplicationId === id));
    }

    html() {
        return `
            <aside class="mi-rail" aria-label="Applications">
                <button type="button" class="mi-rail-toggle" data-rail="collapse" aria-expanded="true">«</button>
                <div class="mi-rail-body">
                    <h2 class="mi-rail-h">Application</h2>
                    <input type="search" class="mi-rail-find" data-rail="find" placeholder="Find an application" aria-label="Find an application" />
                    <nav class="mi-rail-list" data-rail="list" aria-label="Application"></nav>
                    <div class="mi-rail-foot" data-rail="foot"></div>
                </div>
            </aside>`;
    }

    // shellEl is the .mi-shell the rail sits in; showingEl, in the header line, names the choice.
    mount(shellEl, showingEl) {
        const ref = (name) => shellEl.querySelector(`[data-rail="${name}"]`);
        this.shellEl = shellEl;
        this.showingEl = showingEl;
        this.listEl = ref('list');
        this.findEl = ref('find');
        this.footEl = ref('foot');
        this.findEl.addEventListener('input', () => this.applyFind());
        const collapse = ref('collapse');
        const setCollapsed = (on) => {
            shellEl.classList.toggle('is-collapsed', on);
            collapse.textContent = on ? '»' : '«';
            collapse.title = on ? 'Show the applications' : 'Hide the applications';
            collapse.setAttribute('aria-expanded', String(!on));
        };
        setCollapsed(readCollapsed());
        collapse.addEventListener('click', () => {
            const on = !shellEl.classList.contains('is-collapsed');
            setCollapsed(on);
            writeCollapsed(on);
        });
        return this;
    }

    // active is the chosen ApplicationIds (empty = all). counts, when given, is
    // (applicationId | null) => number: a muted number beside each name.
    render(applications, active, counts = null) {
        this.chosen = active;
        const on = (id) => (id == null ? active.length === 0 : active.includes(id));
        const item = (id, label) => `
            <button type="button" class="mi-rail-item ${on(id) ? 'is-active' : ''}" data-app="${id ?? ''}" aria-pressed="${on(id)}">
                <span class="mi-rail-name">${escapeHtml(label)}</span>${counts ? `<span class="mi-rail-count">${counts(id)}</span>` : ''}
            </button>`;
        this.listEl.innerHTML = [
            item(null, 'All applications'),
            ...[...applications].sort((a, b) => appLabel(a).localeCompare(appLabel(b))).map((a) => item(a.ApplicationId, appLabel(a))),
        ].join('');
        this.listEl.querySelectorAll('[data-app]').forEach((b) => b.addEventListener('click', () => {
            if (b.dataset.app === '') return this.onPick([]);
            const id = Number(b.dataset.app);
            this.onPick(this.chosen.includes(id) ? this.chosen.filter((x) => x !== id) : [...this.chosen, id]);
        }));
        this.applyFind();

        const names = active.map((id) => appLabel(applications.find((a) => a.ApplicationId === id) ?? { ApplicationId: id }));
        this.showingEl.classList.toggle('is-filtered', active.length > 0);
        this.showingEl.innerHTML = active.length === 0
            ? 'All applications'
            : `<strong>${names.map(escapeHtml).join(', ')}</strong>
               <button type="button" class="mi-clear" data-rail="clear" title="Show all applications" aria-label="Show all applications">×</button>`;
        this.showingEl.querySelector('[data-rail="clear"]')?.addEventListener('click', () => this.onPick([]));
    }

    // The find box narrows the list, never the page. "All" and the chosen applications stay in
    // view so a search cannot hide the current choice.
    applyFind() {
        const q = this.findEl.value.trim().toLowerCase();
        this.listEl.querySelectorAll('[data-app]').forEach((b) => {
            b.hidden = q !== '' && b.dataset.app !== '' && !b.classList.contains('is-active')
                && !b.querySelector('.mi-rail-name').textContent.toLowerCase().includes(q);
        });
    }
}
