import { escapeHtml, isoDate } from '../moveit/format.mjs';

// The reset (census-on-apptrak.md §5, D-003): wipe every asserted row in AppTrak, keep each one so the
// wipe can be undone. The server decides whether it is offered (allowed, and if not, why); the form
// is shown only when it is. Typed confirmation (the word RESET and a reason), no browser dialog.

const WORD = 'RESET';

function when(at) {
    return `${isoDate(at)} ${new Date(at).toTimeString().slice(0, 5)}`;
}

class ResetPage {
    init(config = {}) {
        this.root = typeof config.root === 'string' ? document.querySelector(config.root) : config.root;
        this.headers = config.headers ?? {};
        this.flash = '';
        this.errors = [];
        this.load();
    }

    async load() {
        this.root.innerHTML = '<p class="ps-none">Reading what a reset would take…</p>';
        try {
            const response = await fetch('/api/admin/reset', { headers: { Accept: 'application/json', ...this.headers } });
            if (!response.ok) throw new Error(`The reset did not answer (${response.status}).`);
            this.status = await response.json();
        } catch (e) {
            this.root.innerHTML = `<p class="ps-error">${escapeHtml(e.message)}</p>`;
            return;
        }
        this.render();
    }

    async post(url, body) {
        const response = await fetch(url, {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...this.headers },
            body: JSON.stringify(body ?? {}),
        });
        const payload = await response.json().catch(() => ({}));
        return { ok: response.ok, payload, errors: payload.errors ?? (response.ok ? [] : [`Refused (${response.status}).`]) };
    }

    render() {
        const s = this.status;
        const total = s.tables.reduce((n, t) => n + (t.rowsNow ?? 0), 0);
        this.root.innerHTML = `
            <div class="mb-page">
                <header class="mb-head"><h2 class="mb-title">Reset</h2></header>
                ${this.flash ? `<p class="mb-flash">${escapeHtml(this.flash)}</p>` : ''}
                ${this.errors.length ? `<ul class="rs-errors">${this.errors.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul>` : ''}
                <section class="ps-section">
                    <p class="rs-lede">A reset wipes everything people have added (releases, features and fixes, build claims, events, links,
                    and the history of corrections to them) so real use can start from a clean slate. What was observed stays:
                    deployments, health responses, logs, and Census's own collection. Membership and feature access stay.
                    Every row it wipes is kept, and the reset can be undone below.</p>
                    <div class="ps-scroll"><table class="ps-table">
                        <thead><tr><th>Wiped</th><th>What it holds</th><th class="rs-n">Rows now</th></tr></thead>
                        <tbody>${s.tables.map((t) => `<tr><td><code>${escapeHtml(t.table)}</code></td><td class="mb-wrap">${escapeHtml(t.note ?? '')}</td><td class="rs-n">${t.rowsNow ?? '—'}</td></tr>`).join('')}</tbody>
                    </table></div>
                    ${s.allowed ? this.formHtml(total) : `<p class="rs-why">Not offered here:</p><ul class="mb-needs">${s.why.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>`}
                </section>
                <section class="ps-section">
                    <h3 class="ps-h3">Resets so far</h3>
                    ${this.resetsHtml()}
                </section>
            </div>`;
        this.bind();
    }

    formHtml(total) {
        if (total === 0) return '<p class="ps-none">Nothing to wipe: every asserted table is empty.</p>';
        return `
            <form class="mb-form" data-rs="form">
                <label class="mb-wide">Why (kept with the reset)<input name="reason" maxlength="500" required></label>
                <label>Type ${WORD} to confirm<input name="confirm" autocomplete="off" spellcheck="false"></label>
                <div class="mb-actions mb-wide"><button type="submit" class="ps-save rs-go" disabled>Reset: wipe ${total} rows</button></div>
            </form>`;
    }

    resetsHtml() {
        const resets = this.status.resets;
        if (!resets.length) return '<p class="ps-none">None yet.</p>';
        return `<div class="ps-scroll"><table class="ps-table">
            <thead><tr><th>#</th><th>When</th><th>By</th><th>Why</th><th class="rs-n">Rows kept</th><th>Restored</th></tr></thead>
            <tbody>${resets.map((r) => `<tr>
                <td>${r.resetId}</td><td>${escapeHtml(when(r.at))}</td><td>${escapeHtml(r.by)}</td><td class="mb-wrap">${escapeHtml(r.reason)}</td><td class="rs-n">${r.rowsTaken}</td>
                <td>${r.restoredAt
                    ? `${escapeHtml(when(r.restoredAt))} · ${escapeHtml(r.restoredBy ?? '')}`
                    : this.status.allowed && r.rowsTaken > 0 ? `<button type="button" class="ps-save rs-restore" data-restore="${r.resetId}">Restore</button>` : '—'}</td>
            </tr>`).join('')}</tbody>
        </table></div>
        <p class="ps-none">A restore puts the rows back with their own ids, into empty tables only. If anything was added since, reset again first (that keeps it too), then restore.</p>`;
    }

    bind() {
        const form = this.root.querySelector('[data-rs="form"]');
        if (form) {
            const go = form.querySelector('.rs-go');
            const ready = () => { go.disabled = !(form.confirm.value === WORD && form.reason.value.trim()); };
            form.addEventListener('input', ready);
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                go.disabled = true;
                const r = await this.post('/api/admin/reset', { confirm: form.confirm.value, reason: form.reason.value.trim() });
                this.errors = r.errors;
                this.flash = r.ok ? `Reset #${r.payload.key} done. Every asserted table is empty; the rows are kept.` : '';
                this.load();
            });
        }
        for (const b of this.root.querySelectorAll('[data-restore]')) {
            b.addEventListener('click', async () => {
                b.disabled = true;
                const r = await this.post(`/api/admin/reset/${b.dataset.restore}/restore`);
                this.errors = r.errors;
                this.flash = r.ok ? `Reset #${b.dataset.restore} restored: its rows are back.` : '';
                this.load();
            });
        }
    }
}

export default new ResetPage();
