import { fetchApplications, fetchReadyToApprove, fetchReleaseStatus, fetchStages, fetchWhereIsEverything } from './moveit-api.mjs';
import { appLabel, escapeHtml } from './format.mjs';
import { buildLanes } from './lanes.mjs';
import { CountsPanel } from './counts-panel.mjs';
import { BoardPanel, renderDetail } from './board-panel.mjs';

// The board (move-it.md §13): the governance reader's page. Read-only. Level 1 — the dashboard:
// the counts strip and question 01 as lanes, filtered by application; a chip opens its detail.
// Every fact on the page is a row from a question file; the page only arranges them.

class MoveItPage {
    init(config = {}) {
        this.root = document.getElementById(config.rootId ?? 'moveit-root');
        this.app = null;                  // ApplicationId filter, null = all
        this.now = Date.now();
        this.counts = new CountsPanel();
        this.board = new BoardPanel((item) => this.showDetail(item));
        this.renderShell();
        this.load();
    }

    renderShell() {
        this.root.innerHTML = `
            <header class="mi-header">
                <div class="mi-masthead">
                    <h1 class="mi-title">Where is it</h1>
                    <p class="mi-tagline">Every feature and fix, and the stage the evidence puts it at.</p>
                </div>
                <div class="mi-header-side">
                    <nav class="mi-filter" data-ref="filter" aria-label="Application"></nav>
                    <a class="mi-button is-quiet" href="/moveit/history">History</a>
                </div>
            </header>
            <div class="mi-strip" data-ref="counts"></div>
            <div class="mi-body">
                <main class="mi-main" data-ref="main"></main>
                <aside class="mi-detail" data-ref="detail" hidden></aside>
            </div>`;
        this.filterEl = this.root.querySelector('[data-ref="filter"]');
        this.countsEl = this.root.querySelector('[data-ref="counts"]');
        this.mainEl = this.root.querySelector('[data-ref="main"]');
        this.detailEl = this.root.querySelector('[data-ref="detail"]');
    }

    async load() {
        this.mainEl.innerHTML = '<p class="mi-status">Asking the tracking database…</p>';
        try {
            [this.stages, this.applications, this.items, this.releases, this.candidates] = await Promise.all([
                fetchStages(), fetchApplications(), fetchWhereIsEverything(), fetchReleaseStatus(), fetchReadyToApprove(),
            ]);
        } catch (err) {
            this.mainEl.innerHTML = `<p class="mi-status is-error">${escapeHtml(err.message)}</p>`;
            return;
        }
        this.lanes = buildLanes(this.stages);
        this.renderFilter();
        this.render();
    }

    renderFilter() {
        const chip = (id, label, count) => `
            <button type="button" class="mi-filter-chip ${this.app === id ? 'is-active' : ''}" data-app="${id ?? ''}">
                ${escapeHtml(label)}<span class="mi-filter-count">${count}</span>
            </button>`;
        const open = this.items.filter((i) => i.Status !== 'removed');
        this.filterEl.innerHTML = [
            chip(null, 'All applications', open.length),
            ...this.applications.map((a) => chip(a.ApplicationId, appLabel(a),
                open.filter((i) => i.ApplicationId === a.ApplicationId).length)),
        ].join('');
        this.filterEl.querySelectorAll('[data-app]').forEach((btn) => btn.addEventListener('click', () => {
            this.app = btn.dataset.app === '' ? null : Number(btn.dataset.app);
            this.showDetail(null);
            this.renderFilter();
            this.render();
        }));
    }

    scoped() {
        const inScope = (row) => this.app == null || row.ApplicationId === this.app;
        return {
            lanes: this.lanes,
            now: this.now,
            applications: this.applications.filter(inScope),
            items: this.items.filter(inScope),
            releases: this.releases.filter(inScope),
            candidates: this.candidates.filter(inScope),
        };
    }

    render() {
        const data = this.scoped();
        this.counts.render(this.countsEl, data);
        if (data.items.length === 0) {
            this.mainEl.innerHTML = '<p class="mi-status">No work items are recorded for this application yet. A release with its features and fixes is entered in AppTrak; the board fills in from there.</p>';
            return;
        }
        this.board.render(this.mainEl, data);
    }

    showDetail(item) {
        if (!item) {
            this.board.select(null);
            this.detailEl.hidden = true;
            this.detailEl.innerHTML = '';
            return;
        }
        const release = this.releases.find((r) => r.ReleaseId === item.ReleaseId);
        const app = this.applications.find((a) => a.ApplicationId === item.ApplicationId);
        this.detailEl.innerHTML = `
            <button type="button" class="mi-detail-close" data-ref="close" aria-label="Close">×</button>
            ${renderDetail(item, release, app, this.now)}`;
        this.detailEl.hidden = false;
        this.detailEl.querySelector('[data-ref="close"]').addEventListener('click', () => this.showDetail(null));
    }
}

export default new MoveItPage();
