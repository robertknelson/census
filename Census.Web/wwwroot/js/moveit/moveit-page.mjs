import { fetchApplications, fetchReadyToApprove, fetchReleaseStatus, fetchStages, fetchWhereIsEverything } from './moveit-api.mjs';
import { appLabel, escapeHtml } from './format.mjs';
import { buildLanes } from './lanes.mjs';
import { CountsPanel } from './counts-panel.mjs';
import { BoardPanel, renderDetail } from './board-panel.mjs';
import { ReleasePanel, renderReleaseDetail } from './release-panel.mjs';
import { renderTabs } from './tabs.mjs';

// The board (move-it.md §13, §18): the governance reader's page. Read-only. Two views of the
// same lanes: features and fixes (question 01 chip by chip, the default) and releases
// (?view=releases). The executive's page is Division (§19). The counts strip and the application filter serve both; a card or chip
// opens its detail. Every fact on the page is a row from a question file; the page only
// arranges them.

class MoveItPage {
    init(config = {}) {
        this.root = document.getElementById(config.rootId ?? 'moveit-root');
        this.shippedDays = config.shippedDays ?? 14;
        this.app = null;                  // ApplicationId filter, null = all
        this.view = new URLSearchParams(window.location.search).get('view') === 'releases' ? 'releases' : 'items';
        this.now = Date.now();
        this.counts = new CountsPanel();
        this.board = new BoardPanel((item) => this.showDetail(item));
        this.releaseBoard = new ReleasePanel((card) => this.showReleaseDetail(card));
        this.renderShell();
        this.load();
    }

    renderShell() {
        this.root.innerHTML = `
            <header class="mi-header">
                <div class="mi-masthead">
                    ${renderTabs('board')}
                    <h1 class="mi-title">Where is it</h1>
                    <p class="mi-tagline" data-ref="tagline"></p>
                </div>
                <div class="mi-header-side">
                    <nav class="mi-filter" data-ref="filter" aria-label="Application"></nav>
                    <div class="mi-toggle" role="group" aria-label="View" data-ref="view">
                        <button type="button" data-view="releases">Releases</button>
                        <button type="button" data-view="items">Features and fixes</button>
                    </div>
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
        this.taglineEl = this.root.querySelector('[data-ref="tagline"]');
        this.root.querySelectorAll('[data-view]').forEach((btn) => btn.addEventListener('click', () => this.setView(btn.dataset.view)));
        this.renderToggle();
    }

    setView(view) {
        if (view === this.view) return;
        this.view = view;
        const url = new URL(window.location.href);
        if (view === 'releases') url.searchParams.set('view', 'releases'); else url.searchParams.delete('view');
        window.history.replaceState(null, '', url);
        this.closeDetail();
        this.renderToggle();
        if (this.items) { this.renderFilter(); this.render(); }
    }

    renderToggle() {
        this.root.querySelectorAll('[data-view]').forEach((btn) => btn.classList.toggle('is-active', btn.dataset.view === this.view));
        this.taglineEl.textContent = this.view === 'releases'
            ? 'Every release in flight, the stage the evidence puts it at, and what it is waiting on.'
            : 'Every feature and fix, and the stage the evidence puts it at.';
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
        const counted = this.view === 'releases'
            ? this.releases.filter((r) => r.HighestStage !== 'abandoned')
            : this.items.filter((i) => i.Status !== 'removed');
        this.filterEl.innerHTML = [
            chip(null, 'All applications', counted.length),
            ...this.applications.map((a) => chip(a.ApplicationId, appLabel(a),
                counted.filter((row) => row.ApplicationId === a.ApplicationId).length)),
        ].join('');
        this.filterEl.querySelectorAll('[data-app]').forEach((btn) => btn.addEventListener('click', () => {
            this.app = btn.dataset.app === '' ? null : Number(btn.dataset.app);
            this.closeDetail();
            this.renderFilter();
            this.render();
        }));
    }

    scoped() {
        const inScope = (row) => this.app == null || row.ApplicationId === this.app;
        return {
            lanes: this.lanes,
            now: this.now,
            view: this.view,
            shippedDays: this.shippedDays,
            applications: this.applications.filter(inScope),
            items: this.items.filter(inScope),
            releases: this.releases.filter(inScope),
            candidates: this.candidates.filter(inScope),
        };
    }

    render() {
        const data = this.scoped();
        this.counts.render(this.countsEl, data);
        const empty = this.view === 'releases' ? data.releases.length === 0 : data.items.length === 0;
        if (empty) {
            this.mainEl.innerHTML = '<p class="mi-status">Nothing is recorded for this application yet. Releases and their features and fixes are named on the History page; the board fills in from there.</p>';
            return;
        }
        (this.view === 'releases' ? this.releaseBoard : this.board).render(this.mainEl, data);
    }

    closeDetail() {
        this.board.select(null);
        this.releaseBoard.select(null);
        this.detailEl.hidden = true;
        this.detailEl.innerHTML = '';
    }

    openDetail(html) {
        this.detailEl.innerHTML = `
            <button type="button" class="mi-detail-close" data-ref="close" aria-label="Close">×</button>
            ${html}`;
        this.detailEl.hidden = false;
        this.detailEl.querySelector('[data-ref="close"]').addEventListener('click', () => this.closeDetail());
    }

    showDetail(item) {
        if (!item) { this.closeDetail(); return; }
        const release = this.releases.find((r) => r.ReleaseId === item.ReleaseId);
        const app = this.applications.find((a) => a.ApplicationId === item.ApplicationId);
        this.openDetail(renderDetail(item, release, app, this.now));
    }

    showReleaseDetail(card) {
        if (!card) { this.closeDetail(); return; }
        const r = card.release;
        const candidate = this.candidates.find((c) => c.ReleaseId === r.ReleaseId);
        const app = this.applications.find((a) => a.ApplicationId === r.ApplicationId);
        this.openDetail(renderReleaseDetail(card, candidate, app, this.items, this.now));
    }
}

export default new MoveItPage();
