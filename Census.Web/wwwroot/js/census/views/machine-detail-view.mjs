import { fetchMachineDates, fetchSnapshot, fetchDiff } from '../api.mjs';
import { escapeHtml } from '../html-utils.mjs';

const SECTION_TITLES = {
    apps: 'Installed software',
    dotnetCoreRuntimes: '.NET runtimes',
    dotnetSdks: '.NET SDKs',
    certificates: 'Certificates',
    drives: 'Drives',
    sqlInstances: 'SQL Server instances',
    iisSites: 'IIS sites',
    roles: 'Roles',
};

function certExpiryDays(notAfter) {
    if (!notAfter) return null;
    return Math.floor((new Date(notAfter) - new Date()) / 86_400_000);
}

export class MachineDetailView {
    constructor(container, machine) {
        this.container = container;
        this.machine = machine;
    }

    async render() {
        this.container.innerHTML = '<p class="census-status">Loading…</p>';
        try {
            this.dates = await fetchMachineDates(this.machine);
        } catch (err) {
            this.container.innerHTML = `<p class="census-status census-status-error">${escapeHtml(err.message)}</p>`;
            return;
        }

        if (this.dates.length === 0) {
            this.container.innerHTML = `
                <p><a href="#/machines">&larr; Machines</a></p>
                <p class="census-status">No snapshots collected yet for ${escapeHtml(this.machine)}.</p>`;
            return;
        }

        this.toDate = this.dates[this.dates.length - 1];
        this.fromDate = this.dates.length > 1 ? this.dates[this.dates.length - 2] : null;

        await this.renderContent();
    }

    async renderContent() {
        let snapshot;
        let diff = null;
        try {
            [snapshot, diff] = await Promise.all([
                fetchSnapshot(this.machine, this.toDate),
                this.fromDate ? fetchDiff(this.machine, this.fromDate, this.toDate) : Promise.resolve(null),
            ]);
        } catch (err) {
            this.container.innerHTML = `<p class="census-status census-status-error">${escapeHtml(err.message)}</p>`;
            return;
        }

        this.container.innerHTML = `
            <p><a href="#/machines">&larr; Machines</a></p>
            <div class="census-detail-header">
                <h2>${escapeHtml(this.machine)}</h2>
            </div>
            <div class="census-detail-grid">
                <section class="census-panel">${this.renderSnapshot(snapshot)}</section>
                <section class="census-panel">${this.renderCompareControls()}${this.renderDiff(diff)}</section>
            </div>`;

        this.container.querySelector('[data-ref="from-date"]').addEventListener('change', (e) => {
            this.fromDate = e.target.value;
            this.renderContent();
        });
        this.container.querySelector('[data-ref="to-date"]').addEventListener('change', (e) => {
            this.toDate = e.target.value;
            this.renderContent();
        });
    }

    renderSnapshot({ envelope, blacklistHits }) {
        const identity = envelope.identity?.data;
        const os = envelope.os?.data;
        const memory = envelope.memory?.data;
        const drives = envelope.drives?.data?.drives ?? [];
        const apps = envelope.apps?.data;
        const certs = envelope.certificates?.data?.certificates ?? [];
        const sqlInstances = envelope.sqlServer?.data?.instances ?? [];
        const iisSites = envelope.iis?.data?.sites ?? [];

        return `
            <h3>Snapshot — ${escapeHtml(this.toDate)}</h3>
            <p class="census-muted">Collected ${escapeHtml(envelope.collectedUtc)}</p>

            <p>${(envelope.roles ?? []).map((r) => `<span class="census-tag">${escapeHtml(r)}</span>`).join(' ') || '<span class="census-muted">no roles</span>'}</p>

            <dl class="census-facts">
                <dt>OS</dt><dd>${escapeHtml(os?.productName)} (${escapeHtml(os?.currentBuild)}.${escapeHtml(os?.ubr)}), ${escapeHtml(os?.installationType)}</dd>
                <dt>Pending reboot</dt><dd>${os?.pendingReboot ? `<span class="census-cell-warning">yes — ${escapeHtml((os.pendingRebootReasons ?? []).join(', '))}</span>` : 'no'}</dd>
                <dt>Hardware</dt><dd>${escapeHtml(identity?.manufacturer)} ${escapeHtml(identity?.model)} — ${identity?.isVirtual ? `virtual (${escapeHtml((identity.hypervisorSignals ?? []).join(', '))})` : 'physical'}</dd>
                <dt>CPU</dt><dd>${identity?.cpuSockets ?? '—'} socket(s), ${identity?.cpuCores ?? '—'} cores, ${identity?.cpuLogicalProcessors ?? '—'} logical</dd>
                <dt>Memory</dt><dd>${memory?.totalPhysicalMemoryGB ?? '—'} GB</dd>
            </dl>

            <h4>Drives</h4>
            <table class="census-table census-table-compact">
                <thead><tr><th>Letter</th><th>Label</th><th>% Free</th><th>Health</th></tr></thead>
                <tbody>${drives.map((d) => `
                    <tr>
                        <td>${escapeHtml(d.driveLetter)}</td>
                        <td>${escapeHtml(d.label)}</td>
                        <td class="${d.percentFree !== null && d.percentFree < 15 ? 'census-cell-critical' : ''}">${d.percentFree ?? '—'}%</td>
                        <td>${escapeHtml(d.healthStatus)}</td>
                    </tr>`).join('')}</tbody>
            </table>

            ${blacklistHits.length > 0 ? `
                <h4>Blacklist hits</h4>
                <ul class="census-hit-list">
                    ${blacklistHits.map((h) => `<li class="census-cell-${escapeHtml(h.severity)}">[${escapeHtml(h.severity)}] ${escapeHtml(h.matchedName)} ${escapeHtml(h.matchedVersion)} — ${escapeHtml(h.reason)}</li>`).join('')}
                </ul>` : '<h4>Blacklist hits</h4><p class="census-muted">none</p>'}

            ${certs.length > 0 ? `
                <h4>Certificates</h4>
                <table class="census-table census-table-compact">
                    <thead><tr><th>Subject</th><th>Expiry date</th><th>Days left</th><th>Bound to</th></tr></thead>
                    <tbody>${certs.map((c) => {
                        const days = certExpiryDays(c.notAfter);
                        const cls = days === null ? '' : days < 0 ? 'census-cell-critical' : days <= 30 ? 'census-cell-warning' : '';
                        const dateLabel = c.notAfter ? c.notAfter.slice(0, 10) : '—';
                        return `<tr><td>${escapeHtml(c.subject)}</td><td>${escapeHtml(dateLabel)}</td><td class="${cls}">${days === null ? '—' : `${days}d`}</td><td>${escapeHtml((c.boundTo ?? []).join(', '))}</td></tr>`;
                    }).join('')}</tbody>
                </table>` : ''}

            ${sqlInstances.length > 0 ? `
                <h4>SQL Server instances</h4>
                <table class="census-table census-table-compact">
                    <thead><tr><th>Instance</th><th>Edition</th><th>Patch level</th><th>State</th></tr></thead>
                    <tbody>${sqlInstances.map((i) => `<tr><td>${escapeHtml(i.instanceName)}</td><td>${escapeHtml(i.edition)}</td><td>${escapeHtml(i.patchLevel)}</td><td>${escapeHtml(i.serviceState)}</td></tr>`).join('')}</tbody>
                </table>` : ''}

            ${iisSites.length > 0 ? `
                <h4>IIS sites</h4>
                <table class="census-table census-table-compact">
                    <thead><tr><th>Site</th><th>State</th><th>Bindings</th></tr></thead>
                    <tbody>${iisSites.map((s) => `<tr><td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.state)}</td><td>${s.bindings?.length ?? 0}</td></tr>`).join('')}</tbody>
                </table>` : ''}

            <details>
                <summary>Installed software (${apps?.count ?? 0})</summary>
                <table class="census-table census-table-compact">
                    <thead><tr><th>Name</th><th>Version</th><th>Publisher</th></tr></thead>
                    <tbody>${(apps?.entries ?? []).map((a) => `<tr><td>${escapeHtml(a.displayName)}</td><td>${escapeHtml(a.displayVersion)}</td><td>${escapeHtml(a.publisher)}</td></tr>`).join('')}</tbody>
                </table>
            </details>`;
    }

    renderCompareControls() {
        const option = (d, selected) => `<option value="${escapeHtml(d)}" ${d === selected ? 'selected' : ''}>${escapeHtml(d)}</option>`;
        return `
            <h3>Compare</h3>
            <p>
                <label>From <select data-ref="from-date">${this.dates.map((d) => option(d, this.fromDate)).join('')}</select></label>
                <label>To <select data-ref="to-date">${this.dates.map((d) => option(d, this.toDate)).join('')}</select></label>
            </p>`;
    }

    renderDiff(diff) {
        if (!diff) return '<p class="census-status">Only one snapshot exists; nothing to compare yet.</p>';

        const scalarRows = diff.scalarChanges.map((c) => `<li><strong>${escapeHtml(c.field)}</strong>: ${escapeHtml(c.from)} &rarr; ${escapeHtml(c.to)}</li>`).join('');
        const sectionsHtml = diff.sections.map((s) => this.renderSection(s)).filter(Boolean).join('');

        if (!scalarRows && !sectionsHtml) {
            return '<p class="census-status">No changes between these two snapshots.</p>';
        }

        return `
            ${scalarRows ? `<ul class="census-diff-list">${scalarRows}</ul>` : ''}
            ${sectionsHtml}`;
    }

    renderSection(section) {
        if (section.added.length === 0 && section.removed.length === 0 && section.changed.length === 0) return '';

        const title = SECTION_TITLES[section.name] ?? section.name;
        const added = section.added.map((i) => `<li class="census-diff-added">+ ${escapeHtml(i.label)}</li>`).join('');
        const removed = section.removed.map((i) => `<li class="census-diff-removed">− ${escapeHtml(i.label)}</li>`).join('');
        const changed = section.changed.map((i) => `<li class="census-diff-changed">~ ${escapeHtml(i.label)}: ${i.changes.map((c) => `<strong>${escapeHtml(c.field)}</strong> ${escapeHtml(c.from)} &rarr; ${escapeHtml(c.to)}`).join(', ')}</li>`).join('');

        return `
            <h4>${escapeHtml(title)}</h4>
            <ul class="census-diff-list">${added}${removed}${changed}</ul>`;
    }
}
