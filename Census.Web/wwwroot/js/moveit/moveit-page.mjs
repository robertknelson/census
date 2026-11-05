import { fetchApplications, fetchLists, fetchReadyToApprove, fetchReleaseStatus, fetchStages, fetchWhereIsEverything } from './moveit-api.mjs';
import { appLabel, escapeHtml } from './format.mjs';
import { buildLanes, unorderedStages } from './lanes.mjs';
import { CountsPanel } from './counts-panel.mjs';
import { BoardPanel, renderDetail } from './board-panel.mjs';
import { ReleasePanel, renderReleaseDetail } from './release-panel.mjs';
import { ComingUpForm } from './coming-up-form.mjs';
import { ITEMS, fetchWrites, writable } from './writes.mjs';
import { renderTabs } from './tabs.mjs';
import { AppRail } from './app-rail.mjs';
import { PopOver } from './pop-over.mjs';

// The board (move-it.md §13, §18): the governance reader's page. Two views of the same
// lanes: releases (the default) and features and fixes (question 01 chip by chip,
// ?view=items). The executive's page is Division (§19). The counts strip and the application
// rail serve both; a card or chip opens its detail. Every fact on the page is a row from a
// question file; the page only arranges them. The one write is the notebook's line above the
// item lanes (§20), behind *Coming up* in the header (§26): what was heard is coming, for
// which application.

class MoveItPage {
    init(config = {}) {
        this.root = document.getElementById(config.rootId ?? 'moveit-root');
        this.shippedDays = config.shippedDays ?? 14;
        this.dueSoonDays = config.dueSoonDays ?? 7;
        this.apps = [];                   // ApplicationId filter, empty = all
        this.view = new URLSearchParams(window.location.search).get('view') === 'releases' ? 'releases' : 'items';
        this.now = Date.now();
        this.counts = new CountsPanel();
        this.board = new BoardPanel((item) => this.showDetail(item));
        this.releaseBoard = new ReleasePanel((card) => this.showReleaseDetail(card));
        this.comingUp = new ComingUpForm(() => this.reloadItems());
        this.renderShell();
        this.load();
    }

    renderShell() {
        this.rail = new AppRail((ids) => {
            this.apps = ids;
            this.closeDetail();
            this.renderFilter();
            this.render();
        });
        this.coming = new PopOver({ id: 'mi-coming', align: 'right', wide: true });
        this.root.innerHTML = `
            ${renderTabs('board')}
            <div class="mi-shell" data-ref="shell">
                ${this.rail.html()}
                <div class="mi-pane">
                    <div class="mi-head">
                        <nav class="mi-picks" data-ref="view" aria-label="View">
                            <button type="button" class="mi-pick" data-view="releases" title="Every release in flight, the stage the evidence puts it at, and what it is waiting on.">Releases</button>
                            <button type="button" class="mi-pick" data-view="items" title="Every feature and fix, and the stage the evidence puts it at.">Features and fixes</button>
                        </nav>
                        <div class="mi-head-numbers" data-ref="counts"></div>
                        <p class="mi-showing" data-ref="showing"></p>
                        ${this.coming.html()}
                    </div>
                    <div class="mi-body">
                        <main class="mi-main" data-ref="main"></main>
                        <aside class="mi-detail" data-ref="detail" hidden></aside>
                    </div>
                </div>
            </div>`;
        const ref = (name) => this.root.querySelector(`[data-ref="${name}"]`);
        this.countsEl = ref('counts');
        this.mainEl = ref('main');
        this.detailEl = ref('detail');
        this.rail.mount(ref('shell'), ref('showing'));
        this.coming.mount(this.root);
        this.coming.setButton('+ Coming up');
        this.comingEl = this.coming.panel;
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
        this.root.querySelectorAll('[data-view]').forEach((btn) => {
            btn.classList.toggle('is-active', btn.dataset.view === this.view);
            btn.setAttribute('aria-pressed', String(btn.dataset.view === this.view));
        });
    }

    async load() {
        this.mainEl.innerHTML = '<p class="mi-status">Asking the tracking database…</p>';
        try {
            [this.stages, this.applications, this.items, this.releases, this.candidates, this.lists, this.writes] = await Promise.all([
                fetchStages(), fetchApplications(), fetchWhereIsEverything(), fetchReleaseStatus(), fetchReadyToApprove(), fetchLists(), fetchWrites(),
            ]);
        } catch (err) {
            this.mainEl.innerHTML = `<p class="mi-status is-error">${escapeHtml(err.message)}</p>`;
            return;
        }
        this.lanes = buildLanes(this.stages);
        this.apps = AppRail.remembered(this.applications);
        this.renderFilter();
        this.render();
    }

    // After the notebook takes a line (§20): the items and the application list, since a
    // first item for an application puts it on the board.
    async reloadItems() {
        [this.items, this.applications] = await Promise.all([fetchWhereIsEverything(), fetchApplications()]);
        this.renderFilter();
        this.render();
    }

    renderFilter() {
        const counted = this.view === 'releases'
            ? this.releases.filter((r) => r.HighestStage !== 'abandoned')
            : this.items.filter((i) => i.Status !== 'removed');
        this.rail.render(this.applications, this.apps,
            (id) => (id == null ? counted : counted.filter((row) => row.ApplicationId === id)).length);
    }

    scoped() {
        const inScope = (row) => this.apps.length === 0 || this.apps.includes(row.ApplicationId);
        return {
            lanes: this.lanes,
            now: this.now,
            view: this.view,
            shippedDays: this.shippedDays,
            dueSoonDays: this.dueSoonDays,
            applications: this.applications.filter(inScope),
            items: this.items.filter(inScope),
            releases: this.releases.filter(inScope),
            candidates: this.candidates.filter(inScope),
        };
    }

    render() {
        const data = this.scoped();
        data.laneCounts = this.counts.laneCounts(data);
        this.counts.render(this.countsEl, data);
        this.coming.hide(this.view !== 'items');
        if (this.view === 'items') {
            // Adding what is coming is offered only where the server would accept it (census-on-apptrak.md §7).
            const open = writable(this.writes, ITEMS, this.applications);
            if (open.length) this.comingUp.render(this.comingEl, { applications: open, lists: this.lists, applicationId: this.apps.length === 1 && open.some((a) => a.ApplicationId === this.apps[0]) ? this.apps[0] : null });
            else this.comingEl.innerHTML = '';
        }
        const empty = this.view === 'releases' ? data.releases.length === 0 : data.items.length === 0;
        if (empty) {
            this.mainEl.innerHTML = `<p class="mi-status">Nothing is recorded for ${this.apps.length > 1 ? 'these applications' : 'this application'} yet. Releases and their features and fixes are named on the History page; the board fills in from there.</p>`;
            return;
        }
        (this.view === 'releases' ? this.releaseBoard : this.board).render(this.mainEl, data);
        if (unorderedStages(this.stages)) this.mainEl.insertAdjacentHTML('afterbegin', this.renderUnordered());
    }

    // AppTrak's stage list carries one Sort for every seen stage (§27): nothing here can rank
    // them. The lanes merge, "highest stage" and "late" are guesses, and the page says so.
    renderUnordered() {
        const names = this.stages.map((s) => escapeHtml(s.Stage)).join(', ');
        return `
            <p class="mi-status is-error mi-unordered">The stage list has no order: ${names} all carry Sort ${escapeHtml(String(this.stages[0].Sort))} in AppTrak's <code>core.SelectItem</code>,
            so they share one lane and <em>highest stage</em>, <em>late</em> and <em>to PROD</em> are guesses. Set <code>Sort</code> on those rows (lowest first, peers equal) and reload.</p>`;
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
        this.openDetail(renderDetail(item, release, app, this.now, this.lanes));
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
