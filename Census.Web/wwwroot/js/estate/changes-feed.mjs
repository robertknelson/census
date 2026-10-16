import { fetchChanges } from './estate-api.mjs';
import { PanelScope } from './panel-scope.mjs';

// "What changed since yesterday, anywhere?" — the fleet's day-over-day story in one
// stream. Machines with a single collected day simply aren't in it yet. A From → To days
// widens the question: every night inside the days, and each line says the day it appeared.

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);
}

const SECTION_TITLES = {
    os: 'Operating system',
    apps: 'Installed software',
    dotnetCoreRuntimes: '.NET runtimes',
    dotnetSdks: '.NET SDKs',
    certificates: 'Certificates',
    drives: 'Drives',
    sqlInstances: 'SQL Server',
    sqlDatabases: 'SQL databases',
    sqlDatabaseFiles: 'SQL database files',
    iisSites: 'IIS sites',
    iisAppPools: 'IIS app pools',
    iisApplications: 'IIS applications',
    iisDependencies: 'IIS dependencies',
    roles: 'Observed roles',
};

export class ChangesFeed {
    constructor(getScope, onMachine) {
        this.scope = new PanelScope(getScope);
        this.onMachine = onMachine;
        this.from = '';
        this.to = '';
    }

    refresh() {
        if (this.feed) this.render();
    }

    mount(container) {
        this.container = container;
        container.innerHTML = `
            <div class="est-history-controls" data-ref="days">
                <label>From <input type="date" class="est-edit-input" data-ref="from"></label>
                <span class="est-muted">→</span>
                <label>To <input type="date" class="est-edit-input" data-ref="to"></label>
                <button type="button" class="est-btn" data-ref="latest" hidden>Latest two</button>
            </div>
            <div data-ref="feed"></div>`;
        this.feedEl = container.querySelector('[data-ref="feed"]');
        const fromEl = container.querySelector('[data-ref="from"]');
        const toEl = container.querySelector('[data-ref="to"]');
        const latestEl = container.querySelector('[data-ref="latest"]');
        const pick = () => {
            this.from = fromEl.value;
            this.to = toEl.value;
            latestEl.hidden = !this.from && !this.to;
            if (this.from && this.to && this.from > this.to) {
                this.feedEl.innerHTML = '<p class="est-status est-error">From is after To.</p>';
                return;
            }
            if (!!this.from !== !!this.to) return;
            this.load();
        };
        fromEl.addEventListener('change', pick);
        toEl.addEventListener('change', pick);
        latestEl.addEventListener('click', () => {
            fromEl.value = '';
            toEl.value = '';
            pick();
        });
        return this.load();
    }

    days() {
        return this.from && this.to ? { from: this.from, to: this.to } : null;
    }

    async load() {
        const days = this.days();
        this.feedEl.innerHTML = `<p class="est-status">${days ? `Reading the fleet from ${escapeHtml(days.from)} to ${escapeHtml(days.to)}…` : 'Reading the fleet’s last two days…'}</p>`;
        let feed;
        try {
            feed = await fetchChanges(days);
        } catch (err) {
            this.feedEl.innerHTML = `<p class="est-status est-error">${escapeHtml(err.message)}</p>`;
            return;
        }
        if (days?.from !== this.days()?.from || days?.to !== this.days()?.to) return;
        this.feed = feed;
        this.render();
    }

    render() {
        const days = this.days();
        const scopeLine = this.scope.lineHtml();
        const machines = this.feed.machines.filter((m) => this.scope.has(m.machine));
        if (machines.length === 0) {
            this.feedEl.innerHTML = scopeLine + (this.feed.machines.length === 0
                ? (days
                    ? `<p class="est-status">No changes between ${escapeHtml(days.from)} and ${escapeHtml(days.to)} — or no machine collected twice inside those days.</p>`
                    : '<p class="est-status">No changes between the last two collections — or not enough collected days yet to compare.</p>')
                : '<p class="est-status">No changes on the machines in scope.</p>');
            this.scope.bind(this.feedEl, () => this.render());
            return;
        }

        this.feedEl.innerHTML = scopeLine + machines.map((m) => `
            <div class="est-changes-machine">
                <div class="est-changes-head">
                    <button class="est-q-machine est-mono" data-open-machine="${escapeHtml(m.machine)}">${escapeHtml(m.machine)}</button>
                    <span class="est-muted">${escapeHtml(m.fromDate)} → ${escapeHtml(m.toDate)} · ${m.entries.length} change${m.entries.length === 1 ? '' : 's'}</span>
                </div>
                ${m.entries.map((e) => `
                    <div class="est-history-row">
                        <span class="est-history-sym est-history-sym-${escapeHtml(e.kind)}">${e.kind === 'added' ? '+' : e.kind === 'removed' ? '−' : '~'}</span>
                        ${days ? `<span class="est-changes-date est-mono est-muted">${escapeHtml(e.date)}</span>` : ''}
                        <span><span class="est-muted">${escapeHtml(SECTION_TITLES[e.section] ?? e.section)}:</span> ${escapeHtml(e.text)}</span>
                    </div>`).join('')}
            </div>`).join('');

        this.scope.bind(this.feedEl, () => this.render());
        this.feedEl.querySelectorAll('[data-open-machine]').forEach((btn) => btn.addEventListener('click', () => {
            this.onMachine(btn.dataset.openMachine);
        }));
    }
}
