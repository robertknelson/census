import { fetchMachineBaseline, blessBaseline, approveOnMachine } from './estate-api.mjs';
import { SelectorEditor } from './baselines-editor.mjs';

// The dossier's baseline section (approved-baseline.md §9): which baselines judge this
// machine, what it carries that none of them approve, and the two gestures that change
// that — bless this machine's whole set, or approve one item on this machine alone.

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);
}

export class MachineBaseline {
    /**
     * @param machine  canvas machine dto — supplies the scope suggestions and defaults
     * @param fleet    all canvas machines, for scope key/value suggestions
     * @param onChanged called after a bless or an approval lands
     */
    constructor(machine, fleet, onChanged) {
        this.machine = machine;
        this.fleet = fleet ?? [];
        this.onChanged = onChanged;
        this.mode = null;              // null | 'bless' | an entry key being approved
    }

    async mount(container) {
        this.container = container;
        container.innerHTML = '<p class="est-status">Judging against the baselines…</p>';
        try {
            this.result = await fetchMachineBaseline(this.machine.machine);
        } catch (err) {
            container.innerHTML = `<p class="est-status est-error">${escapeHtml(err.message)}</p>`;
            return;
        }
        this.render();
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
        return { keys: [...keys], values: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, [...v]])) };
    }

    render() {
        const r = this.result;
        const matched = r.matchedBaselines.length === 0
            ? ''
            : `<div class="est-rule-line">Judged by ${r.matchedBaselines.map((id) => `<span class="est-badge est-mono">${escapeHtml(id)}</span>`).join('')}</div>`;

        let body;
        if (r.status === 'not-in-scope') {
            body = `<p class="est-status">Outside every baseline's scope — <strong>not judged</strong>.
                    <span class="est-muted">No deviations here means nothing has been blessed that covers this machine.</span></p>`;
        } else if (r.status === 'not-judgeable') {
            body = `${matched}<p class="est-catfail">Cannot be judged<span class="est-muted"> — ${escapeHtml(r.reason)}</span></p>
                    <p class="est-muted">Unknown is never rendered as approved.</p>`;
        } else if (r.deviations.length === 0) {
            body = `${matched}<p class="est-status">Everything installed is approved by a matching baseline.</p>`;
        } else {
            body = `${matched}
                <table class="est-table">
                    <thead><tr><th>Unapproved</th><th>Version</th><th>Publisher</th><th>Scope</th><th></th></tr></thead>
                    <tbody>${r.deviations.map((d, i) => `
                        <tr>
                            <td>${escapeHtml(d.displayName)}</td>
                            <td class="est-mono">${escapeHtml(d.displayVersion) || '—'}</td>
                            <td class="est-muted">${escapeHtml(d.publisher) || '—'}</td>
                            <td class="est-muted">${escapeHtml(d.installScope)}</td>
                            <td><button class="est-btn est-btn-sm" data-act="approve" data-index="${i}">Approve here</button></td>
                        </tr>
                        ${this.mode === `approve:${i}` ? `
                        <tr><td colspan="5">
                            <div class="est-editor">
                                <div class="est-edit-row">
                                    <span class="est-facet-key">note</span>
                                    <input class="est-edit-input" data-ref="approve-note" placeholder="why this machine is allowed it" style="max-width:none;flex:1">
                                </div>
                                <div class="est-edit-actions">
                                    <button class="est-btn est-btn-primary" data-act="approve-save" data-index="${i}">Approve on ${escapeHtml(this.machine.machine)} only</button>
                                    <button class="est-btn" data-act="cancel">Cancel</button>
                                    <span class="est-muted">Appends to a one-machine baseline — an exemption is a baseline scoped to one machine.</span>
                                </div>
                            </div>
                        </td></tr>` : ''}`).join('')}</tbody>
                </table>`;
        }

        const blessForm = this.mode === 'bless' ? this.blessFormHtml() : '';
        const blessButton = this.mode === 'bless'
            ? ''
            : `<button class="est-btn est-btn-sm" data-act="bless">Bless as baseline…</button>`;

        this.container.innerHTML = `
            <div data-ref="error"></div>
            ${body}
            <p>${blessButton}</p>
            ${blessForm}`;

        this.bind();
    }

    blessFormHtml() {
        const stages = this.machine.stages ?? [];
        const suggested = { class: [this.machine.class] };
        if (stages.length > 0) suggested.stage = [...stages];
        this.selector ??= new SelectorEditor(suggested, this.suggestions());

        const defaultId = `${String(this.machine.class).toLowerCase()}-${(stages[0] ?? 'all').toLowerCase()}`;
        return `
            <div class="est-editor" data-ref="bless-form">
                <div class="est-edit-row">
                    <span class="est-facet-key">id</span>
                    <input class="est-edit-input" data-field="id" value="${escapeHtml(defaultId)}" placeholder="web-prod">
                    <span class="est-facet-key">label</span>
                    <input class="est-edit-input" data-field="label" value="" placeholder="Web servers, production" style="max-width:none;flex:1">
                </div>
                <div class="est-edit-row"><span class="est-facet-key">applies to</span></div>
                ${this.selector.html()}
                <div class="est-edit-row">
                    <span class="est-facet-key">note</span>
                    <input class="est-edit-input" data-field="note" placeholder="what this set is, and who agreed it" style="max-width:none;flex:1">
                </div>
                <div class="est-edit-actions">
                    <button class="est-btn est-btn-primary" data-act="bless-save">Bless ${escapeHtml(this.machine.machine)}'s software set</button>
                    <button class="est-btn" data-act="cancel">Cancel</button>
                    <span class="est-muted">Copied by value as collected — system components excluded, versions not pinned.</span>
                </div>
            </div>`;
    }

    bind() {
        const el = this.container;
        this.errorEl = el.querySelector('[data-ref="error"]');

        const on = (act, handler) => el.querySelectorAll(`[data-act="${act}"]`)
            .forEach((node) => node.addEventListener('click', handler));

        on('bless', () => { this.mode = 'bless'; this.selector = null; this.render(); });
        on('cancel', () => { this.mode = null; this.selector = null; this.render(); });
        on('approve', (e) => { this.mode = `approve:${e.target.dataset.index}`; this.render(); });

        on('approve-save', async (e) => {
            const deviation = this.result.deviations[Number(e.target.dataset.index)];
            const note = el.querySelector('[data-ref="approve-note"]').value.trim();
            await this.run(() => approveOnMachine({
                machine: this.machine.machine,
                note,
                entry: {
                    displayName: deviation.displayName,
                    publisher: deviation.publisher,
                    architecture: deviation.architecture,
                    installScope: deviation.installScope,
                    observedVersion: deviation.displayVersion,
                },
            }));
        });

        on('bless-save', async () => {
            const form = el.querySelector('[data-ref="bless-form"]');
            const get = (name) => form.querySelector(`[data-field="${name}"]`).value.trim();
            const appliesTo = this.selector.harvest(form);
            await this.run(() => blessBaseline({
                id: get('id'),
                label: get('label'),
                sourceMachine: this.machine.machine,
                appliesTo,
                note: get('note'),
            }));
        });

        const form = el.querySelector('[data-ref="bless-form"]');
        if (form) this.selector.bind(form, () => this.render());
    }

    async run(action) {
        this.errorEl.innerHTML = '';
        try {
            await action();
        } catch (err) {
            this.errorEl.innerHTML = `<p class="est-status est-error">${escapeHtml(err.message)}</p>`;
            return;
        }
        this.mode = null;
        this.selector = null;
        this.result = await fetchMachineBaseline(this.machine.machine);
        this.render();
        this.onChanged();
    }
}
