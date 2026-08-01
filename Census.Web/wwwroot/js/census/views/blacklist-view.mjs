import { fetchBlacklist, saveBlacklist } from '../api.mjs';
import { escapeHtml } from '../html-utils.mjs';

const TARGETS = ['apps', 'dotnet.coreRuntimes', 'dotnet.sdks'];
const FIELDS_BY_TARGET = {
    'apps': ['displayName', 'publisher'],
    'dotnet.coreRuntimes': ['name'],
    'dotnet.sdks': ['name'],
};
const MATCH_TYPES = ['exact', 'contains', 'regex'];
const OPS = ['<', '<=', '==', '>=', '>'];
const SEVERITIES = ['critical', 'high', 'medium', 'low'];

export class BlacklistView {
    constructor(container) {
        this.container = container;
        this.editingId = null;   // rule id being edited, '__new' for the add form, null = no form
        this.confirmingDeleteId = null;
    }

    async render() {
        this.container.innerHTML = '<p class="census-status">Loading…</p>';
        try {
            this.config = await fetchBlacklist();
            this.renderContent();
        } catch (err) {
            this.container.innerHTML = `<p class="census-status census-status-error">${escapeHtml(err.message)}</p>`;
        }
    }

    async persist(mutate) {
        const draft = structuredClone(this.config);
        mutate(draft);
        await saveBlacklist(draft);
        this.config = draft;
    }

    renderContent() {
        const rows = this.config.rules.map((r) => {
            if (this.editingId === r.id) return this.renderForm(r);
            const version = r.version ? `${r.version.op} ${r.version.value}` : 'any version';
            const deleteCell = this.confirmingDeleteId === r.id
                ? `<button class="census-btn census-btn-danger" data-action="delete-confirm" data-id="${escapeHtml(r.id)}">Confirm delete</button>
                   <button class="census-btn" data-action="delete-cancel">Cancel</button>`
                : `<button class="census-btn" data-action="edit" data-id="${escapeHtml(r.id)}">Edit</button>
                   <button class="census-btn" data-action="delete" data-id="${escapeHtml(r.id)}">Delete</button>`;
            return `
                <tr class="${r.active ? '' : 'census-row-volatile'}">
                    <td>${escapeHtml(r.id)}</td>
                    <td>${escapeHtml(r.target)}</td>
                    <td>${escapeHtml(r.match.field)} ${escapeHtml(r.match.matchType)} "${escapeHtml(r.match.value)}"</td>
                    <td>${escapeHtml(version)}</td>
                    <td class="census-cell-${escapeHtml(r.severity)}">${escapeHtml(r.severity)}</td>
                    <td>${escapeHtml(r.reason)}</td>
                    <td><input type="checkbox" data-action="toggle-active" data-id="${escapeHtml(r.id)}" ${r.active ? 'checked' : ''} title="Active"></td>
                    <td class="census-actions">${deleteCell}</td>
                </tr>`;
        }).join('');

        this.container.innerHTML = `
            <h2>Blacklist rules</h2>
            <p class="census-muted">Edits write straight back to <code>config/blacklist.json</code> — the file stays hand-editable alongside this page. Inactive rules are kept but not evaluated.</p>
            <div data-ref="error"></div>
            <table class="census-table">
                <thead><tr><th>Id</th><th>Target</th><th>Match</th><th>Version</th><th>Severity</th><th>Reason</th><th>Active</th><th></th></tr></thead>
                <tbody>
                    ${rows}
                    ${this.editingId === '__new' ? this.renderForm(null) : ''}
                </tbody>
            </table>
            ${this.editingId === null ? '<p><button class="census-btn census-btn-primary" data-action="add">Add rule</button></p>' : ''}`;

        this.bindEvents();
    }

    renderForm(rule) {
        const isNew = rule === null;
        const target = rule?.target ?? 'apps';
        const options = (list, selected) => list.map((v) => `<option value="${escapeHtml(v)}" ${v === selected ? 'selected' : ''}>${escapeHtml(v)}</option>`).join('');
        return `
            <tr class="census-edit-row">
                <td><input data-field="id" value="${escapeHtml(rule?.id ?? '')}" placeholder="BL-2026-00x" style="width:8rem"></td>
                <td><select data-field="target">${options(TARGETS, target)}</select></td>
                <td>
                    <select data-field="match-field">${options(FIELDS_BY_TARGET[target], rule?.match.field ?? FIELDS_BY_TARGET[target][0])}</select>
                    <select data-field="match-type">${options(MATCH_TYPES, rule?.match.matchType ?? 'exact')}</select>
                    <input data-field="match-value" value="${escapeHtml(rule?.match.value ?? '')}" placeholder="value" style="width:12rem">
                </td>
                <td>
                    <select data-field="version-op"><option value="">any version</option>${options(OPS, rule?.version?.op)}</select>
                    <input data-field="version-value" value="${escapeHtml(rule?.version?.value ?? '')}" placeholder="1.2.3" style="width:6rem">
                </td>
                <td><select data-field="severity">${options(SEVERITIES, rule?.severity ?? 'high')}</select></td>
                <td><input data-field="reason" value="${escapeHtml(rule?.reason ?? '')}" placeholder="why, and which policy" style="width:16rem"></td>
                <td><input type="checkbox" data-field="active" ${(rule?.active ?? true) ? 'checked' : ''}></td>
                <td class="census-actions">
                    <button class="census-btn census-btn-primary" data-action="save" data-original-id="${escapeHtml(rule?.id ?? '')}" data-is-new="${isNew}">Save</button>
                    <button class="census-btn" data-action="cancel">Cancel</button>
                </td>
            </tr>`;
    }

    bindEvents() {
        this.errorEl = this.container.querySelector('[data-ref="error"]');

        const on = (action, handler) => this.container.querySelectorAll(`[data-action="${action}"]`)
            .forEach((el) => el.addEventListener(action === 'toggle-active' ? 'change' : 'click', handler));

        on('add', () => { this.editingId = '__new'; this.confirmingDeleteId = null; this.renderContent(); });
        on('edit', (e) => { this.editingId = e.target.dataset.id; this.confirmingDeleteId = null; this.renderContent(); });
        on('cancel', () => { this.editingId = null; this.renderContent(); });
        on('delete', (e) => { this.confirmingDeleteId = e.target.dataset.id; this.renderContent(); });
        on('delete-cancel', () => { this.confirmingDeleteId = null; this.renderContent(); });

        on('delete-confirm', async (e) => {
            const id = e.target.dataset.id;
            await this.tryPersist((draft) => { draft.rules = draft.rules.filter((r) => r.id !== id); });
        });

        on('toggle-active', async (e) => {
            const id = e.target.dataset.id;
            const active = e.target.checked;
            await this.tryPersist((draft) => { draft.rules.find((r) => r.id === id).active = active; });
        });

        on('save', async (e) => {
            const row = e.target.closest('tr');
            const get = (name) => row.querySelector(`[data-field="${name}"]`).value.trim();
            const versionOp = get('version-op');
            const edited = {
                id: get('id'),
                target: get('target'),
                match: { field: get('match-field'), matchType: get('match-type'), value: get('match-value') },
                version: versionOp === '' ? null : { op: versionOp, value: get('version-value') },
                severity: get('severity'),
                reason: get('reason'),
                active: row.querySelector('[data-field="active"]').checked,
            };

            const isNew = e.target.dataset.isNew === 'true';
            const originalId = e.target.dataset.originalId;
            await this.tryPersist((draft) => {
                if (isNew) draft.rules.push(edited);
                else draft.rules[draft.rules.findIndex((r) => r.id === originalId)] = edited;
            });
        });

        // Repopulate the match-field dropdown when the target changes mid-edit.
        this.container.querySelectorAll('[data-field="target"]').forEach((sel) => sel.addEventListener('change', (e) => {
            const fieldSel = e.target.closest('tr').querySelector('[data-field="match-field"]');
            fieldSel.innerHTML = FIELDS_BY_TARGET[e.target.value].map((f) => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join('');
        }));
    }

    async tryPersist(mutate) {
        try {
            await this.persist(mutate);
            this.editingId = null;
            this.confirmingDeleteId = null;
            this.renderContent();
        } catch (err) {
            this.errorEl.innerHTML = `<p class="census-status census-status-error">${escapeHtml(err.message)}</p>`;
        }
    }
}
