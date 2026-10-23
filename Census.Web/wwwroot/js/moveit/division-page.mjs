import { fetchApplications, fetchCoverage, fetchEvents, fetchReleaseStatus, fetchStages, fetchWhereIsEverything } from './moveit-api.mjs';
import { appLabel, days, daysAgo, escapeHtml, isoDate, shortDate } from './format.mjs';
import { NOT_SEEN, buildLanes, laneFor } from './lanes.mjs';
import { laneHue } from './stage-hues.mjs';
import { classifyReleases, currentReleases } from './release-panel.mjs';
import { renderTabs } from './tabs.mjs';
import { PopOver } from './pop-over.mjs';
import { AppRail } from './app-rail.mjs';

// Division (move-it.md §19): the executive's page. Every project, every release in flight,
// every feature and fix, drawn as a step line from the developers' desks to live. One step
// per stage, plus client sign-off before the top stage, because that is the step executives
// ask about and the only one that leaves nothing on a box. Read-only; every fact is a row
// from 01, 02 or the event list; this page only places them on the line.

const SIGNOFF = 'signoff';
const SCOPE_KEY = 'moveit.division.scope';

function buildSteps(lanes, captions) {
    const stageLanes = lanes.slice(2);
    const top = stageLanes[stageLanes.length - 1];
    const caption = (lane) => lane.stages.map((s) => captions[s] ?? captions[s.toUpperCase()]).filter(Boolean).join(' / ');
    return [
        { id: 'build', label: 'In development', caption: 'with the developers', lanes: [lanes[0].id, lanes[1].id], hue: '#8e96a3' },
        ...stageLanes.slice(0, -1).map((l) => ({ id: l.id, label: l.label, caption: caption(l), lanes: [l.id], hue: laneHue(l) })),
        { id: SIGNOFF, label: 'Signoff', caption: 'approval to go live', lanes: [], hue: '#0b5394' },
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
        this.apps = [];
        // One application's page (his note 7): the same lines for its every release, no rail,
        // no scope choice, and its releases listed with their dates under them.
        this.applicationId = config.applicationId ?? null;
        // Embedded in the persona UX (personas.md §5.0): no Move It tabs and no rail; the page is
        // fixed to the member's applications (an empty list draws nothing).
        this.embedded = config.embedded === true;
        this.only = config.applicationIds ?? null;
        this.scope = this.applicationId ? 'all' : readScope();
        this.cover = new PopOver({ id: 'dv-cover', wide: true });
        this.rail = new AppRail((ids) => { this.apps = ids; this.render(); });
        this.root.innerHTML = `
            ${this.embedded ? '' : renderTabs('division')}
            <div class="mi-shell" data-ref="shell">
                ${this.applicationId || this.embedded ? '' : this.rail.html()}
                <div class="mi-pane">
                    <div class="mi-head">
                        ${this.applicationId ? '<a class="mi-back" href="/moveit/division">‹ Division</a><h1 class="mi-head-title" data-ref="title"></h1><a class="mi-back" data-ref="usage" hidden>Usage ↗</a>' : ''}
                        <div class="mi-head-numbers" data-ref="summary"></div>
                        ${this.applicationId ? '' : `<nav class="mi-picks dv-scope" data-ref="scope" aria-label="Releases drawn">
                            <button type="button" class="mi-pick" data-scope="current" title="Releases on the way, and the one now live in production for each application">On the way and live</button>
                            <button type="button" class="mi-pick" data-scope="all" title="Every release recorded, superseded ones included">All releases</button>
                        </nav>
                        <p class="mi-showing" data-ref="showing"></p>`}
                        ${this.cover.html()}
                    </div>
                    <main class="dv-main" data-ref="main"><p class="mi-status">Asking the tracking database…</p></main>
                </div>
            </div>`;
        const ref = (name) => this.root.querySelector(`[data-ref="${name}"]`);
        this.summaryEl = ref('summary');
        this.mainEl = ref('main');
        this.titleEl = ref('title');
        this.scopeEl = ref('scope');
        this.scopeEl?.querySelectorAll('[data-scope]').forEach((b) => b.addEventListener('click', () => {
            this.scope = b.dataset.scope;
            writeScope(this.scope);
            if (this.placed) this.render();
        }));
        if (!this.applicationId && !this.embedded) this.rail.mount(ref('shell'), ref('showing'));
        this.cover.mount(this.root);
        this.cover.hide(true);
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
        const cards = classifyReleases({ lanes: this.lanes, items: this.items, releases: this.releases, now: this.now, shippedDays: this.shippedDays });
        const current = currentReleases(cards);
        const verified = new Set(this.events.filter((e) => e.Kind === 'verified').map((e) => e.ReleaseId));
        this.placed = cards.filter((c) => !c.abandoned).map((c) => ({
            ...c,
            current: current.has(c),
            ...place(c.lane, c.release, verified.has(c.release.ReleaseId), this.steps),
            items: c.open.map((i) => ({ item: i, ...place(laneFor(i.Status, this.lanes), c.release, verified.has(c.release.ReleaseId), this.steps) })),
        }));
        this.apps = this.applicationId ? [this.applicationId] : this.only ?? AppRail.remembered(this.applications);
        this.render();
    }

    // The rail narrows the page to the chosen applications (§26); the scope says which of
    // their releases are drawn as lines: the current ones (on the way, and what is live in
    // production — §19.1), or every one. The numbers follow the applications, not the scope.
    render() {
        const placed = this.placed.filter((p) => (this.apps.length === 0 && !this.only) || this.apps.includes(p.release.ApplicationId));
        if (this.applicationId) {
            const app = this.applications.find((a) => a.ApplicationId === this.applicationId);
            this.titleEl.textContent = appLabel(app ?? { ApplicationId: this.applicationId });
            document.title = `${this.titleEl.textContent} — Move It`;
            // How it is used (usage.md U-4): its log rows under its registry name.
            const usage = this.root.querySelector('[data-ref="usage"]');
            if (usage && app?.Name) { usage.href = `/usage?${new URLSearchParams({ application: app.Name })}`; usage.hidden = false; }
        } else if (this.embedded) {
            const showing = this.root.querySelector('[data-ref="showing"]');
            if (showing) showing.textContent = `${this.apps.length} application${this.apps.length === 1 ? '' : 's'}`;
        } else {
            this.rail.render(this.applications, this.apps,
                (id) => this.placed.filter((p) => p.current && p.state !== 'live' && (id == null || p.release.ApplicationId === id)).length);
        }
        this.scopeEl?.querySelectorAll('[data-scope]').forEach((b) => {
            b.classList.toggle('is-active', b.dataset.scope === this.scope);
            b.toggleAttribute('aria-pressed', b.dataset.scope === this.scope);
        });

        this.renderSummary(placed);
        const drawn = (p) => this.scope === 'all' || p.current;
        const projects = this.applications
            .map((app) => ({ app, releases: placed.filter((p) => p.release.ApplicationId === app.ApplicationId) }))
            .filter((p) => p.releases.some(drawn))
            .sort((a, b) => (a.app.Name ? 0 : 1) - (b.app.Name ? 0 : 1) || appLabel(a.app).localeCompare(appLabel(b.app)));

        if (projects.length === 0) {
            this.mainEl.innerHTML = this.applicationId
                ? '<p class="mi-status">No release is recorded for this application yet.</p>'
                : '<p class="mi-status">Nothing on the way, and nothing live, for this choice.</p>';
            return;
        }

        this.mainEl.innerHTML = `
            <div class="dv-grid" style="--steps: ${this.steps.length}">
                <div class="dv-head">
                    <div class="dv-head-label"></div>
                    ${this.steps.map((s, n) => `
                        <div class="dv-head-step" style="--hue: ${s.hue}">
                            <span class="dv-head-title"><span class="dv-head-num">${n + 1}</span><span class="dv-head-name">${escapeHtml(s.label)}</span></span>
                            <span class="dv-head-caption">${escapeHtml(s.caption)}</span>
                        </div>`).join('')}
                </div>
                ${projects.map((p) => this.renderProject(p)).join('')}
            </div>
            ${this.applicationId ? this.renderReleaseList(placed) : ''}`;

        this.mainEl.querySelectorAll('[data-toggle]').forEach((btn) => btn.addEventListener('click', () => {
            const block = btn.closest('.dv-release');
            block.classList.toggle('is-open');
            btn.setAttribute('aria-expanded', block.classList.contains('is-open'));
        }));
    }

    // The six numbers as one line in the header (§26), coloured as the tiles were: green for
    // went live, blue for the client's move, red for late, amber for held.
    renderSummary(placed) {
        const inFlight = placed.filter((p) => !p.folded && p.state !== 'live');
        const pieces = inFlight.reduce((n, p) => n + p.items.length, 0);
        const recent = placed.filter((p) => p.shippedAt && !p.folded);
        const n = (count, label, tone = '') => `<li class="${count ? tone : ''}"><span class="mi-num">${count}</span> ${label}</li>`;
        this.summaryEl.innerHTML = `
            <ul class="mi-numbers" aria-label="The division">
                ${n(inFlight.length, `on the way <span class="mi-muted">(${pieces} feature${pieces === 1 ? '' : 's'} and fixes)</span>`)}
                ${n(recent.length, `live in ${this.shippedDays} days`, 'is-good')}
                ${n(inFlight.filter((p) => p.state === 'waiting').length, 'waiting on signoff', 'is-ask')}
                ${n(inFlight.filter((p) => p.state === 'signed').length, 'signed off, going live', 'is-ask')}
                ${n(inFlight.filter((p) => p.release.PastTarget === 1).length, 'past target', 'is-alert')}
                ${n(inFlight.filter((p) => p.state === 'hold').length, 'on hold', 'is-hold')}
            </ul>`;
        this.renderCoverage();
    }

    // What the board can and cannot see (§24), so a calm page is not read as complete: how many
    // applications the pings watch, which are known only from what people say, and which not
    // at all. Named, because "3 not visible" invites the question "which?". The button says
    // how many it cannot see, amber, so the warning stays on screen with the sentence folded.
    renderCoverage() {
        const appsById = new Map(this.applications.map((a) => [a.ApplicationId, a]));
        const coverage = this.only ? this.coverage.filter((c) => this.only.includes(c.ApplicationId)) : this.coverage;
        const named = (verdicts) => coverage.filter((c) => verdicts.includes(c.Verdict)).map((c) => appLabel(appsById.get(c.ApplicationId) ?? { ApplicationId: c.ApplicationId }));
        const watched = named(['observed']);
        const said = named(['asserted only']);
        const dark = named(['pinged, no block', 'nothing']);
        const blind = said.length + dark.length;
        const part = (list, text) => list.length ? `<li><strong>${list.length}</strong> ${text} <span class="dv-muted">(${list.map(escapeHtml).join(', ')})</span></li>` : '';
        this.cover.hide(false);
        this.cover.setButton(blind
            ? `Tracked automatically: ${watched.length} of ${coverage.length}`
            : `Tracked automatically: all ${coverage.length}`, blind ? 'is-warn' : '');
        this.cover.setBody(`
            <ul class="dv-cover">
                <li><strong>${watched.length} of ${coverage.length}</strong> applications report their own deployments: Census asks each one's health endpoint every few minutes and sees a new build arrive.</li>
                ${part(said, 'move only when someone records it by hand')}
                ${part(dark, 'are not visible: no deployment details reach Census')}
            </ul>`);
    }

    // The application page's list (his note 7): every release with its dates, newest first.
    renderReleaseList(placed) {
        const rows = [...placed].sort((a, b) => Date.parse(b.shippedAt ?? b.release.Since ?? 0) - Date.parse(a.shippedAt ?? a.release.Since ?? 0));
        const date = (v) => (v ? escapeHtml(isoDate(v)) : '<span class="dv-muted">—</span>');
        return `
            <section class="dv-list">
                <h2 class="dv-list-head">Every release</h2>
                <table class="rg-table">
                    <thead><tr>${['Release', 'Kind', 'Where', 'Target', 'Approved on', 'Live since'].map((h) => `<th><span class="rg-th">${h}</span></th>`).join('')}</tr></thead>
                    <tbody>${rows.map((r) => `
                        <tr>
                            <td><a class="rg-title rg-link" href="/moveit/release/${r.release.ReleaseId}">${escapeHtml(r.release.Name)}</a></td>
                            <td>${escapeHtml(r.release.Kind)}</td>
                            <td>${escapeHtml(STATE_TEXT[r.state])}</td>
                            <td>${date(r.release.TargetDate)}${r.release.PastTarget === 1 ? ' <span class="mi-flag is-alert">late</span>' : ''}</td>
                            <td>${date(r.release.ApprovedAt)}</td>
                            <td>${date(r.shippedAt)}</td>
                        </tr>`).join('')}</tbody>
                </table>
            </section>`;
    }

    coverageTag(app) {
        const verdict = this.coverage.find((c) => c.ApplicationId === app.ApplicationId)?.Verdict;
        if (verdict === 'asserted only') return '<span class="dv-cover-tag">recorded by hand</span>';
        if (verdict === 'pinged, no block' || verdict === 'nothing') return '<span class="dv-cover-tag is-dark">not visible</span>';
        return '';
    }

    // Drawn: the current releases, or all of them; in flight first, then live, newest first.
    // What is not drawn folds into the header as "earlier", so a narrowed page says what it left out.
    renderProject({ app, releases }) {
        const drawn = (r) => this.scope === 'all' || r.current;
        const active = releases.filter(drawn).sort((a, b) => (a.state === 'live') - (b.state === 'live') || b.at - a.at || Date.parse(b.shippedAt ?? 0) - Date.parse(a.shippedAt ?? 0));
        const earlier = releases.filter((r) => !drawn(r)).sort((a, b) => Date.parse(b.shippedAt) - Date.parse(a.shippedAt));
        const flying = active.filter((r) => r.state !== 'live').length;
        return `
            <section class="dv-project">
                <header class="dv-project-head">
                    <h2 class="dv-project-name ${app.Name ? '' : 'is-unnamed'}">${this.applicationId ? escapeHtml(appLabel(app)) : `<a class="dv-project-link" href="/moveit/application/${app.ApplicationId}" title="Every release of this application">${escapeHtml(appLabel(app))}</a>`}</h2>
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
        if (unsigned) flags.push('<span class="mi-flag is-hold">went live with no signoff recorded</span>');
        if (rel.OnHold === 1) flags.push(`<span class="mi-flag is-hold">on hold${rel.HoldReason ? `: ${escapeHtml(rel.HoldReason)}` : ''}</span>`);
        const contents = [rel.Features ? `${rel.Features} feature${rel.Features === 1 ? '' : 's'}` : '', rel.Fixes ? `${rel.Fixes} fix${rel.Fixes === 1 ? '' : 'es'}` : ''].filter(Boolean).join(', ');
        return `
            <div class="dv-release is-${r.state}">
                <div class="dv-row dv-row-release">
                    <div class="dv-label">
                        <button type="button" class="dv-toggle" data-toggle aria-expanded="false" title="Show or hide its features and fixes">
                            <span class="dv-release-name">${escapeHtml(rel.Name)}</span>${rel.Kind === 'hotfix' ? ' <span class="mi-card-kind">hotfix</span>' : ''}
                        </button>
                        <span class="dv-muted">${contents || 'nothing recorded yet'}</span>
                        ${flags.length ? `<span class="dv-flags">${flags.join(' ')}</span>` : ''}
                    </div>
                    ${this.renderTrack(r.at, r.state, text, 'is-big', unsigned, rel.Evidence === 'asserted', r.state === 'live' ? null : this.dueText(rel))}
                </div>
                <div class="dv-items">
                    ${r.items.map((i) => `
                        <div class="dv-row dv-row-item">
                            <div class="dv-label"><span class="dv-item-title is-${escapeHtml(i.item.Kind)}">${escapeHtml(i.item.Title)}</span> <span class="dv-muted">${escapeHtml(i.item.Kind)}</span></div>
                            ${this.renderTrack(i.at, i.state, STATE_TEXT[i.state] + (i.item.Evidence === 'asserted' ? ' · reported, not observed' : ''), 'is-small', !rel.ApprovedAt && i.at > this.signoffIndex, i.item.Evidence === 'asserted')}
                        </div>`).join('') || '<div class="dv-row dv-row-item"><div class="dv-label dv-muted dv-span">No features or fixes recorded.</div></div>'}
                </div>
            </div>`;
    }

    // One cell per step; each cell draws its half-lines and its node, so the line is solid
    // up to the current step and faint after it.
    // unsigned: past client sign-off with no approval recorded; that step shows "!", not a tick.
    // asserted: the position is Team A's word (rule 6), drawn dashed so it never passes as observed.
    // The top step of a release not yet live says when it is due (his note 3); a live one's
    // node already says "live since".
    dueText(rel) {
        if (!rel.TargetDate) return 'no due date';
        return `${rel.PastTarget === 1 ? 'was due' : 'due'} ${shortDate(rel.TargetDate)}`;
    }

    // due: shown under the top step when the release is not there yet.
    renderTrack(at, state, text, size, unsigned = false, asserted = false, due = null) {
        return this.steps.map((s, n) => {
            const skipped = unsigned && n === this.signoffIndex;
            const when = skipped ? 'is-done is-skipped' : n < at ? 'is-done' : n === at ? 'is-current' : 'is-next';
            return `
                <div class="dv-step ${when} ${size} ${n === 0 ? 'is-first' : ''} ${n === this.steps.length - 1 ? 'is-last' : ''}" style="--hue: ${s.hue}">
                    <span class="dv-node ${n === at ? `is-${state}${asserted ? ' is-asserted' : ''}` : ''}" title="${escapeHtml(s.label)}${skipped ? ' — no signoff recorded' : n === at ? ` — ${escapeHtml(text)}` : ''}">${skipped ? '!' : n < at ? '✓' : ''}</span>
                    ${n === at && size === 'is-big' ? `<span class="dv-node-text">${escapeHtml(text)}</span>` : ''}
                    ${due && n === this.steps.length - 1 && n !== at ? `<span class="dv-node-text dv-due">${escapeHtml(due)}</span>` : ''}
                </div>`;
        }).join('');
    }
}

function readScope() {
    try { return localStorage.getItem(SCOPE_KEY) === 'all' ? 'all' : 'current'; } catch { return 'current'; }
}

function writeScope(scope) {
    try { localStorage.setItem(SCOPE_KEY, scope); } catch { /* not remembered */ }
}

export default new DivisionPage();
