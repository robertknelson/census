import { fetchMachineDiff } from './estate-api.mjs';

// "How has this machine changed over time" — the dossier's History section. A keyed diff
// between any two collected days (defaults to previous vs latest). Change symbols carry
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
    iisSites: 'IIS sites',
    roles: 'Observed roles',
};

export class MachineHistory {
    constructor(machine, dates) {
        this.machine = machine;
        this.dates = dates;
        this.toDate = dates[dates.length - 1];
        this.fromDate = dates[dates.length - 2];
    }

    mount(container) {
        this.container = container;
        this.render();
    }

    render() {
        const option = (d, selected) => `<option value="${escapeHtml(d)}" ${d === selected ? 'selected' : ''}>${escapeHtml(d)}</option>`;
        this.container.innerHTML = `
            <div class="est-history-controls">
                <label>From <select class="est-edit-input" data-ref="from">${this.dates.map((d) => option(d, this.fromDate)).join('')}</select></label>
                <span class="est-muted">→</span>
                <label>To <select class="est-edit-input" data-ref="to">${this.dates.map((d) => option(d, this.toDate)).join('')}</select></label>
                <span class="est-muted">${this.dates.length} day${this.dates.length === 1 ? '' : 's'} collected</span>
            </div>
            <div data-ref="diff"><p class="est-status">Comparing days…</p></div>`;

        this.container.querySelector('[data-ref="from"]').addEventListener('change', (e) => {
            this.fromDate = e.target.value;
            this.loadDiff();
        });
        this.container.querySelector('[data-ref="to"]').addEventListener('change', (e) => {
            this.toDate = e.target.value;
            this.loadDiff();
        });

        this.loadDiff();
    }

    async loadDiff() {
        const diffEl = this.container.querySelector('[data-ref="diff"]');
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

        diffEl.innerHTML = (scalarRows || sectionRows)
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
