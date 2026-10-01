import { fetchApplications, fetchCoverage, fetchEvents, fetchReleaseStatus, fetchStages, fetchWhereIsEverything } from './moveit-api.mjs';
import { appLabel, days, daysAgo, escapeHtml, shortDate } from './format.mjs';
import { NOT_SEEN, buildLanes, laneFor } from './lanes.mjs';
import { laneHue } from './stage-hues.mjs';
import { classifyReleases } from './release-panel.mjs';
import { renderTabs } from './tabs.mjs';

// Division (move-it.md §19): the executive's page. Every project, every release in flight,
// every feature and fix, drawn as a step line from the developers' desks to live. One step
// per stage, plus client sign-off before the top stage, because that is the step executives
// ask about and the only one that leaves nothing on a box. Read-only; every fact is a row
// from 01, 02 or the event list; this page only places them on the line.

const SIGNOFF = 'signoff';

function buildSteps(lanes, captions) {
    const stageLanes = lanes.slice(2);
    const top = stageLanes[stageLanes.length - 1];
    const caption = (lane) => lane.stages.map((s) => captions[s] ?? captions[s.toUpperCase()]).filter(Boolean).join(' / ');
    return [
        { id: 'build', label: 'In development', caption: 'with the developers', lanes: [lanes[0].id, lanes[1].id], hue: '#8e96a3' },
        ...stageLanes.slice(0, -1).map((l) => ({ id: l.id, label: l.label, caption: caption(l), lanes: [l.id], hue: laneHue(l) })),
        { id: SIGNOFF, label: 'Client sign-off', caption: 'approval to go live', lanes: [], hue: '#0b5394' },
        { id: top.id, label: top.label, caption: caption(top) || 'live', lanes: [top.id], hue: laneHue(top) },
    ];
}

// Where on the line, and in what state. The last testing stage splits three ways on the
// release's events: approved (signed off, going live), verified (waiting on the client),
// neither (still in testing) — §2's "ours" versus "theirs".
function place(laneId, release, verified, steps) {
    const last = steps.length - 1;
    const signoff = steps.findIndex((s) => s.id === SIGNOFF);
    let at = steps.findIndex((s) => s.lanes.includes(laneId));
    let state = at === last ? 'live' : at === 0 ? (laneId === NOT_SEEN ? 'built' : 'build') : 'testing';
    if (at === signoff - 1 && at > 0) {
        if (release.ApprovedAt) { at = signoff; state = 'signed'; }
        else if (verified) { at = signoff; state = 'waiting'; }
    }
    if (release.OnHold === 1 && state !== 'live') state = 'hold';
    return { at, state };
}

const STATE_TEXT = {
    build: 'being built', built: 'built, not yet on a server', testing: 'in testing', waiting: 'waiting on the client',
    signed: 'signed off, going live', hold: 'on hold', live: 'live',
};

class DivisionPage {
    init(config = {}) {
        this.root = document.getElementById(config.rootId ?? 'moveit-root');
        this.shippedDays = config.shippedDays ?? 14;
        this.captions = config.stepCaptions ?? {};
        this.now = Date.now();
        this.root.innerHTML = `
            <header class="mi-header">
                <div class="mi-masthead">
                    ${renderTabs('division')}
                    <h1 class="mi-title">The division at a glance</h1>
                    <p class="mi-tagline">Every project, every release, every feature and fix — and how far each has come on the way to live.</p>
                </div>
            </header>
            <div class="dv-summary" data-ref="summary"></div>
            <main class="dv-main" data-ref="main"><p class="mi-status">Asking the tracking database…</p></main>`;
        this.summaryEl = this.root.querySelector('[data-ref="summary"]');
        this.mainEl = this.root.querySelector('[data-ref="main"]');
        this.load();
    }

    async load() {
        try {
            [this.stages, this.applications, this.items, this.releases, this.events, this.coverage] = await Promise.all([
                fetchStages(), fetchApplications(), fetchWhereIsEverything(), fetchReleaseStatus(), fetchEvents(), fetchCoverage(),
            ]);
        } catch (err) {
            this.mainEl.innerHTML = `<p class="mi-status is-error">${escapeHtml(err.message)}</p>`;
            return;
        }
        this.lanes = buildLanes(this.stages);
        this.steps = buildSteps(this.lanes, this.captions);
        this.signoffIndex = this.steps.findIndex((s) => s.id === SIGNOFF);
        this.render();
    }

    render() {
        const cards = classifyReleases({ lanes: this.lanes, items: this.items, releases: this.releases, now: this.now, shippedDays: this.shippedDays });
        const verified = new Set(this.events.filter((e) => e.Kind === 'verified').map((e) => e.ReleaseId));
        const placed = cards.filter((c) => !c.abandoned).map((c) => ({
            ...c,
            ...place(c.lane, c.release, verified.has(c.release.ReleaseId), this.steps),
            items: c.open.map((i) => ({ item: i, ...place(laneFor(i.Status, this.lanes), c.release, verified.has(c.release.ReleaseId), this.steps) })),
        }));

        this.renderSummary(placed);
        const projects = this.applications
            .map((app) => ({ app, releases: placed.filter((p) => p.release.ApplicationId === app.ApplicationId) }))
            .filter((p) => p.releases.length)
            .sort((a, b) => (a.app.Name ? 0 : 1) - (b.app.Name ? 0 : 1) || appLabel(a.app).localeCompare(appLabel(b.app)));

        this.mainEl.innerHTML = `
            <div class="dv-grid" style="--steps: ${this.steps.length}">
                <div class="dv-head">
                    <div class="dv-head-label"></div>
                    ${this.steps.map((s, n) => `
                        <div class="dv-head-step" style="--hue: ${s.hue}">
                            <span class="dv-head-num">${n + 1}</span>
                            <span class="dv-head-name">${escapeHtml(s.label)}</span>
                            <span class="dv-head-caption">${escapeHtml(s.caption)}</span>
                        </div>`).join('')}
                </div>
                ${projects.map((p) => this.renderProject(p)).join('')}
            </div>`;

        this.mainEl.querySelectorAll('[data-toggle]').forEach((btn) => btn.addEventListener('click', () => {
            const block = btn.closest('.dv-release');
            block.classList.toggle('is-open');
            btn.setAttribute('aria-expanded', block.classList.contains('is-open'));
        }));
    }

    renderSummary(placed) {
        const inFlight = placed.filter((p) => !p.folded && p.state !== 'live');
        const pieces = inFlight.reduce((n, p) => n + p.items.length, 0);
        const recent = placed.filter((p) => p.shippedAt && !p.folded);
        const tile = (n, label, tone = '') => `<div class="dv-tile ${tone}"><span class="dv-tile-num">${n}</span><span class="dv-tile-label">${label}</span></div>`;
        this.summaryEl.innerHTML = [
            tile(inFlight.length, `release${inFlight.length === 1 ? '' : 's'} on the way, carrying ${pieces} feature${pieces === 1 ? '' : 's'} and fixes`),
            tile(recent.length, `went live in the last ${this.shippedDays} days`, recent.length ? 'is-good' : ''),
            tile(inFlight.filter((p) => p.state === 'waiting').length, 'waiting on client sign-off', 'is-ask'),
            tile(inFlight.filter((p) => p.state === 'signed').length, 'signed off, going live', 'is-ask'),
            tile(inFlight.filter((p) => p.release.PastTarget === 1).length, 'past their target date', inFlight.some((p) => p.release.PastTarget === 1) ? 'is-alert' : ''),
            tile(inFlight.filter((p) => p.state === 'hold').length, 'on hold', inFlight.some((p) => p.state === 'hold') ? 'is-hold' : ''),
        ].join('') + this.renderCoverage();
    }

    // What the board can and cannot see (§24), so a calm page is not read as complete: how many
    // applications the pings watch, which are known only from what people say, and which not
    // at all. Named, because "3 not visible" invites the question "which?".
    renderCoverage() {
        const appsById = new Map(this.applications.map((a) => [a.ApplicationId, a]));
        const named = (verdicts) => this.coverage.filter((c) => verdicts.includes(c.Verdict)).map((c) => appLabel(appsById.get(c.ApplicationId) ?? { ApplicationId: c.ApplicationId }));
        const watched = named(['observed']);
        const said = named(['asserted only']);
        const dark = named(['pinged, no block', 'nothing']);
        const part = (list, text) => list.length ? `<span class="dv-cover-part"><strong>${list.length}</strong> ${text} <span class="dv-muted">(${list.map(escapeHtml).join(', ')})</span></span>` : '';
        return `
            <p class="dv-cover ${said.length || dark.length ? 'is-partial' : ''}">
                <span class="dv-cover-part">The pings watch <strong>${watched.length} of ${this.coverage.length}</strong> applications</span>
                ${part(said, 'known only from what people record')}
                ${part(dark, 'not visible: no deployment details reach the board')}
            </p>`;
    }

    coverageTag(app) {
        const verdict = this.coverage.find((c) => c.ApplicationId === app.ApplicationId)?.Verdict;
        if (verdict === 'asserted only') return '<span class="dv-cover-tag">recorded by hand</span>';
        if (verdict === 'pinged, no block' || verdict === 'nothing') return '<span class="dv-cover-tag is-dark">not visible</span>';
        return '';
    }

    renderProject({ app, releases }) {
        const active = releases.filter((r) => !r.folded).sort((a, b) => (a.state === 'live') - (b.state === 'live') || b.at - a.at);
        const earlier = releases.filter((r) => r.folded).sort((a, b) => Date.parse(b.shippedAt) - Date.parse(a.shippedAt));
        const flying = active.filter((r) => r.state !== 'live').length;
        return `
            <section class="dv-project">
                <header class="dv-project-head">
                    <h2 class="dv-project-name ${app.Name ? '' : 'is-unnamed'}">${escapeHtml(appLabel(app))}</h2>
                    ${this.coverageTag(app)}
                    <span class="dv-project-meta">${flying ? `${flying} on the way` : 'nothing on the way'}${earlier.length
                        ? ` · earlier: ${earlier.slice(0, 3).map((r) => `${escapeHtml(r.release.Name)} live ${escapeHtml(shortDate(r.shippedAt))}`).join(', ')}` : ''}</span>
                </header>
                ${active.map((r) => this.renderRelease(r)).join('')}
            </section>`;
    }

    renderRelease(r) {
        const rel = r.release;
        const since = daysAgo(r.shippedAt ?? rel.Since, this.now);
        const text = (r.state === 'live' ? `live since ${shortDate(r.shippedAt ?? rel.Since)}` : `${STATE_TEXT[r.state]}${since != null ? ` · ${days(since)}` : ''}`)
            + (rel.Evidence === 'asserted' ? ' · reported, not observed' : '');
        const flags = [];
        if (rel.PastTarget === 1) flags.push(`<span class="mi-flag is-alert">late — target ${escapeHtml(shortDate(rel.TargetDate))}</span>`);
        else if (rel.TargetDate && r.state !== 'live') flags.push(`<span class="dv-muted">target ${escapeHtml(shortDate(rel.TargetDate))}</span>`);
        const unsigned = !rel.ApprovedAt && r.at > this.signoffIndex;
        if (unsigned) flags.push('<span class="mi-flag is-hold">went live with no client sign-off recorded</span>');
        if (rel.OnHold === 1) flags.push(`<span class="mi-flag is-hold">on hold${rel.HoldReason ? `: ${escapeHtml(rel.HoldReason)}` : ''}</span>`);
        const contents = [rel.Features ? `${rel.Features} feature${rel.Features === 1 ? '' : 's'}` : '', rel.Fixes ? `${rel.Fixes} fix${rel.Fixes === 1 ? '' : 'es'}` : ''].filter(Boolean).join(', ');
        return `
            <div class="dv-release is-open is-${r.state}">
                <div class="dv-row dv-row-release">
                    <div class="dv-label">
                        <button type="button" class="dv-toggle" data-toggle aria-expanded="true" title="Show or hide its features and fixes">
                            <span class="dv-release-name">${escapeHtml(rel.Name)}</span>${rel.Kind === 'hotfix' ? ' <span class="mi-card-kind">hotfix</span>' : ''}
                        </button>
                        <span class="dv-muted">${contents || 'nothing recorded yet'}</span>
                        ${flags.length ? `<span class="dv-flags">${flags.join(' ')}</span>` : ''}
                    </div>
                    ${this.renderTrack(r.at, r.state, text, 'is-big', unsigned, rel.Evidence === 'asserted')}
                </div>
                <div class="dv-items">
                    ${r.items.map((i) => `
                        <div class="dv-row dv-row-item">
                            <div class="dv-label"><span class="dv-item-title is-${escapeHtml(i.item.Kind)}">${escapeHtml(i.item.Title)}</span> <span class="dv-muted">${escapeHtml(i.item.Kind)}</span></div>
                            ${this.renderTrack(i.at, i.state, STATE_TEXT[i.state] + (i.item.Evidence === 'asserted' ? ' · reported, not observed' : ''), 'is-small', !rel.ApprovedAt && i.at > this.signoffIndex, i.item.Evidence === 'asserted')}
                        </div>`).join('') || '<div class="dv-row dv-row-item"><div class="dv-label dv-muted">No features or fixes recorded.</div></div>'}
                </div>
            </div>`;
    }

    // One cell per step; each cell draws its half-lines and its node, so the line is solid
    // up to the current step and faint after it.
    // unsigned: past client sign-off with no approval recorded; that step shows "!", not a tick.
    // asserted: the position is Team A's word (rule 6), drawn dashed so it never passes as observed.
    renderTrack(at, state, text, size, unsigned = false, asserted = false) {
        return this.steps.map((s, n) => {
            const skipped = unsigned && n === this.signoffIndex;
            const when = skipped ? 'is-done is-skipped' : n < at ? 'is-done' : n === at ? 'is-current' : 'is-next';
            return `
                <div class="dv-step ${when} ${size} ${n === 0 ? 'is-first' : ''} ${n === this.steps.length - 1 ? 'is-last' : ''}" style="--hue: ${s.hue}">
                    <span class="dv-node ${n === at ? `is-${state}${asserted ? ' is-asserted' : ''}` : ''}" title="${escapeHtml(s.label)}${skipped ? ' — no sign-off recorded' : n === at ? ` — ${escapeHtml(text)}` : ''}">${skipped ? '!' : n < at ? '✓' : ''}</span>
                    ${n === at && size === 'is-big' ? `<span class="dv-node-text">${escapeHtml(text)}</span>` : ''}
                </div>`;
        }).join('');
    }
}

export default new DivisionPage();
