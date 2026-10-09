import { fetchMachineChanges, fetchMachineDiff } from './estate-api.mjs';

// "How has this machine changed over time" — the dossier's History section. Two tabs
// (census-web.md §16): Comparison, a keyed diff between any two collected days (defaults
// to previous vs latest); List, the nights whose diff against the day before is not empty,
// newest first, a count per section, each expanding to its full diff. Change symbols carry
// their own colors (+/−/~); status red/amber stays reserved for findings.

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);
}

const SECTION_TITLES = {
    apps: 'Installed software',
    dotnetCoreRuntimes: '.NET runtimes',
    dotnetSdks: '.NET SDKs',
    certificates: 'Certificates',
    drives: 'Drives',
    sqlInstances: 'SQL Server instances',
    sqlDatabases: 'SQL databases',
    sqlDatabaseFiles: 'SQL database files',
    iisSites: 'IIS sites',
    iisAppPools: 'IIS app pools',
    iisApplications: 'IIS applications',
    iisDependencies: 'IIS dependencies',
    roles: 'Observed roles',
};

export class MachineHistory {
    constructor(machine, dates) {
        this.machine = machine;
        this.dates = dates;
        this.toDate = dates[dates.length - 1];
        this.fromDate = dates[dates.length - 2];
        this.tab = 'comparison';
        this.range = 'month';
        this.open = new Set();           // nights expanded in the list, by date
    }

    mount(container) {
        this.container = container;
        this.render();
    }

    render() {
        this.container.innerHTML = `
            <div class="est-history-tabs" role="tablist">
                <button type="button" class="est-history-tab ${this.tab === 'comparison' ? 'is-active' : ''}" data-tab="comparison">Comparison</button>
                <button type="button" class="est-history-tab ${this.tab === 'list' ? 'is-active' : ''}" data-tab="list">List</button>
            </div>
            <div data-ref="tab-body"></div>`;
        this.container.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
            this.tab = b.dataset.tab;
            this.render();
        }));
        this.body = this.container.querySelector('[data-ref="tab-body"]');
        if (this.tab === 'list') this.renderList();
        else this.renderComparison();
    }

    renderComparison() {
        const option = (d, selected) => `<option value="${escapeHtml(d)}" ${d === selected ? 'selected' : ''}>${escapeHtml(d)}</option>`;
        this.body.innerHTML = `
            <div class="est-history-controls">
                <label>From <select class="est-edit-input" data-ref="from">${this.dates.map((d) => option(d, this.fromDate)).join('')}</select></label>
                <span class="est-muted">→</span>
                <label>To <select class="est-edit-input" data-ref="to">${this.dates.map((d) => option(d, this.toDate)).join('')}</select></label>
                <span class="est-muted">${this.dates.length} day${this.dates.length === 1 ? '' : 's'} collected</span>
            </div>
            <div data-ref="diff"><p class="est-status">Comparing days…</p></div>`;

        this.body.querySelector('[data-ref="from"]').addEventListener('change', (e) => {
            this.fromDate = e.target.value;
            this.loadDiff();
        });
        this.body.querySelector('[data-ref="to"]').addEventListener('change', (e) => {
            this.toDate = e.target.value;
            this.loadDiff();
        });

        this.loadDiff();
    }

    // The List tab: only the nights that changed; a quiet night is not a row. The range is
    // measured back from the newest collected day; the header says how many of the nights
    // looked at changed, and when the server stopped at its cap.
    async renderList() {
        const seg = (id, label) => `<button type="button" class="est-history-range ${this.range === id ? 'is-active' : ''}" data-range="${id}">${label}</button>`;
        this.body.innerHTML = `
            <div class="est-history-controls">
                <span class="est-history-ranges">${seg('week', 'Week')}${seg('month', 'Month')}${seg('all', 'All')}</span>
                <span class="est-muted" data-ref="list-summary">Looking…</span>
            </div>
            <div data-ref="list"><p class="est-status">Looking for nights with changes…</p></div>`;
        this.body.querySelectorAll('[data-range]').forEach((b) => b.addEventListener('click', () => {
            this.range = b.dataset.range;
            this.renderList();
        }));
        const listEl = this.body.querySelector('[data-ref="list"]');
        const summaryEl = this.body.querySelector('[data-ref="list-summary"]');
        let changes;
        try {
            changes = await fetchMachineChanges(this.machine, this.range);
        } catch (err) {
            listEl.innerHTML = `<p class="est-status est-error">${escapeHtml(err.message)}</p>`;
            summaryEl.textContent = '';
            return;
        }
        if (this.tab !== 'list' || this.range !== changes.range) return;
        const n = changes.nightsLookedAt;
        summaryEl.textContent = `${changes.nights.length} of ${n} night${n === 1 ? '' : 's'} changed${changes.truncated ? ` — the newest ${n} only; narrow the range for older` : ''}`;
        if (!changes.nights.length) {
            listEl.innerHTML = `<p class="est-status">${n === 0 ? 'No second collected day in this range.' : 'Quiet: nothing changed on any of these nights.'}</p>`;
            return;
        }
        listEl.innerHTML = changes.nights.map((night) => `
            <div class="est-history-night ${this.open.has(night.date) ? 'is-open' : ''}" data-night="${escapeHtml(night.date)}">
                <button type="button" class="est-history-night-head" data-ref="toggle" aria-expanded="${this.open.has(night.date)}">
                    <span class="est-history-night-caret">▸</span>
                    <span class="est-mono">${escapeHtml(night.previous)} → ${escapeHtml(night.date)}</span>
                    <span class="est-history-night-counts">${this.countsLine(night)}</span>
                </button>
                <div class="est-history-night-body" data-ref="night-body" ${this.open.has(night.date) ? '' : 'hidden'}></div>
            </div>`).join('');
        listEl.querySelectorAll('[data-night]').forEach((el) => {
            const night = changes.nights.find((x) => x.date === el.dataset.night);
            el.querySelector('[data-ref="toggle"]').addEventListener('click', () => this.toggleNight(el, night));
            if (this.open.has(night.date)) this.loadNight(el, night);
        });
    }

    // "+2 apps, ~1 drive, −1 certificate": the sections in their stated order, each symbol only when it counts.
    countsLine(night) {
        const parts = [];
        if (night.scalar) parts.push(`~${night.scalar} machine`);
        for (const [name, c] of Object.entries(night.sections)) {
            const title = (SECTION_TITLES[name] ?? name).toLowerCase();
            const bits = [];
            if (c.added) bits.push(`<span class="est-history-sym-added">+${c.added}</span>`);
            if (c.removed) bits.push(`<span class="est-history-sym-removed">−${c.removed}</span>`);
            if (c.changed) bits.push(`<span class="est-history-sym-changed">~${c.changed}</span>`);
            parts.push(`${bits.join(' ')} ${escapeHtml(title)}`);
        }
        return parts.join('<span class="est-muted">, </span>');
    }

    toggleNight(el, night) {
        const opening = !this.open.has(night.date);
        if (opening) this.open.add(night.date); else this.open.delete(night.date);
        el.classList.toggle('is-open', opening);
        const body = el.querySelector('[data-ref="night-body"]');
        el.querySelector('[data-ref="toggle"]').setAttribute('aria-expanded', String(opening));
        body.hidden = !opening;
        if (opening && !body.dataset.loaded) this.loadNight(el, night);
    }

    async loadNight(el, night) {
        const body = el.querySelector('[data-ref="night-body"]');
        body.innerHTML = '<p class="est-status">Comparing days…</p>';
        try {
            const diff = await fetchMachineDiff(this.machine, night.previous, night.date);
            body.innerHTML = this.diffHtml(diff);
            body.dataset.loaded = '1';
        } catch (err) {
            body.innerHTML = `<p class="est-status est-error">${escapeHtml(err.message)}</p>`;
        }
    }

    async loadDiff() {
        const diffEl = this.body.querySelector('[data-ref="diff"]');
        if (this.fromDate === this.toDate) {
            diffEl.innerHTML = '<p class="est-status">Same day on both sides — pick two different days.</p>';
            return;
        }

        diffEl.innerHTML = '<p class="est-status">Comparing days…</p>';
        let diff;
        try {
            diff = await fetchMachineDiff(this.machine, this.fromDate, this.toDate);
        } catch (err) {
            diffEl.innerHTML = `<p class="est-status est-error">${escapeHtml(err.message)}</p>`;
            return;
        }

        diffEl.innerHTML = this.diffHtml(diff);
    }

    diffHtml(diff) {
        const scalarRows = diff.scalarChanges.map((c) =>
            this.row('changed', `${labelOfScalar(c.field)}: ${escapeHtml(c.from)} → ${escapeHtml(c.to)}`)).join('');

        const sectionRows = diff.sections.map((s) => {
            const items = [
                ...s.added.map((i) => this.row('added', escapeHtml(i.label))),
                ...s.removed.map((i) => this.row('removed', escapeHtml(i.label))),
                ...s.changed.map((i) => this.row('changed',
                    `${escapeHtml(i.label)}: ${i.changes.map((c) => `${escapeHtml(c.field)} ${escapeHtml(c.from)} → ${escapeHtml(c.to)}`).join(', ')}`)),
            ];
            if (items.length === 0) return '';
            return `
                <div class="est-history-group">
                    <div class="est-history-group-name">${escapeHtml(SECTION_TITLES[s.name] ?? s.name)}</div>
                    ${items.join('')}
                </div>`;
        }).join('');

        return (scalarRows || sectionRows)
            ? `${scalarRows ? `<div class="est-history-group">${scalarRows}</div>` : ''}${sectionRows}`
            : `<p class="est-status">No changes between ${escapeHtml(diff.fromDate)} and ${escapeHtml(diff.toDate)}.</p>`;
    }

    row(kind, html) {
        const symbol = kind === 'added' ? '+' : kind === 'removed' ? '−' : '~';
        return `
            <div class="est-history-row">
                <span class="est-history-sym est-history-sym-${kind}">${symbol}</span>
                <span>${html}</span>
            </div>`;
    }
}

function labelOfScalar(field) {
    if (field === 'os.build') return 'OS build';
    if (field === 'os.pendingReboot') return 'Pending reboot';
    return escapeHtml(field);
}
