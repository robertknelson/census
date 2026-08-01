import { fetchCanvas, fetchCompare, fetchSnapshot } from './estate-api.mjs';
import { glyphSvg } from './machine-glyphs.mjs';
import { dossierHtml, bindDossier } from './machine-dossier.mjs';
import { AssignmentEditor } from './assignment-editor.mjs';
import { FindingsQueue, severityDotClass } from './findings-queue.mjs';

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);
}

const CLASS_LABELS = {
    DatabaseServer: 'Database server',
    WebServer: 'Web server',
    DevServer: 'Dev server',
    DevLaptop: 'Dev laptop',
    Unclassified: 'Unclassified',
};

class EstatePage {
    init(config = {}) {
        this.root = document.getElementById(config.rootId);
        this.selectedOwners = new Set();
        this.selectedStages = new Set();     // empty = ALL
        this.selectedMachines = new Set();
        this.panel = null;
        this.queueState = { severities: new Set(), owners: new Set(), query: '' };

        this.readHash();
        this.renderSkeleton();
        this.load();
    }

    // --- state helpers --------------------------------------------------------------------

    readHash() {
        const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        (params.get('owners') ?? '').split(',').filter(Boolean).forEach((o) => this.selectedOwners.add(o));
        (params.get('stages') ?? '').split(',').filter(Boolean).forEach((s) => this.selectedStages.add(s));
    }

    writeHash() {
        const params = new URLSearchParams();
        if (this.selectedOwners.size) params.set('owners', [...this.selectedOwners].join(','));
        if (this.selectedStages.size) params.set('stages', [...this.selectedStages].join(','));
        const hash = params.toString();
        history.replaceState(null, '', hash ? `#${hash}` : window.location.pathname);
    }

    visibleMachines() {
        if (this.selectedOwners.size === 0) return [];
        return this.data.machines.filter((m) => m.owners.some((o) => this.selectedOwners.has(o)));
    }

    stageMatches(machine) {
        // A machine with no stage facet is never hidden by a stage filter — no stage data
        // is "unknown", and unknown is never rendered as absent.
        if (this.selectedStages.size === 0) return true;
        if (machine.stages.length === 0) return true;
        return machine.stages.some((s) => this.selectedStages.has(s));
    }

    // --- skeleton -------------------------------------------------------------------------

    renderSkeleton() {
        this.root.innerHTML = `
            <div class="est">
                <header class="est-header">
                    <div class="est-wordmark">Census <span>/ estate</span></div>
                    <div class="est-header-right">
                        <button class="est-btn est-findings-btn" data-ref="findings-btn" hidden></button>
                        <div class="est-legend" data-ref="legend"></div>
                    </div>
                </header>
                <div class="est-body">
                    <aside class="est-rail" data-ref="rail"></aside>
                    <main class="est-main">
                        <div class="est-stagebar" data-ref="stagebar"></div>
                        <div class="est-canvas" data-ref="canvas"></div>
                    </main>
                </div>
                <div class="est-actionbar" data-ref="actionbar" hidden></div>
                <div class="est-backdrop" data-ref="backdrop" hidden></div>
                <aside class="est-panel" data-ref="panel" hidden></aside>
            </div>`;

        this.railEl = this.root.querySelector('[data-ref="rail"]');
        this.stagebarEl = this.root.querySelector('[data-ref="stagebar"]');
        this.canvasEl = this.root.querySelector('[data-ref="canvas"]');
        this.actionbarEl = this.root.querySelector('[data-ref="actionbar"]');
        this.backdropEl = this.root.querySelector('[data-ref="backdrop"]');
        this.panelEl = this.root.querySelector('[data-ref="panel"]');

        this.root.querySelector('[data-ref="legend"]').innerHTML =
            ['DatabaseServer', 'WebServer', 'DevServer', 'DevLaptop']
                .map((c) => `<span class="est-legend-item">${glyphSvg(c, 15)} ${escapeHtml(CLASS_LABELS[c])}</span>`)
                .join('');

        this.findingsBtnEl = this.root.querySelector('[data-ref="findings-btn"]');
        this.findingsBtnEl.addEventListener('click', () => this.openFindings());

        this.backdropEl.addEventListener('click', () => this.closePanel());
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.panel) this.closePanel();
        });
    }

    async load() {
        this.canvasEl.innerHTML = '<p class="est-status">Mapping the estate…</p>';
        try {
            this.data = await fetchCanvas();
        } catch (err) {
            this.canvasEl.innerHTML = `<p class="est-status est-error">${escapeHtml(err.message)}</p>`;
            return;
        }
        // Drop hash-restored selections that no longer exist.
        const known = new Set(this.data.owners.map((o) => o.value));
        [...this.selectedOwners].filter((o) => !known.has(o)).forEach((o) => this.selectedOwners.delete(o));
        this.renderAll();
    }

    renderAll() {
        this.renderRail();
        this.renderStagebar();
        this.renderCanvas();
        this.renderActionbar();
        this.renderFindingsButton();
    }

    renderFindingsButton() {
        const total = this.data.machines.reduce((n, m) => n + m.findingCount, 0);
        const critical = this.data.machines.reduce((n, m) => n + m.findings.filter((f) => f.severity === 'critical').length, 0);
        this.findingsBtnEl.hidden = false;
        this.findingsBtnEl.classList.toggle('est-findings-btn-critical', critical > 0);
        this.findingsBtnEl.innerHTML = total === 0
            ? 'Findings · clear'
            : `Findings · <strong>${total}</strong>${critical > 0 ? ` <span class="est-crit">(${critical} critical)</span>` : ''}`;
    }

    // --- owner rail -----------------------------------------------------------------------

    renderRail() {
        const label = this.data.ownership?.label ?? 'Owner';
        const items = this.data.owners.map((o) => {
            const selected = this.selectedOwners.has(o.value);
            const unassigned = o.value === 'Unassigned';
            const status = o.criticalFindings > 0
                ? `<span class="est-dot est-dot-red"></span>${o.criticalFindings}`
                : o.totalFindings > 0
                    ? `<span class="est-dot est-dot-amber"></span>${o.totalFindings}`
                    : '<span class="est-dot est-dot-quiet"></span>';
            return `
                <button class="est-owner ${selected ? 'is-selected' : ''} ${unassigned ? 'est-owner-unassigned' : ''}"
                        data-owner="${escapeHtml(o.value)}">
                    <span class="est-owner-name">${escapeHtml(o.value)}</span>
                    <span class="est-owner-meta"><span class="est-num">${o.machineCount}</span> ${status}</span>
                </button>`;
        }).join('');

        this.railEl.innerHTML = `
            <div class="est-rail-label">${escapeHtml(label)}</div>
            ${items}`;

        this.railEl.querySelectorAll('[data-owner]').forEach((btn) => btn.addEventListener('click', () => {
            const owner = btn.dataset.owner;
            if (this.selectedOwners.has(owner)) this.selectedOwners.delete(owner);
            else this.selectedOwners.add(owner);
            this.pruneHiddenSelections();
            this.writeHash();
            this.renderAll();
        }));
    }

    // --- stage bar ------------------------------------------------------------------------

    renderStagebar() {
        if (this.selectedOwners.size === 0) {
            this.stagebarEl.innerHTML = '';
            return;
        }
        const stages = [...new Set(this.visibleMachines().flatMap((m) => m.stages))]
            .sort((a, b) => a.localeCompare(b));
        if (stages.length === 0) {
            this.stagebarEl.innerHTML = '';
            return;
        }

        const allActive = this.selectedStages.size === 0;
        this.stagebarEl.innerHTML = `
            <span class="est-stagebar-label">stage</span>
            <button class="est-chip ${allActive ? 'is-active' : ''}" data-stage="__all">all</button>
            ${stages.map((s) => `
                <button class="est-chip ${this.selectedStages.has(s) ? 'is-active' : ''}" data-stage="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join('')}`;

        this.stagebarEl.querySelectorAll('[data-stage]').forEach((btn) => btn.addEventListener('click', () => {
            const stage = btn.dataset.stage;
            if (stage === '__all') this.selectedStages.clear();
            else if (this.selectedStages.has(stage)) this.selectedStages.delete(stage);
            else this.selectedStages.add(stage);
            this.pruneHiddenSelections();
            this.writeHash();
            this.renderStagebar();
            this.renderCanvas();
            this.renderActionbar();
        }));
    }

    // --- canvas ---------------------------------------------------------------------------

    renderCanvas() {
        if (this.selectedOwners.size === 0) {
            const label = (this.data.ownership?.label ?? 'owner').toLowerCase();
            this.canvasEl.innerHTML = `
                <div class="est-empty">
                    <div class="est-empty-glyphs">${glyphSvg('WebServer', 44)}${glyphSvg('DatabaseServer', 44)}${glyphSvg('DevLaptop', 44)}</div>
                    <p>Select a ${escapeHtml(label)} to map its machines.</p>
                </div>`;
            return;
        }

        const sections = [...this.selectedOwners]
            .sort((a, b) => (a === 'Unassigned') - (b === 'Unassigned') || a.localeCompare(b))
            .map((owner) => {
                const machines = this.data.machines
                    .filter((m) => m.owners.includes(owner) && this.stageMatches(m));
                const critical = machines.reduce((n, m) => n + m.findings.filter((f) => f.severity === 'critical').length, 0);
                const meta = [`${machines.length} machine${machines.length === 1 ? '' : 's'}`];
                if (critical > 0) meta.push(`<span class="est-crit">${critical} critical</span>`);

                return `
                    <section class="est-section">
                        <header class="est-section-head">
                            <span class="est-section-name">${escapeHtml(owner)}</span>
                            <span class="est-section-meta">${meta.join(' · ')}</span>
                        </header>
                        <div class="est-grid">
                            ${machines.map((m) => this.renderTile(m)).join('') || '<p class="est-status">No machines match this stage filter.</p>'}
                        </div>
                    </section>`;
            }).join('');

        this.canvasEl.innerHTML = sections;

        this.canvasEl.querySelectorAll('[data-machine]').forEach((tile) => {
            tile.addEventListener('click', () => {
                const machine = tile.dataset.machine;
                if (this.selectedMachines.has(machine)) this.selectedMachines.delete(machine);
                else this.selectedMachines.add(machine);
                this.renderCanvas();
                this.renderActionbar();
            });
            tile.addEventListener('dblclick', () => {
                this.selectedMachines = new Set([tile.dataset.machine]);
                this.renderCanvas();
                this.renderActionbar();
                this.openDetails(tile.dataset.machine);
            });
        });
    }

    renderTile(m) {
        const selected = this.selectedMachines.has(m.machine);
        const badges = m.stages.map((s) => `<span class="est-badge">${escapeHtml(s)}</span>`).join('');
        const sub = !m.hasData
            ? '<span class="est-tile-sub est-tile-sub-ghost">no data</span>'
            : m.findingCount > 0
                ? `<span class="est-tile-sub">${m.findingCount} finding${m.findingCount === 1 ? '' : 's'}</span>`
                : '<span class="est-tile-sub est-tile-sub-quiet">clean</span>';
        const provenance = m.classSource === 'asserted'
            ? `<span class="est-asserted" title="Class asserted as ${escapeHtml(CLASS_LABELS[m.class] ?? m.class)} — observed: ${escapeHtml(m.observedRoles.join(', ') || 'none')}"></span>`
            : '';

        return `
            <button class="est-tile posture-${escapeHtml(m.posture)} ${m.hasData ? '' : 'est-tile-ghost'} ${selected ? 'is-selected' : ''}"
                    data-machine="${escapeHtml(m.machine)}"
                    title="${escapeHtml(CLASS_LABELS[m.class] ?? m.class)}${m.classSource === 'asserted' ? ' (asserted)' : ''}">
                <span class="est-ring">${glyphSvg(m.class, 30)}${provenance}</span>
                <span class="est-tile-name">${escapeHtml(m.machine)}</span>
                <span class="est-tile-badges">${badges}</span>
                ${sub}
            </button>`;
    }

    pruneHiddenSelections() {
        const visible = new Set(this.visibleMachines().filter((m) => this.stageMatches(m)).map((m) => m.machine));
        [...this.selectedMachines].filter((m) => !visible.has(m)).forEach((m) => this.selectedMachines.delete(m));
    }

    // --- action bar -----------------------------------------------------------------------

    renderActionbar() {
        const count = this.selectedMachines.size;
        if (count === 0) {
            this.actionbarEl.hidden = true;
            return;
        }
        this.actionbarEl.hidden = false;
        const names = [...this.selectedMachines];
        this.actionbarEl.innerHTML = `
            <span class="est-actionbar-label">${count === 1 ? escapeHtml(names[0]) : `${count} machines`} selected</span>
            ${count === 1 ? '<button class="est-btn est-btn-primary" data-act="details">Details</button>' : ''}
            ${count >= 2 ? '<button class="est-btn est-btn-primary" data-act="compare">Compare</button>' : ''}
            <button class="est-btn" data-act="clear">Clear</button>`;

        this.actionbarEl.querySelector('[data-act="clear"]').addEventListener('click', () => {
            this.selectedMachines.clear();
            this.renderCanvas();
            this.renderActionbar();
        });
        this.actionbarEl.querySelector('[data-act="details"]')?.addEventListener('click', () => this.openDetails(names[0]));
        this.actionbarEl.querySelector('[data-act="compare"]')?.addEventListener('click', () => this.openCompare(names));
    }

    // --- slide-in panel -------------------------------------------------------------------

    openPanel() {
        this.backdropEl.hidden = false;
        this.panelEl.hidden = false;
        requestAnimationFrame(() => this.panelEl.classList.add('is-open'));
    }

    closePanel() {
        this.panel = null;
        this.panelEl.classList.remove('is-open');
        this.backdropEl.hidden = true;
        setTimeout(() => { if (!this.panel) this.panelEl.hidden = true; }, 260);
    }

    panelShell(title, subtitle, bodyHtml) {
        this.panelEl.innerHTML = `
            <header class="est-panel-head">
                <div>
                    <div class="est-panel-title">${title}</div>
                    <div class="est-panel-sub">${subtitle}</div>
                </div>
                <button class="est-btn est-panel-close" data-act="close" aria-label="Close">✕</button>
            </header>
            <div class="est-panel-body">${bodyHtml}</div>`;
        this.panelEl.querySelector('[data-act="close"]').addEventListener('click', () => this.closePanel());
    }

    openFindings() {
        this.panel = { type: 'findings' };
        this.panelShell(
            'Findings queue',
            'Raw truth, recomputed every read — worst first. Machine names open dossiers.',
            '<div data-ref="queue"></div>');
        this.openPanel();

        new FindingsQueue(
            this.data.machines,
            this.data.ownership,
            this.queueState,
            (machine) => this.openDetails(machine),
        ).mount(this.panelEl.querySelector('[data-ref="queue"]'));
    }

    async openDetails(machineName) {
        const m = this.data.machines.find((x) => x.machine === machineName);
        if (!m) return;
        this.panel = { type: 'details', machine: machineName };

        const classLabel = CLASS_LABELS[m.class] ?? m.class;
        const provenance = m.classSource === 'asserted'
            ? `<span class="est-prov">asserted</span> <span class="est-muted">observed: ${escapeHtml(m.observedRoles.join(', ') || 'none')}</span>`
            : '<span class="est-muted">observed</span>';

        const findings = m.findings.length === 0
            ? '<p class="est-status">No findings. Clean as collected.</p>'
            : `<ul class="est-findings">${m.findings.map((f) => `
                <li>
                    <span class="est-dot ${severityDotClass(f.severity)}"></span>
                    <span class="est-finding-body">
                        <span class="est-finding-title">${escapeHtml(f.title)}</span>
                        ${f.detail ? `<span class="est-finding-detail">${escapeHtml(f.detail)}</span>` : ''}
                    </span>
                    <span class="est-finding-kind">${escapeHtml(f.kind)}</span>
                </li>`).join('')}</ul>`;

        const facetKeys = Object.keys(m.facets);
        const facets = facetKeys.length === 0
            ? '<p class="est-status">Unassigned — this machine carries no facets.</p>'
            : facetKeys.map((key) => `
                <div class="est-facet-row">
                    <span class="est-facet-key">${escapeHtml(key)}</span>
                    ${m.facets[key].map((v) => `<span class="est-badge">${escapeHtml(v)}</span>`).join('')}
                </div>`).join('');

        const dossierPlaceholder = m.hasData
            ? '<div data-ref="dossier"><p class="est-status">Loading full snapshot…</p></div>'
            : `<section><h3>Snapshot</h3><p class="est-status">Never collected — nothing beyond the assignment is known about this machine.</p></section>`;

        this.panelShell(
            `${glyphSvg(m.class, 22)} <span class="est-mono">${escapeHtml(m.machine)}</span>`,
            `${escapeHtml(classLabel)} · ${provenance}${m.latestDate ? ` · <span class="est-muted">collected ${escapeHtml(m.latestDate)}</span>` : ''}`,
            `
            <section>
                <h3>Findings</h3>
                ${findings}
            </section>
            <section>
                <h3>Assignment <button class="est-btn est-btn-sm" data-ref="edit-assignment">Edit</button></h3>
                <div data-ref="assignment-body">${facets}</div>
            </section>
            ${dossierPlaceholder}`);
        this.openPanel();

        this.panelEl.querySelector('[data-ref="edit-assignment"]').addEventListener('click', () => {
            const body = this.panelEl.querySelector('[data-ref="assignment-body"]');
            new AssignmentEditor(
                m,
                this.data.machines,
                async () => {
                    this.data = await fetchCanvas();
                    this.renderAll();
                    this.openDetails(machineName);
                },
                () => this.openDetails(machineName),
            ).mount(body);
        });

        if (!m.hasData) return;
        let snapshot;
        try {
            snapshot = await fetchSnapshot(m.machine, m.latestDate);
        } catch (err) {
            const slot = this.panelEl.querySelector('[data-ref="dossier"]');
            if (slot) slot.innerHTML = `<p class="est-status est-error">${escapeHtml(err.message)}</p>`;
            return;
        }
        if (this.panel?.type !== 'details' || this.panel.machine !== machineName) return;

        const slot = this.panelEl.querySelector('[data-ref="dossier"]');
        if (!slot) return;
        slot.innerHTML = dossierHtml(m, snapshot.envelope);
        bindDossier(slot);
    }

    async openCompare(machineNames) {
        this.panel = { type: 'compare', machines: machineNames };
        this.panelShell(
            `Compare <span class="est-mono">${machineNames.map(escapeHtml).join(' · ')}</span>`,
            'Differing rows only — volatile fields never count against equality',
            '<p class="est-status">Comparing…</p>');
        this.openPanel();

        let result;
        try {
            result = await fetchCompare(machineNames, []);
        } catch (err) {
            this.panelEl.querySelector('.est-panel-body').innerHTML =
                `<p class="est-status est-error">${escapeHtml(err.message)}</p>`;
            return;
        }
        if (this.panel?.type !== 'compare') return;

        const header = `<tr><th></th>${result.machines.map((m) => `<th class="est-mono">${escapeHtml(m)}</th>`).join('')}</tr>`;
        const groups = result.groups.map((g) => {
            const verdict = g.identical
                ? '<span class="est-verdict est-verdict-ok">identical</span>'
                : `<span class="est-verdict est-verdict-diff">${g.differCount} difference${g.differCount === 1 ? '' : 's'}</span>`;
            const rows = g.rows
                .filter((r) => r.differs && !r.volatile)
                .map((r) => `
                    <tr>
                        <td class="est-row-label">${escapeHtml(r.label)}</td>
                        ${r.values.map((v) => `<td>${v === null ? '<span class="est-muted">—</span>' : escapeHtml(v)}</td>`).join('')}
                    </tr>`).join('');
            return `
                <tbody>
                    <tr class="est-group-row"><td colspan="${result.machines.length + 1}">${escapeHtml(g.title)} ${verdict}</td></tr>
                    ${rows}
                </tbody>`;
        }).join('');

        this.panelEl.querySelector('.est-panel-body').innerHTML = `
            <div class="est-compare-scroll">
                <table class="est-compare"><thead>${header}</thead>${groups}</table>
            </div>`;
    }
}

export default new EstatePage();
