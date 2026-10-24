import { escapeHtml } from '../membership/utils/format.mjs';
import { isoDay, periodOf, shiftPeriod, spanText } from './period.mjs';

// Every application's usage at once (gatehouse.md §13 U-R2), for executives and system administrators: people,
// sessions and the sessions ending on an error, in a week, month or quarter against the one before, one stage. An
// application opens its own Usage page only where the server says the reader may (its canOpen). The address keeps the
// place (?grain=&on=&stage=).

const GRAINS = ['week', 'month', 'quarter'];
const n = (value) => Number(value ?? 0).toLocaleString();

export function summaryRows(current, previous) {
    const before = new Map(previous.map((p) => [p.application, p]));
    return current.map((c) => {
        const p = before.get(c.application);
        return {
            ...c,
            endedRate: c.sessions ? c.endedOnError / c.sessions : 0,
            peopleBefore: p?.people ?? 0,
            sessionsBefore: p?.sessions ?? 0,
            endedRateBefore: p?.sessions ? p.endedOnError / p.sessions : null,
        };
    }).sort((a, b) => b.sessions - a.sessions || String(a.application).localeCompare(String(b.application)));
}

const change = (now, before) => {
    if (!before) return now ? '<span class="fa-muted">new</span>' : '';
    const pct = Math.round(((now - before) / before) * 100);
    return `<span class="${pct < 0 ? 'usage-down' : 'usage-up'}">${pct > 0 ? '+' : ''}${pct}%</span>`;
};

class UsageSummaryPage {
    init(config = {}) {
        this.root = typeof config.root === 'string' ? document.querySelector(config.root) : config.root;
        this.fiscalStart = config.fiscalStart ?? 1;
        this.excluded = config.excluded ?? {};
        const here = new URLSearchParams(location.search);
        this.grain = GRAINS.includes(here.get('grain')) ? here.get('grain') : 'month';
        this.stage = here.get('stage') ?? 'PROD';
        const on = /^\d{4}-\d{2}-\d{2}$/.test(here.get('on') ?? '') ? new Date(`${here.get('on')}T12:00:00`) : new Date();
        this.period = periodOf(on, this.grain, this.fiscalStart);
        this.root.addEventListener('click', (e) => this.click(e));
        this.load();
    }

    window(period) {
        return new URLSearchParams({ from: period.start.toISOString(), to: period.end.toISOString(), ...(this.stage ? { stage: this.stage } : {}) });
    }

    async get(period) {
        const response = await fetch(`/api/usage-summary?${this.window(period)}`, { headers: { Accept: 'application/json' } });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message ?? `The summary did not answer (${response.status}).`);
        return payload;
    }

    async load() {
        history.replaceState(null, '', `/usage/summary?${new URLSearchParams({ grain: this.grain, on: isoDay(this.period.start), stage: this.stage })}`);
        this.root.innerHTML = '<p class="ps-none">Reading every application…</p>';
        let rows;
        try {
            const [current, previous] = await Promise.all([this.get(this.period), this.get(shiftPeriod(this.period, -1, this.fiscalStart))]);
            rows = summaryRows(current, previous);
        } catch (e) {
            this.root.innerHTML = `<p class="ps-error">${escapeHtml(e.message)}</p>`;
            return;
        }
        const usageLink = (r) => `/usage?${new URLSearchParams({ application: r.application, stage: this.stage || 'all', grain: this.grain, on: isoDay(this.period.start) })}`;
        const left = [...new Set(Object.values(this.excluded).flat())].sort();
        const total = (key) => rows.reduce((sum, r) => sum + (r[key] ?? 0), 0);
        this.root.innerHTML = `
            <div class="mb-page">
                <header class="mb-head"><h2 class="mb-title">Usage summary</h2>
                    <p class="ps-sub">Every application with requests in the period, against the one before. People are counted once per application.</p></header>
                <div class="ps-section ae-filters" style="flex-direction:row;flex-wrap:wrap;gap:.75rem 1.5rem;align-items:center">
                    <span>${GRAINS.map((g) => `<button type="button" class="ps-cancel${g === this.grain ? ' is-active' : ''}" data-grain="${g}" aria-pressed="${g === this.grain}">${g}</button>`).join(' ')}</span>
                    <span><button type="button" class="ps-cancel" data-shift="-1" aria-label="Previous period">&lsaquo;</button>
                        <strong>${escapeHtml(this.period.label)}</strong> <span class="ps-sub">${escapeHtml(spanText(this.period))}</span>
                        <button type="button" class="ps-cancel" data-shift="1" aria-label="Next period">&rsaquo;</button></span>
                    <span>Stage <button type="button" class="ps-cancel${this.stage === 'PROD' ? ' is-active' : ''}" data-stage="PROD">PROD</button>
                        <button type="button" class="ps-cancel${!this.stage ? ' is-active' : ''}" data-stage="">every stage</button></span>
                </div>
                <div class="ps-tiles">
                    <div class="ps-tile"><span class="ps-tile-label">Applications used</span><span class="ps-tile-value">${n(rows.length)}</span></div>
                    <div class="ps-tile"><span class="ps-tile-label">Sessions</span><span class="ps-tile-value">${n(total('sessions'))}</span></div>
                    <div class="ps-tile"><span class="ps-tile-label">Sessions ending on an error</span><span class="ps-tile-value">${n(total('endedOnError'))}</span></div>
                </div>
                <section class="ps-section">
                    <div class="ps-scroll"><table class="ps-table">
                        <thead><tr><th>Application</th><th>People</th><th></th><th>Sessions</th><th></th><th>Ending on an error</th><th></th></tr></thead>
                        <tbody>${rows.map((r) => `
                            <tr>
                                <td>${r.canOpen ? `<a class="ps-link" href="${escapeHtml(usageLink(r))}">${escapeHtml(r.application)}</a>` : escapeHtml(r.application)}</td>
                                <td>${n(r.people)}</td><td>${change(r.people, r.peopleBefore)}</td>
                                <td>${n(r.sessions)}</td><td>${change(r.sessions, r.sessionsBefore)}</td>
                                <td>${Math.round(r.endedRate * 100)}% <span class="ps-sub">${n(r.endedOnError)}</span></td>
                                <td class="ps-sub">${r.endedRateBefore == null ? '' : `was ${Math.round(r.endedRateBefore * 100)}%`}</td>
                            </tr>`).join('') || '<tr><td colspan="7" class="ps-none">No application has requests in this period.</td></tr>'}</tbody>
                    </table></div>
                </section>
                ${left.length ? `<p class="ps-sub">Left out of every figure (Usage:Excluded): ${left.map(escapeHtml).join(', ')}.</p>` : ''}
            </div>`;
    }

    click(event) {
        const target = event.target.closest('[data-grain], [data-shift], [data-stage]');
        if (!target) return;
        if (target.dataset.grain) {
            this.grain = target.dataset.grain;
            this.period = periodOf(this.period.start, this.grain, this.fiscalStart);
        } else if (target.dataset.shift) {
            this.period = shiftPeriod(this.period, Number(target.dataset.shift), this.fiscalStart);
        } else {
            this.stage = target.dataset.stage;
        }
        this.load();
    }
}

export default new UsageSummaryPage();
