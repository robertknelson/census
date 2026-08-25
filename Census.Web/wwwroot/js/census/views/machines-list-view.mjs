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

export class MachinesListView {
    constructor(container) {
        this.container = container;
    }

    async render() {
        this.container.innerHTML = '<p class="census-status">Loading machines…</p>';
        try {
            const machines = await fetchMachines();
            this.renderTable(machines);
        } catch (err) {
            this.container.innerHTML = `<p class="census-status census-status-error">${escapeHtml(err.message)}</p>`;
        }
    }

    renderTable(machines) {
        if (machines.length === 0) {
            this.container.innerHTML = '<p class="census-status">No machines collected yet.</p>';
            return;
        }

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
                        <th>Machine</th>
                        <th>Roles</th>
                        <th>OS / Build</th>
                        <th>Reboot</th>
                        <th>Prohibited hits</th>
                        <th>Soonest cert expiry</th>
                        <th>Last collected</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>`;
    }
}
