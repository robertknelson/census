import { fetchApplications, fetchReadyToApprove, fetchReleaseBuilds, fetchReleaseStatus, fetchReleases, fetchStages, fetchWhereIsEverything } from './moveit-api.mjs';
import { appLabel, days, daysAgo, escapeHtml, shortDate } from './format.mjs';
import { buildLanes, laneFor } from './lanes.mjs';
import { laneHue, stageHue } from './stage-hues.mjs';
import { classifyReleases } from './release-panel.mjs';
import { renderTabs } from './tabs.mjs';
import { AppRail } from './app-rail.mjs';
import { Register } from './register.mjs';
import { renderFlags } from './features-page.mjs';

// The Releases register (move-it.md §28.2): every release as one flat list — find, standing
// questions, facets with counts, sortable columns, paging — each row carrying the §18 bar of
// where its pieces are. A click opens the release page, which already is the story. Every
// fact is a row from 02, 01, 04 or the board queries; the page only arranges them.

class ReleasesPage {
    init(config = {}) {
        this.root = document.getElementById(config.rootId ?? 'moveit-root');
        this.pageSize = config.pageSize ?? 50;
        this.shippedDays = config.shippedDays ?? 14;
        this.now = Date.now();
        this.apps = [];
        this.renderShell();
        this.load();
    }

    renderShell() {
        this.rail = new AppRail((ids) => { this.apps = ids; this.renderRows(); });
        this.root.innerHTML = `
            ${renderTabs('releases')}
            <div class="mi-shell" data-ref="shell">
                ${this.rail.html()}
                <div class="mi-pane">
                    <div class="mi-head">
                        <h1 class="mi-head-title">Releases</h1>
                        <div class="rg-head" data-ref="reghead"></div>
                        <p class="mi-showing" data-ref="showing"></p>
                    </div>
                    <div class="mi-body">
                        <main class="mi-main rg-main" data-ref="main"></main>
                    </div>
                </div>
            </div>`;
        const ref = (name) => this.root.querySelector(`[data-ref="${name}"]`);
        this.mainEl = ref('main');
        this.rail.mount(ref('shell'), ref('showing'));
        this.regHeadEl = ref('reghead');
    }

    async load() {
        this.mainEl.innerHTML = '<p class="mi-status">Asking the tracking database…</p>';
        try {
            [this.stages, this.applications, this.items, this.releases, this.plain, this.builds, this.candidates] = await Promise.all([
                fetchStages(), fetchApplications(), fetchWhereIsEverything(), fetchReleaseStatus(), fetchReleases(), fetchReleaseBuilds(), fetchReadyToApprove(),
            ]);
        } catch (err) {
            this.mainEl.innerHTML = `<p class="mi-status is-error">${escapeHtml(err.message)}</p>`;
            return;
        }
        this.lanes = buildLanes(this.stages);
        this.apps = AppRail.remembered(this.applications);
        this.register = new Register(this.registerConfig()).mount(this.regHeadEl, this.mainEl);
        this.renderRows();
    }

    buildRows() {
        const byApp = new Map(this.applications.map((a) => [a.ApplicationId, a]));
        const plain = new Map(this.plain.map((r) => [r.ReleaseId, r]));
        const builds = new Map();
        for (const b of this.builds) { if (!builds.has(b.ReleaseId)) builds.set(b.ReleaseId, []); builds.get(b.ReleaseId).push(b.Build); }
        const candidates = new Map(this.candidates.map((c) => [c.ReleaseId, c]));
        const cards = classifyReleases({ lanes: this.lanes, items: this.items, releases: this.releases, now: this.now, shippedDays: this.shippedDays });
        return cards.map((card) => {
            const r = card.release;
            const lane = card.lane ? this.lanes.find((l) => l.id === card.lane) : null;
            const laneIndex = card.abandoned ? this.lanes.length : lane ? this.lanes.indexOf(lane) : -1;
            const contents = card.abandoned ? null : !r.Features && !r.Fixes ? 'empty' : r.Features && r.Fixes ? 'mixed' : r.Features ? 'features only' : 'fixes only';
            const candidate = candidates.get(r.ReleaseId);
            const flags = [];
            if (r.PastTarget === 1) flags.push('late');
            if (r.OnHold === 1) flags.push('on hold');
            if (candidate) flags.push(candidate.Ready === 1 ? 'ready to approve' : 'awaiting approval');
            if (r.ApprovedAt) flags.push('approved');
            if (card.shippedAt && !r.ApprovedAt) flags.push('unsigned');
            if (r.Contradiction) flags.push('contradiction');
            if (contents === 'empty') flags.push('empty');
            return {
                card, release: r, lane, laneIndex, contents, flags,
                app: byApp.get(r.ApplicationId) ?? { ApplicationId: r.ApplicationId },
                builds: builds.get(r.ReleaseId) ?? [],
                plain: plain.get(r.ReleaseId) ?? null,
                where: card.abandoned ? 'abandoned' : lane?.label ?? r.HighestStage,
                sinceMs: r.Since ? Date.parse(r.Since) : null,
                targetMs: r.TargetDate ? Date.parse(r.TargetDate) : null,
            };
        });
    }

    renderRows() {
        this.rows = this.buildRows();
        const inScope = (r) => this.apps.length === 0 || this.apps.includes(r.release.ApplicationId);
        this.rail.render(this.applications, this.apps,
            (id) => this.rows.filter((r) => !r.card.abandoned && (id == null || r.release.ApplicationId === id)).length);
        this.register.setRows(this.rows.filter(inScope));
    }

    registerConfig() {
        const laneLabels = this.lanes.filter((l) => l.stages.length || l.id === 'not seen').map((l) => l.label);
        return {
            pageSize: this.pageSize,
            rowKey: (r) => r.release.ReleaseId,
            find: (r) => `${r.release.Name} ${appLabel(r.app)} ${r.builds.join(' ')} ${r.plain?.Note ?? ''}`,
            defaultSort: { id: 'since', dir: 'desc' },
            emptyText: 'No release matches. Clear a facet, or widen the find.',
            onPick: (row) => { if (row) window.location.href = `/moveit/release/${row.release.ReleaseId}`; },
            columns: [
                { id: 'name', label: 'Release', class: 'rg-c-title', sort: (r) => r.release.Name.toLowerCase(),
                  render: (r) => `<a class="rg-title rg-link" href="/moveit/release/${r.release.ReleaseId}">${escapeHtml(r.release.Name)}</a>${r.release.Kind === 'hotfix' ? ' <span class="mi-card-kind">hotfix</span>' : ''}` },
                { id: 'app', label: 'Application', sort: (r) => appLabel(r.app).toLowerCase(), render: (r) => escapeHtml(appLabel(r.app)) },
                { id: 'contents', label: 'Contents', class: 'rg-c-wrap', sort: (r) => (r.release.Features ?? 0) + (r.release.Fixes ?? 0), defaultDir: 'desc',
                  render: (r) => this.renderContents(r) },
                { id: 'pieces', label: 'Pieces', class: 'rg-c-track', sort: (r) => r.card.open.length, defaultDir: 'desc', render: (r) => this.renderPieces(r) },
                { id: 'where', label: 'Highest stage', sort: (r) => r.laneIndex, defaultDir: 'desc',
                  render: (r) => `<span class="mi-stage" style="--lane: ${stageHue(r.release.HighestStage)}">${escapeHtml(r.release.HighestStage)}</span>${r.release.Evidence === 'asserted' ? ' <span class="mi-muted">asserted</span>' : ''}` },
                { id: 'since', label: 'Since', sort: (r) => r.sinceMs, defaultDir: 'desc', render: (r) => this.renderSince(r) },
                { id: 'target', label: 'Target', sort: (r) => r.targetMs,
                  render: (r) => r.release.TargetDate ? `${escapeHtml(shortDate(r.release.TargetDate))}${r.release.PastTarget === 1 ? ' <span class="mi-flag is-alert">late</span>' : ''}` : '<span class="mi-muted">—</span>' },
                { id: 'builds', label: 'Builds', sort: (r) => r.builds.length, defaultDir: 'desc',
                  render: (r) => r.builds.length ? `<span title="${escapeHtml(r.builds.join(', '))}">${r.builds.length}</span>` : '<span class="mi-muted">none</span>' },
                { id: 'flags', label: 'Flags', class: 'rg-c-wrap', sort: (r) => r.flags.length, defaultDir: 'desc', render: (r) => renderFlags(r.flags.filter((f) => f !== 'empty')) },
            ],
            facets: [
                { id: 'kind', label: 'Kind', value: (r) => r.release.Kind, order: ['featureset', 'hotfix'] },
                { id: 'where', label: 'Highest stage', value: (r) => r.where, order: [...laneLabels, 'with the devs', 'no evidence', 'abandoned'] },
                { id: 'contents', label: 'Contents', value: (r) => r.contents, order: ['features only', 'fixes only', 'mixed', 'empty'] },
                { id: 'flags', label: 'Flags', value: (r) => r.flags.filter((f) => f !== 'empty'), order: ['late', 'on hold', 'awaiting approval', 'ready to approve', 'approved', 'unsigned', 'contradiction'] },
            ],
            pills: [
                { id: 'late', label: 'Late', title: 'Past target, not live', facets: { flags: ['late'] } },
                { id: 'empty', label: 'Nothing recorded', title: 'A release with no features or fixes under it', facets: { contents: ['empty'] } },
                { id: 'approval', label: 'Awaiting approval', title: 'Verified and waiting on the client', facets: { flags: ['awaiting approval', 'ready to approve'] } },
                { id: 'hold', label: 'On hold', facets: { flags: ['on hold'] } },
                { id: 'live', label: `Live in ${this.shippedDays} days`, title: `Wholly in the top stage, reached in the last ${this.shippedDays} days`,
                  test: (r) => r.card.shippedAt != null && !r.card.folded },
                { id: 'unsigned', label: 'Live, no sign-off', title: 'Went live with no approval recorded', facets: { flags: ['unsigned'] } },
            ],
        };
    }

    renderContents(r) {
        if (r.card.abandoned) return '<span class="mi-muted">abandoned</span>';
        const parts = [];
        if (r.release.Features) parts.push(`${r.release.Features} feature${r.release.Features === 1 ? '' : 's'}`);
        if (r.release.Fixes) parts.push(`${r.release.Fixes} fix${r.release.Fixes === 1 ? '' : 'es'}`);
        if (r.release.WithDevs) parts.push(`<span class="mi-muted">${r.release.WithDevs} with the devs</span>`);
        if (r.release.Removed) parts.push(`<span class="mi-muted">${r.release.Removed} removed</span>`);
        return parts.length ? parts.join(', ') : '<span class="mi-flag is-alert">nothing recorded</span>';
    }

    // Where the release's pieces are: one segment per lane holding one, width by count, the
    // §18 card's bar drawn for every release, even one whose pieces are all in one lane.
    renderPieces(r) {
        const open = r.card.open;
        if (!open.length) return '';
        const segments = this.lanes.map((l) => ({ lane: l, n: open.filter((i) => laneFor(i.Status, this.lanes) === l.id).length })).filter((s) => s.n);
        return `<span class="mi-bar rg-bar" title="${escapeHtml(segments.map((s) => `${s.n} ${s.lane.label}`).join(', '))}">
            ${segments.map((s) => `<span class="mi-bar-seg" style="--lane: ${laneHue(s.lane)}; flex: ${s.n}"></span>`).join('')}
        </span>`;
    }

    renderSince(r) {
        if (r.card.shippedAt) return `<span class="rg-shipped">live since ${escapeHtml(shortDate(r.card.shippedAt))}</span> <span class="mi-muted">${days(daysAgo(r.card.shippedAt, this.now))} ago</span>`;
        if (!r.release.Since) return '<span class="mi-muted">—</span>';
        return `${escapeHtml(shortDate(r.release.Since))} <span class="mi-muted">${days(daysAgo(r.release.Since, this.now))}</span>`;
    }
}

export default new ReleasesPage();
