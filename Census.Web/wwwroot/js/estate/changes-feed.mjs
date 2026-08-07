import { fetchChanges } from './estate-api.mjs';

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
    iisSites: 'IIS sites',
    iisAppPools: 'IIS app pools',
    iisApplications: 'IIS applications',
    iisDependencies: 'IIS dependencies',
    roles: 'Observed roles',
};

export class ChangesFeed {
    constructor(onMachine) {
        this.onMachine = onMachine;
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
        this.render(feed);
    }

    render(feed) {
        if (feed.machines.length === 0) {
            this.container.innerHTML = '<p class="est-status">No changes between the last two collections — or not enough collected days yet to compare.</p>';
            return;
        }

        this.container.innerHTML = feed.machines.map((m) => `
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

        this.container.querySelectorAll('[data-open-machine]').forEach((btn) => btn.addEventListener('click', () => {
            this.onMachine(btn.dataset.openMachine);
        }));
    }
}
