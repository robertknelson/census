import { fetchApplications, fetchApprovalVsProd, fetchEvents, fetchHistory, fetchLists, fetchReleaseStatus, fetchReleases, fetchStages, fetchWhereIsEverything } from './moveit-api.mjs';
import { appLabel, days, daysAgo, escapeHtml, shortDate } from './format.mjs';
import { stageHue } from './stage-hues.mjs';
import { NameBuildForm } from './name-build-form.mjs';
import { RELEASES, fetchWrites, may, writable } from './writes.mjs';
import { findNeeds, renderNeeds } from './needs-a-word.mjs';
import { renderTabs } from './tabs.mjs';
import { AppRail } from './app-rail.mjs';
import { PopOver } from './pop-over.mjs';

// History (move-it.md §15): the ledger newest first, and the one place anything is entered.
// A build nobody has named is the inbox, drawn in place; clicking it opens the form with the
// build filled in. "New release" opens the same form with no build, for work in progress.
// The lane board stays read-only; this page is the entrant's.

class HistoryPage {
    init(config = {}) {
        this.root = document.getElementById(config.rootId ?? 'moveit-root');
        this.apps = [];
        this.now = Date.now();
        this.settings = { staleDays: config.staleDays ?? 14, comingDays: config.comingDays ?? 60 };
        this.form = new NameBuildForm(() => this.reload());
        this.renderShell();
        this.load();
    }

    renderShell() {
        this.rail = new AppRail((ids) => {
            this.apps = ids;
            this.renderFilter();
            this.render();
        });
        this.needs = new PopOver({ id: 'mi-needs', wide: true });
        this.root.innerHTML = `
            ${renderTabs('history')}
            <div class="mi-shell" data-ref="shell">
                ${this.rail.html()}
                <div class="mi-pane">
                    <div class="mi-head">
                        <h1 class="mi-head-title" title="Every build the pings saw arrive, newest first. Name what was in the ones you remember.">Every build seen, newest first</h1>
                        <p class="mi-showing" data-ref="showing"></p>
                        ${this.needs.html()}
                        <button type="button" class="mi-button is-primary" data-ref="new">New release</button>
                    </div>
                    <div class="mi-body">
                        <main class="mi-main" data-ref="main"></main>
                        <aside class="mi-detail mi-entry" data-ref="entry" hidden></aside>
                    </div>
                </div>
            </div>`;
        const ref = (name) => this.root.querySelector(`[data-ref="${name}"]`);
        this.mainEl = ref('main');
        this.entryEl = ref('entry');
        this.rail.mount(ref('shell'), ref('showing'));
        this.needs.mount(this.root);
        ref('new').addEventListener('click', () => this.openForm({ applicationId: this.apps.length === 1 ? this.apps[0] : null, build: null }));
    }

    async load() {
        this.mainEl.innerHTML = '<p class="mi-status">Asking the tracking database…</p>';
        try {
            [this.stages, this.applications, this.lists, this.history, this.releases, this.items, this.status, this.events, this.approvals, this.writes] = await Promise.all([
                fetchStages(), fetchApplications(), fetchLists(), fetchHistory(), fetchReleases(), fetchWhereIsEverything(),
                fetchReleaseStatus(), fetchEvents(), fetchApprovalVsProd(), fetchWrites(),
            ]);
            // Naming a build or starting a release is offered only where the server would accept it (census-on-apptrak.md §7).
            this.root.querySelector('[data-ref="new"]').hidden = writable(this.writes, RELEASES, this.applications).length === 0;
        } catch (err) {
            this.mainEl.innerHTML = `<p class="mi-status is-error">${escapeHtml(err.message)}</p>`;
            return;
        }
        this.stageSort = new Map(this.stages.map((s) => [s.Stage.toLowerCase(), s.Sort]));
        this.devSort = Math.min(...this.stages.map((s) => s.Sort));
        this.apps = AppRail.remembered(this.applications);
        this.renderFilter();
        this.render();
    }

    // The inbox is an unnamed build past DEV, as 05 counts it: DEV builds need no manifest,
    // so counting them would overstate the retrofit. Any row can still be named.
    isInbox(r) {
        return !r.ReleaseId && this.stageSort.get(r.Stage.toLowerCase()) > this.devSort;
    }

    async reload() {
        [this.history, this.releases, this.items, this.applications, this.status, this.events, this.approvals] = await Promise.all([
            fetchHistory(), fetchReleases(), fetchWhereIsEverything(), fetchApplications(),
            fetchReleaseStatus(), fetchEvents(), fetchApprovalVsProd(),
        ]);
        this.renderFilter();
        this.render();
        this.form.refresh(this.data());
    }

    data() {
        return {
            applications: writable(this.writes, RELEASES, this.applications), releases: this.releases, items: this.items,
            stages: this.stages, lists: this.lists,
        };
    }

    // The rail counts the inbox: unnamed builds past DEV, per application.
    renderFilter() {
        const unnamed = this.history.filter((r) => this.isInbox(r));
        this.rail.render(this.applications, this.apps,
            (id) => (id == null ? unnamed : unnamed.filter((r) => r.ApplicationId === id)).length);
    }

    render() {
        const rows = this.history.filter((r) => this.apps.length === 0 || this.apps.includes(r.ApplicationId));
        const needs = findNeeds({
            releases: this.status, items: this.items, events: this.events, approvals: this.approvals,
            history: this.history, applications: this.applications, stages: this.stages, isInbox: (r) => this.isInbox(r),
        }, this.settings, this.now).filter((n) => this.apps.length === 0 || this.apps.includes(n.applicationId));
        this.needs.setButton(needs.length ? `Needs a word <span class="mi-pop-count">${needs.length}</span>` : 'Nothing needs a word', needs.length ? 'is-warn' : '');
        this.needs.setBody(renderNeeds(needs));
        if (rows.length === 0) {
            this.mainEl.innerHTML = `<p class="mi-status">The ledger has no deployments for this application. Either its endpoints send no deployment block yet, or the backfill has not run.</p>`;
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
            <tr class="${r.IsCurrent ? 'is-current' : ''} ${this.isInbox(r) ? 'is-unnamed' : ''}">
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
                        ? `<a class="mi-release-link" href="/moveit/release/${r.ReleaseId}">${escapeHtml(r.Release)}</a>${r.Claims > 1 ? `<span class="mi-muted"> +${r.Claims - 1}</span>` : ''}
                           ${may(this.writes, RELEASES, r.ApplicationId) ? `<button type="button" class="mi-button is-quiet" data-name="${r.DeploymentId}">Add to</button>` : ''}`
                        : may(this.writes, RELEASES, r.ApplicationId) ? `<button type="button" class="mi-button" data-name="${r.DeploymentId}">Name it</button>` : ''}
                </td>
            </tr>`;
    }

    openForm(context) {
        this.entryEl.hidden = false;
        this.form.open(this.entryEl, context, this.data(), () => { this.entryEl.hidden = true; this.entryEl.innerHTML = ''; });
    }
}

export default new HistoryPage();
