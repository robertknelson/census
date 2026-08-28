import { fetchMachines } from '../api.mjs';
import { escapeHtml } from '../html-utils.mjs';

function formatCertExpiry(days) {
    if (days === null || days === undefined) return '—';
    if (days < 0) return `expired ${Math.abs(days)}d ago`;
    return `${days}d`;
}

function certExpiryClass(days) {
    if (days === null || days === undefined) return '';
    if (days < 0) return 'census-cell-critical';
    if (days <= 30) return 'census-cell-warning';
    return '';
}

const SEVERITY_RANK = { critical: 3, high: 2, warning: 1 };

// One accessor per column; null sorts last in either direction so "unknown" never
// masquerades as smallest or largest.
const COLUMNS = [
    { key: 'machine', label: 'Machine', value: (m) => m.machine.toLowerCase() },
    { key: 'roles', label: 'Roles', value: (m) => (m.roles ?? []).join(', ').toLowerCase() || null },
    { key: 'os', label: 'OS / Build', value: (m) => `${m.productName ?? ''} ${m.currentBuild ?? ''}.${m.ubr ?? ''}`.trim().toLowerCase() || null },
    { key: 'reboot', label: 'Reboot', value: (m) => (m.pendingReboot ? 1 : 0) },
    { key: 'hits', label: 'Prohibited hits', value: (m) => m.blacklistHitCount * 10 + (SEVERITY_RANK[m.highestBlacklistSeverity] ?? 0) },
    { key: 'cert', label: 'Soonest cert expiry', value: (m) => m.soonestCertExpiryDays ?? null },
    { key: 'collected', label: 'Last collected', value: (m) => m.latestDate || null },
];

function compare(a, b) {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return a < b ? -1 : a > b ? 1 : 0;
}

export class MachinesListView {
    constructor(container) {
        this.container = container;
        this.sortKey = 'machine';
        this.sortAsc = true;
    }

    async render() {
        this.container.innerHTML = '<p class="census-status">Loading machines…</p>';
        try {
            this.machines = await fetchMachines();
            this.renderTable();
        } catch (err) {
            this.container.innerHTML = `<p class="census-status census-status-error">${escapeHtml(err.message)}</p>`;
        }
    }

    renderTable() {
        if (this.machines.length === 0) {
            this.container.innerHTML = '<p class="census-status">No machines collected yet.</p>';
            return;
        }

        const column = COLUMNS.find((c) => c.key === this.sortKey);
        const dir = this.sortAsc ? 1 : -1;
        const machines = [...this.machines].sort((a, b) => {
            const va = column.value(a);
            const vb = column.value(b);
            if (va === null || vb === null) return compare(va, vb);
            return dir * compare(va, vb) || compare(a.machine.toLowerCase(), b.machine.toLowerCase());
        });

        const rows = machines.map((m) => `
            <tr>
                <td><a href="#/machines/${encodeURIComponent(m.machine)}">${escapeHtml(m.machine)}</a></td>
                <td>${(m.roles ?? []).map((r) => `<span class="census-tag">${escapeHtml(r)}</span>`).join(' ') || '—'}</td>
                <td>${escapeHtml(m.productName)}${m.currentBuild ? ` <span class="census-muted">(${escapeHtml(m.currentBuild)}.${escapeHtml(m.ubr)})</span>` : ''}</td>
                <td>${m.pendingReboot ? '<span class="census-cell-warning">pending</span>' : '—'}</td>
                <td class="${m.blacklistHitCount > 0 ? `census-cell-${escapeHtml(m.highestBlacklistSeverity ?? 'warning')}` : ''}">${m.blacklistHitCount > 0 ? `${m.blacklistHitCount} (${escapeHtml(m.highestBlacklistSeverity)})` : '0'}</td>
                <td class="${certExpiryClass(m.soonestCertExpiryDays)}">${formatCertExpiry(m.soonestCertExpiryDays)}</td>
                <td>${escapeHtml(m.latestDate) || 'never'}</td>
            </tr>`).join('');

        this.container.innerHTML = `
            <table class="census-table">
                <thead>
                    <tr>
                        ${COLUMNS.map((c) => `
                        <th class="census-th-sort ${c.key === this.sortKey ? 'is-sorted' : ''}" data-sort="${c.key}">${escapeHtml(c.label)}<span class="census-sort-mark">${c.key === this.sortKey ? (this.sortAsc ? '▲' : '▼') : ''}</span></th>`).join('')}
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>`;

        this.container.querySelectorAll('[data-sort]').forEach((th) => th.addEventListener('click', () => {
            const key = th.dataset.sort;
            if (key === this.sortKey) this.sortAsc = !this.sortAsc;
            else { this.sortKey = key; this.sortAsc = true; }
            this.renderTable();
        }));
    }
}
