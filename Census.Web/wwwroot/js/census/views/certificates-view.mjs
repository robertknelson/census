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

export class CertificatesView {
    constructor(container) {
        this.container = container;
        this.maxDays = '';
        this.boundOnly = false;
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
            if (this.boundOnly && c.boundTo.length === 0) return false;
            if (this.maxDays !== '' && (c.daysUntilExpiry === null || c.daysUntilExpiry > Number(this.maxDays))) return false;
            return true;
        });

        const rows = filtered.map((c) => `
            <tr>
                <td><a href="#/machines/${encodeURIComponent(c.machine)}">${escapeHtml(c.machine)}</a></td>
                <td>${escapeHtml(c.subject)}</td>
                <td>${escapeHtml(formatDate(c.notAfter))}</td>
                <td class="${expiryClass(c.daysUntilExpiry)}">${formatExpiry(c.daysUntilExpiry)}</td>
                <td>${(c.boundTo ?? []).map((b) => `<span class="census-tag">${escapeHtml(b)}</span>`).join(' ') || '<span class="census-muted">unbound</span>'}</td>
                <td>${escapeHtml(c.issuer)}</td>
            </tr>`).join('');

        this.container.innerHTML = `
            <h2>Certificate expiry</h2>
            <p class="census-muted">Every certificate from each machine's latest snapshot, soonest expiry first.</p>
            <p>
                <label>Expires within <input type="number" min="0" data-ref="max-days" value="${escapeHtml(this.maxDays)}" placeholder="any" style="width:5rem"> days</label>
                &nbsp;
                <label><input type="checkbox" data-ref="bound-only" ${this.boundOnly ? 'checked' : ''}> Bound only</label>
            </p>
            ${filtered.length === 0
                ? '<p class="census-status">No certificates match this filter.</p>'
                : `<table class="census-table">
                    <thead><tr><th>Machine</th><th>Subject</th><th>Expiry date</th><th>Days left</th><th>Bound to</th><th>Issuer</th></tr></thead>
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
    }
}
