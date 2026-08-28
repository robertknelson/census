import { fetchHosting } from './estate-api.mjs';
import { PanelScope } from './panel-scope.mjs';

// The fleet pivoted by what it hosts: where an application runs, where a database lives, and
// what depends on what. Derived from software-panel.mjs — same search-then-drill shape, same
// machine-names-open-dossiers rule. See .docs/features/census-web.md §11.

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);
}

const VIEWS = [
    { key: 'applications', label: 'Applications' },
    { key: 'databases', label: 'Databases' },
    { key: 'dependencies', label: 'Dependencies' },
];

// 'unobserved' is a statement about census coverage, never a fault (decision H-4). Most
// targets in a real estate are unobserved, because census reaches a subset of the world.
const CORROBORATION = {
    confirmed: { label: 'confirmed', cls: 'est-verdict-same' },
    contradicted: { label: 'contradicted', cls: 'est-verdict-diff' },
    unobserved: { label: 'unobserved', cls: '' },
};

function machineButton(name) {
    return `<button class="est-q-machine est-mono" data-open-machine="${escapeHtml(name)}">${escapeHtml(name)}</button>`;
}

export class HostingPanel {
    constructor(state, getScope, onMachine) {
        this.state = state;      // persisted: { view: string, query: string }
        this.scope = new PanelScope(getScope);
        this.onMachine = onMachine;
    }

    refresh() {
        if (this.data) this.render();
    }

    /// Scope cuts on the machine that hosts the row: an application's or database's
    /// instances, a dependency's SOURCES — a consumer in scope shows its target wherever
    /// that target lives, because the question is "what do my machines depend on."
    scoped() {
        if (this.scope.active() === null) return this.data;
        const applications = this.data.applications
            .map((a) => ({ ...a, instances: a.instances.filter((i) => this.scope.has(i.machine)) }))
            .filter((a) => a.instances.length > 0)
            .map((a) => ({ ...a, machineCount: new Set(a.instances.map((i) => i.machine)).size, runtimes: [...new Set(a.instances.map((i) => i.runtime))] }));
        const databases = this.data.databases
            .map((d) => ({ ...d, instances: d.instances.filter((i) => this.scope.has(i.machine)) }))
            .filter((d) => d.instances.length > 0)
            .map((d) => ({ ...d, instanceCount: d.instances.length }));
        const dependencies = this.data.dependencies
            .map((d) => ({ ...d, sources: d.sources.filter((s) => this.scope.has(s.machine)) }))
            .filter((d) => d.sources.length > 0)
            .map((d) => ({ ...d, sourceCount: d.sources.length }));
        return { applications, databases, dependencies };
    }

    async mount(container) {
        this.container = container;
        container.innerHTML = '<p class="est-status">Pivoting the fleet by what it hosts…</p>';
        try {
            this.data = await fetchHosting();
        } catch (err) {
            container.innerHTML = `<p class="est-status est-error">${escapeHtml(err.message)}</p>`;
            return;
        }
        this.render();
    }

    counts() {
        return {
            applications: this.visible.applications.length,
            databases: this.visible.databases.length,
            dependencies: this.visible.dependencies.length,
        };
    }

    render() {
        this.visible = this.scoped();
        const counts = this.counts();
        this.container.innerHTML = `
            ${this.scope.lineHtml()}
            <div class="est-tabs">
                ${VIEWS.map((v) => `
                    <button class="est-tab${v.key === this.state.view ? ' is-active' : ''}" data-view="${v.key}">
                        ${v.label} <span class="est-muted">${counts[v.key]}</span>
                    </button>`).join('')}
            </div>
            <input class="est-filter" type="search" placeholder="Search…"
                   value="${escapeHtml(this.state.query)}" data-ref="query" autofocus>
            <div data-ref="list"></div>`;

        this.scope.bind(this.container, () => this.render());
        this.container.querySelectorAll('[data-view]').forEach((btn) => btn.addEventListener('click', () => {
            this.state.view = btn.dataset.view;
            this.render();
        }));
        this.container.querySelector('[data-ref="query"]').addEventListener('input', (e) => {
            this.state.query = e.target.value;
            this.renderList();
        });

        this.renderList();
    }

    renderList() {
        const listEl = this.container.querySelector('[data-ref="list"]');
        const q = this.state.query.trim().toLowerCase();
        const view = this.state.view;

        const matches = this.visible[view].filter((item) => q === '' || this.haystack(view, item).includes(q));
        if (matches.length === 0) {
            listEl.innerHTML = `<p class="est-status">Nothing ${this.scope.active() ? 'in scope' : 'in the fleet'} matches.</p>`;
            return;
        }

        listEl.innerHTML = matches.map((item) => {
            if (view === 'applications') return this.applicationHtml(item);
            if (view === 'databases') return this.databaseHtml(item);
            return this.dependencyHtml(item);
        }).join('');

        listEl.querySelectorAll('[data-open-machine]').forEach((btn) => btn.addEventListener('click', () => {
            this.onMachine(btn.dataset.openMachine);
        }));
    }

    haystack(view, item) {
        if (view === 'applications') {
            return `${item.siteName} ${item.path} ${item.runtimes.join(' ')} ${item.instances.map((i) => `${i.machine} ${i.appPool} ${i.identity} ${i.physicalPath}`).join(' ')}`.toLowerCase();
        }
        if (view === 'databases') {
            return `${item.name} ${item.instances.map((i) => `${i.machine} ${i.instance} ${i.owner} ${i.directories.join(' ')}`).join(' ')}`.toLowerCase();
        }
        return `${item.target} ${item.kind} ${item.corroboration} ${item.sources.map((s) => `${s.machine} ${s.siteName} ${s.appPath} ${s.name}`).join(' ')}`.toLowerCase();
    }

    /// A site running two runtimes across a farm is the finding no per-machine view surfaces —
    /// the direct analogue of the software panel's version-spread badge.
    applicationHtml(app) {
        const spread = app.runtimes.length > 1
            ? `<span class="est-verdict est-verdict-diff">${app.runtimes.length} runtimes</span>`
            : '';
        return `
            <div class="est-sw">
                <div class="est-sw-head">
                    <span class="est-sw-name">${escapeHtml(app.siteName)}<span class="est-mono">${escapeHtml(app.path)}</span></span>
                    ${spread}
                    <span class="est-muted">${escapeHtml(app.runtimes.join(' · '))}</span>
                    <span class="est-sw-count est-mono">${app.machineCount} machine${app.machineCount === 1 ? '' : 's'}</span>
                </div>
                ${app.instances.map((i) => `
                    <div class="est-sw-version">
                        <span class="est-sw-vlabel">${machineButton(i.machine)}</span>
                        <span class="est-sw-machines">
                            <span class="est-badge">${escapeHtml(i.runtime)}</span>
                            <span class="est-muted">${escapeHtml(i.appPool)}</span>
                            <span class="est-mono est-muted">${escapeHtml(i.identity)}</span>
                            <span class="est-mono est-muted">${escapeHtml(i.physicalPath)}</span>
                        </span>
                    </div>`).join('')}
            </div>`;
    }

    databaseHtml(db) {
        const spread = db.instanceCount > 1
            ? `<span class="est-verdict est-verdict-diff">${db.instanceCount} copies</span>`
            : '';
        return `
            <div class="est-sw">
                <div class="est-sw-head">
                    <span class="est-sw-name">${escapeHtml(db.name)}</span>
                    ${spread}
                    <span class="est-sw-count est-mono">${db.instanceCount} instance${db.instanceCount === 1 ? '' : 's'}</span>
                </div>
                ${db.instances.map((i) => `
                    <div class="est-sw-version">
                        <span class="est-sw-vlabel">${machineButton(i.machine)}<span class="est-mono est-muted">\\${escapeHtml(i.instance)}</span></span>
                        <span class="est-sw-machines">
                            ${i.state && i.state !== 'ONLINE' ? `<span class="est-badge est-badge-warn">${escapeHtml(i.state)}</span>` : ''}
                            <span class="est-muted">${escapeHtml(i.recoveryModel)}</span>
                            <span class="est-mono est-muted">${escapeHtml(i.owner)}</span>
                            <span class="est-mono est-muted">${i.directories.map(escapeHtml).join(' · ')}</span>
                        </span>
                    </div>`).join('')}
            </div>`;
    }

    dependencyHtml(dep) {
        const verdict = CORROBORATION[dep.corroboration] ?? CORROBORATION.unobserved;
        const verdictHtml = `<span class="est-verdict ${verdict.cls}" ${dep.corroborationDetail ? `title="${escapeHtml(dep.corroborationDetail)}"` : ''}>${verdict.label}</span>`;
        return `
            <div class="est-sw${dep.isLocal ? ' est-muted' : ''}">
                <div class="est-sw-head">
                    <span class="est-sw-name est-mono">${escapeHtml(dep.target)}</span>
                    <span class="est-badge">${escapeHtml(dep.kind)}</span>
                    ${dep.isLocal ? '<span class="est-badge">local</span>' : ''}
                    ${verdictHtml}
                    <span class="est-sw-count est-mono">${dep.sourceCount} consumer${dep.sourceCount === 1 ? '' : 's'}</span>
                </div>
                ${dep.sources.map((s) => `
                    <div class="est-sw-version">
                        <span class="est-sw-vlabel">${machineButton(s.machine)}</span>
                        <span class="est-sw-machines">
                            <span class="est-muted">${escapeHtml(s.siteName)}${escapeHtml(s.appPath)}</span>
                            <span class="est-mono">${escapeHtml(s.name)}</span>
                            <span class="est-muted">${escapeHtml(s.sourceFile)}</span>
                            ${s.secretsPresent ? '<span class="est-badge est-badge-warn" title="password present in the source config">secret</span>' : ''}
                            ${s.hadCredentials ? '<span class="est-badge est-badge-warn" title="credentials present in the URL">creds</span>' : ''}
                            ${s.hadQuery ? '<span class="est-badge est-badge-warn" title="query string dropped at collection">query</span>' : ''}
                        </span>
                    </div>`).join('')}
            </div>`;
    }
}
