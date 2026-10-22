import { escapeHtml } from '../moveit/format.mjs';
import { postClaimBuild, postEvent } from '../moveit/moveit-api.mjs';
import { actionsFor, buildQueue, requestFor } from './needs-queue.mjs';

// The Needs you page (personas.md §5.2): the queue, grouped by what it asks, each line naming
// its application and why, linking to where it is fixed — and, where the member curates that
// application, the action that settles it in place (§5.4). An action opens a small form under
// its line; saving writes through Move It's own endpoints, and the queue is asked again, so a
// settled line simply goes.

const LABELS = { claim: 'Claim for a release', approve: 'Record the approval', hold: 'Put on hold' };
const POST = { 'claim-build': postClaimBuild, event: postEvent };

export class NeedsView {
    constructor({ data, settings, applications, access, by, onChanged, now = Date.now() }) {
        this.names = new Map(applications.map((a) => [a.applicationId, a.name]));
        this.count = applications.length;
        this.access = access;
        this.by = by;
        this.onChanged = onChanged;
        this.sections = buildQueue(data, settings, applications.map((a) => a.applicationId), now);
        this.lines = this.sections.flatMap((s) => s.lines);
    }

    html() {
        const total = this.lines.length;
        const head = `
            <section class="ps-section">
                <h2 class="ps-h">Needs you</h2>
                <p class="ps-sub">${total === 0 ? 'Nothing is waiting on a word' : `${total} ${total === 1 ? 'thing is' : 'things are'} waiting on a word`} across ${this.count} application${this.count === 1 ? '' : 's'}. A line goes when the entry it asks for is made.</p>
            </section>`;
        return head + this.sections.map((s) => `
            <section class="ps-section">
                <h3 class="ps-h3">${escapeHtml(s.title)} <span class="ps-count">${s.lines.length}</span></h3>
                <p class="ps-sub">${escapeHtml(s.hint)}</p>
                <ul class="ps-list">${s.lines.map((l) => this.lineHtml(l)).join('')}</ul>
            </section>`).join('');
    }

    lineHtml(line) {
        const i = this.lines.indexOf(line);
        const actions = actionsFor(line, this.access);
        return `
            <li class="ps-need" data-line="${i}">
                <span class="ps-list-main"><a class="ps-link" href="${escapeHtml(line.href)}">${escapeHtml(line.title)}</a> · ${escapeHtml(this.names.get(line.applicationId) ?? `Application ${line.applicationId}`)}</span>
                <span class="ps-list-end">${escapeHtml(line.why)}</span>
                ${actions.length ? `<span class="ps-acts">${actions.map((a) => `<button type="button" class="ps-act" data-act="${i}:${line.actions.indexOf(a)}">${LABELS[a.kind]}</button>`).join('')}</span>` : ''}
                <div class="ps-act-form" data-form="${i}" hidden></div>
            </li>`;
    }

    formHtml(action) {
        const field = action.kind === 'claim'
            ? `<select name="releaseId" required>${action.choices.map((c) => `<option value="${c.releaseId}">${escapeHtml(c.name)}</option>`).join('')}</select>`
            : `<input name="note" ${action.kind === 'hold' ? 'required placeholder="why it is on hold"' : 'placeholder="note (optional)"'} />`;
        return `
            <form class="ps-form">
                ${field}
                <button type="submit" class="ps-save">${action.kind === 'claim' ? 'Claim' : action.kind === 'hold' ? 'Hold' : 'Record'}</button>
                <button type="button" class="ps-cancel" data-cancel>Cancel</button>
                <span class="ps-form-status" data-status>as ${escapeHtml(this.by)}</span>
            </form>`;
    }

    bind(root) {
        for (const b of root.querySelectorAll('[data-act]')) {
            b.addEventListener('click', () => {
                const [i, a] = b.dataset.act.split(':').map(Number);
                const action = this.lines[i].actions[a];
                const el = root.querySelector(`[data-form="${i}"]`);
                el.innerHTML = this.formHtml(action);
                el.hidden = false;
                el.querySelector('[data-cancel]').addEventListener('click', () => { el.hidden = true; el.innerHTML = ''; });
                el.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); this.save(action, e.target, el); });
                el.querySelector('select, input')?.focus();
            });
        }
    }

    async save(action, form, el) {
        const status = el.querySelector('[data-status]');
        const values = Object.fromEntries(new FormData(form));
        const { endpoint, body } = requestFor(action, values, this.by);
        status.textContent = 'Saving…';
        status.className = 'ps-form-status';
        try {
            await POST[endpoint](body);
            this.onChanged();
        } catch (err) {
            status.textContent = err.message;
            status.className = 'ps-form-status is-error';
        }
    }
}
