import { postAddItem } from './moveit-api.mjs';
import { appLabel, escapeHtml } from './format.mjs';

// The notebook's line (move-it.md §20): something heard in a meeting is coming, for an
// application. Application, feature or fix, title, a note saying where it was heard. One
// POST; the item lands in the Coming lane with no release. The only write on the board.
export class ComingUpForm {
    constructor(onSaved) {
        this.onSaved = onSaved;
        this.draft = { applicationId: '', kind: 'feature', title: '', note: '' };
    }

    render(el, { applications, lists, applicationId }) {
        this.el = el;
        if (applicationId != null && !this.draft.title) this.draft.applicationId = String(applicationId);
        const kinds = lists.filter((l) => l.List === 'work-item-kinds').map((l) => l.Member);
        const option = (v, label, selected) => `<option value="${escapeHtml(v)}" ${selected ? 'selected' : ''}>${escapeHtml(label)}</option>`;
        el.innerHTML = `
            <form class="mi-coming-form" data-ref="form" aria-label="Coming up">
                <span class="mi-coming-label">Coming up</span>
                <select name="applicationId" required aria-label="Application">
                    ${option('', 'Application…', this.draft.applicationId === '')}
                    ${applications.map((a) => option(a.ApplicationId, appLabel(a), String(a.ApplicationId) === this.draft.applicationId)).join('')}
                </select>
                <select name="kind" aria-label="Kind">${kinds.map((k) => option(k, k, k === this.draft.kind)).join('')}</select>
                <input name="title" required placeholder="What is coming" value="${escapeHtml(this.draft.title)}" aria-label="Title" />
                <input name="note" placeholder="Heard where, from whom" value="${escapeHtml(this.draft.note)}" aria-label="Note" />
                <button type="submit" class="mi-button is-primary">Add</button>
                <span class="mi-form-status" data-ref="status"></span>
            </form>`;
        el.querySelector('[data-ref="form"]').addEventListener('submit', (e) => { e.preventDefault(); this.save(); });
    }

    read() {
        const form = this.el.querySelector('[data-ref="form"]');
        this.draft = { applicationId: form.applicationId.value, kind: form.kind.value, title: form.title.value, note: form.note.value };
    }

    async save() {
        this.read();
        const statusEl = this.el.querySelector('[data-ref="status"]');
        statusEl.textContent = 'Saving…';
        statusEl.className = 'mi-form-status';
        try {
            const result = await postAddItem({
                applicationId: Number(this.draft.applicationId), kind: this.draft.kind, title: this.draft.title, note: this.draft.note || null,
            });
            this.draft = { ...this.draft, title: '', note: '' };
            await this.onSaved();
            const el = this.el.querySelector('[data-ref="status"]');
            el.textContent = result.Outcome === 'inserted' ? 'Added to Coming.' : 'Already there.';
            el.className = 'mi-form-status is-ok';
        } catch (err) {
            statusEl.textContent = err.message;
            statusEl.className = 'mi-form-status is-error';
        }
    }
}
