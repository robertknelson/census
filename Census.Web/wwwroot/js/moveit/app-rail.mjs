import { appLabel, escapeHtml } from './format.mjs';

// The application rail (move-it.md §26): every application down the left at full height, a
// find box over them, collapsible to a strip. Single choice; the page's header line always
// names the choice, so a collapsed rail never hides a filter. One remembered collapse for
// every Move It page — a per-viewer convenience, so without storage the rail simply opens.

const COLLAPSED_KEY = 'moveit.rail.collapsed';

function readCollapsed() {
    try { return localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; }
}

function writeCollapsed(on) {
    try { localStorage.setItem(COLLAPSED_KEY, on ? '1' : '0'); } catch { /* not remembered */ }
}

export class AppRail {
    constructor(onPick) {
        this.onPick = onPick;
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

    // counts, when given, is (applicationId | null) => number: a muted number beside each name.
    render(applications, active, counts = null) {
        const item = (id, label) => `
            <button type="button" class="mi-rail-item ${active === id ? 'is-active' : ''}" data-app="${id ?? ''}"${active === id ? ' aria-current="true"' : ''}>
                <span class="mi-rail-name">${escapeHtml(label)}</span>${counts ? `<span class="mi-rail-count">${counts(id)}</span>` : ''}
            </button>`;
        this.listEl.innerHTML = [
            item(null, 'All applications'),
            ...[...applications].sort((a, b) => appLabel(a).localeCompare(appLabel(b))).map((a) => item(a.ApplicationId, appLabel(a))),
        ].join('');
        this.listEl.querySelectorAll('[data-app]').forEach((b) => b.addEventListener('click', () => {
            this.onPick(b.dataset.app === '' ? null : Number(b.dataset.app));
        }));
        this.applyFind();

        const chosen = applications.find((a) => a.ApplicationId === active);
        this.showingEl.classList.toggle('is-filtered', active != null);
        this.showingEl.innerHTML = active == null
            ? 'All applications'
            : `<strong>${escapeHtml(appLabel(chosen ?? { ApplicationId: active }))}</strong>
               <button type="button" class="mi-clear" data-rail="clear" title="Show all applications" aria-label="Show all applications">×</button>`;
        this.showingEl.querySelector('[data-rail="clear"]')?.addEventListener('click', () => this.onPick(null));
    }

    // The find box narrows the list, never the page. "All" and the chosen application stay in
    // view so a search cannot hide the current choice.
    applyFind() {
        const q = this.findEl.value.trim().toLowerCase();
        this.listEl.querySelectorAll('[data-app]').forEach((b) => {
            b.hidden = q !== '' && b.dataset.app !== '' && !b.classList.contains('is-active')
                && !b.querySelector('.mi-rail-name').textContent.toLowerCase().includes(q);
        });
    }
}
