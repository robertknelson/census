import { fetchCoverage } from '../api.mjs';
import { escapeHtml } from '../html-utils.mjs';

function outcomeClass(outcome) {
    if (outcome === 'ok') return '';
    if (outcome === 'unreachable') return 'census-cell-warning';
    if (outcome === 'failed') return 'census-cell-critical';
    return '';
}

export class CoverageView {
    constructor(container) {
        this.container = container;
    }

    async render() {
        this.container.innerHTML = '<p class="census-status">Loading…</p>';
        try {
            const coverage = await fetchCoverage();
            this.renderTable(coverage);
        } catch (err) {
            this.container.innerHTML = `<p class="census-status census-status-error">${escapeHtml(err.message)}</p>`;
        }
    }

    renderTable(coverage) {
        const sorted = [...coverage].sort((a, b) => {
            if (a.everCollected !== b.everCollected) return a.everCollected ? 1 : -1;
            return (b.lastOkAgeDays ?? Infinity) - (a.lastOkAgeDays ?? Infinity);
        });

        const rows = sorted.map((m) => `
            <tr>
                <td>${escapeHtml(m.machine)}</td>
                <td>${m.everCollected ? `<a href="#/machines/${encodeURIComponent(m.machine)}">${escapeHtml(m.lastSnapshotDate)}</a>` : '<span class="census-cell-critical">never</span>'}</td>
                <td class="${outcomeClass(m.lastRunOutcome)}">${escapeHtml(m.lastRunOutcome) || '—'}</td>
                <td>${escapeHtml(m.lastOkDate) || '—'}</td>
                <td class="${m.lastOkAgeDays !== null && m.lastOkAgeDays > 3 ? 'census-cell-warning' : ''}">${m.lastOkAgeDays === null ? '—' : `${m.lastOkAgeDays}d`}</td>
                <td>${m.orphanOkNoFile ? '<span class="census-cell-critical">log says ok, no file</span>' : '—'}</td>
                <td class="census-muted">${escapeHtml(m.lastRunReason) || ''}</td>
            </tr>`).join('');

        this.container.innerHTML = `
            <h2>Coverage / freshness</h2>
            <p class="census-muted">Every machine in <code>config/machines.json</code>, cross-referenced against the run log and what actually landed on disk.</p>
            <table class="census-table">
                <thead>
                    <tr>
                        <th>Machine</th>
                        <th>Last snapshot</th>
                        <th>Last run outcome</th>
                        <th>Last OK</th>
                        <th>Age</th>
                        <th>Integrity</th>
                        <th>Last run reason</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>`;
    }
}
