import { fetchCoverage } from '../api.mjs';
import { escapeHtml } from '../html-utils.mjs';

function outcomeClass(outcome) {
    if (outcome === 'ok') return '';
    if (outcome === 'unreachable') return 'census-cell-warning';
    if (outcome === 'failed') return 'census-cell-critical';
    return '';
}

const OUTCOME_RANK = { ok: 0, unreachable: 1, failed: 2 };

// One accessor per column. Age treats never-collected as infinite and collected-but-
// never-OK as next, so the default (age, descending) is the attention order this view
// always had: never first, then stalest. Other missing values sort last either way.
const COLUMNS = [
    { key: 'machine', label: 'Machine', value: (m) => m.machine.toLowerCase() },
    { key: 'snapshot', label: 'Last snapshot', value: (m) => (m.everCollected ? m.lastSnapshotDate : null) },
    { key: 'outcome', label: 'Last run outcome', value: (m) => OUTCOME_RANK[m.lastRunOutcome] ?? null },
    { key: 'lastOk', label: 'Last OK', value: (m) => m.lastOkDate || null },
    { key: 'age', label: 'Age', value: (m) => (!m.everCollected ? Infinity : (m.lastOkAgeDays ?? Number.MAX_SAFE_INTEGER)) },
    { key: 'integrity', label: 'Integrity', value: (m) => (m.orphanOkNoFile ? 1 : 0) },
    { key: 'reason', label: 'Last run reason', value: (m) => m.lastRunReason || null },
];

function compare(a, b) {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return a < b ? -1 : a > b ? 1 : 0;
}

export class CoverageView {
    constructor(container) {
        this.container = container;
        this.sortKey = 'age';
        this.sortAsc = false;
    }

    async render() {
        this.container.innerHTML = '<p class="census-status">Loading…</p>';
        try {
            this.coverage = await fetchCoverage();
            this.renderTable();
        } catch (err) {
            this.container.innerHTML = `<p class="census-status census-status-error">${escapeHtml(err.message)}</p>`;
        }
    }

    renderTable() {
        const column = COLUMNS.find((c) => c.key === this.sortKey);
        const dir = this.sortAsc ? 1 : -1;
        const sorted = [...this.coverage].sort((a, b) => {
            const va = column.value(a);
            const vb = column.value(b);
            if (va === null || vb === null) return compare(va, vb);
            return dir * compare(va, vb) || compare(a.machine.toLowerCase(), b.machine.toLowerCase());
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
