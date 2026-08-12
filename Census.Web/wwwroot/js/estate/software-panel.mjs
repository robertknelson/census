import { fetchSoftware } from './estate-api.mjs';

// The fleet pivoted by application: search an app, see every machine carrying it and the
// version spread. A spread badge marks software running more than one version — the
// "which box is on the old build" question answered before it's asked.

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);
}

export class SoftwarePanel {
    constructor(state, onMachine) {
        this.state = state;      // persisted: { query: string }
        this.onMachine = onMachine;
    }

    async mount(container) {
        this.container = container;
        container.innerHTML = '<p class="est-status">Indexing the fleet’s software…</p>';
        let inventory;
        try {
            inventory = await fetchSoftware();
        } catch (err) {
            container.innerHTML = `<p class="est-status est-error">${escapeHtml(err.message)}</p>`;
            return;
        }
        this.items = inventory.items;
        this.render();
    }

    render() {
        this.container.innerHTML = `
            <input class="est-filter" type="search" placeholder="Search ${this.items.length} applications…"
                   value="${escapeHtml(this.state.query)}" data-ref="query" autofocus>
            <div data-ref="list"></div>`;

        this.container.querySelector('[data-ref="query"]').addEventListener('input', (e) => {
            this.state.query = e.target.value;
            this.renderList();
        });

        this.renderList();
    }

    renderList() {
        const listEl = this.container.querySelector('[data-ref="list"]');
        const q = this.state.query.trim().toLowerCase();
        const matches = q === ''
            ? this.items
            : this.items.filter((i) => i.name.toLowerCase().includes(q) || (i.publisher ?? '').toLowerCase().includes(q));

        if (matches.length === 0) {
            listEl.innerHTML = '<p class="est-status">Nothing in the fleet matches.</p>';
            return;
        }

        listEl.innerHTML = matches.map((item) => {
            const spread = item.versions.length > 1
                ? `<span class="est-verdict est-verdict-diff">${item.versions.length} versions</span>`
                : '';
            // Unapproved is per-machine, never per-application: the same software can be
            // approved on one box and a finding on the next.
            const unapproved = item.unapprovedOn.length > 0
                ? `<span class="est-badge est-badge-warn" title="Approved by no baseline matching ${escapeHtml(item.unapprovedOn.join(', '))}">unapproved on ${item.unapprovedOn.length}</span>`
                : '';
            return `
                <div class="est-sw">
                    <div class="est-sw-head">
                        <span class="est-sw-name">${escapeHtml(item.name)}</span>
                        ${spread}
                        ${unapproved}
                        <span class="est-muted">${escapeHtml(item.publisher ?? '')}</span>
                        <span class="est-sw-count est-mono">${item.machineCount} machine${item.machineCount === 1 ? '' : 's'}</span>
                    </div>
                    ${item.versions.map((v) => `
                        <div class="est-sw-version">
                            <span class="est-mono est-sw-vlabel">${escapeHtml(v.version)}</span>
                            <span class="est-sw-machines">
                                ${v.machines.map((m) => `<button class="est-q-machine est-mono" data-open-machine="${escapeHtml(m)}">${escapeHtml(m)}</button>`).join('')}
                            </span>
                        </div>`).join('')}
                </div>`;
        }).join('');

        listEl.querySelectorAll('[data-open-machine]').forEach((btn) => btn.addEventListener('click', () => {
            this.onMachine(btn.dataset.openMachine);
        }));
    }
}
