import { fetchApplications, fetchEvents, fetchLists, fetchReleaseBuilds, fetchReleaseStatus, fetchReleases, fetchStages, fetchWhereIsEverything, postDeleteRelease, postPullItem, postRetitle } from './moveit-api.mjs';
import { appLabel, days, daysAgo, escapeHtml, shortDate } from './format.mjs';
import { stageHue } from './stage-hues.mjs';
import { EventForm } from './event-form.mjs';

// The release page (move-it.md §16, level 3): one release in depth — what is in it and where
// each item is, the builds it claims and where the ledger says they are now, and its events
// in order. Entry here: record an event; pull an item with a reason; fix a title. Every fact
// is a row from a question or a board lookup; the page arranges them.

class ReleasePage {
    init(config = {}) {
        this.root = document.getElementById(config.rootId ?? 'moveit-root');
        this.releaseId = Number(config.releaseId);
        this.now = Date.now();
        this.editing = null;            // { id, mode: 'rename' | 'pull' }
        this.eventForm = new EventForm(() => this.reload());
        this.renderShell();
        this.load();
    }

    renderShell() {
        this.root.innerHTML = `
            <header class="mi-header">
                <div class="mi-masthead">
                    <nav class="mi-crumbs"><a href="/moveit">Where is it</a> · <a href="/moveit/history">History</a></nav>
                    <h1 class="mi-title" data-ref="title">Release</h1>
                    <p class="mi-tagline" data-ref="sub"></p>
                </div>
                <div class="mi-header-side" data-ref="delete"></div>
            </header>
            <div class="mi-body">
                <main class="mi-main" data-ref="main"></main>
                <aside class="mi-detail mi-entry" data-ref="entry"></aside>
            </div>`;
        this.titleEl = this.root.querySelector('[data-ref="title"]');
        this.subEl = this.root.querySelector('[data-ref="sub"]');
        this.mainEl = this.root.querySelector('[data-ref="main"]');
        this.entryEl = this.root.querySelector('[data-ref="entry"]');
        this.deleteEl = this.root.querySelector('[data-ref="delete"]');
    }

    // Stabilization only (move-it.md §16): the release and everything under it, gone.
    renderDelete() {
        this.deleteEl.innerHTML = this.confirmingDelete
            ? `<span class="mi-inline">
                   <span class="mi-muted">Delete ${this.items.length} item(s), ${new Set(this.builds.map((b) => b.Build)).size} build claim(s), ${this.events.length} event(s) and any links? No undo.</span>
                   <button type="button" class="mi-button is-primary" data-ref="delete-yes">Delete</button>
                   <button type="button" class="mi-button is-quiet" data-ref="delete-no">Cancel</button>
               </span>`
            : '<button type="button" class="mi-button is-quiet" data-ref="delete-ask">Delete release</button>';
        const on = (ref, fn) => this.deleteEl.querySelector(`[data-ref="${ref}"]`)?.addEventListener('click', fn);
        on('delete-ask', () => { this.confirmingDelete = true; this.renderDelete(); });
        on('delete-no', () => { this.confirmingDelete = false; this.renderDelete(); });
        on('delete-yes', async () => {
            try {
                await postDeleteRelease({ releaseId: this.releaseId });
                window.location.href = '/moveit/history';
            } catch (err) { this.say(err.message); }
        });
    }

    async load() {
        this.mainEl.innerHTML = '<p class="mi-status">Asking the tracking database…</p>';
        try {
            [this.stages, this.applications, this.lists] = await Promise.all([fetchStages(), fetchApplications(), fetchLists()]);
            await this.reload();
        } catch (err) {
            this.mainEl.innerHTML = `<p class="mi-status is-error">${escapeHtml(err.message)}</p>`;
        }
    }

    async reload() {
        const [releases, status, items, builds, events] = await Promise.all([
            fetchReleases(), fetchReleaseStatus(), fetchWhereIsEverything(), fetchReleaseBuilds(), fetchEvents(),
        ]);
        const mine = (r) => r.ReleaseId === this.releaseId;
        this.release = releases.find(mine);
        this.status = status.find(mine);
        this.items = items.filter(mine);
        this.builds = builds.filter(mine);
        this.events = events.filter(mine).sort((a, b) => Date.parse(b.At) - Date.parse(a.At) || b.EventId - a.EventId);
        if (!this.release) {
            this.mainEl.innerHTML = '<p class="mi-status is-error">No release has that id.</p>';
            return;
        }
        this.app = this.applications.find((a) => a.ApplicationId === this.release.ApplicationId) ?? { ApplicationId: this.release.ApplicationId };
        this.render();
    }

    render() {
        const r = this.release;
        const s = this.status;
        document.title = `${r.Name} · ${appLabel(this.app)}`;
        this.titleEl.textContent = r.Name;
        const flags = [];
        if (s?.OnHold === 1) flags.push(`<span class="mi-flag is-hold">on hold${s.HoldReason ? `: ${escapeHtml(s.HoldReason)}` : ''}</span>`);
        if (s?.PastTarget === 1) flags.push('<span class="mi-flag is-alert">late</span>');
        if (s?.Contradiction) flags.push(`<span class="mi-flag is-alert">${escapeHtml(s.Contradiction)}</span>`);
        this.subEl.innerHTML = [
            `${escapeHtml(r.Kind)} for <strong>${escapeHtml(appLabel(this.app))}</strong>`,
            s ? `highest stage <span class="mi-stage" style="--lane: ${stageHue(s.HighestStage)}">${escapeHtml(s.HighestStage)}</span>${s.Evidence ? ` <span class="mi-muted">(${escapeHtml(s.Evidence)})</span>` : ''}` : '',
            r.TargetDate ? `target ${escapeHtml(shortDate(r.TargetDate))}` : 'no target date',
            s?.ApprovedAt ? `approved ${escapeHtml(shortDate(s.ApprovedAt))} for <code>${escapeHtml(s.ApprovedBuild)}</code>` : 'not approved',
        ].filter(Boolean).join(' · ') + (flags.length ? ' ' + flags.join(' ') : '') + (r.Note ? `<br><span class="mi-muted">${escapeHtml(r.Note)}</span>` : '');

        this.mainEl.innerHTML = `
            <section class="mi-section">
                <h2 class="mi-section-title">What is in it</h2>
                ${this.items.length ? this.renderItems() : '<p class="mi-status">Nothing recorded yet. Name a build on the History page, or add lines from there.</p>'}
            </section>
            <section class="mi-section">
                <h2 class="mi-section-title">Builds it claims</h2>
                ${this.builds.length ? this.renderBuilds() : '<p class="mi-status">No build attributed yet.</p>'}
            </section>
            <section class="mi-section">
                <h2 class="mi-section-title">Events</h2>
                ${this.events.length ? this.renderEvents() : '<p class="mi-status">Nothing recorded.</p>'}
            </section>`;
        this.bindItems();
        this.renderDelete();
        this.eventForm.render(this.entryEl, {
            releaseId: this.releaseId, lists: this.lists, stages: this.stages,
            builds: [...new Set(this.builds.map((b) => b.Build))],
        });
    }

    renderItems() {
        return `
            <table class="mi-hist mi-items">
                <thead><tr><th>Kind</th><th>Title</th><th>Built by</th><th>First in</th><th>Where</th><th></th></tr></thead>
                <tbody>${this.items.map((i) => this.renderItem(i)).join('')}</tbody>
            </table>`;
    }

    renderItem(i) {
        const pulled = i.Status === 'removed';
        const edit = this.editing?.id === i.WorkItemId ? this.editing.mode : null;
        const since = daysAgo(i.Since, this.now);
        const titleCell = edit === 'rename'
            ? `<span class="mi-inline"><input name="title" value="${escapeHtml(i.Title)}" /><button type="button" class="mi-button is-primary" data-save="${i.WorkItemId}">Save</button><button type="button" class="mi-button is-quiet" data-cancel>Cancel</button></span>`
            : `<span>${escapeHtml(i.Title)}</span>${i.ExternalRef ? ` <span class="mi-muted">${escapeHtml(i.ExternalRef)}</span>` : ''}`;
        const actions = pulled ? '' : edit === 'pull'
            ? `<span class="mi-inline"><input name="note" placeholder="why it is pulled" /><button type="button" class="mi-button is-primary" data-confirm-pull="${i.WorkItemId}">Pull</button><button type="button" class="mi-button is-quiet" data-cancel>Cancel</button></span>`
            : `<button type="button" class="mi-button is-quiet" data-rename="${i.WorkItemId}">Rename</button> <button type="button" class="mi-button is-quiet" data-pull="${i.WorkItemId}">Pull</button>`;
        return `
            <tr class="${pulled ? 'is-pulled' : ''}">
                <td class="mi-muted">${escapeHtml(i.Kind)}</td>
                <td>${titleCell}</td>
                <td class="mi-muted">${escapeHtml(i.BuiltBy ?? '')}</td>
                <td>${i.IncludedInBuild ? `<code>${escapeHtml(i.IncludedInBuild)}</code>` : '<span class="mi-muted">not built yet</span>'}</td>
                <td>${pulled
                    ? '<span class="mi-muted">pulled from the release</span>'
                    : `<span class="mi-stage" style="--lane: ${stageHue(i.Status)}">${escapeHtml(i.Status)}</span>${since != null ? ` <span class="mi-muted">${days(since)}</span>` : ''}${i.Evidence === 'asserted' ? ' <span class="mi-muted">asserted</span>' : ''}`}</td>
                <td class="mi-actions">${actions}</td>
            </tr>`;
    }

    bindItems() {
        const el = this.mainEl;
        el.querySelectorAll('[data-rename]').forEach((b) => b.addEventListener('click', () => { this.editing = { id: Number(b.dataset.rename), mode: 'rename' }; this.render(); el.querySelector('[name="title"]')?.focus(); }));
        el.querySelectorAll('[data-pull]').forEach((b) => b.addEventListener('click', () => { this.editing = { id: Number(b.dataset.pull), mode: 'pull' }; this.render(); el.querySelector('[name="note"]')?.focus(); }));
        el.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => { this.editing = null; this.render(); }));
        el.querySelectorAll('[data-save]').forEach((b) => b.addEventListener('click', () => this.retitle(Number(b.dataset.save), el.querySelector('[name="title"]').value)));
        el.querySelectorAll('[data-confirm-pull]').forEach((b) => b.addEventListener('click', () => this.pull(Number(b.dataset.confirmPull), el.querySelector('[name="note"]').value)));
    }

    async retitle(id, title) {
        try {
            await postRetitle({ workItemId: id, title });
            this.editing = null;
            await this.reload();
        } catch (err) { this.say(err.message); }
    }

    async pull(id, note) {
        try {
            await postPullItem({ workItemId: id, note });
            this.editing = null;
            await this.reload();
        } catch (err) { this.say(err.message); }
    }

    say(message) {
        const p = document.createElement('p');
        p.className = 'mi-status is-error';
        p.textContent = message;
        this.mainEl.prepend(p);
    }

    renderBuilds() {
        const byBuild = new Map();
        for (const b of this.builds) {
            if (!byBuild.has(b.Build)) byBuild.set(b.Build, { note: b.Note, where: [] });
            if (b.EndpointId != null) byBuild.get(b.Build).where.push(b);
        }
        return `
            <ul class="mi-builds">
                ${[...byBuild.entries()].map(([build, { note, where }]) => `
                    <li>
                        <code>${escapeHtml(build)}</code>${note ? ` <span class="mi-muted">${escapeHtml(note)}</span>` : ''}
                        <span class="mi-build-where">${where.length
                            ? where.map((w) => `<span class="mi-stage" style="--lane: ${stageHue(w.Stage)}">${escapeHtml(w.Stage)}</span> on ${escapeHtml(w.Machine)} <span class="mi-muted">since ${escapeHtml(shortDate(w.DetectedAt))}</span>`).join(', ')
                            : '<span class="mi-muted">not on any box now</span>'}</span>
                    </li>`).join('')}
            </ul>`;
    }

    renderEvents() {
        return `
            <ul class="mi-events">
                ${this.events.map((e) => `
                    <li class="is-${escapeHtml(e.Kind)}">
                        <span class="mi-event-when">${escapeHtml(shortDate(e.At))}</span>
                        <span class="mi-event-what"><strong>${escapeHtml(e.Kind)}</strong>${e.Stage ? ` <span class="mi-stage" style="--lane: ${stageHue(e.Stage)}">${escapeHtml(e.Stage)}</span>` : ''}${e.Build ? ` <code>${escapeHtml(e.Build)}</code>` : ''} <span class="mi-muted">by ${escapeHtml(e.By)}</span>${e.Note ? `<br><span class="mi-muted">${escapeHtml(e.Note)}</span>` : ''}</span>
                    </li>`).join('')}
            </ul>`;
    }
}

export default new ReleasePage();
