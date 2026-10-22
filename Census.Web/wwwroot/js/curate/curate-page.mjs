import { escapeHtml, isoDate } from '../moveit/format.mjs';
import { EditApi } from './edit-api.mjs';
import { readForm, renderForm, toPayload } from './record-form.mjs';
import { buildFields, eventFields, itemFields, linkFields, releaseFields, rowValues } from './curate-fields.mjs';

// The curate pages (personas.md §6.3.1): every asserted Move It row in the member's applications,
// correctable in place. One page per nav item —
//   curate.releases      Releases: the list; one release with everything under it
//   curate.feature-sets  Features & fixes: every item, in a release or not; one item with its links
//   curate.associations  Associations: build claims and links between items
//   curate.events        Events: every event, newest first
// Each row is a form (record-form.mjs); Delete asks once more inline before it acts. After any
// write everything is read again, so the page shows what the tables hold. The place inside the page
// rides in the URL as cu= (release:ID, item:ID, new-release, new-item).

const STATUS_DELETE = 'Really delete?';

class CuratePage {
    init(config = {}) {
        this.root = typeof config.root === 'string' ? document.querySelector(config.root) : config.root;
        this.api = new EditApi(config.headers);
        this.feature = config.feature;
        this.applications = config.applications;
        this.by = config.by ?? '';
        this.at = new URLSearchParams(location.search).get('cu') ?? '';
        this.flash = '';
        this.load();
    }

    async load() {
        this.root.innerHTML = '<p class="ps-none">Reading what has been recorded…</p>';
        try {
            this.data = await this.api.loadAll();
        } catch (e) {
            this.root.innerHTML = `<p class="ps-error">${escapeHtml(e.message)}</p>`;
            return;
        }
        this.context();
        await this.render();
    }

    // The applications in scope, and what of the data is theirs.
    context() {
        const ids = new Set(this.applications.map((a) => a.applicationId));
        const appName = new Map(this.applications.map((a) => [a.applicationId, a.name]));
        const d = this.data;
        this.releases = d.releases.filter((r) => ids.has(r.ApplicationId));
        const releaseIds = new Set(this.releases.map((r) => r.ReleaseId));
        this.items = d.workitems.filter((w) => ids.has(w.ApplicationId));
        const itemIds = new Set(this.items.map((w) => w.WorkItemId));
        this.builds = d.builds.filter((b) => releaseIds.has(b.ReleaseId));
        this.events = d.events.filter((e) => releaseIds.has(e.ReleaseId));
        this.links = d.links.filter((l) => itemIds.has(l.WorkItemId) || itemIds.has(l.LinkedWorkItemId));
        this.releaseById = new Map(d.releases.map((r) => [r.ReleaseId, r]));
        this.itemById = new Map(d.workitems.map((w) => [w.WorkItemId, w]));
        this.appName = (id) => appName.get(id) ?? `Application ${id}`;
        const lists = {};
        for (const row of d.lists) (lists[row.List] ??= []).push(row.Member);
        this.ctx = {
            lists,
            applications: this.applications,
            releaseOptions: this.releases.map((r) => ({ value: r.ReleaseId, label: `${this.appName(r.ApplicationId)} · ${r.Name}` })),
            itemOptions: this.items.map((w) => ({ value: w.WorkItemId, label: this.itemLabel(w) })),
        };
    }

    releaseLabel(id) {
        const r = this.releaseById.get(id);
        return r ? r.Name : 'no release';
    }

    itemLabel(w) {
        return `${this.appName(w.ApplicationId)} · ${w.ReleaseId ? this.releaseLabel(w.ReleaseId) : 'no release'} · ${w.Title}`;
    }

    go(at) {
        this.at = at;
        this.flash = '';
        this.render();
    }

    async render() {
        const params = new URLSearchParams(location.search);
        if (this.at) params.set('cu', this.at); else params.delete('cu');
        history.replaceState(null, '', `${location.pathname}?${params}`);
        const [kind, id] = this.at.split(':');
        let body;
        if (this.feature === 'curate.releases') {
            body = kind === 'release' ? await this.releaseHtml(Number(id)) : kind === 'new-release' ? this.newReleaseHtml() : this.releasesHtml();
        } else if (this.feature === 'curate.feature-sets') {
            body = kind === 'item' ? this.itemHtml(Number(id)) : kind === 'new-item' ? this.newItemHtml() : this.itemsHtml();
        } else if (this.feature === 'curate.associations') {
            body = this.associationsHtml();
        } else {
            body = this.eventsHtml();
        }
        this.root.innerHTML = `${this.flash ? `<p class="mb-flash">${escapeHtml(this.flash)}</p>` : ''}${body}`;
        this.bind();
    }

    // ---- Releases ----

    releasesHtml() {
        const rows = [...this.releases].sort((a, b) => Date.parse(b.CreatedAt) - Date.parse(a.CreatedAt));
        const count = (list, id) => list.filter((x) => x.ReleaseId === id).length;
        return `
            <section class="ps-section">
                <div class="mb-actions"><h2 class="ps-h">Releases</h2><button type="button" class="ps-save" data-go="new-release">New release</button></div>
                <p class="ps-sub">${rows.length} in ${this.applications.length} application${this.applications.length === 1 ? '' : 's'}. Open one to correct it and everything under it.</p>
                <div class="ps-scroll"><table class="ps-table">
                    <thead><tr><th>Release</th><th>Application</th><th>Kind</th><th>Target</th><th>Items</th><th>Builds</th><th>Events</th></tr></thead>
                    <tbody>${rows.map((r) => `
                        <tr>
                            <td><a href="#" class="ps-link" data-go="release:${r.ReleaseId}">${escapeHtml(r.Name)}</a></td>
                            <td>${escapeHtml(this.appName(r.ApplicationId))}</td>
                            <td>${escapeHtml(r.Kind)}</td>
                            <td>${r.TargetDate ? escapeHtml(isoDate(r.TargetDate)) : '—'}</td>
                            <td>${count(this.items, r.ReleaseId)}</td>
                            <td>${count(this.builds, r.ReleaseId)}</td>
                            <td>${count(this.events, r.ReleaseId)}</td>
                        </tr>`).join('')}</tbody>
                </table></div>
            </section>`;
    }

    newReleaseHtml() {
        return `
            <section class="ps-section">
                <p class="ps-crumb"><a href="#" class="ps-link" data-go="">Releases</a></p>
                <h2 class="ps-h">New release</h2>
                ${renderForm(releaseFields(this.ctx), { applicationId: this.applications[0]?.applicationId, kind: 'featureset' }, { key: 'release:new', saveLabel: 'Create' })}
            </section>`;
    }

    async releaseHtml(id) {
        const r = this.releases.find((x) => x.ReleaseId === id);
        if (!r) return '<p class="ps-error">That release is not in your applications, or no longer exists.</p>';
        const history = await this.api.releaseAudit(id);
        const items = this.items.filter((w) => w.ReleaseId === id);
        const builds = this.builds.filter((b) => b.ReleaseId === id);
        const events = this.events.filter((e) => e.ReleaseId === id);
        // Wide screens (Robert, 2026-10-22: "i hate scrolling down down down"): the release and its
        // history on the left, its features and fixes in the middle, its builds and events right.
        return `
            <div class="ps-grid ps-grid-3"><div class="ps-stack">
            <section class="ps-section">
                <p class="ps-crumb"><a href="#" class="ps-link" data-go="">Releases</a> · <a class="ps-link" href="/moveit/release/${id}">Move It's page ↗</a></p>
                <h2 class="ps-h">${escapeHtml(r.Name)}</h2>
                ${renderForm(releaseFields(this.ctx), rowValues(r), { key: `release:${id}`, canDelete: true })}
            </section>
            <section class="ps-section"><h3 class="ps-h3">History</h3>${this.historyHtml(history)}</section>
            </div><div class="ps-stack">
            <section class="ps-section">
                <h3 class="ps-h3">Features and fixes <span class="mb-n">${items.length}</span></h3>
                ${items.map((w) => this.itemDetails(w)).join('')}
                ${this.addDetails('Add a feature or fix', renderForm(itemFields(this.ctx), { applicationId: r.ApplicationId, releaseId: id, kind: 'feature' }, { key: 'workitem:new', saveLabel: 'Add' }))}
            </section>
            </div><div class="ps-stack">
            <section class="ps-section">
                <h3 class="ps-h3">Builds it claims <span class="mb-n">${builds.length}</span></h3>
                ${builds.map((b) => this.details(`<span class="ps-mono">${escapeHtml(b.Build)}</span>${b.Note ? ` · ${escapeHtml(b.Note)}` : ''}`, renderForm(buildFields(this.ctx), rowValues(b), { key: `build:${b.ReleaseBuildId}`, canDelete: true }))).join('')}
                ${this.addDetails('Claim a build', renderForm(buildFields(this.ctx), { releaseId: id }, { key: 'build:new', saveLabel: 'Claim' }))}
            </section>
            <section class="ps-section">
                <h3 class="ps-h3">Events <span class="mb-n">${events.length}</span></h3>
                ${events.map((e) => this.eventDetails(e)).join('')}
                ${this.addDetails('Record an event', renderForm(eventFields(this.ctx), { releaseId: id, at: new Date().toISOString(), by: this.by }, { key: 'event:new', saveLabel: 'Record' }))}
            </section>
            </div></div>`;
    }

    // ---- Features & fixes ----

    itemsHtml() {
        const rows = [...this.items].sort((a, b) => Date.parse(b.CreatedAt) - Date.parse(a.CreatedAt));
        return `
            <section class="ps-section">
                <div class="mb-actions"><h2 class="ps-h">Features and fixes</h2><button type="button" class="ps-save" data-go="new-item">New feature or fix</button></div>
                <p class="ps-sub">${rows.length} in ${this.applications.length} application${this.applications.length === 1 ? '' : 's'}, in a release or not yet.</p>
                <div class="ps-scroll"><table class="ps-table">
                    <thead><tr><th>Title</th><th>Kind</th><th>Application</th><th>Release</th><th>Build</th><th>Links</th></tr></thead>
                    <tbody>${rows.map((w) => `
                        <tr class="${w.RemovedAt ? 'mb-retired' : ''}">
                            <td><a href="#" class="ps-link" data-go="item:${w.WorkItemId}">${escapeHtml(w.Title)}</a>${w.RemovedAt ? ' <span class="ps-flag">removed</span>' : ''}</td>
                            <td>${escapeHtml(w.Kind)}</td>
                            <td>${escapeHtml(this.appName(w.ApplicationId))}</td>
                            <td>${w.ReleaseId ? escapeHtml(this.releaseLabel(w.ReleaseId)) : '<span class="ps-flag">none</span>'}</td>
                            <td class="ps-mono">${escapeHtml(w.IncludedInBuild ?? '')}</td>
                            <td>${this.links.filter((l) => l.WorkItemId === w.WorkItemId || l.LinkedWorkItemId === w.WorkItemId).length}</td>
                        </tr>`).join('')}</tbody>
                </table></div>
            </section>`;
    }

    newItemHtml() {
        return `
            <section class="ps-section">
                <p class="ps-crumb"><a href="#" class="ps-link" data-go="">Features and fixes</a></p>
                <h2 class="ps-h">New feature or fix</h2>
                ${renderForm(itemFields(this.ctx), { applicationId: this.applications[0]?.applicationId, kind: 'feature' }, { key: 'workitem:new', saveLabel: 'Create' })}
            </section>`;
    }

    itemHtml(id) {
        const w = this.items.find((x) => x.WorkItemId === id);
        if (!w) return '<p class="ps-error">That item is not in your applications, or no longer exists.</p>';
        return `
            <div class="ps-grid ps-grid-2">
            <section class="ps-section">
                <p class="ps-crumb"><a href="#" class="ps-link" data-go="">Features and fixes</a>${w.ReleaseId ? ` · in <a class="ps-link" href="/moveit/release/${w.ReleaseId}">${escapeHtml(this.releaseLabel(w.ReleaseId))} ↗</a>` : ''}</p>
                <h2 class="ps-h">${escapeHtml(w.Title)}</h2>
                ${renderForm(itemFields(this.ctx), rowValues(w), { key: `workitem:${id}`, canDelete: true })}
            </section>
            <section class="ps-section">
                <h3 class="ps-h3">Links</h3>
                ${this.linksHtml(this.links.filter((l) => l.WorkItemId === id || l.LinkedWorkItemId === id))}
                ${this.addDetails('Link to another item', renderForm(linkFields(this.ctx), { workItemId: id, kind: 'depends-on' }, { key: 'link:new', saveLabel: 'Link' }))}
            </section>
            </div>`;
    }

    itemDetails(w) {
        const summary = `${escapeHtml(w.Title)} <span class="ps-flag">${escapeHtml(w.Kind)}</span>${w.IncludedInBuild ? ` <span class="ps-mono">${escapeHtml(w.IncludedInBuild)}</span>` : ''}${w.RemovedAt ? ' <span class="ps-flag is-alert">removed</span>' : ''}`;
        return this.details(summary, `${renderForm(itemFields(this.ctx), rowValues(w), { key: `workitem:${w.WorkItemId}`, canDelete: true })}
            <p class="cu-more"><a href="#" class="ps-link" data-go-page="curate.feature-sets" data-cu="item:${w.WorkItemId}">Its links →</a></p>`);
    }

    // ---- Associations and events ----

    associationsHtml() {
        const builds = [...this.builds].sort((a, b) => this.releaseLabel(a.ReleaseId).localeCompare(this.releaseLabel(b.ReleaseId)) || a.Build.localeCompare(b.Build));
        return `
            <div class="ps-grid ps-grid-2">
            <section class="ps-section">
                <h2 class="ps-h">Build claims <span class="mb-n">${builds.length}</span></h2>
                <p class="ps-sub">Which release says a build is its. Correct the release or the build, or delete a wrong claim.</p>
                ${builds.map((b) => this.details(`<span class="ps-mono">${escapeHtml(b.Build)}</span> · ${escapeHtml(this.appName(this.releaseById.get(b.ReleaseId)?.ApplicationId))} · ${escapeHtml(this.releaseLabel(b.ReleaseId))}`,
                    renderForm(buildFields(this.ctx), rowValues(b), { key: `build:${b.ReleaseBuildId}`, canDelete: true }))).join('')}
                ${this.addDetails('Claim a build', renderForm(buildFields(this.ctx), {}, { key: 'build:new', saveLabel: 'Claim' }))}
            </section>
            <section class="ps-section">
                <h2 class="ps-h">Links between items <span class="mb-n">${this.links.length}</span></h2>
                <p class="ps-sub">Depends on: the linked item must be deployed first. Related to: these go together.</p>
                ${this.linksHtml(this.links)}
                ${this.addDetails('Link two items', renderForm(linkFields(this.ctx), { kind: 'depends-on' }, { key: 'link:new', saveLabel: 'Link' }))}
            </section>
            </div>`;
    }

    linksHtml(links) {
        if (!links.length) return '<p class="ps-none">No links.</p>';
        const title = (id) => escapeHtml(this.itemById.get(id)?.Title ?? `item ${id}`);
        return links.map((l) => this.details(`${title(l.WorkItemId)} <span class="ps-flag">${escapeHtml(l.Kind)}</span> ${title(l.LinkedWorkItemId)}${l.Note ? ` · ${escapeHtml(l.Note)}` : ''}`,
            renderForm(linkFields(this.ctx), rowValues(l), { key: `link:${l.LinkId}`, canDelete: true }))).join('');
    }

    eventsHtml() {
        return `
            <section class="ps-section">
                <h2 class="ps-h">Events <span class="mb-n">${this.events.length}</span></h2>
                <p class="ps-sub">Approvals, holds, notes and the rest, newest first. Correct one in place, or delete it; the history keeps what it was.</p>
                ${this.events.map((e) => this.eventDetails(e, true)).join('')}
                ${this.addDetails('Record an event', renderForm(eventFields(this.ctx), { at: new Date().toISOString(), by: this.by }, { key: 'event:new', saveLabel: 'Record' }))}
            </section>`;
    }

    eventDetails(e, withRelease = false) {
        const summary = `<span class="ps-flag">${escapeHtml(e.Kind)}</span>${e.Stage ? ` ${escapeHtml(e.Stage)}` : ''} · ${escapeHtml(isoDate(e.At))} · ${escapeHtml(e.By)}${withRelease ? ` · ${escapeHtml(this.appName(this.releaseById.get(e.ReleaseId)?.ApplicationId))} · ${escapeHtml(this.releaseLabel(e.ReleaseId))}` : ''}${e.Note ? ` — ${escapeHtml(e.Note)}` : ''}`;
        return this.details(summary, renderForm(eventFields(this.ctx), rowValues(e), { key: `event:${e.EventId}`, canDelete: true }));
    }

    // ---- shared pieces ----

    details(summary, body) {
        return `<details class="cu-row"><summary>${summary}</summary>${body}</details>`;
    }

    addDetails(label, body) {
        return `<details class="cu-row cu-add"><summary>+ ${escapeHtml(label)}</summary>${body}</details>`;
    }

    historyHtml(entries) {
        if (!entries.length) return '<p class="ps-none">No correction has been made here from these pages.</p>';
        const what = (e) => {
            const row = JSON.parse(e.NewValue ?? e.PreviousValue ?? '{}');
            const label = { release: 'release', workitem: 'item', build: 'build claim', event: 'event', link: 'link' }[e.Entity] ?? e.Entity;
            const name = e.Entity === 'event' ? `${row.Kind}${row.Stage ? ` ${row.Stage}` : ''}`
                : e.Entity === 'link' ? row.Kind
                : row.Name ?? row.Title ?? row.Build ?? '';
            return `${e.Action} ${label}${name ? ` ${name}` : ''}`;
        };
        return `<ul class="ps-list">${entries.map((e) => `
            <li><span class="ps-list-main">${escapeHtml(what(e))}</span>
                <span class="ps-list-end">${escapeHtml(isoDate(e.ChangedAt))} ${escapeHtml(new Date(e.ChangedAt).toTimeString().slice(0, 5))} · ${escapeHtml(e.ChangedBy)}</span></li>`).join('')}</ul>`;
    }

    fieldsFor(entity) {
        return { release: releaseFields, workitem: itemFields, build: buildFields, event: eventFields, link: linkFields }[entity](this.ctx);
    }

    bind() {
        for (const el of this.root.querySelectorAll('[data-go]')) {
            el.addEventListener('click', (e) => { e.preventDefault(); this.go(el.dataset.go); });
        }
        for (const el of this.root.querySelectorAll('[data-go-page]')) {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                const params = new URLSearchParams(location.search);
                params.set('at', el.dataset.goPage);
                params.set('cu', el.dataset.cu);
                location.search = params.toString();
            });
        }
        for (const form of this.root.querySelectorAll('form[data-record]')) {
            const [entity, id] = form.dataset.record.split(':');
            const key = id === 'new' ? null : Number(id);
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                const body = toPayload(this.fieldsFor(entity), readForm(form));
                this.write(form, () => this.api.save(entity, key, body), key ? 'Saved.' : 'Added.',
                    key ? null : (r) => (entity === 'release' && this.at === 'new-release' ? `release:${r.key}` : entity === 'workitem' && this.at === 'new-item' ? `item:${r.key}` : this.at));
            });
            form.querySelector('[data-delete]')?.addEventListener('click', (e) => {
                const b = e.currentTarget;
                if (b.textContent !== STATUS_DELETE) { b.textContent = STATUS_DELETE; b.classList.add('is-armed'); return; }
                const leaving = (entity === 'release' && this.at.startsWith('release:')) || (entity === 'workitem' && this.at.startsWith('item:'));
                this.write(form, () => this.api.remove(entity, key), 'Deleted. The history keeps what it was.', leaving ? () => '' : null);
            });
        }
    }

    async write(form, call, done, next = null) {
        const status = form.querySelector('[data-status]');
        status.textContent = 'Saving…';
        status.className = 'ps-form-status';
        try {
            const result = await call();
            if (next) this.at = next(result);
            this.flash = done;
            await this.load();
        } catch (e) {
            status.textContent = e.message;
            status.className = 'ps-form-status is-error';
        }
    }
}

export default new CuratePage();
