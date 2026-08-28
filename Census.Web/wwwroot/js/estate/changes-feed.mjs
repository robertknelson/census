import { fetchChanges } from './estate-api.mjs';
import { PanelScope } from './panel-scope.mjs';

// "What changed since yesterday, anywhere?" — the fleet's day-over-day story in one
// stream. Machines with a single collected day simply aren't in it yet.

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
    }

    refresh() {
        if (this.feed) this.render();
    }

    async mount(container) {
        this.container = container;
        container.innerHTML = '<p class="est-status">Reading the fleet’s last two days…</p>';
        let feed;
        try {
            feed = await fetchChanges();
        } catch (err) {
            container.innerHTML = `<p class="est-status est-error">${escapeHtml(err.message)}</p>`;
            return;
        }
        this.feed = feed;
        this.render();
    }

    render() {
        const scopeLine = this.scope.lineHtml();
        const machines = this.feed.machines.filter((m) => this.scope.has(m.machine));
        if (machines.length === 0) {
            this.container.innerHTML = scopeLine + (this.feed.machines.length === 0
                ? '<p class="est-status">No changes between the last two collections — or not enough collected days yet to compare.</p>'
                : '<p class="est-status">No changes on the machines in scope.</p>');
            this.scope.bind(this.container, () => this.render());
            return;
        }

        this.container.innerHTML = scopeLine + machines.map((m) => `
            <div class="est-changes-machine">
                <div class="est-changes-head">
                    <button class="est-q-machine est-mono" data-open-machine="${escapeHtml(m.machine)}">${escapeHtml(m.machine)}</button>
                    <span class="est-muted">${escapeHtml(m.fromDate)} → ${escapeHtml(m.toDate)} · ${m.entries.length} change${m.entries.length === 1 ? '' : 's'}</span>
                </div>
                ${m.entries.map((e) => `
                    <div class="est-history-row">
                        <span class="est-history-sym est-history-sym-${escapeHtml(e.kind)}">${e.kind === 'added' ? '+' : e.kind === 'removed' ? '−' : '~'}</span>
                        <span><span class="est-muted">${escapeHtml(SECTION_TITLES[e.section] ?? e.section)}:</span> ${escapeHtml(e.text)}</span>
                    </div>`).join('')}
            </div>`).join('');

        this.scope.bind(this.container, () => this.render());
        this.container.querySelectorAll('[data-open-machine]').forEach((btn) => btn.addEventListener('click', () => {
            this.onMachine(btn.dataset.openMachine);
        }));
    }
}
