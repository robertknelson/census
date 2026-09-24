import { postNameBuild } from './moveit-api.mjs';
import { appLabel, escapeHtml } from './format.mjs';

// The entry form (move-it.md §15): name what is in a build, or set up a release with no build
// for work in progress. Pick or create the release, tick existing items this build carries,
// add new lines. One POST; the server applies §14's rules and says what it did.
export class NameBuildForm {
    constructor(onSaved) {
        this.onSaved = onSaved;
        this.lines = [];
    }

    open(el, context, data, onClose) {
        this.el = el;
        this.context = context;               // { applicationId, build }
        this.data = data;
        this.onClose = onClose;
        this.releaseId = null;                // null = new release
        this.draft = this.blankDraft();
        this.lines = [this.blankLine()];
        this.scheduled = new Set();           // notebook items ticked into this release (§20)
        this.render();
    }

    blankDraft() {
        return { name: '', kind: 'featureset', targetDate: '' };
    }

    refresh(data) {
        this.data = data;
        if (this.el) this.render(true);
    }

    blankLine() {
        return { kind: 'feature', title: '', builtBy: '', inThisBuild: true };
    }

    members(list) {
        return this.data.lists.filter((l) => l.List === list).map((l) => l.Member);
    }

    render(keepStatus = false) {
        const status = keepStatus ? this.el.querySelector('[data-ref="status"]')?.outerHTML ?? '' : '';
        const { applicationId, build } = this.context;
        const apps = this.data.applications;
        const releases = this.data.releases.filter((r) => r.ApplicationId === applicationId);
        const existing = this.releaseId ? this.data.items.filter((i) => i.ReleaseId === this.releaseId) : [];
        const coming = applicationId ? this.data.items.filter((i) => i.ApplicationId === applicationId && i.Status === 'no release') : [];
        const option = (v, label, selected) => `<option value="${escapeHtml(v)}" ${selected ? 'selected' : ''}>${escapeHtml(label)}</option>`;

        this.el.innerHTML = `
            <button type="button" class="mi-detail-close" data-ref="close" aria-label="Close">×</button>
            <h2 class="mi-detail-title">${build ? 'What is in this build?' : 'New release'}</h2>
            <p class="mi-detail-sub">${build ? `<code>${escapeHtml(build)}</code>` : 'Work in progress: items sit with the developers until a build carries them.'}</p>
            <form class="mi-form" data-ref="form">
                <label class="mi-field">
                    <span>Application</span>
                    ${applicationId
                        ? `<strong>${escapeHtml(appLabel(apps.find((a) => a.ApplicationId === applicationId)))}</strong>`
                        : `<select name="applicationId" required>${option('', 'Choose…', true)}${apps.map((a) => option(a.ApplicationId, appLabel(a), false)).join('')}</select>`}
                </label>
                <label class="mi-field">
                    <span>Release</span>
                    <select name="releaseId">
                        ${option('', 'New release…', this.releaseId == null)}
                        ${releases.map((r) => option(r.ReleaseId, `${r.Name} (${r.Kind})`, r.ReleaseId === this.releaseId)).join('')}
                    </select>
                </label>
                ${this.releaseId == null ? `
                <div class="mi-field-row">
                    <label class="mi-field is-grow"><span>Name</span><input name="name" required placeholder="Sprint 45" value="${escapeHtml(this.draft.name)}" /></label>
                    <label class="mi-field"><span>Kind</span>
                        <select name="kind">${this.members('release-kinds').map((k) => option(k, k, k === this.draft.kind)).join('')}</select></label>
                    <label class="mi-field"><span>Target</span><input name="targetDate" type="date" value="${escapeHtml(this.draft.targetDate)}" /></label>
                </div>` : ''}
                ${existing.length ? `
                <h3 class="mi-detail-h3">Already in this release</h3>
                <ul class="mi-existing">
                    ${existing.map((i) => `
                        <li class="${i.Status === 'removed' ? 'is-removed' : ''}">
                            ${build && !i.IncludedInBuild && i.Status !== 'removed'
                                ? `<label><input type="checkbox" name="attach" value="${i.WorkItemId}" /> <span>${escapeHtml(i.Title)}</span> <span class="mi-muted">with the devs — carried by this build?</span></label>`
                                : `<span>${escapeHtml(i.Title)}</span> <span class="mi-muted">${i.IncludedInBuild ? `first in ${escapeHtml(i.IncludedInBuild)}` : i.Status}</span>`}
                        </li>`).join('')}
                </ul>` : ''}
                ${coming.length ? `
                <h3 class="mi-detail-h3">Coming, not in any release</h3>
                <ul class="mi-existing">
                    ${coming.map((i) => `
                        <li>
                            <label><input type="checkbox" name="schedule" value="${i.WorkItemId}" ${this.scheduled.has(i.WorkItemId) ? 'checked' : ''} /> <span>${escapeHtml(i.Title)}</span>
                                <span class="mi-muted">${build ? 'in this release, carried by this build' : 'in this release'}</span></label>
                        </li>`).join('')}
                </ul>` : ''}
                <h3 class="mi-detail-h3">${build ? 'New in this build' : 'Features and fixes'}</h3>
                <div class="mi-lines" data-ref="lines">
                    ${this.lines.map((line, n) => this.renderLine(line, n, build)).join('')}
                </div>
                <button type="button" class="mi-button is-quiet" data-ref="add">Add another</button>
                <div class="mi-form-actions">
                    <button type="submit" class="mi-button is-primary">Save</button>
                    ${status || '<p class="mi-form-status" data-ref="status"></p>'}
                </div>
            </form>`;

        this.el.querySelector('[data-ref="close"]').addEventListener('click', () => this.onClose());
        this.el.querySelector('[name="releaseId"]').addEventListener('change', (e) => {
            this.readDraft();
            this.releaseId = e.target.value === '' ? null : Number(e.target.value);
            this.render();
        });
        this.el.querySelector('[name="applicationId"]')?.addEventListener('change', (e) => {
            this.readDraft();
            this.context.applicationId = Number(e.target.value) || null;
            this.releaseId = null;
            this.render();
        });
        this.el.querySelector('[data-ref="add"]').addEventListener('click', () => {
            this.readDraft();
            this.lines.push(this.blankLine());
            this.render();
        });
        this.el.querySelectorAll('[data-remove]').forEach((btn) => btn.addEventListener('click', () => {
            this.readDraft();
            this.lines.splice(Number(btn.dataset.remove), 1);
            if (this.lines.length === 0) this.lines.push(this.blankLine());
            this.render();
        }));
        this.el.querySelector('[data-ref="form"]').addEventListener('submit', (e) => { e.preventDefault(); this.save(); });
    }

    renderLine(line, n, build) {
        const kinds = this.members('work-item-kinds');
        return `
            <div class="mi-line" data-line="${n}">
                <select name="lineKind">${kinds.map((k) => `<option value="${escapeHtml(k)}" ${k === line.kind ? 'selected' : ''}>${escapeHtml(k)}</option>`).join('')}</select>
                <input name="lineTitle" placeholder="Title" value="${escapeHtml(line.title)}" />
                <input name="lineBuiltBy" placeholder="Built by" value="${escapeHtml(line.builtBy)}" />
                ${build ? `<label class="mi-line-check" title="Untick if it is still with the developers"><input type="checkbox" name="lineInBuild" ${line.inThisBuild ? 'checked' : ''} /> in build</label>` : ''}
                <button type="button" class="mi-line-remove" data-remove="${n}" aria-label="Remove line">×</button>
            </div>`;
    }

    // Every re-render rebuilds the form, so anything typed is read back first.
    readDraft() {
        const form = this.el.querySelector('[data-ref="form"]');
        if (form.elements.name) {
            this.draft = { name: form.elements.name.value, kind: form.elements.kind.value, targetDate: form.elements.targetDate.value };
        }
        this.scheduled = new Set([...form.querySelectorAll('[name="schedule"]:checked')].map((c) => Number(c.value)));
        this.lines = [...this.el.querySelectorAll('[data-line]')].map((row) => ({
            kind: row.querySelector('[name="lineKind"]').value,
            title: row.querySelector('[name="lineTitle"]').value,
            builtBy: row.querySelector('[name="lineBuiltBy"]').value,
            inThisBuild: row.querySelector('[name="lineInBuild"]')?.checked ?? false,
        }));
    }

    async save() {
        this.readDraft();
        const form = this.el.querySelector('[data-ref="form"]');
        const statusEl = this.el.querySelector('[data-ref="status"]');
        const chosen = this.releaseId == null ? null : this.data.releases.find((r) => r.ReleaseId === this.releaseId);
        const request = {
            applicationId: this.context.applicationId,
            build: this.context.build,
            release: chosen
                ? { name: chosen.Name, kind: chosen.Kind, targetDate: chosen.TargetDate ? String(chosen.TargetDate).slice(0, 10) : null, note: chosen.Note }
                : { name: form.name.value, kind: form.kind.value, targetDate: form.targetDate.value || null, note: null },
            items: this.lines.filter((l) => l.title.trim()).map((l) => ({
                kind: l.kind, title: l.title, builtBy: l.builtBy || null, inThisBuild: !!this.context.build && l.inThisBuild,
            })),
            attach: [...form.querySelectorAll('[name="attach"]:checked')].map((c) => Number(c.value)),
            schedule: [...this.scheduled],
        };
        if (!request.applicationId) { statusEl.textContent = 'Choose an application.'; statusEl.className = 'mi-form-status is-error'; return; }

        statusEl.textContent = 'Saving…';
        statusEl.className = 'mi-form-status';
        try {
            const result = await postNameBuild(request);
            const parts = [`release ${result.release}`];
            if (result.build) parts.push(`build ${result.build}`);
            if (result.items.inserted) parts.push(`${result.items.inserted} added`);
            if (result.items.updated) parts.push(`${result.items.updated} updated`);
            if (result.scheduled) parts.push(`${result.scheduled} scheduled`);
            if (result.attached) parts.push(`${result.attached} attached`);
            statusEl.textContent = `Saved: ${parts.join(', ')}.`;
            statusEl.className = 'mi-form-status is-ok';
            this.releaseId = result.releaseId;
            this.draft = this.blankDraft();
            this.lines = [this.blankLine()];
            this.scheduled = new Set();
            await this.onSaved();
        } catch (err) {
            statusEl.textContent = err.message;
            statusEl.className = 'mi-form-status is-error';
        }
    }
}
