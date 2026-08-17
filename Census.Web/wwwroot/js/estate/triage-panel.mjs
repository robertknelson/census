import { fetchTriage, fetchEntityTagsConfig, saveEntityTags } from './estate-api.mjs';

// The Tuesday screen (triage-workbench.md): the unclassified pile, worked in bulk. Every
// apply persists the whole config immediately — config/entity-tags.json stays the artifact,
// hand-editable alongside this panel, and readers re-load it per request.

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);
}

// Selection keys are the address serialized whole, parsed back by JSON — never a
// hand-composed delimiter string that a name containing the delimiter could break.
function rowKey(kind, machine, container, name) {
    return JSON.stringify([kind, machine, container, name]);
}

function findKey(obj, key) {
    const lower = String(key).toLowerCase();
    return Object.keys(obj ?? {}).find((k) => k.toLowerCase() === lower) ?? key;
}

function splitValues(text) {
    return String(text ?? '').split(',').map((v) => v.trim()).filter(Boolean);
}

const ASSERTED_BY_KEY = 'census-asserted-by';

export class TriagePanel {
    constructor(onChanged, openDetails) {
        this.onChanged = onChanged;
        this.openDetails = openDetails;
        this.query = '';
        this.showClassified = false;
        this.selected = new Set();
        this.editKey = null;            // classified row being edited - overwrite semantics
        this.system = '';
        this.stage = '';
        this.assertedBy = localStorage.getItem(ASSERTED_BY_KEY) ?? '';
        this.error = null;
    }

    async mount(container) {
        this.container = container;
        container.innerHTML = '<p class="est-status">Reading the pile…</p>';
        try {
            this.data = await fetchTriage();
        } catch (err) {
            container.innerHTML = `<p class="est-status est-error">${escapeHtml(err.message)}</p>`;
            return;
        }
        this.render();
    }

    async refresh() {
        this.data = await fetchTriage();
        const known = new Set(this.visibleRows().map((r) => r.key));
        [...this.selected].filter((k) => !known.has(k)).forEach((k) => this.selected.delete(k));
        this.render();
    }

    // One flat list of workable rows across strata - the substrate for filter and select-all.
    machineRows(m) {
        const rows = m.unclassified.map((u) => ({
            key: rowKey(u.kind, m.machine, u.container, u.name),
            kind: u.kind, machine: m.machine, container: u.container, name: u.name,
            stratum: 'unclassified',
        }));
        for (const r of m.rows) {
            const stratum = r.resolution === 'dangling' ? 'dangling'
                : r.resolution === 'unknown' ? 'unverified'
                : 'classified';
            rows.push({
                key: rowKey(r.kind, m.machine, r.container, r.name),
                kind: r.kind, machine: m.machine, container: r.container, name: r.name,
                system: r.system, stage: r.stage, assertedBy: r.assertedBy, assertedAt: r.assertedAt,
                stratum,
            });
        }
        return rows;
    }

    matches(row) {
        if (!this.query) return true;
        return `${row.machine} ${row.container} ${row.name}`.toLowerCase().includes(this.query);
    }

    shown(row) {
        if (row.stratum === 'classified' || row.stratum === 'unverified') return this.showClassified;
        return true;
    }

    visibleRows() {
        return this.data.machines
            .flatMap((m) => this.machineRows(m))
            .filter((r) => this.shown(r) && this.matches(r));
    }

    selectable(row) {
        // Dangling rows are remove-or-re-assert, never a bulk-apply target: tagging a
        // vanished address harder does not make it exist. Unverified rows likewise wait.
        return row.stratum === 'unclassified' || row.stratum === 'classified';
    }

    render() {
        const visible = this.visibleRows();
        const byMachine = new Map();
        for (const row of visible) {
            if (!byMachine.has(row.machine)) byMachine.set(row.machine, []);
            byMachine.get(row.machine).push(row);
        }

        // Unknown scopes are pinned to their machine card, but a filter still narrows to
        // matching machines — unknown-never-hidden governs strata, not a search the user
        // is actively steering.
        const unknownMatches = (m) => !this.query
            || `${m.machine} ${m.unknown.map((u) => u.container ?? '').join(' ')}`.toLowerCase().includes(this.query);
        const machines = this.data.machines
            .filter((m) => byMachine.has(m.machine) || (m.unknown.length > 0 && unknownMatches(m)))
            .map((m) => this.renderMachine(m, byMachine.get(m.machine) ?? []))
            .join('');

        this.container.innerHTML = `
            <div class="est-triage">
                <div class="est-triage-controls">
                    <input class="est-filter" type="search" placeholder="Filter machines, instances, sites, names…" value="${escapeHtml(this.query)}" data-ref="filter">
                    <label class="est-check"><input type="checkbox" data-ref="show-classified" ${this.showClassified ? 'checked' : ''}> show classified</label>
                    <span class="est-muted">${this.data.unclassifiedTotal} unclassified fleet-wide</span>
                </div>
                <div data-ref="error">${this.error ? `<p class="est-status est-error">${escapeHtml(this.error)}</p>` : ''}</div>
                ${machines || '<p class="est-status">Nothing to triage — everything observed is classified. The pile is empty.</p>'}
                ${this.renderBar()}
            </div>`;
        this.bind();
    }

    renderMachine(m, rows) {
        const unknownLines = m.unknown.map((u) => {
            const scope = u.kind === 'instance' ? `instance <span class="est-mono">${escapeHtml(u.container)}</span>` : u.kind.toUpperCase();
            const tail = u.unverifiableCount > 0 ? ` · ${u.unverifiableCount} assertion${u.unverifiableCount === 1 ? '' : 's'} unverifiable` : '';
            return `<div class="est-triage-unknown">${scope} — collection ${escapeHtml(u.status)}, contents unknown${tail}</div>`;
        }).join('');

        const groups = new Map();
        for (const row of rows) {
            const label = `${row.kind === 'database' ? 'instance' : 'site'} ${row.container}`;
            if (!groups.has(label)) groups.set(label, []);
            groups.get(label).push(row);
        }

        const selectableRows = rows.filter((r) => this.selectable(r));
        const allSelected = selectableRows.length > 0 && selectableRows.every((r) => this.selected.has(r.key));

        return `
            <div class="est-subcard">
                <div class="est-subcard-head">
                    <span>
                        ${selectableRows.length > 0 ? `<input type="checkbox" data-group="${escapeHtml(m.machine)}" ${allSelected ? 'checked' : ''} title="Select everything on ${escapeHtml(m.machine)}">` : ''}
                        <button class="est-q-machine est-mono" data-machine="${escapeHtml(m.machine)}">${escapeHtml(m.machine)}</button>
                    </span>
                    <span class="est-muted">${m.unclassifiedCount > 0 ? `${m.unclassifiedCount} unclassified` : 'clear'}</span>
                </div>
                ${unknownLines}
                ${[...groups.entries()].map(([label, groupRows]) => this.renderGroup(m.machine, label, groupRows)).join('')}
            </div>`;
    }

    renderGroup(machine, label, rows) {
        const selectableRows = rows.filter((r) => this.selectable(r));
        const allSelected = selectableRows.length > 0 && selectableRows.every((r) => this.selected.has(r.key));
        return `
            <div class="est-triage-group">
                <div class="est-triage-group-head">
                    ${selectableRows.length > 0 ? `<input type="checkbox" data-group-rows='${escapeHtml(JSON.stringify(selectableRows.map((r) => r.key)))}' ${allSelected ? 'checked' : ''}>` : ''}
                    <span class="est-mono">${escapeHtml(label)}</span>
                </div>
                ${rows.map((r) => this.renderRow(r)).join('')}
            </div>`;
    }

    renderRow(row) {
        const chips = [
            ...(row.system ?? []).map((v) => `<span class="est-badge est-tag-system">${escapeHtml(v)}</span>`),
            ...(row.stage ?? []).map((v) => `<span class="est-badge">${escapeHtml(v)}</span>`),
        ].join('');
        const provenance = row.assertedBy || row.assertedAt
            ? `<span class="est-muted est-triage-prov">${escapeHtml([row.assertedBy, row.assertedAt].filter(Boolean).join(' · '))}</span>` : '';

        if (row.stratum === 'dangling') {
            return `
                <div class="est-triage-row est-triage-dangling">
                    <span class="est-triage-name"><span class="est-mono">${escapeHtml(row.name)}</span> <span class="est-catfail">no longer observed</span></span>
                    ${chips}${provenance}
                    <button class="est-btn est-btn-sm est-btn-danger" data-remove="${escapeHtml(row.key)}">Remove</button>
                </div>`;
        }
        if (row.stratum === 'unverified') {
            return `
                <div class="est-triage-row est-muted">
                    <span class="est-triage-name"><span class="est-mono">${escapeHtml(row.name)}</span> <span class="est-catwarn">unverified</span></span>
                    ${chips}${provenance}
                </div>`;
        }
        const actions = row.stratum === 'classified'
            ? `<button class="est-btn est-btn-sm" data-edit="${escapeHtml(row.key)}">Edit</button>
               <button class="est-btn est-btn-sm" data-remove="${escapeHtml(row.key)}">Remove</button>`
            : '';
        return `
            <div class="est-triage-row ${this.editKey === row.key ? 'is-editing' : ''}">
                <label class="est-check">
                    <input type="checkbox" data-row="${escapeHtml(row.key)}" ${this.selected.has(row.key) ? 'checked' : ''}>
                    <span class="est-triage-name"><span class="est-mono">${escapeHtml(row.name)}</span></span>
                </label>
                ${row.stratum === 'unclassified' ? '<span class="est-tag-none">unclassified</span>' : chips}
                ${provenance}${actions}
            </div>`;
    }

    renderBar() {
        const editing = this.editKey !== null;
        if (!editing && this.selected.size === 0) return '';
        const chipRow = (values, field) => values.map((v) =>
            `<button class="est-btn est-btn-sm" data-suggest="${escapeHtml(field)}" data-value="${escapeHtml(v)}">${escapeHtml(v)}</button>`).join('');
        const target = editing ? 'Save' : `Apply to ${this.selected.size}`;
        return `
            <div class="est-triage-bar">
                ${editing ? '<div class="est-muted">Editing one assertion — emptied fields clear that axis.</div>' : ''}
                <div class="est-edit-row">
                    <span class="est-facet-key">system</span>
                    <input class="est-edit-input" data-field="system" value="${escapeHtml(this.system)}" placeholder="comma-separated">
                    ${chipRow(this.data.systems, 'system')}
                </div>
                <div class="est-edit-row">
                    <span class="est-facet-key">stage</span>
                    <input class="est-edit-input" data-field="stage" value="${escapeHtml(this.stage)}" placeholder="comma-separated">
                    ${chipRow(this.data.stages, 'stage')}
                </div>
                <div class="est-edit-row">
                    <span class="est-facet-key">by</span>
                    <input class="est-edit-input" data-field="asserted-by" value="${escapeHtml(this.assertedBy)}" placeholder="who is asserting (optional)">
                    <button class="est-btn est-btn-primary" data-act="apply">${escapeHtml(target)}</button>
                    <button class="est-btn" data-act="cancel">Cancel</button>
                </div>
            </div>`;
    }

    bind() {
        const filter = this.container.querySelector('[data-ref="filter"]');
        filter.addEventListener('input', () => {
            this.query = filter.value.trim().toLowerCase();
            const pos = filter.selectionStart;
            this.render();
            const again = this.container.querySelector('[data-ref="filter"]');
            again.focus();
            again.setSelectionRange(pos, pos);
        });

        this.container.querySelector('[data-ref="show-classified"]').addEventListener('change', (e) => {
            this.showClassified = e.target.checked;
            this.render();
        });

        this.container.querySelectorAll('[data-machine]').forEach((btn) =>
            btn.addEventListener('click', () => this.openDetails(btn.dataset.machine)));

        this.container.querySelectorAll('[data-row]').forEach((box) => box.addEventListener('change', () => {
            this.editKey = null;
            if (box.checked) this.selected.add(box.dataset.row);
            else this.selected.delete(box.dataset.row);
            this.render();
        }));

        this.container.querySelectorAll('[data-group]').forEach((box) => box.addEventListener('change', () => {
            this.editKey = null;
            const machine = box.dataset.group;
            const rows = this.visibleRows().filter((r) => r.machine === machine && this.selectable(r));
            rows.forEach((r) => box.checked ? this.selected.add(r.key) : this.selected.delete(r.key));
            this.render();
        }));

        this.container.querySelectorAll('[data-group-rows]').forEach((box) => box.addEventListener('change', () => {
            this.editKey = null;
            const keys = JSON.parse(box.dataset.groupRows);
            keys.forEach((k) => box.checked ? this.selected.add(k) : this.selected.delete(k));
            this.render();
        }));

        this.container.querySelectorAll('[data-edit]').forEach((btn) => btn.addEventListener('click', () => {
            const key = btn.dataset.edit;
            const row = this.visibleRows().find((r) => r.key === key);
            this.editKey = key;
            this.selected.clear();
            this.system = (row?.system ?? []).join(', ');
            this.stage = (row?.stage ?? []).join(', ');
            this.render();
        }));

        this.container.querySelectorAll('[data-remove]').forEach((btn) => btn.addEventListener('click', () => {
            const [kind, machine, container, name] = JSON.parse(btn.dataset.remove);
            this.persist((config) => this.removeLeaf(config, kind, machine, container, name));
        }));

        this.container.querySelectorAll('[data-suggest]').forEach((btn) => btn.addEventListener('click', () => {
            const field = btn.dataset.suggest;
            const values = splitValues(this[field]);
            if (!values.some((v) => v.toLowerCase() === btn.dataset.value.toLowerCase())) values.push(btn.dataset.value);
            this[field] = values.join(', ');
            this.render();
        }));

        this.container.querySelectorAll('[data-field]').forEach((input) => input.addEventListener('input', () => {
            const map = { 'system': 'system', 'stage': 'stage', 'asserted-by': 'assertedBy' };
            this[map[input.dataset.field]] = input.value;
        }));

        this.container.querySelector('[data-act="apply"]')?.addEventListener('click', () => this.apply());
        this.container.querySelector('[data-act="cancel"]')?.addEventListener('click', () => {
            this.selected.clear();
            this.editKey = null;
            this.system = '';
            this.stage = '';
            this.render();
        });
    }

    async apply() {
        const systems = splitValues(this.system);
        const stages = splitValues(this.stage);
        const editing = this.editKey !== null;
        if (!editing && systems.length === 0 && stages.length === 0) {
            this.error = 'Nothing to apply — fill system, stage, or both.';
            this.render();
            return;
        }
        localStorage.setItem(ASSERTED_BY_KEY, this.assertedBy);
        const today = new Date().toISOString().slice(0, 10);
        const targets = editing ? [this.editKey] : [...this.selected];

        await this.persist((config) => {
            for (const key of targets) {
                const [kind, machine, container, name] = JSON.parse(key);
                const leaf = this.ensureLeaf(config, kind, machine, container, name);
                // Bulk fills only what was typed; an edit overwrites both axes so an
                // emptied field clears (triage-workbench.md §8.3). Unknown axes on the
                // leaf are untouched either way.
                if (editing || systems.length > 0) leaf.system = systems;
                if (editing || stages.length > 0) leaf.stage = stages;
                leaf.assertedBy = this.assertedBy.trim() || undefined;
                leaf.assertedAt = today;
            }
        });
        this.selected.clear();
        this.editKey = null;
        this.system = '';
        this.stage = '';
        this.render();
    }

    ensureLeaf(config, kind, machine, container, name) {
        const tree = kind === 'database' ? (config.databases ??= {}) : (config.applications ??= {});
        const machineKey = findKey(tree, machine);
        const containers = (tree[machineKey] ??= {});
        const containerKey = findKey(containers, container);
        const leaves = (containers[containerKey] ??= {});
        const leafKey = findKey(leaves, name);
        return (leaves[leafKey] ??= {});
    }

    removeLeaf(config, kind, machine, container, name) {
        const tree = kind === 'database' ? config.databases : config.applications;
        const containers = tree?.[findKey(tree, machine)];
        const leaves = containers?.[findKey(containers, container)];
        if (leaves) delete leaves[findKey(leaves, name)];
    }

    async persist(mutate) {
        this.error = null;
        try {
            // Freshest file wins as the base: the panel merges into what is on disk now,
            // not into what it fetched when it opened.
            const config = await fetchEntityTagsConfig();
            mutate(config);
            await saveEntityTags(config);
            await this.refresh();
            this.onChanged();
        } catch (err) {
            this.error = err.message;
            this.render();
        }
    }
}
