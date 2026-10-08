import { fetchSystemsOverview, fetchSystemsConfig, saveSystems } from './atlas-api.mjs';

// The registry's home (systems-registry.md §4): name cards joined against what the
// associations actually claim — member counts, stages in use, expected-stage drift, the
// zero-member smell, and unregistered in-use names one click from a card. Membership is
// never edited here; that is Triage's pen.

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);
}

function splitValues(text) {
    return String(text ?? '').split(',').map((v) => v.trim()).filter(Boolean);
}

export class RegistryPanel {
    constructor(onChanged) {
        this.onChanged = onChanged;
        this.editingName = null;
        this.error = null;
    }

    async mount(container) {
        this.container = container;
        container.innerHTML = '<p class="atl-status">Reading the registry…</p>';
        try {
            this.rows = await fetchSystemsOverview();
        } catch (err) {
            container.innerHTML = `<p class="atl-status atl-error">${escapeHtml(err.message)}</p>`;
            return;
        }
        this.render();
    }

    async reload() {
        this.rows = await fetchSystemsOverview();
        this.editingName = null;
        this.render();
        this.onChanged?.();
    }

    render() {
        const registered = this.rows.filter((r) => r.registered);
        const unregistered = this.rows.filter((r) => !r.registered);

        this.container.innerHTML = `
            <div data-ref="error">${this.error ? `<p class="atl-status atl-error">${escapeHtml(this.error)}</p>` : ''}</div>
            ${registered.map((r) => this.renderCard(r)).join('') || '<p class="atl-status">Nothing registered yet.</p>'}
            ${unregistered.length > 0 ? `
                <h3 class="atl-subhead">In use, not registered</h3>
                <p class="atl-status">Free-form names associations already use — legal as they are; a card gives them a description and expected stages.</p>
                ${unregistered.map((r) => `
                    <div class="atl-row">
                        <span class="atl-mono">${escapeHtml(r.name)}</span>
                        <span class="atl-muted">${r.memberCount} member${r.memberCount === 1 ? '' : 's'} · stages: ${r.stagesInUse.map(escapeHtml).join(', ') || '—'}</span>
                        <button class="atl-btn" data-register="${escapeHtml(r.name)}">Register…</button>
                    </div>`).join('')}` : ''}`;
        this.bind();
    }

    renderCard(r) {
        if (this.editingName === r.name) return this.renderForm(r);
        const drift = [
            ...r.missingExpectedStages.map((s) => `<span class="atl-drift-bad">expected ${escapeHtml(s)} — nothing serves it</span>`),
            ...r.unexpectedStages.map((s) => `<span class="atl-drift-warn">${escapeHtml(s)} in use, not expected</span>`),
            // stage-crossings.md §3.5: crossings touching a member, and the honest remainder.
            ...(r.crossings ? [`<span class="atl-drift-bad">${r.crossings} stage crossing${r.crossings === 1 ? '' : 's'}</span>`] : []),
            ...(r.unjudgedEdges ? [`<span class="atl-muted">${r.unjudgedEdges} edge${r.unjudgedEdges === 1 ? '' : 's'} unjudged — an end unstaged</span>`] : []),
        ].join(' · ');
        return `
            <div class="atl-card">
                <div class="atl-card-head">
                    <span class="atl-mono">${escapeHtml(r.name)}</span>
                    <span>
                        ${r.memberCount === 0 ? '<span class="atl-drift-warn">no entity serves this</span>' : `<span class="atl-muted">${r.memberCount} member${r.memberCount === 1 ? '' : 's'}</span>`}
                        <button class="atl-btn" data-edit="${escapeHtml(r.name)}">Edit</button>
                    </span>
                </div>
                ${r.description ? `<div class="atl-muted">${escapeHtml(r.description)}</div>` : ''}
                <div class="atl-row">
                    <span class="atl-muted">stages in use: ${r.stagesInUse.map(escapeHtml).join(', ') || '—'}</span>
                    ${r.expectedStages ? `<span class="atl-muted">expected: ${r.expectedStages.map(escapeHtml).join(', ')}</span>` : '<span class="atl-muted">no completeness claim</span>'}
                </div>
                ${drift ? `<div class="atl-row">${drift}</div>` : ''}
                ${r.note ? `<div class="atl-muted">${escapeHtml(r.note)}</div>` : ''}
            </div>`;
    }

    renderForm(r) {
        return `
            <div class="atl-card" data-ref="form">
                <div class="atl-card-head"><span class="atl-mono">${escapeHtml(r.name)}</span></div>
                <div class="atl-row"><span class="atl-key">description</span>
                    <input class="atl-input" data-field="description" value="${escapeHtml(r.description ?? '')}"></div>
                <div class="atl-row"><span class="atl-key">expected stages</span>
                    <input class="atl-input" data-field="expected" value="${escapeHtml((r.expectedStages ?? []).join(', '))}" placeholder="comma-separated; empty = no claim"></div>
                <div class="atl-row"><span class="atl-key">note</span>
                    <input class="atl-input" data-field="note" value="${escapeHtml(r.note ?? '')}"></div>
                <div class="atl-row">
                    <button class="atl-btn atl-btn-primary" data-save="${escapeHtml(r.name)}">Save</button>
                    <button class="atl-btn" data-cancel>Cancel</button>
                    <button class="atl-btn atl-btn-danger" data-unregister="${escapeHtml(r.name)}">Unregister</button>
                </div>
            </div>`;
    }

    bind() {
        const on = (sel, ev, fn) => this.container.querySelectorAll(sel).forEach((el) => el.addEventListener(ev, fn));

        on('[data-edit]', 'click', (e) => { this.editingName = e.target.dataset.edit; this.render(); });
        on('[data-cancel]', 'click', () => { this.editingName = null; this.render(); });

        on('[data-register]', 'click', (e) => {
            const name = e.target.dataset.register;
            this.persist((config) => {
                config.systems[name] = { assertedAt: new Date().toISOString().slice(0, 10) };
            }).then(() => {
                // Straight into the new card's editor — registering is only worth doing
                // to say something about the system.
                this.editingName = name;
                this.render();
            });
        });

        on('[data-save]', 'click', (e) => {
            const form = this.container.querySelector('[data-ref="form"]');
            const read = (f) => form.querySelector(`[data-field="${f}"]`).value.trim();
            const expected = splitValues(read('expected'));
            this.persist((config) => {
                const name = Object.keys(config.systems).find((k) => k.toLowerCase() === e.target.dataset.save.toLowerCase()) ?? e.target.dataset.save;
                config.systems[name] = {
                    ...(config.systems[name] ?? {}),
                    description: read('description') || undefined,
                    expectedStages: expected.length ? expected : undefined,
                    note: read('note') || undefined,
                    assertedAt: new Date().toISOString().slice(0, 10),
                };
            });
        });

        on('[data-unregister]', 'click', (e) => this.persist((config) => {
            const name = Object.keys(config.systems).find((k) => k.toLowerCase() === e.target.dataset.unregister.toLowerCase());
            if (name) delete config.systems[name];
        }));
    }

    async persist(mutate) {
        this.error = null;
        try {
            const config = await fetchSystemsConfig();
            config.systems ??= {};
            mutate(config);
            await saveSystems(config);
            await this.reload();
        } catch (err) {
            this.error = err.message;
            this.render();
        }
    }
}
