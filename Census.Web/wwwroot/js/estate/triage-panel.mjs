import { fetchTriage, fetchEntityTagsConfig, saveEntityTags, fetchDeclaredEntities, saveDeclaredEntities } from './estate-api.mjs';
import { PanelScope } from './panel-scope.mjs';

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

// The read-both rule, client side (entity-associations.md §3): rows and leaves from a
// backend or file still speaking the flat shape are interpreted as the cross-product
// they always meant. Writers emit associations only.
function servesOf(x) {
    if (x.serves) return x.serves;
    const systems = x.system ?? [];
    const stages = x.stage ?? [];
    if (!systems.length && !stages.length) return [];
    if (!systems.length) return [{ system: '', stages: [...stages], assertedBy: x.assertedBy, assertedAt: x.assertedAt }];
    return systems.map((s) => ({ system: s, stages: [...stages], assertedBy: x.assertedBy, assertedAt: x.assertedAt }));
}

function unionStages(a, b) {
    const seen = new Set(a.map((v) => v.toLowerCase()));
    return [...a, ...b.filter((v) => !seen.has(v.toLowerCase()))];
}

// Upgrade-on-write (entity-associations.md §7.3): the first UI touch converts the whole
// leaf to associations and drops the flat axes, so a leaf speaks one shape after it.
// Leaf-level provenance stays as history; new provenance lands on the associations.
function upgradeLeaf(leaf) {
    if (!leaf.serves) leaf.serves = servesOf(leaf);
    delete leaf.system;
    delete leaf.stage;
    return leaf.serves;
}

export class TriagePanel {
    constructor(onChanged, openDetails, openExternalBlast, getScope) {
        this.onChanged = onChanged;
        this.scope = new PanelScope(getScope);
        this.openDetails = openDetails;
        this.openExternalBlast = openExternalBlast;
        this.query = '';
        this.showClassified = false;
        this.selected = new Set();
        this.editAssoc = null;          // {key, system} - one association being overwritten
        this.system = '';
        this.stage = '';
        this.canonical = '';
        this.layer = '';
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

    // The board's scope moved (census-web.md §12.1): re-render, and drop selected rows that
    // left the screen so an apply only ever touches what the user can see.
    refresh() {
        if (!this.data) return;
        const known = new Set(this.visibleRows().map((r) => r.key));
        [...this.selected].filter((k) => !known.has(k)).forEach((k) => this.selected.delete(k));
        this.render();
    }

    async reload() {
        this.data = await fetchTriage();
        this.refresh();
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
                serves: servesOf(r), assertedBy: r.assertedBy, assertedAt: r.assertedAt,
                stratum,
            });
        }
        // Declared entities are pile like anything else (declared-entities.md §6): untagged
        // ones sit in the unclassified stratum, tagged ones in classified. They never
        // resolve, so they are never dangling or unverified.
        for (const d of m.declared ?? []) {
            const serves = servesOf(d);
            rows.push({
                key: rowKey('declared', m.machine, '', d.name),
                kind: 'declared', declaredKind: d.kind, machine: m.machine, container: '', name: d.name,
                serves, assertedBy: d.assertedBy, assertedAt: d.assertedAt, note: d.note,
                stratum: serves.length ? 'classified' : 'unclassified',
            });
        }
        return rows;
    }

    // External declared entities are rows too — same strata, same bar, no machine.
    externalRows() {
        return (this.data.external ?? []).map((e) => {
            const serves = servesOf(e);
            return {
                key: rowKey('external', '', '', e.name),
                kind: 'external', declaredKind: e.kind, machine: '', container: '', name: e.name,
                serves, assertedBy: e.assertedBy, assertedAt: e.assertedAt, note: e.note,
                endpoints: e.endpoints ?? [],
                stratum: serves.length ? 'classified' : 'unclassified',
            };
        });
    }

    matches(row) {
        if (!this.query) return true;
        const endpoints = (row.endpoints ?? []).map((p) => p.identifier).join(' ');
        const assocs = (row.serves ?? []).map((a) => `${a.system} ${(a.stages ?? []).join(' ')}`).join(' ');
        return `${row.machine} ${row.container} ${row.name} ${row.declaredKind ?? ''} ${endpoints} ${assocs}`.toLowerCase().includes(this.query);
    }

    shown(row) {
        if (row.stratum === 'classified' || row.stratum === 'unverified') return this.showClassified;
        return true;
    }

    visibleRows() {
        return this.data.machines
            .flatMap((m) => this.machineRows(m))
            .concat(this.externalRows())
            .filter((r) => this.scope.has(r.machine) && this.shown(r) && this.matches(r));
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
            .filter((m) => byMachine.has(m.machine) || (m.unknown.length > 0 && this.scope.has(m.machine) && unknownMatches(m)))
            .map((m) => this.renderMachine(m, byMachine.get(m.machine) ?? []))
            .join('');

        const scoped = this.scope.active();
        const inScope = scoped ? this.data.machines.filter((m) => scoped.machines.has(m.machine))
            .reduce((n, m) => n + m.unclassifiedCount, 0) : null;
        this.container.innerHTML = `
            ${this.scope.lineHtml()}
            <div class="est-triage">
                <div class="est-triage-controls">
                    <input class="est-filter" type="search" placeholder="Filter machines, instances, sites, names…" value="${escapeHtml(this.query)}" data-ref="filter">
                    <label class="est-check"><input type="checkbox" data-ref="show-classified" ${this.showClassified ? 'checked' : ''}> show classified</label>
                    <button class="est-btn est-btn-sm" data-act="declare-toggle">${this.declaring ? 'Cancel declare' : 'Declare entity…'}</button>
                    <span class="est-muted">${this.data.unclassifiedTotal} unclassified fleet-wide${inScope === null ? '' : ` · <strong>${inScope}</strong> in scope`}</span>
                </div>
                ${this.renderDeclareForm()}
                <div data-ref="error">${this.error ? `<p class="est-status est-error">${escapeHtml(this.error)}</p>` : ''}</div>
                ${machines || (scoped
                    ? '<p class="est-status">Nothing to triage on the machines in scope.</p>'
                    : '<p class="est-status">Nothing to triage — everything observed is classified. The pile is empty.</p>')}
                ${this.renderExternalCard()}
                ${this.renderUnresolvedCard()}
                ${this.renderBar()}
            </div>`;
        this.bind();
    }

    renderExternalCard() {
        const rows = this.externalRows().filter((r) => this.shown(r) && this.matches(r));
        if (rows.length === 0) return '';
        // External entities sit on no machine, so they are not on the board: out of a scoped
        // view, but counted, never silently absent.
        if (this.scope.active()) {
            return `<p class="est-status">${rows.length} external entit${rows.length === 1 ? 'y' : 'ies'} — on no machine, so outside this scope. <em>show fleet</em> lists them.</p>`;
        }
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
        const provenance = row.assertedBy || row.assertedAt
            ? `<span class="est-muted est-triage-prov">${escapeHtml([row.assertedBy, row.assertedAt].filter(Boolean).join(' · '))}</span>` : '';
        // Per-identifier attribution state: a zero-match identifier is a config smell shown
        // next to where the mistake was made, a shadow says the estate machine won.
        const endpoints = (entity?.endpoints ?? []).map((p) => {
            const state = p.shadowsMachine ? `<span class="est-catfail">shadows ${escapeHtml(p.shadowsMachine)} — the estate wins</span>`
                : p.matchedEdges === 0 ? '<span class="est-catwarn">matched by 0 edges</span>'
                : `<span class="est-muted">${p.matchedEdges} edge${p.matchedEdges === 1 ? '' : 's'}</span>`;
            return `<div class="est-triage-unknown"><span class="est-mono">${escapeHtml(p.identifier)}</span> · ${state}</div>`;
        }).join('');
        return `
            <div class="est-triage-row ${this.editAssoc?.key === row.key ? 'is-editing' : ''}">
                <label class="est-check">
                    <input type="checkbox" data-row="${escapeHtml(row.key)}" ${this.selected.has(row.key) ? 'checked' : ''}>
                    <span class="est-triage-name"><span class="est-mono">${escapeHtml(row.name)}</span></span>
                </label>
                <span class="est-badge est-badge-declared" ${row.note ? `title="${escapeHtml(row.note)}"` : ''}>${escapeHtml(row.declaredKind ?? 'declared')}</span>
                ${row.stratum === 'unclassified' ? '<span class="est-tag-none">unclassified</span>' : this.assocChips(row, true)}
                ${provenance}
                <button class="est-btn est-btn-sm" data-ext-blast="${escapeHtml(row.name)}">Blast radius</button>
                <button class="est-btn est-btn-sm" data-remove="${escapeHtml(row.key)}">Remove</button>
            </div>
            ${endpoints}`;
    }

    // One row attributes at a time: the input appears where the click was, and a refusal
    // renders inline beside it — the person is working at the bottom of a long panel, and
    // a message anywhere else is a message they will not see.
    renderUnresolvedCard() {
        // Cut on the edge's source machine, as Hosting cuts a dependency (§12.1).
        const groups = (this.data.unresolvedEndpoints ?? [])
            .map((u) => ({ ...u, edges: u.edges.filter((e) => this.scope.has(e.machine)) }))
            .filter((u) => u.edges.length > 0)
            .filter((u) => !this.query
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

    // One chip per association: the stages travel with the system claim they belong to
    // (entity-associations.md). Click a chip to overwrite that association's stages; its ×
    // retires just that claim, leaving the entity's other systems untouched.
    assocChips(row, interactive) {
        return (row.serves ?? []).map((a) => {
            const label = `${escapeHtml(a.system || '—')}${(a.stages ?? []).length ? ` · ${a.stages.map(escapeHtml).join(', ')}` : ' · unstaged'}${a.canonicalName ? ` · as ${escapeHtml(a.canonicalName)}` : ''}`;
            const prov = `asserted by ${a.assertedBy || 'unknown'}${a.assertedAt ? `, ${a.assertedAt}` : ''}`;
            if (!interactive) return `<span class="est-badge est-tag-system" title="${escapeHtml(prov)}">${label}</span>`;
            const payload = escapeHtml(JSON.stringify([row.key, a.system ?? '']));
            const editing = this.editAssoc && this.editAssoc.key === row.key
                && this.editAssoc.system.toLowerCase() === (a.system ?? '').toLowerCase();
            return `
                <span class="est-badge est-tag-system est-badge-removable ${editing ? 'is-editing' : ''}">
                    <button class="est-assoc-btn" data-assoc-edit="${payload}" title="${escapeHtml(prov)} — click to edit stages">${label}</button>
                    <button class="est-chip-x" data-assoc-x="${payload}" aria-label="Remove this system claim">×</button>
                </span>`;
        }).join('');
    }

    renderRow(row) {
        const provenance = row.assertedBy || row.assertedAt
            ? `<span class="est-muted est-triage-prov">${escapeHtml([row.assertedBy, row.assertedAt].filter(Boolean).join(' · '))}</span>` : '';

        if (row.stratum === 'dangling') {
            return `
                <div class="est-triage-row est-triage-dangling">
                    <span class="est-triage-name"><span class="est-mono">${escapeHtml(row.name)}</span> <span class="est-catfail">no longer observed</span></span>
                    ${this.assocChips(row, false)}${provenance}
                    <button class="est-btn est-btn-sm est-btn-danger" data-remove="${escapeHtml(row.key)}">Remove</button>
                </div>`;
        }
        if (row.stratum === 'unverified') {
            return `
                <div class="est-triage-row est-muted">
                    <span class="est-triage-name"><span class="est-mono">${escapeHtml(row.name)}</span> <span class="est-catwarn">unverified</span></span>
                    ${this.assocChips(row, false)}${provenance}
                </div>`;
        }
        // Removing a declared row un-declares the entity outright — the record is the
        // assertion, so there is no smaller thing to remove. Chip-level × retires one
        // system claim; losing the last claim returns the entity to the pile.
        const actions = row.kind === 'declared'
            ? `<button class="est-btn est-btn-sm" data-remove="${escapeHtml(row.key)}">Remove</button>`
            : '';
        const declaredBadge = row.kind === 'declared'
            ? `<span class="est-badge est-badge-declared" ${row.note ? `title="${escapeHtml(row.note)}"` : ''}>${escapeHtml(row.declaredKind ?? 'declared')}</span>` : '';
        return `
            <div class="est-triage-row ${this.editAssoc?.key === row.key ? 'is-editing' : ''}">
                <label class="est-check">
                    <input type="checkbox" data-row="${escapeHtml(row.key)}" ${this.selected.has(row.key) ? 'checked' : ''}>
                    <span class="est-triage-name"><span class="est-mono">${escapeHtml(row.name)}</span></span>
                </label>
                ${declaredBadge}
                ${row.stratum === 'unclassified' ? '<span class="est-tag-none">unclassified</span>' : this.assocChips(row, true)}
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

    // The bar asserts ONE association per apply (entity-associations.md §5): a system and
    // the stages that belong to it. Bulk merges it into every selected entity; editing a
    // chip overwrites that association's stages, with the system fixed.
    renderBar() {
        const editing = this.editAssoc !== null;
        if (!editing && this.selected.size === 0) return '';
        const chipRow = (values, field) => values.map((v) =>
            `<button class="est-btn est-btn-sm" data-suggest="${escapeHtml(field)}" data-value="${escapeHtml(v)}">${escapeHtml(v)}</button>`).join('');
        const target = editing ? 'Save' : `Apply to ${this.selected.size}`;
        return `
            <div class="est-triage-bar">
                ${editing
                    ? '<div class="est-muted">Editing one system claim — the stage list overwrites; emptied means unstaged.</div>'
                    : '<div class="est-muted">One system, with the stages it serves there — other system claims on the selected entities stay untouched.</div>'}
                <div class="est-edit-row">
                    <span class="est-facet-key">system</span>
                    <input class="est-edit-input" data-field="system" value="${escapeHtml(this.system)}" placeholder="one system" ${editing ? 'disabled' : ''}>
                    ${editing ? '' : this.systemChips()}
                </div>
                <div class="est-edit-row">
                    <span class="est-facet-key">stages</span>
                    <input class="est-edit-input" data-field="stage" value="${escapeHtml(this.stage)}" placeholder="comma-separated">
                    ${chipRow(this.data.stages, 'stage')}
                </div>
                <div class="est-edit-row">
                    <span class="est-facet-key">as</span>
                    <input class="est-edit-input" data-field="canonical" value="${escapeHtml(this.canonical)}" list="est-canonical-names" placeholder="canonical name within this system (optional)">
                    ${this.canonicalDatalist()}
                </div>
                <div class="est-edit-row">
                    <span class="est-facet-key">layer</span>
                    <input class="est-edit-input" data-field="layer" value="${escapeHtml(this.layer)}" placeholder="web, spa or api — the role in the system's picture (optional; databases need none)" style="max-width:24rem">
                    ${this.layerChips()}
                </div>
                <div class="est-edit-row">
                    <span class="est-facet-key">by</span>
                    <input class="est-edit-input" data-field="asserted-by" value="${escapeHtml(this.assertedBy)}" placeholder="who is asserting (optional)">
                    <button class="est-btn est-btn-primary" data-act="apply">${escapeHtml(target)}</button>
                    <button class="est-btn" data-act="cancel">Cancel</button>
                </div>
            </div>`;
    }

    // Canonical names already in use within the typed system (canonical-names.md §7.5) —
    // vocabulary, never a registry: the suggestions come from the associations themselves.
    canonicalDatalist() {
        const system = (this.editAssoc ? this.editAssoc.system : this.system).trim().toLowerCase();
        if (!system) return '<datalist id="est-canonical-names"></datalist>';
        const names = new Set();
        for (const row of this.data.machines.flatMap((m) => this.machineRows(m)).concat(this.externalRows())) {
            for (const a of row.serves ?? []) {
                if (a.canonicalName && (a.system ?? '').toLowerCase() === system) names.add(a.canonicalName);
            }
        }
        return `<datalist id="est-canonical-names">${[...names].sort().map((n) => `<option value="${escapeHtml(n)}">`).join('')}</datalist>`;
    }

    // Layer vocabulary (layered-view.md §3): web, spa, api first, then whatever else is in
    // use — suggested, never restricted. A chip selects (one layer per claim).
    layerChips() {
        const inUse = new Set();
        for (const row of this.data.machines.flatMap((m) => this.machineRows(m)).concat(this.externalRows())) {
            for (const a of row.serves ?? []) if (a.layer) inUse.add(a.layer);
        }
        const values = ['web', 'spa', 'api', ...[...inUse].filter((v) => !['web', 'spa', 'api'].includes(v.toLowerCase())).sort()];
        return values.map((v) => `<button class="est-btn est-btn-sm" data-suggest="layer" data-value="${escapeHtml(v)}">${escapeHtml(v)}</button>`).join('');
    }

    // Registered systems lead the picker with their descriptions (systems-registry.md §5.1);
    // in-use-but-unregistered names follow. Free text stays open — never a restriction.
    systemChips() {
        const registered = this.data.registeredSystems ?? [];
        const registeredNames = new Set(registered.map((r) => r.name.toLowerCase()));
        const unregistered = (this.data.systems ?? []).filter((s) => !registeredNames.has(s.toLowerCase()));
        return [
            ...registered.map((r) => `<button class="est-btn est-btn-sm" data-suggest="system" data-value="${escapeHtml(r.name)}" ${r.description ? `title="${escapeHtml(r.description)}"` : ''}>${escapeHtml(r.name)}</button>`),
            ...unregistered.map((s) => `<button class="est-btn est-btn-sm" data-suggest="system" data-value="${escapeHtml(s)}" title="in use, not registered">${escapeHtml(s)}</button>`),
        ].join('');
    }

    bind() {
        this.scope.bind(this.container, () => this.refresh());
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
            this.editAssoc = null;
            if (box.checked) this.selected.add(box.dataset.row);
            else this.selected.delete(box.dataset.row);
            this.render();
        }));

        this.container.querySelectorAll('[data-group]').forEach((box) => box.addEventListener('change', () => {
            this.editAssoc = null;
            const machine = box.dataset.group;
            const rows = this.visibleRows().filter((r) => r.machine === machine && this.selectable(r));
            rows.forEach((r) => box.checked ? this.selected.add(r.key) : this.selected.delete(r.key));
            this.render();
        }));

        this.container.querySelectorAll('[data-group-rows]').forEach((box) => box.addEventListener('change', () => {
            this.editAssoc = null;
            const keys = JSON.parse(box.dataset.groupRows);
            keys.forEach((k) => box.checked ? this.selected.add(k) : this.selected.delete(k));
            this.render();
        }));

        this.container.querySelectorAll('[data-assoc-edit]').forEach((btn) => btn.addEventListener('click', () => {
            const [key, system] = JSON.parse(btn.dataset.assocEdit);
            const row = this.visibleRows().find((r) => r.key === key);
            const assoc = row?.serves.find((a) => (a.system ?? '').toLowerCase() === system.toLowerCase());
            this.editAssoc = { key, system };
            this.selected.clear();
            this.system = system;
            this.stage = (assoc?.stages ?? []).join(', ');
            this.canonical = assoc?.canonicalName ?? '';
            this.layer = assoc?.layer ?? '';
            this.render();
        }));

        this.container.querySelectorAll('[data-assoc-x]').forEach((btn) => btn.addEventListener('click', () => {
            const [key, system] = JSON.parse(btn.dataset.assocX);
            const [kind, machine, container, name] = JSON.parse(key);
            const declaredFile = kind === 'declared' || kind === 'external';
            this.persist({ tags: !declaredFile, declared: declaredFile },
                (config) => this.removeAssociation(config, kind, machine, container, name, system));
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
            // The bar asserts one system per apply; a system chip selects, stage chips accumulate.
            if (field === 'system' || field === 'layer') {
                this[field] = btn.dataset.value;
            } else {
                const values = splitValues(this[field]);
                if (!values.some((v) => v.toLowerCase() === btn.dataset.value.toLowerCase())) values.push(btn.dataset.value);
                this[field] = values.join(', ');
            }
            this.render();
        }));

        this.container.querySelectorAll('[data-field]').forEach((input) => input.addEventListener('input', () => {
            const map = { 'system': 'system', 'stage': 'stage', 'canonical': 'canonical', 'layer': 'layer', 'asserted-by': 'assertedBy' };
            this[map[input.dataset.field]] = input.value;
        }));

        this.container.querySelector('[data-act="apply"]')?.addEventListener('click', () => this.apply());

        // The shared error slot sits above the fold; anyone triggering it is usually deep
        // in the queue, so bring it to them rather than hoping they scroll up.
        if (this.error) this.container.querySelector('[data-ref="error"]')?.scrollIntoView({ block: 'nearest' });
        this.container.querySelector('[data-act="cancel"]')?.addEventListener('click', () => {
            this.selected.clear();
            this.editAssoc = null;
            this.system = '';
            this.stage = '';
            this.canonical = '';
            this.layer = '';
            this.render();
        });
    }

    async apply() {
        const system = this.system.trim();
        const stages = splitValues(this.stage);
        const canonical = this.canonical.trim();
        const layer = this.layer.trim();
        const editing = this.editAssoc !== null;

        if (!editing && !system && stages.length === 0) {
            this.error = 'Nothing to apply — name a system, or stages for entities that already have exactly one system claim.';
            this.render();
            return;
        }
        const targets = editing ? [this.editAssoc.key] : [...this.selected];

        // Stage-only apply is only unambiguous when every selected entity has exactly one
        // association to merge into (entity-associations.md §7.2) — otherwise, whose stages?
        if (!editing && !system) {
            const rows = this.visibleRows();
            const conflicted = targets.map((key) => rows.find((r) => r.key === key))
                .filter((r) => (r?.serves?.length ?? 0) !== 1);
            if (conflicted.length > 0) {
                this.error = 'Stage-only apply needs a system: some selected entities have zero or several system claims, so census cannot know which claim these stages belong to.';
                this.render();
                return;
            }
        }

        localStorage.setItem(ASSERTED_BY_KEY, this.assertedBy);
        const today = new Date().toISOString().slice(0, 10);
        const by = this.assertedBy.trim() || undefined;
        const rowByKey = new Map(this.visibleRows().map((r) => [r.key, r]));

        const kinds = targets.map((key) => JSON.parse(key)[0]);
        const inDeclaredFile = (k) => k === 'declared' || k === 'external';
        await this.persist({ tags: kinds.some((k) => !inDeclaredFile(k)), declared: kinds.some(inDeclaredFile) }, (config) => {
            for (const key of targets) {
                const [kind, machine, container, name] = JSON.parse(key);
                const leaf = this.ensureLeaf(config, kind, machine, container, name);
                const serves = upgradeLeaf(leaf);
                const targetSystem = editing ? this.editAssoc.system
                    : system || (rowByKey.get(key)?.serves[0]?.system ?? '');
                const i = serves.findIndex((a) => (a.system ?? '').toLowerCase() === targetSystem.toLowerCase());
                if (i < 0) {
                    serves.push({ system: targetSystem, stages, ...(canonical ? { canonicalName: canonical } : {}), ...(layer ? { layer } : {}), assertedBy: by, assertedAt: today });
                } else {
                    // Editing overwrites the claim's stages (emptied = unstaged); bulk
                    // merges — never removing a stage somebody else asserted.
                    serves[i].stages = editing ? stages : unionStages(serves[i].stages ?? [], stages);
                    // Canonical name (canonical-names.md §7.4): edit overwrites, emptied =
                    // ungrouped; bulk sets it only where absent — never silently renaming
                    // something somebody else named.
                    if (editing) {
                        if (canonical) serves[i].canonicalName = canonical;
                        else delete serves[i].canonicalName;
                    } else if (canonical && !serves[i].canonicalName) {
                        serves[i].canonicalName = canonical;
                    }
                    // Layer (layered-view.md §3): the same rule as the canonical name.
                    if (editing) {
                        if (layer) serves[i].layer = layer;
                        else delete serves[i].layer;
                    } else if (layer && !serves[i].layer) {
                        serves[i].layer = layer;
                    }
                    serves[i].assertedBy = by;
                    serves[i].assertedAt = today;
                }
                // An entity is one thing in every system's picture (layered-view.md §1.4): the
                // layer copies to this entity's other claims where they say nothing, never
                // where they already speak.
                if (layer) for (const a of serves) if (!a.layer) a.layer = layer;
            }
        });
        this.selected.clear();
        this.editAssoc = null;
        this.system = '';
        this.stage = '';
        this.canonical = '';
        this.layer = '';
        this.render();
    }

    removeAssociation(config, kind, machine, container, name, system) {
        const leaf = this.ensureLeaf(config, kind, machine, container, name);
        const serves = upgradeLeaf(leaf).filter((a) => (a.system ?? '').toLowerCase() !== system.toLowerCase());
        leaf.serves = serves;
        // An observed leaf with no claims left asserts nothing — remove it. A declared
        // record survives untagged: existence is its own assertion (declared-entities.md §10.6).
        if (serves.length === 0 && kind !== 'declared' && kind !== 'external') {
            this.removeLeaf(config, kind, machine, container, name);
        }
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
        // Several systems in the form become one association each, all with the typed
        // stages — the precise per-system split is a chip-edit away in the queue.
        const by = this.assertedBy.trim() || undefined;
        const record = () => {
            const systems = splitValues(d.system);
            const stages = splitValues(d.stage);
            // Stages with no system still assert something — one system-less claim.
            const serves = (systems.length ? systems : (stages.length ? [''] : []))
                .map((s) => ({ system: s, stages, assertedBy: by, assertedAt: today }));
            return {
                kind: d.kind.trim() || undefined,
                serves,
                note: d.note.trim() || undefined,
                assertedBy: by,
                assertedAt: today,
            };
        };
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
            await this.reload();
            this.onChanged();
        } catch (err) {
            this.error = err.message;
            this.render();
        }
    }
}
