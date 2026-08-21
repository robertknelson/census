import { fetchSystemsOverview, fetchSystemGraph } from './atlas-api.mjs';
import { PhysicsView } from './physics-view.mjs';
import { RegistryPanel } from './registry-panel.mjs';

// Atlas (system-view.md): pick a system, see its dependency graph. Tabs are built views —
// {system, stages, strategy, positions} — persisted per browser (localStorage, the
// assertedBy precedent). Strategies own layout and drawing only; the filter strip, the
// inspector, and the honesty rules (ghost-never-hide, declared seam, unclassified shown)
// live here, so every future view type inherits them.

const TABS_KEY = 'census-atlas-tabs-v1';

const STRATEGIES = {
    physics: { label: 'Physics graph', make: (onSelect, onPositions) => new PhysicsView(onSelect, onPositions) },
};

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);
}

class AtlasPage {
    init(config = {}) {
        this.root = document.getElementById(config.rootId ?? 'atlas-root');
        const stored = JSON.parse(localStorage.getItem(TABS_KEY) ?? '{}');
        this.tabs = stored.tabs ?? [];
        this.active = stored.active ?? (this.tabs[0]?.id ?? 'builder');
        this.graphs = new Map();          // tabId -> graph dto
        this.selection = null;
        this.view = null;
        this.renderShell();
        this.open(this.active);
    }

    saveTabs() {
        localStorage.setItem(TABS_KEY, JSON.stringify({ tabs: this.tabs, active: this.active }));
    }

    tab() {
        return this.tabs.find((t) => t.id === this.active) ?? null;
    }

    renderShell() {
        this.root.innerHTML = `
            <header class="atl-header">
                <span class="atl-title">Census <span class="atl-muted">/ atlas</span></span>
                <nav class="atl-tabs" data-ref="tabs"></nav>
                <span class="atl-header-right">
                    <button class="atl-btn" data-ref="registry-btn">Registry</button>
                    <a class="atl-btn" href="/">Estate</a>
                </span>
            </header>
            <div class="atl-toolbar" data-ref="toolbar"></div>
            <main class="atl-main" data-ref="main"></main>
            <aside class="atl-inspector" data-ref="inspector" hidden></aside>`;
        this.tabsEl = this.root.querySelector('[data-ref="tabs"]');
        this.toolbarEl = this.root.querySelector('[data-ref="toolbar"]');
        this.mainEl = this.root.querySelector('[data-ref="main"]');
        this.inspectorEl = this.root.querySelector('[data-ref="inspector"]');
        this.root.querySelector('[data-ref="registry-btn"]').addEventListener('click', () => this.open('registry'));
    }

    renderTabs() {
        this.tabsEl.innerHTML = [
            ...this.tabs.map((t) => `
                <button class="atl-tab ${this.active === t.id ? 'is-active' : ''}" data-tab="${escapeHtml(t.id)}">
                    ${escapeHtml(t.name)}
                    <span class="atl-tab-x" data-close="${escapeHtml(t.id)}" title="Close this view">×</span>
                </button>`),
            `<button class="atl-tab ${this.active === 'builder' ? 'is-active' : ''}" data-tab="builder" title="Build a new view">+</button>`,
        ].join('');
        this.tabsEl.querySelectorAll('[data-tab]').forEach((btn) => btn.addEventListener('click', (e) => {
            if (e.target.dataset.close) return;
            this.open(btn.dataset.tab);
        }));
        this.tabsEl.querySelectorAll('[data-close]').forEach((x) => x.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = e.target.dataset.close;
            this.tabs = this.tabs.filter((t) => t.id !== id);
            this.graphs.delete(id);
            if (this.active === id) this.active = this.tabs[0]?.id ?? 'builder';
            this.saveTabs();
            this.open(this.active);
        }));
    }

    open(what) {
        this.active = what;
        this.selection = null;
        this.view?.destroy?.();
        this.view = null;
        this.saveTabs();
        this.renderTabs();
        this.renderInspector();
        if (what === 'registry') return this.openRegistry();
        if (what === 'builder' || !this.tab()) return this.openBuilder();
        return this.openView();
    }

    // --- the builder -----------------------------------------------------------------------

    async openBuilder() {
        this.toolbarEl.innerHTML = '';
        this.mainEl.innerHTML = '<p class="atl-status">Reading the systems…</p>';
        let overview;
        try {
            overview = await fetchSystemsOverview();
        } catch (err) {
            this.mainEl.innerHTML = `<p class="atl-status atl-error">${escapeHtml(err.message)}</p>`;
            return;
        }
        const options = overview.map((r) => `
            <button class="atl-card atl-card-pick" data-pick="${escapeHtml(r.name)}">
                <span class="atl-mono">${escapeHtml(r.name)}</span>
                ${r.registered ? '' : '<span class="atl-muted">(unregistered)</span>'}
                <span class="atl-muted">${r.memberCount} member${r.memberCount === 1 ? '' : 's'} · ${r.stagesInUse.map(escapeHtml).join(', ') || 'no stages'}</span>
                ${r.description ? `<span class="atl-muted">${escapeHtml(r.description)}</span>` : ''}
            </button>`).join('');
        this.mainEl.innerHTML = `
            <div class="atl-builder">
                <h2>Build a view</h2>
                <p class="atl-status">Pick a system — its dependency graph opens as a new tab. Stage filters and layout live on the tab and persist in this browser.</p>
                ${options || '<p class="atl-status">No system has any members yet — classify entities in the Estate\'s Triage first.</p>'}
            </div>`;
        this.mainEl.querySelectorAll('[data-pick]').forEach((btn) => btn.addEventListener('click', () => {
            const system = btn.dataset.pick;
            const tab = {
                id: `t${(this.tabs.length + 1)}-${system.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
                name: system,
                system,
                stages: [],           // empty = all stages
                strategy: 'physics',
                positions: {},
            };
            this.tabs.push(tab);
            this.open(tab.id);
        }));
    }

    // --- the registry ----------------------------------------------------------------------

    openRegistry() {
        this.toolbarEl.innerHTML = '';
        new RegistryPanel(() => { /* overview changes surface on next graph open */ })
            .mount(this.mainEl);
    }

    // --- a built view ----------------------------------------------------------------------

    async openView() {
        const tab = this.tab();
        this.mainEl.innerHTML = '<p class="atl-status">Walking the graph…</p>';
        let graph = this.graphs.get(tab.id);
        if (!graph) {
            try {
                graph = await fetchSystemGraph(tab.system);
            } catch (err) {
                this.mainEl.innerHTML = `<p class="atl-status atl-error">${escapeHtml(err.message)}</p>`;
                return;
            }
            this.graphs.set(tab.id, graph);
        }
        this.renderToolbar(graph);
        this.mainEl.innerHTML = '<div class="atl-canvas" data-ref="canvas"></div>';
        const strategy = STRATEGIES[tab.strategy] ?? STRATEGIES.physics;
        this.view = strategy.make(
            (selection) => { this.selection = selection; this.renderInspector(); },
            (positions) => { tab.positions = positions; this.saveTabs(); },
        );
        this.view.mount(this.mainEl.querySelector('[data-ref="canvas"]'), graph, {
            focus: this.focusMap(graph, tab),
            positions: tab.positions,
        });
    }

    /// Ghost, never hide (system-view.md §2): a member outside the active stages stays
    /// drawn, ghosted — a cross-stage edge keeps both endpoints visible, which is the
    /// bleed detection. Neighbors have no stage claim on this system and never ghost.
    focusMap(graph, tab) {
        const focus = new Map();
        if (tab.stages.length === 0) return focus;
        const active = new Set(tab.stages.map((s) => s.toLowerCase()));
        for (const n of graph.nodes) {
            if (!n.member) continue;
            const claims = n.serves
                .filter((a) => a.system.toLowerCase() === graph.system.toLowerCase())
                .flatMap((a) => a.stages.length ? a.stages : ['(unstaged)']);
            const hit = claims.some((s) => s === '(unstaged)' || active.has(s.toLowerCase()));
            if (!hit) focus.set(n.id, 'ghost');
        }
        return focus;
    }

    renderToolbar(graph) {
        const tab = this.tab();
        const chips = graph.stages.map((s) => `
            <button class="atl-chip ${tab.stages.some((x) => x.toLowerCase() === s.toLowerCase()) ? 'is-active' : ''}" data-stage="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join('');
        this.toolbarEl.innerHTML = `
            <span class="atl-mono">${escapeHtml(tab.system)}</span>
            <span class="atl-key">stages</span>
            <button class="atl-chip ${tab.stages.length === 0 ? 'is-active' : ''}" data-stage="">all</button>
            ${chips}
            <span class="atl-toolbar-right">
                <button class="atl-btn" data-ref="refetch" title="Re-read the graph">Refresh</button>
                <span class="atl-muted">${graph.nodes.filter((n) => n.member).length} members · ${graph.edges.length} edges · drag pins a node</span>
            </span>`;
        this.toolbarEl.querySelectorAll('[data-stage]').forEach((chip) => chip.addEventListener('click', () => {
            const stage = chip.dataset.stage;
            if (stage === '') tab.stages = [];
            else if (tab.stages.some((x) => x.toLowerCase() === stage.toLowerCase())) tab.stages = tab.stages.filter((x) => x.toLowerCase() !== stage.toLowerCase());
            else tab.stages.push(stage);
            this.saveTabs();
            this.openView();
        }));
        this.toolbarEl.querySelector('[data-ref="refetch"]').addEventListener('click', () => {
            this.graphs.delete(tab.id);
            this.openView();
        });
    }

    // --- the inspector ---------------------------------------------------------------------

    renderInspector() {
        if (!this.selection) {
            this.inspectorEl.hidden = true;
            return;
        }
        this.inspectorEl.hidden = false;
        const { type, item } = this.selection;
        if (type === 'node') {
            const serves = item.serves.map((a) => `
                <div class="atl-row"><span class="atl-badge">${escapeHtml(a.system || '—')}${a.stages.length ? ` · ${a.stages.map(escapeHtml).join(', ')}` : ' · unstaged'}${a.canonicalName ? ` · as ${escapeHtml(a.canonicalName)}` : ''}</span>
                <span class="atl-muted">${escapeHtml([a.assertedBy, a.assertedAt].filter(Boolean).join(' · '))}</span></div>`).join('');
            // A canonical node expands to its concrete variants (canonical-names.md §4) —
            // observed name, host, stages, provenance — so the clean label never hides
            // the evidence, and a declared or phantom variant keeps its own mark.
            const variants = (item.variants ?? []).map((v) => `
                <div class="atl-row"><span class="atl-mono">${escapeHtml(v.name)}</span>
                <span class="atl-muted">${escapeHtml([v.machine, v.container].filter(Boolean).join(' · '))}${v.stages.length ? ` · ${v.stages.map(escapeHtml).join(', ')}` : ' · unstaged'}</span>
                ${v.declared ? '<span class="atl-badge atl-badge-declared">declared</span>' : ''}
                ${v.phantom ? '<span class="atl-drift-bad">not observed</span>' : ''}
                <span class="atl-muted">${escapeHtml([v.assertedBy, v.assertedAt].filter(Boolean).join(' · '))}</span></div>`).join('');
            const state = item.member ? '' :
                item.unclassified ? '<div class="atl-drift-warn">unclassified — nobody has said what this serves; classify it in Triage</div>' :
                item.offSystem ? '<div class="atl-muted">serves other systems only — shown because an edge touches this view</div>' :
                '';
            this.inspectorEl.innerHTML = `
                <div class="atl-card-head">
                    <span class="atl-mono">${escapeHtml(item.name)}</span>
                    <button class="atl-btn" data-ref="close">×</button>
                </div>
                <div class="atl-row"><span class="atl-badge ${item.declared ? 'atl-badge-declared' : ''}">${escapeHtml(item.kind)}</span>
                    ${item.canonical ? `<span class="atl-badge">canonical · ${item.variants.length} variant${item.variants.length === 1 ? '' : 's'}</span>` : ''}
                    ${item.phantom ? '<span class="atl-drift-bad">not observed at this address — the edge\'s claim only</span>' : ''}
                </div>
                ${item.machine ? `<div class="atl-row"><span class="atl-key">machine</span><span class="atl-mono">${escapeHtml(item.machine)}</span></div>` : ''}
                ${item.canonical && (item.hosts ?? []).length > 1 ? `<div class="atl-row"><span class="atl-key">hosts</span><span class="atl-mono">${item.hosts.map(escapeHtml).join(', ')}</span></div>` : ''}
                ${item.container ? `<div class="atl-row"><span class="atl-key">${item.kind === 'database' ? 'instance' : 'site'}</span><span class="atl-mono">${escapeHtml(item.container)}</span></div>` : ''}
                ${serves || state}
                ${variants}
                ${item.note ? `<div class="atl-muted">${escapeHtml(item.note)}</div>` : ''}
                ${item.declared ? '<div class="atl-muted">Declared — asserted to exist, never corroborated.</div>' : ''}`;
        } else {
            this.inspectorEl.innerHTML = `
                <div class="atl-card-head">
                    <span class="atl-mono">${escapeHtml(item.name ?? 'edge')}</span>
                    <button class="atl-btn" data-ref="close">×</button>
                </div>
                <div class="atl-row"><span class="atl-badge">${escapeHtml(item.verdict)}</span><span class="atl-muted">${escapeHtml(item.kind)}</span></div>
                ${item.sourceFile ? `<div class="atl-row"><span class="atl-key">from</span><span class="atl-mono">${escapeHtml(item.sourceFile)}</span></div>` : ''}
                ${item.detail ? `<div class="atl-muted">${escapeHtml(item.detail)}</div>` : ''}`;
        }
        this.inspectorEl.querySelector('[data-ref="close"]').addEventListener('click', () => {
            this.selection = null;
            this.renderInspector();
        });
    }
}

export default new AtlasPage();
