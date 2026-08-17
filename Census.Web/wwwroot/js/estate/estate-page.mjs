import { fetchCanvas, fetchCompare, fetchSnapshot, fetchMachineDates, fetchCertificates, fetchFleetDates, fetchEntityTags } from './estate-api.mjs';
import { glyphSvg } from './machine-glyphs.mjs';
import { dossierHtml, bindDossier } from './machine-dossier.mjs';
import { AssignmentEditor } from './assignment-editor.mjs';
import { FindingsQueue, severityDotClass } from './findings-queue.mjs';
import { MachineHistory } from './machine-history.mjs';
import { BlacklistEditor } from './blacklist-editor.mjs';
import { BaselinesEditor } from './baselines-editor.mjs';
import { MachineBaseline } from './machine-baseline.mjs';
import { CertificatesPanel, certUrgencyClass } from './certificates-panel.mjs';
import { ChangesFeed } from './changes-feed.mjs';
import { SoftwarePanel } from './software-panel.mjs';
import { HostingPanel } from './hosting-panel.mjs';
import { TriagePanel } from './triage-panel.mjs';
import { BlastRadiusPanel } from './blast-radius-panel.mjs';

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
        this.selectedClasses = new Set();    // empty = ALL; non-empty widens to fleet scope when no owner is picked
        this.selectedMachines = new Set();
        this.panel = null;
        this.asOf = null;                    // null = current; else a collected yyyy-MM-dd
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
        (params.get('classes') ?? '').split(',').filter(Boolean).forEach((c) => this.selectedClasses.add(c));
        this.asOf = params.get('asOf') || null;
    }

    writeHash() {
        const params = new URLSearchParams();
        if (this.selectedOwners.size) params.set('owners', [...this.selectedOwners].join(','));
        if (this.selectedStages.size) params.set('stages', [...this.selectedStages].join(','));
        if (this.selectedClasses.size) params.set('classes', [...this.selectedClasses].join(','));
        if (this.asOf) params.set('asOf', this.asOf);
        const hash = params.toString();
        history.replaceState(null, '', hash ? `#${hash}` : window.location.pathname);
    }

    classMatches(machine) {
        return this.selectedClasses.size === 0 || this.selectedClasses.has(machine.class);
    }

    visibleMachines() {
        // Owner selection scopes the canvas; a class selection with no owner widens the
        // scope to the whole fleet — "all database servers regardless of team/stage."
        let base;
        if (this.selectedOwners.size > 0) {
            base = this.data.machines.filter((m) => m.owners.some((o) => this.selectedOwners.has(o)));
        } else if (this.selectedClasses.size > 0) {
            base = this.data.machines;
        } else {
            return [];
        }
        return base.filter((m) => this.classMatches(m));
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
                    <div class="est-legend" data-ref="legend"></div>
                    <div class="est-header-actions">
                        <label class="est-asof"><span>as of</span><input type="date" class="est-edit-input" data-ref="asof-input"></label>
                        <button class="est-btn est-findings-btn" data-ref="findings-btn" hidden></button>
                        <button class="est-btn" data-ref="triage-btn" hidden></button>
                        <button class="est-btn" data-ref="changes-btn">Changes</button>
                        <button class="est-btn" data-ref="software-btn">Software</button>
                        <button class="est-btn" data-ref="hosting-btn">Hosting</button>
                        <button class="est-btn" data-ref="certs-btn">Certificates</button>
                        <button class="est-btn" data-ref="baselines-btn">Baselines</button>
                        <button class="est-btn" data-ref="blacklist-btn">Blacklist</button>
                    </div>
                </header>
                <div class="est-asof-banner" data-ref="asof-banner" hidden></div>
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

        // Legend doubles as a fleet-wide class filter: with no owner selected, picking a
        // class shows every machine of that class across all owners.
        this.legendEl = this.root.querySelector('[data-ref="legend"]');
        this.legendEl.innerHTML =
            ['DatabaseServer', 'WebServer', 'DevServer', 'DevLaptop']
                .map((c) => `<button class="est-legend-item" data-class="${escapeHtml(c)}" title="Show all ${escapeHtml(CLASS_LABELS[c])}s">${glyphSvg(c, 15)} ${escapeHtml(CLASS_LABELS[c])}</button>`)
                .join('');
        this.legendEl.querySelectorAll('[data-class]').forEach((btn) => btn.addEventListener('click', () => {
            const cls = btn.dataset.class;
            if (this.selectedClasses.has(cls)) this.selectedClasses.delete(cls);
            else this.selectedClasses.add(cls);
            this.pruneHiddenSelections();
            this.writeHash();
            this.renderAll();
        }));

        this.findingsBtnEl = this.root.querySelector('[data-ref="findings-btn"]');
        this.findingsBtnEl.addEventListener('click', () => this.openFindings());

        this.triageBtnEl = this.root.querySelector('[data-ref="triage-btn"]');
        this.triageBtnEl.addEventListener('click', () => this.openTriage());

        this.root.querySelector('[data-ref="blacklist-btn"]').addEventListener('click', () => this.openBlacklist());
        this.root.querySelector('[data-ref="baselines-btn"]').addEventListener('click', () => this.openBaselines());

        this.asofInputEl = this.root.querySelector('[data-ref="asof-input"]');
        this.asofBannerEl = this.root.querySelector('[data-ref="asof-banner"]');
        this.asofInputEl.addEventListener('change', (e) => {
            const value = e.target.value;
            // Today (or empty) means "current" — the live view, not a pinned day.
            this.setAsOf(!value || value >= this.todayIso() ? null : value);
        });

        this.certsBtnEl = this.root.querySelector('[data-ref="certs-btn"]');
        this.certsBtnEl.addEventListener('click', () => this.openCertificates());

        this.root.querySelector('[data-ref="changes-btn"]').addEventListener('click', () => this.openChanges());
        this.root.querySelector('[data-ref="software-btn"]').addEventListener('click', () => this.openSoftware());
        this.softwareState = { query: '' };
        this.root.querySelector('[data-ref="hosting-btn"]').addEventListener('click', () => this.openHosting());
        this.hostingState = { view: 'applications', query: '' };

        this.backdropEl.addEventListener('click', () => this.closePanel());
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.panel) this.closePanel();
        });
    }

    async load() {
        this.canvasEl.innerHTML = '<p class="est-status">Mapping the estate…</p>';
        try {
            [this.data, this.fleetDates] = await Promise.all([fetchCanvas(this.asOf), fetchFleetDates()]);
        } catch (err) {
            this.canvasEl.innerHTML = `<p class="est-status est-error">${escapeHtml(err.message)}</p>`;
            return;
        }

        // Any date resolves to the newest snapshot on-or-before it, so the calendar is
        // bounded, not enumerated: from the first collected day up to today.
        const oldest = this.fleetDates[this.fleetDates.length - 1];
        if (oldest) this.asofInputEl.min = oldest;
        this.asofInputEl.max = this.todayIso();
        this.asofInputEl.value = this.asOf ?? this.todayIso();
        if (this.asOf && oldest && this.asOf < oldest) {
            this.asOf = null;
            this.asofInputEl.value = this.todayIso();
            this.writeHash();
        }
        // Drop hash-restored selections that no longer exist.
        const known = new Set(this.data.owners.map((o) => o.value));
        [...this.selectedOwners].filter((o) => !known.has(o)).forEach((o) => this.selectedOwners.delete(o));
        this.renderAll();

        // Cert horizon only moves with collection, not with edits — one fetch per load.
        fetchCertificates(this.asOf).then((certs) => {
            const soonest = certs
                .map((c) => c.daysUntilExpiry)
                .filter((d) => d !== null)
                .sort((a, b) => a - b)[0];
            if (soonest === undefined) return;
            const label = soonest < 0 ? `expired ${Math.abs(soonest)}d ago` : `next ${soonest}d`;
            this.certsBtnEl.innerHTML = `Certificates · <span class="${certUrgencyClass(soonest)}">${label}</span>`;
        }).catch(() => { /* button stays plain */ });
    }

    renderAll() {
        this.renderRail();
        this.renderStagebar();
        this.renderCanvas();
        this.renderActionbar();
        this.renderFindingsButton();
        this.renderTriageButton();
        this.renderAsOfBanner();
        this.legendEl.querySelectorAll('[data-class]').forEach((btn) => {
            btn.classList.toggle('is-active', this.selectedClasses.has(btn.dataset.class));
        });
        // Changes and Software read the current fleet only — honest to disable in the past.
        // Triage edits the current config, so it is current-only too.
        for (const ref of ['changes-btn', 'software-btn', 'hosting-btn', 'triage-btn']) {
            const btn = this.root.querySelector(`[data-ref="${ref}"]`);
            btn.disabled = this.asOf !== null;
            btn.title = this.asOf !== null ? 'Available on the current view only' : '';
        }
    }

    todayIso() {
        return new Date().toISOString().slice(0, 10);
    }

    setAsOf(value) {
        this.asOf = value;
        this.writeHash();
        this.load();
    }

    renderAsOfBanner() {
        if (!this.asOf) {
            this.asofBannerEl.hidden = true;
            return;
        }
        this.asofBannerEl.hidden = false;
        this.asofBannerEl.innerHTML = `
            Viewing the estate as of <strong>${escapeHtml(this.asOf)}</strong> — each machine shows its newest
            snapshot on or before that day, judged under today's assignments and blacklist rules.
            <button class="est-btn est-btn-sm" data-ref="asof-reset">Return to current</button>`;
        this.asofBannerEl.querySelector('[data-ref="asof-reset"]').addEventListener('click', () => this.setAsOf(null));
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

    renderTriageButton() {
        const total = this.data.machines.reduce((n, m) => n + (m.unclassifiedEntityCount ?? 0), 0);
        this.triageBtnEl.hidden = false;
        this.triageBtnEl.innerHTML = total === 0
            ? 'Triage · clear'
            : `Triage · <strong>${total}</strong>`;
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
        if (this.selectedOwners.size === 0 && this.selectedClasses.size === 0) {
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
        const ownerScoped = this.selectedOwners.size > 0;
        const classScoped = this.selectedClasses.size > 0;

        if (!ownerScoped && !classScoped) {
            const label = (this.data.ownership?.label ?? 'owner').toLowerCase();
            this.canvasEl.innerHTML = `
                <div class="est-empty">
                    <div class="est-empty-glyphs">${glyphSvg('WebServer', 44)}${glyphSvg('DatabaseServer', 44)}${glyphSvg('DevLaptop', 44)}</div>
                    <p>Select a ${escapeHtml(label)} on the left — or a machine class above — to map the estate.</p>
                </div>`;
            return;
        }

        // Owner-scoped: render the chosen owners (even when a stage/class filter empties
        // one). Class-only: sweep every owner, skipping the ones with no matches.
        const owners = ownerScoped
            ? [...this.selectedOwners]
            : this.data.owners.map((o) => o.value);

        const sections = owners
            .sort((a, b) => (a === 'Unassigned') - (b === 'Unassigned') || a.localeCompare(b))
            .map((owner) => {
                const machines = this.data.machines
                    .filter((m) => m.owners.includes(owner) && this.stageMatches(m) && this.classMatches(m));
                if (machines.length === 0 && !ownerScoped) return '';
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
                            ${machines.map((m) => this.renderTile(m)).join('') || '<p class="est-status">No machines match these filters.</p>'}
                        </div>
                    </section>`;
            }).join('');

        this.canvasEl.innerHTML = sections
            || '<div class="est-empty"><p>No machines of the selected class anywhere in the fleet.</p></div>';

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
        // Derived stages come from entity tags and never merge into the asserted ones —
        // "someone typed this onto the machine" and "rolled up from what it hosts" must
        // stay visually distinct. The tooltip is the derivation.
        const assertedStages = new Set(m.stages.map((s) => s.toLowerCase()));
        const derivedBadges = (m.entityRollup?.stages ?? [])
            .filter((s) => !assertedStages.has(s.toLowerCase()))
            .map((s) => {
                const from = (m.entityRollup.derivedFrom ?? [])
                    .filter((r) => (r.stage ?? []).some((v) => v.toLowerCase() === s.toLowerCase()))
                    .map((r) => `${r.container} · ${r.name}`);
                return `<span class="est-badge est-badge-derived" title="derived from: ${escapeHtml(from.join(', '))}">${escapeHtml(s)}</span>`;
            }).join('');
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
                <span class="est-tile-badges">${badges}${derivedBadges}</span>
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
            ${count === 1 && !this.asOf ? '<button class="est-btn" data-act="blast">Blast radius</button>' : ''}
            ${count >= 2 ? '<button class="est-btn est-btn-primary" data-act="compare">Compare</button>' : ''}
            <button class="est-btn" data-act="clear">Clear</button>`;

        this.actionbarEl.querySelector('[data-act="clear"]').addEventListener('click', () => {
            this.selectedMachines.clear();
            this.renderCanvas();
            this.renderActionbar();
        });
        this.actionbarEl.querySelector('[data-act="details"]')?.addEventListener('click', () => this.openDetails(names[0]));
        this.actionbarEl.querySelector('[data-act="blast"]')?.addEventListener('click', () => this.openBlastRadius(names[0]));
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
        this.panelEl.style.width = '';
        this.panelEl.innerHTML = `
            <div class="est-panel-grip" data-ref="grip" title="Drag to resize"></div>
            <header class="est-panel-head">
                <div>
                    <div class="est-panel-title">${title}</div>
                    <div class="est-panel-sub">${subtitle}</div>
                </div>
                <button class="est-btn est-panel-close" data-act="close" aria-label="Close">✕</button>
            </header>
            <div class="est-panel-body">${bodyHtml}</div>`;
        this.panelEl.querySelector('[data-act="close"]').addEventListener('click', () => this.closePanel());

        const grip = this.panelEl.querySelector('[data-ref="grip"]');
        grip.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            grip.setPointerCapture(e.pointerId);
            this.panelEl.classList.add('est-panel-dragging');
            const move = (ev) => {
                const width = Math.min(Math.max(window.innerWidth - ev.clientX, 480), window.innerWidth * 0.95);
                this.panelEl.style.width = `${width}px`;
            };
            const up = () => {
                this.panelEl.classList.remove('est-panel-dragging');
                grip.removeEventListener('pointermove', move);
                grip.removeEventListener('pointerup', up);
            };
            grip.addEventListener('pointermove', move);
            grip.addEventListener('pointerup', up);
        });
    }

    openSoftware() {
        this.panel = { type: 'software' };
        this.panelShell(
            'Software inventory',
            'The fleet pivoted by application — every machine carrying it, version spread visible. Machine names open dossiers.',
            '<div data-ref="software"></div>');
        this.openPanel();

        new SoftwarePanel(this.softwareState, (machine) => this.openDetails(machine))
            .mount(this.panelEl.querySelector('[data-ref="software"]'));
    }

    openHosting() {
        this.panel = { type: 'hosting' };
        this.panelShell(
            'Hosting',
            'The fleet pivoted by what it hosts — where an application runs, where a database lives, and what depends on what. Machine names open dossiers.',
            '<div data-ref="hosting"></div>');
        this.openPanel();

        new HostingPanel(this.hostingState, (machine) => this.openDetails(machine))
            .mount(this.panelEl.querySelector('[data-ref="hosting"]'));
    }

    openChanges() {
        this.panel = { type: 'changes' };
        this.panelShell(
            'Fleet changes',
            'Latest collection vs the one before, for every machine with both. Machine names open dossiers.',
            '<div data-ref="changes"></div>');
        this.openPanel();

        new ChangesFeed((machine) => this.openDetails(machine))
            .mount(this.panelEl.querySelector('[data-ref="changes"]'));
    }

    openCertificates() {
        this.panel = { type: 'certificates' };
        this.panelShell(
            'Certificate renewals',
            'One row per certificate across the fleet — a cert on many machines is one renewal. Soonest first.',
            '<div data-ref="certs"></div>');
        this.openPanel();

        new CertificatesPanel(this.asOf, (machine) => this.openDetails(machine))
            .mount(this.panelEl.querySelector('[data-ref="certs"]'));
    }

    openBlacklist() {
        this.panel = { type: 'blacklist' };
        this.panelShell(
            'Blacklist rules',
            'Edits write straight back to config/blacklist.json and take effect on the next render. Inactive rules are kept, not evaluated.',
            '<div data-ref="blacklist"></div>');
        this.openPanel();

        new BlacklistEditor(async () => {
            // Hits may have appeared or vanished — refresh the whole substrate.
            this.data = await fetchCanvas();
            this.renderAll();
        }).mount(this.panelEl.querySelector('[data-ref="blacklist"]'));
    }

    openBaselines() {
        this.panel = { type: 'baselines' };
        this.panelShell(
            'Approved baselines',
            'The inverse of the blacklist: what is approved, for which machines. Blessing happens from a machine dossier; edits write straight back to config/baselines.json.',
            '<div data-ref="baselines"></div>');
        this.openPanel();

        new BaselinesEditor(this.data.machines, async () => {
            this.data = await fetchCanvas(this.asOf);
            this.renderAll();
        }).mount(this.panelEl.querySelector('[data-ref="baselines"]'));
    }

    openTriage() {
        this.panel = { type: 'triage' };
        this.panelShell(
            'Triage',
            'The unclassified pile — everything observed that nobody has explained yet. Assertions write straight back to config/entity-tags.json; machine names open dossiers.',
            '<div data-ref="triage"></div>');
        this.openPanel();

        new TriagePanel(async () => {
            // Tags moved: rollups, chips, the pile count and findings all shift with them.
            this.data = await fetchCanvas(this.asOf);
            this.renderAll();
        }, (machine) => this.openDetails(machine))
            .mount(this.panelEl.querySelector('[data-ref="triage"]'));
    }

    openBlastRadius(machineName) {
        this.panel = { type: 'blast', machine: machineName };
        this.panelShell(
            `Blast radius <span class="est-mono">${escapeHtml(machineName)}</span>`,
            'If this machine goes down: deployments hit, via what it hosts and the observed edges pointing at it. Tags label the answer; edit them in Triage.',
            '<div data-ref="blast"></div>');
        this.openPanel();

        new BlastRadiusPanel(machineName, (machine) => this.openDetails(machine), () => this.openTriage())
            .mount(this.panelEl.querySelector('[data-ref="blast"]'));
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
            this.asOf,
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
            ${m.hasData ? `
            <section>
                <h3>Baseline</h3>
                <div data-ref="baseline"><p class="est-status">Judging against the baselines…</p></div>
            </section>
            <section>
                <h3>History</h3>
                <div data-ref="history"><p class="est-status">Loading collected days…</p></div>
            </section>` : ''}
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

        new MachineBaseline(m, this.data.machines, async () => {
            // A bless or an approval moves the findings stream and the tile posture with it.
            this.data = await fetchCanvas(this.asOf);
            this.renderAll();
        }).mount(this.panelEl.querySelector('[data-ref="baseline"]'));

        fetchMachineDates(m.machine).then((dates) => {
            if (this.panel?.type !== 'details' || this.panel.machine !== machineName) return;
            const historyEl = this.panelEl.querySelector('[data-ref="history"]');
            if (!historyEl) return;
            if (dates.length < 2) {
                historyEl.innerHTML = '<p class="est-status">Only one day collected so far — history begins with the next run.</p>';
                return;
            }
            new MachineHistory(m.machine, dates).mount(historyEl);
        }).catch((err) => {
            const historyEl = this.panelEl.querySelector('[data-ref="history"]');
            if (historyEl) historyEl.innerHTML = `<p class="est-status est-error">${escapeHtml(err.message)}</p>`;
        });

        let snapshot;
        let entityTags = null;
        try {
            // Tags failing must not take the dossier down with them — the snapshot still renders.
            [snapshot, entityTags] = await Promise.all([
                fetchSnapshot(m.machine, m.latestDate),
                fetchEntityTags(m.machine).catch(() => null),
            ]);
        } catch (err) {
            const slot = this.panelEl.querySelector('[data-ref="dossier"]');
            if (slot) slot.innerHTML = `<p class="est-status est-error">${escapeHtml(err.message)}</p>`;
            return;
        }
        if (this.panel?.type !== 'details' || this.panel.machine !== machineName) return;

        const slot = this.panelEl.querySelector('[data-ref="dossier"]');
        if (!slot) return;
        slot.innerHTML = dossierHtml(m, snapshot.envelope, entityTags);
        bindDossier(slot);
    }

    async openCompare(machineNames) {
        this.panel = { type: 'compare', machines: machineNames };
        this.panelShell(
            `Compare <span class="est-mono">${machineNames.map(escapeHtml).join(' · ')}</span>`,
            'Differing rows only — volatile rows shown muted, never counted against equality',
            '<p class="est-status">Comparing…</p>');
        // Size the panel to its columns: label column + one per machine, capped at 94vw.
        // Beyond the cap, the table scrolls with the label column pinned.
        const autoWidth = Math.max(860, 256 + machineNames.length * 220 + 90);
        this.panelEl.style.width = `min(${autoWidth}px, 94vw)`;
        this.openPanel();

        let result;
        try {
            result = await fetchCompare(machineNames, [], this.asOf);
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
                .filter((r) => r.differs)
                .map((r) => `
                    <tr class="${r.volatile ? 'est-row-volatile' : ''}">
                        <td class="est-row-label">${escapeHtml(r.label)}${r.volatile ? ' <span class="est-muted">(volatile)</span>' : ''}</td>
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
