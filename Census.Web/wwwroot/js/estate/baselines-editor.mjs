import { fetchBaselines, saveBaselines } from './estate-api.mjs';

// The approved baselines' estate home (approved-baseline.md §9). Baselines are created by
// blessing a machine from its dossier — this panel is where they are scoped, retired and
// deleted, and where fleet coverage is stated out loud.

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);
}

const RESERVED_KEYS = ['class', 'machine'];

/// A selector with no keys matches the whole fleet — said in words, because an empty object
/// rendering as nothing at all is the one reading that would be dangerous here.
export function selectorChips(appliesTo) {
    const keys = Object.keys(appliesTo ?? {});
    if (keys.length === 0) return '<span class="est-badge est-badge-sdk">every machine</span>';
    return keys.map((key) => `
        <span class="est-facet-row est-selector-row">
            <span class="est-facet-key">${escapeHtml(key)}</span>
            ${appliesTo[key].map((v) => `<span class="est-badge">${escapeHtml(v)}</span>`).join('')}
        </span>`).join('');
}

/// Shared by this panel and the bless form so a scope is built the same way in both places.
export class SelectorEditor {
    constructor(appliesTo, suggestions) {
        this.draft = Object.fromEntries(Object.entries(appliesTo ?? {}).map(([k, v]) => [k, [...v]]));
        this.suggestions = suggestions ?? { keys: [], values: {} };
    }

    /// Folds a half-typed value in — losing what is visible in an input is how editors eat data.
    harvest(container) {
        container.querySelectorAll('[data-sel-add]').forEach((input) => {
            const value = input.value.trim();
            if (!value) return;
            const key = input.closest('[data-sel-key]').dataset.selKey;
            if (!this.draft[key].some((v) => v.toLowerCase() === value.toLowerCase())) this.draft[key].push(value);
        });
        for (const [key, values] of Object.entries(this.draft)) {
            if (values.length === 0) delete this.draft[key];
        }
        return this.draft;
    }

    html() {
        const rows = Object.entries(this.draft).map(([key, values]) => `
            <div class="est-edit-row" data-sel-key="${escapeHtml(key)}">
                <span class="est-facet-key">${escapeHtml(key)}</span>
                <span class="est-edit-chips">
                    ${values.map((v) => `
                        <span class="est-badge est-badge-removable">${escapeHtml(v)}
                            <button class="est-chip-x" data-sel-remove="${escapeHtml(v)}" aria-label="Remove ${escapeHtml(v)}">×</button>
                        </span>`).join('')}
                    <input class="est-edit-input" autocomplete="off" data-sel-add list="est-selvalues-${escapeHtml(key)}" placeholder="add…">
                    <datalist id="est-selvalues-${escapeHtml(key)}">
                        ${(this.suggestions.values[key] ?? []).map((v) => `<option value="${escapeHtml(v)}">`).join('')}
                    </datalist>
                </span>
            </div>`).join('');

        const keyOptions = [...RESERVED_KEYS, ...this.suggestions.keys]
            .filter((k, i, all) => all.indexOf(k) === i && !(k in this.draft));

        return `
            <div data-ref="selector">
                ${rows || '<div class="est-edit-row"><span class="est-muted">No keys — this scope matches every machine.</span></div>'}
                <div class="est-edit-row">
                    <input class="est-edit-input" autocomplete="off" data-ref="sel-new-key" list="est-selkeys" placeholder="scope key…" style="max-width:9rem">
                    <datalist id="est-selkeys">${keyOptions.map((k) => `<option value="${escapeHtml(k)}">`).join('')}</datalist>
                    <button class="est-btn" data-ref="sel-add-key">Add key</button>
                </div>
            </div>`;
    }

    bind(container, rerender) {
        container.querySelectorAll('[data-sel-remove]').forEach((btn) => btn.addEventListener('click', () => {
            const key = btn.closest('[data-sel-key]').dataset.selKey;
            this.draft[key] = this.draft[key].filter((v) => v !== btn.dataset.selRemove);
            if (this.draft[key].length === 0) delete this.draft[key];
            rerender();
        }));

        container.querySelectorAll('[data-sel-add]').forEach((input) => input.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const value = input.value.trim();
            if (!value) return;
            const key = input.closest('[data-sel-key]').dataset.selKey;
            if (!this.draft[key].some((v) => v.toLowerCase() === value.toLowerCase())) this.draft[key].push(value);
            rerender();
        }));

        const addKey = () => {
            const input = container.querySelector('[data-ref="sel-new-key"]');
            const key = input.value.trim();
            if (!key || key in this.draft) return;
            this.draft[key] = [];
            rerender();
        };
        container.querySelector('[data-ref="sel-add-key"]')?.addEventListener('click', addKey);
        container.querySelector('[data-ref="sel-new-key"]')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); addKey(); }
        });
    }
}

export class BaselinesEditor {
    constructor(fleet, onChanged) {
        this.fleet = fleet ?? [];        // canvas machines — mined for scope suggestions
        this.onChanged = onChanged;
        this.editingId = null;
        this.confirmingDeleteId = null;
        this.expandedId = null;
    }

    suggestions() {
        const keys = new Set(['stage']);
        const values = { class: new Set(), machine: new Set() };
        for (const m of this.fleet) {
            values.class.add(m.class);
            values.machine.add(m.machine);
            for (const [key, vals] of Object.entries(m.facets)) {
                keys.add(key);
                (values[key] ??= new Set());
                vals.forEach((v) => values[key].add(v));
            }
        }
        return {
            keys: [...keys],
            values: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, [...v]])),
        };
    }

    async mount(container) {
        this.container = container;
        container.innerHTML = '<p class="est-status">Loading baselines…</p>';
        try {
            this.view = await fetchBaselines();
        } catch (err) {
            container.innerHTML = `<p class="est-status est-error">${escapeHtml(err.message)}</p>`;
            return;
        }
        this.render();
    }

    async reload() {
        this.view = await fetchBaselines();
        this.editingId = null;
        this.confirmingDeleteId = null;
        this.render();
        this.onChanged();
    }

    /// The panel edits summaries; the file is the artifact, so a save re-reads it, applies the
    /// one change, and writes the whole thing back — entries are never round-tripped through
    /// the browser and so can never be lost by an edit that was not about them.
    async persist(mutate) {
        const config = await fetch('/api/baselines/config').then((r) => r.json());
        mutate(config);
        await saveBaselines(config);
        await this.reload();
    }

    render() {
        const { coverage } = this.view;
        const notJudgeable = coverage.notJudgeable > 0
            ? ` · <span class="est-catwarn">${coverage.notJudgeable} not judgeable</span>`
            : '';
        const coverageLine = coverage.machines === 0
            ? '<p class="est-status">No machines collected yet.</p>'
            : `<p class="est-coverage">
                   <strong>${coverage.inScope} of ${coverage.machines}</strong> collected machines are within a baseline's scope${notJudgeable}.
                   <span class="est-muted">Machines outside every scope are not judged — no deviations is not the same as nothing unapproved.</span>
               </p>`;

        const cards = this.view.baselines.map((b) => {
            if (this.editingId === b.id) return this.renderForm(b);

            const actions = this.confirmingDeleteId === b.id
                ? `<button class="est-btn est-btn-sm est-btn-danger" data-act="delete-confirm" data-id="${escapeHtml(b.id)}">Confirm delete</button>
                   <button class="est-btn est-btn-sm" data-act="delete-cancel">Cancel</button>`
                : `<button class="est-btn est-btn-sm" data-act="edit" data-id="${escapeHtml(b.id)}">Edit</button>
                   <button class="est-btn est-btn-sm" data-act="delete" data-id="${escapeHtml(b.id)}">Delete</button>`;

            const provenance = b.sourceMachine
                ? `blessed from <span class="est-mono">${escapeHtml(b.sourceMachine)}</span> as collected ${escapeHtml(b.sourceDate)}${b.blessedUtc ? ` · ${escapeHtml(String(b.blessedUtc).slice(0, 10))}` : ''}`
                : 'hand-assembled — no source machine';

            const requiredCount = b.entries.filter((e) => e.required).length;

            return `
                <div class="est-subcard ${b.active ? '' : 'est-rule-inactive'}">
                    <div class="est-subcard-head">
                        <span class="est-rule-id">
                            <span class="est-mono">${escapeHtml(b.id)}</span>
                            <span>${escapeHtml(b.label)}</span>
                            ${b.active ? '' : '<span class="est-muted">(retired)</span>'}
                        </span>
                        <span class="est-rule-actions">
                            <label class="est-check"><input type="checkbox" data-act="toggle" data-id="${escapeHtml(b.id)}" ${b.active ? 'checked' : ''}> active</label>
                            ${actions}
                        </span>
                    </div>
                    <div class="est-rule-line">${selectorChips(b.appliesTo)}</div>
                    <div class="est-rule-line">
                        <span class="est-badge">${b.entryCount} approved item${b.entryCount === 1 ? '' : 's'}</span>
                        ${requiredCount > 0 ? `<span class="est-badge est-badge-sdk">${requiredCount} required</span>` : ''}
                        <span class="est-badge">${b.matchedMachineCount} machine${b.matchedMachineCount === 1 ? '' : 's'}${b.active ? '' : ' would match'}</span>
                        <span class="est-muted">${provenance}</span>
                    </div>
                    ${b.note ? `<div class="est-rule-reason">${escapeHtml(b.note)}</div>` : ''}
                    ${this.renderEntries(b)}
                </div>`;
        }).join('');

        this.container.innerHTML = `
            <div data-ref="error"></div>
            ${coverageLine}
            ${cards || '<p class="est-status">Nothing blessed yet — open a machine and bless its software set to start.</p>'}`;

        this.bind();
    }

    /// Approved is the default and required is the assertion on top of it — so the toggle
    /// lives on the entry, and "found on X of N" sits beside it: a requirement nothing in
    /// scope carries is a typo, not an estate-wide failure, and it should read that way.
    renderEntries(b) {
        if (b.entries.length === 0) return '';
        const open = this.expandedId === b.id;
        if (!open) {
            return `<div class="est-rule-line"><button class="est-btn est-btn-sm" data-act="expand" data-id="${escapeHtml(b.id)}">Show items</button></div>`;
        }
        const rows = b.entries.map((e, i) => {
            const coverage = e.required
                ? `<span class="${e.presentOn === 0 ? 'est-catwarn' : 'est-muted'}">found on ${e.presentOn} of ${b.judgeableMachineCount}</span>`
                : '';
            return `
                <div class="est-binding">
                    <label class="est-check">
                        <input type="checkbox" data-act="require" data-id="${escapeHtml(b.id)}" data-index="${i}" ${e.required ? 'checked' : ''}> required
                    </label>
                    <span>${escapeHtml(e.displayName)}</span>
                    <span class="est-muted">${escapeHtml(e.installScope)}${e.architecture ? ` · ${escapeHtml(e.architecture)}` : ''}</span>
                    ${coverage}
                </div>`;
        }).join('');
        return `
            <div class="est-rule-line">
                <button class="est-btn est-btn-sm" data-act="collapse">Hide items</button>
            </div>
            ${rows}`;
    }

    renderForm(baseline) {
        // this.selector is created once on entering edit mode: re-creating it here would
        // reset the draft scope every time a chip is added, since render() runs per change.
        return `
            <div class="est-editor" data-ref="form">
                <div class="est-edit-row">
                    <span class="est-facet-key">id</span>
                    <span class="est-mono">${escapeHtml(baseline.id)}</span>
                    <span class="est-facet-key">label</span>
                    <input class="est-edit-input" autocomplete="off" data-field="label" value="${escapeHtml(baseline.label)}" style="max-width:none;flex:1">
                </div>
                <div class="est-edit-row"><span class="est-facet-key">applies to</span></div>
                ${this.selector.html()}
                <div class="est-edit-row">
                    <span class="est-facet-key">note</span>
                    <input class="est-edit-input" autocomplete="off" data-field="note" value="${escapeHtml(baseline.note ?? '')}" placeholder="why this scope, and who agreed" style="max-width:none;flex:1">
                </div>
                <div class="est-edit-actions">
                    <button class="est-btn est-btn-primary" data-act="save" data-id="${escapeHtml(baseline.id)}">Save baseline</button>
                    <button class="est-btn" data-act="cancel">Cancel</button>
                </div>
            </div>`;
    }

    bind() {
        const el = this.container;
        this.errorEl = el.querySelector('[data-ref="error"]');

        const on = (act, event, handler) => el.querySelectorAll(`[data-act="${act}"]`)
            .forEach((node) => node.addEventListener(event, handler));

        on('edit', 'click', (e) => {
            this.editingId = e.target.dataset.id;
            this.confirmingDeleteId = null;
            const baseline = this.view.baselines.find((b) => b.id === this.editingId);
            this.selector = new SelectorEditor(baseline.appliesTo, this.suggestions());
            this.render();
        });
        on('cancel', 'click', () => { this.editingId = null; this.render(); });
        on('delete', 'click', (e) => { this.confirmingDeleteId = e.target.dataset.id; this.render(); });
        on('delete-cancel', 'click', () => { this.confirmingDeleteId = null; this.render(); });

        on('expand', 'click', (e) => { this.expandedId = e.target.dataset.id; this.render(); });
        on('collapse', 'click', () => { this.expandedId = null; this.render(); });

        on('require', 'change', (e) => this.tryPersist((config) => {
            const baseline = config.baselines.find((b) => b.id === e.target.dataset.id);
            baseline.entries[Number(e.target.dataset.index)].required = e.target.checked;
        }));

        on('delete-confirm', 'click', (e) => this.tryPersist((config) => {
            config.baselines = config.baselines.filter((b) => b.id !== e.target.dataset.id);
        }));

        on('toggle', 'change', (e) => this.tryPersist((config) => {
            config.baselines.find((b) => b.id === e.target.dataset.id).active = e.target.checked;
        }));

        on('save', 'click', (e) => {
            const form = el.querySelector('[data-ref="form"]');
            const appliesTo = this.selector.harvest(form);
            const label = form.querySelector('[data-field="label"]').value.trim();
            const note = form.querySelector('[data-field="note"]').value.trim();
            this.tryPersist((config) => {
                const baseline = config.baselines.find((b) => b.id === e.target.dataset.id);
                baseline.label = label;
                baseline.appliesTo = appliesTo;
                baseline.note = note === '' ? null : note;
            });
        });

        const form = el.querySelector('[data-ref="form"]');
        if (form) this.selector.bind(form, () => this.render());
    }

    async tryPersist(mutate) {
        try {
            await this.persist(mutate);
        } catch (err) {
            this.errorEl.innerHTML = `<p class="est-status est-error">${escapeHtml(err.message)}</p>`;
        }
    }
}
