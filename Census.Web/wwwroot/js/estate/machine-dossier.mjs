// Full-depth machine dossier for the details panel. The comparison stays high-level by
// design (census-web-v2-ux.md); this is where every collected detail lives, grouped.

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);
}

function date(iso) {
    return iso ? String(iso).slice(0, 10) : '—';
}

function dateTime(iso) {
    return iso ? String(iso).slice(0, 16).replace('T', ' ') : '—';
}

function gb(bytes) {
    return bytes === null || bytes === undefined ? '—' : (bytes / 1_073_741_824).toFixed(1);
}

function daysUntil(iso) {
    if (!iso) return null;
    return Math.floor((new Date(iso) - new Date()) / 86_400_000);
}

function facts(pairs) {
    const rows = pairs
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${v}</dd>`)
        .join('');
    return `<dl class="est-facts">${rows}</dl>`;
}

/// Renders a collector category honestly: data when ok, the status story otherwise.
function category(cat, renderData) {
    if (!cat) return '<p class="est-status">Not collected.</p>';
    if (cat.status === 'ok') return renderData(cat.data);
    if (cat.status === 'not-present') return `<p class="est-status">Not present<span class="est-muted"> — ${escapeHtml(cat.reason)}</span></p>`;
    return `<p class="est-catfail">${escapeHtml(cat.status)}<span class="est-muted"> — ${escapeHtml(cat.reason)}</span></p>`;
}

function stripRuntime(raw) {
    const match = raw.match(/^(\S+\s+\S+)/);
    return match ? match[1] : raw;
}

function stripSdk(raw) {
    const match = raw.match(/^(\S+)/);
    return match ? match[1] : raw;
}

export function dossierHtml(m, envelope) {
    const identity = envelope.identity;
    const os = envelope.os;
    const memory = envelope.memory;

    return `
        <section>
            <h3>Identity &amp; hardware</h3>
            ${category(identity, (d) => facts([
                ['Hardware', `${escapeHtml(d.manufacturer)} ${escapeHtml(d.model)}`],
                ['Platform', d.isVirtual ? `virtual (${escapeHtml((d.hypervisorSignals ?? []).join(', '))})` : 'physical'],
                ['CPU', `${d.cpuSockets} socket(s) · ${d.cpuCores} cores · ${d.cpuLogicalProcessors} logical`],
                ['RAM', category(memory, (mem) => `${mem.totalPhysicalMemoryGB} GB`)],
                ['Serial', `<span class="est-mono">${escapeHtml(d.biosSerialNumber)}</span>`],
                ['SMBIOS UUID', `<span class="est-mono">${escapeHtml(d.smbiosUuid)}</span>`],
                ['Machine GUID', `<span class="est-mono">${escapeHtml(d.machineGuid)}</span>`],
                ['Domain', escapeHtml(d.domain)],
            ]))}
        </section>

        <section>
            <h3>Operating system</h3>
            ${category(os, (d) => facts([
                ['Product', `${escapeHtml(d.productName)} <span class="est-muted">(${escapeHtml(d.editionId)}, ${escapeHtml(d.installationType)})</span>`],
                ['Build', `<span class="est-mono">${escapeHtml(d.currentBuild)}.${escapeHtml(d.ubr)}</span> <span class="est-muted">${escapeHtml(d.displayVersion ?? '')}</span>`],
                ['Architecture', escapeHtml(d.architecture)],
                ['Installed', date(d.installDate)],
                ['Last boot', dateTime(d.lastBootUpTime)],
                ['Pending reboot', d.pendingReboot
                    ? `<span class="est-catfail">yes — ${escapeHtml((d.pendingRebootReasons ?? []).join(', '))}</span>`
                    : 'no'],
            ]))}
            ${category(envelope.updates, (d) => facts([
                ['Last update check', d.lastDetectSuccessTime ? escapeHtml(d.lastDetectSuccessTime) : '—'],
                ['Last update install', d.lastInstallSuccessTime ? escapeHtml(d.lastInstallSuccessTime) : '—'],
            ]))}
        </section>

        <section>
            <h3>Drives</h3>
            ${category(envelope.drives, (d) => `
                <table class="est-table">
                    <thead><tr><th></th><th>Label</th><th>Size</th><th>Used</th><th>Free</th></tr></thead>
                    <tbody>${(d.drives ?? []).map((drive) => {
                        const pctFree = drive.percentFree;
                        const pctUsed = pctFree === null || pctFree === undefined ? null : 100 - pctFree;
                        const low = pctFree !== null && pctFree < 15;
                        return `
                        <tr>
                            <td class="est-mono">${escapeHtml(drive.driveLetter)}:</td>
                            <td>${escapeHtml(drive.label)} <span class="est-muted">${escapeHtml(drive.fileSystem)}</span></td>
                            <td>${gb(drive.sizeBytes)} GB</td>
                            <td class="est-bar-cell">
                                <span class="est-bar"><span class="est-bar-fill ${low ? 'est-bar-low' : ''}" style="width:${pctUsed ?? 0}%"></span></span>
                            </td>
                            <td class="${low ? 'est-catfail' : ''}">${pctFree ?? '—'}%</td>
                        </tr>`;
                    }).join('')}</tbody>
                </table>`)}
        </section>

        <section>
            <h3>.NET</h3>
            ${category(envelope.dotnet, (d) => `
                ${facts([['Framework release', d.frameworkReleaseId ? `<span class="est-mono">${d.frameworkReleaseId}</span>` : '—']])}
                <div class="est-chipline">${(d.coreRuntimes ?? []).map((r) => `<span class="est-badge">${escapeHtml(stripRuntime(r))}</span>`).join('') || '<span class="est-muted">no Core runtimes</span>'}</div>
                <div class="est-chipline">${(d.sdks ?? []).map((s) => `<span class="est-badge est-badge-sdk">SDK ${escapeHtml(stripSdk(s))}</span>`).join('') || '<span class="est-muted">no SDKs</span>'}</div>`)}
        </section>

        <section>
            <h3>Installed software</h3>
            ${category(envelope.apps, (d) => `
                <input class="est-filter" type="search" placeholder="Filter ${d.count} entries…" data-ref="app-filter">
                <div class="est-apps-scroll">
                    <table class="est-table" data-ref="app-table">
                        <thead><tr><th>Name</th><th>Version</th><th>Publisher</th><th>Scope</th></tr></thead>
                        <tbody>${(d.entries ?? []).map((a) => `
                            <tr data-filter="${escapeHtml(((a.displayName ?? '') + ' ' + (a.publisher ?? '')).toLowerCase())}">
                                <td>${escapeHtml(a.displayName)}</td>
                                <td class="est-mono">${escapeHtml(a.displayVersion) || '—'}</td>
                                <td class="est-muted">${escapeHtml(a.publisher) || '—'}</td>
                                <td class="est-muted">${a.hive === 'HKU' ? 'per-user' : escapeHtml(a.architecture)}</td>
                            </tr>`).join('')}</tbody>
                    </table>
                </div>`)}
        </section>

        <section>
            <h3>IIS</h3>
            ${category(envelope.iis, (d) => (d.sites ?? []).map((site) => `
                <div class="est-subcard">
                    <div class="est-subcard-head">
                        <span>${escapeHtml(site.name)}</span>
                        <span class="est-muted">${escapeHtml(site.state)}</span>
                    </div>
                    ${(site.bindings ?? []).map((b) => `
                        <div class="est-binding">
                            <span class="est-mono">${escapeHtml(b.protocol)}</span>
                            <span class="est-mono">${escapeHtml(b.bindingInformation)}</span>
                            ${b.certificateHash ? `<span class="est-muted">cert ${escapeHtml(b.certificateHash.slice(0, 8))}…</span>` : ''}
                        </div>`).join('')}
                </div>`).join('') || '<p class="est-status">No sites.</p>')}
        </section>

        <section>
            <h3>Certificates</h3>
            ${category(envelope.certificates, (d) => {
                const certs = d.certificates ?? [];
                if (certs.length === 0) return '<p class="est-status">No bound certificates.</p>';
                return `
                <table class="est-table">
                    <thead><tr><th>Subject</th><th>Expires</th><th>Days</th><th>Key</th><th>Bound to</th></tr></thead>
                    <tbody>${certs.map((c) => {
                        const days = daysUntil(c.notAfter);
                        const cls = days === null ? '' : days < 0 ? 'est-catfail' : days <= 30 ? 'est-catwarn' : '';
                        return `
                        <tr>
                            <td>${escapeHtml(c.subject)}</td>
                            <td>${date(c.notAfter)}</td>
                            <td class="${cls}">${days === null ? '—' : `${days}d`}</td>
                            <td class="est-muted">${c.keySize ?? '—'}</td>
                            <td>${(c.boundTo ?? []).map((b) => `<span class="est-badge">${escapeHtml(b)}</span>`).join(' ')}</td>
                        </tr>`;
                    }).join('')}</tbody>
                </table>`;
            })}
        </section>

        <section>
            <h3>SQL Server</h3>
            ${category(envelope.sqlServer, (d) => (d.instances ?? []).map((i) => `
                <div class="est-subcard">
                    <div class="est-subcard-head">
                        <span class="est-mono">${escapeHtml(i.instanceName)}</span>
                        <span class="est-muted">${escapeHtml(i.serviceState)}</span>
                    </div>
                    ${facts([
                        ['Edition', escapeHtml(i.edition)],
                        ['Version', `<span class="est-mono">${escapeHtml(i.version)}</span> <span class="est-muted">patched to</span> <span class="est-mono">${escapeHtml(i.patchLevel)}</span>`],
                        ['TCP port', i.tcpPort ? `<span class="est-mono">${escapeHtml(i.tcpPort)}</span>` : `dynamic (${escapeHtml(i.tcpDynamicPorts)})`],
                        ['Login mode', i.loginMode === 1 ? 'Windows only' : i.loginMode === 2 ? 'Mixed' : escapeHtml(i.loginMode)],
                        ['Collation', `<span class="est-mono">${escapeHtml(i.collation)}</span>`],
                        ['Service account', `<span class="est-mono">${escapeHtml(i.serviceAccount)}</span>`],
                        ['Agent', i.agentServiceAccount ? `<span class="est-mono">${escapeHtml(i.agentServiceAccount)}</span> <span class="est-muted">(${escapeHtml(i.agentServiceState)})</span>` : '—'],
                        ['Backups', `<span class="est-mono">${escapeHtml(i.backupDirectory)}</span>`],
                    ])}
                </div>`).join('') || '<p class="est-status">No instances.</p>')}
        </section>`;
}

export function bindDossier(container) {
    const filter = container.querySelector('[data-ref="app-filter"]');
    const table = container.querySelector('[data-ref="app-table"]');
    if (!filter || !table) return;
    filter.addEventListener('input', () => {
        const needle = filter.value.trim().toLowerCase();
        table.querySelectorAll('tbody tr').forEach((row) => {
            row.hidden = needle !== '' && !row.dataset.filter.includes(needle);
        });
    });
}
