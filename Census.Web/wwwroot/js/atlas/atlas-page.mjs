import { fetchSystemsOverview, fetchSystemGraph, fetchViews, saveViews } from './atlas-api.mjs';
import { PhysicsView, shapeSvg } from './physics-view.mjs';
import { stageColor } from './stage-colors.mjs';
import { RegistryPanel } from './registry-panel.mjs';

// Atlas (system-view.md): pick a system, see its dependency graph. Tabs are built views —
// {id, name, system, stages, strategy, grouping, positions} — estate artifacts in config/views.json
// (GET/PUT /api/views, promoted from localStorage 2026-08-25); localStorage keeps only
// what is personal: the open tab and whether the key shows. Strategies own layout and
// drawing only; the filter strip, the inspector, and the honesty rules (ghost-never-hide,
// declared seam, unclassified shown) live here, so every future view type inherits them.

const LOCAL_KEY = 'census-atlas-tabs-v1';

const STRATEGIES = {
    physics: { label: 'Physics graph', make: (onSelect, onPositions) => new PhysicsView(onSelect, onPositions) },
};

// The name the builder gives (system-view.md §9–10, §14): the system, then the starting
// stages. Every-entity grouping is shown by EVERY_ICON on the tab, not spelled into the name,
// so tabs stay short. A name someone typed is never rewritten.
function tabName(system, stages = []) {
    return [system, stages.length ? stages.join('/') : null].filter(Boolean).join(' · ');
}

// The §9 names spelled the grouping out (*MyWeb · every entity · val*). Such a saved name is
// still the builder's, so it is read as automatic and shortened when the views load.
function legacyTabName(system, stages = []) {
    return [system, 'every entity', stages.length ? stages.join('/') : null].filter(Boolean).join(' · ');
}

// Every entity, ungrouped: four separate dots — each observed thing its own node (§14).
const EVERY_ICON = `<svg class="atl-every" viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="4.5" cy="4.5" r="2.3"></circle><circle cx="11.5" cy="4.5" r="2.3"></circle>
    <circle cx="4.5" cy="11.5" r="2.3"></circle><circle cx="11.5" cy="11.5" r="2.3"></circle></svg>`;

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
        this.inspectorOpen = stored.inspectorOpen ?? true;
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
            this.tabs = views.map((t) => t.grouping === 'observed' && t.name === legacyTabName(t.system, t.stages)
                ? { ...t, name: tabName(t.system, t.stages) } : t);
        } catch (err) {
            this.mainEl.innerHTML = `<p class="atl-status atl-error">${escapeHtml(err.message)}</p>`;
            return;
        }
        this.active = stored.active ?? (this.tabs[0]?.id ?? 'builder');
        this.open(this.active);
    }

    saveLocal() {
        localStorage.setItem(LOCAL_KEY, JSON.stringify({ active: this.active, keyOpen: this.keyOpen, inspectorOpen: this.inspectorOpen }));
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
            <div class="atl-body">
                <main class="atl-main" data-ref="main"></main>
                <aside class="atl-keycard" data-ref="keycard" hidden></aside>
                <aside class="atl-inspector" data-ref="inspector" hidden></aside>
            </div>`;
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
                <button class="atl-tab ${this.active === t.id ? 'is-active' : ''}" data-tab="${escapeHtml(t.id)}"${t.grouping === 'observed' ? ' title="Every entity — nothing grouped by canonical name"' : ''}>
                    ${t.grouping === 'observed' ? EVERY_ICON : ''}${escapeHtml(t.name)}
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
        // Each card is a small form (system-view.md §9–10): starting stages to tick (none = all),
        // an optional name, then open. Grouped-or-not is offered only where it changes the
        // drawing — a system with no canonical names draws the same either way.
        const card = (r) => `
            <div class="atl-card atl-card-build" data-system="${escapeHtml(r.name)}">
                <span class="atl-mono">${escapeHtml(r.name)}</span>
                ${r.registered ? '' : '<span class="atl-muted">(unregistered)</span>'}
                <span class="atl-muted">${r.memberCount} member${r.memberCount === 1 ? '' : 's'}${r.stagesInUse.length ? '' : ' · no stages'}${r.canonicalNameCount
                    ? ` · ${r.canonicalNameCount} canonical name${r.canonicalNameCount === 1 ? '' : 's'} over ${r.namedMemberCount} member${r.namedMemberCount === 1 ? '' : 's'}` : ''}</span>
                ${r.description ? `<span class="atl-muted">${escapeHtml(r.description)}</span>` : ''}
                <span class="atl-card-row">
                    ${r.stagesInUse.length ? `<span class="atl-key">start at</span>
                        ${r.stagesInUse.map((st) => `<button class="atl-chip" data-start-stage="${escapeHtml(st)}" title="Open with ${escapeHtml(st)} in focus; the rest stay drawn, faded"><span class="atl-chip-dot" style="background:${stageColor(st)}"></span>${escapeHtml(st)}</button>`).join('')}` : ''}
                    <input class="atl-card-name" data-ref="name" placeholder="${escapeHtml(tabName(r.name))}" aria-label="Tab name (optional)" title="Tab name — leave empty to name it for you">
                    <span class="atl-card-actions">
                        ${r.canonicalNameCount
                            ? `<button class="atl-btn" data-grouping="canonical" title="Members sharing a canonical name collapse into one node">Open grouped</button>
                               <button class="atl-btn" data-grouping="observed" title="Every observed entity stays its own node">${EVERY_ICON}Open every entity</button>`
                            : '<button class="atl-btn" data-grouping="canonical">Open</button>'}
                    </span>
                </span>
            </div>`;
        const options = overview.map(card).join('');
        this.mainEl.innerHTML = `
            <div class="atl-builder">
                <h2>Build a view</h2>
                <p class="atl-status">Pick a system — its dependency graph opens as a new tab. Stage filters, grouping and layout live on the tab and are saved for everyone (config/views.json).</p>
                ${options || '<p class="atl-status">No system has any members yet — classify entities in the Estate\'s Triage first.</p>'}
            </div>`;
        this.mainEl.querySelectorAll('.atl-card-build').forEach((el) => {
            const system = el.dataset.system;
            const nameEl = el.querySelector('[data-ref="name"]');
            const picked = () => [...el.querySelectorAll('[data-start-stage].is-active')].map((b) => b.dataset.startStage);
            el.querySelectorAll('[data-start-stage]').forEach((chip) => chip.addEventListener('click', () => {
                chip.classList.toggle('is-active');
                nameEl.placeholder = tabName(system, picked());
            }));
            el.querySelectorAll('[data-grouping]').forEach((btn) => btn.addEventListener('click', () => {
                const grouping = btn.dataset.grouping;
                const stages = picked();
                const tab = {
                    id: `t${(this.tabs.length + 1)}-${system.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
                    name: nameEl.value.trim() || tabName(system, stages),
                    system,
                    stages,               // empty = all stages
                    strategy: 'physics',
                    grouping,             // 'canonical' collapses variants sharing a canonical name; 'observed' keeps every entity
                    positions: {},
                };
                this.tabs.push(tab);
                this.persistViews();
                this.open(tab.id);
            }));
        });
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
                graph = await fetchSystemGraph(tab.system, tab.grouping ?? 'canonical');
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
            // Selecting reopens a closed inspector: a click must always show its details.
            (selection) => { this.selection = selection; if (selection) this.inspectorOpen = true; this.renderInspector(); },
            // Merge, never replace: canonical and observed nodes have disjoint ids, so one
            // map holds both modes' layouts and shared neighbors keep their spots across a flip.
            (positions) => { tab.positions = { ...tab.positions, ...positions }; this.persistViews(); },
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
        // Kind swatches render through the graph's own shapeSvg — the key cannot drift.
        const kind = (shape) => `
            <svg class="atl-key-swatch" viewBox="-13 -11 26 22" aria-hidden="true"><g class="atl-node">${shapeSvg(shape, 8)}</g></svg>`;
        const state = (classes) => `
            <svg class="atl-key-swatch" viewBox="-13 -11 26 22" aria-hidden="true"><g class="atl-node ${classes}"><circle class="atl-shape" r="8"></circle></g></svg>`;
        const edge = (verdict, fade = '') => `
            <svg class="atl-key-swatch" viewBox="0 0 26 22" aria-hidden="true"><line class="atl-edge atl-edge-${verdict} ${fade}" x1="1" y1="11" x2="25" y2="11"></line></svg>`;
        const row = (swatch, label) => `<div class="atl-key-row">${swatch}<span>${label}</span></div>`;
        const stages = (this.graphs.get(this.active)?.stages ?? []).map((s) => row(
            `<span class="atl-key-mark"><span class="atl-chip-dot" style="background:${stageColor(s)}"></span></span>`,
            escapeHtml(s))).join('');
        this.keycardEl.innerHTML = `
            <div class="atl-key-head"><span class="atl-key">key</span><button class="atl-btn" data-ref="key-close" title="Hide the key">×</button></div>
            <div class="atl-key-groups">
            <div>
                <div class="atl-key-ghead">kind — shape</div>
                ${row(kind('cylinder'), 'database')}
                ${row(kind('globe'), 'application')}
                ${row(kind('cloud'), 'external entity')}
                ${row(kind('diamond'), 'declared kind (task, …)')}
                ${row(kind('dot'), 'endpoint')}
            </div>
            ${stages ? `<div>
                <div class="atl-key-ghead">stages</div>
                ${stages}
            </div>` : ''}
            <div>
                <div class="atl-key-ghead">state</div>
                ${row(state('atl-member'), 'member of this system')}
                ${row(state('atl-unclassified'), 'unclassified — nothing asserted')}
                ${row(state('atl-offsystem'), 'serves other systems only')}
                ${row(state('atl-declaredish'), 'declared — asserted, not observed')}
                ${row(state('atl-phantom'), 'not observed at this address')}
                ${row(state('atl-member atl-canonical'), 'canonical ·  ×n = variants')}
                ${row(state('atl-member atl-ghost'), 'outside stage filter (never hidden)')}
            </div>
            <div>
                <div class="atl-key-ghead">connections</div>
                ${row(edge('confirmed'), 'observed · confirmed')}
                ${row(edge('contradicted'), 'contradicted')}
                ${row(edge('unobserved'), 'target not corroborated')}
                ${row(edge('declared'), 'declared target')}
                ${row(edge('unresolved'), 'unresolved endpoint')}
                ${row(edge('confirmed', 'atl-edge-bleed'), 'one end filtered — the bleed')}
                ${row(edge('confirmed', 'atl-edge-ghost'), 'both ends filtered')}
                ${row('<span class="atl-also atl-key-mark">+n</span>', 'also serves n other systems')}
            </div>
            </div>`;
        this.keycardEl.querySelector('[data-ref="key-close"]').addEventListener('click', () => {
            this.keyOpen = false;
            this.toolbarEl.querySelector('[data-ref="key-toggle"]')?.classList.remove('is-on');
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
            <button class="atl-chip ${tab.stages.some((x) => x.toLowerCase() === s.toLowerCase()) ? 'is-active' : ''}" data-stage="${escapeHtml(s)}"><span class="atl-chip-dot" style="background:${stageColor(s)}"></span>${escapeHtml(s)}</button>`).join('');
        // Four groups, each saying what it is (system-view.md §11): the system and its counts,
        // the stage filter, the grouping switch, then the tab's tools. The "click opens
        // details · drag pins" hint lives in the inspector's empty state.
        const grouping = tab.grouping ?? 'canonical';
        this.toolbarEl.innerHTML = `
            <div class="atl-tb-title">
                <span class="atl-tb-system">${escapeHtml(tab.system)}</span>
                <span class="atl-tb-stats">${graph.nodes.filter((n) => n.member).length} members · ${graph.edges.length} edges</span>
            </div>
            <div class="atl-tb-center">
            <div class="atl-tb-group" role="group" aria-label="Stages">
                <span class="atl-tb-label">Stages</span>
                <button class="atl-chip ${tab.stages.length === 0 ? 'is-active' : ''}" data-stage="">all</button>
                ${chips}
            </div>
            <div class="atl-tb-group" role="group" aria-label="Grouping">
                <span class="atl-tb-label">Grouping</span>
                <span class="atl-seg">
                    <button class="${grouping === 'canonical' ? 'is-active' : ''}" data-grouping="canonical" title="Members sharing a canonical name collapse into one node">Grouped</button>
                    <button class="${grouping === 'observed' ? 'is-active' : ''}" data-grouping="observed" title="Every observed entity stays its own node">${EVERY_ICON}Every entity</button>
                </span>
            </div>
            </div>
            <span class="atl-toolbar-right">
                <button class="atl-btn ${this.keyOpen ? 'is-on' : ''}" data-ref="key-toggle" title="Show or hide the key">Key</button>
                <button class="atl-btn ${this.inspectorOpen ? 'is-on' : ''}" data-ref="inspector-toggle" title="Show or hide the inspector">Inspector</button>
                <button class="atl-btn" data-ref="refetch" title="Re-read the graph">Refresh</button>
            </span>`;
        this.toolbarEl.querySelectorAll('[data-stage]').forEach((chip) => chip.addEventListener('click', () => {
            const stage = chip.dataset.stage;
            const auto = tab.name === tabName(tab.system, tab.stages);
            if (stage === '') tab.stages = [];
            else if (tab.stages.some((x) => x.toLowerCase() === stage.toLowerCase())) tab.stages = tab.stages.filter((x) => x.toLowerCase() !== stage.toLowerCase());
            else tab.stages.push(stage);
            if (auto) tab.name = tabName(tab.system, tab.stages);
            this.renderTabs();
            this.persistViews();
            this.openView();
        }));
        this.toolbarEl.querySelectorAll('[data-grouping]').forEach((chip) => chip.addEventListener('click', () => {
            if ((tab.grouping ?? 'canonical') === chip.dataset.grouping) return;
            // The name does not change: the tab's icon shows the grouping (§14).
            tab.grouping = chip.dataset.grouping;
            this.renderTabs();
            this.graphs.delete(tab.id);
            this.persistViews();
            this.openView();
        }));
        this.toolbarEl.querySelector('[data-ref="refetch"]').addEventListener('click', () => {
            this.graphs.delete(tab.id);
            this.openView();
        });
        this.toolbarEl.querySelector('[data-ref="inspector-toggle"]').addEventListener('click', () => {
            if (this.inspectorOpen) return this.closeInspector();
            this.inspectorOpen = true;
            this.saveLocal();
            this.renderInspector();
        });
        this.toolbarEl.querySelector('[data-ref="key-toggle"]').addEventListener('click', (e) => {
            this.keyOpen = !this.keyOpen;
            e.currentTarget.classList.toggle('is-on', this.keyOpen);
            this.saveLocal();
            this.renderKey();
        });
    }

    // --- the inspector ---------------------------------------------------------------------

    /// Open while a view is open (his 2026-08-25 field call — visibility must not depend on
    /// discovering the click), empty until a selection fills it. Its × closes it (2026-10-01,
    /// system-view.md §12); the toolbar's Inspector button or any selection brings it back.
    renderInspector() {
        const viewOpen = this.active !== 'builder' && this.active !== 'registry' && !!this.tab();
        this.inspectorEl.hidden = !viewOpen || !this.inspectorOpen;
        this.toolbarEl.querySelector('[data-ref="inspector-toggle"]')?.classList.toggle('is-on', this.inspectorOpen);
        if (this.inspectorEl.hidden) return;
        if (!this.selection) {
            this.inspectorEl.innerHTML = `
                <div class="atl-card-head"><span class="atl-key">inspector</span><button class="atl-btn" data-ref="close" title="Close the inspector">×</button></div>
                <p class="atl-muted">Nothing selected — click a node or edge for its details. Dragging pins instead of selecting.</p>`;
            this.bindInspectorClose();
            return;
        }
        const { type, item } = this.selection;
        if (type === 'node') {
            const serves = item.serves.map((a, i) => `
                <div class="atl-row atl-kv"><span class="atl-key">${i === 0 ? 'serves' : ''}</span>
                <span class="atl-kv-cell"><span class="atl-badge">${escapeHtml(a.system || '—')}${a.stages.length ? ` · ${a.stages.map(escapeHtml).join(', ')}` : ' · unstaged'}${a.canonicalName ? ` · as ${escapeHtml(a.canonicalName)}` : ''}</span>
                <span class="atl-muted">${escapeHtml([a.assertedBy, a.assertedAt].filter(Boolean).join(' · '))}</span></span></div>`).join('');
            // A canonical node expands to its concrete variants (canonical-names.md §4) —
            // observed name, host, stages, provenance — so the clean label never hides
            // the evidence, and a declared or phantom variant keeps its own mark.
            const variants = (item.variants ?? []).map((v, i) => `
                <div class="atl-row atl-kv"><span class="atl-key">${i === 0 ? 'variants' : ''}</span>
                <span class="atl-kv-cell"><span class="atl-mono">${escapeHtml(v.name)}</span>
                <span class="atl-muted">${escapeHtml([v.machine, v.container].filter(Boolean).join(' · '))}${v.stages.length ? ` · ${v.stages.map(escapeHtml).join(', ')}` : ' · unstaged'}</span>
                ${v.declared ? '<span class="atl-badge atl-badge-declared">declared</span>' : ''}
                ${v.phantom ? '<span class="atl-drift-bad">not observed</span>' : ''}
                <span class="atl-muted">${escapeHtml([v.assertedBy, v.assertedAt].filter(Boolean).join(' · '))}</span></span></div>`).join('');
            const state = item.member ? '' :
                item.unclassified ? '<div class="atl-drift-warn">unclassified — nobody has said what this serves; classify it in Triage</div>' :
                item.offSystem ? '<div class="atl-muted">serves other systems only — shown because an edge touches this view</div>' :
                '';
            this.inspectorEl.innerHTML = `
                <div class="atl-card-head">
                    <span class="atl-mono">${escapeHtml(item.name)}</span>
                    <button class="atl-btn" data-ref="close" title="Close the inspector">×</button>
                </div>
                <div class="atl-row"><span class="atl-badge ${item.declared ? 'atl-badge-declared' : ''}">${escapeHtml(item.kind)}</span>
                    ${item.canonical ? `<span class="atl-badge">canonical · ${item.variants.length} variant${item.variants.length === 1 ? '' : 's'}</span>` : ''}
                    ${item.phantom ? '<span class="atl-drift-bad">not observed at this address — the edge\'s claim only</span>' : ''}
                </div>
                ${item.machine ? `<div class="atl-row atl-kv"><span class="atl-key">machine</span><span class="atl-mono">${escapeHtml(item.machine)}</span></div>` : ''}
                ${item.canonical && (item.hosts ?? []).length > 1 ? `<div class="atl-row atl-kv"><span class="atl-key">hosts</span><span class="atl-mono">${item.hosts.map(escapeHtml).join(', ')}</span></div>` : ''}
                ${item.container ? `<div class="atl-row atl-kv"><span class="atl-key">${item.kind === 'database' ? 'instance' : 'site'}</span><span class="atl-mono">${escapeHtml(item.container)}</span></div>` : ''}
                ${serves || state}
                ${variants}
                ${item.note ? `<div class="atl-muted">${escapeHtml(item.note)}</div>` : ''}
                ${item.declared ? '<div class="atl-muted">Declared — asserted to exist, never corroborated.</div>' : ''}`;
        } else {
            // Both endpoints resolved from the graph (§5 promised them): name · host machine.
            const byId = new Map((this.graphs.get(this.active)?.nodes ?? []).map((n) => [n.id, n]));
            const end = (id) => {
                const n = byId.get(id);
                const host = n?.machine ?? ((n?.hosts ?? []).join(', ') || null);
                return n ? `${n.name}${host ? ` · ${host}` : ''}` : id;
            };
            this.inspectorEl.innerHTML = `
                <div class="atl-card-head">
                    <span class="atl-mono">${escapeHtml(item.name ?? 'edge')}</span>
                    <button class="atl-btn" data-ref="close" title="Close the inspector">×</button>
                </div>
                <div class="atl-row"><span class="atl-badge">${escapeHtml(item.verdict)}</span><span class="atl-muted">${escapeHtml(item.kind)} edge</span></div>
                <div class="atl-row atl-kv"><span class="atl-key">from</span><span class="atl-mono">${escapeHtml(end(item.sourceId))}</span></div>
                <div class="atl-row atl-kv"><span class="atl-key">to</span><span class="atl-mono">${escapeHtml(end(item.targetId))}</span></div>
                ${item.sourceFile ? `<div class="atl-row atl-kv"><span class="atl-key">seen in</span><span class="atl-mono">${escapeHtml(item.sourceFile)}</span></div>` : ''}
                ${item.detail ? `<div class="atl-muted">${escapeHtml(item.detail)}</div>` : ''}`;
        }
        this.bindInspectorClose();
    }

    bindInspectorClose() {
        this.inspectorEl.querySelector('[data-ref="close"]').addEventListener('click', () => this.closeInspector());
    }

    closeInspector() {
        this.selection = null;
        this.view?.setSelected?.(null);
        this.inspectorOpen = false;
        this.saveLocal();
        this.renderInspector();
    }
}

export default new AtlasPage();
