import { fetchCertificates } from '../api.mjs';
import { escapeHtml } from '../html-utils.mjs';

function expiryClass(days) {
    if (days === null || days === undefined) return '';
    if (days < 0) return 'census-cell-critical';
    if (days <= 30) return 'census-cell-warning';
    return '';
}

function formatExpiry(days) {
    if (days === null || days === undefined) return '—';
    if (days < 0) return `expired ${Math.abs(days)}d ago`;
    return `${days}d`;
}

function formatDate(iso) {
    return iso ? iso.slice(0, 10) : '—';
}

// One accessor per sortable column; expiry date and days-left both order by time
// remaining, so they share the numeric value. Missing values sort last either way.
const SORT_COLUMNS = {
    machine: { label: 'Machine', value: (c) => c.machine },
    subject: { label: 'Subject', value: (c) => c.subject },
    notAfter: { label: 'Expiry date', value: (c) => c.daysUntilExpiry },
    days: { label: 'Days left', value: (c) => c.daysUntilExpiry },
    boundTo: { label: 'Bound to', value: (c) => (c.boundTo ?? []).join(', ') },
    issuer: { label: 'Issuer', value: (c) => c.issuer },
};

function compareValues(a, b) {
    if (a === null || a === undefined || a === '') return (b === null || b === undefined || b === '') ? 0 : 1;
    if (b === null || b === undefined || b === '') return -1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
}

export class CertificatesView {
    constructor(container) {
        this.container = container;
        this.maxDays = '';
        this.boundOnly = false;
        this.showRdp = false;
        this.sortKey = 'days';
        this.sortAsc = true;
    }

    async render() {
        this.container.innerHTML = '<p class="census-status">Loading…</p>';
        try {
            this.certs = await fetchCertificates();
            this.renderContent();
        } catch (err) {
            this.container.innerHTML = `<p class="census-status census-status-error">${escapeHtml(err.message)}</p>`;
        }
    }

    renderContent() {
        const filtered = this.certs.filter((c) => {
            // Hidden only when RDP is the cert's sole binding — a cert shared with IIS is
            // a real web cert and must not disappear behind the RDP toggle.
            if (!this.showRdp && c.boundTo.length > 0 && c.boundTo.every((b) => b === 'RDP')) return false;
            if (this.boundOnly && c.boundTo.length === 0) return false;
            if (this.maxDays !== '' && (c.daysUntilExpiry === null || c.daysUntilExpiry > Number(this.maxDays))) return false;
            return true;
        });

        const sortValue = SORT_COLUMNS[this.sortKey].value;
        filtered.sort((a, b) => (this.sortAsc ? 1 : -1) * compareValues(sortValue(a), sortValue(b)));

        const rows = filtered.map((c) => `
            <tr>
                <td><a href="#/machines/${encodeURIComponent(c.machine)}">${escapeHtml(c.machine)}</a></td>
                <td>${escapeHtml(c.subject)}</td>
                <td>${escapeHtml(formatDate(c.notAfter))}</td>
                <td class="${expiryClass(c.daysUntilExpiry)}">${formatExpiry(c.daysUntilExpiry)}</td>
                <td>${(c.boundTo ?? []).map((b) => `<span class="census-tag">${escapeHtml(b)}</span>`).join(' ') || '<span class="census-muted">unbound</span>'}</td>
                <td>${escapeHtml(c.issuer)}</td>
            </tr>`).join('');

        const headers = Object.entries(SORT_COLUMNS).map(([key, col]) => `
            <th class="census-th-sort ${this.sortKey === key ? 'is-sorted' : ''}" data-sort="${key}" title="Sort by ${escapeHtml(col.label)}">${escapeHtml(col.label)}<span class="census-sort-mark">${
                this.sortKey === key ? (this.sortAsc ? '▲' : '▼') : ''}</span></th>`).join('');

        this.container.innerHTML = `
            <h2>Certificate expiry</h2>
            <p class="census-muted">Every certificate from each machine's latest snapshot; click a column to sort.</p>
            <p>
                <label>Expires within <input type="number" min="0" data-ref="max-days" value="${escapeHtml(this.maxDays)}" placeholder="any" style="width:5rem"> days</label>
                &nbsp;
                <label><input type="checkbox" data-ref="bound-only" ${this.boundOnly ? 'checked' : ''}> Bound only</label>
                &nbsp;
                <label><input type="checkbox" data-ref="show-rdp" ${this.showRdp ? 'checked' : ''}> Show RDP certificates</label>
            </p>
            ${filtered.length === 0
                ? '<p class="census-status">No certificates match this filter.</p>'
                : `<table class="census-table">
                    <thead><tr>${headers}</tr></thead>
                    <tbody>${rows}</tbody>
                   </table>`}`;

        this.container.querySelector('[data-ref="max-days"]').addEventListener('change', (e) => {
            this.maxDays = e.target.value;
            this.renderContent();
        });
        this.container.querySelector('[data-ref="bound-only"]').addEventListener('change', (e) => {
            this.boundOnly = e.target.checked;
            this.renderContent();
        });
        this.container.querySelector('[data-ref="show-rdp"]').addEventListener('change', (e) => {
            this.showRdp = e.target.checked;
            this.renderContent();
        });
        this.container.querySelectorAll('th[data-sort]').forEach((th) => th.addEventListener('click', () => {
            if (this.sortKey === th.dataset.sort) this.sortAsc = !this.sortAsc;
            else { this.sortKey = th.dataset.sort; this.sortAsc = true; }
            this.renderContent();
        }));
    }
}
