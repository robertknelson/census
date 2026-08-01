import { fetchCertificates } from './estate-api.mjs';

// The renewal horizon at a glance. Grouped by thumbprint — a cert deployed across a farm
// is ONE renewal with many touchpoints — banded by urgency, each cert with a time-runway
// bar. Machine names pivot to dossiers.

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);
}

const RUNWAY_HORIZON_DAYS = 365;

const BANDS = [
    { key: 'expired', title: 'Expired', match: (d) => d < 0 },
    { key: 'soon', title: 'Next 30 days', match: (d) => d >= 0 && d <= 30 },
    { key: 'quarter', title: '31–90 days', match: (d) => d > 30 && d <= 90 },
    { key: 'later', title: 'Beyond 90 days', match: (d) => d > 90 },
];

export function certUrgencyClass(days) {
    if (days === null || days === undefined) return '';
    if (days < 0) return 'est-catfail';
    if (days <= 30) return 'est-catwarn';
    return '';
}

/** Group per-machine cert entries into one renewal item per thumbprint. */
function groupByThumbprint(entries) {
    const groups = new Map();
    for (const entry of entries) {
        let g = groups.get(entry.thumbprint);
        if (!g) {
            g = { ...entry, machines: [], boundTo: new Set() };
            groups.set(entry.thumbprint, g);
        }
        g.machines.push(entry.machine);
        (entry.boundTo ?? []).forEach((b) => g.boundTo.add(b));
    }
    return [...groups.values()].sort((a, b) => (a.daysUntilExpiry ?? Infinity) - (b.daysUntilExpiry ?? Infinity));
}

export class CertificatesPanel {
    constructor(onMachine) {
        this.onMachine = onMachine;
    }

    async mount(container) {
        this.container = container;
        container.innerHTML = '<p class="est-status">Reading the fleet’s certificates…</p>';
        let entries;
        try {
            entries = await fetchCertificates();
        } catch (err) {
            container.innerHTML = `<p class="est-status est-error">${escapeHtml(err.message)}</p>`;
            return;
        }
        this.render(groupByThumbprint(entries));
    }

    render(certs) {
        if (certs.length === 0) {
            this.container.innerHTML = '<p class="est-status">No bound certificates anywhere in the fleet.</p>';
            return;
        }

        const bands = BANDS.map((band) => {
            const members = certs.filter((c) => c.daysUntilExpiry !== null && band.match(c.daysUntilExpiry));
            if (members.length === 0) return '';
            return `
                <div class="est-certband est-certband-${band.key}">
                    <div class="est-certband-head">${escapeHtml(band.title)} <span class="est-muted">· ${members.length}</span></div>
                    ${members.map((c) => this.renderCert(c)).join('')}
                </div>`;
        }).join('');

        this.container.innerHTML = bands;

        this.container.querySelectorAll('[data-open-machine]').forEach((btn) => btn.addEventListener('click', () => {
            this.onMachine(btn.dataset.openMachine);
        }));
    }

    renderCert(c) {
        const days = c.daysUntilExpiry;
        const runwayPct = days === null ? 0 : Math.max(0, Math.min(100, (days / RUNWAY_HORIZON_DAYS) * 100));
        const daysLabel = days === null ? '—' : days < 0 ? `expired ${Math.abs(days)}d ago` : `${days}d left`;
        const sans = (c.sanDnsNames ?? []);

        return `
            <div class="est-cert">
                <div class="est-cert-when ${certUrgencyClass(days)}">
                    <span class="est-cert-date">${escapeHtml(String(c.notAfter ?? '').slice(0, 10)) || '—'}</span>
                    <span class="est-cert-days">${escapeHtml(daysLabel)}</span>
                </div>
                <div class="est-cert-body">
                    <div class="est-cert-subject">${escapeHtml(c.subject)}</div>
                    ${sans.length > 0 ? `<div class="est-sans">${sans.map((s) => `<span class="est-badge">${escapeHtml(s)}</span>`).join('')}</div>` : ''}
                    <div class="est-cert-meta">
                        <span class="est-muted">${escapeHtml(c.issuer)}</span>
                    </div>
                    <span class="est-runway"><span class="est-runway-fill ${days !== null && days < 0 ? 'est-runway-expired' : days !== null && days <= 30 ? 'est-runway-soon' : ''}" style="width:${runwayPct}%"></span></span>
                </div>
                <div class="est-cert-where">
                    ${[...c.boundTo].map((b) => `<span class="est-badge">${escapeHtml(b)}</span>`).join(' ')}
                    <div class="est-cert-machines">
                        ${c.machines.map((m) => `<button class="est-q-machine est-mono" data-open-machine="${escapeHtml(m)}">${escapeHtml(m)}</button>`).join('')}
                    </div>
                </div>
            </div>`;
    }
}
