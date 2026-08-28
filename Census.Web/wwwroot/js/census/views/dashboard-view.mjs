import { fetchComplianceSummary } from '../api.mjs';
import { escapeHtml } from '../html-utils.mjs';

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];

export class DashboardView {
    constructor(container) {
        this.container = container;
    }

    async render() {
        this.container.innerHTML = '<p class="census-status">Loading…</p>';
        try {
            const summary = await fetchComplianceSummary();
            this.renderSummary(summary);
        } catch (err) {
            this.container.innerHTML = `<p class="census-status census-status-error">${escapeHtml(err.message)}</p>`;
        }
    }

    renderSummary(summary) {
        const pctWithHits = summary.totalMachines > 0
            ? Math.round((summary.machinesWithHits / summary.totalMachines) * 100)
            : 0;

        const severityEntries = Object.entries(summary.hitCountBySeverity)
            .sort((a, b) => SEVERITY_ORDER.indexOf(a[0].toLowerCase()) - SEVERITY_ORDER.indexOf(b[0].toLowerCase()));

        const maxHits = Math.max(1, ...summary.trend.map((t) => t.totalHits));

        this.container.innerHTML = `
            <div class="census-scorecard">
                <div class="census-stat-tile">
                    <div class="census-stat-value">${summary.totalMachines}</div>
                    <div class="census-stat-label">Machines tracked</div>
                </div>
                <div class="census-stat-tile ${summary.machinesWithHits > 0 ? 'census-stat-tile-warning' : ''}">
                    <div class="census-stat-value">${summary.machinesWithHits} / ${summary.totalMachines}</div>
                    <div class="census-stat-label">Machines with prohibited hits (${pctWithHits}%)</div>
                </div>
                ${severityEntries.map(([severity, count]) => `
                    <div class="census-stat-tile" title="Number of prohibited software/runtime matches at ${escapeHtml(severity)} severity, across every machine's latest snapshot. One machine can contribute more than one hit.">
                        <div class="census-stat-value census-cell-${escapeHtml(severity.toLowerCase())}">${count}</div>
                        <div class="census-stat-label">${escapeHtml(severity)}-severity prohibited hits</div>
                    </div>`).join('')}
            </div>
            <p class="census-muted">A "hit" is one prohibited software or runtime match found on a machine (see <code>config/blacklist.json</code>) — a machine can account for more than one.</p>

            <section class="census-panel">
                <h3>Prohibited hits per collected day</h3>
                ${summary.trend.length === 0 ? '<p class="census-status">No data yet.</p>' : `
                    <div class="census-trend">
                        ${summary.trend.map((t) => `
                            <div class="census-trend-bar-wrap" title="${escapeHtml(t.date)}: ${t.totalHits} hit(s) across ${t.machinesCollected} machine(s) collected">
                                <div class="census-trend-value">${t.totalHits}</div>
                                <div class="census-trend-bar" style="height:${Math.max(2, Math.round((t.totalHits / maxHits) * 100))}%"></div>
                                <div class="census-trend-label">${escapeHtml(t.date.slice(5))}</div>
                            </div>`).join('')}
                    </div>`}
            </section>`;
    }
}
