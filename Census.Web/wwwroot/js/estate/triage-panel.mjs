import { fetchTriage, fetchEntityTagsConfig, saveEntityTags, fetchDeclaredEntities, saveDeclaredEntities } from './estate-api.mjs';

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
    constructor(onChanged, openDetails, openExternalBlast) {
        this.onChanged = onChanged;
        this.openDetails = openDetails;
        this.openExternalBlast = openExternalBlast;
        this.query = '';
        this.showClassified = false;
        this.selected = new Set();
        this.editKey = null;            // classified row being edited - overwrite semantics
        this.system = '';
        this.stage = '';
        this.assertedBy = localStorage.getItem(ASSERTED_BY_KEY) ?? '';
        this.error = null;
        this.declaring = false;
        this.declare = { machine: '', name: '', kind: '', system: '', stage: '', note: '', endpoints: '' };
        this.attributing = null;        // the unresolved target whose attribute input is open
        this.attrName = '';
        this.attrError = null;
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
        // Declared entities are pile like anything else (declared-entities.md §6): untagged
        // ones sit in the unclassified stratum, tagged ones in classified. They never
        // resolve, so they are never dangling or unverified.
        for (const d of m.declared ?? []) {
            rows.push({
                key: rowKey('declared', m.machine, '', d.name),
                kind: 'declared', declaredKind: d.kind, machine: m.machine, container: '', name: d.name,
                system: d.system, stage: d.stage, assertedBy: d.assertedBy, assertedAt: d.assertedAt, note: d.note,
                stratum: (d.system?.length || d.stage?.length) ? 'classified' : 'unclassified',
            });
        }
        return rows;
    }

    // External declared entities are rows too — same strata, same bar, no machine.
    externalRows() {
        return (this.data.external ?? []).map((e) => ({
            key: rowKey('external', '', '', e.name),
            kind: 'external', declaredKind: e.kind, machine: '', container: '', name: e.name,
            system: e.system, stage: e.stage, assertedBy: e.assertedBy, assertedAt: e.assertedAt, note: e.note,
            endpoints: e.endpoints ?? [],
            stratum: (e.system?.length || e.stage?.length) ? 'classified' : 'unclassified',
        }));
    }

    matches(row) {
        if (!this.query) return true;
        const endpoints = (row.endpoints ?? []).map((p) => p.identifier).join(' ');
        return `${row.machine} ${row.container} ${row.name} ${row.declaredKind ?? ''} ${endpoints}`.toLowerCase().includes(this.query);
    }

    shown(row) {
        if (row.stratum === 'classified' || row.stratum === 'unverified') return this.showClassified;
        return true;
    }

    visibleRows() {
        return this.data.machines
            .flatMap((m) => this.machineRows(m))
            .concat(this.externalRows())
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
                    <button class="est-btn est-btn-sm" data-act="declare-toggle">${this.declaring ? 'Cancel declare' : 'Declare entity…'}</button>
                    <span class="est-muted">${this.data.unclassifiedTotal} unclassified fleet-wide</span>
                </div>
                ${this.renderDeclareForm()}
                <div data-ref="error">${this.error ? `<p class="est-status est-error">${escapeHtml(this.error)}</p>` : ''}</div>
                ${machines || '<p class="est-status">Nothing to triage — everything observed is classified. The pile is empty.</p>'}
                ${this.renderExternalCard()}
                ${this.renderUnresolvedCard()}
                ${this.renderBar()}
            </div>`;
        this.bind();
    }

    renderExternalCard() {
        const rows = this.externalRows().filter((r) => this.shown(r) && this.matches(r));
        if (rows.length === 0) return '';
        return `
            <div class="est-subcard">
                <div class="est-subcard-head">
                    <span class="est-mono">external</span>
                    <span class="est-muted">declared entities census can never see</span>
                </div>
                ${rows.map((r) => this.renderExternalRow(r)).join('')}
            </div>`;
    }

    renderExternalRow(row) {
        const entity = (this.data.external ?? []).find((e) => e.name === row.name);
        const chips = [
            ...(row.system ?? []).map((v) => `<span class="est-badge est-tag-system">${escapeHtml(v)}</span>`),
            ...(row.stage ?? []).map((v) => `<span class="est-badge">${escapeHtml(v)}</span>`),
        ].join('');
        const provenance = row.assertedBy || row.assertedAt
            ? `<span class="est-muted est-triage-prov">${escapeHtml([row.assertedBy, row.assertedAt].filter(Boolean).join(' · '))}</span>` : '';
        // Per-identifier attribution state: a zero-match identifier is a config smell shown
        // next to where the mistake was made, a shadow says the estate machine won.
        const endpoints = (entity?.endpoints ?? []).map((p) => {
            const state = p.shadowsMachine ? `<span class="est-catfail">shadows ${escapeHtml(p.shadowsMachine)} — the machine wins</span>`
                : p.matchedEdges === 0 ? '<span class="est-catwarn">matched by 0 edges</span>'
                : `<span class="est-muted">${p.matchedEdges} edge${p.matchedEdges === 1 ? '' : 's'}</span>`;
            return `<div class="est-triage-unknown"><span class="est-mono">${escapeHtml(p.identifier)}</span> · ${state}</div>`;
        }).join('');
        return `
            <div class="est-triage-row ${this.editKey === row.key ? 'is-editing' : ''}">
                <label class="est-check">
                    <input type="checkbox" data-row="${escapeHtml(row.key)}" ${this.selected.has(row.key) ? 'checked' : ''}>
                    <span class="est-triage-name"><span class="est-mono">${escapeHtml(row.name)}</span></span>
                </label>
                <span class="est-badge est-badge-declared" ${row.note ? `title="${escapeHtml(row.note)}"` : ''}>${escapeHtml(row.declaredKind ?? 'declared')}</span>
                ${row.stratum === 'unclassified' ? '<span class="est-tag-none">unclassified</span>' : chips}
                ${provenance}
                <button class="est-btn est-btn-sm" data-ext-blast="${escapeHtml(row.name)}">Blast radius</button>
                <button class="est-btn est-btn-sm" data-edit="${escapeHtml(row.key)}">Edit</button>
                <button class="est-btn est-btn-sm" data-remove="${escapeHtml(row.key)}">Remove</button>
            </div>
            ${endpoints}`;
    }

    // One row attributes at a time: the input appears where the click was, and a refusal
    // renders inline beside it — the person is working at the bottom of a long panel, and
    // a message anywhere else is a message they will not see.
    renderUnresolvedCard() {
        const groups = (this.data.unresolvedEndpoints ?? []).filter((u) => !this.query
            || `${u.target} ${u.edges.map((e) => `${e.machine} ${e.name ?? ''}`).join(' ')}`.toLowerCase().includes(this.query));
        if (groups.length === 0) return '';
        return `
            <div class="est-subcard">
                <div class="est-subcard-head">
                    <span class="est-mono">unresolved endpoints</span>
                    <span class="est-muted">observed edges pointing at no machine and no declared entity</span>
                </div>
                ${groups.map((u) => {
                    const sources = u.edges.map((e) => `${e.machine} · ${e.siteName ?? ''}${e.appPath ?? ''} · ${e.name ?? ''} (${e.sourceFile ?? ''})`).join('\n');
                    const active = this.attributing === u.target;
                    const gesture = active
                        ? `<input class="est-edit-input" data-ref="attr-name" list="est-external-names" value="${escapeHtml(this.attrName)}" placeholder="existing or new entity name…" style="max-width:16rem">
                           <button class="est-btn est-btn-sm est-btn-primary" data-act="attr-save">Save</button>
                           <button class="est-btn est-btn-sm" data-act="attr-cancel">Cancel</button>`
                        : `<button class="est-btn est-btn-sm" data-attr-open="${escapeHtml(u.target)}">Attribute…</button>`;
                    return `
                    <div class="est-triage-row">
                        <span class="est-triage-name" title="${escapeHtml(sources)}">
                            <span class="est-mono">${escapeHtml(u.target)}</span>
                            <span class="est-badge">${escapeHtml(u.kind)}</span>
                            <span class="est-muted">${u.edges.length} edge${u.edges.length === 1 ? '' : 's'}</span>
                        </span>
                        ${gesture}
                    </div>
                    ${active && this.attrError ? `<div class="est-triage-unknown"><span class="est-catfail">${escapeHtml(this.attrError)}</span></div>` : ''}`;
                }).join('')}
                <datalist id="est-external-names">
                    ${(this.data.external ?? []).map((e) => `<option value="${escapeHtml(e.name)}">`).join('')}
                </datalist>
            </div>`;
    }

    renderMachine(m, rows) {
        const unknownLines = m.unknown.map((u) => {
            const scope = u.kind === 'instance' ? `instance <span class="est-mono">${escapeHtml(u.container)}</span>` : u.kind.toUpperCase();
            const tail = u.unverifiableCount > 0 ? ` · ${u.unverifiableCount} assertion${u.unverifiableCount === 1 ? '' : 's'} unverifiable` : '';
            return `<div class="est-triage-unknown">${scope} — collection ${escapeHtml(u.status)}, contents unknown${tail}</div>`;
        }).join('');

        const groups = new Map();
        for (const row of rows) {
            const label = row.kind === 'declared' ? 'declared'
                : `${row.kind === 'database' ? 'instance' : 'site'} ${row.container}`;
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
        // Removing a declared row un-declares the entity outright — the record is the
        // assertion, so there is no smaller thing to remove. Edit-with-emptied-axes is the
        // clear-tags gesture; the record then rejoins the unclassified pile.
        const actions = row.stratum === 'classified' || row.kind === 'declared'
            ? `${row.stratum === 'classified' ? `<button class="est-btn est-btn-sm" data-edit="${escapeHtml(row.key)}">Edit</button>` : ''}
               <button class="est-btn est-btn-sm" data-remove="${escapeHtml(row.key)}">Remove</button>`
            : '';
        const declaredBadge = row.kind === 'declared'
            ? `<span class="est-badge est-badge-declared" ${row.note ? `title="${escapeHtml(row.note)}"` : ''}>${escapeHtml(row.declaredKind ?? 'declared')}</span>` : '';
        return `
            <div class="est-triage-row ${this.editKey === row.key ? 'is-editing' : ''}">
                <label class="est-check">
                    <input type="checkbox" data-row="${escapeHtml(row.key)}" ${this.selected.has(row.key) ? 'checked' : ''}>
                    <span class="est-triage-name"><span class="est-mono">${escapeHtml(row.name)}</span></span>
                </label>
                ${declaredBadge}
                ${row.stratum === 'unclassified' ? '<span class="est-tag-none">unclassified</span>' : chips}
                ${provenance}${actions}
            </div>`;
    }

    // Declaring is the human explaining a gap census cannot see into (declared-entities.md
    // §6) — a scheduled task on an observed machine, or an external entity carrying the
    // endpoint identifiers observed edges attribute to.
    renderDeclareForm() {
        if (!this.declaring) return '';
        const d = this.declare;
        return `
            <div class="est-triage-bar" data-ref="declare-form">
                <div class="est-muted">Declare an entity census does not observe. Existence is the assertion — it is never corroborated.</div>
                <div class="est-edit-row">
                    <span class="est-facet-key">anchor</span>
                    <select class="est-edit-input" data-dec="machine">
                        <option value="">choose…</option>
                        <option value="__external__" ${d.machine === '__external__' ? 'selected' : ''}>external — no machine</option>
                        ${this.data.machineNames.map((m) => `<option value="${escapeHtml(m)}" ${m === d.machine ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('')}
                    </select>
                    <span class="est-facet-key">name</span>
                    <input class="est-edit-input" data-dec="name" value="${escapeHtml(d.name)}" placeholder="e.g. Nightly ETL sweep">
                    <span class="est-facet-key">kind</span>
                    <input class="est-edit-input" data-dec="kind" value="${escapeHtml(d.kind)}" list="est-declare-kinds" placeholder="free-form" style="max-width:10rem">
                    <datalist id="est-declare-kinds">${this.data.kinds.map((k) => `<option value="${escapeHtml(k)}">`).join('')}</datalist>
                </div>
                ${d.machine === '__external__' ? `
                <div class="est-edit-row">
                    <span class="est-facet-key">endpoints</span>
                    <input class="est-edit-input" data-dec="endpoints" value="${escapeHtml(d.endpoints)}" placeholder="comma-separated — scheme://host[:port] for http, host[:port] for database (optional)">
                </div>` : ''}
                <div class="est-edit-row">
                    <span class="est-facet-key">system</span>
                    <input class="est-edit-input" data-dec="system" value="${escapeHtml(d.system)}" placeholder="comma-separated (optional)">
                    <span class="est-facet-key">stage</span>
                    <input class="est-edit-input" data-dec="stage" value="${escapeHtml(d.stage)}" placeholder="comma-separated (optional)">
                </div>
                <div class="est-edit-row">
                    <span class="est-facet-key">note</span>
                    <input class="est-edit-input" data-dec="note" value="${escapeHtml(d.note)}" placeholder="what it is, where it lives (optional)">
                    <span class="est-facet-key">by</span>
                    <input class="est-edit-input" data-dec="by" value="${escapeHtml(this.assertedBy)}" placeholder="who is asserting (optional)" style="max-width:10rem">
                    <button class="est-btn est-btn-primary" data-act="declare-save">Declare</button>
                </div>
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
            const declaredFile = kind === 'declared' || kind === 'external';
            this.persist({ tags: !declaredFile, declared: declaredFile },
                (config) => this.removeLeaf(config, kind, machine, container, name));
        }));

        this.container.querySelectorAll('[data-ext-blast]').forEach((btn) =>
            btn.addEventListener('click', () => this.openExternalBlast?.(btn.dataset.extBlast)));

        // The reconcile gesture (declared-entities.md §4): appending the observed target to
        // an entity's identifiers IS the attribution — the mechanical join does the rest.
        this.container.querySelectorAll('[data-attr-open]').forEach((btn) => btn.addEventListener('click', () => {
            this.attributing = btn.dataset.attrOpen;
            this.attrName = '';
            this.attrError = null;
            this.render();
        }));
        this.container.querySelector('[data-act="attr-cancel"]')?.addEventListener('click', () => {
            this.attributing = null;
            this.attrName = '';
            this.attrError = null;
            this.render();
        });
        const attrInput = this.container.querySelector('[data-ref="attr-name"]');
        if (attrInput) {
            attrInput.addEventListener('input', () => { this.attrName = attrInput.value; });
            attrInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); this.attribute(); }
            });
            attrInput.focus();
            attrInput.setSelectionRange(attrInput.value.length, attrInput.value.length);
        }
        this.container.querySelector('[data-act="attr-save"]')?.addEventListener('click', () => this.attribute());

        this.container.querySelector('[data-act="declare-toggle"]')?.addEventListener('click', () => {
            this.declaring = !this.declaring;
            this.render();
        });

        this.container.querySelectorAll('[data-dec]').forEach((input) => input.addEventListener('input', () => {
            if (input.dataset.dec === 'by') this.assertedBy = input.value;
            else this.declare[input.dataset.dec] = input.value;
            // The endpoints row only exists for the external anchor — swap it in as chosen.
            if (input.dataset.dec === 'machine') this.render();
        }));

        this.container.querySelector('[data-act="declare-save"]')?.addEventListener('click', () => this.saveDeclaration());

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

        // The shared error slot sits above the fold; anyone triggering it is usually deep
        // in the queue, so bring it to them rather than hoping they scroll up.
        if (this.error) this.container.querySelector('[data-ref="error"]')?.scrollIntoView({ block: 'nearest' });
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

        const kinds = targets.map((key) => JSON.parse(key)[0]);
        const inDeclaredFile = (k) => k === 'declared' || k === 'external';
        await this.persist({ tags: kinds.some((k) => !inDeclaredFile(k)), declared: kinds.some(inDeclaredFile) }, (config) => {
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
        // A declared entity's record is its own leaf — assert axes onto it in
        // declared-entities.json; kind, note and endpoints are untouched by a classify.
        if (kind === 'declared') {
            const tree = (config.declared.onMachines ??= {});
            const entities = (tree[findKey(tree, machine)] ??= {});
            return (entities[findKey(entities, name)] ??= {});
        }
        if (kind === 'external') {
            const entities = (config.declared.external ??= {});
            return (entities[findKey(entities, name)] ??= {});
        }
        const tree = kind === 'database' ? (config.tags.databases ??= {}) : (config.tags.applications ??= {});
        const machineKey = findKey(tree, machine);
        const containers = (tree[machineKey] ??= {});
        const containerKey = findKey(containers, container);
        const leaves = (containers[containerKey] ??= {});
        const leafKey = findKey(leaves, name);
        return (leaves[leafKey] ??= {});
    }

    removeLeaf(config, kind, machine, container, name) {
        if (kind === 'declared') {
            const entities = config.declared.onMachines?.[findKey(config.declared.onMachines, machine)];
            if (entities) delete entities[findKey(entities, name)];
            return;
        }
        if (kind === 'external') {
            if (config.declared.external) delete config.declared.external[findKey(config.declared.external, name)];
            return;
        }
        const tree = kind === 'database' ? config.tags.databases : config.tags.applications;
        const containers = tree?.[findKey(tree, machine)];
        const leaves = containers?.[findKey(containers, container)];
        if (leaves) delete leaves[findKey(leaves, name)];
    }

    async attribute() {
        const target = this.attributing;
        const entityName = this.attrName.trim();
        if (!entityName) {
            this.attrError = 'Name the external entity this endpoint belongs to — an existing one, or a new name to declare it.';
            this.render();
            return;
        }
        const today = new Date().toISOString().slice(0, 10);
        await this.persist({ tags: false, declared: true }, (config) => {
            const entities = (config.declared.external ??= {});
            const key = findKey(entities, entityName);
            const record = (entities[key] ??= { assertedBy: this.assertedBy.trim() || undefined, assertedAt: today });
            const endpoints = (record.endpoints ??= []);
            if (!endpoints.some((e) => e.toLowerCase() === target.toLowerCase())) endpoints.push(target);
        });
        // A refusal belongs beside the row being worked, not at the top of a long panel.
        if (this.error) {
            this.attrError = this.error;
            this.error = null;
        } else {
            this.attributing = null;
            this.attrName = '';
            this.attrError = null;
        }
        this.render();
    }

    async saveDeclaration() {
        const d = this.declare;
        if (!d.machine || !d.name.trim()) {
            this.error = 'A declaration needs an anchor and a name.';
            this.render();
            return;
        }
        localStorage.setItem(ASSERTED_BY_KEY, this.assertedBy);
        const today = new Date().toISOString().slice(0, 10);
        const record = () => ({
            kind: d.kind.trim() || undefined,
            system: splitValues(d.system),
            stage: splitValues(d.stage),
            note: d.note.trim() || undefined,
            assertedBy: this.assertedBy.trim() || undefined,
            assertedAt: today,
        });
        await this.persist({ tags: false, declared: true }, (config) => {
            if (d.machine === '__external__') {
                const entities = (config.declared.external ??= {});
                const nameKey = findKey(entities, d.name.trim());
                if (entities[nameKey]) throw new Error(`"${nameKey}" is already declared — edit it in the queue instead.`);
                entities[nameKey] = { ...record(), endpoints: splitValues(d.endpoints) };
                return;
            }
            const tree = (config.declared.onMachines ??= {});
            const entities = (tree[findKey(tree, d.machine)] ??= {});
            const nameKey = findKey(entities, d.name.trim());
            if (entities[nameKey]) throw new Error(`${d.machine} already declares "${nameKey}" — edit it in the queue instead.`);
            entities[nameKey] = record();
        });
        if (!this.error) {
            this.declaring = false;
            this.declare = { machine: '', name: '', kind: '', system: '', stage: '', note: '', endpoints: '' };
            this.render();
        }
    }

    async persist(touched, mutate) {
        this.error = null;
        try {
            // Freshest files win as the base: the panel merges into what is on disk now,
            // not into what it fetched when it opened. Only the file(s) a gesture touches
            // are fetched and rewritten — no needless widening of the last-writer window.
            const config = {
                tags: touched.tags ? await fetchEntityTagsConfig() : null,
                declared: touched.declared ? await fetchDeclaredEntities() : null,
            };
            mutate(config);
            if (touched.tags) await saveEntityTags(config.tags);
            if (touched.declared) await saveDeclaredEntities(config.declared);
            await this.refresh();
            this.onChanged();
        } catch (err) {
            this.error = err.message;
            this.render();
        }
    }
}
