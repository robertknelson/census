import { fetchApplications, fetchHistory, fetchLists, fetchReleases, fetchStages, fetchWhereIsEverything } from './moveit-api.mjs';
import { appLabel, days, daysAgo, escapeHtml, shortDate } from './format.mjs';
import { stageHue } from './stage-hues.mjs';
import { NameBuildForm } from './name-build-form.mjs';

// History (move-it.md §15): the ledger newest first, and the one place anything is entered.
// A build nobody has named is the inbox, drawn in place; clicking it opens the form with the
// build filled in. "New release" opens the same form with no build, for work in progress.
// The lane board stays read-only; this page is the entrant's.

class HistoryPage {
    init(config = {}) {
        this.root = document.getElementById(config.rootId ?? 'moveit-root');
        this.app = null;
        this.now = Date.now();
        this.form = new NameBuildForm(() => this.reload());
        this.renderShell();
        this.load();
    }

    renderShell() {
        this.root.innerHTML = `
            <header class="mi-header">
                <div class="mi-masthead">
                    <nav class="mi-crumbs"><a href="/moveit">Where is it</a></nav>
                    <h1 class="mi-title">History</h1>
                    <p class="mi-tagline">Every build the pings saw arrive, newest first. Name what was in the ones you remember.</p>
                </div>
                <div class="mi-header-side">
                    <nav class="mi-filter" data-ref="filter" aria-label="Application"></nav>
                    <button type="button" class="mi-button is-primary" data-ref="new">New release</button>
                </div>
            </header>
            <div class="mi-body">
                <main class="mi-main" data-ref="main"></main>
                <aside class="mi-detail mi-entry" data-ref="entry" hidden></aside>
            </div>`;
        this.filterEl = this.root.querySelector('[data-ref="filter"]');
        this.mainEl = this.root.querySelector('[data-ref="main"]');
        this.entryEl = this.root.querySelector('[data-ref="entry"]');
        this.root.querySelector('[data-ref="new"]').addEventListener('click', () => this.openForm({ applicationId: this.app, build: null }));
    }

    async load() {
        this.mainEl.innerHTML = '<p class="mi-status">Asking the tracking database…</p>';
        try {
            [this.stages, this.applications, this.lists, this.history, this.releases, this.items] = await Promise.all([
                fetchStages(), fetchApplications(), fetchLists(), fetchHistory(), fetchReleases(), fetchWhereIsEverything(),
            ]);
        } catch (err) {
            this.mainEl.innerHTML = `<p class="mi-status is-error">${escapeHtml(err.message)}</p>`;
            return;
        }
        this.renderFilter();
        this.render();
    }

    async reload() {
        [this.history, this.releases, this.items, this.applications] = await Promise.all([
            fetchHistory(), fetchReleases(), fetchWhereIsEverything(), fetchApplications(),
        ]);
        this.renderFilter();
        this.render();
        this.form.refresh(this.data());
    }

    data() {
        return {
            applications: this.applications, releases: this.releases, items: this.items,
            stages: this.stages, lists: this.lists,
        };
    }

    renderFilter() {
        const chip = (id, label, count) => `
            <button type="button" class="mi-filter-chip ${this.app === id ? 'is-active' : ''}" data-app="${id ?? ''}">
                ${escapeHtml(label)}<span class="mi-filter-count">${count}</span>
            </button>`;
        const unnamed = (rows) => rows.filter((r) => !r.ReleaseId).length;
        this.filterEl.innerHTML = [
            chip(null, 'All applications', unnamed(this.history)),
            ...this.applications.map((a) => chip(a.ApplicationId, appLabel(a),
                unnamed(this.history.filter((r) => r.ApplicationId === a.ApplicationId)))),
        ].join('');
        this.filterEl.querySelectorAll('[data-app]').forEach((btn) => btn.addEventListener('click', () => {
            this.app = btn.dataset.app === '' ? null : Number(btn.dataset.app);
            this.renderFilter();
            this.render();
        }));
    }

    render() {
        const rows = this.history.filter((r) => this.app == null || r.ApplicationId === this.app);
        if (rows.length === 0) {
            this.mainEl.innerHTML = '<p class="mi-status">The ledger has no deployments for this application. Either its endpoints send no deployment block yet, or the backfill has not run.</p>';
            return;
        }
        const appsById = new Map(this.applications.map((a) => [a.ApplicationId, a]));
        this.mainEl.innerHTML = `
            <table class="mi-hist">
                <thead>
                    <tr>
                        <th>Detected</th><th>Application</th><th>Stage</th><th>Build</th><th>Machine</th><th>Branch</th><th>Named</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map((r) => this.renderRow(r, appsById.get(r.ApplicationId))).join('')}
                </tbody>
            </table>`;
        this.mainEl.querySelectorAll('[data-name]').forEach((btn) => btn.addEventListener('click', () => {
            const row = this.history.find((r) => r.DeploymentId === Number(btn.dataset.name));
            this.openForm({ applicationId: row.ApplicationId, build: row.Build });
        }));
    }

    renderRow(r, app) {
        const ago = daysAgo(r.DetectedAt, this.now);
        const mismatch = r.ReportedStage && r.Stage && r.ReportedStage.toLowerCase() !== r.Stage.toLowerCase();
        return `
            <tr class="${r.IsCurrent ? 'is-current' : ''} ${r.ReleaseId ? '' : 'is-unnamed'}">
                <td class="mi-hist-when">
                    <span>${escapeHtml(shortDate(r.DetectedAt))}</span>
                    <span class="mi-muted">${ago == null ? '' : `${days(ago)} ago`}${r.IsCurrent ? ' · on the box now' : ''}</span>
                </td>
                <td class="${app?.Name ? '' : 'mi-muted'}">${escapeHtml(appLabel(app ?? { ApplicationId: r.ApplicationId }))}</td>
                <td><span class="mi-stage" style="--lane: ${stageHue(r.Stage)}">${escapeHtml(r.Stage)}</span>
                    ${mismatch ? `<span class="mi-flag is-alert" title="The payload says ${escapeHtml(r.ReportedStage)}">says ${escapeHtml(r.ReportedStage)}</span>` : ''}</td>
                <td><code>${escapeHtml(r.Build)}</code></td>
                <td class="mi-muted">${escapeHtml(r.Machine)}</td>
                <td class="mi-muted">${escapeHtml(r.Branch ?? '')}</td>
                <td>
                    ${r.ReleaseId
                        ? `<span>${escapeHtml(r.Release)}</span>${r.Claims > 1 ? `<span class="mi-muted"> +${r.Claims - 1}</span>` : ''}
                           <button type="button" class="mi-button is-quiet" data-name="${r.DeploymentId}">Add to</button>`
                        : `<button type="button" class="mi-button" data-name="${r.DeploymentId}">Name it</button>`}
                </td>
            </tr>`;
    }

    openForm(context) {
        this.entryEl.hidden = false;
        this.form.open(this.entryEl, context, this.data(), () => { this.entryEl.hidden = true; this.entryEl.innerHTML = ''; });
    }
}

export default new HistoryPage();
