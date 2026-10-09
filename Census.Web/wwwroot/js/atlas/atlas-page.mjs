import { fetchSystemsOverview, fetchSystemGraph, fetchViews, saveViews, fetchStageCrossings, saveStageCrossings } from './atlas-api.mjs';
import { PhysicsView, shapeSvg } from './physics-view.mjs';
import { LayeredView } from './layered-view.mjs';
import { ROWS as LAYER_ROWS } from './layered-placement.mjs';
import { stageColor } from './stage-colors.mjs';
import { RegistryPanel } from './registry-panel.mjs';
import { fetchEntityTagsConfig, saveEntityTags } from '../estate/estate-api.mjs';
import { ensureLeaf, upgradeLeaf } from '../estate/entity-tags-edit.mjs';

// Atlas (system-view.md): pick a system, see its dependency graph. Tabs are built views —
// {id, name, system, stages, strategy, grouping, positions} — estate artifacts in config/views.json
// (GET/PUT /api/views, promoted from localStorage 2026-08-25); localStorage keeps only
// what is personal: the open tab and whether the key shows. Strategies own layout and
// drawing only; the filter strip, the inspector, and the honesty rules (ghost-never-hide,
// declared seam, unclassified shown) live here, so every future view type inherits them.

const LOCAL_KEY = 'census-atlas-tabs-v1';
const ASSERTED_BY_KEY = 'census-asserted-by';

const STRATEGIES = {
    physics: { label: 'Physics graph', make: (onSelect, onPositions) => new PhysicsView(onSelect, onPositions) },
    // Layered (layered-view.md §4): stage planes, browser/server/data rows, peers to the
    // side. Observed grouping only — the planes are the stage variants.
    layered: { label: 'Layered', make: (onSelect) => new LayeredView(onSelect) },
};

const LAYERED_ICON = `<svg class="atl-every" viewBox="0 0 16 16" aria-hidden="true">
    <rect x="2" y="2.5" width="12" height="2.6" rx="1"></rect><rect x="2" y="6.7" width="12" height="2.6" rx="1"></rect>
    <rect x="2" y="10.9" width="12" height="2.6" rx="1"></rect></svg>`;

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
        // The same identity Triage's assertions carry (triage-panel.mjs) — one name per browser.
        this.assertedBy = localStorage.getItem(ASSERTED_BY_KEY) ?? '';
        this.lifting = false;
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
                <button class="atl-tab ${this.active === t.id ? 'is-active' : ''}" data-tab="${escapeHtml(t.id)}"${t.strategy === 'layered' ? ' title="Layered — stage planes, browser / server / data rows"' : t.grouping === 'observed' ? ' title="Every entity — nothing grouped by canonical name"' : ''}>
                    ${t.strategy === 'layered' ? LAYERED_ICON : t.grouping === 'observed' ? EVERY_ICON : ''}${escapeHtml(t.name)}
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
        this.overview = overview;
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
                    <span class="atl-seg" role="group" aria-label="Layout">
                        <button class="is-active" data-strategy="physics" title="A settled graph — drag to pin">Physics</button>
                        <button data-strategy="layered" title="Stage planes with browser, server and data rows; downstream services to the side${r.layersInUse?.length ? '' : ' — no member carries a layer tag yet, applications land in the unplaced row'}">${LAYERED_ICON}Layered</button>
                    </span>
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
            el.querySelectorAll('[data-strategy]').forEach((btn) => btn.addEventListener('click', () => {
                el.querySelectorAll('[data-strategy]').forEach((b) => b.classList.toggle('is-active', b === btn));
            }));
            el.querySelectorAll('[data-grouping]').forEach((btn) => btn.addEventListener('click', () => {
                const strategy = el.querySelector('[data-strategy].is-active')?.dataset.strategy ?? 'physics';
                // Layered draws every entity: the planes are the stage variants (layered-view.md §4).
                const grouping = strategy === 'layered' ? 'observed' : btn.dataset.grouping;
                const stages = picked();
                const tab = {
                    id: `t${(this.tabs.length + 1)}-${system.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
                    name: nameEl.value.trim() || tabName(system, stages),
                    system,
                    stages,               // empty = all stages
                    strategy,
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
                graph = await fetchSystemGraph(tab.system, tab.strategy === 'layered' ? 'observed' : (tab.grouping ?? 'canonical'), tab.services !== 'unfolded');
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
        this.lifting = false;
        this.view.onLiftCleared = () => {
            this.lifting = false;
            this.toolbarEl.querySelector('[data-ref="lift"]')?.classList.remove('is-on');
        };
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
        const layered = this.tab()?.strategy === 'layered';
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
                ${row(kind('capsule'), 'cross-cutting service — a system every system calls, folded per stage; ×n = endpoints inside')}
                ${layered ? row(`<svg class="atl-key-swatch" viewBox="-13 -11 26 22" aria-hidden="true"><g class="atl-node atl-member atl-card"><rect class="atl-shape" x="-12" y="-7" width="24" height="14" rx="3"></rect></g></svg>`, 'card — one thing, named in words; the icon is its kind') : ''}
                ${layered ? row(`<svg class="atl-key-swatch" viewBox="-13 -11 26 22" aria-hidden="true"><g class="atl-lay-browser"><rect class="atl-shape" x="-12" y="-8" width="24" height="16" rx="3"></rect><path class="atl-lay-browser-bar" d="M -12 -3 H 12"></path></g></svg>`, 'browser — a web or spa app, seen from the browser') : ''}
            </div>
            ${layered ? `<div>
                <div class="atl-key-ghead">layers — bands</div>
                ${LAYER_ROWS.map((r) => row('<span class="atl-key-mark">—</span>', r === 'unplaced' ? 'unplaced — no layer tag yet' : r === 'browser' ? 'browser — the website, over its web or spa app' : r === 'server' ? 'server — web, spa, api, declared kinds' : 'data — databases, by kind')).join('')}
                ${row('<span class="atl-key-mark atl-lay-key-stem">┊</span>', 'spa — calls unobserved (no line is guessed)')}
                ${row('<span class="atl-key-mark atl-lay-key-stem">×n</span>', 'one line per pair — ×n says how many calls it carries')}
                ${row('<span class="atl-key-mark atl-lay-key-stem">⌐</span>', 'a crossing is routed under the bands, never through a plane')}
            </div>` : ''}
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
                ${row(edge('confirmed', 'atl-edge-crossing'), 'stage crossing — the ends share no stage')}
                ${row(edge('confirmed', 'atl-edge-crossing atl-edge-derived'), 'crossing judged on the machine\'s stage (derived)')}
                ${row(edge('confirmed', 'atl-edge-crossing atl-edge-accepted'), 'accepted crossing — meant, and said so')}
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
        const layered = tab.strategy === 'layered';
        this.toolbarEl.innerHTML = `
            <div class="atl-tb-title">
                <span class="atl-tb-system">${escapeHtml(tab.system)}</span>
                <span class="atl-tb-stats">${graph.nodes.filter((n) => n.member).length} members · ${graph.edges.length} edges</span>
                ${graph.crossings || graph.unjudgedEdges ? `<span class="atl-tb-stats">
                    ${graph.crossings ? `<button class="atl-lift ${this.lifting ? 'is-on' : ''}" data-ref="lift" title="Lift the stage crossings — edges whose ends share no stage. Any click on the graph puts it back.">${graph.crossings} crossing${graph.crossings === 1 ? '' : 's'}</button>` : ''}
                    ${graph.unjudgedEdges ? `<span title="Edges with an unstaged end — nothing to compare until someone tags it in Triage">${graph.crossings ? ' · ' : ''}${graph.unjudgedEdges} unjudged</span>` : ''}
                </span>` : ''}
            </div>
            <div class="atl-tb-center">
            <div class="atl-tb-group" role="group" aria-label="Stages">
                <span class="atl-tb-label">Stages</span>
                <button class="atl-chip ${tab.stages.length === 0 ? 'is-active' : ''}" data-stage="">all</button>
                ${chips}
            </div>
            <div class="atl-tb-group" role="group" aria-label="Grouping">
                <span class="atl-tb-label">Grouping</span>
                <span class="atl-seg ${layered ? 'is-disabled' : ''}" ${layered ? 'title="The layered view draws every entity — the planes are the stage variants"' : ''}>
                    <button class="${!layered && grouping === 'canonical' ? 'is-active' : ''}" data-grouping="canonical" ${layered ? 'disabled' : ''} title="Members sharing a canonical name collapse into one node">Grouped</button>
                    <button class="${layered || grouping === 'observed' ? 'is-active' : ''}" data-grouping="observed" ${layered ? 'disabled' : ''} title="Every observed entity stays its own node">${EVERY_ICON}Every entity</button>
                </span>
            </div>
            ${graph.services?.length ? `<div class="atl-tb-group" role="group" aria-label="Services">
                <span class="atl-tb-label">Services</span>
                <span class="atl-seg">
                    <button class="${tab.services !== 'unfolded' ? 'is-active' : ''}" data-services="folded" title="Cross-cutting systems (${escapeHtml([...new Set(graph.services.map((x) => x.system))].join(', '))}) fold into one capsule per stage">Folded</button>
                    <button class="${tab.services === 'unfolded' ? 'is-active' : ''}" data-services="unfolded" title="Every endpoint of a cross-cutting system drawn as itself">Unfolded</button>
                </span>
            </div>` : ''}
            <div class="atl-tb-group" role="group" aria-label="Layout">
                <span class="atl-tb-label">Layout</span>
                <span class="atl-seg">
                    <button class="${!layered ? 'is-active' : ''}" data-strategy="physics" title="A settled graph — drag to pin">Physics</button>
                    <button class="${layered ? 'is-active' : ''}" data-strategy="layered" title="Stage planes with browser, server and data rows; downstream services to the side">${LAYERED_ICON}Layered</button>
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
        this.toolbarEl.querySelectorAll('[data-strategy]').forEach((btn) => btn.addEventListener('click', () => {
            if ((tab.strategy ?? 'physics') === btn.dataset.strategy) return;
            tab.strategy = btn.dataset.strategy;
            this.renderTabs();
            this.graphs.delete(tab.id);
            this.persistViews();
            this.openView();
        }));
        this.toolbarEl.querySelectorAll('[data-grouping]').forEach((chip) => chip.addEventListener('click', () => {
            if (chip.disabled) return;
            if ((tab.grouping ?? 'canonical') === chip.dataset.grouping) return;
            // The name does not change: the tab's icon shows the grouping (§14).
            tab.grouping = chip.dataset.grouping;
            this.renderTabs();
            this.graphs.delete(tab.id);
            this.persistViews();
            this.openView();
        }));
        this.toolbarEl.querySelectorAll('[data-services]').forEach((chip) => chip.addEventListener('click', () => {
            if ((tab.services ?? 'folded') === chip.dataset.services) return;
            tab.services = chip.dataset.services;
            this.graphs.delete(tab.id);
            this.persistViews();
            this.openView();
        }));
        this.toolbarEl.querySelector('[data-ref="lift"]')?.addEventListener('click', (e) => {
            this.lifting = !this.lifting;
            e.currentTarget.classList.toggle('is-on', this.lifting);
            this.view?.setLift?.(this.lifting);
        });
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
                item.service ? `<div class="atl-muted">cross-cutting service — ${item.variants.length} endpoint${item.variants.length === 1 ? '' : 's'} folded (${escapeHtml(item.name)}${item.serviceStages?.length ? ` · ${item.serviceStages.map(escapeHtml).join(', ')}` : ''}); the toolbar's Services switch unfolds them</div>` :
                item.unclassified ? '<div class="atl-drift-warn">unclassified — nobody has said what this serves; classify it in Triage</div>' :
                item.offSystem ? '<div class="atl-muted">serves other systems only — shown because an edge touches this view</div>' :
                '';
            // The layer, editable here (layered-view.md §3.1): the one tag the layered picture
            // is about, on a concrete member application of the viewed system. The claim's
            // other axes stay Triage's.
            const graphSystem = this.graphs.get(this.active)?.system ?? '';
            const claim = item.serves.find((a) => (a.system ?? '').toLowerCase() === graphSystem.toLowerCase());
            const layerEditable = item.kind === 'application' && item.member && !item.canonical && !item.service && !!claim;
            const layerRow = layerEditable ? (() => {
                const inUse = this.overview?.find((r) => (r.name ?? '').toLowerCase() === graphSystem.toLowerCase())?.layersInUse ?? [];
                const values = ['web', 'spa', 'api'];
                for (const v of inUse) if (!values.some((x) => x.toLowerCase() === v.toLowerCase())) values.push(v);
                return `
                <div class="atl-row atl-kv"><span class="atl-key">layer</span>
                    <span class="atl-kv-cell">
                        <span class="atl-accept">
                            <input class="atl-card-name atl-accept-by" data-ref="layer" placeholder="web, spa or api" value="${escapeHtml(claim.layer ?? '')}">
                            ${values.map((v) => `<button class="atl-btn ${(claim.layer ?? '').toLowerCase() === v.toLowerCase() ? 'is-on' : ''}" data-layer-chip="${escapeHtml(v)}">${escapeHtml(v)}</button>`).join('')}
                        </span>
                        <span class="atl-accept">
                            <input class="atl-card-name atl-accept-by" data-ref="layer-by" placeholder="by" value="${escapeHtml(this.assertedBy)}">
                            <button class="atl-btn" data-ref="layer-save" title="Write the layer onto this entity's claim — emptied removes it">Save</button>
                        </span>
                        ${!claim.layer ? '<span class="atl-drift-warn">untagged — the layered picture cannot place it</span>' : ''}
                    </span></div>
                <div class="atl-error" data-ref="layer-error" hidden></div>`;
            })() : '';
            this.inspectorEl.innerHTML = `
                <div class="atl-card-head">
                    <span class="atl-mono">${escapeHtml(item.name)}</span>
                    <button class="atl-btn" data-ref="close" title="Close the inspector">×</button>
                </div>
                <div class="atl-row"><span class="atl-badge ${item.declared ? 'atl-badge-declared' : ''}">${escapeHtml(item.kind)}</span>
                    ${item.canonical ? `<span class="atl-badge">canonical · ${item.variants.length} variant${item.variants.length === 1 ? '' : 's'}</span>` : ''}
                    ${item.service ? `<span class="atl-badge">cross-cutting · ${item.variants.length} endpoint${item.variants.length === 1 ? '' : 's'}</span>` : ''}
                    ${item.phantom ? '<span class="atl-drift-bad">not observed at this address — the edge\'s claim only</span>' : ''}
                </div>
                ${item.machine ? `<div class="atl-row atl-kv"><span class="atl-key">machine</span><span class="atl-mono">${escapeHtml(item.machine)}</span></div>` : ''}
                ${(item.canonical || item.service) && (item.hosts ?? []).length > 1 ? `<div class="atl-row atl-kv"><span class="atl-key">hosts</span><span class="atl-mono">${item.hosts.map(escapeHtml).join(', ')}</span></div>` : ''}
                ${item.container ? `<div class="atl-row atl-kv"><span class="atl-key">${item.kind === 'database' ? 'instance' : 'site'}</span><span class="atl-mono">${escapeHtml(item.container)}</span></div>` : ''}
                ${item.service ? state : (serves || state)}
                ${layerRow}
                ${variants}
                ${item.note ? `<div class="atl-muted">${escapeHtml(item.note)}</div>` : ''}
                ${item.declared ? '<div class="atl-muted">Declared — asserted to exist, never corroborated.</div>' : ''}`;
            const layerInput = this.inspectorEl.querySelector('[data-ref="layer"]');
            this.inspectorEl.querySelectorAll('[data-layer-chip]').forEach((btn) => btn.addEventListener('click', () => {
                layerInput.value = btn.dataset.layerChip;
                this.inspectorEl.querySelectorAll('[data-layer-chip]').forEach((b) => b.classList.toggle('is-on', b === btn));
            }));
            this.inspectorEl.querySelector('[data-ref="layer-save"]')?.addEventListener('click', () => this.saveLayer(item, claim,
                layerInput.value.trim(),
                this.inspectorEl.querySelector('[data-ref="layer-by"]').value.trim()));
        } else {
            // Both endpoints resolved from the graph (§5 promised them): name · host machine.
            const byId = new Map((this.graphs.get(this.active)?.nodes ?? []).map((n) => [n.id, n]));
            const end = (id) => {
                const n = byId.get(id);
                const host = n?.machine ?? ((n?.hosts ?? []).join(', ') || null);
                return n ? `${n.name}${host ? ` · ${host}` : ''}` : id;
            };
            // The crossing in words (stage-crossings.md §3.2): both ends with their stage sets,
            // the direction, the basis when derived; Accept or Withdraw right here.
            const nameOf = (id) => byId.get(id)?.name ?? id;
            const stagesOf = (s) => (s ?? []).length ? s.join(', ') : 'unstaged';
            const crossing = item.crossing ? `
                <div class="atl-row ${item.accepted ? 'atl-muted' : 'atl-drift-bad'}">
                    ${escapeHtml(nameOf(item.sourceId))} · ${escapeHtml(stagesOf(item.callerStages))} → ${escapeHtml(nameOf(item.targetId))} · ${escapeHtml(stagesOf(item.targetStages))}
                    — crossing, ${escapeHtml(item.crossing)}${item.crossingBasis === 'derived' ? ` · judged on ${escapeHtml(byId.get(item.targetId)?.machine ?? 'its machine')}'s stage, derived` : ''}
                </div>
                ${item.accepted ? `
                <div class="atl-row atl-kv"><span class="atl-key">accepted</span>
                    <span class="atl-kv-cell"><span class="atl-muted">${escapeHtml([item.accepted.by, item.accepted.at].filter(Boolean).join(', ') || 'unsigned')}${item.accepted.note ? ` — ${escapeHtml(item.accepted.note)}` : ''}</span>
                    <button class="atl-btn" data-ref="withdraw" title="Withdraw the acceptance — the crossing returns to the findings">Withdraw</button></span></div>`
                : `
                <div class="atl-row atl-kv"><span class="atl-key">accept</span>
                    <span class="atl-accept">
                        <input class="atl-card-name atl-accept-by" data-ref="accept-by" placeholder="by" value="${escapeHtml(this.assertedBy)}">
                        <input class="atl-card-name" data-ref="accept-note" placeholder="why this crossing is meant">
                        <button class="atl-btn" data-ref="accept" title="Say this crossing is meant — still drawn, out of the findings">Accept</button>
                    </span></div>`}`
                : item.unjudged ? `<div class="atl-row atl-drift-warn">unjudged — ${(item.callerStages ?? []).length ? 'the target' : 'the caller'} has no stage to compare; tag it in Triage</div>`
                : '';
            this.inspectorEl.innerHTML = `
                <div class="atl-card-head">
                    <span class="atl-mono">${escapeHtml(item.name ?? 'edge')}</span>
                    <button class="atl-btn" data-ref="close" title="Close the inspector">×</button>
                </div>
                <div class="atl-row"><span class="atl-badge">${escapeHtml(item.verdict)}</span><span class="atl-muted">${escapeHtml(item.kind)} edge</span></div>
                <div class="atl-row atl-kv"><span class="atl-key">from</span><span class="atl-mono">${escapeHtml(end(item.sourceId))}</span></div>
                <div class="atl-row atl-kv"><span class="atl-key">to</span><span class="atl-mono">${escapeHtml(end(item.targetId))}</span></div>
                ${item.sourceFile ? `<div class="atl-row atl-kv"><span class="atl-key">seen in</span><span class="atl-mono">${escapeHtml(item.sourceFile)}</span></div>` : ''}
                ${item.detail ? `<div class="atl-muted">${escapeHtml(item.detail)}</div>` : ''}
                ${crossing}
                <div class="atl-error" data-ref="crossing-error" hidden></div>`;
            this.inspectorEl.querySelector('[data-ref="accept"]')?.addEventListener('click', () => this.acceptCrossing(item,
                this.inspectorEl.querySelector('[data-ref="accept-by"]').value.trim(),
                this.inspectorEl.querySelector('[data-ref="accept-note"]').value.trim()));
            this.inspectorEl.querySelector('[data-ref="withdraw"]')?.addEventListener('click', () => this.withdrawCrossing(item));
        }
        this.bindInspectorClose();
    }

    // --- the layer, from the inspector (layered-view.md §3.1) ----------------------------------
    // The same write Triage's edit makes for this one axis: the claim on the viewed system
    // takes the value (emptied removes it), and the entity's other claims take it where they
    // say nothing (§1.4). Freshest file wins as the base; then the graph is re-read and the
    // node re-selected so the inspector and the picture show the new state.

    async saveLayer(item, claim, layer, by) {
        try {
            const config = { tags: await fetchEntityTagsConfig() };
            // The id is the leaf's address (kind, machine, container, name); the node's name is
            // its label (host + path), not the path the tags file keys on.
            const leaf = ensureLeaf(config, ...JSON.parse(item.id));
            const serves = upgradeLeaf(leaf);
            const target = serves.find((a) => (a.system ?? '').toLowerCase() === (claim.system ?? '').toLowerCase());
            if (!target) throw new Error(`${item.name} no longer claims ${claim.system} — re-open the view`);
            if (layer) target.layer = layer; else delete target.layer;
            target.assertedBy = by || undefined;
            target.assertedAt = new Date().toISOString().slice(0, 10);
            if (layer) for (const a of serves) if (!a.layer) a.layer = layer;
            await saveEntityTags(config.tags);
        } catch (err) {
            const el = this.inspectorEl.querySelector('[data-ref="layer-error"]');
            if (el) { el.textContent = err.message; el.hidden = false; }
            return;
        }
        if (by) {
            this.assertedBy = by;
            localStorage.setItem(ASSERTED_BY_KEY, by);
        }
        const tab = this.tab();
        this.graphs.delete(tab.id);
        await this.openView();
        const node = this.graphs.get(tab.id)?.nodes.find((n) => n.id === item.id);
        if (!node) return;
        this.selection = { type: 'node', item: node };
        this.view.setSelected?.({ type: 'node', id: node.id });
        this.renderInspector();
    }

    // --- accepted crossings (stage-crossings.md §4) -------------------------------------------
    // Whole-file replace on config/stage-crossings.json, keyed by the two node ids; then the
    // graph is re-read and the same edge re-selected so the inspector shows the new state.

    async acceptCrossing(item, by, note) {
        await this.writeCrossings(item, (accepted) => [
            ...accepted.filter((a) => !(a.caller === item.sourceId && a.target === item.targetId)),
            { caller: item.sourceId, target: item.targetId, by: by || null, at: new Date().toISOString().slice(0, 10), note: note || null },
        ]);
        if (by) {
            this.assertedBy = by;
            localStorage.setItem(ASSERTED_BY_KEY, by);
        }
    }

    async withdrawCrossing(item) {
        await this.writeCrossings(item, (accepted) => accepted.filter((a) => !(a.caller === item.sourceId && a.target === item.targetId)));
    }

    async writeCrossings(item, change) {
        try {
            const config = await fetchStageCrossings();
            config.accepted = change(config.accepted ?? []);
            await saveStageCrossings(config);
        } catch (err) {
            const el = this.inspectorEl.querySelector('[data-ref="crossing-error"]');
            if (el) { el.textContent = err.message; el.hidden = false; }
            return;
        }
        const tab = this.tab();
        this.graphs.delete(tab.id);
        await this.openView();
        const graph = this.graphs.get(tab.id);
        const index = graph?.edges.findIndex((e) => e.sourceId === item.sourceId && e.targetId === item.targetId && e.name === item.name) ?? -1;
        if (index < 0) return;
        this.selection = { type: 'edge', item: graph.edges[index] };
        this.view.setSelected?.({ type: 'edge', index });
        this.renderInspector();
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
