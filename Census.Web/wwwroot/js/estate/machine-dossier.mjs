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

function bytes(value) {
    if (value === null || value === undefined) return '—';
    if (value >= 1_073_741_824) return `${(value / 1_073_741_824).toFixed(1)} GB`;
    if (value >= 1_048_576) return `${(value / 1_048_576).toFixed(0)} MB`;
    return `${(value / 1024).toFixed(0)} KB`;
}

/// The collector emits three raw runtime signals and deliberately picks no winner
/// (census-collector.md 8.6.5). The verdict is derived here, in one place, so it stays
/// revisable when the rule improves.
function runtimeBadge(app) {
    const core = app.runtime?.aspNetCore;
    if (core) {
        const model = core.hostingModel ? ` ${core.hostingModel}` : '';
        return { text: `ASP.NET Core${model}`, cls: 'est-badge-sdk' };
    }
    const version = app.poolManagedRuntimeVersion;
    if (version === '') return { text: 'No Managed Code', cls: '' };
    if (version === 'v2.0') return { text: '.NET Framework 2.0/3.5', cls: 'est-badge-warn' };
    if (version === 'v4.0') return { text: '.NET Framework 4.x', cls: '' };
    return { text: version || 'unknown', cls: '' };
}

function poolIdentity(app) {
    if (app.poolIdentityType === 'SpecificUser') return escapeHtml(app.poolUserName || 'SpecificUser');
    return escapeHtml(app.poolIdentityType || '—');
}

/// Anonymous and Windows are independently enableable and commonly both on - never collapsed
/// into a single "auth mode". The merge source rides along as a tooltip.
function authChips(auth) {
    if (!auth) return '<span class="est-muted">—</span>';
    const chips = [
        ['anon', auth.anonymousAuthentication],
        ['windows', auth.windowsAuthentication],
        ['basic', auth.basicAuthentication],
        ['digest', auth.digestAuthentication],
    ]
        .filter(([, setting]) => setting)
        .map(([label, setting]) => `<span class="est-badge${setting.enabled ? '' : ' est-badge-off'}" title="from ${escapeHtml(setting.source)}">${label}${setting.enabled ? '' : ' off'}</span>`)
        .join('');
    return chips || '<span class="est-muted">—</span>';
}

/// An unexpandable %VAR% means the path does not resolve - show it rather than hiding it.
function pathCell(path) {
    if (!path) return '<span class="est-muted">—</span>';
    if (path.expandable === false) {
        return `<span class="est-mono est-badge-warn" title="unexpanded variable">${escapeHtml(path.raw)}</span>`;
    }
    return `<span class="est-mono">${escapeHtml(path.expanded || path.raw)}</span>`;
}

function bindingLine(b) {
    const parsed = b.parsed ? `${b.ip}:${b.port}${b.hostHeader ? ' ' + b.hostHeader : ''}` : b.bindingInformation;
    return `
        <div class="est-binding">
            <span class="est-mono">${escapeHtml(b.protocol)}</span>
            <span class="est-mono">${escapeHtml(parsed)}</span>
            ${b.certificateHash ? `<span class="est-muted">cert ${escapeHtml(b.certificateHash.slice(0, 8))}…</span>` : ''}
        </div>`;
}

function logLine(logFile) {
    if (!logFile) return '';
    if (logFile.enabled === 'false') return '<div class="est-muted">Logging disabled</div>';
    const stats = logFile.stats ?? {};
    if (stats.enumerationStatus && stats.enumerationStatus !== 'ok') {
        return `<div class="est-muted">Logs: ${escapeHtml(stats.enumerationStatus)}${stats.reason ? ' — ' + escapeHtml(stats.reason) : ''}</div>`;
    }
    if (stats.exists === false) return '<div class="est-muted">Log directory absent</div>';
    return `<div class="est-muted">Logs: ${bytes(stats.totalBytes)} in ${stats.fileCount} files · newest ${date(stats.newestUtc)}${stats.truncated ? ' · truncated' : ''}</div>`;
}

const SQL_SYSTEM_DATABASES = ['master', 'model', 'msdb', 'tempdb'];

/// Shown but muted: four rows of noise in a list of twenty, except their file locations
/// genuinely matter.
function isSystemDatabase(name) {
    return SQL_SYSTEM_DATABASES.includes(String(name ?? '').toLowerCase());
}

/// The single rule the collector's permission stamp exists to enable: a filtered list must
/// never render as an empty one.
function sqlConnectedBlock(instance) {
    const status = instance.connectedStatus;
    if (status === 'insufficient-rights') {
        return `<p class="est-catfail">Insufficient rights<span class="est-muted"> — ${escapeHtml(instance.connectedReason)}</span></p>
                <p class="est-muted">The database list would be silently partial, so none is shown.</p>`;
    }
    if (status === 'skipped') {
        return `<p class="est-status">Not queried<span class="est-muted"> — ${escapeHtml(instance.connectedReason)}</span></p>`;
    }
    if (status && status !== 'ok') {
        return `<p class="est-catfail">${escapeHtml(status)}<span class="est-muted"> — ${escapeHtml(instance.connectedReason)}</span></p>`;
    }
    return null;
}

function sqlDatabaseFlags(db) {
    const flags = [];
    if (db.stateDesc && db.stateDesc !== 'ONLINE') flags.push(`<span class="est-badge est-badge-warn">${escapeHtml(db.stateDesc)}</span>`);
    if (db.isReadOnly) flags.push('<span class="est-badge">read-only</span>');
    if (db.isEncrypted) flags.push('<span class="est-badge">encrypted</span>');
    return flags.join('');
}

/// Files grouped by directory - the question is "where does data actually live on this box",
/// which a flat file list does not answer.
function sqlStorageBlock(files) {
    if (files.length === 0) return '';
    const byDirectory = new Map();
    for (const file of files) {
        const key = file.directory ?? '—';
        if (!byDirectory.has(key)) byDirectory.set(key, []);
        byDirectory.get(key).push(file);
    }
    const groups = [...byDirectory.entries()].sort((a, b) => b[1].length - a[1].length);
    return groups.map(([directory, group]) => {
        const total = group.reduce((sum, f) => sum + (f.sizeBytes ?? 0), 0);
        const unc = group.some((f) => f.isUnc);
        return `
        <div class="est-subcard">
            <div class="est-subcard-head">
                <span class="est-mono">${escapeHtml(directory)}${unc ? ' <span class="est-badge est-badge-warn">UNC</span>' : ''}</span>
                <span class="est-muted">${group.length} file${group.length === 1 ? '' : 's'} · ${bytes(total)}</span>
            </div>
            ${group.map((f) => `
                <div class="est-binding">
                    <span class="est-mono">${escapeHtml(f.databaseName)}</span>
                    <span class="est-muted">${escapeHtml(f.typeDesc)}</span>
                    <span class="est-mono">${escapeHtml(f.logicalName)}</span>
                    <span class="est-muted">${bytes(f.sizeBytes)}</span>
                </div>`).join('')}
        </div>`;
    }).join('');
}

function dependencyTarget(d) {
    if (d.kind === 'http') return `${d.scheme}://${d.host}${d.port ? ':' + d.port : ''}${d.path ?? ''}`;
    if (d.kind === 'file') return d.filePath ?? '—';
    return `${d.host ?? '?'}${d.instance ? '\\' + d.instance : ''}${d.port ? ',' + d.port : ''}${d.database ? ' / ' + d.database : ''}`;
}

/// Remote edges first and local ones muted: an app calling its own box is a dependency, but
/// it is not the one that matters for blast radius.
function dependencyRows(dependencies) {
    const sorted = [...dependencies].sort((a, b) => (a.isLocal === b.isLocal ? 0 : a.isLocal ? 1 : -1));
    return sorted.map((d) => `
        <tr class="${d.isLocal ? 'est-muted' : ''}">
            <td>${escapeHtml(d.siteName)}${escapeHtml(d.appPath)}</td>
            <td>${escapeHtml(d.name)}</td>
            <td class="est-mono">${escapeHtml(dependencyTarget(d))}</td>
            <td>
                <span class="est-badge">${escapeHtml(d.kind)}</span>
                ${d.isLocal ? '<span class="est-badge">local</span>' : ''}
                ${d.secretsPresent ? '<span class="est-badge est-badge-warn" title="password present in the source config">secret</span>' : ''}
                ${d.hadCredentials ? '<span class="est-badge est-badge-warn" title="credentials present in the URL">creds</span>' : ''}
                ${d.hadQuery ? '<span class="est-badge est-badge-warn" title="query string dropped at collection">query</span>' : ''}
                ${d.parseStatus === 'unrecognized' ? '<span class="est-badge est-badge-warn">unparsed</span>' : ''}
            </td>
        </tr>`).join('');
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
            ]))}
            ${category(envelope.updates, (d) => facts([
                ['Last update check', d.lastDetectSuccessTime ? escapeHtml(d.lastDetectSuccessTime) : '—'],
                ['Last update install', d.lastInstallSuccessTime ? escapeHtml(d.lastInstallSuccessTime) : '—'],
            ]))}
            ${category(os, (d) => facts([
                ['Last booted', dateTime(d.lastBootUpTime)],
                ['Pending reboot', d.pendingReboot
                    ? `<span class="est-catfail">yes — ${escapeHtml((d.pendingRebootReasons ?? []).join(', '))}</span>`
                    : 'no'],
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
            ${category(envelope.iis, (d) => {
                const sites = d.sites ?? [];
                const applications = d.applications ?? [];
                const appPools = d.appPools ?? [];
                const dependencies = d.dependencies ?? [];
                if (sites.length === 0) return '<p class="est-status">No sites.</p>';

                return `
                ${d.server ? `<div class="est-muted est-iis-server">IIS ${escapeHtml(d.server.versionString)} · config ${dateTime(d.server.configLastWriteUtc)} · ${escapeHtml((d.server.configSha256 ?? '').slice(0, 8))}…</div>` : ''}

                <h4 class="est-subhead">Applications</h4>
                <table class="est-table">
                    <thead><tr><th>Application</th><th>Runtime</th><th>App pool</th><th>Identity</th><th>Auth</th></tr></thead>
                    <tbody>${applications.map((app) => {
                        const badge = runtimeBadge(app);
                        const env = app.runtime?.aspNetCore?.environmentVariables?.ASPNETCORE_ENVIRONMENT;
                        return `
                        <tr>
                            <td>
                                ${escapeHtml(app.siteName)}<span class="est-mono">${escapeHtml(app.path)}</span>
                                <div class="est-app-path">${pathCell(app.physicalPath)}</div>
                            </td>
                            <td>
                                <span class="est-badge ${badge.cls}">${escapeHtml(badge.text)}</span>
                                ${env ? `<span class="est-badge est-badge-warn" title="ASPNETCORE_ENVIRONMENT">${escapeHtml(env)}</span>` : ''}
                            </td>
                            <td>${escapeHtml(app.applicationPool)}</td>
                            <td class="est-mono">${poolIdentity(app)}</td>
                            <td>${authChips(app.auth)}</td>
                        </tr>
                        ${app.status && app.status !== 'ok' ? `<tr><td colspan="5" class="est-catfail">${escapeHtml(app.status)}<span class="est-muted"> — ${escapeHtml(app.reason)}</span></td></tr>` : ''}`;
                    }).join('')}</tbody>
                </table>

                <h4 class="est-subhead">Sites</h4>
                ${sites.map((site) => `
                    <div class="est-subcard">
                        <div class="est-subcard-head">
                            <span>${escapeHtml(site.name)}</span>
                            <span class="est-muted">${site.serverAutoStart === 'false' ? 'autostart off' : ''}</span>
                        </div>
                        ${(site.bindings ?? []).map(bindingLine).join('')}
                        ${logLine(site.logFile)}
                    </div>`).join('')}

                <h4 class="est-subhead">Application pools</h4>
                <table class="est-table">
                    <thead><tr><th>Pool</th><th>Runtime</th><th>Pipeline</th><th>Identity</th></tr></thead>
                    <tbody>${appPools.map((p) => `
                        <tr>
                            <td>${escapeHtml(p.name)}</td>
                            <td class="est-mono">${p.managedRuntimeVersion === '' ? '<span class="est-muted">No Managed Code</span>' : escapeHtml(p.managedRuntimeVersion)}</td>
                            <td class="est-muted">${escapeHtml(p.managedPipelineMode)}</td>
                            <td class="est-mono">${p.identityType === 'SpecificUser' ? escapeHtml(p.userName) : escapeHtml(p.identityType)}</td>
                        </tr>`).join('')}</tbody>
                </table>

                <h4 class="est-subhead">Dependencies</h4>
                ${dependencies.length === 0 ? '<p class="est-status">None observed.</p>' : `
                <table class="est-table">
                    <thead><tr><th>From</th><th>Name</th><th>Target</th><th></th></tr></thead>
                    <tbody>${dependencyRows(dependencies)}</tbody>
                </table>`}`;
            })}
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
                        const sans = (c.sanDnsNames ?? []);
                        return `
                        <tr>
                            <td>
                                ${escapeHtml(c.subject)}
                                ${sans.length > 0 ? `<div class="est-sans">${sans.map((s) => `<span class="est-badge">${escapeHtml(s)}</span>`).join(' ')}</div>` : ''}
                            </td>
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
                        ...(i.permissions?.loginName
                            ? [['Census read as', `<span class="est-mono">${escapeHtml(i.permissions.loginName)}</span>${i.permissions.viewAnyDefinition ? '' : ' <span class="est-badge est-badge-warn">no VIEW ANY DEFINITION</span>'}`]]
                            : []),
                    ])}
                    ${(() => {
                        const blocked = sqlConnectedBlock(i);
                        if (blocked) return blocked;
                        const databases = i.databases ?? [];
                        const files = i.databaseFiles ?? [];
                        if (databases.length === 0) return '';
                        const userCount = databases.filter((d) => !isSystemDatabase(d.name)).length;
                        return `
                        <h4 class="est-subhead">Databases <span class="est-muted">${userCount} user + ${databases.length - userCount} system</span></h4>
                        <input class="est-filter" type="search" placeholder="Filter ${databases.length} databases…" data-ref="sql-filter">
                        <div class="est-apps-scroll">
                            <table class="est-table" data-ref="sql-table">
                                <thead><tr><th>Database</th><th>Recovery</th><th>Compat</th><th>Owner</th><th></th></tr></thead>
                                <tbody>${databases.map((d) => `
                                    <tr data-filter="${escapeHtml(String(d.name ?? '').toLowerCase())}" class="${isSystemDatabase(d.name) ? 'est-muted' : ''}">
                                        <td>${escapeHtml(d.name)}</td>
                                        <td class="est-muted">${escapeHtml(d.recoveryModelDesc)}</td>
                                        <td class="est-muted">${escapeHtml(d.compatibilityLevel)}</td>
                                        <td class="est-mono">${escapeHtml(d.owner)}</td>
                                        <td>${sqlDatabaseFlags(d)}</td>
                                    </tr>`).join('')}</tbody>
                            </table>
                        </div>
                        <h4 class="est-subhead">Storage <span class="est-muted">${files.length} files</span></h4>
                        ${sqlStorageBlock(files)}`;
                    })()}
                </div>`).join('') || '<p class="est-status">No instances.</p>')}
        </section>`;
}

export function bindDossier(container) {
    // Several filter/table pairs now - installed software, and one per SQL instance. The
    // early return on a missing pair is what lets a machine with no SQL bind cleanly.
    bindFilter(container.querySelector('[data-ref="app-filter"]'), container.querySelector('[data-ref="app-table"]'));

    const sqlFilters = container.querySelectorAll('[data-ref="sql-filter"]');
    const sqlTables = container.querySelectorAll('[data-ref="sql-table"]');
    sqlFilters.forEach((filter, index) => bindFilter(filter, sqlTables[index]));
}

function bindFilter(filter, table) {
    if (!filter || !table) return;
    filter.addEventListener('input', () => {
        const needle = filter.value.trim().toLowerCase();
        table.querySelectorAll('tbody tr').forEach((row) => {
            row.hidden = needle !== '' && !row.dataset.filter.includes(needle);
        });
    });
}
