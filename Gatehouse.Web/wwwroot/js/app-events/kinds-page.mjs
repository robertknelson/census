import { escapeHtml, isoDate } from '../membership/utils/format.mjs';

// The catalog of kinds of work (gatehouse.md §12.3, AE-R3). A kind is a Namespace (the business area) and a NOUN-VERB
// CommandName, both kebab-case. The kinds the events name but nobody registered come first, each with Register: a
// kind is observed, then declared, never guessed from its name. Registered kinds are corrected or retired, never
// deleted, because events keep naming them. Every change is in the history.

const DISPOSITIONS = ['current', 'retired'];

export function describeKindAudit(entry) {
    const parse = (json) => { try { return json ? JSON.parse(json) : null; } catch { return null; } };
    const before = parse(entry.previousValue);
    const after = parse(entry.newValue) ?? before ?? {};
    const name = `${after.Namespace} / ${after.CommandName}`;
    if (entry.action === 'created') return `Registered ${name}`;
    if (entry.action === 'retired') return `Retired ${name}`;
    if (entry.action === 'restored') return `Brought back ${name}`;
    const changed = Object.keys(after).filter((k) => JSON.stringify(after[k]) !== JSON.stringify(before?.[k]))
        .map((k) => `${k} ${JSON.stringify(before?.[k] ?? '')} → ${JSON.stringify(after[k])}`);
    return `Corrected ${name}${changed.length ? `: ${changed.join('; ')}` : ' (no field changed)'}`;
}

class KindsPage {
    init(config = {}) {
        this.root = typeof config.root === 'string' ? document.querySelector(config.root) : config.root;
        this.editing = null;
        this.flash = '';
        this.load();
    }

    async load() {
        this.root.innerHTML = '<p class="ps-none">Reading the catalog…</p>';
        try {
            const [catalog, recent] = await Promise.all([this.get('/api/app-event-kinds'), this.get('/api/app-event-kinds/audit')]);
            this.catalog = catalog;
            this.recent = recent;
        } catch (e) {
            this.root.innerHTML = `<p class="ps-error">${escapeHtml(e.message)}</p>`;
            return;
        }
        await this.render();
    }

    async get(url) {
        const response = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`The catalog did not answer (${response.status}).`);
        return response.json();
    }

    async post(url, body) {
        const response = await fetch(url, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error((payload.errors ?? [`The change was refused (${response.status}).`]).join(' '));
        return payload;
    }

    async render() {
        const { kinds, unregistered } = this.catalog;
        const history = this.editing?.appEventKindId ? await this.get(`/api/app-event-kinds/${this.editing.appEventKindId}/audit`) : this.recent;
        this.root.innerHTML = `
            <div class="mb-page">
                <header class="mb-head"><h2 class="mb-title">Event kinds</h2>
                    <p class="ps-sub">Every kind of work the events name: a namespace (the business area) and a NOUN-VERB command, e.g. <code>underwriting</code> / <code>quote-request</code>.</p></header>
                ${this.flash ? `<p class="mb-flash">${escapeHtml(this.flash)}</p>` : ''}
                <div class="ps-grid ps-grid-2"><div class="ps-stack">
                    ${unregistered.length ? `
                    <section class="ps-section">
                        <h3 class="ps-h3">Seen, not registered <span class="mb-n">${unregistered.length}</span></h3>
                        <p class="ps-sub">The events name these, but the catalog does not. They are kept and flagged; register one to declare it.</p>
                        <ul class="ps-list">${unregistered.map((u, i) => `
                            <li><span class="ps-list-main"><strong>${escapeHtml(u.namespace)} / ${escapeHtml(u.commandName)}</strong>
                                <span class="ps-sub">${escapeHtml(u.applications ?? '')} · ${u.recent} in 30 days · last ${escapeHtml(isoDate(u.lastSeen))}</span></span>
                                <button type="button" class="ps-save" data-register="${i}">Register</button></li>`).join('')}</ul>
                    </section>` : ''}
                    <section class="ps-section">
                        <h3 class="ps-h3">Registered <span class="mb-n">${kinds.length}</span></h3>
                        <div class="mb-actions"><button type="button" class="ps-save" data-new>Register a kind</button></div>
                        <div class="ps-scroll"><table class="ps-table">
                            <thead><tr><th>Kind</th><th>Name</th><th>Owner</th><th>Events (30 days)</th><th>Last seen</th></tr></thead>
                            <tbody>${kinds.map((k) => `
                                <tr class="${k.disposition === 'retired' ? 'mb-retired' : ''}">
                                    <td><a href="#" class="ps-link" data-edit="${k.appEventKindId}">${escapeHtml(k.namespace)} / ${escapeHtml(k.commandName)}</a>${k.disposition === 'retired' ? ' <span class="ps-flag">retired</span>' : ''}</td>
                                    <td>${escapeHtml(k.displayName)}</td><td>${escapeHtml(k.applicationName ?? '—')}</td>
                                    <td>${k.recent ?? 0}</td><td>${escapeHtml(isoDate(k.lastSeen) || 'never')}</td>
                                </tr>`).join('') || '<tr><td colspan="5" class="ps-none">None yet.</td></tr>'}</tbody>
                        </table></div>
                    </section>
                </div><div class="ps-stack">
                    ${this.editing ? this.formHtml(this.editing) : ''}
                    <section class="ps-section"><h3 class="ps-h3">${this.editing?.appEventKindId ? 'Its history' : 'Recent changes'}</h3>
                        ${history.length ? `<ul class="ps-list">${history.map((e) => `<li><span class="ps-list-main">${escapeHtml(describeKindAudit(e))}</span>
                            <span class="ps-list-end">${escapeHtml(isoDate(e.changedAt))} · ${escapeHtml(e.changedBy)}</span></li>`).join('')}</ul>` : '<p class="ps-none">No change yet.</p>'}
                    </section>
                </div></div>
            </div>`;
        this.bind();
    }

    formHtml(k) {
        const option = (value, label, selected) => `<option value="${escapeHtml(value)}"${selected ? ' selected' : ''}>${escapeHtml(label)}</option>`;
        return `
            <section class="ps-section">
                <h3 class="ps-h3">${k.appEventKindId ? `${escapeHtml(k.namespace)} / ${escapeHtml(k.commandName)}` : 'Register a kind'}</h3>
                <form class="mb-form" data-form="kind">
                    <label>Namespace <input name="namespace" required maxlength="50" value="${escapeHtml(k.namespace ?? '')}" placeholder="underwriting" /></label>
                    <label>Command (NOUN-VERB) <input name="commandName" required maxlength="50" value="${escapeHtml(k.commandName ?? '')}" placeholder="quote-request" /></label>
                    <label class="mb-wide">Display name <input name="displayName" required maxlength="100" value="${escapeHtml(k.displayName ?? '')}" /></label>
                    <label class="mb-wide">Description <textarea name="description" rows="2" maxlength="500">${escapeHtml(k.description ?? '')}</textarea></label>
                    <label>Owning application <select name="applicationId"><option value="">—</option>${this.catalog.applications.map((a) => option(a.id, a.name, a.id === k.applicationId)).join('')}</select></label>
                    <label>Disposition <select name="disposition">${DISPOSITIONS.map((d) => option(d, d, d === (k.disposition ?? 'current'))).join('')}</select></label>
                    <div class="mb-wide mb-actions"><button type="submit" class="ps-save">${k.appEventKindId ? 'Save' : 'Register'}</button>
                        <button type="button" class="ps-cancel" data-close>Close</button><span class="ps-form-status" data-status></span></div>
                </form>
            </section>`;
    }

    bind() {
        this.root.querySelector('[data-new]')?.addEventListener('click', () => { this.editing = {}; this.flash = ''; this.render(); });
        for (const b of this.root.querySelectorAll('[data-register]')) {
            b.addEventListener('click', () => {
                const u = this.catalog.unregistered[Number(b.dataset.register)];
                this.editing = { namespace: u.namespace, commandName: u.commandName, displayName: '' };
                this.flash = '';
                this.render();
            });
        }
        for (const a of this.root.querySelectorAll('[data-edit]')) {
            a.addEventListener('click', (e) => {
                e.preventDefault();
                this.editing = this.catalog.kinds.find((k) => k.appEventKindId === Number(a.dataset.edit));
                this.flash = '';
                this.render();
            });
        }
        this.root.querySelector('[data-close]')?.addEventListener('click', () => { this.editing = null; this.render(); });
        const form = this.root.querySelector('[data-form="kind"]');
        form?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const status = form.querySelector('[data-status]');
            const v = Object.fromEntries(new FormData(form));
            const body = { ...v, applicationId: v.applicationId ? Number(v.applicationId) : null };
            status.textContent = 'Saving…';
            status.className = 'ps-form-status';
            try {
                const id = this.editing.appEventKindId;
                const result = await this.post(id ? `/api/app-event-kinds/${id}` : '/api/app-event-kinds', body);
                this.flash = id ? 'Saved.' : 'Registered.';
                const catalog = await this.get('/api/app-event-kinds');
                this.catalog = catalog;
                this.recent = await this.get('/api/app-event-kinds/audit');
                this.editing = catalog.kinds.find((k) => k.appEventKindId === result.key) ?? null;
                await this.render();
            } catch (err) {
                status.textContent = err.message;
                status.className = 'ps-form-status is-error';
            }
        });
    }
}

export default new KindsPage();
