import { saveAssignment } from './estate-api.mjs';

// Inline editor for a machine's asserted layer: present-as class + facets. Saves write
// straight back to config/assets.json; the caller refreshes the canvas so rollups,
// badges, and the unassigned finding all move in the same gesture.

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);
}

const CLASS_OPTIONS = ['DatabaseServer', 'WebServer', 'DevLaptop'];

export class AssignmentEditor {
    /**
     * @param machine   canvas machine dto (facets, class, classSource, observedRoles)
     * @param fleet     all canvas machines — mined for key/value suggestions
     * @param onSaved   called after a successful save
     * @param onCancel  called when editing is abandoned
     */
    constructor(machine, fleet, onSaved, onCancel) {
        this.machine = machine;
        this.onSaved = onSaved;
        this.onCancel = onCancel;

        this.draft = {
            class: machine.classSource === 'asserted' ? machine.class : '',
            facets: Object.fromEntries(Object.entries(machine.facets).map(([k, v]) => [k, [...v]])),
        };

        this.keySuggestions = new Set(['stage']);
        this.valueSuggestions = {};
        for (const m of fleet) {
            for (const [key, values] of Object.entries(m.facets)) {
                this.keySuggestions.add(key);
                (this.valueSuggestions[key] ??= new Set());
                values.forEach((v) => this.valueSuggestions[key].add(v));
            }
        }
    }

    mount(container) {
        this.container = container;
        this.render();
    }

    render() {
        const derived = this.machine.observedRoles.length > 0
            ? this.machine.observedRoles[0]
            : 'Unclassified';

        const facetRows = Object.entries(this.draft.facets).map(([key, values]) => `
            <div class="est-edit-row" data-key="${escapeHtml(key)}">
                <span class="est-facet-key">${escapeHtml(key)}</span>
                <span class="est-edit-chips">
                    ${values.map((v) => `
                        <span class="est-badge est-badge-removable">${escapeHtml(v)}
                            <button class="est-chip-x" data-remove-value="${escapeHtml(v)}" aria-label="Remove ${escapeHtml(v)}">×</button>
                        </span>`).join('')}
                    <input class="est-edit-input" data-add-value list="est-values-${escapeHtml(key)}" placeholder="add…">
                    <datalist id="est-values-${escapeHtml(key)}">
                        ${[...(this.valueSuggestions[key] ?? [])].map((v) => `<option value="${escapeHtml(v)}">`).join('')}
                    </datalist>
                </span>
            </div>`).join('');

        this.container.innerHTML = `
            <div class="est-editor">
                <div class="est-edit-row">
                    <span class="est-facet-key">class</span>
                    <select class="est-edit-input" data-ref="class">
                        <option value="">derived from observed (${escapeHtml(derived)})</option>
                        ${CLASS_OPTIONS.map((c) => `<option value="${escapeHtml(c)}" ${this.draft.class === c ? 'selected' : ''}>present as ${escapeHtml(c)}</option>`).join('')}
                    </select>
                </div>
                ${facetRows}
                <div class="est-edit-row">
                    <input class="est-edit-input" data-ref="new-key" list="est-keys" placeholder="new key…" style="max-width:9rem">
                    <datalist id="est-keys">
                        ${[...this.keySuggestions].filter((k) => !(k in this.draft.facets)).map((k) => `<option value="${escapeHtml(k)}">`).join('')}
                    </datalist>
                    <button class="est-btn" data-ref="add-key">Add key</button>
                </div>
                <div class="est-edit-actions">
                    <button class="est-btn est-btn-primary" data-ref="save">Save assignment</button>
                    <button class="est-btn" data-ref="cancel">Cancel</button>
                    <span class="est-edit-error" data-ref="error"></span>
                </div>
            </div>`;

        this.bind();
    }

    bind() {
        const el = this.container;

        el.querySelector('[data-ref="class"]').addEventListener('change', (e) => {
            this.draft.class = e.target.value;
        });

        el.querySelectorAll('[data-remove-value]').forEach((btn) => btn.addEventListener('click', () => {
            const key = btn.closest('[data-key]').dataset.key;
            this.draft.facets[key] = this.draft.facets[key].filter((v) => v !== btn.dataset.removeValue);
            if (this.draft.facets[key].length === 0) delete this.draft.facets[key];
            this.render();
        }));

        el.querySelectorAll('[data-add-value]').forEach((input) => input.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const value = input.value.trim();
            if (!value) return;
            const key = input.closest('[data-key]').dataset.key;
            if (!this.draft.facets[key].some((v) => v.toLowerCase() === value.toLowerCase())) {
                this.draft.facets[key].push(value);
            }
            this.render();
            this.container.querySelector(`[data-key="${CSS.escape(key)}"] [data-add-value]`)?.focus();
        }));

        const addKey = () => {
            const input = el.querySelector('[data-ref="new-key"]');
            const key = input.value.trim();
            if (!key || key in this.draft.facets) return;
            this.draft.facets[key] = [];
            this.render();
            this.container.querySelector(`[data-key="${CSS.escape(key)}"] [data-add-value]`)?.focus();
        };
        el.querySelector('[data-ref="add-key"]').addEventListener('click', addKey);
        el.querySelector('[data-ref="new-key"]').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); addKey(); }
        });

        el.querySelector('[data-ref="cancel"]').addEventListener('click', () => this.onCancel());

        el.querySelector('[data-ref="save"]').addEventListener('click', async () => {
            // Fold any half-typed value in before saving — losing what's visible in an
            // input because Enter wasn't pressed is how editors eat data.
            el.querySelectorAll('[data-add-value]').forEach((input) => {
                const value = input.value.trim();
                if (!value) return;
                const key = input.closest('[data-key]').dataset.key;
                if (!this.draft.facets[key].some((v) => v.toLowerCase() === value.toLowerCase())) {
                    this.draft.facets[key].push(value);
                }
            });

            const errorEl = el.querySelector('[data-ref="error"]');
            errorEl.textContent = '';
            try {
                await saveAssignment(this.machine.machine, {
                    class: this.draft.class || null,
                    facets: this.draft.facets,
                });
            } catch (err) {
                errorEl.textContent = err.message;
                return;
            }
            this.onSaved();
        });
    }
}
