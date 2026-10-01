import { fetchComplianceSummary } from '../api.mjs';
import { escapeHtml } from '../html-utils.mjs';

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];
const RANGES = [{ days: 30, label: '30 days' }, { days: 90, label: '90 days' }, { days: 0, label: 'All' }];
const WEEK = 7 * 86_400_000;

function isoDay(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseDay(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function shortDay(date, withYear = false) {
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });
}

// Few enough labels to read at any range: every day up to two weeks, Mondays up to about two
// months, every other Monday up to four, then the first of each month.
function tickRule(n) {
    if (n <= 14) return () => true;
    if (n <= 62) return (day) => day.getDay() === 1;
    if (n <= 120) return (day) => day.getDay() === 1 && Math.floor(day.getTime() / WEEK) % 2 === 0;
    return (day, i) => day.getDate() === 1 || i === 0;
}

export class DashboardView {
    constructor(container) {
        this.container = container;
        this.range = 30;
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
                <div class="census-trend2-host" data-ref="trend"></div>
            </section>`;
        this.summary = summary;
        this.trendEl = this.container.querySelector('[data-ref="trend"]');
        this.renderTrend();
    }

    // The trend on a real calendar axis: every day in the range has a slot, so a day nobody was
    // collected on is an empty slot, never a zero. Columns shrink to fit any range; values are
    // labelled only at the latest day and the peak, the rest is on hover and in the table.
    // Under the bars, how many machines were collected that day, because a low bar on a day only
    // two machines reported is not an improvement.
    renderTrend() {
        const trend = this.summary.trend;
        if (trend.length === 0) {
            this.trendEl.innerHTML = '<p class="census-status">No data yet.</p>';
            return;
        }
        const byDay = new Map(trend.map((t) => [t.date, t]));
        const last = parseDay(trend[trend.length - 1].date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const end = last > today ? last : today;
        const start = this.range === 0
            ? parseDay(trend[0].date)
            : new Date(end.getFullYear(), end.getMonth(), end.getDate() - this.range + 1);
        const days = [];
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const day = new Date(d);
            days.push({ day, point: byDay.get(isoDay(day)) ?? null });
        }
        const shown = days.filter((d) => d.point);
        const maxHits = Math.max(1, ...shown.map((d) => d.point.totalHits));
        const total = Math.max(1, this.summary.totalMachines, ...shown.map((d) => d.point.machinesCollected));
        const latest = shown[shown.length - 1];
        const peak = shown.reduce((a, b) => (b.point.totalHits > a.point.totalHits ? b : a), shown[0]);
        const spansYears = days[0].day.getFullYear() !== days[days.length - 1].day.getFullYear();
        const tick = tickRule(days.length);

        const columns = days.map((d, i) => {
            const p = d.point;
            if (!p) return `<div class="census-trend2-col is-empty" data-i="${i}"></div>`;
            const label = d === latest || d === peak ? `<span class="census-trend2-value">${p.totalHits}</span>` : '';
            const mark = p.totalHits > 0
                ? `<span class="census-trend2-bar" style="height:${Math.max(3, (p.totalHits / maxHits) * 100)}%"></span>`
                : '<span class="census-trend2-zero"></span>';
            return `<div class="census-trend2-col" data-i="${i}">${label}${mark}</div>`;
        }).join('');
        const coverage = days.map((d) => (d.point
            ? `<div class="census-trend2-cov"><span style="height:${(d.point.machinesCollected / total) * 100}%"></span></div>`
            : '<div class="census-trend2-cov"></div>')).join('');
        const ticks = days.map((d, i) => `<div class="census-trend2-tick">${tick(d.day, i)
            ? escapeHtml(shortDay(d.day, spansYears && (i === 0 || (d.day.getMonth() === 0 && d.day.getDate() === 1))))
            : ''}</div>`).join('');

        this.trendEl.innerHTML = `
            <div class="census-trend2-head">
                <div class="census-trend2-ranges" role="group" aria-label="Range">
                    ${RANGES.map((r) => `<button type="button" class="census-trend2-range ${this.range === r.days ? 'is-active' : ''}" data-days="${r.days}">${r.label}</button>`).join('')}
                </div>
                <span class="census-muted">${shown.length} of ${days.length} days collected · peak ${peak?.point.totalHits ?? 0} hit(s)</span>
            </div>
            <div class="census-trend2 ${days.length > 150 ? 'is-dense' : ''}" style="--n:${days.length}">
                <div class="census-trend2-axis"><span>${maxHits}</span><span>0</span></div>
                <div class="census-trend2-plot">${columns}</div>
                <div class="census-trend2-axis is-cov">collected</div>
                <div class="census-trend2-covs">${coverage}</div>
                <div></div>
                <div class="census-trend2-ticks">${ticks}</div>
            </div>
            <div class="census-trend2-tip" hidden></div>
            <details class="census-trend2-table">
                <summary>Show as a table</summary>
                <table class="census-table">
                    <thead><tr><th>Day</th><th>Hits</th><th>Machines with hits</th><th>Machines collected</th></tr></thead>
                    <tbody>${shown.slice().reverse().map((d) => `
                        <tr><td>${escapeHtml(d.point.date)}</td><td>${d.point.totalHits}</td><td>${d.point.machinesWithHits}</td><td>${d.point.machinesCollected}</td></tr>`).join('')}</tbody>
                </table>
            </details>`;

        this.trendEl.querySelectorAll('[data-days]').forEach((b) => b.addEventListener('click', () => {
            this.range = Number(b.dataset.days);
            this.renderTrend();
        }));
        this.watchHover(days);
    }

    watchHover(days) {
        const tip = this.trendEl.querySelector('.census-trend2-tip');
        const plot = this.trendEl.querySelector('.census-trend2-plot');
        const clear = () => plot.querySelectorAll('.is-hover').forEach((el) => el.classList.remove('is-hover'));
        plot.addEventListener('mousemove', (e) => {
            const col = e.target.closest('[data-i]');
            if (!col) return;
            const d = days[Number(col.dataset.i)];
            tip.innerHTML = d.point
                ? `<strong>${escapeHtml(shortDay(d.day, true))}</strong><br>${d.point.totalHits} hit(s) on ${d.point.machinesWithHits} machine(s)<br>${d.point.machinesCollected} of ${this.summary.totalMachines} machines collected`
                : `<strong>${escapeHtml(shortDay(d.day, true))}</strong><br>no collection`;
            tip.hidden = false;
            const host = this.trendEl.getBoundingClientRect();
            const c = col.getBoundingClientRect();
            tip.style.left = `${Math.min(Math.max(c.left + c.width / 2 - host.left, 90), host.width - 90)}px`;
            tip.style.top = `${c.top - host.top - 6}px`;
            clear();
            col.classList.add('is-hover');
        });
        plot.addEventListener('mouseleave', () => { tip.hidden = true; clear(); });
    }
}
