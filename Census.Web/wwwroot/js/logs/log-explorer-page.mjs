import { LogApi } from './log-api.mjs';
import { FacetPanel } from './facet-panel.mjs';
import { LogTable } from './log-table.mjs';
import { LogDrawer } from './log-drawer.mjs';
import { MODELS, MODEL_KEYS, defaultFields, pascal, facetParam, SLOW_MS } from './models.mjs';
import { ToastStack } from '../feature-access/components/toast-stack.mjs';
import { escapeHtml } from '../feature-access/utils/dom.mjs';
import { ICONS } from './icons.mjs';

// Log Explorer (log-explorer-and-trace.md §4), ported from xf-dashboard (log-explorer.md, support-tooling.md S3).
// Opens on today, with results.
const DEFAULT_DAYS = 1;
const DEFAULT_PAGE_SIZE = 25;
const DEFAULT_BUCKET = 'yyyy-mm-dd';
const STORAGE_PREFIX = 'log-explorer:fields:';
const SIDE_WIDTH_KEY = 'log-explorer:side-width';
const SIDE_MIN_REM = 14;
const SIDE_MAX_REM = 40;
const NOISE_KEY = 'log-explorer:noise';

// The request switch, on by default: the sign-in handshake (an anonymous 401 before every request) is never what a
// complaint is about. No poll switch: the apps' middleware does not record polls (T2).
const NOISE = [
    { key: 'handshake', param: 'hide-handshake', label: 'Hide sign-in handshakes', title: 'The anonymous 401 Windows sign-in sends before each request' }
];

// A link may open the explorer on one application or stage: /logs?application=X&stage=Y.
const LINKED = ['application', 'stage'];

// One click to the rows a complaint usually needs, today.
const PICKS = [
    { key: 'errors', label: 'Errors today', model: 'exception-event' },
    { key: 'writes', label: 'Writes today', model: 'api-request', flags: { writes: 'true' } },
    { key: 'refused', label: 'Refused today', model: 'api-request', flags: { refused: 'true' } },
    { key: 'slow', label: `Slow today (${SLOW_MS / 1000}s+)`, model: 'api-request', flags: { 'min-elapsed': String(SLOW_MS) } }
];

const QUICK_PICKS = [
    { key: 'today', label: 'Today', days: 0 },
    { key: '7d', label: '7d', days: 6 },
    { key: '30d', label: '30d', days: 29 }
];

const isoDate = date => {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const daysAgo = days => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - days);
    return isoDate(d);
};
const dayAfter = iso => {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    return isoDate(d);
};

const SHELL = `
    <div class="fa-page logx-page">
        <div class="logx-body">
            <aside class="logx-side" data-ref="side" aria-label="Search controls and facets">
                <div class="logx-controls">
                    <div class="logx-models">
                        <div class="fa-segments" role="group" aria-label="Log model" data-ref="models"></div>
                        <button type="button" class="fa-button fa-button--small" data-ref="fields" title="Fields: which are facets, which are columns">${ICONS.fields}<span class="logx-visually-hidden">Fields</span></button>
                    </div>
                    <div class="logx-window">
                        <div class="logx-dates">
                            <input type="date" data-ref="start" aria-label="From">
                            <span class="fa-muted logx-dates-sep">${ICONS.calendar}</span>
                            <input type="date" data-ref="end" aria-label="To">
                        </div>
                        <div class="logx-quick" role="group" aria-label="Quick ranges" data-ref="quick"></div>
                    </div>
                    <div class="logx-actions">
                        <button type="button" class="fa-button fa-button--quiet fa-button--small" data-ref="clear">${ICONS.clear}Clear</button>
                        <button type="button" class="fa-button fa-button--small logx-search" data-ref="search">${ICONS.search}Search</button>
                        <div class="fa-segments logx-operator" role="group" aria-label="Combine facets" data-ref="operator"></div>
                    </div>
                </div>
                <div class="logx-noise" data-ref="noise"></div>
                <div data-ref="facets"></div>
            </aside>
            <div class="logx-splitter" data-ref="splitter" role="separator" aria-orientation="vertical" aria-label="Resize the controls column" title="Drag to resize the controls column" tabindex="0"></div>
            <main class="logx-main">
                <div class="logx-picks" role="group" aria-label="Quick picks" data-ref="picks"></div>
                <p class="fa-summary logx-summary" data-ref="summary" aria-live="polite">Loading…</p>
                <div class="logx-chips" data-ref="chips"></div>
                <div data-ref="table"></div>
            </main>
        </div>
        <div data-ref="drawer"></div>
        <div class="fa-toasts" data-ref="toasts"></div>
    </div>`;

class LogExplorerPage {
    #api;
    #refs = {};
    #facets;
    #table;
    #drawer;
    #toasts;
    #state = {
        model: MODEL_KEYS[0],
        start: daysAgo(DEFAULT_DAYS - 1),
        end: daysAgo(0),
        operator: 'and',
        bucket: DEFAULT_BUCKET,
        fields: [],
        facets: [],
        facetsLoading: true,
        facetsError: null,
        selection: new Map(),
        rows: [],
        total: 0,
        pageIndex: 0,
        pageSize: DEFAULT_PAGE_SIZE,
        sortBy: null,
        rowsLoading: false,
        rowsError: null,
        searched: false,
        selectedId: null,
        noise: { handshake: true },
        pick: null
    };

    init(config = {}) {
        const root = typeof config.root === 'string'
            ? document.querySelector(config.root)
            : config.root ?? document.querySelector('#log-explorer');
        this.#api = new LogApi(config.apiBase ?? root.dataset.apiBase);

        root.innerHTML = SHELL;
        root.querySelectorAll('[data-ref]').forEach(element => { this.#refs[element.dataset.ref] = element; });

        this.#toasts = new ToastStack(this.#refs.toasts);
        this.#facets = new FacetPanel(this.#refs.facets, {
            onRetry: () => this.#loadFacets(),
            onToggleIn: field => this.#toggleIn(field),
            onPick: (field, value, checked) => this.#pick(field, value, checked),
            onJump: value => this.#jumpToBucket(value),
            onBucket: bucket => { this.#state.bucket = bucket; this.#loadFacets(); },
            onFilter: () => this.#renderFacets()
        });
        this.#table = new LogTable(this.#refs.table, {
            onRetry: () => this.#search(),
            onSort: sortBy => { this.#state.sortBy = sortBy; this.#state.pageIndex = 0; this.#search(); },
            onPage: pageIndex => { this.#state.pageIndex = pageIndex; this.#search(); },
            onPageSize: pageSize => { this.#state.pageSize = pageSize; this.#state.pageIndex = 0; this.#search(); },
            onOpen: id => this.#openRow(id)
        });
        this.#drawer = new LogDrawer(this.#refs.drawer, {
            onClose: () => { this.#state.selectedId = null; this.#renderTable(); },
            onStep: index => this.#stepRow(index),
            onPivot: (field, value) => this.#pivot(field, value),
            onNotice: (message, tone) => this.#toasts.show(message, tone ? { tone } : undefined),
            onFieldChange: (field, kind, checked) => this.#changeField(field, kind, checked),
            onResetFields: () => this.#resetFields()
        });

        this.#state.fields = this.#loadFields(this.#state.model);
        const here = new URLSearchParams(location.search);
        for (const field of LINKED) {
            if (here.get(field)) this.#state.selection.set(field, { values: new Set([here.get(field)]), isIn: true });
        }
        try {
            Object.assign(this.#state.noise, JSON.parse(localStorage.getItem(NOISE_KEY) ?? '{}') ?? {});
        } catch { /* the defaults stand */ }
        this.#bindToolbar();
        this.#renderToolbar();
        this.#renderChips();
        this.#renderTable();
        this.#loadFacets();
        this.#search();
    }

    // The query the switches and the pick add: noise for facets and rows, the pick for rows only.
    #flags({ withPick = true } = {}) {
        if (this.#state.model !== 'api-request') return {};
        const flags = {};
        for (const noise of NOISE) if (this.#state.noise[noise.key]) flags[noise.param] = 'true';
        const pick = PICKS.find(candidate => candidate.key === this.#state.pick);
        if (withPick && pick?.flags) Object.assign(flags, pick.flags);
        return flags;
    }

    #applyPick(key) {
        const pick = PICKS.find(candidate => candidate.key === key);
        this.#drawer.close();
        if (pick.model !== this.#state.model) this.#selectModel(pick.model, { search: false });
        Object.assign(this.#state, { pick: pick.flags ? key : null, start: daysAgo(0), end: daysAgo(0), pageIndex: 0, selection: new Map() });
        this.#renderToolbar();
        this.#renderChips();
        this.#loadFacets();
        this.#search();
    }

    // ----- toolbar -----

    #bindToolbar() {
        this.#refs.models.addEventListener('click', event => {
            const button = event.target.closest('[data-model]');
            if (button) this.#selectModel(button.dataset.model);
        });
        this.#refs.quick.addEventListener('click', event => {
            const button = event.target.closest('[data-quick]');
            if (!button) return;
            const pick = QUICK_PICKS.find(candidate => candidate.key === button.dataset.quick);
            this.#setRange(daysAgo(pick.days), daysAgo(0));
        });
        this.#refs.operator.addEventListener('click', event => {
            const button = event.target.closest('[data-operator]');
            if (!button) return;
            this.#state.operator = button.dataset.operator;
            this.#renderToolbar();
            if (this.#state.searched) this.#search();
        });
        this.#bindSplitter();
        this.#refs.start.addEventListener('change', () => {
            if (this.#refs.start.value) this.#setRange(this.#refs.start.value, this.#state.end);
        });
        this.#refs.end.addEventListener('change', () => {
            if (this.#refs.end.value) this.#setRange(this.#state.start, this.#refs.end.value);
        });
        this.#refs.search.addEventListener('click', () => { this.#state.pageIndex = 0; this.#search(); });
        this.#refs.clear.addEventListener('click', () => this.#clear());
        this.#refs.fields.addEventListener('click', () => this.#drawer.openFields(this.#state.fields, { modelLabel: MODELS[this.#state.model].label }));
        this.#refs.chips.addEventListener('click', event => {
            if (event.target.closest('[data-remove-pick]')) {
                this.#state.pick = null;
                this.#renderChips();
                this.#renderToolbar();
                this.#search();
                return;
            }
            const button = event.target.closest('[data-remove]');
            if (!button) return;
            this.#state.selection.delete(button.dataset.remove);
            this.#afterSelectionChange();
        });
        this.#refs.picks.addEventListener('click', event => {
            const button = event.target.closest('[data-pick]');
            if (button) this.#applyPick(button.dataset.pick);
        });
        this.#refs.noise.addEventListener('change', event => {
            const input = event.target.closest('[data-noise]');
            if (!input) return;
            this.#state.noise[input.dataset.noise] = input.checked;
            try { localStorage.setItem(NOISE_KEY, JSON.stringify(this.#state.noise)); } catch { /* this visit only */ }
            this.#state.pageIndex = 0;
            this.#loadFacets();
            this.#search();
        });
    }

    #bindSplitter() {
        const body = this.#refs.splitter.parentElement;
        const remPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
        const clamp = px => Math.min(SIDE_MAX_REM * remPx, Math.max(SIDE_MIN_REM * remPx, px));
        const apply = px => body.style.setProperty('--logx-side', `${Math.round(px)}px`);
        const save = () => {
            try { localStorage.setItem(SIDE_WIDTH_KEY, String(this.#refs.side.getBoundingClientRect().width)); } catch { /* fine */ }
        };
        try {
            const saved = Number(localStorage.getItem(SIDE_WIDTH_KEY));
            if (saved > 0) apply(clamp(saved));
        } catch { /* fine */ }

        const splitter = this.#refs.splitter;
        let startX = 0;
        let startWidth = 0;
        splitter.addEventListener('pointerdown', event => {
            startX = event.clientX;
            startWidth = this.#refs.side.getBoundingClientRect().width;
            splitter.classList.add('is-dragging');
            splitter.setPointerCapture(event.pointerId);
            event.preventDefault();
        });
        splitter.addEventListener('pointermove', event => {
            if (!splitter.classList.contains('is-dragging')) return;
            apply(clamp(startWidth + event.clientX - startX));
        });
        const stop = () => {
            if (!splitter.classList.contains('is-dragging')) return;
            splitter.classList.remove('is-dragging');
            save();
        };
        splitter.addEventListener('pointerup', stop);
        splitter.addEventListener('pointercancel', stop);
        splitter.addEventListener('keydown', event => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            const width = this.#refs.side.getBoundingClientRect().width;
            apply(clamp(width + (event.key === 'ArrowLeft' ? -remPx : remPx)));
            save();
        });
        splitter.addEventListener('dblclick', () => {
            body.style.removeProperty('--logx-side');
            try { localStorage.removeItem(SIDE_WIDTH_KEY); } catch { /* fine */ }
        });
    }

    #renderToolbar() {
        const { model, start, end, operator } = this.#state;
        this.#refs.models.innerHTML = MODEL_KEYS.map(key => `
            <button type="button" class="fa-segment" data-model="${key}" aria-pressed="${key === model}">${escapeHtml(MODELS[key].label)}</button>`).join('');
        this.#refs.start.value = start;
        this.#refs.end.value = end;
        this.#refs.quick.innerHTML = QUICK_PICKS.map(pick => {
            const active = start === daysAgo(pick.days) && end === daysAgo(0);
            return `<button type="button" class="logx-quick-button" data-quick="${pick.key}" aria-pressed="${active}">${pick.label}</button>`;
        }).join('');
        this.#refs.picks.innerHTML = PICKS.map(pick => `
            <button type="button" class="logx-pick" data-pick="${pick.key}" aria-pressed="${this.#state.pick === pick.key}">${escapeHtml(pick.label)}</button>`).join('');
        this.#refs.noise.hidden = model !== 'api-request';
        this.#refs.noise.innerHTML = NOISE.map(noise => `
            <label class="logx-noise-switch" title="${escapeHtml(noise.title)}">
                <input type="checkbox" data-noise="${noise.key}" ${this.#state.noise[noise.key] ? 'checked' : ''}> ${escapeHtml(noise.label)}
            </label>`).join('');
        this.#refs.operator.innerHTML = ['and', 'or'].map(key => `
            <button type="button" class="fa-segment" data-operator="${key}" aria-pressed="${key === operator}" title="${key === 'and' ? 'Rows must match every facet' : 'Rows may match any facet'}">${key.toUpperCase()}</button>`).join('');
    }

    #renderSummary() {
        const { model, start, end, searched, total, rowsLoading, facetsLoading } = this.#state;
        const noun = MODELS[model].noun;
        const window = start === end ? `on ${start}` : `from ${start} to ${end}`;
        if (facetsLoading) {
            this.#refs.summary.textContent = `${MODELS[model].label} · loading facets ${window}…`;
        } else if (rowsLoading) {
            this.#refs.summary.textContent = `${MODELS[model].label} · searching…`;
        } else if (searched) {
            this.#refs.summary.textContent = `${MODELS[model].label} · ${total.toLocaleString()} ${noun} ${window}`;
        } else {
            this.#refs.summary.textContent = `${MODELS[model].label} · ${window}`;
        }
    }

    // ----- state changes -----

    #selectModel(model, { search = true } = {}) {
        if (model === this.#state.model) return;
        this.#drawer.close();
        Object.assign(this.#state, {
            model,
            fields: this.#loadFields(model),
            selection: new Map(),
            rows: [],
            total: 0,
            pageIndex: 0,
            sortBy: null,
            searched: false,
            rowsError: null,
            selectedId: null,
            pick: null
        });
        this.#renderToolbar();
        this.#renderChips();
        this.#renderTable();
        if (!search) return;
        this.#loadFacets();
        this.#search();
    }

    #setRange(start, end) {
        if (end < start) [start, end] = [end, start];
        this.#state.start = start;
        this.#state.end = end;
        this.#state.pageIndex = 0;
        this.#renderToolbar();
        this.#loadFacets();
        if (this.#state.searched) this.#search();
    }

    #jumpToBucket(value) {
        // yyyy-MM-dd → that day; yyyy-MM → that month; other buckets (hours) do not map to a date range.
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            this.#setRange(value, value);
        } else if (/^\d{4}-\d{2}$/.test(value)) {
            const [year, month] = value.split('-').map(Number);
            const last = new Date(year, month, 0).getDate();
            this.#setRange(`${value}-01`, `${value}-${String(last).padStart(2, '0')}`);
        } else {
            this.#toasts.show('Hour buckets show the spread; pick a day or month bucket to narrow the dates.');
        }
    }

    #toggleIn(field) {
        const picked = this.#state.selection.get(field) ?? { values: new Set(), isIn: true };
        picked.isIn = !picked.isIn;
        this.#state.selection.set(field, picked);
        this.#afterSelectionChange();
    }

    #pick(field, value, checked) {
        const picked = this.#state.selection.get(field) ?? { values: new Set(), isIn: true };
        if (checked) picked.values.add(value); else picked.values.delete(value);
        if (picked.values.size === 0 && picked.isIn) {
            this.#state.selection.delete(field);
        } else {
            this.#state.selection.set(field, picked);
        }
        this.#afterSelectionChange();
    }

    #pivot(field, value) {
        this.#drawer.close();
        this.#state.selection = new Map([[field, { values: new Set([String(value)]), isIn: true }]]);
        this.#state.pageIndex = 0;
        this.#afterSelectionChange();
        this.#search();
        this.#toasts.show(`Showing everything with this ${this.#field(field)?.header.toLowerCase() ?? field}`);
    }

    #afterSelectionChange() {
        this.#state.pageIndex = 0;
        this.#renderChips();
        this.#renderFacets();
    }

    #clear() {
        this.#drawer.close();
        Object.assign(this.#state, { selection: new Map(), pick: null, pageIndex: 0, sortBy: null, rowsError: null, selectedId: null });
        this.#renderToolbar();
        this.#renderChips();
        this.#renderFacets();
        this.#search();
    }

    // ----- fields -----

    #field(name) {
        return this.#state.fields.find(field => field.field === name);
    }

    #loadFields(model) {
        const defaults = defaultFields(model);
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_PREFIX + model) ?? 'null');
            if (saved && typeof saved === 'object') {
                for (const field of defaults) {
                    const choice = saved[field.field];
                    if (choice) {
                        field.facet = Boolean(choice.facet);
                        field.column = Boolean(choice.column);
                    }
                }
            }
        } catch {
            // nothing saved, or storage unavailable
        }
        return defaults;
    }

    #saveFields() {
        try {
            const choices = Object.fromEntries(this.#state.fields.map(field => [field.field, { facet: field.facet, column: field.column }]));
            localStorage.setItem(STORAGE_PREFIX + this.#state.model, JSON.stringify(choices));
        } catch {
            // storage unavailable; the session still works
        }
    }

    #changeField(name, kind, checked) {
        const field = this.#field(name);
        if (!field) return;
        field[kind] = checked;
        this.#saveFields();
        if (kind === 'facet') {
            if (!checked) {
                this.#state.selection.delete(name);
                this.#renderChips();
            }
            this.#loadFacets();
        } else {
            this.#renderTable();
        }
    }

    #resetFields() {
        try { localStorage.removeItem(STORAGE_PREFIX + this.#state.model); } catch { /* fine */ }
        this.#state.fields = defaultFields(this.#state.model);
        this.#drawer.openFields(this.#state.fields, { modelLabel: MODELS[this.#state.model].label });
        this.#loadFacets();
        this.#renderTable();
    }

    // ----- facets -----

    #profileFields() {
        return this.#state.fields.filter(field => field.facet).map(field => (field.kind === 'date' ? `${pascal(field.field)}-${this.#state.bucket}` : pascal(field.field)));
    }

    async #loadFacets() {
        const { model, start, end } = this.#state;
        Object.assign(this.#state, { facetsLoading: true, facetsError: null });
        this.#renderFacets();
        this.#renderSummary();
        try {
            const facets = await this.#api.facets(model, { start, endExclusive: dayAfter(end), profileFields: this.#profileFields(), flags: this.#flags({ withPick: false }) });
            if (model !== this.#state.model) return;
            Object.assign(this.#state, { facets, facetsLoading: false });
        } catch (error) {
            Object.assign(this.#state, { facets: [], facetsLoading: false, facetsError: `Facets couldn't be loaded. ${error.message}` });
        }
        this.#renderFacets();
        this.#renderSummary();
    }

    #renderFacets() {
        const { facets, fields, selection, bucket, facetsLoading, facetsError } = this.#state;
        this.#facets.render({ facets, fields, selection, dateBucket: bucket, loading: facetsLoading, error: facetsError });
    }

    #renderChips() {
        const pick = PICKS.find(candidate => candidate.key === this.#state.pick);
        const pickChip = pick ? `<span class="logx-chip is-pick"><strong>${escapeHtml(pick.label.replace(/ today.*/, ''))}</strong> only<button type="button" class="logx-chip-remove" data-remove-pick="1" aria-label="Remove ${escapeHtml(pick.label)}">×</button></span>` : '';
        const chips = [...this.#state.selection.entries()].map(([field, picked]) => {
            const header = this.#field(field)?.header ?? field;
            const values = [...picked.values];
            const list = values.length > 3 ? `${values.slice(0, 3).map(escapeHtml).join(', ')} +${values.length - 3}` : values.map(escapeHtml).join(', ');
            return `<span class="logx-chip${picked.isIn ? '' : ' is-nin'}"><strong>${escapeHtml(header)}</strong> ${picked.isIn ? 'in' : 'not in'} ${list || '(none)'}<button type="button" class="logx-chip-remove" data-remove="${escapeHtml(field)}" aria-label="Remove ${escapeHtml(header)} selection">×</button></span>`;
        });
        this.#refs.chips.innerHTML = chips.length || pickChip
            ? pickChip + chips.join('')
            : '<span class="fa-muted">No facets selected: every row in the window.</span>';
    }

    // ----- rows -----

    #selections() {
        return [...this.#state.selection.entries()]
            .filter(([, picked]) => picked.values.size > 0)
            .map(([field, picked]) => [facetParam(field, picked.isIn), [...picked.values]]);
    }

    async #search() {
        const { model, start, end, operator, pageIndex, pageSize, sortBy } = this.#state;
        Object.assign(this.#state, { rowsLoading: true, rowsError: null, searched: true });
        this.#renderTable();
        this.#renderSummary();
        try {
            const { items, total } = await this.#api.search(model, {
                start, endExclusive: dayAfter(end), operator, selections: this.#selections(), pageIndex, pageSize, sortBy, flags: this.#flags()
            });
            if (model !== this.#state.model) return;
            Object.assign(this.#state, { rows: items, total, rowsLoading: false });
            if (this.#drawer.isOpen && this.#drawer.rowId !== null) {
                const index = items.findIndex(row => String(row.id) === this.#drawer.rowId);
                if (index === -1) this.#drawer.close();
            }
        } catch (error) {
            Object.assign(this.#state, { rows: [], total: 0, rowsLoading: false, rowsError: `Search failed. ${error.message}` });
        }
        this.#renderTable();
        this.#renderSummary();
    }

    #renderTable() {
        const { rows, fields, total, pageIndex, pageSize, sortBy, rowsLoading, rowsError, selectedId, searched, selection } = this.#state;
        this.#table.render({
            rows, fields, total, pageIndex, pageSize, sortBy, loading: rowsLoading, error: rowsError, selectedId, searched,
            emptyMessage: selection.size ? 'No rows match these facets in this window.' : 'No rows in this window.'
        });
    }

    #openRow(id) {
        const index = this.#state.rows.findIndex(row => String(row.id) === String(id));
        if (index === -1) return;
        this.#state.selectedId = String(id);
        this.#renderTable();
        this.#drawer.openRow(this.#state.rows[index], {
            fields: this.#state.fields,
            index,
            count: this.#state.rows.length,
            modelLabel: MODELS[this.#state.model].label
        });
    }

    #stepRow(index) {
        const row = this.#state.rows[index];
        if (row) this.#openRow(row.id);
    }
}

export default new LogExplorerPage();
