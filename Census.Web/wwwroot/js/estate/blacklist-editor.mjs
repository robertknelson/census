import { fetchBlacklist, saveBlacklist } from './estate-api.mjs';
import { severityDotClass } from './findings-queue.mjs';

// The blacklist's estate home. Every action persists the whole config immediately —
// config/blacklist.json stays the artifact, hand-editable alongside this panel, and the
// evaluator re-reads it per request so saves land on the next render.

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);
}

const TARGETS = ['apps', 'dotnet.coreRuntimes', 'dotnet.sdks'];
const FIELDS_BY_TARGET = {
    'apps': ['displayName', 'publisher'],
    'dotnet.coreRuntimes': ['name'],
    'dotnet.sdks': ['name'],
};
const MATCH_TYPES = ['exact', 'contains', 'regex'];
const OPS = ['<', '<=', '==', '>=', '>'];
const SEVERITIES = ['critical', 'high', 'medium', 'low'];

export class BlacklistEditor {
    constructor(onChanged) {
        this.onChanged = onChanged;
        this.editingId = null;          // rule id being edited, '__new' for the add form
        this.confirmingDeleteId = null;
    }

    async mount(container) {
        this.container = container;
        container.innerHTML = '<p class="est-status">Loading rules…</p>';
        try {
            this.config = await fetchBlacklist();
        } catch (err) {
            container.innerHTML = `<p class="est-status est-error">${escapeHtml(err.message)}</p>`;
            return;
        }
        this.render();
    }

    async persist(mutate) {
        const draft = structuredClone(this.config);
        mutate(draft);
        await saveBlacklist(draft);
        this.config = draft;
        this.onChanged();
    }

    render() {
        const cards = this.config.rules.map((r) => {
            if (this.editingId === r.id) return this.renderForm(r);

            const version = r.version ? `${r.version.op} ${r.version.value}` : 'any version';
            const actions = this.confirmingDeleteId === r.id
                ? `<button class="est-btn est-btn-sm est-btn-danger" data-act="delete-confirm" data-id="${escapeHtml(r.id)}">Confirm delete</button>
                   <button class="est-btn est-btn-sm" data-act="delete-cancel">Cancel</button>`
                : `<button class="est-btn est-btn-sm" data-act="edit" data-id="${escapeHtml(r.id)}">Edit</button>
                   <button class="est-btn est-btn-sm" data-act="delete" data-id="${escapeHtml(r.id)}">Delete</button>`;

            return `
                <div class="est-subcard ${r.active ? '' : 'est-rule-inactive'}">
                    <div class="est-subcard-head">
                        <span class="est-rule-id">
                            <span class="est-dot ${severityDotClass(r.severity)}" title="${escapeHtml(r.severity)}"></span>
                            <span class="est-mono">${escapeHtml(r.id)}</span>
                            ${r.active ? '' : '<span class="est-muted">(inactive)</span>'}
                        </span>
                        <span class="est-rule-actions">
                            <label class="est-check"><input type="checkbox" data-act="toggle" data-id="${escapeHtml(r.id)}" ${r.active ? 'checked' : ''}> active</label>
                            ${actions}
                        </span>
                    </div>
                    <div class="est-rule-line">
                        <span class="est-badge">${escapeHtml(r.target)}</span>
                        ${escapeHtml(r.match.field)} ${escapeHtml(r.match.matchType)} <span class="est-mono">"${escapeHtml(r.match.value)}"</span>
                        · <span class="est-mono">${escapeHtml(version)}</span>
                    </div>
                    <div class="est-rule-reason">${escapeHtml(r.reason)}</div>
                </div>`;
        }).join('');

        this.container.innerHTML = `
            <div data-ref="error"></div>
            ${cards || '<p class="est-status">No rules yet — the fleet has nothing banned.</p>'}
            ${this.editingId === '__new' ? this.renderForm(null) : ''}
            ${this.editingId === null ? '<p><button class="est-btn est-btn-primary" data-act="add">Add rule</button></p>' : ''}`;

        this.bind();
    }

    renderForm(rule) {
        const target = rule?.target ?? 'apps';
        const options = (list, selected) => list.map((v) => `<option value="${escapeHtml(v)}" ${v === selected ? 'selected' : ''}>${escapeHtml(v)}</option>`).join('');
        return `
            <div class="est-editor" data-ref="form">
                <div class="est-edit-row">
                    <span class="est-facet-key">id</span>
                    <input class="est-edit-input" data-field="id" value="${escapeHtml(rule?.id ?? '')}" placeholder="BL-2026-00x">
                    <span class="est-facet-key">severity</span>
                    <select class="est-edit-input" data-field="severity">${options(SEVERITIES, rule?.severity ?? 'high')}</select>
                    <label class="est-check"><input type="checkbox" data-field="active" ${(rule?.active ?? true) ? 'checked' : ''}> active</label>
                </div>
                <div class="est-edit-row">
                    <span class="est-facet-key">match</span>
                    <select class="est-edit-input" data-field="target">${options(TARGETS, target)}</select>
                    <select class="est-edit-input" data-field="match-field">${options(FIELDS_BY_TARGET[target], rule?.match.field ?? FIELDS_BY_TARGET[target][0])}</select>
                    <select class="est-edit-input" data-field="match-type">${options(MATCH_TYPES, rule?.match.matchType ?? 'exact')}</select>
                    <input class="est-edit-input" data-field="match-value" value="${escapeHtml(rule?.match.value ?? '')}" placeholder="value">
                </div>
                <div class="est-edit-row">
                    <span class="est-facet-key">version</span>
                    <select class="est-edit-input" data-field="version-op"><option value="">any version</option>${options(OPS, rule?.version?.op)}</select>
                    <input class="est-edit-input" data-field="version-value" value="${escapeHtml(rule?.version?.value ?? '')}" placeholder="1.2.3" style="max-width:6rem">
                </div>
                <div class="est-edit-row">
                    <span class="est-facet-key">reason</span>
                    <input class="est-edit-input" data-field="reason" value="${escapeHtml(rule?.reason ?? '')}" placeholder="why, and which policy" style="max-width:none;flex:1">
                </div>
                <div class="est-edit-actions">
                    <button class="est-btn est-btn-primary" data-act="save" data-original-id="${escapeHtml(rule?.id ?? '')}" data-is-new="${rule === null}">Save rule</button>
                    <button class="est-btn" data-act="cancel">Cancel</button>
                </div>
            </div>`;
    }

    bind() {
        const el = this.container;
        this.errorEl = el.querySelector('[data-ref="error"]');

        const on = (act, event, handler) => el.querySelectorAll(`[data-act="${act}"]`)
            .forEach((node) => node.addEventListener(event, handler));

        on('add', 'click', () => { this.editingId = '__new'; this.confirmingDeleteId = null; this.render(); });
        on('edit', 'click', (e) => { this.editingId = e.target.dataset.id; this.confirmingDeleteId = null; this.render(); });
        on('cancel', 'click', () => { this.editingId = null; this.render(); });
        on('delete', 'click', (e) => { this.confirmingDeleteId = e.target.dataset.id; this.render(); });
        on('delete-cancel', 'click', () => { this.confirmingDeleteId = null; this.render(); });

        on('delete-confirm', 'click', (e) => this.tryPersist((draft) => {
            draft.rules = draft.rules.filter((r) => r.id !== e.target.dataset.id);
        }));

        on('toggle', 'change', (e) => this.tryPersist((draft) => {
            draft.rules.find((r) => r.id === e.target.dataset.id).active = e.target.checked;
        }));

        on('save', 'click', (e) => {
            const form = el.querySelector('[data-ref="form"]');
            const get = (name) => form.querySelector(`[data-field="${name}"]`).value.trim();
            const versionOp = get('version-op');
            const edited = {
                id: get('id'),
                target: get('target'),
                match: { field: get('match-field'), matchType: get('match-type'), value: get('match-value') },
                version: versionOp === '' ? null : { op: versionOp, value: get('version-value') },
                severity: get('severity'),
                reason: get('reason'),
                active: form.querySelector('[data-field="active"]').checked,
            };
            const isNew = e.target.dataset.isNew === 'true';
            const originalId = e.target.dataset.originalId;
            this.tryPersist((draft) => {
                if (isNew) draft.rules.push(edited);
                else draft.rules[draft.rules.findIndex((r) => r.id === originalId)] = edited;
            });
        });

        // Keep the match-field options in step with the chosen target mid-edit.
        el.querySelectorAll('[data-field="target"]').forEach((sel) => sel.addEventListener('change', (e) => {
            const fieldSel = e.target.closest('[data-ref="form"]').querySelector('[data-field="match-field"]');
            fieldSel.innerHTML = FIELDS_BY_TARGET[e.target.value].map((f) => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join('');
        }));
    }

    async tryPersist(mutate) {
        try {
            await this.persist(mutate);
            this.editingId = null;
            this.confirmingDeleteId = null;
            this.render();
        } catch (err) {
            this.errorEl.innerHTML = `<p class="est-status est-error">${escapeHtml(err.message)}</p>`;
        }
    }
}
