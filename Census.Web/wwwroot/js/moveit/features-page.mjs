import { fetchApplications, fetchFeaturePicture, fetchLists, fetchReleaseStatus, fetchStages, fetchWhereIsEverything } from './moveit-api.mjs';
import { appLabel, days, daysAgo, escapeHtml, shortDate } from './format.mjs';
import { buildLanes, laneFor, topLane } from './lanes.mjs';
import { laneHue, stageHue } from './stage-hues.mjs';
import { renderTabs } from './tabs.mjs';
import { AppRail } from './app-rail.mjs';
import { PopOver } from './pop-over.mjs';
import { ComingUpForm } from './coming-up-form.mjs';
import { Register } from './register.mjs';

// The Features register (move-it.md §28.1): every feature and fix as one flat list — find,
// standing questions, facets with counts, sortable columns, paging — each row carrying its
// own small step line, and a click opening its story (question 13) down the right. Nothing
// leaves this list when it goes live; removed rows are here too, grey, behind the facet.
// Every fact is a row from 01, 02 or 13; the page only arranges them.

const DAY = 86_400_000;

class FeaturesPage {
    init(config = {}) {
        this.root = document.getElementById(config.rootId ?? 'moveit-root');
        this.pageSize = config.pageSize ?? 50;
        this.shippedDays = config.shippedDays ?? 14;
        this.now = Date.now();
        this.apps = [];
        this.comingUp = new ComingUpForm(() => this.reload());
        this.renderShell();
        this.load();
    }

    renderShell() {
        this.rail = new AppRail((ids) => { this.apps = ids; this.closeDetail(); this.renderRows(); });
        this.coming = new PopOver({ id: 'mi-coming', align: 'right', wide: true });
        this.root.innerHTML = `
            ${renderTabs('features')}
            <div class="mi-shell" data-ref="shell">
                ${this.rail.html()}
                <div class="mi-pane">
                    <div class="mi-head">
                        <h1 class="mi-head-title">Features and fixes</h1>
                        <div class="rg-head" data-ref="reghead"></div>
                        <p class="mi-showing" data-ref="showing"></p>
                        ${this.coming.html()}
                    </div>
                    <div class="mi-body">
                        <main class="mi-main rg-main" data-ref="main"></main>
                        <aside class="mi-detail rg-detail" data-ref="detail" hidden></aside>
                    </div>
                </div>
            </div>`;
        const ref = (name) => this.root.querySelector(`[data-ref="${name}"]`);
        this.mainEl = ref('main');
        this.detailEl = ref('detail');
        this.rail.mount(ref('shell'), ref('showing'));
        this.coming.mount(this.root);
        this.coming.setButton('+ Coming up');
        this.comingEl = this.coming.panel;
        this.regHeadEl = ref('reghead');
    }

    async load() {
        this.mainEl.innerHTML = '<p class="mi-status">Asking the tracking database…</p>';
        try {
            [this.stages, this.applications, this.items, this.releases, this.lists, this.pictures] = await Promise.all([
                fetchStages(), fetchApplications(), fetchWhereIsEverything(), fetchReleaseStatus(), fetchLists(), fetchFeaturePicture(),
            ]);
        } catch (err) {
            this.mainEl.innerHTML = `<p class="mi-status is-error">${escapeHtml(err.message)}</p>`;
            return;
        }
        this.lanes = buildLanes(this.stages);
        this.top = topLane(this.lanes);
        this.apps = AppRail.remembered(this.applications);
        this.register = new Register(this.registerConfig()).mount(this.regHeadEl, this.mainEl);
        this.renderRows();
        const sel = this.register.selectedRow();
        if (sel) this.showDetail(sel);
    }

    async reload() {
        [this.items, this.applications, this.pictures] = await Promise.all([fetchWhereIsEverything(), fetchApplications(), fetchFeaturePicture()]);
        this.renderRows();
    }

    // ---- rows: one per work item, with what the columns and facets need ----------------

    buildRows() {
        const byRelease = new Map(this.releases.map((r) => [r.ReleaseId, r]));
        const byApp = new Map(this.applications.map((a) => [a.ApplicationId, a]));
        const pictures = new Map((this.pictures ?? []).map((d) => [d.id, d]));
        return this.items.map((item) => {
            const removed = item.Status === 'removed';
            const laneId = removed ? null : laneFor(item.Status, this.lanes);
            const lane = this.lanes.find((l) => l.id === laneId) ?? null;
            const laneIndex = lane ? this.lanes.indexOf(lane) : this.lanes.length;
            const release = byRelease.get(item.ReleaseId) ?? null;
            const shipped = lane != null && lane === this.top && item.Since != null;
            const flags = [];
            if (release?.PastTarget === 1 && !shipped) flags.push('late');
            if (release?.OnHold === 1 && !shipped) flags.push('on hold');
            if (item.Evidence === 'asserted') flags.push('asserted');
            if (item.Status === 'not deployed') flags.push('not seen');
            if (item.Status === 'no evidence') flags.push('no evidence');
            return {
                item, release, lane, laneIndex, removed, shipped, flags,
                app: byApp.get(item.ApplicationId) ?? { ApplicationId: item.ApplicationId },
                picture: pictures.get(item.WorkItemId) ?? null,
                where: removed ? 'removed' : lane.label,
                sinceMs: item.Since ? Date.parse(item.Since) : null,
            };
        });
    }

    renderRows() {
        this.rows = this.buildRows();
        const inScope = (r) => this.apps.length === 0 || this.apps.includes(r.item.ApplicationId);
        this.rail.render(this.applications, this.apps,
            (id) => this.rows.filter((r) => !r.removed && (id == null || r.item.ApplicationId === id)).length);
        this.comingUp.render(this.comingEl, { applications: this.applications, lists: this.lists, applicationId: this.apps.length === 1 ? this.apps[0] : null });
        this.register.setRows(this.rows.filter(inScope));
    }

    registerConfig() {
        const laneLabels = this.lanes.map((l) => l.label);
        const topLabel = this.top?.label;
        return {
            pageSize: this.pageSize,
            rowKey: (r) => r.item.WorkItemId,
            find: (r) => `${r.item.Title} ${r.item.Release ?? ''} ${appLabel(r.app)} ${r.item.IncludedInBuild ?? ''}`,
            defaultSort: { id: 'since', dir: 'desc' },
            emptyText: 'No feature or fix matches. Clear a facet, or widen the find.',
            onPick: (row) => (row ? this.showDetail(row) : this.closeDetail()),
            columns: [
                { id: 'title', label: 'Feature or fix', class: 'rg-c-title', sort: (r) => r.item.Title.toLowerCase(),
                  render: (r) => `<span class="rg-title ${r.removed ? 'is-removed' : ''} is-${escapeHtml(r.item.Kind)}">${escapeHtml(r.item.Title)}</span>${r.item.Kind === 'fix' ? ' <span class="mi-card-kind">fix</span>' : ''}` },
                { id: 'app', label: 'Application', sort: (r) => appLabel(r.app).toLowerCase(), render: (r) => escapeHtml(appLabel(r.app)) },
                { id: 'release', label: 'Release', sort: (r) => r.item.Release?.toLowerCase() ?? null,
                  render: (r) => r.item.Release ? escapeHtml(r.item.Release) : '<span class="mi-muted">no release yet</span>' },
                { id: 'where', label: 'Where', sort: (r) => r.laneIndex, defaultDir: 'desc',
                  render: (r) => r.removed ? '<span class="mi-muted">removed</span>'
                      : `<span class="mi-stage" style="--lane: ${stageHue(r.item.Status)}">${escapeHtml(r.item.Status)}</span>` },
                { id: 'track', label: 'Steps', class: 'rg-c-track', sort: (r) => r.laneIndex, defaultDir: 'desc', render: (r) => this.renderTrack(r) },
                { id: 'since', label: 'Since', sort: (r) => r.sinceMs, defaultDir: 'desc', render: (r) => this.renderSince(r) },
                { id: 'build', label: 'Build', sort: (r) => r.item.IncludedInBuild?.toLowerCase() ?? null,
                  render: (r) => r.item.IncludedInBuild ? `<code>${escapeHtml(r.item.IncludedInBuild)}</code>` : '<span class="mi-muted">not built yet</span>' },
                { id: 'flags', label: 'Flags', class: 'rg-c-wrap', sort: (r) => r.flags.length, defaultDir: 'desc', render: (r) => renderFlags(r.flags) },
            ],
            facets: [
                { id: 'kind', label: 'Kind', value: (r) => r.item.Kind, order: ['feature', 'fix'] },
                { id: 'where', label: 'Where', value: (r) => r.where, order: [...laneLabels, 'removed'], hideUnlessChosen: ['removed'] },
                { id: 'release', label: 'Release', value: (r) => r.item.Release ?? 'no release yet' },
                { id: 'flags', label: 'Flags', value: (r) => r.flags, order: ['late', 'on hold', 'asserted', 'not seen', 'no evidence'] },
            ],
            pills: [
                { id: 'late', label: 'Late', title: 'In a release past its target, not live', facets: { flags: ['late'] } },
                { id: 'hold', label: 'On hold', title: 'In a release on hold', facets: { flags: ['on hold'] } },
                { id: 'heard', label: 'Heard, nothing after 30 days', title: 'Recorded as coming 30 or more days ago and still in no build',
                  facets: { where: ['Coming'] }, test: (r) => r.item.DaysThere >= 30 },
                { id: 'not-seen', label: 'Built, not seen', title: 'A build is named but has not been seen at any stage', facets: { where: ['Built, not seen'] } },
                { id: 'asserted', label: 'Reported, not observed', title: 'Where it is was recorded by hand, not seen by Census', facets: { flags: ['asserted'] } },
                ...(topLabel ? [{ id: 'live', label: `Live in ${this.shippedDays} days`, title: `Reached ${topLabel} in the last ${this.shippedDays} days`,
                    facets: { where: [topLabel] }, test: (r) => r.sinceMs != null && this.now - r.sinceMs <= this.shippedDays * DAY }] : []),
            ],
        };
    }

    renderSince(r) {
        if (!r.item.Since) return '';
        const n = daysAgo(r.item.Since, this.now);
        if (r.shipped) return `<span class="rg-shipped">shipped ${escapeHtml(shortDate(r.item.Since))}</span> <span class="mi-muted">${days(n)} ago</span>`;
        if (r.removed) return `<span class="mi-muted">${escapeHtml(shortDate(r.item.Since))}</span>`;
        return `${escapeHtml(shortDate(r.item.Since))} <span class="mi-muted">${days(n)}${r.lane && r.lane.stages.length > 1 ? ` in ${escapeHtml(r.item.Status)}` : ''}</span>`;
    }

    // The row's own step line: one node per lane, lit as far as the item has gone, the days
    // between stage arrivals written under the gaps (13's stages[]). Asserted positions are
    // dashed; a removed item is all grey with a cross where it stopped.
    renderTrack(r) {
        const at = r.removed ? -1 : r.laneIndex;
        const stagesReached = r.picture?.stages ?? [];
        const arrival = (lane) => stagesReached.find((s) => lane.stages.some((name) => name.toLowerCase() === String(s.stage).toLowerCase()));
        const gap = (n) => {
            const lane = this.lanes[n];
            if (!lane.stages.length) return '';
            const a = arrival(lane);
            if (!a) return '';
            const prev = this.lanes.slice(0, n).reverse().find((l) => l.stages.length && arrival(l));
            const d = prev ? a.fromPrevious : (r.picture?.recorded?.at ? (Date.parse(a.firstArrived) - Date.parse(r.picture.recorded.at)) / DAY : null);
            if (d == null) return '';
            const whole = Math.round(Number(d));
            if (whole < 0) return '';     // recorded after it had already arrived: the entry lag, not a step
            return `<span class="rg-gap-days" title="${prev ? `${whole} days from ${escapeHtml(prev.label)} to ${escapeHtml(lane.label)}` : `${whole} days from recorded to ${escapeHtml(lane.label)}`}">${whole}d</span>`;
        };
        return `<span class="rg-track ${r.removed ? 'is-removed' : ''}" aria-label="${escapeHtml(r.removed ? 'removed' : r.where)}">${this.lanes.map((lane, n) => {
            const a = arrival(lane);
            const when = n < at ? 'is-done' : n === at ? 'is-current' : 'is-next';
            const title = `${lane.label}${a ? ` — ${shortDate(a.firstArrived)}${a.build ? `, ${a.build}` : ''}${a.evidence === 'asserted' ? ', asserted' : ''}` : n === at && r.item.Since ? ` — ${shortDate(r.item.Since)}` : ''}`;
            return `${n ? `<span class="rg-seg ${n <= at ? 'is-done' : ''}">${gap(n)}</span>` : ''}<span class="rg-node ${when} ${a?.evidence === 'asserted' || (n === at && r.item.Evidence === 'asserted') ? 'is-asserted' : ''}" style="--hue: ${lane.stages.length ? laneHue(lane) : '#8e96a3'}" title="${escapeHtml(title)}"></span>`;
        }).join('')}</span>`;
    }

    // ---- the story ----------------------------------------------------------------------

    closeDetail() {
        this.register?.clearSelection();
        this.detailEl.hidden = true;
        this.detailEl.innerHTML = '';
    }

    showDetail(row) {
        this.detailEl.innerHTML = `
            <button type="button" class="mi-detail-close" data-ref="close" aria-label="Close">×</button>
            ${this.renderStory(row)}`;
        this.detailEl.hidden = false;
        this.detailEl.querySelector('[data-ref="close"]').addEventListener('click', () => this.closeDetail());
    }

    renderStory(r) {
        const d = r.picture;
        const item = r.item;
        const rel = d?.release;
        const entries = [];
        const push = (at, html, hue = null, cls = '') => entries.push({ at: at ? Date.parse(at) : null, html, hue, cls });
        if (d?.recorded?.at) push(d.recorded.at, `Recorded${d.recorded.by ? ` by ${escapeHtml(d.recorded.by)}` : ''}${d.foundInStage ? `, found in ${escapeHtml(d.foundInStage)}` : ''}${!rel ? ' <span class="mi-muted">— not in a release yet</span>' : ''}`);
        if (rel?.id) push(d.recorded?.at, `In <a href="/moveit/release/${rel.id}">${escapeHtml(rel.name)}</a> <span class="mi-muted">${escapeHtml(rel.kind)}${rel.targetDate ? `, target ${escapeHtml(shortDate(rel.targetDate))}` : ''}</span>${rel.pastTarget === 1 && !r.shipped ? ' <span class="mi-flag is-alert">late</span>' : ''}`, null, 'is-release');
        for (const s of d?.stages ?? []) {
            const prev = s.fromPrevious != null ? `${Math.round(Number(s.fromPrevious))} days after the stage before` : s.fromFirstSeen != null && Number(s.fromFirstSeen) > 0 ? `${Math.round(Number(s.fromFirstSeen))} days after first seen` : '';
            push(s.firstArrived, `Reached <span class="mi-stage" style="--lane: ${stageHue(s.stage)}">${escapeHtml(s.stage)}</span>${s.build ? ` <code>${escapeHtml(s.build)}</code>` : ''}${s.machine ? ` <span class="mi-muted">on ${escapeHtml(s.machine)}</span>` : ''}${s.evidence === 'asserted' ? ' <span class="mi-muted">reported, not observed</span>' : ''}${prev ? `<br><span class="mi-muted">${prev}</span>` : ''}`, stageHue(s.stage));
        }
        if (rel?.approval?.at) push(rel.approval.at, `Approved${rel.approval.by ? ` by ${escapeHtml(rel.approval.by)}` : ''}${rel.approval.build ? ` for <code>${escapeHtml(rel.approval.build)}</code>` : ''}`, '#0b5394');
        for (const e of d?.events ?? []) {
            if (e.kind === 'hold') push(e.at, `Release put on hold${e.note ? `: ${escapeHtml(e.note)}` : ''}`, '#c98a00');
            if (e.kind === 'resumed') push(e.at, 'Release resumed', '#c98a00');
            if (e.kind === 'abandoned') push(e.at, `Release abandoned${e.note ? `: ${escapeHtml(e.note)}` : ''}`, '#b3261e');
        }
        if (d?.removed?.at) push(d.removed.at, `Pulled from the release${d.removed.note ? `: ${escapeHtml(d.removed.note)}` : ''}`, '#b3261e');
        entries.sort((a, b) => (a.at ?? 0) - (b.at ?? 0));

        const lat = d?.latency ?? {};
        const num = (v, unit = 'days') => v == null ? '<span class="mi-muted">—</span>' : `${Number(v) % 1 === 0 ? Number(v) : Number(v).toFixed(1)} ${unit}`;
        const links = [...(d?.links?.needs ?? []).map((l) => ({ ...l, dir: 'needs' })), ...(d?.links?.neededBy ?? []).map((l) => ({ ...l, dir: 'needed by' }))];
        return `
            <h2 class="mi-detail-title">${escapeHtml(item.Title)}</h2>
            <p class="mi-detail-sub">${escapeHtml(item.Kind)}${item.Release ? ` in ${escapeHtml(item.Release)}` : ''} for ${escapeHtml(appLabel(r.app))}</p>
            <p class="rg-now">Now: ${r.removed ? '<span class="mi-muted">removed</span>' : `<span class="mi-stage" style="--lane: ${stageHue(item.Status)}">${escapeHtml(item.Status)}</span>`}${item.Evidence ? ` <span class="mi-muted">${escapeHtml(item.Evidence)}</span>` : ''}${item.Since ? ` <span class="mi-muted">· since ${escapeHtml(shortDate(item.Since))}, ${days(daysAgo(item.Since, this.now))}${r.shipped ? ' ago' : ''}</span>` : ''}</p>
            ${d ? '' : '<p class="mi-status">The story could not be loaded for this item.</p>'}
            <ol class="rg-story">
                ${entries.map((e) => `<li class="rg-story-row ${e.cls}" style="--hue: ${e.hue ?? '#8e96a3'}"><span class="rg-story-date">${e.at ? escapeHtml(shortDate(new Date(e.at).toISOString())) : ''}</span><span class="rg-story-text">${e.html}</span></li>`).join('')}
            </ol>
            ${item.Description ? `<p class="rg-note">${escapeHtml(item.Description)}</p>` : ''}
            <h3 class="mi-detail-h3">Timing</h3>
            <dl class="mi-detail-grid">
                <div class="mi-dt">First seen</div><div class="mi-dd">${lat.firstSeen ? escapeHtml(shortDate(lat.firstSeen)) : '<span class="mi-muted">—</span>'}</div>
                <div class="mi-dt">Entry lag</div><div class="mi-dd">${num(lat.entryLag)}</div>
                <div class="mi-dt">To ${escapeHtml(this.top?.label ?? 'PROD')}</div><div class="mi-dd">${num(lat.firstSeenToProd)}</div>
                <div class="mi-dt">Approval to live</div><div class="mi-dd">${num(lat.approvalToProd)}</div>
                <div class="mi-dt">Days there</div><div class="mi-dd">${num(lat.daysThere)}</div>
            </dl>
            ${d?.builtBy || d?.externalRef || item.IncludedInBuild ? `
            <h3 class="mi-detail-h3">Record</h3>
            <dl class="mi-detail-grid">
                ${item.IncludedInBuild ? `<div class="mi-dt">Build</div><div class="mi-dd"><code>${escapeHtml(item.IncludedInBuild)}</code></div>` : ''}
                ${d?.builtBy ? `<div class="mi-dt">Built by</div><div class="mi-dd">${escapeHtml(d.builtBy)}</div>` : ''}
                ${d?.externalRef ? `<div class="mi-dt">Reference</div><div class="mi-dd">${escapeHtml(d.externalRef)}</div>` : ''}
            </dl>` : ''}
            ${links.length ? `
            <h3 class="mi-detail-h3">Links</h3>
            <ul class="mi-detail-items">${links.map((l) => `<li><span>${escapeHtml(l.dir)} <strong>${escapeHtml(l.title)}</strong>${l.release ? ` <span class="mi-muted">in ${escapeHtml(l.release)}</span>` : ''}</span><span class="mi-stage" style="--lane: ${stageHue(l.status)}">${escapeHtml(l.status)}</span></li>`).join('')}</ul>` : ''}
            ${rel?.id ? `<p class="mi-detail-link"><a class="mi-button is-quiet" href="/moveit/release/${rel.id}">Open the release</a></p>` : ''}`;
    }
}

export function renderFlags(flags) {
    const tone = { late: 'is-alert', 'on hold': 'is-hold', asserted: 'is-ask' };
    return flags.map((f) => `<span class="mi-flag ${tone[f] ?? ''}">${escapeHtml(f)}</span>`).join(' ');
}

export default new FeaturesPage();
