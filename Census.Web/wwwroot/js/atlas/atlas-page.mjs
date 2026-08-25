import { fetchSystemsOverview, fetchSystemGraph, fetchViews, saveViews } from './atlas-api.mjs';
import { PhysicsView } from './physics-view.mjs';
import { RegistryPanel } from './registry-panel.mjs';

// Atlas (system-view.md): pick a system, see its dependency graph. Tabs are built views —
// {id, name, system, stages, strategy, positions} — estate artifacts in config/views.json
// (GET/PUT /api/views, promoted from localStorage 2026-08-25); localStorage keeps only
// what is personal: the open tab and whether the key shows. Strategies own layout and
// drawing only; the filter strip, the inspector, and the honesty rules (ghost-never-hide,
// declared seam, unclassified shown) live here, so every future view type inherits them.

const LOCAL_KEY = 'census-atlas-tabs-v1';

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
        this.graphs = new Map();          // tabId -> graph dto
        this.selection = null;
        this.view = null;
        this.renderShell();
        this.bootstrap(JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '{}'));
    }

    async bootstrap(stored) {
        this.keyOpen = stored.keyOpen ?? true;
        this.mainEl.innerHTML = '<p class="atl-status">Reading the views…</p>';
        try {
            let views = (await fetchViews()).views ?? [];
            // One-time adoption (system-view.md §3): pre-promotion localStorage tabs move
            // up only while the estate file is empty; after that the file is the truth.
            // On adoption failure we bail before any saveLocal, so the local tabs survive.
            if (views.length === 0 && (stored.tabs?.length ?? 0) > 0) {
                views = stored.tabs;
                await saveViews({ version: 1, views });
            }
            this.tabs = views;
        } catch (err) {
            this.mainEl.innerHTML = `<p class="atl-status atl-error">${escapeHtml(err.message)}</p>`;
            return;
        }
        this.active = stored.active ?? (this.tabs[0]?.id ?? 'builder');
        this.open(this.active);
    }

    saveLocal() {
        localStorage.setItem(LOCAL_KEY, JSON.stringify({ active: this.active, keyOpen: this.keyOpen }));
    }

    async persistViews() {
        this.saveLocal();
        try {
            await saveViews({ version: 1, views: this.tabs });
            this.setSaveStatus(null);
        } catch (err) {
            this.setSaveStatus(err.message);
        }
    }

    setSaveStatus(message) {
        const el = this.root.querySelector('[data-ref="save-status"]');
        el.textContent = message ?? '';
        el.hidden = message == null;
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
                    <span class="atl-error" data-ref="save-status" hidden></span>
                    <button class="atl-btn" data-ref="registry-btn">Registry</button>
                    <a class="atl-btn" href="/">Estate</a>
                </span>
            </header>
            <div class="atl-toolbar" data-ref="toolbar"></div>
            <main class="atl-main" data-ref="main"></main>
            <aside class="atl-keycard" data-ref="keycard" hidden></aside>
            <aside class="atl-inspector" data-ref="inspector" hidden></aside>`;
        this.tabsEl = this.root.querySelector('[data-ref="tabs"]');
        this.toolbarEl = this.root.querySelector('[data-ref="toolbar"]');
        this.mainEl = this.root.querySelector('[data-ref="main"]');
        this.keycardEl = this.root.querySelector('[data-ref="keycard"]');
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
            this.persistViews();
            this.open(this.active);
        }));
    }

    open(what) {
        this.active = what;
        this.selection = null;
        this.view?.destroy?.();
        this.view = null;
        this.saveLocal();
        this.renderTabs();
        this.renderInspector();
        if (what === 'registry') return this.openRegistry();
        if (what === 'builder' || !this.tab()) return this.openBuilder();
        return this.openView();
    }

    // --- the builder -----------------------------------------------------------------------

    async openBuilder() {
        this.toolbarEl.innerHTML = '';
        this.keycardEl.hidden = true;
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
            this.persistViews();
            this.open(tab.id);
        }));
    }

    // --- the registry ----------------------------------------------------------------------

    openRegistry() {
        this.toolbarEl.innerHTML = '';
        this.keycardEl.hidden = true;
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
            (positions) => { tab.positions = positions; this.persistViews(); },
        );
        this.view.mount(this.mainEl.querySelector('[data-ref="canvas"]'), graph, {
            focus: this.focusMap(graph, tab),
            positions: tab.positions,
        });
        this.renderKey();
    }

    // --- the key ---------------------------------------------------------------------------

    renderKey() {
        this.keycardEl.hidden = !this.keyOpen;
        if (!this.keyOpen) return;
        const node = (classes, shape) => `
            <svg class="atl-key-swatch" viewBox="-13 -11 26 22" aria-hidden="true"><g class="atl-node ${classes}">${shape}</g></svg>`;
        const rect = '<rect x="-8" y="-5.8" width="16" height="11.6" rx="2"></rect>';
        const circle = '<circle r="8"></circle>';
        const hex = '<polygon points="6.9,4 0,8 -6.9,4 -6.9,-4 0,-8 6.9,-4"></polygon>';
        const dot = '<circle r="3.6"></circle>';
        const diamond = '<rect x="-6.4" y="-6.4" width="12.8" height="12.8" transform="rotate(45)"></rect>';
        const edge = (verdict) => `
            <svg class="atl-key-swatch" viewBox="0 0 26 22" aria-hidden="true"><line class="atl-edge atl-edge-${verdict}" x1="1" y1="11" x2="25" y2="11"></line></svg>`;
        const row = (swatch, label) => `<div class="atl-key-row">${swatch}<span>${label}</span></div>`;
        this.keycardEl.innerHTML = `
            <div class="atl-key-head"><span class="atl-key">key</span><button class="atl-btn" data-ref="key-close" title="Hide the key">×</button></div>
            <div class="atl-key-groups">
            <div>
                <div class="atl-key-ghead">kind — shape</div>
                ${row(node('', rect), 'database')}
                ${row(node('', circle), 'application')}
                ${row(node('', hex), 'external entity')}
                ${row(node('', diamond), 'declared kind (task, …)')}
                ${row(node('', dot), 'endpoint')}
            </div>
            <div>
                <div class="atl-key-ghead">state</div>
                ${row(node('atl-member', circle), 'member of this system')}
                ${row(node('atl-unclassified', circle), 'unclassified — nothing asserted')}
                ${row(node('atl-offsystem', circle), 'serves other systems only')}
                ${row(node('atl-declaredish', circle), 'declared — asserted, not observed')}
                ${row(node('atl-phantom', circle), 'not observed at this address')}
                ${row(node('atl-member atl-canonical', circle), 'canonical ·  ×n = variants')}
                ${row(node('atl-member atl-ghost', circle), 'outside stage filter (never hidden)')}
            </div>
            <div>
                <div class="atl-key-ghead">connections</div>
                ${row(edge('confirmed'), 'observed · confirmed')}
                ${row(edge('contradicted'), 'contradicted')}
                ${row(edge('unobserved'), 'target not corroborated')}
                ${row(edge('declared'), 'declared target')}
                ${row(edge('unresolved'), 'unresolved endpoint')}
                ${row('<span class="atl-also atl-key-mark">+n</span>', 'also serves n other systems')}
            </div>
            </div>`;
        this.keycardEl.querySelector('[data-ref="key-close"]').addEventListener('click', () => {
            this.keyOpen = false;
            this.saveLocal();
            this.renderKey();
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
                <button class="atl-btn" data-ref="key-toggle" title="Show or hide the key">Key</button>
                <button class="atl-btn" data-ref="refetch" title="Re-read the graph">Refresh</button>
                <span class="atl-muted">${graph.nodes.filter((n) => n.member).length} members · ${graph.edges.length} edges · click opens details · drag pins</span>
            </span>`;
        this.toolbarEl.querySelectorAll('[data-stage]').forEach((chip) => chip.addEventListener('click', () => {
            const stage = chip.dataset.stage;
            if (stage === '') tab.stages = [];
            else if (tab.stages.some((x) => x.toLowerCase() === stage.toLowerCase())) tab.stages = tab.stages.filter((x) => x.toLowerCase() !== stage.toLowerCase());
            else tab.stages.push(stage);
            this.persistViews();
            this.openView();
        }));
        this.toolbarEl.querySelector('[data-ref="refetch"]').addEventListener('click', () => {
            this.graphs.delete(tab.id);
            this.openView();
        });
        this.toolbarEl.querySelector('[data-ref="key-toggle"]').addEventListener('click', () => {
            this.keyOpen = !this.keyOpen;
            this.saveLocal();
            this.renderKey();
        });
    }

    // --- the inspector ---------------------------------------------------------------------

    /// Persistent while a view is open (his 2026-08-25 field call — visibility must not
    /// depend on discovering the click): empty state until a selection fills it.
    renderInspector() {
        const viewOpen = this.active !== 'builder' && this.active !== 'registry' && !!this.tab();
        this.inspectorEl.hidden = !viewOpen;
        if (!viewOpen) return;
        if (!this.selection) {
            this.inspectorEl.innerHTML = `
                <div class="atl-card-head"><span class="atl-key">inspector</span></div>
                <p class="atl-muted">Nothing selected — click a node or edge for its details. Dragging pins instead of selecting.</p>`;
            return;
        }
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
        this.inspectorEl.querySelector('[data-ref="close"]')?.addEventListener('click', () => {
            this.selection = null;
            this.view?.setSelected?.(null);
            this.renderInspector();
        });
    }
}

export default new AtlasPage();
